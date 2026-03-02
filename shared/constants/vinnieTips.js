/**
 * Vinnie's contextual tips — shown based on game state conditions.
 * Each tip has a condition key and the tip text.
 * The condition functions are evaluated on the client with the game state.
 *
 * Vinnie is a wise, street-smart tire industry mentor who's been in
 * the business for decades. Tips are organized by game phase.
 *
 * Phases:
 *   BOOTSTRAP  — day 1-30, no shops, scrappy hustle
 *   FIRST SHOP — first location, learning the ropes
 *   GROWTH     — 2-4 shops, scaling up
 *   EMPIRE     — 5+ shops, big league moves
 *   FACTORY    — manufacturing your own rubber
 *   SEASONAL   — calendar-driven advice
 *   SITUATIONAL— reactive to current problems
 *   DEFAULTS   — fallback wisdom
 */
export const VINNIE_TIPS = [
  // ═══════════════════════════════════════════
  // BOOTSTRAP (day 1-30, no shops)
  // ═══════════════════════════════════════════
  { condKey: "noTires", tip: "You got no tires, kid! Get over to the Source tab and hit up a scrap yard. Can't sell what you don't have." },
  { condKey: "lowCash", tip: "Running low on cash. If you're stuck, take a small loan from the Bank. No shame in leverage — just don't over-borrow." },
  { condKey: "firstSale", tip: "First sales coming in — that's what I like to see! Keep stocking inventory and let the van do its thing." },
  { condKey: "repLow", tip: "Your reputation is low. That's normal early on. Every tire you sell builds it. Consistency is the game." },
  { condKey: "vanLife", tip: "Selling out of a van ain't glamorous, but it's how every tire king started. Keep those used tires moving and stack that cash." },
  { condKey: "scrappyStart", tip: "The scrap yards are your best friend right now. Buy low, sell fair, and don't get greedy. Volume beats margin at this stage." },
  { condKey: "garageGold", tip: "Every junk tire you flip is pure profit. Even a $5 sale adds up when you're doing twenty a day. That's garage gold, kid." },
  { condKey: "pricingBasics", tip: "Pricing 101 — check what the market says, then go 10-15% under. You ain't got the reputation to charge premium yet." },
  { condKey: "cashflow101", tip: "Cash flow is king. Don't sit on inventory for too long — a tire that sells today for $30 beats one that sells next month for $40." },
  { condKey: "firstGrand", tip: "Your first $1,000 feels like a million. Smart move is to reinvest most of it in better inventory. The rest? Treat yourself to lunch." },

  // ═══════════════════════════════════════════
  // FIRST SHOP
  // ═══════════════════════════════════════════
  { condKey: "hasShop", tip: "You got a shop but no techs! Hire technicians in the Staff tab — they're the ones actually installing tires and making you money." },
  { condKey: "noStaff", tip: "Your shop needs staff to operate. Techs install tires, sales staff handle customers. Get at least one of each or you're burning rent." },
  { condKey: "shopStocking", tip: "An empty shop is a dead shop. Keep your location stocked with a mix of new and used tires — different customers want different things." },
  { condKey: "serviceMoney", tip: "Don't sleep on services — flat repairs, balancing, nitrogen fills. It's pure labor profit with no inventory cost. Your techs can handle it." },
  { condKey: "loyaltyTip", tip: "Return customers are the backbone of this business. Keep prices fair and stock consistent, and they'll keep coming back every season." },
  { condKey: "marketingIntro", tip: "Word of mouth only goes so far. Once you've got a shop, consider some local marketing to drive foot traffic. Rep builds faster that way." },
  { condKey: "supplierUnlock", tip: "Your reputation just opened up new suppliers. Check the Source tab — wholesale suppliers sell new tires at better margins than scrap yards." },
  { condKey: "shopRentWarning", tip: "Rent doesn't care if you had a bad week. Make sure your weekly sales cover overhead before you start hiring more staff." },
  { condKey: "takeoffGold", tip: "Customers leave old tires when they buy new ones — those take-offs are free inventory. Set your disposal fee right and it's a double win." },
  { condKey: "bankDeposit", tip: "Got spare cash sitting around? The bank pays interest on deposits. It's not huge, but it beats letting money rot in your pocket." },

  // ═══════════════════════════════════════════
  // GROWTH (2-4 shops)
  // ═══════════════════════════════════════════
  { condKey: "multiShop", tip: "One shop is a start. Two shops doubles your reach. Look at cities with low competition and high demand — that's where the money flows." },
  { condKey: "canShop", tip: "You've got the cash for another shop! Go to the Shop tab, pick a city, and start expanding your empire." },
  { condKey: "highCash", tip: "You're sitting on a pile of cash with room to grow! Time to think about opening your next tire shop. Every location is a new revenue stream." },
  { condKey: "repMid", tip: "Rep's climbing! You're unlocking better sources and suppliers now. Start thinking about wholesale accounts and premium inventory." },
  { condKey: "autoPricing", tip: "Managing prices across multiple shops gets messy. Set competitive prices and check the market tab regularly — don't leave money on the table." },
  { condKey: "transferTip", tip: "Got one shop overstocked and another running dry? Use transfers to balance inventory across locations. Don't let tires collect dust." },
  { condKey: "loanStrategy", tip: "At this stage, smart debt is good debt. A loan to open a new location pays for itself in weeks if you pick the right city." },
  { condKey: "seasonalPrep", tip: "Seasons change demand. Stock winter tires before October, push all-seasons in spring. Players who plan ahead make twice the profit." },
  { condKey: "cityPicking", tip: "Not all cities are equal. High demand with low cost of living is the sweet spot. Avoid expensive cities until your cash flow can handle the rent." },
  { condKey: "staffBalance", tip: "More shops means more staff. But don't overhire — each location needs enough techs to handle demand, not more. Watch your payroll ratio." },
  { condKey: "insuranceTip", tip: "As you grow, one bad event can wipe out a week's profit. Keep a cash reserve — at least two weeks of operating costs in the bank." },

  // ═══════════════════════════════════════════
  // EMPIRE (5+ shops)
  // ═══════════════════════════════════════════
  { condKey: "wholesaleReady", tip: "With your volume, wholesale is a no-brainer. Bulk buying cuts your cost per tire by 15-20%. Talk to the big distributors." },
  { condKey: "ecomReady", tip: "E-commerce opens up national sales. You've got the inventory and the reputation — time to sell tires online and ship nationwide." },
  { condKey: "govContract", tip: "Government contracts are steady, guaranteed revenue. Your reputation qualifies you — check the contracts tab for municipal fleet deals." },
  { condKey: "factoryDream", tip: "Every tire empire eventually makes their own rubber. A factory is a massive investment, but it's the ultimate competitive advantage." },
  { condKey: "diversify", tip: "Don't put all your eggs in one basket. Mix retail, wholesale, e-commerce, and services. When one channel dips, others carry the load." },
  { condKey: "brandPower", tip: "At this level, your brand IS the business. High reputation means premium pricing, better contracts, and customers who trust you on sight." },
  { condKey: "cashRich", tip: "Sitting on serious cash! Consider opening new locations, investing in e-commerce, or paying down debt to boost your bottom line." },
  { condKey: "retreadBiz", tip: "Retreading turns junk tires into sellable product. It's recycling that prints money. Look into retread operations if you haven't already." },
  { condKey: "importGame", tip: "International tire sourcing can cut costs dramatically. It takes capital and connections, but at your scale, the savings are enormous." },

  // ═══════════════════════════════════════════
  // FACTORY
  // ═══════════════════════════════════════════
  { condKey: "factoryFirst", tip: "Kid, you're in the big leagues now. Start with one production line and scale up. Factory tires cost a fraction of wholesale — that's your new edge." },
  { condKey: "factoryStaff", tip: "A factory needs skilled workers to run efficiently. Hire factory staff before ramping production or quality will suffer." },
  { condKey: "factoryBrand", tip: "You're making your own tires now. Build your brand name — customers pay more for a name they recognize and trust." },
  { condKey: "factoryUpgrade", tip: "Upgrading your factory equipment increases output and quality. Each upgrade pays for itself within a few months of production." },
  { condKey: "factoryExport", tip: "Why stop at domestic? Your factory can produce for export markets. International sales add a whole new revenue layer to your empire." },
  { condKey: "factoryWholesale", tip: "Now you're SUPPLYING the competition. That's power. Set your wholesale prices right and watch the orders roll in." },
  { condKey: "factoryBrandRep50", tip: "Your name carries weight. Time to raise those prices. Shops are ASKING for your brand now." },
  { condKey: "factoryVinnieLoss", tip: "Hey, you win some, you lose some. Mostly lose some. Maybe hire a CFO to keep me in check... just kidding. Kind of." },
  { condKey: "factoryRD", tip: "R&D is how you stay ahead. Invest in new tire tech and you'll unlock products nobody else can make. That's a moat, kid." },

  // ═══════════════════════════════════════════
  // SEASONAL
  // ═══════════════════════════════════════════
  { condKey: "winterComing", tip: "Winter's coming! Stock up on winter and snow tires now — prices spike once the cold hits, and customers panic-buy. Be ready." },
  { condKey: "summerComing", tip: "Summer driving season ahead. All-season and performance tires will be hot sellers. Stock up now while prices are still reasonable." },
  { condKey: "blackFriday", tip: "Black Friday is around the corner! Demand can spike 2-3x. Stock up heavy and consider a small price bump — they'll still buy." },
  { condKey: "christmas", tip: "Christmas week is slow for walk-ins. Use the downtime to retread tires, restock inventory, and plan your next expansion." },

  // ═══════════════════════════════════════════
  // SITUATIONAL
  // ═══════════════════════════════════════════
  { condKey: "profitNegative", tip: "We lost money this cycle. Check your prices — you might be selling below cost. Also review staff and rent expenses. Every dollar counts." },
  { condKey: "payLoan", tip: "Got spare cash and outstanding loans? Paying off debt early saves you interest and frees up your weekly cash flow. Smart money move." },
  { condKey: "deepDebt", tip: "You're deep in the red. Time for emergency mode — sell inventory at a discount, cut unnecessary staff, and stop all non-essential spending." },
  { condKey: "loanHeavy", tip: "That's a lot of active loans. Those weekly payments eat into your profits. Focus on paying down the highest-interest ones first." },
  { condKey: "storFull", tip: "Storage is almost full! You can't buy more tires until you sell some or upgrade your storage capacity. Move that inventory." },
  { condKey: "storEmpty", tip: "Your storage is nearly empty. An empty shop makes zero sales — get sourcing immediately before customers walk to a competitor." },
  { condKey: "junkHeavy", tip: "That's a lot of junk tires piling up. Sell them cheap, retread them, or dump them before you get hit with a disposal fine." },
  { condKey: "cashNeg", tip: "You're in the red! Cut costs immediately — fire staff you don't need, discount inventory to move it fast, and consider a small loan to stabilize." },
  { condKey: "overpriced", tip: "Inventory sitting unsold for too long? Your prices might be too high. Check market rates and undercut slightly to get things moving." },
  { condKey: "noSales", tip: "Nobody's buying. That's a pricing problem, an inventory problem, or both. Lower prices on your cheapest tires to get cash flowing again." },

  // ═══════════════════════════════════════════
  // DEFAULTS (multiple fallbacks for variety)
  // ═══════════════════════════════════════════
  { condKey: "default", tip: "Keep grinding, kid. The tire game rewards patience and hustle. Every day you show up is a day closer to empire." },
  { condKey: "defaultB", tip: "In this business, the ones who survive are the ones who adapt. Watch the market, watch your costs, and never stop learning." },
  { condKey: "defaultC", tip: "I've seen a hundred tire shops come and go. The ones that make it? They obsess over cash flow and treat every customer like gold." },
  { condKey: "defaultD", tip: "Remember — tires are a need, not a want. People always need tires. Your job is to be the one they buy from. Stay sharp." },
  { condKey: "defaultE", tip: "Some days are slow, some weeks are rough. But the tire business always bounces back. Keep your inventory stocked and your prices competitive." },
];
