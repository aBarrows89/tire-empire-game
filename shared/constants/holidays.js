/**
 * Holiday demand multipliers by game day-of-year.
 * Day ranges are inclusive. demandMult applied to shop + van demand.
 */
export const HOLIDAYS = [
  { name: "New Year's Day", startDay: 1, endDay: 2, demandMult: 0.6 },
  { name: 'Memorial Day Weekend', startDay: 148, endDay: 152, demandMult: 1.5 },
  { name: 'Independence Day', startDay: 183, endDay: 186, demandMult: 0.5 },
  { name: 'Labor Day Weekend', startDay: 248, endDay: 252, demandMult: 1.5 },
  { name: 'Black Friday', startDay: 328, endDay: 332, demandMult: 3.0 },
  { name: 'Christmas Week', startDay: 355, endDay: 360, demandMult: 0.3 },
];

/**
 * Get the holiday demand multiplier for a given day-of-year.
 * @param {number} dayOfYear - 1-365
 * @returns {{ mult: number, name: string|null }}
 */
export function getHolidayMult(dayOfYear) {
  const doy = ((dayOfYear - 1) % 365) + 1; // wrap to 1-365
  for (const h of HOLIDAYS) {
    if (doy >= h.startDay && doy <= h.endDay) {
      return { mult: h.demandMult, name: h.name };
    }
  }
  return { mult: 1.0, name: null };
}
