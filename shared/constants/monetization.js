export const MONET = {
  adRevPerView: .003,
  premiumMonthly: 4.99,
  premiumYearly: 29.99,
  adContent: [
    { brand: "TireZone", text: "\u{1F525} TireZone SALE \u2014 All-Season Starting $79!", color: "#e94560" },
    { brand: "AutoParts+", text: "\u26A1 AutoParts+ \u2014 Free Shipping on Orders $99+", color: "#4488cc" },
    { brand: "QuickLube Pro", text: "\u{1F6E2}\uFE0F QuickLube Pro \u2014 Oil Change $29.99", color: "#00d4aa" },
    { brand: "InsureMyRide", text: "\u{1F6E1}\uFE0F InsureMyRide \u2014 Save 15% on Auto Insurance", color: "#7b61ff" },
    { brand: "FleetMaster", text: "\u{1F69B} FleetMaster GPS \u2014 Track Every Truck", color: "#f0c040" },
    { brand: "TireTech Academy", text: "\u{1F4DA} TireTech Academy \u2014 Certify Your Techs", color: "#cc7733" },
  ],
  coinRewards: {
    weekSurvived: 2,                   // was 5 — reduced
    shopOpened: 20,                    // was 50
    firstWarehouse: 40,                // was 100
    acquisitionComplete: 30,           // was 75
    revenueTarget100K: 75,             // was 200
    revenueTarget1M: 200,              // was 500
    wholesaleClientSigned: 10,         // was 25
    tpoContractSigned: 15,             // was 40
    ecomLaunched: 50,                  // was 150
    distributorUnlocked: 100,          // was 300
    marketplaceLaunched: 10,           // was 30
    liquidationBought: 5,              // was 20
    liquidationSold: 10,               // was 35
    installerRecruited: 10,            // was 25
    becameInstaller: 15,               // was 40
  },
  // 16d: Ad strategy — diminishing returns per ad
  adRewards: {
    schedule: [25, 15, 10, 5, 5],  // 1st=25, 2nd=15, etc. (was 50,30,15,10,10 — total 60 vs 115)
    maxRewardedPerDay: 5,
  },
  adRewardTC: 25,  // Legacy compat — 1st ad reward (was 50)
  maxRewardedPerDay: 5,
  interstitialCooldownMs: 300_000,
  interstitialMinPanelSwitches: 3,

  // Instant retread: skip 3-day wait
  instantRetreadCost: 30, // TC per tire

  // Market Intel heat map
  marketIntelCost: 100,
  marketIntelDuration: 7, // days

  // TC Storage Cap system — players must upgrade to hold more TC
  tcStorage: {
    baseCap: 500,            // free players start with 500 TC cap
    premiumBonus: 1500,      // premium adds +1500 TC storage
    upgrades: [
      { level: 1, addCap: 250,  tcCost: 100 },
      { level: 2, addCap: 500,  tcCost: 250 },
      { level: 3, addCap: 1000, tcCost: 500 },
      { level: 4, addCap: 2000, tcCost: 1000 },
      { level: 5, addCap: 3000, tcCost: 2000 },
    ],
  },

  cosmetics: [
    { id: "gold_name", n: "Gold Company Name", cost: 500, desc: "Your company name glows gold in the header — always visible" },
    { id: "neon_sign", n: "Neon Shop Glow", cost: 300, desc: "Your shop cards pulse with a neon border effect" },
    { id: "vip_dash", n: "VIP Dashboard", cost: 200, desc: "Gold-bordered quick actions on your dashboard" },
    { id: "premium_van", n: "Premium Van", cost: 150, desc: "Flashy van icon in your storage panel" },
    { id: "celebration", n: "Celebration Effects", cost: 100, desc: "Extra sparkle animation on achievement toasts" },
    { id: "elite_border", n: "Elite Profile Border", cost: 400, desc: "Animated gold border on your profile card" },
  ],

  // ── TC Economic Stabilization (Section 14) ──

  // 14a: Floor price — TC can never drop below this value
  tcFloor: {
    enabled: true,
    calculationMethod: 'purchase_parity',
    absoluteMinimum: 50,       // Hard floor — TC never worth less than $50
    recalcInterval: 30,        // Recalculate floor every 30 game days
  },

  // 14b: Emission scaling — TC earn rates scale inversely with player count
  tcEmission: {
    targetPlayerCount: 100,    // "Designed for" player count
    maxMultiplier: 5,          // Cap so small servers get a boost but not a flood (was 50)
    minMultiplier: 1,          // Never reduce below base earn rate
  },

  // 14c: Volatility dampening — EMA smoothing + circuit breaker
  tcValuation: {
    smoothingFactor: 0.1,      // How much today's calculation affects price (lower = smoother)
    maxDailyMove: 0.05,        // ±5% max change per day
    maxWeeklyMove: 0.15,       // ±15% max change per week (circuit breaker)
    circuitBreakerCooldown: 3, // If weekly limit hit, freeze price changes for 3 days
  },

  // 14d: Reserve buyback — game acts as market maker via NPC reserve
  tcReserve: {
    enabled: true,
    reserveBalance: 1000000,   // Starting game-cash reserve for buybacks
    buybackThreshold: 0.8,     // Activate when TC < 80% of 30-day avg
    buybackPriceDiscount: 0.05, // Reserve buys at 5% below current price
    maxDailyBuyback: 50,       // Max TC the reserve buys per day
    sellThreshold: 1.3,        // Reserve sells TC when price is 130% of avg
    maxDailySell: 20,          // Sells slower than buys (stabilizing bias)
    replenishRate: 5000,       // Reserve gets $5K/day added
  },

  // 14e: TC marketplace fees
  tcMarketplace: {
    sellerFee: 0.05,           // 5% fee on TC trades
    sellerFeePremium: 0.02,    // 2% for premium members
    maxListingPct: 0.50,       // Max 50% of TC balance per listing
    minListing: 5,             // Minimum 5 TC per listing
    listingCooldownDays: 1,    // 1 listing per day per player
    listingDurationDays: 30,   // Auto-expire after 30 days
    priceRangeLimit: 0.50,     // Listings must be within ±50% of fair value
  },

  // ── TC In-App Purchases (real money → TireCoins) ──
  tcPurchase: {
    enabled: true,
    tiers: [
      { id: 'tc_100',   tc: 100,   price: 0.99,  label: 'Starter Pack',     bonus: 0,    popular: false },
      { id: 'tc_500',   tc: 550,   price: 4.99,  label: 'Value Pack',       bonus: 50,   popular: false },
      { id: 'tc_1200',  tc: 1400,  price: 9.99,  label: 'Pro Pack',         bonus: 200,  popular: true },
      { id: 'tc_3000',  tc: 3750,  price: 24.99, label: 'Empire Pack',      bonus: 750,  popular: false },
      { id: 'tc_7000',  tc: 9100,  price: 49.99, label: 'Tycoon Pack',      bonus: 2100, popular: false },
      { id: 'tc_15000', tc: 21000, price: 99.99, label: 'Mogul Pack',       bonus: 6000, popular: false },
    ],
    // Premium members get 20% bonus TC on all purchases
    premiumPurchaseBonus: 0.20,
    // First purchase ever gets double TC (one-time)
    firstPurchaseMultiplier: 2.0,
    // Platform: 'capacitor' for mobile IAP, 'stripe' for web
    // Server validates receipt before granting TC
  },

  // ── Premium Subscription Tiers ──
  premiumTiers: {
    monthly: {
      id: 'premium_monthly',
      price: 4.99,
      label: 'PRO Monthly',
      features: [
        '+1500 TC storage capacity',
        '100 TC monthly stipend',
        'Auto-restock system',
        '2% marketplace fee (vs 5%)',
        '20% bonus on TC purchases',
        'Gold company name',
        'Priority customer traffic (+10%)',
      ],
    },
    yearly: {
      id: 'premium_yearly',
      price: 29.99,
      label: 'PRO Yearly',
      savings: '50%',
      features: [
        'Everything in Monthly',
        '+500 bonus TC on signup',
        'Exclusive yearly badge',
      ],
    },
  },
};
