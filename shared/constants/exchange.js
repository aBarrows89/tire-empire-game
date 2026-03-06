// ── Tire Empire Stock Exchange (TESX) Constants ──

// IPO Requirements
export const IPO_MIN_REP = 40;
export const IPO_MIN_REVENUE = 500000;
export const IPO_MIN_LOCATIONS = 3;
export const IPO_MIN_AGE = 60;        // game days
export const IPO_MIN_CASH = 50000;
export const IPO_TOTAL_SHARES = 100000;
export const IPO_FOUNDER_PCT = 0.51;   // 51% retained
export const IPO_LISTING_FEE = 25000;
export const IPO_LISTING_PCT = 0.02;   // 2% of proceeds
export const IPO_LOCKUP_DAYS = 30;
export const IPO_DAILY_SELL_LIMIT = 0.05; // 5% of holdings/day after lockup

// Trading Fees
export const TRADE_COMMISSION = 0.015;     // 1.5% per side
export const TRADE_COMMISSION_PREMIUM = 0.005; // 0.5% for TC premium
export const TRADE_MIN_FREE = 100;         // Orders under $100 = no commission
export const MAX_ORDER_PCT_FLOAT = 0.25;   // Max 25% of float per order
export const LIMIT_ORDER_TTL = 7;          // days before expiry
export const MAX_OPEN_ORDERS = 10;

// Taxes
export const CAP_GAINS_SHORT = 0.25;       // held < 30 days
export const CAP_GAINS_LONG = 0.15;        // held >= 30 days
export const CAP_GAINS_HOLD_THRESHOLD = 30; // days
export const DIVIDEND_TAX = 0.10;
export const DIVIDEND_TAX_PREMIUM = 0.05;

// Account Fees
export const BROKERAGE_MONTHLY_FEE = 500;
export const BROKERAGE_MIN_REP = 10;

// Wealth Tax (on portfolio value, monthly)
export const WEALTH_TAX_TIERS = [
  { min: 0, max: 500000, rate: 0 },
  { min: 500000, max: 2000000, rate: 0.001 },   // 0.1%
  { min: 2000000, max: 10000000, rate: 0.002 },  // 0.2%
  { min: 10000000, max: Infinity, rate: 0.003 },  // 0.3%
];

// Market Mechanics
export const BASE_PE_RATIOS = { retail: 8, wholesale: 6, manufacturing: 10, mixed: 7 };
export const PRICE_MAX_DAILY_MOVE = 0.15;      // 15% max move per day
export const FUNDAMENTAL_PULL_RATE = 0.05;     // 5% mean-reversion/day
export const ORDER_FLOW_IMPACT = 0.03;         // max 3% from buy/sell pressure

// Crashes
export const CRASH_COOLDOWN_DAYS = 30;
export const CRASH_BUBBLE_THRESHOLD = 0.30;     // 30% above 30-day MA triggers check
export const CRASH_SECTOR_THRESHOLD = 0.50;     // 50% above 30-day MA
export const CRASH_SEVERITY_RANGE = [0.15, 0.35]; // 15-35% drop
export const CRASH_DURATION_RANGE = [3, 7];       // 3-7 days
export const BLACK_SWAN_CHANCE = 0.003;           // 0.3% per day

// Dividends
export const DIVIDEND_MAX_PAYOUT = 0.75;  // max 75% of profit
export const DIVIDEND_FREQUENCY = 7;      // every 7 game days

// NPC Market Makers
export const MARKET_MAKERS = [
  { id: 'npc_mm_bridgewater', name: 'Bridgewater Capital', cash: 10_000_000, spreadBps: 100 },
  { id: 'npc_mm_citadel', name: 'Citadel Securities', cash: 5_000_000, spreadBps: 50 },
  { id: 'npc_mm_virtu', name: 'Virtu Financial', cash: 3_000_000, spreadBps: 75 },
];

// Sector ETFs (filter functions can't be serialized — applied at runtime)
export const ETF_DEFS = [
  { ticker: 'TIRE', name: 'Total Market Index', sectorFilter: null },
  { ticker: 'RTIL', name: 'Retail Index', sectorFilter: 'retail' },
  { ticker: 'MFGX', name: 'Manufacturing Index', sectorFilter: 'manufacturing' },
  { ticker: 'WHSL', name: 'Wholesale Index', sectorFilter: 'wholesale' },
  { ticker: 'ECOM', name: 'E-Commerce Index', sectorFilter: 'ecommerce' },
];

// TC Premium Features
export const TC_FEATURES = {
  margin:       { cost: 1000, label: 'Margin Trading',    desc: '2:1 leverage' },
  darkPool:     { cost: 2000, label: 'Dark Pool Access',  desc: 'Hidden large orders' },
  shortSelling: { cost: 1500, label: 'Short Selling',     desc: 'Profit from drops' },
  charting:     { cost: 300,  label: 'Advanced Charting',  desc: 'Candlestick + indicators' },
  alerts:       { cost: 500,  label: 'Price Alerts',       desc: 'Up to 10 alerts' },
  ipoPriority:  { cost: 750,  label: 'IPO Priority',       desc: '5% guaranteed allocation' },
};

// Margin
export const MARGIN_LEVERAGE = 2;            // 2:1
export const MARGIN_LEVERAGE_PREMIUM = 3;    // 3:1 with TC
export const MARGIN_MAINTENANCE = 0.25;      // 25% maintenance
export const MARGIN_CALL_DAYS = 3;           // days to resolve
export const MARGIN_FORCE_LIQUIDATION_FEE = 0.05; // 5% penalty
export const MARGIN_INTEREST_MULT = 1.5;     // 150% of bank rate

// Short Selling
export const SHORT_MAX_DAYS = 14;
export const SHORT_BORROW_FEE_DAILY = 0.02;  // 2% per day

// Vinnie Tips
export const VINNIE_TIP_COST = 200;  // TC per tip
export const VINNIE_TIP_ACCURACY = 0.60;

// Lottery Scratch Tickets
export const LOTTERY_TICKET_COST = 1000;  // TC
export const LOTTERY_PRIZES = [
  { prize: 50,       weight: 400, label: '$50' },
  { prize: 100,      weight: 250, label: '$100' },
  { prize: 500,      weight: 150, label: '$500' },
  { prize: 1000,     weight: 80,  label: '$1,000' },
  { prize: 5000,     weight: 50,  label: '$5,000' },
  { prize: 10000,    weight: 30,  label: '$10,000' },
  { prize: 50000,    weight: 20,  label: '$50,000' },
  { prize: 100000,   weight: 10,  label: '$100,000' },
  { prize: 500000,   weight: 5,   label: '$500,000' },
  { prize: 1000000,  weight: 3,   label: '$1,000,000' },
  { prize: 5000000,  weight: 2,   label: '$5,000,000' },
];
export const LOTTERY_SCRATCH_CELLS = 9; // 3x3 grid
export const LOTTERY_WIN_MATCH = 3;     // match 3 to win

/** Real tradable commodities — driven by factory consumption and world supply */
export const COMMODITIES = {
  rubber: {
    id: 'rubber', name: 'Natural Rubber', unit: 'ton',
    basePrice: 1800, volatility: 0.03,
    supplyDrivers: ['weather', 'factory_demand', 'season'],
    ticker: 'RBR', icon: '\u{1F33F}',
    worldProductionPerDay: 80,
    worldProductionRampDays: 8,
  },
  steel: {
    id: 'steel', name: 'Steel', unit: 'ton',
    basePrice: 750, volatility: 0.02,
    supplyDrivers: ['factory_demand', 'global_events'],
    ticker: 'STL', icon: '\u2699\uFE0F',
    worldProductionPerDay: 120,
    worldProductionRampDays: 10,
  },
  chemicals: {
    id: 'chemicals', name: 'Synthetic Compounds', unit: 'barrel',
    basePrice: 320, volatility: 0.025,
    supplyDrivers: ['factory_demand', 'global_events'],
    ticker: 'CHM', icon: '\u{1F9EA}',
    worldProductionPerDay: 100,
    worldProductionRampDays: 6,
  },
};

export const COMMODITY_MAX_POSITION = 500;
export const COMMODITY_PRICE_CLAMP = 0.60; // ±60% of basePrice
