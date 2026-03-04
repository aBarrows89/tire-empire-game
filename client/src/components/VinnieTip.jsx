import React from 'react';
import { useGame } from '../context/GameContext.jsx';
import { VINNIE_TIPS } from '@shared/constants/vinnieTips.js';
import { getCap, getInv } from '@shared/helpers/inventory.js';
import { getCalendar } from '@shared/helpers/calendar.js';

/**
 * Build a lookup map from VINNIE_TIPS for fast access by condKey.
 * Multiple tips can share a condKey — we collect all of them.
 */
const tipsByKey = {};
for (const t of VINNIE_TIPS) {
  if (!tipsByKey[t.condKey]) tipsByKey[t.condKey] = [];
  tipsByKey[t.condKey].push(t);
}

/** Push all tips matching a condKey into the results array. */
function pushTip(tips, key) {
  const arr = tipsByKey[key];
  if (arr) {
    for (const t of arr) tips.push(t);
  }
}

function collectMatchingTips(g, stateGlobalEvents) {
  const inv = getInv(g);
  const cap = getCap(g);
  const tips = [];
  const playerDay = g.day || g.week || 1;
  const day = (g.startDay || 1) + playerDay - 1;
  const cal = getCalendar(day);
  const locCount = (g.locations || []).length;
  const totalStaff = (g.staff?.techs || 0) + (g.staff?.sales || 0) + (g.staff?.managers || 0);
  const loanCount = (g.loans || []).length;
  const dayOfYear = cal.dayOfYear || (day % 360) || 1;
  const junkCount = (g.inventory?.used_junk || 0) + (g.warehouseInventory?.used_junk || 0);
  const sold = g.daySold || g.weekSold || 0;

  // ─── BOOTSTRAP (day 1-30, no shops) ───
  if (day <= 30 && locCount === 0) {
    if (inv === 0) pushTip(tips, 'noTires');
    if (g.cash < 100) pushTip(tips, 'lowCash');
    if (sold > 0 && day < 10) pushTip(tips, 'firstSale');
    if (g.reputation < 5) pushTip(tips, 'repLow');
    if (inv > 0 && g.cash < 500) pushTip(tips, 'vanLife');
    if (day < 10) pushTip(tips, 'scrappyStart');
    if (junkCount > 0 && g.cash < 300) pushTip(tips, 'garageGold');
    if (inv > 3 && sold === 0) pushTip(tips, 'pricingBasics');
    if (day > 5 && day < 20) pushTip(tips, 'cashflow101');
    if (g.cash >= 1000 && g.cash < 5000) pushTip(tips, 'firstGrand');
  }

  // ─── FIRST SHOP (1 location) ───
  if (locCount === 1) {
    if ((g.staff?.techs || 0) === 0) pushTip(tips, 'hasShop');
    if (totalStaff < 2) pushTip(tips, 'noStaff');
    if (inv < 10 && cap > 20) pushTip(tips, 'shopStocking');
    if ((g.staff?.techs || 0) > 0 && !g.weekServiceRev) pushTip(tips, 'serviceMoney');
    if (g.reputation >= 8 && g.reputation < 20) pushTip(tips, 'loyaltyTip');
    if (g.reputation >= 3 && g.reputation < 12) pushTip(tips, 'marketingIntro');
    if (g.reputation >= 10 && (g.unlockedSuppliers || []).length > 0) pushTip(tips, 'supplierUnlock');
    if (g.cash < 5000 && totalStaff >= 3) pushTip(tips, 'shopRentWarning');
    if (sold > 0 && (g.staff?.techs || 0) > 0) pushTip(tips, 'takeoffGold');
    if (g.cash > 10000 && (g.bankBalance || 0) === 0) pushTip(tips, 'bankDeposit');
  }

  // ─── GROWTH (2-4 shops) ───
  if (locCount >= 2 && locCount <= 4) {
    if (locCount === 1 && g.cash > 100000) pushTip(tips, 'multiShop'); // won't fire here, but kept for logic
    if (g.cash >= 137500) pushTip(tips, 'canShop');
    if (g.cash > 50000) pushTip(tips, 'highCash');
    if (g.reputation >= 15) pushTip(tips, 'repMid');
    if (locCount >= 2) pushTip(tips, 'autoPricing');
    if (locCount >= 2) pushTip(tips, 'transferTip');
    if (g.cash >= 50000 && loanCount < 2) pushTip(tips, 'loanStrategy');
    // Seasonal prep during shoulder months
    if (cal.monthName === 'September' || cal.monthName === 'March') pushTip(tips, 'seasonalPrep');
    if (g.cash >= 100000) pushTip(tips, 'cityPicking');
    if (totalStaff > locCount * 4) pushTip(tips, 'staffBalance');
    if (g.cash > 20000 && locCount >= 3) pushTip(tips, 'insuranceTip');
  }

  // ─── EMPIRE (5+ shops) ───
  if (locCount >= 5) {
    if (!g.hasWholesale) pushTip(tips, 'wholesaleReady');
    if (!g.hasEcom && g.reputation >= 20) pushTip(tips, 'ecomReady');
    if (g.reputation >= 15 && !(g.govContracts || []).length) pushTip(tips, 'govContract');
    if (!g.hasFactory && g.cash > 500000) pushTip(tips, 'factoryDream');
    if (locCount >= 6) pushTip(tips, 'diversify');
    if (g.reputation >= 40) pushTip(tips, 'brandPower');
    if (g.cash > 100000) pushTip(tips, 'cashRich');
    if (junkCount > 20 && !g.hasFactory) pushTip(tips, 'retreadBiz');
    if (g.reputation >= 30 && g.cash > 200000) pushTip(tips, 'importGame');
  }

  // ─── FACTORY ───
  if (g.hasFactory && g.factory) {
    const factoryStaffCount = Object.values(g.factory.staff || {}).reduce((a, b) => a + b, 0);
    if ((g.factory.productionQueue || []).length === 0) pushTip(tips, 'factoryFirst');
    if (factoryStaffCount < 3) pushTip(tips, 'factoryStaff');
    if (g.reputation >= 25) pushTip(tips, 'factoryBrand');
    if ((g.factory.level || 1) < 3) pushTip(tips, 'factoryUpgrade');
    if ((g.factory.level || 1) >= 2 && g.reputation >= 35) pushTip(tips, 'factoryExport');
    if (g.hasWholesale && g.factory.isDistributor) pushTip(tips, 'factoryWholesale');
    if ((g.factory.brandReputation || 0) >= 50) pushTip(tips, 'factoryBrandRep50');
    if ((g.factory.vinnieTotalLoss || 0) > 0) pushTip(tips, 'factoryVinnieLoss');
    if ((g.factory.rdProjects || []).length > 0) pushTip(tips, 'factoryRD');
  }

  // ─── SEASONAL (calendar-based) ───
  // Winter approaching: Oct-Nov (dayOfYear ~271-330 in 360-day calendar)
  if (cal.monthName === 'October' || cal.monthName === 'November') {
    pushTip(tips, 'winterComing');
  }
  // Summer approaching: Mar-Apr (dayOfYear ~61-120)
  if (cal.monthName === 'March' || cal.monthName === 'April') {
    pushTip(tips, 'summerComing');
  }
  // Black Friday: November
  if (cal.monthName === 'November') {
    pushTip(tips, 'blackFriday');
  }
  // Christmas: December
  if (cal.monthName === 'December') {
    pushTip(tips, 'christmas');
  }

  // ─── SITUATIONAL (reactive to current state) ───
  if ((g.dayProfit || g.weekProfit || 0) < 0) pushTip(tips, 'profitNegative');
  if (loanCount > 0 && g.cash > 50000) pushTip(tips, 'payLoan');
  if (g.cash < -5000) pushTip(tips, 'deepDebt');
  if (loanCount > 2) pushTip(tips, 'loanHeavy');
  if (cap > 0 && inv >= cap - 2) pushTip(tips, 'storFull');
  if (inv < 5 && cap > 20) pushTip(tips, 'storEmpty');
  if (junkCount > 15) pushTip(tips, 'junkHeavy');
  if (g.cash < 0) pushTip(tips, 'cashNeg');
  if (inv > 10 && sold === 0 && day > 7) pushTip(tips, 'overpriced');
  if (sold === 0 && inv > 0) pushTip(tips, 'noSales');

  // ─── GLOBAL MARKET EVENTS ───
  const globalEvents = stateGlobalEvents || [];
  const geIds = new Set(globalEvents.map(e => e.id));

  if (geIds.has('rubber_shortage')) pushTip(tips, 'geRubberShortage');
  if (geIds.has('port_strike')) pushTip(tips, 'gePortStrike');
  if (geIds.has('winter_storm')) pushTip(tips, 'geWinterStorm');
  if (geIds.has('economic_boom')) pushTip(tips, 'geEconomicBoom');
  if (geIds.has('steel_surplus')) pushTip(tips, 'geSteelSurplus');
  if (geIds.has('safety_recall')) pushTip(tips, 'geSafetyRecall');
  if (geIds.has('ev_mandate')) pushTip(tips, 'geEvMandate');
  if (geIds.has('holiday_rush')) pushTip(tips, 'geHolidayRush');
  if (geIds.size > 0) pushTip(tips, 'geGeneral');

  // ─── TC ECONOMY & STORAGE ───
  const tcCurrent = g.tireCoins || 0;
  const tcLevel = g.tcStorageLevel || 0;
  // Simple cap calculation (mirroring MONET.tcStorage constants)
  const tcBaseCap = 500;
  const tcPremiumBonus = g.isPremium ? 1500 : 0;
  const tcUpgradeCaps = [250, 500, 1000, 2000, 3000];
  let tcCap = tcBaseCap + tcPremiumBonus;
  for (let i = 0; i < tcLevel && i < tcUpgradeCaps.length; i++) tcCap += tcUpgradeCaps[i];

  if (tcCurrent >= tcCap) pushTip(tips, 'tcStorageFull');
  else if (tcCap > 0 && tcCurrent / tcCap >= 0.85) pushTip(tips, 'tcStorageAlmostFull');
  const tcUpgradeCosts = [100, 250, 500, 1000, 2000];
  if (tcLevel < 5 && tcCurrent >= (tcUpgradeCosts[tcLevel] || 9999)) pushTip(tips, 'tcUpgradeAvailable');
  // TC value awareness (requires tick data — we don't have it in g, so check for high TC balance scenarios)
  if (tcCurrent > 300) pushTip(tips, 'tcValueVolatile');

  // ─── TIRE ATTRIBUTES & SUPPLY CHAIN ───
  if (g.hasFactory && g.factory) {
    const farm = g.factory.rubberFarm;
    const lab = g.factory.syntheticLab;
    const rubberSupply = g.factory.rubberSupply || 0;

    if (!farm && !lab) pushTip(tips, 'noSupplyChain');
    if (!farm && (tcCurrent >= 2000 || g.cash > 500000)) pushTip(tips, 'rubberFarmReady');
    if (farm && !lab) pushTip(tips, 'rubberFarmActive');
    if (!lab && (tcCurrent >= 1500 || g.cash > 300000)) pushTip(tips, 'syntheticLabReady');
    if (lab && !farm) pushTip(tips, 'syntheticLabActive');
    if (farm && lab) pushTip(tips, 'supplyChainDiversified');
    if (rubberSupply > 50) pushTip(tips, 'rubberSurplus');

    // Tire attribute quality hints
    const qr = g.factory.qualityRating || 0.80;
    const rdDone = (g.factory.unlockedSpecials || []).length;
    const certsDone = (g.factory.certifications || []).filter(c => c.earned).length;
    if (qr < 0.90 && rdDone === 0) pushTip(tips, 'tireAttrsLow');
    if (qr >= 0.95 && (rdDone >= 2 || certsDone >= 2)) pushTip(tips, 'tireAttrsHigh');
  }

  // ─── STOCK EXCHANGE / INVESTMENTS ───
  const se = g.stockExchange || {};
  if (!se.hasBrokerage && g.reputation >= 10 && locCount >= 1) {
    pushTip(tips, 'exchangeReady');
  }
  if (se.hasBrokerage) {
    const portSize = Object.keys(se.portfolio || {}).length;
    const portfolioVal = Object.values(se.portfolio || {}).reduce((a, h) => a + h.qty * (h.avgCost || 0), 0);

    if (portSize === 0) pushTip(tips, 'exchangeNewbie');
    if (!se.isPublic && g.reputation >= 40 && locCount >= 3) pushTip(tips, 'exchangeIPOReady');
    if (se.isPublic && portSize < 3) pushTip(tips, 'exchangeIPO');
    if ((se.dividendIncome || 0) > 0) pushTip(tips, 'exchangeDividends');
    if (portSize >= 1 && portSize < 3) pushTip(tips, 'exchangePortfolio');
    if (portSize >= 1 && portfolioVal < 50000) pushTip(tips, 'exchangeRisk');
    if (portfolioVal > 100000) pushTip(tips, 'exchangeStable');
    if (se.marginEnabled && (se.marginDebt || 0) > 0) pushTip(tips, 'exchangeMargin');
    if (se.shortSellingEnabled) pushTip(tips, 'exchangeShort');
    if (portfolioVal > 500000) pushTip(tips, 'exchangeWealthTax');
    if ((se.brokerageFeePaid || 0) > 0 && portfolioVal < 10000) pushTip(tips, 'exchangeBrokerageFee');
    if ((g.tireCoins || 0) >= 1000) pushTip(tips, 'exchangeScratchTicket');
    if ((g.tireCoins || 0) >= 200 && portSize >= 1) pushTip(tips, 'exchangeVinnieTip');
  }

  // ─── DEFAULTS (multiple fallbacks for variety) ───
  if (tips.length === 0) {
    pushTip(tips, 'default');
    pushTip(tips, 'defaultB');
    pushTip(tips, 'defaultC');
    pushTip(tips, 'defaultD');
    pushTip(tips, 'defaultE');
  }

  return tips;
}

export default function VinnieTip() {
  const { state } = useGame();
  const g = state.game;
  if (!g) return null;

  const tips = collectMatchingTips(g, state.globalEvents);
  if (!tips || tips.length === 0) return null;

  // Rotate tips based on day for variety
  const dayNum = g.day || g.week || 1;
  const tip = tips[dayNum % tips.length];

  return (
    <div className="vinnie-tip">
      <span className="vinnie-tip-icon">{"\u{1F9D4}"}</span>
      <span className="vinnie-tip-text">{tip.tip}</span>
    </div>
  );
}
