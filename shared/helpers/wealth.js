export function getWealth(g) {
  return Math.floor(g.cash + g.locations.length * 120000 + g.totalRev * .03);
}
