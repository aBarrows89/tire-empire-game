import { getCalendar } from './calendar.js';

/**
 * Get the season name for a given day number.
 * Backwards-compatible: works with either day or legacy week values.
 */
export function getSeason(day) {
  return getCalendar(day).season;
}

/**
 * Get the season index (0=Spring, 1=Summer, 2=Fall, 3=Winter).
 */
export function getSI(day) {
  return getCalendar(day).seasonIndex;
}
