/**
 * Vinnie's contextual tips — shown based on game state conditions.
 * Each tip has a condition key and the tip text.
 * The condition functions are evaluated on the client/server with the game state.
 *
 * condKey values map to condition checks in the UI:
 *   - "noTires": inventory is 0
 *   - "lowCash": cash < 100
 *   - "highCash": cash > 50000 and no shop
 *   - "noSales": weekSold === 0 and has inventory
 *   - "overpriced": has inventory but no sales for 2+ weeks
 *   - "firstSale": weekSold > 0 and week < 5
 *   - "repLow": reputation < 5
 *   - "repMid": reputation >= 15 and no shop
 *   - "canShop": cash >= 137500 and locations === 0
 *   - "hasShop": locations > 0 and staff.techs === 0
 *   - "noStaff": locations > 0 and total staff < 2
 *   - "junkHeavy": used_junk > 15
 *   - "storFull": inventory close to capacity
 *   - "storEmpty": inventory < 5 and has storage
 *   - "loanHeavy": loans > 2
 *   - "cashNeg": cash < 0
 *   - "default": fallback
 */
export const VINNIE_TIPS = [
  { condKey: "noTires", tip: "You got no tires, kid! Get over to the Source tab and hit up a scrap yard. Can't sell what you don't have." },
  { condKey: "lowCash", tip: "Running low on cash. If you're stuck, take a small loan from the Bank. No shame in leverage — just don't over-borrow." },
  { condKey: "highCash", tip: "You're sitting on a pile of cash! Time to think about opening your first tire shop. $137.5K gets you in the door." },
  { condKey: "noSales", tip: "Nobody's buying? Check your prices. If they're too high for used tires, customers walk. Try dropping prices a bit." },
  { condKey: "firstSale", tip: "First sales coming in — that's what I like to see! Keep stocking inventory and let the van do its thing." },
  { condKey: "repLow", tip: "Your reputation is low. That's normal early on. Every tire you sell builds it. Consistency is the game." },
  { condKey: "repMid", tip: "Rep's climbing! You're unlocking better sources and suppliers now. Start thinking about scaling up." },
  { condKey: "canShop", tip: "You've got the cash for a shop! Go to the Shop tab, pick a city, and start printing real money." },
  { condKey: "hasShop", tip: "You got a shop but no techs! Hire technicians in the Staff tab — they're the ones actually selling tires." },
  { condKey: "noStaff", tip: "Your shop needs staff to sell. Techs install tires, sales staff handle customers. Get at least one of each." },
  { condKey: "junkHeavy", tip: "That's a lot of junk tires. Watch out — too many and you might get a disposal fine. Sell 'em cheap or dump 'em." },
  { condKey: "storFull", tip: "Storage is almost full! You can't buy more tires until you sell some or upgrade storage." },
  { condKey: "storEmpty", tip: "Your storage is nearly empty. Go source more tires — empty shelves don't make money." },
  { condKey: "loanHeavy", tip: "Easy on the loans, kid. Those weekly payments add up. Focus on revenue before borrowing more." },
  { condKey: "cashNeg", tip: "You're in the red! Cut costs — fire staff you don't need, sell tires at a discount, do whatever it takes to get positive." },
  { condKey: "default", tip: "Keep grinding, kid. The tire game rewards patience and hustle." },
];
