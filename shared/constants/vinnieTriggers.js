// ── Vinnie Trigger System (Section 15b) ──
// Vinnie pops up based on specific game states. Each trigger has a cooldown.
// Priority levels: critical > high > medium > low
// Max 2 Vinnie popups per game day (critical bypasses limit).

export const VINNIE_TRIGGERS = [
  // ── PROGRESSION NUDGES ──
  {
    id: 'first_1000_cash',
    condition: (g) => g.cash >= 1000 && !(g.vinnieSeen || []).includes('first_1000_cash'),
    message: "A thousand bucks! You're not broke anymore. Now stop sitting on it — go hit the scrap yard and flip some rubber.",
    cooldown: 0, priority: 'high', oneTime: true,
  },
  {
    id: 'shop_ready',
    condition: (g) => (g.reputation || 0) >= 12 && (g.locations || []).length === 0 && g.cash >= 10000,
    message: "Kid, you've got the rep AND the cash. What are you waiting for? Open a shop already.",
    cooldown: 7, priority: 'high',
  },
  {
    id: 'supplier_unlock_tease',
    condition: (g) => (g.reputation || 0) >= 6 && (g.reputation || 0) < 8 && (g.unlockedSuppliers || []).length === 0,
    message: "Keep grinding that reputation. At rep 8, I'll introduce you to some real suppliers — not this scrap yard stuff.",
    cooldown: 14, priority: 'medium',
  },
  {
    id: 'wholesale_tease',
    condition: (g) => (g.reputation || 0) >= 20 && (g.reputation || 0) < 25 && !g.hasWholesale,
    message: "You know what's better than selling 4 tires to a walk-in? Selling 400 to a fleet company. Five more rep points and I open that door.",
    cooldown: 14, priority: 'medium',
  },
  {
    id: 'ecom_tease',
    condition: (g) => (g.reputation || 0) >= 25 && !g.hasEcom && g.hasWholesale,
    message: "Everyone's buying tires online now. You're leaving money on the table without an e-commerce site. I know a developer...",
    cooldown: 14, priority: 'medium',
  },
  {
    id: 'factory_tease',
    condition: (g) => (g.reputation || 0) >= 60 && (g.reputation || 0) < 75 && !g.hasFactory,
    message: "Between you and me... I've been looking at factory space. When you hit rep 75, we're gonna make our OWN tires.",
    cooldown: 30, priority: 'low',
  },
  {
    id: 'exchange_tease',
    condition: (g) => (g.reputation || 0) >= 8 && !(g.stockExchange || {}).hasBrokerage,
    message: "You heard of the TESX? It's where the real money moves. Open a brokerage account and start trading.",
    cooldown: 14, priority: 'medium',
  },

  // ── TC AWARENESS ──
  {
    id: 'tc_first_earn',
    condition: (g) => (g.tireCoins || 0) > 0 && (g.tireCoins || 0) <= 10 && !(g.vinnieSeen || []).includes('tc_first_earn'),
    message: "Hey, you earned some TireCoins! Don't just sit on those — they're worth real money on the marketplace.",
    cooldown: 0, priority: 'high', oneTime: true,
  },
  {
    id: 'tc_pile_up',
    condition: (g) => (g.tireCoins || 0) >= 50 && !(g.vinnieSeen || []).includes('tc_pile_up'),
    message: "You've got {tcAmount} TC sitting there. You could sell some on the marketplace for cash, or save up for an upgrade.",
    cooldown: 0, priority: 'high', oneTime: true,
  },
  {
    id: 'tc_storage_full',
    condition: (g) => {
      const cap = 500 + (g.isPremium ? 1500 : 0); // simplified cap check
      return (g.tireCoins || 0) >= cap * 0.9;
    },
    message: "Your TC storage is almost maxed! Upgrade it or sell some on the marketplace before you start losing earned coins.",
    cooldown: 7, priority: 'critical',
  },
  {
    id: 'tc_marketplace_explain',
    condition: (g) => (g.tireCoins || 0) >= 20 && !(g.vinnieSeen || []).includes('tc_marketplace_explain'),
    message: "Quick tip — TireCoins aren't just for upgrades. Players trade them for real game cash on the marketplace. Some guys make a killing on TC alone.",
    cooldown: 0, priority: 'high', oneTime: true,
  },

  // ── MONEY MANAGEMENT ──
  {
    id: 'cash_hoarding',
    condition: (g) => (g.cash || 0) > 50000 && (g.locations || []).length <= 1 && (g.reputation || 0) >= 15,
    message: "You've got ${cash} just sitting there doing nothing. Money makes money, kid. Open another shop, invest in stock, something.",
    cooldown: 14, priority: 'medium',
  },
  {
    id: 'bank_rate_high',
    condition: (g, shared) => (shared.bankState || {}).savingsRate > 0.055 && (g.bankBalance || 0) < 5000 && (g.cash || 0) > 30000,
    message: "The bank's paying {rate} right now. That's free money. Park some cash in savings before they drop rates again.",
    cooldown: 30, priority: 'low',
  },

  // ── SEASONAL / EVENT ──
  {
    id: 'rubber_shortage_react',
    condition: (g, shared) => (shared.globalEvents || []).some(e => e.id === 'rubber_shortage'),
    message: "Rubber shortage just hit. Prices are going up across the board. If you've got stock, hold it — it's about to be worth more.",
    cooldown: 60, priority: 'critical',
  },
  {
    id: 'economic_boom_react',
    condition: (g, shared) => (shared.globalEvents || []).some(e => e.id === 'economic_boom'),
    message: "Economic boom! People are spending like crazy. Stock up and raise prices — demand is through the roof right now.",
    cooldown: 60, priority: 'high',
  },

  // ── RETENTION / RE-ENGAGEMENT ──
  {
    id: 'idle_nudge',
    condition: (g) => (g.day || 0) > 10 && (g.daySold || 0) === 0 && (g.prevDaySold || 0) === 0,
    message: "Two days with zero sales? Check your prices — you might be too high for this market. Or too low on inventory.",
    cooldown: 3, priority: 'high',
  },
  {
    id: 'celebrate_100k_rev',
    condition: (g) => (g.totalRev || 0) >= 100000 && !(g.vinnieSeen || []).includes('100k_rev'),
    message: "A hundred grand in revenue! We started with a van and $500, remember? This is just the beginning, kid.",
    cooldown: 0, priority: 'high', oneTime: true, seenId: '100k_rev',
  },
  {
    id: 'celebrate_first_shop',
    condition: (g) => (g.locations || []).length === 1 && !(g.vinnieSeen || []).includes('first_shop_open'),
    message: "YOUR OWN SHOP. I gotta be honest, I wasn't sure you'd make it. But here we are. Now let's fill it with tires.",
    cooldown: 0, priority: 'critical', oneTime: true, seenId: 'first_shop_open',
  },
  {
    id: 'celebrate_1m_rev',
    condition: (g) => (g.totalRev || 0) >= 1000000 && !(g.vinnieSeen || []).includes('1m_rev'),
    message: "A MILLION dollars. We did it, kid. You're not a tire dealer anymore — you're a tire MOGUL.",
    cooldown: 0, priority: 'critical', oneTime: true, seenId: '1m_rev',
  },

  // ── ECONOMIC BALANCE (Section 16) ──
  {
    id: 'early_boost_fading',
    condition: (g) => (g.day || 0) >= 140 && (g.day || 0) <= 160 && !(g.vinnieSeen || []).includes('early_boost_fading'),
    message: "Business is gonna level off soon — the early momentum doesn't last forever. Time to think about staff, pricing optimization, and maybe a second location.",
    cooldown: 0, priority: 'high', oneTime: true,
  },
  {
    id: 'sales_bottleneck',
    condition: (g) => (g.locations || []).some(loc =>
      ((loc.staff || {}).techs || 0) * 12 > ((loc.staff || {}).sales || 0) * 10 * 1.2
    ),
    message: "Hey, your techs are standing around waiting for customers. Your sales team can't keep up. Hire another salesperson.",
    cooldown: 14, priority: 'high',
  },
  {
    id: 'factory_warning',
    condition: (g) => (g.reputation || 0) >= 72 && !g.hasFactory && (g.cash || 0) >= 3000000 && !(g.vinnieSeen || []).includes('factory_warning'),
    message: "Real talk, kid — the factory is a long game. You won't see profit on day one. Think of it like buying real estate. The money's in the brand you build.",
    cooldown: 0, priority: 'high', oneTime: true,
  },
  {
    id: 'first_shop_rent_discount',
    condition: (g) => (g.locations || []).length === 1 && g._firstShopOpenDay && (g.day - g._firstShopOpenDay) < 5 && !(g.vinnieSeen || []).includes('first_shop_rent_discount'),
    message: "I talked to the landlord. Got you a break on the first 3 months of rent. After that, full price. Make it count.",
    cooldown: 0, priority: 'high', oneTime: true,
  },

  // ── STORE PERFORMANCE ──
  {
    id: 'store_bleeding',
    condition: (g) => {
      if ((g.locations || []).length < 2) return false;
      // Find a store that's been losing money for 7+ of the last 14 days
      const locHistory = g.locHistory || {};
      return (g.locations || []).some(loc => {
        const hist = locHistory[loc.id] || [];
        if (hist.length < 7) return false;
        const recent = hist.slice(-14);
        const lossDays = recent.filter(d => d.profit < 0).length;
        return lossDays >= 7;
      });
    },
    message: () => {
      // Dynamic message is handled in trigger evaluation — static fallback:
      return "One of your locations is bleeding cash. Seven loss days in the last two weeks. Close it or fix it — I don't care which. But do something.";
    },
    cooldown: 10, priority: 'high',
  },
  {
    id: 'store_dragging_avg',
    condition: (g) => {
      if ((g.locations || []).length < 2) return false;
      const locHistory = g.locHistory || {};
      const locs = g.locations || [];
      // Find if one store's 30d avg profit is less than 30% of the best store
      const avgs = locs.map(loc => {
        const hist = (locHistory[loc.id] || []).slice(-30);
        const avg = hist.length ? hist.reduce((a, d) => a + d.profit, 0) / hist.length : 0;
        return { loc, avg };
      });
      const best = Math.max(...avgs.map(a => a.avg));
      return best > 500 && avgs.some(a => a.avg < best * 0.3 && a.avg < 200);
    },
    message: "I pulled the numbers. One of your stores is dragging down your whole operation. It's making a fraction of what your best location does. You need to either fix the staffing, the location pricing, or cut your losses.",
    cooldown: 14, priority: 'medium',
  },
  {
    id: 'store_turnaround',
    condition: (g) => {
      if ((g.locations || []).length < 2) return false;
      const locHistory = g.locHistory || {};
      return (g.locations || []).some(loc => {
        const hist = locHistory[loc.id] || [];
        if (hist.length < 10) return false;
        // Was losing before (first 5 of last 10), now profitable (last 5)
        const older = hist.slice(-10, -5);
        const recent = hist.slice(-5);
        const oldAvg = older.reduce((a, d) => a + d.profit, 0) / older.length;
        const newAvg = recent.reduce((a, d) => a + d.profit, 0) / recent.length;
        return oldAvg < 0 && newAvg > 300;
      });
    },
    message: "That location you were worried about? It turned around. Good. That's what patience and the right staff gets you.",
    cooldown: 20, priority: 'low',
  },

  // ── FLAVOR (fallback — ensure Vinnie never silent >3 days) ──
  {
    id: 'flavor_slow_day',
    condition: (g) => (g._vinnieDaysSilent || 0) >= 3,
    message: "Slow day. Good. Use it to plan your next move.",
    cooldown: 3, priority: 'low',
  },
];

// Priority order for sorting
export const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
