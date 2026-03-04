# Tire Empire -- Economic Balance Report

*Generated: 2026-03-04 | Source: simDay.js, all shared/constants/*

---

## Table of Contents

1. [Income Curve by Reputation Milestone](#1-income-curve-by-reputation-milestone)
2. [Cost Structure Audit](#2-cost-structure-audit)
3. [Tire Pricing Margins](#3-tire-pricing-margins)
4. [TC (TireCoin) Economy](#4-tc-tirecoin-economy)
5. [Recommendations for Constant Adjustments](#5-recommendations-for-constant-adjustments)

---

## 1. Income Curve by Reputation Milestone

Revenue is driven by the formula in `simDay.js` lines 607-660. The key demand multiplier for retail shops is:

```
demandMult = seasonDemand * (1 + reputation * 0.01) * tempBoost
locDemand  = city.dem * 0.25 * demandMult * whPenalty * earlyBoost * loyaltyMult
             * marketingMult * marketShareMult * monopolyMult * holidayMult
             * premiumTrafficMult * globalDemandMult
```

Van sales use a similar reputation scaling:
```
baseDemand = 8 + reputation * 0.4
```

### Modeled Daily Revenue at Key Reputation Milestones

Assumptions: 1 shop in a mid-size city (dem=50), 1 season mult=1.0, 2 techs / 2 sales / 0 managers, fair pricing (priceMult~1.0), no marketing, no early boost, no premium, no warehouse shortage. Staff cap = min(2*12, 2*8) = 16/day. Average tire price = $105 (all-season default).

| Rep | `1 + rep*0.01` | Approx Shop Demand | Van Demand | Est. Daily Tires Sold | Est. Daily Revenue | Channel |
|-----|:---:|:---:|:---:|:---:|:---:|:---|
| **0** | 1.00 | ~12 | ~8 | ~8-12 | $840 - $1,260 | Van + small shop |
| **5** | 1.05 | ~13 | ~10 | ~10-14 | $1,050 - $1,470 | Van + shop |
| **10** | 1.10 | ~14 | ~12 | ~12-16 | $1,260 - $1,680 | Mostly shop (van declining) |
| **15** | 1.15 | ~14 | ~14 | ~14-16* | $1,470 - $1,680 | Staff-capped |
| **25** | 1.25 | ~16 | ~18 | ~16* | $1,680 | Staff-capped; need more staff |
| **50** | 1.50 | ~19 | ~28 | ~16* / ~40+ (with scaling) | $1,680 / $4,200+ | Multi-shop era |
| **75** | 1.75 | ~22 | ~38 | ~60-100+ | $6,300 - $15,000+ | Multi-shop + wholesale + ecom |

*\* = staff-capacity-capped at 16 for this config*

### Key Observations

- **Staff is the real bottleneck, not reputation.** At rep 15+, demand outpaces a 2-tech / 2-sales setup. The `staffCapTotal = min(techCap, salesCap)` constraint means growth requires proportional staff investment.
- **Early game boost (days 1-180):** `earlyBoostShop = 1 + (180 - day) / 180` provides up to 2x demand on day 1, tapering to 1x by day 180. This is critical for viability but creates a "cliff" at day 180 where revenue can feel like it drops.
- **Van sales halve to 40% when shops exist** (`vanScale = 0.4`). This is a sharp transition that can surprise players.
- **Reputation growth formula** (line 1418-1429): At rep 0, early game grants +0.625/day bonus. Actual growth: `min(0.5, daySold * 0.005 + locations * 0.005 + earlyBonus)`. Passive: +0.002/day after day 7. To reach rep 10 from 0 takes roughly 20-40 days with active selling.
- **Loyalty multiplier** adds up to 50% demand boost at max loyalty (100 points * 0.005 = +0.5). This is a powerful hidden variable.

### Revenue Scaling Summary (Monthly Estimates)

| Stage | Rep Range | Est. Monthly Revenue | Primary Channels |
|-------|:---------:|:--------------------:|:-----------------|
| Hustler | 0-10 | $25K - $50K | Van, 1 shop |
| Established | 10-25 | $50K - $150K | 1-2 shops, services |
| Growing Chain | 25-50 | $150K - $500K | 3-5 shops, wholesale, ecom |
| Empire | 50-75 | $500K - $2M+ | 5+ shops, wholesale, ecom, factory |
| Factory Mogul | 75+ | $1M - $5M+ | Factory wholesale dominates |

---

## 2. Cost Structure Audit

### 2.1 Shop Rent

| Item | Monthly | Daily (simDay) | Notes |
|------|--------:|---------------:|:------|
| Base shop rent (`SHOP_MO`) | $7,000 | $233/day | Per shop. Weekly=`SHOP_MO * city.cost / 4`, then `/30` daily |
| City cost multiplier | 1.0x - 1.15x+ | varies | Latrobe/Greensburg=1.0, Pittsburgh=1.15 |
| Example: Pittsburgh shop | $8,050/mo | $268/day | `7000 * 1.15` |

**Assessment:** Shop rent is a significant fixed cost early game. At $233/day base, a shop must sell ~2-3 tires/day just to cover rent. This is reasonable but tight for new players.

### 2.2 Staff Payroll

| Role | Monthly Salary | Daily Cost | Cap Impact |
|------|---------------:|-----------:|:-----------|
| Techs | $3,800 | $127/day | 12 tires/day install capacity |
| Sales | $3,000 | $100/day | 8 customers/day demand cap |
| Managers | $5,200 | $173/day | +15% to staff cap per manager |
| Drivers | $2,800 | $93/day | 40 tires/day warehouse-to-store movement |
| Pricing Analyst | $4,200 | $140/day | Market analysis |

**Corporate Staff:**

| Role | Monthly | Daily |
|------|--------:|------:|
| HR | $4,800 | $160 |
| Accountant | $5,500 | $183 |
| Operations | $6,200 | $207 |
| Regional Manager | $7,500 | $250 |

**E-commerce Staff:**

| Role | Monthly | Daily |
|------|--------:|------:|
| Web Developer | $7,500 | $250 |
| Senior Developer | $11,000 | $367 |
| SEO Specialist | $6,500 | $217 |
| Content Writer | $4,500 | $150 |
| Photographer | $4,000 | $133 |
| CS Rep | $3,500 | $117 |
| CS Manager | $5,500 | $183 |
| Data Analyst | $6,500 | $217 |

**Factory Staff:**

| Role | Monthly | Daily |
|------|--------:|------:|
| Line Worker | $3,200 | $107 | +10 daily capacity each |
| Quality Inspector | $4,500 | $150 | -2% defect rate each |
| R&D Engineer | $6,500 | $217 | Passive quality improvement |
| Factory Manager | $7,000 | $233 | +20% efficiency (max 1) |
| CFO | $8,000 | $267 | Blocks Vinnie 50% |

**Minimum viable payroll (1 shop):**
- 1 tech ($127) + 1 sales ($100) = **$227/day** ($6,810/mo)
- With shop rent (base city): $233 + $227 = **$460/day fixed cost**
- Need ~4-5 tire sales at average $105 just to break even on fixed costs

### 2.3 Storage Costs

| Storage Type | Capacity | Purchase | Monthly Rent | Daily Rent |
|:-------------|:--------:|---------:|-------------:|-----------:|
| Van | 20 | Free | $0 | $0 |
| Rented Garage | 80 | $1,200 | $350 | $12 |
| Small Lot | 150 | $2,500 | $600 | $20 |
| Storage Lot | 300 | $5,000 | $800 | $27 |
| Small Warehouse | 2,000 | $40,000 | $4,500 | $150 |
| Warehouse | 6,000 | $120,000 | $8,000 | $267 |
| Dist. Center | 18,000 | $350,000 | $15,000 | $500 |

Premium players get **50% off storage rent**.

**Cost per tire capacity per month:**

| Type | $/tire/month |
|:-----|:------------:|
| Van | $0 |
| Garage | $4.38 |
| Small Lot | $4.00 |
| Lot | $2.67 |
| Small WH | $2.25 |
| Warehouse | $1.33 |
| Dist. Center | $0.83 |

The scaling is well-designed -- larger storage is more cost-efficient per tire.

### 2.4 Loans

| Loan | Amount | Rate | Term (months) | Min Rep | Weekly Payment | Total Repaid |
|:-----|-------:|:----:|:-------------:|:-------:|---------------:|-------------:|
| Micro | $5,000 | 14% | 6 | 0 | $238 | $5,700 |
| Small Biz | $25,000 | 9.5% | 12 | 10 | $570 | $27,375 |
| SBA | $75,000 | 7% | 24 | 25 | $836 | $80,250 |
| Equipment | $150,000 | 6.5% | 36 | 35 | $1,042 | $159,750 |
| Commercial | $350,000 | 5.5% | 48 | 50 | $1,921 | $369,250 |
| Expansion | $750,000 | 5% | 60 | 65 | $3,281 | $787,500 |

*Weekly Payment = `amt * (1 + r) / (t * 4)`; daily = weekly / 7*

**Assessment:** Loan rates are realistic. The Micro loan at 14% is appropriate for the risk, while large loans at 5-6.5% reward progression. The dynamic `loanRateMult` (0.7x-1.0x based on aggregate deposits) adds interesting economy-wide feedback.

### 2.5 Factory Overhead

| Cost | Amount | Frequency | Daily |
|:-----|-------:|:---------:|------:|
| Factory overhead | $50,000 | Monthly | $1,667 |
| Factory staff (3 line, 1 insp, 1 eng, 1 mgr) | ~$27,400 | Monthly | $913 |
| CFO (optional) | $8,000 | Monthly | $267 |
| Rubber Farm ops | $500 | Daily | $500 |
| Synthetic Lab ops | $800 | Daily | $800 |
| **Total factory (typical L1)** | | | **~$2,580 - $4,147/day** |

The factory requires ~$77K-$124K/month just in operating costs before any production cost. At L1 with 50 daily capacity and $35-90 production cost per tire, plus overhead, the factory needs significant wholesale volume to be profitable.

### 2.6 Insurance

| Tier | Monthly | Daily | Covers |
|:-----|--------:|------:|:-------|
| Basic | $500 | $17 | Chargeback |
| Business | $1,500 | $50 | Chargeback, workers comp, recall, earthquake |
| Premium | $3,000 | $100 | All events + 10% replacement discount |

### 2.7 Other Monthly Costs

| Item | Monthly | Daily |
|:-----|--------:|------:|
| Distribution license | $12,000 | $400 |
| Installer listing fee (per installer) | $200 | $7 |
| Marketplace specialist | $3,500 | $117 |
| Flea market stand operation | $3,000/stand | $100/stand (weekend only = $100 * 3 days/wk) |
| Marketing: Flyers | $1,500 | $50 |
| Marketing: Radio | $6,000 | $200 |
| Marketing: Digital | $15,000 | $500 |

---

## 3. Tire Pricing Margins

### 3.1 Retail Tires -- Buy vs. Sell

Cost of goods is calculated as `(bMin + bMax) / 2` in the sim for profit tracking.

| Tire | Buy Min | Buy Max | Avg Cost | Default Sell | Min Sell | Max Sell | Margin @ Default | Margin % |
|:-----|--------:|--------:|---------:|-------------:|---------:|---------:|-----------------:|---------:|
| Used (Junk) | $1 | $5 | $3 | $15 | $5 | $25 | **$12** | 80% |
| Used (Poor) | $5 | $12 | $8.50 | $28 | $12 | $40 | **$19.50** | 70% |
| Used (Good) | $10 | $22 | $16 | $45 | $22 | $65 | **$29** | 64% |
| Used (Premium) | $18 | $35 | $26.50 | $65 | $35 | $95 | **$38.50** | 59% |
| All-Season | $45 | $72 | $58.50 | $105 | $75 | $150 | **$46.50** | 44% |
| Performance | $75 | $115 | $95 | $155 | $115 | $220 | **$60** | 39% |
| Winter/Snow | $65 | $100 | $82.50 | $140 | $100 | $195 | **$57.50** | 41% |
| Light Truck | $85 | $135 | $110 | $175 | $135 | $250 | **$65** | 37% |
| Commercial | $110 | $170 | $140 | $230 | $170 | $320 | **$90** | 39% |
| ATV/UTV | $35 | $60 | $47.50 | $90 | $60 | $130 | **$42.50** | 47% |
| Farm Implement | $50 | $90 | $70 | $125 | $85 | $180 | **$55** | 44% |
| Tractor/AG | $200 | $400 | $300 | $550 | $380 | $800 | **$250** | 45% |
| EV Tire | $95 | $155 | $125 | $195 | $140 | $280 | **$70** | 36% |
| Run-Flat | $80 | $130 | $105 | $170 | $120 | $250 | **$65** | 38% |
| Luxury Touring | $120 | $190 | $155 | $250 | $180 | $350 | **$95** | 38% |
| Premium All-Weather | $100 | $160 | $130 | $210 | $150 | $300 | **$80** | 38% |

### 3.2 Factory Production Margins

Factory tires are sold with a `brand_` prefix at player-set wholesale prices. Default wholesale price = `productionCost * 1.5`.

| Tire | Production Cost | Default WS Price | Raw Margin | Notes |
|:-----|----------------:|-----------------:|-----------:|:------|
| All-Season | $35 | $52.50 | **$17.50** (33%) | Cheapest to produce |
| Winter | $50 | $75 | **$25** (33%) | |
| Performance | $55 | $82.50 | **$27.50** (33%) | |
| Run-Flat | $60 | $90 | **$30** (33%) | |
| Light Truck | $65 | $97.50 | **$32.50** (33%) | |
| EV Tire | $70 | $105 | **$35** (33%) | |
| Commercial | $90 | $135 | **$45** (33%) | Highest margin/tire |

Production costs are further modified by:
- **Raw material index:** rubber (0.7-1.4x), steel (0.75-1.35x), chemicals (0.8-1.3x)
- **Volume discounts:** 100+ units = 10% off; 200+ = 20%; 300+ = 30%
- **Defect rate:** Base 15%, reduced by inspectors (-2% each), min 1%

### 3.3 Exclusive (R&D-Unlocked) Factory Tires

| Tire | Base Cost | Default Sell | Margin | R&D Cost | R&D Days |
|:-----|----------:|-------------:|-------:|---------:|---------:|
| EV Premium | $95 | $260 | **$165** (63%) | $1,000,000 | 60 |
| Commercial HD | $120 | $310 | **$190** (61%) | $1,200,000 | 60 |
| All-Terrain Elite | $85 | $220 | **$135** (61%) | $800,000 | 45 |

These are extremely high-margin products that justify the R&D investment.

### 3.4 Wholesale Pricing

Wholesale sales happen at `tire.def * (1 - margin)` where:
- Base margin: 3-8% (random per order)
- Volume bonus: +0-8% based on monthly purchase volume
- Relationship bonus: +0.5% per 30 days of relationship (capped at +5%)
- **Effective margin: 3% to 21% below default price**

This means wholesale revenue per tire is 79-97% of default price -- thin margins but high volume.

### 3.5 Channel Price Modifiers

| Channel | Price Modifier | Notes |
|:--------|:--------------:|:------|
| Retail shops | 100% of player price | Direct pricing control |
| Van sales | 100% of player price | Same pricing |
| Flea markets | **80%** of player price | `FLEA_PRICE_MULT = 0.80` |
| Car meets | 100% of player price (premium tires get meet bonus) | Weekend summer only |
| E-commerce | 100% - 2.8% payment fee - $14-28 shipping | Significant per-order cost |
| Wholesale | ~79-97% of default price | Volume-driven |
| Factory wholesale | Player-set price - shipping ($3-10/tire) | Best margins at scale |

### 3.6 Supplier Discounts on Buy Cost

| Supplier | Min Order | Discount | Contract Cost | Min Rep |
|:---------|:---------:|---------:|--------------:|:-------:|
| TireMax Express | 20 | 0% | $1,000 | 0 |
| NorthPoint | 50 | 4% | $3,000 | 15 |
| TireBridge | 100 | 7% | $8,000 | 30 |
| Pacific Rim | 250 | 13% | $20,000 | 45 |
| Summit Tire | 500 | 9% | $75,000 | 60 |
| AgriTrax (AG) | 15 | 10% | $2,500 | 10 |
| Heartland AG | 40 | 12% | $12,000 | 30 |

**Note:** Summit Tire at 9% discount is *worse* than Pacific Rim at 13%. This appears intentional (premium branding/reliability vs. raw savings) but should be documented or adjusted so players understand the trade-off.

---

## 4. TC (TireCoin) Economy

### 4.1 TC Sources (Inflows)

| Source | Amount | Frequency | Est. TC/Month |
|:-------|-------:|:---------:|:-------------:|
| Passive drip | 1 TC | Every 36 days | ~0.83 |
| Premium stipend | 50 TC | Every 30 days | 50 |
| Rewarded ads | 50 TC | Up to 3/day | 0 - 4,500 |
| Achievement: First Tire | 1 TC | Once | -- |
| Achievement: First Sale | 2 TC | Once | -- |
| Achievement: 10 Sales | 5 TC | Once | -- |
| Achievement: 100 Sales | 20 TC | Once | -- |
| Achievement: 1000 Sales | 100 TC | Once | -- |
| Achievement: $1K Rev | 5 TC | Once | -- |
| Achievement: $10K Rev | 10 TC | Once | -- |
| Achievement: $100K Rev | 30 TC | Once | -- |
| Achievement: $1M Rev | 200 TC | Once | -- |
| Achievement: First Shop | 5 TC | Once | -- |
| Achievement: 2 Shops | 10 TC | Once | -- |
| Achievement: 5 Shops | 40 TC | Once | -- |
| Achievement: First Hire | 5 TC | Once | -- |
| Achievement: Warehouse | 12 TC | Once | -- |
| Achievement: Rep 10 | 5 TC | Once | -- |
| Achievement: Rep 25 | 12 TC | Once | -- |
| Achievement: Rep 50 | 60 TC | Once | -- |
| Achievement: E-com | 10 TC | Once | -- |
| Achievement: Wholesale | 10 TC | Once | -- |
| Achievement: Road Warrior | 20 TC | Once | -- |
| Achievement: Van Life | 40 TC | Once | -- |
| Achievement: Flea King | 30 TC | Once | -- |
| Achievement: Car Meet Legend | 40 TC | Once | -- |
| Achievement: Summer Hustler | 60 TC | Once | -- |
| Achievement: Brand Builder | 5 TC | Once | -- |
| Achievement: First WS Order | 10 TC | Once | -- |
| Achievement: 100 Orders | 25 TC | Once | -- |
| Achievement: Quality 95% | 20 TC | Once | -- |
| Achievement: Certified | 15 TC | Once | -- |
| Achievement: $1M Factory Rev | 50 TC | Once | -- |
| Achievement: Vinnie's Victim | 10 TC | Once | -- |
| Milestone: weekSurvived | 5 TC | Per week | 20 |
| Milestone: shopOpened | 50 TC | Per shop | -- |
| Milestone: firstWarehouse | 100 TC | Once | -- |
| Milestone: acquisitionComplete | 75 TC | Per acquisition | -- |
| Milestone: $100K rev target | 200 TC | Once | -- |
| Milestone: $1M rev target | 500 TC | Once | -- |
| Milestone: wholesaleClientSigned | 25 TC | Per client | -- |
| Milestone: tpoContractSigned | 40 TC | Per contract | -- |
| Milestone: ecomLaunched | 150 TC | Once | -- |
| Milestone: distributorUnlocked | 300 TC | Once | -- |
| Milestone: marketplaceLaunched | 30 TC | Per channel | -- |
| Milestone: liquidationBought | 20 TC | Per event | -- |
| Milestone: liquidationSold | 35 TC | Per event | -- |
| Milestone: installerRecruited | 25 TC | Per installer | -- |
| Milestone: becameInstaller | 40 TC | Once | -- |

**Total one-time achievement TC: ~755 TC**
**Total one-time milestone TC (conservative): ~1,640 TC**
**Recurring TC (free player): ~21/month (20 weekly survival + ~1 passive)**
**Recurring TC (premium): ~71/month (20 weekly + 50 stipend + ~1 passive)**
**Recurring TC (ad-heavy): ~4,521/month maximum**

### 4.2 TC Sinks (Outflows)

| Sink | Cost | Notes |
|:-----|-----:|:------|
| Instant Retread | 30 TC/tire | Skip 3-day wait |
| Market Intel | 100 TC | 7-day heat map |
| TC Storage Upgrade L1 | 100 TC | +250 cap |
| TC Storage Upgrade L2 | 250 TC | +500 cap |
| TC Storage Upgrade L3 | 500 TC | +1,000 cap |
| TC Storage Upgrade L4 | 1,000 TC | +2,000 cap |
| TC Storage Upgrade L5 | 2,000 TC | +3,000 cap |
| Cosmetic: Celebration | 100 TC | Permanent |
| Cosmetic: Premium Van | 150 TC | Permanent |
| Cosmetic: VIP Dashboard | 200 TC | Permanent |
| Cosmetic: Neon Sign | 300 TC | Permanent |
| Cosmetic: Elite Border | 400 TC | Permanent |
| Cosmetic: Gold Name | 500 TC | Permanent |
| Rubber Farm purchase | 2,000 TC | One-time |
| Rubber Farm L2 upgrade | 500 TC | One-time |
| Rubber Farm L3 upgrade | 1,000 TC | One-time |
| Synthetic Lab purchase | 1,500 TC | One-time |
| Synthetic Lab L2 upgrade | 750 TC | One-time |
| Synthetic Lab L3 upgrade | 1,500 TC | One-time |

**Total cosmetics sink: 1,650 TC**
**Total storage upgrades: 3,850 TC**
**Total farm/lab (all levels): 7,250 TC**

### 4.3 TC Storage Caps

| Status | Base | Upgrades Available | Max Cap |
|:-------|:----:|:------------------:|:-------:|
| Free player | 500 | +250, +500, +1000, +2000, +3000 | **7,250** |
| Premium player | 2,000 (500+1500) | Same | **8,750** |

### 4.4 TC Economy Analysis

**For free players:**
- Earning rate: ~21 TC/month recurring + one-time achievements
- Time to buy Rubber Farm (2,000 TC): ~95 months of passive play, or ~2-3 months with aggressive achievements
- The passive drip of 1 TC / 36 days is essentially meaningless (10/year)
- The 5 TC/week survival reward is the primary recurring source

**For ad-watching players:**
- 50 TC per ad, 3/day = 150 TC/day = 4,500 TC/month
- This **completely dwarfs** all other sources combined
- A player watching 3 ads/day for 2 weeks can buy the Rubber Farm
- This creates a massive gap between ad-watchers and non-ad-watchers

**For premium players:**
- 50 TC/month stipend + 20 TC/week = ~70 TC/month
- Still slow compared to ad revenue
- Premium advantage is the +1,500 cap bonus and 50% storage discount, not TC velocity

**Value stability concern:**
- TC has no exchange rate to cash -- it is a pure utility token
- All prices are static (no inflation/deflation mechanism for TC costs)
- The bank interest rate's `tcScarcityBonus` attempts to tie TC to the broader economy: fewer TC in circulation = higher savings rates (max +2%)
- However, since TC sinks are mostly one-time purchases, long-term players accumulate TC with nothing to spend on, hitting the cap

---

## 5. Recommendations for Constant Adjustments

### 5.1 CRITICAL: Early-to-Mid Game Cash Flow

**Problem:** The transition from van-only to first shop is punishing. Opening a shop costs $137,500 and immediately adds ~$460/day in fixed costs (rent + min staff). At rep 0-5, a single shop may only generate $800-$1,200/day in revenue, leaving a very thin margin of $340-$740/day before COGS.

**Recommendation:**
- **Reduce `SHOP_MO` from $7,000 to $5,500** for the first 90 days of shop ownership (introductory rent). This lowers the daily break-even by ~$50/day.
- Alternatively, add a `firstShopDiscount: 0.25` constant that reduces rent by 25% for a player's first shop during its first 90 days.

### 5.2 Day-180 Cliff

**Problem:** The `earlyBoostShop` drops from 2x at day 1 to 1x at day 180 linearly. Combined with the van `earlyBoost` following the same curve, players can experience a sudden revenue drop around days 150-200.

**Recommendation:**
- Extend the taper to **270 days** (`1 + (270 - day) / 270`) so the decline is gentler.
- Or make the boost decay logarithmically: `1 + Math.max(0, Math.log(270 - day) / Math.log(270))` for a smoother curve.

### 5.3 Staff Capacity Bottleneck

**Problem:** `salesCap = sales * 8` is much more restrictive than `techCap = techs * 12`. A 2-tech/2-sales setup yields min(24, 16) = 16, meaning sales staff is always the bottleneck. Players may not realize this.

**Recommendation:**
- Either **increase sales capacity to 10/day** (making the roles more balanced), or
- Add a tooltip/log hint: "Your sales staff are turning away customers -- hire more salespeople."
- Consider: `salesCap = sales * 10` would make 2-tech/2-sales yield min(24, 20) = 20, a 25% improvement.

### 5.4 Van-to-Shop Transition

**Problem:** `vanScale = 0.4` when shops exist is a sharp binary drop. A player who opens one small shop immediately loses 60% of van revenue.

**Recommendation:**
- Grade it by location count: `vanScale = Math.max(0.2, 1 - locations.length * 0.2)`. This gives:
  - 0 shops: 1.0x
  - 1 shop: 0.8x
  - 2 shops: 0.6x
  - 3 shops: 0.4x
  - 4+ shops: 0.2x

### 5.5 TC Passive Drip is Negligible

**Problem:** 1 TC every 36 days (10/year) is so low it may as well not exist. It does not meaningfully contribute to player progression.

**Recommendation:**
- **Increase passive drip to 1 TC every 7 days** (52/year), matching the weekly survival bonus model, OR
- Remove the passive drip entirely and rely on the weekSurvived milestone (5 TC/week) as the baseline. This is cleaner.

### 5.6 TC Ad Reward Dominance

**Problem:** At 50 TC per ad * 3/day, rewarded ads provide ~4,500 TC/month. This is 60x the premium stipend (70 TC/month) and 214x the free passive rate (21 TC/month). This creates extreme stratification.

**Recommendation:**
- **Reduce `adRewardTC` from 50 to 25** (still significant at 2,250 TC/month), OR
- **Increase `maxRewardedPerDay` to 5 but reduce per-ad to 15 TC** (2,250 TC/month), giving more engagement touchpoints with a less overwhelming reward, OR
- **Implement diminishing returns:** 1st ad = 50 TC, 2nd = 30 TC, 3rd = 15 TC (95 TC/day = 2,850/month). This keeps the first ad highly rewarding while reducing the total gap.

### 5.7 Wholesale Margin Structure

**Problem:** Wholesale margin formula `price = tire.def * (1 - margin)` where margin ranges from 3-21% means players earn 79-97% of the default price. With COGS at ~56% of default (avg cost / default price), wholesale margins are healthy. However, the wholesale client system generates clients at `rep / 10` max, meaning at rep 30 (the minimum to unlock wholesale), a player can only have 3 clients. This is very slow.

**Recommendation:**
- Change client cap formula to `Math.floor(reputation / 8)` to allow 4 clients at unlock, scaling to ~12 at rep 100.
- Or add a bonus from the warehouse size: `Math.floor(rep / 10) + Math.floor(warehouseCapacity / 5000)`.

### 5.8 Factory Break-Even Point

**Problem:** The factory requires rep 75 and costs $5M to build. Monthly overhead is $50K + staff (~$27K+) = $77K minimum. At L1 with 50 tires/day and average production cost $55, a single day produces $2,750 in COGS. If sold at 1.5x, that is $4,125/day gross. After overhead ($1,667/day), daily factory net is ~$2,458. Monthly net: ~$74K. At $5M build cost, **payback period is ~68 months (5.7 years)** of in-game time.

**Recommendation:**
- Either **reduce `buildCost` to $3,500,000** (payback ~47 months), or
- **Increase L1 `dailyCapacity` from 50 to 80** (payback ~42 months), or
- **Reduce `monthlyOverhead` from $50,000 to $35,000** (payback ~53 months).
- The combination of 2+ of these would bring payback to a more engaging ~30-40 months.

### 5.9 Summit Tire Direct Discount Anomaly

**Problem:** Summit Tire Direct requires 500 min order, rep 60, and $75,000 contract but only offers 9% discount. Pacific Rim at 250 min order, rep 45, and $20,000 contract offers 13%.

**Recommendation:**
- **Increase Summit discount to 15-17%** to justify its dramatically higher barrier to entry, OR
- Add a unique benefit (e.g., `exclusiveTires: true` or `fasterDelivery: 1`) to differentiate it beyond raw discount.

### 5.10 Service Revenue Scaling

**Problem:** Service revenue formula is `locations * (0.6 + rep * 0.03) * seasonDemand`. At 1 location and rep 10, that is `1 * (0.6 + 0.3) = 0.9` base demand, split across 4 service types at ~15-25% each. This yields roughly 0-1 jobs per service per day. With prices $10-35 per job, daily service revenue is only $10-50 -- nearly negligible.

**Recommendation:**
- **Increase the base constant from 0.6 to 1.2** to double the service demand baseline. This would make services a more meaningful revenue stream (~$20-100/day at a single location, rep 10).
- Consider adding a `serviceReputationBoost: 0.05` to the rep coefficient (from 0.03 to 0.05) so mid-game players see services become a real income source.

### 5.11 TC Sink Exhaustion (Late Game)

**Problem:** Once a player has all cosmetics (1,650 TC), max storage upgrades (3,850 TC), and all farm/lab upgrades (7,250 TC), total one-time sinks are ~12,750 TC. After that, the only recurring sinks are Instant Retread (30 TC) and Market Intel (100 TC). Late-game players will hit the TC cap and have nothing meaningful to spend on.

**Recommendation:**
- Add **repeatable TC sinks:**
  - "Rush Order" -- pay 75 TC to double factory production speed for 1 batch
  - "VIP Client Referral" -- pay 150 TC to guarantee a new wholesale client
  - "Premium Inventory Slot" -- pay 50 TC/week for +500 temporary storage capacity
  - "Reputation Boost Event" -- pay 200 TC for +2 reputation instantly
- Alternatively, add a **TC-to-Cash exchange** at a poor rate (e.g., 1 TC = $50-100 cash) as a floor sink.

### 5.12 Insurance Tier Gap

**Problem:** The jump from Basic ($500/mo, covers 1 event) to Business ($1,500/mo, covers 4 events) is 3x cost. Premium at $3,000/mo adds 4 more events + 10% replacement discount. Business insurance is the clear "value" pick, making Basic nearly useless once a player can afford $1,500/mo.

**Recommendation:**
- Either **add a mid-tier** at $1,000/mo covering chargeback + workersComp, or
- **Increase Basic coverage** to include workersComp (the two most common events).

---

## Summary of Priority Adjustments

| Priority | Change | Impact |
|:--------:|:-------|:-------|
| **P0** | Smooth the day-180 early boost cliff | Prevents revenue shock |
| **P0** | Grade van-to-shop transition (not binary) | Smoother progression |
| **P1** | Increase sales staff capacity (8 -> 10/day) | Reduces unintuitive bottleneck |
| **P1** | Reduce ad reward TC (50 -> 25) or add diminishing returns | TC economy balance |
| **P1** | Add repeatable late-game TC sinks | Prevents TC stagnation |
| **P2** | Reduce first-shop rent or add introductory discount | Eases early game |
| **P2** | Fix Summit Tire discount (9% -> 15-17%) | Corrects progression incentive |
| **P2** | Increase service revenue base (0.6 -> 1.2) | Diversifies income |
| **P3** | Reduce factory build cost or increase L1 capacity | Faster factory ROI |
| **P3** | Increase wholesale client cap formula | More wholesale engagement |
| **P3** | Add mid-tier insurance option | Smoother insurance progression |
| **P3** | Remove or increase passive TC drip | Clean up negligible mechanic |
