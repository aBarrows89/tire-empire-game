export const INSPECTION = {
  conditions: {
    used_junk: [
      { label: 'Bald / No Tread', valueMult: 0.3 },
      { label: 'Sidewall Damage', valueMult: 0.4 },
      { label: 'Dry Rot / Cracking', valueMult: 0.5 },
      { label: 'Uneven Wear (Severe)', valueMult: 0.6 },
    ],
    used_poor: [
      { label: 'Low Tread Remaining', valueMult: 0.55 },
      { label: 'Minor Sidewall Scuffs', valueMult: 0.65 },
      { label: 'Patch Repaired', valueMult: 0.60 },
      { label: 'Uneven Wear (Moderate)', valueMult: 0.70 },
    ],
    used_good: [
      { label: 'Good Tread Depth', valueMult: 0.80 },
      { label: 'Light Cosmetic Wear', valueMult: 0.85 },
      { label: 'Even Wear Pattern', valueMult: 0.90 },
    ],
    used_premium: [
      { label: 'Like New Tread', valueMult: 0.92 },
      { label: 'Barely Used', valueMult: 0.95 },
      { label: 'Dealer Take-Off', valueMult: 0.98 },
    ],
  },

  sourceGradeWeights: {
    scrapYard: {
      used_junk: 0.50,
      used_poor: 0.30,
      used_good: 0.15,
      used_premium: 0.05,
    },
    garagePickup: {
      used_junk: 0.20,
      used_poor: 0.40,
      used_good: 0.30,
      used_premium: 0.10,
    },
    auctionLot: {
      used_junk: 0.15,
      used_poor: 0.30,
      used_good: 0.35,
      used_premium: 0.20,
    },
    estateFind: {
      used_junk: 0.05,
      used_poor: 0.15,
      used_good: 0.35,
      used_premium: 0.45,
    },
  },
};
