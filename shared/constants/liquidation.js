export const LIQUIDATION = {
  conditions: ["discontinued", "outOfSeason", "customerReturn", "overstock", "damaged"],
  conditionDiscount: { discontinued: .45, outOfSeason: .55, customerReturn: .60, overstock: .65, damaged: .30 },
  minLotSize: 50,
  maxLotSize: 2000,
  postingFee: 500,
  expirationWeeks: 8,
  aiPostFrequency: .3,
  aiLotNames: ["TreadVault Online", "WheelDeal Direct", "TireSurplus Co", "RubberRush.com", "AllTread Digital", "RimReady Online"],
};
