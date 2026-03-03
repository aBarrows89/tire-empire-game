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
    weekSurvived: 5,
    shopOpened: 50,
    firstWarehouse: 100,
    acquisitionComplete: 75,
    revenueTarget100K: 200,
    revenueTarget1M: 500,
    wholesaleClientSigned: 25,
    tpoContractSigned: 40,
    ecomLaunched: 150,
    distributorUnlocked: 300,
    marketplaceLaunched: 30,
    liquidationBought: 20,
    liquidationSold: 35,
    installerRecruited: 25,
    becameInstaller: 40,
  },
  // Ad strategy
  adRewardTC: 50,
  maxRewardedPerDay: 3,
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
};
