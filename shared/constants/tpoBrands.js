export const TPO_BRANDS = [
  { id: "megamart", n: "ValueMart", ic: "\u{1F3EC}", desc: "Big box retailer, steady volume", outboundFee: 8, storageFeePerTire: .75, minStorage: 2000, minRep: 35, weeklyShipVol: [40, 120], tiresStored: [500, 2000], reqStaff: { shipping: 1, logistics: 1 } },
  { id: "eztire", n: "ClickTire Online", ic: "\u{1F310}", desc: "Online marketplace, variable volume", outboundFee: 10, storageFeePerTire: 1.0, minStorage: 1000, minRep: 25, weeklyShipVol: [20, 80], tiresStored: [200, 800], reqStaff: { shipping: 1 } },
  { id: "primetire", n: "RapidShip Tire", ic: "\u{1F4E6}", desc: "Major online retailer, high volume", outboundFee: 6, storageFeePerTire: .50, minStorage: 4000, minRep: 45, weeklyShipVol: [80, 250], tiresStored: [1500, 5000], reqStaff: { shipping: 2, logistics: 1, dockSup: 1 } },
  { id: "simplewheels", n: "EasyRoll Direct", ic: "\u{1F504}", desc: "Online retailer, returns program included", outboundFee: 9, storageFeePerTire: .85, minStorage: 1500, minRep: 30, weeklyShipVol: [30, 100], tiresStored: [300, 1200], reqStaff: { shipping: 1, receiving: 1 } },
];
