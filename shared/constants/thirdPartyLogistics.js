// ═══════════════════════════════════════════════════════════════
// 3PL STORAGE LEASING — players lease warehouse space to others
// ═══════════════════════════════════════════════════════════════

export const TPL = {
  // Price range per tire per month
  minPrice: 1.50,
  maxPrice: 5.00,
  defaultPrice: 2.50,

  // Lease terms
  minSlots: 50,          // Minimum slots per lease
  maxTenants: 5,         // Max tenants per listing
  gracePeriodDays: 7,    // Days before unpaid lease is terminated
  evictionNoticeDays: 30, // Owner must give 30-day notice to evict
  liquidationPct: 0.50,  // Tires liquidated at 50% market value if tenant can't pay

  // Requirements
  minRepToList: 15,      // Reputation needed to list storage
  minRepToRent: 5,       // Reputation needed to rent storage

  // Revenue classification
  revenueCategory: '3PL Lease Income',
};
