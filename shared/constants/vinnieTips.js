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
  // STOCK EXCHANGE / INVESTMENTS
  // ═══════════════════════════════════════════
  { condKey: "exchangeReady", tip: "You know what's better than selling tires? Owning a piece of every tire shop in the game. Open a brokerage account at the TESX and start investing." },
  { condKey: "exchangeNewbie", tip: "The stock market ain't charity, kid. Every trade costs you 1.5% commission and Uncle Sam wants his capital gains cut. Think before you click." },
  { condKey: "exchangeIPO", tip: "Going public ain't just bragging rights \u2014 it's cash. IPO your company and let other players fund your expansion. Just remember, shareholders want dividends." },
  { condKey: "exchangeIPOReady", tip: "You've got the rep, the revenue, the locations... you're IPO material. List on the TESX and let the market decide what your empire is worth." },
  { condKey: "exchangeDividends", tip: "Dividend income is the best kind of money \u2014 you earn it while you sleep. Find companies with fat profit margins and high payout ratios." },
  { condKey: "exchangeRisk", tip: "Hot tip: new companies are cheap for a reason. They're volatile, unprofitable, and half of 'em will crash. But the ones that survive? 10x returns." },
  { condKey: "exchangeStable", tip: "Want steady returns? Look for companies with 3+ shops, positive profit margins, and consistent revenue. Boring? Maybe. But boring pays the bills." },
  { condKey: "exchangeCrash", tip: "Markets crash. It's not if, it's when. When blood is in the streets, that's when the smart money buys. Just make sure you're not already leveraged to the gills." },
  { condKey: "exchangeMargin", tip: "Margin trading is a double-edged sword. 2:1 leverage means 2x gains OR 2x losses. I've seen more fortunes lost to margin calls than to bad inventory." },
  { condKey: "exchangeShort", tip: "Short selling is betting against someone else's dream. Profitable? Sure. Risky? Absolutely. If the stock moons while you're short, you're toast." },
  { condKey: "exchangeWealthTax", tip: "The bigger your portfolio, the more the taxman takes. Wealth tax hits portfolios over $500K. Diversify between stocks, your business, and cash." },
  { condKey: "exchangePortfolio", tip: "Don't put all your money in one stock \u2014 not even your own. Diversify across sectors. When retail dips, manufacturing might boom." },
  { condKey: "exchangeBrokerageFee", tip: "That $500/month brokerage fee? Cost of doing business. Make sure your investments earn more than that or you're literally paying to lose money." },
  { condKey: "exchangeScratchTicket", tip: "Feeling lucky? The scratch tickets cost 1,000 TC but the top prize is $5 MILLION. Not great odds, but hey \u2014 somebody's gotta win." },
  { condKey: "exchangeVinnieTip", tip: "For 200 TC I'll give you an insider stock tip. Am I right 60% of the time? Sure. Is 60% better than your guessing? Absolutely." },

  // ═══════════════════════════════════════════
  // GLOBAL MARKET EVENTS
  // ═══════════════════════════════════════════
  { condKey: "geRubberShortage", tip: "Rubber Shortage in effect! Raw material costs are through the roof. If you've got a rubber farm, now's when it pays for itself. If not, tighten your margins and ride it out." },
  { condKey: "gePortStrike", tip: "Port strike is shutting down supplier orders! Hope you stocked up. Players with rubber farms and synthetic labs are sitting pretty right now." },
  { condKey: "geWinterStorm", tip: "Winter storm warning! Winter tire demand just went through the roof. If you've got winter stock, crank those prices up. If not, scramble to source some before they're gone." },
  { condKey: "geEconomicBoom", tip: "Economic boom, baby! Everyone's buying. All demand is up 25%. Stock heavy, sell fast, and ride this wave while it lasts." },
  { condKey: "geSteelSurplus", tip: "Steel surplus means cheap production costs. If you've got a factory running, now's the time to ramp up output and stockpile inventory." },
  { condKey: "geSafetyRecall", tip: "Safety recall is killing branded tire demand. Used tires are flying off the shelves though — flip that junk inventory while the getting's good." },
  { condKey: "geEvMandate", tip: "EV mandate just hit. EV tire demand is up 60% while standard tires dip. If your factory makes EV tires, congratulations — you're printing money." },
  { condKey: "geHolidayRush", tip: "Holiday rush! Demand is up 40% across the board. Staff overtime costs more, but the sales volume makes it worth every penny." },
  { condKey: "geGeneral", tip: "Global events affect every player equally. The ones who prepared come out ahead. Keep cash reserves, diversify inventory, and stay flexible." },

  // ═══════════════════════════════════════════
  // TC ECONOMY & STORAGE
  // ═══════════════════════════════════════════
  { condKey: "tcStorageFull", tip: "Your TC storage is maxed out! You're losing coins every time you earn them. Upgrade your storage capacity before you waste any more." },
  { condKey: "tcStorageAlmostFull", tip: "TC storage is getting tight. Consider upgrading before you hit the cap — nothing worse than earning coins you can't keep." },
  { condKey: "tcUpgradeAvailable", tip: "You've got enough TC to upgrade your storage capacity. More storage means more room to save up for the big purchases — farms, labs, market intel." },
  { condKey: "tcValueHigh", tip: "TC value is sky-high right now. If you've been hoarding coins, this might be the time to spend them — buy a rubber farm, upgrade storage, or grab market intel." },
  { condKey: "tcValueLow", tip: "TC is cheap right now. Smart move is to hold onto your coins — the market always bounces back. Patience pays in the TC economy too." },
  { condKey: "tcValueVolatile", tip: "TC value swings with the economy — rubber shortages, player spending, even global events. Watch the factors on your dashboard and time your big TC purchases." },

  // ═══════════════════════════════════════════
  // TIRE ATTRIBUTES & SUPPLY CHAIN
  // ═══════════════════════════════════════════
  { condKey: "tireAttrsLow", tip: "Your tire attributes are mediocre. Grip, durability, comfort — these scores drive sales. Invest in R&D and certifications to boost them." },
  { condKey: "tireAttrsHigh", tip: "Your tire attributes are top-notch! High grip, durability, and comfort scores mean your branded tires outsell the competition. Keep investing in R&D to stay ahead." },
  { condKey: "rubberFarmReady", tip: "You're spending a fortune on raw materials. A rubber farm cuts your production costs by reducing your rubber index. It's a big TC investment, but it pays dividends forever." },
  { condKey: "rubberFarmActive", tip: "Your rubber farm is producing! Every unit it makes lowers your effective rubber cost. Consider upgrading to level 2 or 3 for serious output." },
  { condKey: "syntheticLabReady", tip: "Synthetic rubber is immune to weather events and produces more efficiently. If you've got the TC and cash, a synthetic lab is the smarter long-term play." },
  { condKey: "syntheticLabActive", tip: "Synthetic lab is cranking out rubber. It's weather-proof and more efficient than natural farms. Upgrade it for even more output." },
  { condKey: "rubberSurplus", tip: "You've got surplus rubber piling up. Sell it on the market at the current rubber index rate — no sense sitting on inventory you can't use." },
  { condKey: "supplyChainDiversified", tip: "You've got both a rubber farm AND a synthetic lab. Smart diversification — natural rubber for cost, synthetic for reliability. Weather events can't touch you now." },
  { condKey: "noSupplyChain", tip: "Every tire you make depends on market rubber prices. A rubber farm or synthetic lab gives you cost control. Think vertical integration, kid." },

  // ═══════════════════════════════════════════
  // ENDGAME (rep 50+, established empire)
  // ═══════════════════════════════════════════
  { condKey: "endgame_general", tip: "You've built something real here. Now it's about optimization — squeeze every margin, automate what you can, and think about legacy." },
  { condKey: "endgame_general", tip: "At this level, it's not about selling more tires. It's about selling smarter. Every dollar saved in sourcing is a dollar of profit." },
  { condKey: "endgame_general", tip: "You know what separates the shops from the empires? Distribution. Get your tires closer to more people, faster than anyone else." },
  { condKey: "endgame_factory", tip: "Your factory is printing money — but are you maximizing quality? Higher quality rating means premium pricing and less competition." },
  { condKey: "endgame_factory", tip: "Factory tip: R&D projects take time but the exclusive tires they unlock have zero competition. That's how you own a market." },
  { condKey: "endgame_stock", tip: "Your stock price reflects your fundamentals. Grow revenue and the price follows. Dividend payouts attract long-term holders." },
  { condKey: "endgame_stock", tip: "Watch your P/E ratio. If it's low, you might be undervalued — that's actually good for buybacks. If it's high, protect that growth." },
  { condKey: "endgame_wholesale", tip: "Wholesale is volume, not margin. Keep your prices competitive and your delivery fast. Client retention is everything." },
  { condKey: "endgame_wholesale", tip: "Your wholesale operation needs inventory depth. If you're out of stock when a client orders, they go somewhere else — permanently." },
  { condKey: "endgame_ecom", tip: "E-commerce is a traffic game. SEO specialist + content writer + fitment database is the combo that prints. Invest in the stack." },
  { condKey: "endgame_ecom", tip: "Your conversion rate is the lever. A 1% bump in conversion on your traffic could mean thousands more per day. A/B test everything." },
  { condKey: "endgame_distribution", tip: "Distribution centers reduce shipping times to nearby regions. More DCs = faster delivery = more orders. Think geographic coverage." },
  { condKey: "endgame_factory_nudge", tip: "You're sitting on $2M+ with no factory. A factory gives you branded product with zero supplier markup. That's pure margin." },
  { condKey: "endgame_ipo_nudge", tip: "You haven't gone public yet. An IPO raises capital, builds brand awareness, and lets other players invest in your success." },
  { condKey: "endgame_dist_nudge", tip: "You're doing wholesale without a Distribution Network. Unlock it in the Wholesale tab — it cuts delivery costs and lets you open regional distribution centers for better coverage." },
  { condKey: "endgame_legend", tip: "Rep 80+. You're a legend in the tire game. At this point, it's about building a legacy. Franchise, go public, dominate the market." },
  { condKey: "endgame_legend", tip: "I've been in this business 40 years and I've never seen someone build what you've built. Keep pushing — the ceiling is higher than you think." },
  { condKey: "endgame_bank", tip: "You've got half a million in cash but barely anything in the bank. That savings account earns interest every day. Park some cash." },
  { condKey: "endgame_debt", tip: "You're carrying loans at your level? Consider paying them down early. The interest is eating into your margins." },
  { condKey: "endgame_fall", tip: "Fall is coming — winter tire demand spikes in 2-3 weeks. Start stocking now while prices are still low. Early birds get the margins." },
  { condKey: "endgame_winter", tip: "Winter is peak season for snow tires. If you're not stocking winter tires in cold-climate shops, you're missing the biggest margin window of the year." },
  { condKey: "endgame_spring", tip: "Spring means all-season tire swaps. Everyone who bought winter tires needs to switch back. Have all-seasons and performance ready." },
  { condKey: "endgame_summer", tip: "Summer is performance tire season. Car meets, road trips, upgrades. Stock up on performance and luxury touring — margins are fat." },

  // ═══════════════════════════════════════════
  // DEFAULTS (multiple fallbacks for variety)
  // ═══════════════════════════════════════════
  { condKey: "default", tip: "Keep grinding, kid. The tire game rewards patience and hustle. Every day you show up is a day closer to empire." },
  { condKey: "defaultB", tip: "In this business, the ones who survive are the ones who adapt. Watch the market, watch your costs, and never stop learning." },
  { condKey: "defaultC", tip: "I've seen a hundred tire shops come and go. The ones that make it? They obsess over cash flow and treat every customer like gold." },
  { condKey: "defaultD", tip: "Remember — tires are a need, not a want. People always need tires. Your job is to be the one they buy from. Stay sharp." },
  { condKey: "defaultE", tip: "Some days are slow, some weeks are rough. But the tire business always bounces back. Keep your inventory stocked and your prices competitive." },
];
