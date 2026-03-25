/**
 * parser.js
 * Parses BIG5-encoded HTM attendance files produced by fingerprint clock-in machines.
 * Ported from attendance_htm_parser.py.
 *
 * HTM structure:
 *   - First 3 <p> tags: title, company name, date range
 *   - One <table> per employee:
 *       - tr[0]: header row (employee ID, name, dept)
 *       - Alternating pairs of rows: dates row then times row (up to 16 cols each)
 *       - Time cells contain 0, 1, or 2+ HH:MM strings separated by <br>
 */

/**
 * @typedef {Object} DayEntry
 * @property {string[]} times   - Raw time strings for this day (e.g. ['09:00', '18:00'])
 * @property {'normal'|'missing'|'duplicate'|'empty'} status
 */

/**
 * @typedef {Object} Employee
 * @property {string} name
 * @property {Object.<string, DayEntry>} attendance  - keyed by date string e.g. '01-02'
 */

/**
 * @typedef {Object} ParseResult
 * @property {string} title
 * @property {string} companyName
 * @property {string} dateRange
 * @property {Employee[]} employees
 */

/**
 * Reads an ArrayBuffer as BIG5-encoded text.
 * @param {ArrayBuffer} buffer
 * @returns {string}
 */
function decodeBig5(buffer) {
  const decoder = new TextDecoder('big5');
  return decoder.decode(buffer);
}

/**
 * Converts "HH:MM" to total minutes.
 * @param {string} timeStr
 * @returns {number}
 */
function timeStrToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Classifies a list of raw time strings into a status.
 * @param {string[]} times
 * @param {number} duplicateThresholdMinutes - max gap (in minutes) between 2 times before they're considered a real in/out pair
 * @returns {'empty'|'missing'|'duplicate'|'normal'}
 */
function classifyTimes(times, duplicateThresholdMinutes = 10) {
  const nonEmpty = times.filter(t => t !== '');
  if (nonEmpty.length === 0) return 'empty';
  if (nonEmpty.length === 1) return 'missing';
  if (nonEmpty.length > 2) return 'duplicate';
  // Exactly 2 times: check if they are suspiciously close (both duplicates, no real clock-out)
  const gap = Math.abs(timeStrToMinutes(nonEmpty[1]) - timeStrToMinutes(nonEmpty[0]));
  if (gap <= duplicateThresholdMinutes) return 'duplicate';
  return 'normal';
}

/**
 * Parses a single employee <table> element.
 * @param {Element} table
 * @param {number} duplicateThresholdMinutes
 * @returns {Employee}
 */
function parseEmployeeTable(table, duplicateThresholdMinutes) {
  const allP = table.querySelectorAll('p');
  // allP[1] contains: "工號:1  姓名:林彩容     部門:辦公室"
  const headerText = allP[1]?.textContent?.replace(/\u00a0/g, ' ').trim() ?? '';

  // Extract name from 姓名:X pattern
  const nameMatch = headerText.match(/姓名[:：]\s*(\S+)/);
  const name = nameMatch ? nameMatch[1] : headerText;

  const employee = { name, attendance: {} };

  const rows = table.querySelectorAll('tr');
  // Skip first header row; remaining rows come in pairs: dates, times
  const dataRows = Array.from(rows).slice(1);

  for (let i = 0; i + 1 < dataRows.length; i += 2) {
    const dateRow = dataRows[i];
    const timeRow = dataRows[i + 1];

    if (!dateRow || !timeRow) continue;

    // First <td> is a label cell, skip it
    const dateCells = Array.from(dateRow.querySelectorAll('td')).slice(1);
    const timeCells = Array.from(timeRow.querySelectorAll('td')).slice(1);

    dateCells.forEach((dateCell, idx) => {
      const dateStr = dateCell.textContent.replace(/\u00a0/g, ' ').trim();
      if (!dateStr) return;

      const timeCell = timeCells[idx];
      if (!timeCell) {
        employee.attendance[dateStr] = { times: [], status: 'empty' };
        return;
      }

      // Collect text nodes (time strings) from the cell, ignoring &nbsp;
      const rawTimes = [];
      timeCell.childNodes.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) {
          const val = node.textContent.replace(/\u00a0/g, '').replace(/\n/g, '').trim();
          if (val) rawTimes.push(val);
        }
      });

      const status = classifyTimes(rawTimes, duplicateThresholdMinutes);
      employee.attendance[dateStr] = { times: rawTimes.filter(t => t !== ''), status };
    });
  }

  return employee;
}

/**
 * Parses a full HTM attendance file from an ArrayBuffer.
 * @param {ArrayBuffer} buffer
 * @param {number} [duplicateThresholdMinutes=10]
 * @returns {ParseResult}
 */
export function parseAttendanceFile(buffer, duplicateThresholdMinutes = 10) {
  const html = decodeBig5(buffer);
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const allP = doc.querySelectorAll('p');
  const title = allP[0]?.textContent?.replace(/\u00a0/g, ' ').trim() ?? '';
  const companyName = allP[1]?.textContent?.replace(/\u00a0/g, ' ').trim() ?? '';
  const dateRange = allP[2]?.textContent?.replace(/\u00a0/g, ' ').trim() ?? '';

  const tables = doc.querySelectorAll('table');
  const employees = Array.from(tables).map(t => parseEmployeeTable(t, duplicateThresholdMinutes));

  return { title, companyName, dateRange, employees };
}
