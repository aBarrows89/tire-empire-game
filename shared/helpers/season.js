export function getSeason(m) {
  return ["Spring", "Summer", "Fall", "Winter"][Math.floor(((m - 1) % 12) / 3)];
}

export function getSI(m) {
  return Math.floor(((m - 1) % 12) / 3);
}
