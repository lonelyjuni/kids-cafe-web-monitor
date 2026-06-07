import fs from 'fs';
import path from 'path';
import axios from 'axios';

export function transformApiData(apiData) {
  const rows = apiData.ListKidsCafeReservationPresent?.row || [];
  return rows.map(row => {
    // WEBSITE_URL에서 q_fcltyId 추출 (예: q_fcltyId=2885)
    const url = row.WEBSITE_URL || '';
    const idMatch = url.match(/[?&]q_fcltyId=(\d+)/);
    const id = idMatch ? idMatch[1] : '';
    return {
      id,
      name: row.CAFE_NAME,
      region: row.GU_NAME,
      address: row.ADDR,
      tel: row.TEL_NO,
      url: row.WEBSITE_URL
    };
  }).filter(c => c.id !== ''); // ID가 정상적으로 파싱된 키즈카페만 필터링
}

async function main() {
  const apiKey = '687244684e6c6f6e313231495a6e4b4e';
  // 1페이지부터 100페이지까지 키즈카페 목록 취득 (실제 100개 이하로 리턴됨)
  const url = `http://openAPI.seoul.go.kr:8088/${apiKey}/json/ListKidsCafeReservationPresent/1/100/`;

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
