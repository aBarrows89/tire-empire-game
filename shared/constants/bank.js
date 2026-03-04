// ═══════════════════════════════════════════════════════════════
// BANK BOT — dynamic interest rate system driven by economy
// ═══════════════════════════════════════════════════════════════

// Savings rate bounds
export const SAVINGS_RATE_MIN = 0.010;   // 1.0% floor
export const SAVINGS_RATE_MAX = 0.080;   // 8.0% ceiling
export const SAVINGS_RATE_BASE = 0.042;  // 4.2% default

// Loan rate bounds
export const LOAN_RATE_MIN = 0.030;      // 3.0% floor
export const LOAN_RATE_MAX = 0.200;      // 20.0% ceiling

// Adjustment constraints
export const MAX_ADJUSTMENT = 0.005;     // ±0.50% per evaluation
export const ADJUSTMENT_INCREMENT = 0.0025; // 0.25% steps
export const EVALUATION_INTERVAL = 30;   // Days between evaluations
export const MIN_COOLDOWN_DAYS = 15;     // Min days between adjustments

// Loan tier spreads above savings rate
export const LOAN_TIER_SPREAD = {
  micro: 0.10,       // savings + 10%
  small: 0.06,       // savings + 6%
  sba: 0.035,        // savings + 3.5%
  equipment: 0.03,   // savings + 3%
  commercial: 0.02,  // savings + 2%
  expansion: 0.015,  // savings + 1.5%
};

// Map loan index to tier key
export const LOAN_INDEX_TO_TIER = ['micro', 'small', 'sba', 'equipment', 'commercial', 'expansion'];

// Vinnie commentary on rate changes
export const VINNIE_RATE_COMMENTS = {
  rateCut: [
    "Hey kid, the bank just dropped rates to {rate}%. Time to borrow big and expand!",
    "Rates are down — good time to make moves.",
    "The bank's feeling generous with {rate}% savings. Might be time to invest instead of save.",
  ],
  rateHike: [
    "Oof, rates are going up. Maybe hold off on that warehouse loan for now.",
    "Bank's tightening up — {rate}% on savings now. Not bad for parking cash.",
    "Rates climbing... lock in a loan now before they go higher.",
  ],
  recordLow: [
    "I've never seen rates this low. Even I'm thinking about opening a shop.",
    "Rates at {rate}%... money is basically free. Borrow everything.",
  ],
  recordHigh: [
    "These rates are criminal. Put your cash in savings and wait it out.",
    "Bank's paying {rate}% on savings? That's almost as good as selling tires.",
  ],
  largeSavingsLowRate: [
    "You've got ${amount} sitting in savings earning peanuts at {rate}%. That money should be working for you.",
  ],
  largeLoansRisingRates: [
    "Your loan payments are about to go up. Might want to pay some of that down.",
  ],
};
