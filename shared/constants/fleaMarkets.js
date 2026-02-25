/**
 * Flea Market Stands — cheap early-game revenue for used tires.
 * Open Fri/Sat/Sun. Sells at 80% of normal price but used tires get a bonus.
 */

export const FLEA_STAND_COST = 1000;
export const FLEA_DAILY_OPERATING = 100;
export const FLEA_PRICE_MULT = 0.80; // sells at 80% of normal

export const FLEA_TRANSPORT = {
  local: 50,
  regional: 150,
  distant: 250,
};

export const FLEA_MARKETS = [
  { id: 'fm_pittsburgh', cityId: 'pittsburgh_pa', name: 'Pittsburgh Flea Market', demandMult: 1.2, usedBonus: 1.5, transport: 'local' },
  { id: 'fm_columbus', cityId: 'columbus_oh', name: 'Columbus Swap Meet', demandMult: 1.1, usedBonus: 1.4, transport: 'local' },
  { id: 'fm_atlanta', cityId: 'atlanta_ga', name: 'Atlanta Flea & Trade', demandMult: 1.3, usedBonus: 1.5, transport: 'regional' },
  { id: 'fm_nashville', cityId: 'nashville_tn', name: 'Nashville Bargain Yard', demandMult: 1.2, usedBonus: 1.4, transport: 'regional' },
  { id: 'fm_houston', cityId: 'houston_tx', name: 'Houston Tire Bazaar', demandMult: 1.4, usedBonus: 1.6, transport: 'distant' },
  { id: 'fm_phoenix', cityId: 'phoenix_az', name: 'Phoenix Desert Swap', demandMult: 1.3, usedBonus: 1.5, transport: 'distant' },
  { id: 'fm_detroit', cityId: 'detroit_mi', name: 'Detroit Motor Market', demandMult: 1.2, usedBonus: 1.5, transport: 'regional' },
  { id: 'fm_stlouis', cityId: 'stlouis_mo', name: 'St. Louis Flea Fair', demandMult: 1.1, usedBonus: 1.4, transport: 'regional' },
  { id: 'fm_indy', cityId: 'indianapolis_in', name: 'Indy Tire Exchange', demandMult: 1.2, usedBonus: 1.5, transport: 'regional' },
  { id: 'fm_portland', cityId: 'portland_or', name: 'Portland Sunday Market', demandMult: 1.1, usedBonus: 1.4, transport: 'distant' },
  { id: 'fm_charlotte', cityId: 'charlotte_nc', name: 'Charlotte Flea Depot', demandMult: 1.2, usedBonus: 1.5, transport: 'regional' },
  { id: 'fm_tampa', cityId: 'tampa_fl', name: 'Tampa Bay Swap Shop', demandMult: 1.3, usedBonus: 1.6, transport: 'distant' },
];
