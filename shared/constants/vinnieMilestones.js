/**
 * Vinnie milestone pop-ups — triggered once as the player progresses.
 * Each milestone fires when check(g) returns true AND the id is NOT in g.vinnieSeen.
 * Evaluated in order — first match wins.
 */
export const VINNIE_MILESTONES = [
  {
    id: 'welcome_back',
    check: g => g.tutorialDone && (g.day || g.week || 1) <= 10,
    title: "Let's Get to Work!",
    message: "Alright kid, tutorial's done. First thing — go to Source and grab some tires. Can't sell air!",
    emotion: 'smirk',
    hint: 'Go to Source',
    panel: 'source',
  },
  {
    id: 'first_source',
    check: g => Object.values(g.inventory || {}).reduce((a, b) => a + b, 0) > 0,
    title: 'Nice Haul!',
    message: "You got tires! Now head to Pricing and set your prices. Don't go too high on used rubber — customers know what's up.",
    emotion: 'point',
    hint: 'Go to Pricing',
    panel: 'pricing',
  },
  {
    id: 'first_sale',
    check: g => (g.totalSold || 0) > 0,
    title: 'Ka-Ching!',
    message: "Your first sale! That's the feeling, kid. Keep sourcing, keep selling. The grind is real but it pays.",
    emotion: 'excited',
  },
  {
    id: 'cash_1k',
    check: g => g.cash >= 1000,
    title: 'Stacking Paper',
    message: "A grand in the bank! You're doing something right. Think about upgrading your storage so you can carry more product.",
    emotion: 'money',
    hint: 'Check Storage',
    panel: 'storage',
  },
  {
    id: 'rep_5',
    check: g => g.reputation >= 5,
    title: 'Building a Name',
    message: "People are starting to know your name. Higher rep means better sources and eventually... your own shop.",
    emotion: 'thumbsup',
  },
  {
    id: 'storage_upgrade',
    check: g => (g.storage || []).length > 1,
    title: 'More Room to Grow',
    message: "Smart move upgrading storage. More inventory = more sales potential. Fill it up!",
    emotion: 'point',
    hint: 'Go Source',
    panel: 'source',
  },
  {
    id: 'loan_taken',
    check: g => (g.loans || []).length > 0,
    title: 'Leverage',
    message: "Smart use of leverage. Just remember — those payments come every week whether you sell or not. Don't over-borrow.",
    emotion: 'serious',
  },
  {
    id: 'first_shop',
    check: g => (g.locations || []).length > 0,
    title: "You're in the Game Now!",
    message: "Your first shop! This changes everything. Hire some techs in the Staff tab — they'll handle installs and keep customers happy.",
    emotion: 'excited',
    hint: 'Go to Staff',
    panel: 'staff',
  },
  {
    id: 'first_hire',
    check: g => Object.values(g.staff || {}).reduce((a, v) => a + v, 0) > 0,
    title: 'Your First Employee',
    message: "You got your first hire! Staff costs money every week, but they make you way more than they cost. Trust the process.",
    emotion: 'thumbsup',
  },
  {
    id: 'rep_15',
    check: g => g.reputation >= 15,
    title: 'The Name Is Known',
    message: "Rep 15! You're unlocking the good stuff now — better cities, better sources. Time to think about expanding.",
    emotion: 'excited',
    hint: 'Browse Cities',
    panel: 'shop',
  },
  {
    id: 'multi_shop',
    check: g => (g.locations || []).length >= 2,
    title: 'Empire Building',
    message: "Two shops! Now you're thinking like a mogul. Keep an eye on per-shop inventory — transfer tires where they sell best.",
    emotion: 'money',
    hint: 'Check Storage',
    panel: 'storage',
  },
  {
    id: 'cash_low_warning',
    check: g => g.cash < 50 && (g.day || g.week || 1) > 14,
    title: 'Watch Your Cash!',
    message: "Whoa, you're running dry! Sell tires at a discount, take a small loan, or cut costs. Don't go broke on me, kid.",
    emotion: 'serious',
    hint: 'Check Bank',
    panel: 'bank',
  },
  // ── Exchange milestones ──
  {
    id: 'exchange_open',
    check: g => g.stockExchange?.hasBrokerage && !g.stockExchange?.isPublic,
    title: "Wall Street, Baby!",
    message: "You opened a brokerage account! Listen kid \u2014 the stock market is where empires are REALLY built. Buy other players' stocks, earn dividends, and watch your money make money. But be careful... crashes happen.",
    emotion: 'money',
    hint: 'View Exchange',
    panel: 'exchange',
  },
  {
    id: 'exchange_first_trade',
    check: g => (g.stockExchange?.tradeHistory || []).length > 0,
    title: "Your First Trade!",
    message: "Welcome to the big leagues! You just made your first trade on the TESX. Remember \u2014 every buy costs you commission, and selling at a profit means paying capital gains tax. The government always gets their cut.",
    emotion: 'point',
  },
  {
    id: 'exchange_ipo',
    check: g => g.stockExchange?.isPublic,
    title: "You're a Public Company!",
    message: g => `$${g.stockExchange.ticker} is live on the TESX! Your shareholders are counting on you now. Keep growing revenue and they'll drive your stock price up. Let it slide... and they'll dump you faster than cheap rubber.`,
    emotion: 'excited',
    hint: 'View Your Stock',
    panel: 'exchange',
  },
  {
    id: 'exchange_dividends_earned',
    check: g => (g.stockExchange?.dividendIncome || 0) >= 1000,
    title: "Passive Income King",
    message: g => `You've earned $${Math.round(g.stockExchange.dividendIncome).toLocaleString()} in dividends! That's money rolling in while you sleep. The trick? Find companies with fat margins and generous payout ratios. Boring stocks, beautiful returns.`,
    emotion: 'money',
  },
  {
    id: 'exchange_crash_survivor',
    check: g => (g.stockExchange?.taxesPaid || 0) >= 5000 && Object.keys(g.stockExchange?.portfolio || {}).length >= 2,
    title: "Battle-Tested Investor",
    message: "You've paid your tuition to the market \u2014 fees, taxes, maybe a crash or two. Most players quit after their first red day. You? You're still here. That's how fortunes are made, kid.",
    emotion: 'serious',
  },

  // ── Global Events & Supply Chain milestones ──
  {
    id: 'first_global_event',
    check: g => (g._events || []).length > 0 || (g.day || 1) > 14,
    title: "The World Doesn't Wait",
    message: "Global events are hitting the market — rubber shortages, port strikes, storms. These affect EVERY player. Check your dashboard for active events and adjust your strategy. The ones who adapt fastest come out on top.",
    emotion: 'serious',
    hint: 'View Dashboard',
    panel: 'dashboard',
  },
  {
    id: 'rubber_farm_purchased',
    check: g => g.factory?.rubberFarm != null,
    title: "Vertical Integration!",
    message: "You bought a rubber farm! Every day it produces raw rubber units that lower your production costs. Upgrade it for more output. And if you've got surplus? Sell it on the open market.",
    emotion: 'money',
    hint: 'View Factory',
    panel: 'factory',
  },
  {
    id: 'synthetic_lab_purchased',
    check: g => g.factory?.syntheticLab != null,
    title: "Science Pays Off",
    message: "Synthetic rubber lab is online! It produces more efficiently than natural rubber AND it's immune to weather events. When droughts and floods hit, your competition suffers — you don't.",
    emotion: 'excited',
    hint: 'View Factory',
    panel: 'factory',
  },
  {
    id: 'supply_chain_complete',
    check: g => g.factory?.rubberFarm != null && g.factory?.syntheticLab != null,
    title: "Full Supply Chain",
    message: "Farm AND lab running — you've got the most diversified supply chain in the game. Natural rubber for baseline costs, synthetic for reliability. Global events can't touch your production.",
    emotion: 'thumbsup',
  },
  {
    id: 'tc_storage_full',
    check: g => {
      const tc = g.tireCoins || 0;
      const lvl = g.tcStorageLevel || 0;
      let cap = 500;
      if (g.isPremium) cap += 1500;
      const adds = [250, 500, 1000, 2000, 3000];
      for (let i = 0; i < lvl && i < adds.length; i++) cap += adds[i];
      return tc >= cap && cap < 8250; // not max level
    },
    title: "TC Storage Maxed!",
    message: "You're at your TireCoin storage cap! Every TC you earn is getting wasted. Upgrade your storage capacity to hold more — there are big purchases waiting for players who save up.",
    emotion: 'serious',
    hint: 'View Dashboard',
    panel: 'dashboard',
  },
  {
    id: 'tire_attrs_excellent',
    check: g => {
      if (!g.factory) return false;
      const qr = g.factory.qualityRating || 0.80;
      const rdDone = (g.factory.unlockedSpecials || []).length;
      const certsDone = (g.factory.certifications || []).filter(c => c.earned).length;
      return qr >= 0.95 && rdDone >= 2 && certsDone >= 1;
    },
    title: "Premium Product!",
    message: g => `Your tires are top-tier, kid. Quality rating ${((g.factory?.qualityRating || 0.80) * 100).toFixed(0)}%, multiple R&D projects done, certifications earned — your grip, durability, and comfort scores are driving serious demand. This is what separates a tire shop from a tire EMPIRE.`,
    emotion: 'excited',
    hint: 'View Factory',
    panel: 'factory',
  },

  // ── Premium pitch milestones ──
  {
    id: 'premium_pitch_shops',
    check: g => !g.isPremium && (g.locations || []).length >= 2 && (g.totalSold || 0) > 50,
    title: "Let's Talk Business",
    message: g => `Look, I can tell you're serious \u2014 ${g.locations.length} shops, ${g.totalSold} tires moved. I'm sure you're tired of seeing those ads. For just $4.99 a month, hire me as your full-time consultant. I'll handle the advertisers and you get that gold PRO badge. Whatdya say?`,
    emotion: 'money',
    hint: 'Go PRO \u2014 $4.99/mo',
    action: 'openPremium',
  },
  {
    id: 'premium_pitch_revenue',
    check: g => !g.isPremium && (g.dayRev || 0) >= 2000,
    title: "You're Making Real Money Now",
    message: g => `$${g.dayRev.toLocaleString()} in a single day? Kid, you're a natural. Your ${g.locations.length} store${g.locations.length !== 1 ? 's' : ''} ${g.locations.length !== 1 ? 'are' : 'is'} humming. Ditch the ads, get the PRO badge, and let the other players know you mean business. $4.99/mo \u2014 cheaper than a set of used tires.`,
    emotion: 'excited',
    hint: 'Go PRO',
    action: 'openPremium',
  },
  {
    id: 'premium_pitch_rep',
    check: g => !g.isPremium && g.reputation >= 40,
    title: "You've Earned It",
    message: g => `Rep ${g.reputation.toFixed(0)}... you're one of the top names in the business. Every empire needs a crown, kid. Go PRO \u2014 no ads, gold badge on the leaderboard, and bragging rights. $4.99/mo. You spend more than that on junk tires.`,
    emotion: 'thumbsup',
    hint: 'Go PRO',
    action: 'openPremium',
  },
];

export const VINNIE_EMOTIONS = {
  smirk: '\u{1F60F}',
  point: '\u{1F449}',
  think: '\u{1F914}',
  shrug: '\u{1F937}',
  serious: '\u{1F9D4}',
  money: '\u{1F4B0}',
  excited: '\u{1F929}',
  thumbsup: '\u{1F44D}',
};
