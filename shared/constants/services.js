// Shop services — revenue from labor, not tire sales
export const SERVICES = {
  flatRepair:  { n: "Flat Repair",        price: 25,  time: 0.5, repBoost: .005 },
  balance:     { n: "Tire Balance",        price: 20,  time: 0.3, repBoost: .003 },
  install:     { n: "Customer Install",    price: 35,  time: 0.75, repBoost: .008 },
  nitrogen:    { n: "Nitrogen Fill",       price: 10,  time: 0.15, repBoost: .002 },
};

// time = fraction of a tech-hour per job (out of 8 per tech/week capacity)
// repBoost = reputation gain per job completed
