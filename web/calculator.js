/**
 * calculator.js
 * Calculates hours worked per employee based on attendance data.
 * Ported from attendance_htm_parser.py → calculate_hours().
 *
 * Assumptions (all configurable):
 *   - Clock-in  = FIRST time entry of the day
 *   - Clock-out = LAST  time entry of the day
 *   - Employees clock in and out on the same calendar date (no overnight shifts)
 *   - Hours beyond overtimeThreshold count as overtime
 */

/**
 * @typedef {Object} DayStats
 * @property {string}  clockIn
 * @property {string}  clockOut
 * @property {number}  hoursWorked
 * @property {number}  regularHours
 * @property {number}  overtimeHours
 * @property {boolean} skipped  - true if the day was excluded from calculation
 * @property {string}  skipReason
 */

/**
 * @typedef {Object} EmployeeResult
 * @property {string} name
 * @property {number} totalHours
 * @property {number} regularHours
 * @property {number} overtimeHours
 * @property {Object.<string, DayStats>} dayStats
 */

/**
 * Parses a "HH:MM" string into a total-minutes number for arithmetic.
 * @param {string} timeStr
 * @returns {number} minutes since midnight
 */
function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Calculates worked hours for one day given clock-in and clock-out strings.
 * @param {string} clockIn   - "HH:MM"
 * @param {string} clockOut  - "HH:MM"
 * @param {number} overtimeThreshold - hours before overtime (default 8)
 * @returns {{ hoursWorked: number, regularHours: number, overtimeHours: number }}
 */
function calcDayHours(clockIn, clockOut, overtimeThreshold) {
  const startMin = timeToMinutes(clockIn);
  const endMin = timeToMinutes(clockOut);
  const hoursWorked = (endMin - startMin) / 60;

  let regularHours, overtimeHours;
  if (hoursWorked - overtimeThreshold > 0) {
    overtimeHours = hoursWorked - overtimeThreshold;
    regularHours = overtimeThreshold;
  } else {
    regularHours = Math.max(0, hoursWorked);
    overtimeHours = 0;
  }

  return { hoursWorked, regularHours, overtimeHours };
}

/**
 * Calculates total hours for an employee given their (possibly edited) attendance map.
 *
 * @param {string} name
 * @param {Object.<string, {times: string[], status: string}>} attendance
 * @param {number} overtimeThreshold
 * @returns {EmployeeResult}
 */
export function calculateEmployeeHours(name, attendance, overtimeThreshold = 8) {
  let totalHours = 0;
  let totalRegular = 0;
  let totalOvertime = 0;
  const dayStats = {};

  for (const [date, entry] of Object.entries(attendance)) {
    const times = entry.times.filter(t => t.trim() !== '');

    // Empty day — no data
    if (times.length === 0) {
      dayStats[date] = { skipped: true, skipReason: 'empty' };
      continue;
    }

    // Single time — missing punch, skip
    if (times.length === 1) {
      dayStats[date] = {
        clockIn: times[0],
        clockOut: null,
        skipped: true,
        skipReason: 'missing_punch',
      };
      continue;
    }

    // 2+ times: use first as clock-in, last as clock-out
    const clockIn = times[0];
    const clockOut = times[times.length - 1];
    const { hoursWorked, regularHours, overtimeHours } = calcDayHours(
      clockIn,
      clockOut,
      overtimeThreshold
    );

    dayStats[date] = {
      clockIn,
      clockOut,
      hoursWorked,
      regularHours,
      overtimeHours,
      skipped: false,
    };

    totalHours += hoursWorked;
    totalRegular += regularHours;
    totalOvertime += overtimeHours;
  }

  return {
    name,
    totalHours,
    regularHours: totalRegular,
    overtimeHours: totalOvertime,
    dayStats,
  };
}
