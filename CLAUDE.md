# Tire Empire — CLAUDE.md

Read this before touching any file. The systems here are deeply coupled.
Skipping this causes integration bugs that are hard to trace.

---

## Stack

- **Server:** Node.js + Express, ES modules (`import`/`export` throughout)
- **Database:** PostgreSQL via `pg` pool — Railway-hosted
- **Client:** React + Vite, Tailwind CSS, deployed as static SPA
- **Mobile:** Capacitor wrapper around the same React app
- **Auth:** Firebase (client-side) — `uid` from Firebase is the player's DB `id`
- **Real-time:** WebSockets — server broadcasts tick state to all connected clients

---

## Repository Layout

```
server/
  tick/tickLoop.js       ← THE tick orchestrator — read this first
  engine/simDay.js       ← per-player daily simulation (pure function)
  engine/exchangeTick.js ← stock exchange tick (runs AFTER all simDay calls)
  engine/exchange.js     ← exchange primitives (IPO, order matching, etc.)
  engine/aiPlayers.js    ← legacy AI player simulation
  engine/botDecision.js  ← stealth bot personality system
  db/pgStore.js          ← all DB read/write — includes saveGame trimming logic
  db/pool.js             ← pg pool, statement_timeout = 10s
  db/queries.js          ← exported query functions used by tickLoop
  routes/               ← Express route handlers, one file per feature area
  routes/actions/       ← Player action handlers (shop, factory, bank, etc.)

shared/
  constants/            ← ALL game constants — never hardcode values in engine
  helpers/              ← Pure utility functions (inventory, calendar, format, etc.)

client/src/
  components/panels/    ← One panel per major feature (ExchangePanel, FactoryPanel, etc.)
  api/client.js         ← All API calls from client
```

---

## The Tick Loop — How One Game Day Works

**File:** `server/tick/tickLoop.js` → `runTick(clients)`

Order of operations every tick (= 1 game day):

1. `getGame()` — load shared game row from DB (`games` table, id=`'default'`)
2. `getAllActivePlayers()` — load all player rows
3. Auto-spawn stealth bots if population < 15
4. Build `shared` object (see below)
5. For each player: run `applyAutoPrice` → `applyAutoSource` → `applyAutoSupplier` → `simDay(state, shared)` → `savePlayerState`
6. Resolve marketplace auctions
7. AI price wars (every 3 days)
8. AI phase-out (gradual as real players join)
9. Bot phase-out
10. Monthly tournaments (every 30 days)
11. `runExchangeTick(game.economy.exchange, players, day)` — stock exchange
12. `saveGame(...)` — writes updated economy blob back to DB
13. `broadcast(clients, ...)` — WebSocket push to all connected clients

**Critical:** Exchange tick runs AFTER all players are simulated. Economy state computed in step 4 is what every player sees during their simDay.

---

## The `shared` Object — How Economy State Reaches simDay

`shared` is built in `tickLoop.js` and passed into every `simDay(g, shared)` call.
It is **read-only** from simDay's perspective — never mutate `shared` inside simDay.

Key fields simDay reads from `shared`:

```js
shared = {
  aiShops,              // array of AI competitor shops
  liquidation,          // liquidation market listings
  playerPriceAvg,       // per-tire average across all players
  aiPriceAvg,           // per-tire average across AI shops
  factorySuppliers,     // players with isDistributor=true
  wholesaleSuppliers,   // players with hasWholesale=true
  globalEvents,         // active global event objects
  tcValue,              // current TireCoin value in $
  supplierPricing,      // per-tire economy multipliers (0.75–1.25)
  supplierPrices,       // per-supplier per-tire multipliers
  commodities,          // { rubber, steel, chemicals, oil } — multipliers ~0.75–1.35
  inflationIndex,       // macro inflation multiplier
  bankRate,             // current savings interest rate
  loanRateMult,         // loan rate modifier
  bankState,            // full bank state object
  exchange,             // exchange state (passed through, not used by simDay directly)
  recentChatMessages,   // last 15 global chat messages (for bot replies)
}
```

**Important:** `shared` is never persisted — it is rebuilt from `game.economy` every tick.
Adding a new field to `shared` requires: (1) computing it in tickLoop before the player loop, (2) reading it in simDay, (3) updating `game.economy` in tickLoop after simDay runs.

---

## The `games` Table — The Most Critical Row

There is exactly **one row** in the `games` table (`id = 'default'`).
It holds `economy` as a JSONB column. This blob stores everything that is shared across all players: AI shops, exchange state, commodity prices, TireCoin metrics, bank state, active global events, etc.

**JSONB size is a critical concern.** If `economy` grows too large, `SELECT * FROM games WHERE id = $1` times out (pool.js sets `statement_timeout = 10s`). When this happens, the tick loop cannot read shared state → no players get ticked → revenue freezes.

**Size limits enforced in `saveGame` (pgStore.js ~line 547):**
- `stock.priceHistory` capped at 30 entries
- `stock.revenueHistory` stripped (derived, recomputed each tick)
- `stock.revenueBySegment`, `riskRating`, `weeklyGrowth`, `profitMargin`, `dividendYield` stripped
- `orderBook.bids/asks` capped at 20 entries each
- `orderBook.fills` deleted
- `tcMarketplace.tradeHistory` capped at 50 entries
- **Hard abort guard:** if economy blob > 800KB, saveGame skips the save rather than writing a bloated row

**Never add unbounded arrays to `game.economy`.** Always cap with `.slice(-N)`.

---

## Player State — `game_state` JSONB

Each player row in `players` has a `game_state` JSONB column. This is the full player simulation state: cash, inventory, locations, staff, loans, factory, stockExchange positions, etc.

`simDay` is a **pure function**: `simDay(g, shared) → newState`. It does not read from DB. The tick loop reads fresh state from DB inside `withPlayerLock` before calling simDay, then saves the result.

Key state shape:

```js
g = {
  cash, bankBalance,
  day,                    // current game day — incremented by simDay
  dayRev, daySold, dayProfit,   // reset to 0 at start of each simDay
  locations: [{ cityId, inventory, staff, prices, ... }],
  warehouseInventory: {},  // tire key → qty
  inventory: {},           // global aggregate (rebuilt by rebuildGlobalInv)
  storage: [],             // storage unit purchases
  staff: { techs, sales, managers, drivers, pricingAnalyst },
  loans: [],
  factory: { ... },        // null if no factory
  stockExchange: { isPublic, ticker, shares, ... },
  prices: {},              // per-tire sell prices
  autoPrice: {},           // auto-pricing config
  autoSuppliers: [],       // auto-restock config
  log: [],                 // capped at 50 entries before save
}
```

**Never** send `_commodityDemand` or any `_` prefixed server-only fields to the client.

---

## Inventory System

**Always use helpers — never access inventory arrays directly.**

```js
import { getCap, getInv, getLocInv, getLocCap, rebuildGlobalInv } from '../../shared/helpers/inventory.js';
import { getStorageCap } from '../../shared/helpers/warehouse.js';
```

- `getCap(g)` — total inventory capacity (locations + warehouse)
- `getInv(g)` — total current inventory count
- `getLocCap(loc)` — capacity of one location
- `getLocInv(loc)` — current inventory at one location
- `getStorageCap(g)` — warehouse capacity specifically
- `rebuildGlobalInv(g)` — **call after every inventory mutation** — syncs `g.inventory` aggregate

**After any mutation to `g.warehouseInventory` or `loc.inventory`, always call `rebuildGlobalInv(g)`.**

Tire keys follow a naming convention:
- New tires: `'allSeason'`, `'performance'`, `'winter'`, `'lightTruck'`, `'commercial'`, etc.
- Used tires: `'used_junk'`, `'used_poor'`, `'used_good'`, `'used_premium'`
- Factory branded: `getBrandTireKey(tireType)` from `shared/helpers/factoryBrand.js`

---

## Stock Exchange

**Files:** `server/engine/exchange.js`, `server/engine/exchangeTick.js`

Exchange state lives at `game.economy.exchange` (inside the games row).
`runExchangeTick(exchangeState, players, day)` returns `{ exchangeState, modifiedPlayers }`.

Key rules:
- Only return stocks where `stock.isPublic === true` in `GET /stocks`
- NPC/bot stocks: cap at 10, mark with `isNPC: true`
- Before creating any stock in `processIPO`: check if `playerId` already has a stock — if yes, restore `isPublic` and return early (prevents duplicate tickers like `DRL1`, `DRL2`)
- Derived fields (`revenueHistory`, `revenueBySegment`, `riskRating`, `weeklyGrowth`, `profitMargin`, `dividendYield`) are **stripped on save** and **recomputed in updateFundamentals** — never rely on their presence when reading
- Guard all optional exchange fields before rendering: `stock.riskRating ?? 'N/A'`

---

## Commodity System (In Progress / Pending Build)

The existing `game.economy.commodities` is a simple multiplier object `{ rubber, steel, chemicals, oil }` (values ~0.75–1.35). This feeds `shared.commodities` which simDay uses to adjust production costs and supplier pricing.

The full commodity trading system (contracts, world market, player farms as commodity suppliers) is **designed but not yet built**. When building it:

- `_commodityDemand` is a server-only accumulator — strip before sending state to client
- Aggregate factory demand in tickLoop after all simDay calls, before exchangeTick
- World market supply is **inelastic** — ramps over `worldProductionRampDays`, does not respond instantly to player behavior
- Commodity contracts live on `g.commodityContracts` array
- Player position on exchange: `g.stockExchange.commodityPositions[commodity]`
- Price clamp: ±60% of `basePrice` hard limit
- No shorting, max 500 contracts per player per commodity
- Demand data is **one tick delayed** to prevent insider trading — never pass current tick's factory demand directly to commodity price calculation

---

## Driver System

Drivers move tires between warehouse and shop locations. Logic lives inside `simDay.js`.

Driver capacity per trip is determined by driver count and vehicle upgrades. The `usedTirePolicy` setting per location controls whether used tires are returned to warehouse:

- `'auto'` (default) — return used tires if warehouse has space, up to 30% of remaining trip capacity
- `'new_only'` — only move new tires, never touch used
- `'return_used'` — aggressively return used tires first

Warehouse used tire soft cap: 200 tires. During a commodity shortage: 400. If at soft cap, Vinnie should suggest routing van sales or flea market.

---

## Vinnie (AI Advisor)

Vinnie triggers are defined in `shared/constants/vinnieTriggers.js` and evaluated in simDay. He fires once per trigger per player per condition. Triggered messages go into `s._events` array during simDay and are read by the client.

When adding new game systems, Vinnie triggers should be added for:
- First time a player encounters the system
- Warning states (e.g., warehouse full, shortage active)
- Opportunity states (e.g., used tire stock high during shortage)

Vinnie should **not** mention commodity layer mechanics until player has a factory OR has opened a brokerage (`g.hasFactory || g.stockExchange?.hasBrokerage`).

---

## Database Patterns

**pgStore.js exports** (imported via `queries.js`):
- `getGame()` / `saveGame(id, day, economy, aiShops, liquidation)`
- `getPlayer(id)` / `savePlayerState(id, state, version?)` — version enables optimistic locking
- `getAllActivePlayers()` — returns all non-deleted player rows
- `withPlayerLock(playerId, fn)` — per-player mutex, **always use for player mutations**

**FK violation handling:** When saving to `player_financials` or `player_stats` in `_syncHotTables`, catch error code `'23503'` silently — it means the bot player was deleted between tick and save, which is safe to ignore.

**Optimistic locking:** `savePlayerState(id, state, version)` increments version on save. If another process saved first, throws `VersionConflictError`. Tick loop catches this and skips — not an error.

---

## Key Design Decisions

**Why `shared` is rebuilt every tick:** Economy state in `game.economy` may be mutated by the tick loop (global events, commodity prices, TC value). Rebuilding `shared` from scratch ensures every player sees the same consistent state for that day.

**Why exchangeTick runs after all simDay calls:** Exchange operations (dividends, margin calls, tax fees) modify player `cash`. Running it after simDay prevents double-counting revenue in the same tick.

**Why commodity demand is one tick delayed:** Factory production consumes rubber/steel/chemicals. Aggregating that demand into `game.economy.factoryDemand` and using it to drive commodity prices the *next* tick prevents a player from instantly knowing their own production's effect on prices — no insider trading.

**Why `_commodityDemand` is never sent to client:** It's an intermediate server accumulator. Sending it would expose aggregate factory demand to players before the tick delay, enabling insider trading.

**Why used tire storage has a soft cap:** Forces players to actively route used inventory through van sales and flea market rather than hoarding indefinitely. Cap lifts to 400 during shortages when used tires are actually valuable.

**Why world market supply is inelastic:** If world supply responded instantly to player cornering, the strategy would be unprofitable (supply catches up before prices spike). The 8-10 day ramp creates a genuine window for market manipulation, balanced by mean reversion.

**Why there's a hard abort guard in saveGame:** Better to skip one save than to write an 800KB+ economy blob that breaks all subsequent SELECT calls. The next tick will save cleanly once the trimming prevents further growth.

---

## Common Mistakes to Avoid

1. **Do not call `rebuildGlobalInv` only once at the end of a batch.** Call it after each inventory mutation if `getInv()` or `getCap()` is called in between.

2. **Do not add fields to `game.economy` without capping their size.** Everything in that object is serialized to a single JSONB column.

3. **Do not read `game.economy.exchange` directly in route handlers.** Always go through `GET /exchange/...` routes which handle auth and state mapping.

4. **Do not assume `g.factory` exists.** Always guard: `if (g.hasFactory && g.factory)`.

5. **Do not use `Math.random()` in simDay for anything that should be deterministic per-player.** Shared randomness between players causes desync.

6. **Do not strip `_` prefixed fields from `g` before saving.** Some are used across ticks (`_contractPayables`, `_activeBoosts`). Only strip fields explicitly listed in pgStore trimming logic.

7. **Do not add new player state fields without a migration fallback.** Always write `g.newField = g.newField || defaultValue` — existing players won't have it.

8. **Do not reference `stock.revenueHistory` or `stock.riskRating` as reliable.** These are stripped on save. If you need them, recompute in `updateFundamentals`.

9. **Do not process exchange IPOs without checking for an existing stock with the same `playerId` first.** This is what causes the `DRL1`, `DRL2` duplicate ticker bug.

10. **Do not send `_commodityDemand` or any server-only `_` accumulator to the client via WebSocket broadcast or API response.**

---

## Environment

- `DATABASE_URL` — Railway Postgres connection string
- `TICK_MS` — tick interval in ms (default 20000 = 20 seconds = 1 game day)
- Firebase config in `client/src/services/firebase.js`
- Railway handles deployment — push to `main` triggers deploy

---

## Running Locally

```bash
npm install
npm run dev   # starts both server (nodemon) and client (vite) concurrently
```

Server default port: 3001. Client proxies `/api` to server via Vite config.
