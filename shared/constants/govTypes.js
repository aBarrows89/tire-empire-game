export const GOV_TYPES = [
  { type: "school", name: "School District Buses", ic: "\u{1F68C}", tires: ["allSeason", "lightTruck"], qtyMin: 40, qtyMax: 120, dur: 6, minRep: 20, minLocs: 1 },
  { type: "police", name: "Police/Fire Fleet", ic: "\u{1F694}", tires: ["allSeason", "performance"], qtyMin: 30, qtyMax: 80, dur: 12, minRep: 30, minLocs: 1 },
  { type: "municipal", name: "Municipal Vehicles", ic: "\u{1F3DB}\uFE0F", tires: ["allSeason", "lightTruck", "commercial"], qtyMin: 60, qtyMax: 200, dur: 12, minRep: 25, minLocs: 2 },
  { type: "dot", name: "State DOT Trucks", ic: "\u{1F6A7}", tires: ["commercial", "lightTruck", "winter"], qtyMin: 100, qtyMax: 400, dur: 12, minRep: 40, minLocs: 3 },
  { type: "military", name: "Military Base Vehicles", ic: "\u{1F396}\uFE0F", tires: ["allSeason", "lightTruck", "commercial"], qtyMin: 150, qtyMax: 500, dur: 24, minRep: 55, minLocs: 3 },
  { type: "county_ag", name: "County AG Equipment", ic: "\u{1F33E}", tires: ["tractor", "implement", "atv"], qtyMin: 20, qtyMax: 80, dur: 12, minRep: 15, minLocs: 1 },
  { type: "parks", name: "Parks & Rec Fleet", ic: "\u{1F332}", tires: ["atv", "lightTruck"], qtyMin: 15, qtyMax: 50, dur: 6, minRep: 15, minLocs: 1 },
];
