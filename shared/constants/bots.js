// ═══════════════════════════════════════════════════════════════
// BOT PLAYER CONSTANTS — name fragments, personalities, quirks,
// chat templates, intensity definitions, activity schedules
// ═══════════════════════════════════════════════════════════════

// ── NAME GENERATION FRAGMENTS ──

export const FIRST_NAMES = [
  'Jake','Sarah','Marcus','Elena','Tommy','Priya','Chris','Aisha','Ryan','Megan',
  'Devon','Jasmine','Nick','Brianna','Carlos','Hannah','Darnell','Olivia','Raj','Tiffany',
  'Brandon','Keisha','Luke','Maya','Trevor','Samantha','Andre','Courtney','Ethan','Natasha',
  'Victor','Lisa','Omar','Stephanie','Kevin','Alicia','Devin','Rachel','Tony','Amber',
  'Kyle','Monica','Jamal','Jessica','Brett','Christina','Miguel','Kayla','Sean','Veronica',
];

export const LAST_NAMES = [
  'Mitchell','Chen','Williams','Rodriguez','DeLuca','Patel','O\'Brien','Johnson','Kowalski','Torres',
  'Hart','Lee','Volkov','Foster','Reyes','Kim','Jackson','Grant','Mehta','Nguyen',
  'Schultz','Wright','Andersson','Gupta','Morrison','Sullivan','Nakamura','Harper','Diaz','Bennett',
  'Park','Campbell','Rossi','Tucker','Shah','Wallace','Cruz','Dixon','Fleming','Santos',
  'Marsh','Quinn','Ortiz','Boyd','Hoffman','Ellis','Gibson','Palmer','Russo','Franklin',
];

export const ADJECTIVES = [
  'Premium','Express','Elite','Metro','Discount','Reliable','Quality','Champion','First Choice','Budget',
  'All-American','Sunrise','Patriot','Maverick','Golden','Silver','Iron','Thunder','Apex','Summit',
  'Coastal','Prairie','Mountain','Valley','Lakeside','Crosstown','Roadside','Hometown','National','Liberty',
  'Peak','Sunset','Classic','Modern','Rapid','Precision','Superior','United','Star','Eagle',
];

export const SUFFIXES = [
  'Co','Supply','Works','Group','Center','Pros','Plus','Direct','Hub','Zone',
  'Depot','Express','Services','Solutions','Outlet','World','Land','Masters','Source','Mart',
];

export const COMPANY_PATTERNS = [
  '{city} Tire Co',
  '{city} Tire & Auto',
  '{lastName}\'s Tire Shop',
  '{lastName}\'s Tires',
  '{lastName} Tire Co',
  '{adj} Tire {suffix}',
  '{adj} Tires',
  '{firstName} & {firstName2} Tires',
  '{city} Rubber Works',
  '{lastName} & Sons Tires',
  '{adj} Auto & Tire',
  '{city} Tire {suffix}',
  '{lastName} Tire {suffix}',
  '{firstName}\'s Tire Barn',
  '{adj} Tire & Service',
  '{city} Discount Tires',
  'The Tire {suffix}',
];

// ── PERSONALITY ARCHETYPES ──

export const PERSONALITIES = {
  hoarder: {
    label: 'Hoarder',
    description: 'Overbuys inventory, reluctant to sell at market price, stockpiles used tires',
    weights: {
      buyFrequency: 1.8,       // Buys much more often
      sellReluctance: 0.6,     // Sells less often
      priceAboveMarket: 0.12,  // Prices 12% above market (reluctant to discount)
      inventoryTarget: 2.0,    // Wants 2x normal inventory
      expansionDrive: 0.6,     // Less focused on expanding
      loanWillingness: 0.5,    // Avoids debt
      stockTradeFreq: 0.3,     // Rarely trades stocks
      chatFrequency: 0.6,      // Average chatter
    },
  },
  flipper: {
    label: 'Flipper',
    description: 'Buys low, sells fast, thin margins, high volume',
    weights: {
      buyFrequency: 1.5,
      sellReluctance: 0.3,     // Very willing to sell
      priceAboveMarket: -0.08, // Undercuts market by 8%
      inventoryTarget: 0.6,    // Keeps lean inventory
      expansionDrive: 0.8,
      loanWillingness: 0.7,
      stockTradeFreq: 0.8,
      chatFrequency: 0.8,
    },
  },
  empire_builder: {
    label: 'Empire Builder',
    description: 'Reinvests everything, expands aggressively, takes loans early',
    weights: {
      buyFrequency: 1.2,
      sellReluctance: 0.5,
      priceAboveMarket: -0.03,
      inventoryTarget: 1.0,
      expansionDrive: 2.0,     // Very aggressive expansion
      loanWillingness: 1.8,    // Takes loans eagerly
      stockTradeFreq: 0.4,
      chatFrequency: 0.7,
    },
  },
  conservative: {
    label: 'Conservative',
    description: 'Saves cash, avoids debt, slow steady growth',
    weights: {
      buyFrequency: 0.7,
      sellReluctance: 0.5,
      priceAboveMarket: 0.05,  // Slightly above market
      inventoryTarget: 0.8,
      expansionDrive: 0.4,     // Very slow expansion
      loanWillingness: 0.1,    // Almost never borrows
      stockTradeFreq: 0.2,
      chatFrequency: 0.4,
    },
  },
  speculator: {
    label: 'Speculator',
    description: 'Heavy stock exchange activity, commodity plays, market timing',
    weights: {
      buyFrequency: 0.9,
      sellReluctance: 0.5,
      priceAboveMarket: 0.0,
      inventoryTarget: 0.9,
      expansionDrive: 0.7,
      loanWillingness: 1.0,
      stockTradeFreq: 5.0,     // Trades 5x more than normal
      chatFrequency: 1.0,
    },
  },
  regional_king: {
    label: 'Regional King',
    description: 'Dominates one city/region, multiple shops in same area',
    weights: {
      buyFrequency: 1.2,
      sellReluctance: 0.4,
      priceAboveMarket: -0.05, // Undercuts to dominate
      inventoryTarget: 1.3,
      expansionDrive: 1.5,     // Expands but only in home region
      loanWillingness: 1.0,
      stockTradeFreq: 0.3,
      chatFrequency: 0.6,
      regionalFocus: true,     // Special: shops in same region
    },
  },
  ecom_focused: {
    label: 'E-Com Focused',
    description: 'Rushes ecommerce, minimal physical retail',
    weights: {
      buyFrequency: 1.0,
      sellReluctance: 0.4,
      priceAboveMarket: -0.06,
      inventoryTarget: 1.1,
      expansionDrive: 0.5,     // Fewer physical shops
      loanWillingness: 0.8,
      stockTradeFreq: 0.5,
      chatFrequency: 0.5,
      ecomPriority: true,      // Special: rushes ecom unlock
    },
  },
  factory_dreamer: {
    label: 'Factory Dreamer',
    description: 'Beelines for factory, neglects retail optimization',
    weights: {
      buyFrequency: 0.8,
      sellReluctance: 0.6,
      priceAboveMarket: 0.03,  // Doesn't optimize pricing
      inventoryTarget: 0.7,
      expansionDrive: 0.6,
      loanWillingness: 1.2,
      stockTradeFreq: 0.3,
      chatFrequency: 0.5,
      factoryPriority: true,   // Special: saves for factory
    },
  },
  social_butterfly: {
    label: 'Social Butterfly',
    description: 'Active in chat, trades with other players frequently',
    weights: {
      buyFrequency: 1.0,
      sellReluctance: 0.5,
      priceAboveMarket: 0.0,
      inventoryTarget: 1.0,
      expansionDrive: 0.8,
      loanWillingness: 0.7,
      stockTradeFreq: 1.2,
      chatFrequency: 4.0,      // Chats 4x more
    },
  },
  bargain_hunter: {
    label: 'Bargain Hunter',
    description: 'Only buys on dips, waits for deals, uses supplier contracts',
    weights: {
      buyFrequency: 0.5,       // Buys infrequently
      sellReluctance: 0.5,
      priceAboveMarket: -0.04,
      inventoryTarget: 0.7,
      expansionDrive: 0.6,
      loanWillingness: 0.3,
      stockTradeFreq: 0.8,     // Watches prices
      chatFrequency: 0.6,
      bargainOnly: true,       // Special: only buys when prices are low
    },
  },
};

export const PERSONALITY_KEYS = Object.keys(PERSONALITIES);

// ── QUIRKS ──

export const QUIRKS = [
  { id: 'overprices_premium', label: 'Overprices premium tires by 15%', effect: { premiumMarkup: 0.15 } },
  { id: 'refuses_budget_wholesale', label: 'Refuses to buy from Budget Wholesale', effect: { blockedSupplier: 'budget_wholesale' } },
  { id: 'panic_seller', label: 'Panic-sells when cash drops below $5K', effect: { panicThreshold: 5000 } },
  { id: 'winter_hoarder', label: 'Hoards winter tires in summer', effect: { seasonalHoard: 'winter' } },
  { id: 'family_names', label: 'Names all shops after family members', effect: { shopNaming: 'family' } },
  { id: 'no_loans', label: 'Never takes loans', effect: { noLoans: true } },
  { id: 'liquidation_addict', label: 'Buys every liquidation lot regardless of price', effect: { liquidationAddict: true } },
  { id: 'night_owl', label: 'Only acts during off-peak ticks', effect: { offPeakOnly: true } },
  { id: 'impulse_buyer', label: 'Occasionally buys random inventory in bulk', effect: { impulseBuy: true } },
  { id: 'price_chaser', label: 'Changes prices every day', effect: { dailyReprice: true } },
  { id: 'brand_loyal', label: 'Only stocks 3-4 tire types', effect: { limitedSelection: true } },
  { id: 'expansion_happy', label: 'Opens shops even when current ones are struggling', effect: { recklessExpansion: true } },
  { id: 'cash_stuffer', label: 'Keeps 80% of money in bank savings', effect: { heavySaver: true } },
  { id: 'insurance_skipper', label: 'Never buys insurance', effect: { noInsurance: true } },
  { id: 'used_only', label: 'Prefers dealing in used tires', effect: { usedTirePreference: true } },
  { id: 'tech_heavy', label: 'Always over-hires technicians', effect: { overHireTechs: true } },
  { id: 'marketing_obsessed', label: 'Spends heavily on shop marketing', effect: { heavyMarketing: true } },
  { id: 'lowball_wholesaler', label: 'Sets wholesale prices way below market', effect: { lowballWholesale: true } },
  { id: 'stock_diamond_hands', label: 'Never sells stocks once bought', effect: { diamondHands: true } },
  { id: 'van_nostalgic', label: 'Still sells from van even with shops', effect: { vanLoyalty: true } },
];

// ── INTENSITY LEVELS ──

export const INTENSITY_LEVELS = {
  1:  { label: 'Clueless',    schedule: 'casual',   shopMax: 0, pricingSkill: 0.1, expansionRate: 0.001, mistakeRate: 0.25 },
  2:  { label: 'Beginner',    schedule: 'casual',   shopMax: 1, pricingSkill: 0.2, expansionRate: 0.003, mistakeRate: 0.20 },
  3:  { label: 'Learning',    schedule: 'casual',   shopMax: 1, pricingSkill: 0.3, expansionRate: 0.005, mistakeRate: 0.15 },
  4:  { label: 'Casual',      schedule: 'regular',  shopMax: 2, pricingSkill: 0.4, expansionRate: 0.010, mistakeRate: 0.12 },
  5:  { label: 'Average',     schedule: 'regular',  shopMax: 4, pricingSkill: 0.5, expansionRate: 0.015, mistakeRate: 0.10 },
  6:  { label: 'Competent',   schedule: 'regular',  shopMax: 6, pricingSkill: 0.6, expansionRate: 0.020, mistakeRate: 0.08 },
  7:  { label: 'Skilled',     schedule: 'hardcore',  shopMax: 7, pricingSkill: 0.7, expansionRate: 0.025, mistakeRate: 0.06 },
  8:  { label: 'Advanced',    schedule: 'hardcore',  shopMax: 8, pricingSkill: 0.8, expansionRate: 0.030, mistakeRate: 0.05 },
  9:  { label: 'Expert',      schedule: 'hardcore',  shopMax: 10, pricingSkill: 0.85, expansionRate: 0.035, mistakeRate: 0.04 },
  10: { label: 'Elite',       schedule: 'whale',    shopMax: 12, pricingSkill: 0.92, expansionRate: 0.040, mistakeRate: 0.03 },
  11: { label: 'Insane',      schedule: 'whale',    shopMax: 15, pricingSkill: 0.98, expansionRate: 0.050, mistakeRate: 0.02 },
};

// ── ACTIVITY SCHEDULES ──
// Defines how often a bot acts per tick

export const SCHEDULES = {
  casual:   { minSkip: 1, maxSkip: 2 },  // Acts every 1-2 ticks
  regular:  { minSkip: 0, maxSkip: 1 },  // Acts every 1-2 ticks (mostly every tick)
  hardcore: { minSkip: 0, maxSkip: 0 },  // Acts every tick
  whale:    { minSkip: 0, maxSkip: 0, multiAction: true }, // Every tick + multiple actions
};

// ── CHAT TEMPLATES ──

export const CHAT_TEMPLATES = {
  milestone: [
    'Just hit rep {rep}! {nextUnlock} here I come',
    'Finally opened my {shopOrdinal} shop in {city}!',
    'Crossed ${revenue} in total revenue today. Not bad for a tire shop',
    'Wholesale unlocked! Time to move some serious volume',
    'E-commerce site is live. Let\'s see if online sales are worth it',
    'Factory is BUILT. {company} brand tires coming soon',
    '{company} just went public on the TESX! Ticker: {ticker}',
    'Hit {rep} reputation. The grind is real but it pays off',
    'Just cleared my 3rd loan. Debt-free feels good',
    'Warehouse is up and running. Storage problems are over',
  ],
  complaint: [
    'Who\'s undercutting in {city}? My sales tanked overnight',
    'These supplier prices are insane right now. Rubber shortage is killing me',
    'Rent in {city} is highway robbery. $${rent}/mo for a tire shop?',
    'Can\'t find any good inventory at reasonable prices today',
    'My best tech just quit. Hiring is impossible right now',
    'Lost 3 wholesale clients this week. What am I doing wrong?',
    'Insurance just went up AGAIN. Business costs are out of control',
    'Someone is dumping tires in {city} below cost. How is that sustainable?',
  ],
  question: [
    'Anyone else seeing crazy demand for winter tires right now?',
    'Is the factory worth it at rep 75? Seems expensive',
    'What\'s a good price for all-season tires in {city}?',
    'How many shops do you guys run before going wholesale?',
    'Is it better to save cash or invest in more inventory?',
    'When do you usually take out your first loan?',
    'EV tires — worth stocking or just a niche?',
    'How do you handle price wars? Just match or let them have it?',
    'What\'s the sweet spot for staff per location?',
  ],
  reaction: [
    'That rubber shortage is killing my margins',
    'Stock market crash wiped me out lol. Down 40% today',
    'Economic boom means everyone\'s buying. Love it',
    'Winter storm incoming — better stock up on snow tires',
    'Port congestion means no imports for a while. Domestic only I guess',
    'Demand surge is nice but I can\'t keep anything in stock',
    'Rate hike just hit. Glad I paid off my loans early',
    'TC just dropped to ${tcValue}. Buying opportunity or falling knife?',
  ],
  bragging: [
    'Just cleared $${weeklyRev} revenue this week. {company} is thriving',
    '{company} going public tomorrow. Get in early',
    '{shopCount} shops and counting. The empire grows',
    'Best month ever — $${monthlyRev} in total sales',
    'Highest rated shop in {city}. {loyalty}% customer loyalty',
    'Wholesale bringing in $${wsRev}/day now. Retail is just the beginning',
    'My factory tires are outselling the brand names. Quality wins',
    'Just hit top 3 on the leaderboard. Watch out #1',
  ],
};

// ── FAMILY NAMES for shop naming quirk ──
export const FAMILY_SHOP_NAMES = [
  '{lastName}\'s Place', 'Pop\'s Tires', 'Junior\'s Tire Shop', 'Big Mike\'s',
  'Mama\'s Tire Barn', 'Uncle {firstName}\'s', 'The {lastName} Family Shop',
  '{firstName} Jr\'s Tires', 'Grandpa\'s Garage', 'Brother\'s Tires',
];
