import fs from 'fs';
import path from 'path';
import axios from 'axios';

export function transformApiData(apiData) {
  const rows = apiData.tnFcltySttusInfo1011?.row || [];
  return rows.map(row => {
    const id = row.FCLTY_ID || '';
    const name = row.FCLTY_NM || '';
    const region = row.ATDRC_NM || '';
    const address = `${row.BASS_ADRES || ''} ${row.DETAIL_ADRES || ''}`.trim();
    const tel = row.CTTPC || '';
    const url = `https://umppa.seoul.go.kr/icare/user/kidsCafeResve/BD_selectKidsCafeResveCal.do?q_fcltyId=${id}&q_fcltyStle=2001`;
    return { id, name, region, address, tel, url };
  }).filter(c => c.id !== ''); // ID가 파싱된 키즈카페만 남김
}

async function main() {
  const apiKey = '687244684e6c6f6e313231495a6e4b4e';
  // 데이터 수집 범위를 1에서 1000으로 늘려 모든 키즈카페 정보를 한 번에 긁어오도록 설정
  const url = `http://openAPI.seoul.go.kr:8088/${apiKey}/json/tnFcltySttusInfo1011/1/1000/`;

  try {
    const response = await axios.get(url);
    const transformed = transformApiData(response.data);
    if (transformed.length === 0) {
      throw new Error('No valid cafe data parsed.');
    }
    // public/cafes.json 경로에 갱신 기록
    const filePath = path.resolve('public/cafes.json');
    fs.writeFileSync(filePath, JSON.stringify(transformed, null, 2));
    console.log(`Successfully updated cafes.json with ${transformed.length} cafes.`);
  } catch (e) {
    console.error('Failed to fetch/parse API data:', e.message);
    process.exit(1);
  }
}

// 모듈 직접 실행 시에만 main 동작
if (process.argv[1] && (process.argv[1].endsWith('fetch-cafes.js') || process.argv[1].endsWith('fetch-cafes'))) {
  main();
}
