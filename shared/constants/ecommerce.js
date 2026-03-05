export const ECOM_UNLOCK_COST = 150000;
export const ECOM_MIN_REP = 35;
export const ECOM_MIN_STORAGE = 2000;

export const ECOM_STAFF = {
  webDev: { title: "Web Developer", salary: 7500, desc: "Site UX, checkout flow, speed optimization", convBoost: .04 },
  seniorDev: { title: "Senior Developer", salary: 11000, desc: "Architecture, API integrations, mobile", convBoost: .06, req: { webDev: true } },
  seoSpecialist: { title: "SEO/SEM Specialist", salary: 6500, desc: "Google rankings, ad campaigns, keywords", trafficBoost: .12 },
  contentWriter: { title: "Content Writer", salary: 4500, desc: "Buying guides, reviews, fitment articles", convBoost: .05 },
  photographer: { title: "Product Photographer", salary: 4000, desc: "Tire photos, 360 views, lifestyle images", convBoost: .03 },
  csRep: { title: "Customer Service Rep", salary: 3500, desc: "Phone/chat/email \u2014 handle orders & returns", maxOrders: 200 },
  csManager: { title: "CS Manager", salary: 5500, desc: "Manages support team, escalations, quality", req: { csRep: true }, convBoost: .02 },
  dataAnalyst: { title: "Data Analyst", salary: 6500, desc: "Conversion tracking, A/B testing, pricing", convBoost: .03 },
};

export const ECOM_UPGRADES = {
  fitmentDb: { cost: 75000, monthly: 3000, name: "Fitment Database", desc: "Map tires to vehicles. Reduces returns 40%, boosts conversion", convBoost: .12, returnReduce: .4 },
  mobileApp: { cost: 100000, monthly: 4000, name: "Mobile App", desc: "iOS/Android \u2014 captures 55% of tire shoppers", trafficBoost: .25, req: { seniorDev: true } },
  reviewPlatform: { cost: 30000, monthly: 800, name: "Review Platform", desc: "Verified customer reviews & ratings", convBoost: .08 },
  photoStudio: { cost: 40000, monthly: 1500, name: "Photo Studio", desc: "360 tire views, on-vehicle renders", convBoost: .05, req: { photographer: true } },
  installerNet: { cost: 50000, monthly: 3500, name: "Installer Network", desc: "Partner shops for installation booking ($15/tire referral)", installRevPerTire: 15 },
  roadHazard: { cost: 20000, monthly: 500, name: "Road Hazard Program", desc: "Warranty add-on \u2014 $18/tire, 85% margin", warrantyPrice: 18, warrantyMargin: .85, attachRate: .25 },
  liveChat: { cost: 15000, monthly: 1000, name: "Live Chat System", desc: "Real-time customer support \u2014 reduces cart abandonment", convBoost: .04, req: { csRep: true } },
};

// Tiers based on total invested in ecom upgrades + staff
// Rebalanced: "Competitive" at ~$200K invested (was $1M)
export const ECOM_TIERS = [
  { min: 0, label: "Invisible", marketShare: .0005, desc: "Page 10+ \u2014 nobody finds you" },
  { min: 5000, label: "Crawling", marketShare: .001, desc: "Page 8-10 \u2014 barely indexed" },
  { min: 15000, label: "Startup", marketShare: .003, desc: "Page 5-8 for niche terms" },
  { min: 35000, label: "Emerging", marketShare: .006, desc: "Page 2-3 for some searches" },
  { min: 75000, label: "Rising", marketShare: .010, desc: "Page 1-2 for long-tail keywords" },
  { min: 120000, label: "Growing", marketShare: .018, desc: "First page for long-tail keywords" },
  { min: 200000, label: "Established", marketShare: .030, desc: "First page for major terms" },
  { min: 350000, label: "Competitive", marketShare: .050, desc: "Top 5 for most tire searches" },
  { min: 600000, label: "Major Player", marketShare: .080, desc: "Top 3 \u2014 competing with the big sites" },
  { min: 1000000, label: "Dominant", marketShare: .12, desc: "Household name in online tires" },
];

export const ECOM_PAYMENT_FEE = .028;
export const ECOM_BASE_RETURN_RATE = .08;
export const ECOM_BASE_CONVERSION = .025;
export const ECOM_SHIP_COST_RANGE = [14, 28];
export const ECOM_NATIONAL_MARKET = 5000;
export const ECOM_HOSTING_BASE = 1500;
export const ECOM_HOSTING_SCALE = 500;
