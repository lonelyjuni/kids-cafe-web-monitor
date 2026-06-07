import { transformApiData } from '../ubuntu/fetch-cafes.js';

test('should transform Seoul API response to cafes.json schema', () => {
  const apiDummy = {
    tnFcltySttusInfo1011: {
      row: [
        {
          FCLTY_ID: 'SB260302',
          FCLTY_NM: '서울형 키즈카페 성북구 월곡1동점',
          ATDRC_NM: '성북구',
          BASS_ADRES: '서울특별시 성북구 오패산로10길 19',
          DETAIL_ADRES: '육아종합지원센터 2층',
          CTTPC: '02-2241-0758'
        }
      ]
    }
  };
  const transformed = transformApiData(apiDummy);
  expect(transformed).toEqual([
    {
      id: 'SB260302',
      name: '서울형 키즈카페 성북구 월곡1동점',
      region: '성북구',
      address: '서울특별시 성북구 오패산로10길 19 육아종합지원센터 2층',
      tel: '02-2241-0758',
      url: 'https://umppa.seoul.go.kr/icare/user/kidsCafeResve/BD_selectKidsCafeResveCal.do?q_fcltyId=SB260302&q_fcltyStle=2001'
    }
  ]);
});
