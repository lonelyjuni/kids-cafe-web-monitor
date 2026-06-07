import { parseHtmlCalendar } from '../api/scrape.js';

test('should parse calendar HTML and extract session data correctly', () => {
  const dummyHtml = `
    <table>
      <td class="day" dataDow="7">
        <span>13</span>
        <div>
          <p>1회차 (09:30~11:30) [개인] - <i>3</i>석 / 18석</p>
          <p>2회차 (13:00~15:00) [개인] - <i>0</i>석 / 18석</p>
        </div>
      </td>
    </table>
  `;
  const result = parseHtmlCalendar(dummyHtml, 2026, 6);
  expect(result).toEqual([
    {
      date: '2026-06-13',
      dayOfWeek: '토',
      sessions: [
        {
          sessionName: '1회차',
          time: '09:30~11:30',
          type: '개인',
          available: 3,
          total: 18
        },
        {
          sessionName: '2회차',
          time: '13:00~15:00',
          type: '개인',
          available: 0,
          total: 18
        }
      ]
    }
  ]);
});
