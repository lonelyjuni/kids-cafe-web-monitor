import axios from 'axios';
import * as cheerio from 'cheerio';

export function parseHtmlCalendar(html, year, month) {
  const $ = cheerio.load(html);
  const results = [];

  $('td.day').each((_, td) => {
    const dayText = $(td).find('> span').text().trim();
    if (!dayText) return;

    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(dayText).padStart(2, '0')}`;
    const dataDow = $(td).attr('datadow');
    const dowMap = { '1': '일', '2': '월', '3': '화', '4': '수', '5': '목', '6': '금', '7': '토' };
    const dayOfWeek = dowMap[dataDow] || '';

    const sessions = [];
    $(td).find('div p').each((_, p) => {
      const text = $(p).text();
      // 정규식을 통한 회차 정보 추출 예: 1회차 (09:30~11:30) [개인] - 3석 / 18석
      const sessionMatch = text.match(/(\d+회차)\s*\((.*?)\)\s*\[(.*?)\]\s*-\s*(\d+)석\s*\/\s*(\d+)석/);
      if (sessionMatch) {
        sessions.push({
          sessionName: sessionMatch[1],
          time: sessionMatch[2],
          type: sessionMatch[3],
          available: parseInt(sessionMatch[4], 10),
          total: parseInt(sessionMatch[5], 10)
        });
      }
    });

    if (sessions.length > 0) {
      results.push({
        date: dateStr,
        dayOfWeek,
        sessions
      });
    }
  });

  return results.sort((a, b) => a.date.localeCompare(b.date));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const { cafeIds, year, month } = req.body;
  if (!cafeIds || !Array.isArray(cafeIds)) {
    return res.status(400).json({ success: false, error: 'Invalid cafeIds' });
  }

  const results = {};
  const AXIOS_CONFIG = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    },
    timeout: 8000
  };

  // 타임아웃 방지를 위해 요청당 최대 3개 지점 제한
  const targetIds = cafeIds.slice(0, 3);

  try {
    const promises = targetIds.map(async (id) => {
      const url = `https://umppa.seoul.go.kr/icare/user/kidsCafeResve/BD_selectKidsCafeResveCal.do?q_fcltyId=${id}&q_fcltyStle=2001&q_year=${year}&q_month=${String(month).padStart(2, '0')}`;
      const response = await axios.get(url, AXIOS_CONFIG);
      const parsed = parseHtmlCalendar(response.data, year, month);
      results[id] = { dates: parsed };
    });

    await Promise.all(promises);
    res.status(200).json({ success: true, data: results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}
