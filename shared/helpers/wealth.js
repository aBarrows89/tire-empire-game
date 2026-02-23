export function getWealth(g) {
  const debt = (g.loans || []).reduce((a, l) => a + (l.remaining || 0), 0);
  return Math.floor(g.cash + (g.bankBalance || 0) + g.locations.length * 120000 + g.totalRev * .03 - debt);
}
