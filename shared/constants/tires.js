export const TIRES = {
  used_junk: { n: "Used (Junk)", bMin: 1, bMax: 5, def: 15, lo: 5, hi: 25, used: 1, disp: 1 },
  used_poor: { n: "Used (Poor)", bMin: 5, bMax: 12, def: 28, lo: 12, hi: 40, used: 1 },
  used_good: { n: "Used (Good)", bMin: 10, bMax: 22, def: 45, lo: 22, hi: 65, used: 1 },
  used_premium: { n: "Used (Premium)", bMin: 18, bMax: 35, def: 65, lo: 35, hi: 95, used: 1 },
  allSeason: { n: "All-Season", bMin: 45, bMax: 72, def: 105, lo: 75, hi: 150 },
  performance: { n: "Performance", bMin: 75, bMax: 115, def: 155, lo: 115, hi: 220 },
  winter: { n: "Winter/Snow", bMin: 65, bMax: 100, def: 140, lo: 100, hi: 195, seas: 1 },
  lightTruck: { n: "Light Truck", bMin: 85, bMax: 135, def: 175, lo: 135, hi: 250 },
  commercial: { n: "Commercial", bMin: 110, bMax: 170, def: 230, lo: 170, hi: 320 },
  atv: { n: "ATV/UTV", bMin: 35, bMax: 60, def: 90, lo: 60, hi: 130, ag: 1 },
  implement: { n: "Farm Implement", bMin: 50, bMax: 90, def: 125, lo: 85, hi: 180, ag: 1 },
  tractor: { n: "Tractor/AG", bMin: 200, bMax: 400, def: 550, lo: 380, hi: 800, ag: 1 },
};
