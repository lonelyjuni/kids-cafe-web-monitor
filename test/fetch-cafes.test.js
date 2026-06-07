import { transformApiData } from '../ubuntu/fetch-cafes.js';

test('should transform Seoul API response to cafes.json schema', () => {
  const apiDummy = {
    ListKidsCafeReservationPresent: {
      row: [
        {
          GU_NAME: '성북구',
          CAFE_NAME: '종암동점',
          ADDR: '서울특별시 성북구 종암로 167',
          TEL_NO: '02-911-2001',
          WEBSITE_URL: 'https://umppa.seoul.go.kr/icare/user/kidsCafeResve/BD_selectKidsCafeResveCal.do?q_fcltyId=2885&q_fcltyStle=2001'
        }
      ]
    }
  };
  const transformed = transformApiData(apiDummy);
  expect(transformed).toEqual([
    {
      id: '2885',
      name: '종암동점',
      region: '성북구',
      address: '서울특별시 성북구 종암로 167',
      tel: '02-911-2001',
      url: 'https://umppa.seoul.go.kr/icare/user/kidsCafeResve/BD_selectKidsCafeResveCal.do?q_fcltyId=2885&q_fcltyStle=2001'
    }
  ]);
});
