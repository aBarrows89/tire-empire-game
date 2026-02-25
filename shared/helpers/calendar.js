/**
 * Day-based calendar system for Tire Empire.
 *
 * 1 tick = 1 game day.  360 days/year, 30 days/month, 12 months.
 * Day 1 = Sunday, January 1, Year 1.
 */

export const DAYS_PER_MONTH = 30;
export const MONTHS_PER_YEAR = 12;
export const DAYS_PER_YEAR = DAYS_PER_MONTH * MONTHS_PER_YEAR; // 360

export const DAY_NAMES = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const MONTH_SEASONS = {
  January: 'Winter', February: 'Winter',
  March: 'Spring', April: 'Spring', May: 'Spring',
  June: 'Summer', July: 'Summer', August: 'Summer',
  September: 'Fall', October: 'Fall', November: 'Fall',
  December: 'Winter',
};

const SEASON_INDEX = { Spring: 0, Summer: 1, Fall: 2, Winter: 3 };

/**
 * Convert an absolute day number to full calendar info.
 * @param {number} day — 1-based day counter
 */
export function getCalendar(day) {
  const d = Math.max(1, Math.floor(day));
  const year = Math.floor((d - 1) / DAYS_PER_YEAR) + 1;
  const dayOfYear = ((d - 1) % DAYS_PER_YEAR) + 1;
  const monthIndex = Math.floor((dayOfYear - 1) / DAYS_PER_MONTH);
  const dayOfMonth = ((dayOfYear - 1) % DAYS_PER_MONTH) + 1;
  const dayOfWeek = (d - 1) % 7; // 0 = Sunday
  const monthName = MONTH_NAMES[monthIndex];
  const season = MONTH_SEASONS[monthName];

  return {
    year,
    dayOfYear,
    monthIndex,
    monthName,
    dayOfMonth,
    dayOfWeek,
    dayName: DAY_NAMES[dayOfWeek],
    season,
    seasonIndex: SEASON_INDEX[season],
  };
}

/**
 * Pretty-print a day number.
 * e.g. "Monday January 2, Year 1"
 */
export function formatDate(day) {
  const c = getCalendar(day);
  return `${c.dayName} ${c.monthName} ${c.dayOfMonth}, Year ${c.year}`;
}

/**
 * Short date for compact displays.
 * e.g. "Jan 2, Y1"
 */
export function formatDateShort(day) {
  const c = getCalendar(day);
  return `${c.monthName.slice(0, 3)} ${c.dayOfMonth}, Y${c.year}`;
}
