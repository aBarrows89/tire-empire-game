// Event metadata only — effect handlers (fn) live in server/engine/events.js
// gate: checked in simWeek before firing — keeps constants serializable
export const EVENTS = [
  { t: "\u{1F328}\uFE0F Storm! Winter surge!", ch: .04, s: 3 },
  { t: "\u{1F573}\uFE0F Pothole season!", ch: .06, s: 0 },
  { t: "\u{1F4E6} Shipping +15%", ch: .05, gate: "hasSupplierOrLoc" },
  { t: "\u2B50 Good review!", ch: .03, gate: "hasRep" },
  { t: "\u{1F527} Tech quit!", ch: .04, gate: "hasTechs" },
  { t: "\u{1F4B0} Fleet inquiry!", ch: .04, gate: "hasLocations" },
  { t: "\u26A0\uFE0F Recall!", ch: .02, gate: "hasLocations" },
  { t: "\u{1F4C9} Recession \u2014 used up", ch: .03, gate: "hasUsedInv" },
  { t: "\u{1F389} Vendor rebate 12%!", ch: .04, gate: "hasSupplier" },
  { t: "\u{1F525} Competitor closed!", ch: .015, gate: "hasLocations" },
  { t: "\u{1F4B8} Chargeback $450", ch: .05, gate: "hasSold" },
  { t: "\u{1F4F1} Bad review", ch: .04, gate: "hasLocOrRep" },
  { t: "\u{1F3E5} Workers comp", ch: .025, gate: "hasStaff" },
  { t: "\u{1F694} Junk tire fine!", ch: .03, gate: "hasJunk" },
];
