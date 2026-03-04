// ── Vinnie's "Next Goal" System (Section 15f) ──
// The FIRST goal whose condition returns true is the active goal.
// Display in Dashboard: "Vinnie's Goal: {goal}"

export const VINNIE_GOALS = [
  {
    id: 'first_sale',
    condition: (g) => (g.totalSold || 0) === 0,
    goal: 'Sell your first tire',
    vinnie: "Let's start simple — sell one tire. Buy from the scrap yard, mark it up, sell it from your van. That's the whole business.",
  },
  {
    id: 'earn_1k',
    condition: (g) => (g.totalRev || 0) < 1000,
    goal: 'Earn $1,000 in revenue',
    vinnie: "First thousand. Everybody starts somewhere.",
  },
  {
    id: 'rep_8',
    condition: (g) => (g.reputation || 0) < 8,
    goal: 'Reach 8 reputation to unlock suppliers',
    vinnie: "Get to rep 8 and I introduce you to the real supply chain. Scrap yards are for amateurs.",
  },
  {
    id: 'first_shop',
    condition: (g) => (g.locations || []).length === 0 && (g.reputation || 0) >= 10,
    goal: 'Open your first shop',
    vinnie: "Time for a real storefront. Pick a city, sign the lease, let's do this.",
  },
  {
    id: 'hire_first',
    condition: (g) => (g.locations || []).length > 0 && Object.values(g.staff || {}).every(v => v === 0),
    goal: 'Hire your first employee',
    vinnie: "You can't run this alone forever. Hire a tech — they'll pay for themselves in a week.",
  },
  {
    id: 'earn_10k',
    condition: (g) => (g.totalRev || 0) < 10000,
    goal: 'Earn $10,000 in revenue',
    vinnie: "Ten grand. Now you're in the tire business for real.",
  },
  {
    id: 'unlock_wholesale',
    condition: (g) => (g.reputation || 0) >= 20 && !g.hasWholesale,
    goal: 'Unlock wholesale at rep 25',
    vinnie: "Wholesale is where the volume is. Keep building that rep.",
  },
  {
    id: 'second_shop',
    condition: (g) => (g.locations || []).length === 1 && (g.reputation || 0) >= 20,
    goal: 'Open your second location',
    vinnie: "One shop is a job. Two shops is a business. Where are we expanding?",
  },
  {
    id: 'open_brokerage',
    condition: (g) => !(g.stockExchange || {}).hasBrokerage && (g.reputation || 0) >= 10,
    goal: 'Open a brokerage account on TESX',
    vinnie: "The stock exchange is open to you now. Even if you don't trade big, knowing the market is half the game.",
  },
  {
    id: 'launch_ecom',
    condition: (g) => (g.reputation || 0) >= 28 && !g.hasEcom,
    goal: 'Launch e-commerce at rep 30',
    vinnie: "Online sales never sleep. Two more rep and we go digital.",
  },
  {
    id: 'earn_100k',
    condition: (g) => (g.totalRev || 0) < 100000,
    goal: 'Earn $100,000 in revenue',
    vinnie: "A hundred grand. Getting serious now.",
  },
  {
    id: 'build_factory',
    condition: (g) => (g.reputation || 0) >= 70 && !g.hasFactory,
    goal: 'Build your factory at rep 75',
    vinnie: "We're close to the big one. Our own factory. Our own brand.",
  },
  {
    id: 'earn_1m',
    condition: (g) => (g.totalRev || 0) < 1000000,
    goal: 'Earn $1,000,000 in revenue',
    vinnie: "The million dollar club. This is the big leagues now.",
  },
  {
    id: 'go_public',
    condition: (g) => !(g.stockExchange || {}).isPublic && (g.reputation || 0) >= 40,
    goal: 'Take your company public on TESX',
    vinnie: "IPO time. Let people invest in what we built.",
  },
];

/** Get the player's current active goal (first one whose condition returns true) */
export function getActiveGoal(g) {
  for (const goal of VINNIE_GOALS) {
    try {
      if (goal.condition(g)) return goal;
    } catch { /* condition might reference missing fields */ }
  }
  return null;
}
