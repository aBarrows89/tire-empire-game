# TIRE EMPIRE — Full Project Specification
## For Claude Code Migration from Single-File React Artifact

---

## 1. PROJECT OVERVIEW

**Tire Empire** is a real-time multiplayer tire industry business simulator. Players start with $400 and a van of used tires, building toward a multi-location distribution empire. The game features a **shared real-time economy** where players trade, compete for market share, and influence each other's pricing.

### Core Philosophy
- **Real-world tire industry mechanics** — based on how IE Tires (Import Export Tire Company) actually operates
- **Real-time economy** — no fast-forward, all players on the same clock (server-authoritative ticks)
- **Player interdependence** — wholesale supply chains, liquidation markets, installer networks, price influence
- **Mobile-first** — designed for phone screens, 44px min touch targets, 480px max width

### Current State
- **Source file:** `tire-empire-v6.jsx` (2,915 lines, single React component)
- **Platform:** Claude.ai artifact with `window.storage` for persistence
- **Tick rate:** 15s per game week (testing), production target: ~60s server-controlled
- **Cities:** 132 across all 50 US states + DC
- **Tire types:** 8 (allSeason, performance, winter, lightTruck, commercial, atv, implement, tractor)

---

## 2. TECH STACK (RECOMMENDED)

```
Frontend:     React Native (Expo) — iOS + Android from one codebase
              OR Next.js PWA if web-first
Backend:      Node.js + Express (or Fastify)
Database:     PostgreSQL (game state, player data, economy)
              Redis (real-time tick state, leaderboards, caching)
Real-time:    WebSocket (Socket.IO or ws) for tick broadcasts + live events
Auth:         Firebase Auth or Supabase Auth (email + social login)
Hosting:      Railway / Render / AWS ECS
CDN:          Cloudflare (static assets)
```

---

## 3. ARCHITECTURE

### 3.1 Server-Authoritative Game Loop

The server is the single source of truth for time. No client can advance their own game state.

### 3.2 Tick Model

```
Server ticks every ~60 seconds (configurable)
  → Runs simWeek() for every active player
  → Updates shared economy state (market prices, liquidation lots, etc.)
  → Broadcasts state deltas via WebSocket
  → Players can PAUSE (stops their sim, but server clock keeps going)
  → Paused players' businesses still incur fixed costs (rent, payroll)
```

### 3.3 Client Actions (REST API)

```
POST /api/action — player action (buy tires, hire staff, set prices, etc.)
GET  /api/state  — current game state
GET  /api/market — shared market data (prices, liquidation lots, etc.)
GET  /api/leaderboard — top players
WS   /ws         — real-time tick updates + events
```

---

## 4. GAME CONSTANTS

All 59 constant objects should be extracted into a shared `constants/` directory.

### Constants Directory Structure
```
constants/
├── cities.js           — 132 cities with coords
├── tires.js            — 8 tire types with pricing
├── storage.js          — 6 storage tiers
├── sources.js          — early-game tire sources
├── suppliers.js        — 8+ supplier unlock chains
├── manufacturers.js    — 7 global manufacturers
├── loans.js            — 6 loan tiers
├── staff.js            — retail staff roles + pay
├── warehouseRoles.js   — 8 warehouse roles
├── ecomStaff.js        — 8 e-commerce roles
├── ecomUpgrades.js     — 7 platform upgrades
├── tpoBrands.js        — 4 3PO fulfillment partners
├── govTypes.js         — 5 government contract types
├── returnDeals.js      — return buyback deal templates
├── wholesale.js        — WS margin model, vol bonuses, delivery costs
├── marketplace.js      — Amazon/eBay channel config
├── liquidation.js      — condition discounts, AI lot names
├── installerNet.js     — installer partnership config
├── seasons.js          — demand multipliers + colors
├── events.js           — random game events
├── vinnieTips.js       — 40+ conditional tips
├── tutorialSteps.js    — 10 tutorial steps
├── monetization.js     — TireCoin rewards + cosmetics
└── index.js            — re-exports all
```

---

## 5. GAME PROGRESSION

### Phases

```
BOOTSTRAP ($400, rep 0)
  → Source used tires from garage cleanouts, scrap yards, flea markets
  → Sell manually from van (20 tire capacity)
  → Build reputation through sales
  → Unlock: flea market booth (rep 10, $500)

RETAIL (rep 15+, $137K+ for first shop)
  → Open tire shop in a city (requires state license)
  → Hire techs, sales staff
  → Get supplier accounts for NEW tires
  → Buy/rent warehouse storage
  → Unlock: wholesale division ($40K), bank loans

GROWTH (rep 30+, 2+ locations)
  → Multi-location expansion
  → Government contracts, Fleet accounts
  → Wholesale supply to local shops
  → 3PO fulfillment contracts
  → Return buyback deals
  → Marketplace selling (Amazon/eBay, $5K)
  → Unlock: e-commerce ($150K), manufacturer direct

ENTERPRISE (rep 45+, 3+ states)
  → Full e-commerce platform (TireRack-style)
  → Distribution network (sell to other players)
  → Manufacturer partnerships (container shipping)
  → Installer network management
  → Liquidation market trading
  → Multi-state empire
```

---

### Key Principle
The JSX file IS the working game. Every number, every formula, every condition is correct and tested. Claude Code's job is to **decompose** it — not redesign it. The mechanics don't change. The architecture does.

---

*Generated from tire-empire-v6.jsx (2,915 lines) — February 2026*
*Game design by Andy, CTO @ IE Tires*
