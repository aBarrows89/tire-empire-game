/**
 * Car Meet events — summer weekends only (days 151-240 = June-August).
 * Performance/specialty tires sell at premium markup.
 */

// Summer range: day 151 (June 1) to day 240 (August 30) within each year
export const CAR_MEET_SUMMER_START = 151;
export const CAR_MEET_SUMMER_END = 240;

// Premium tire keys that get the markup at car meets
export const CAR_MEET_PREMIUM_TIRES = ['performance', 'evTire', 'runFlat'];

export const CAR_MEET_TRANSPORT = {
  local: 50,
  regional: 150,
  crossCountry: 300,
};

export const CAR_MEETS = [
  { id: 'cm_la', cityId: 'la_ca', name: 'LA Auto Expo', fee: 500, demandMult: 1.5, premiumPct: 1.5, transport: 'crossCountry' },
  { id: 'cm_detroit', cityId: 'detroit_mi', name: 'Detroit Motorhead Meet', fee: 300, demandMult: 1.3, premiumPct: 1.4, transport: 'regional' },
  { id: 'cm_houston', cityId: 'houston_tx', name: 'Houston Street Scene', fee: 400, demandMult: 1.4, premiumPct: 1.4, transport: 'crossCountry' },
  { id: 'cm_atlanta', cityId: 'atlanta_ga', name: 'Atlanta Car Culture', fee: 350, demandMult: 1.3, premiumPct: 1.3, transport: 'regional' },
  { id: 'cm_chicago', cityId: 'chicago_il', name: 'Chicago Cruise Night', fee: 400, demandMult: 1.4, premiumPct: 1.4, transport: 'regional' },
  { id: 'cm_phoenix', cityId: 'phoenix_az', name: 'Phoenix Tuner Fest', fee: 350, demandMult: 1.3, premiumPct: 1.3, transport: 'crossCountry' },
  { id: 'cm_nashville', cityId: 'nashville_tn', name: 'Nashville Car Show', fee: 250, demandMult: 1.2, premiumPct: 1.3, transport: 'regional' },
  { id: 'cm_denver', cityId: 'denver_co', name: 'Denver Mountain Motors', fee: 300, demandMult: 1.3, premiumPct: 1.4, transport: 'crossCountry' },
  { id: 'cm_seattle', cityId: 'seattle_wa', name: 'Seattle Import Night', fee: 350, demandMult: 1.3, premiumPct: 1.4, transport: 'crossCountry' },
  { id: 'cm_miami', cityId: 'miami_fl', name: 'Miami Supercar Sunday', fee: 500, demandMult: 1.5, premiumPct: 1.5, transport: 'crossCountry' },
];
