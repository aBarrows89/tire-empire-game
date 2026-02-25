import React from 'react';
import { useGame } from '../context/GameContext.jsx';
import { VINNIE_TIPS } from '@shared/constants/vinnieTips.js';
import { getCap, getInv } from '@shared/helpers/inventory.js';
import { getCalendar } from '@shared/helpers/calendar.js';

function collectMatchingTips(g) {
  const inv = getInv(g);
  const cap = getCap(g);
  const tips = [];

  if (inv === 0) {
    const t = VINNIE_TIPS.find(t => t.condKey === 'noTires');
    if (t) tips.push(t);
  }
  if (g.cash < 0) {
    const t = VINNIE_TIPS.find(t => t.condKey === 'cashNeg');
    if (t) tips.push(t);
  }
  if (g.cash < 100 && inv < 3) {
    const t = VINNIE_TIPS.find(t => t.condKey === 'lowCash');
    if (t) tips.push(t);
  }
  if (inv >= cap - 2 && cap > 0) {
    const t = VINNIE_TIPS.find(t => t.condKey === 'storFull');
    if (t) tips.push(t);
  }
  if (inv < 5 && cap > 20) {
    const t = VINNIE_TIPS.find(t => t.condKey === 'storEmpty');
    if (t) tips.push(t);
  }
  if ((g.daySold || g.weekSold || 0) === 0 && inv > 0) {
    const t = VINNIE_TIPS.find(t => t.condKey === 'noSales');
    if (t) tips.push(t);
  }
  if ((g.daySold || g.weekSold || 0) > 0 && (g.day || g.week || 1) < 5) {
    const t = VINNIE_TIPS.find(t => t.condKey === 'firstSale');
    if (t) tips.push(t);
  }
  if ((g.inventory?.used_junk || 0) > 15) {
    const t = VINNIE_TIPS.find(t => t.condKey === 'junkHeavy');
    if (t) tips.push(t);
  }
  if (g.cash >= 137500 && g.locations.length === 0) {
    const t = VINNIE_TIPS.find(t => t.condKey === 'canShop');
    if (t) tips.push(t);
  }
  if (g.locations.length > 0 && g.staff.techs === 0) {
    const t = VINNIE_TIPS.find(t => t.condKey === 'hasShop');
    if (t) tips.push(t);
  }
  if (g.locations.length > 0 && (g.staff.techs + g.staff.sales) < 2) {
    const t = VINNIE_TIPS.find(t => t.condKey === 'noStaff');
    if (t) tips.push(t);
  }
  if (g.cash > 50000 && g.locations.length === 0) {
    const t = VINNIE_TIPS.find(t => t.condKey === 'highCash');
    if (t) tips.push(t);
  }
  if (g.reputation < 5) {
    const t = VINNIE_TIPS.find(t => t.condKey === 'repLow');
    if (t) tips.push(t);
  }
  if (g.reputation >= 15 && g.locations.length === 0) {
    const t = VINNIE_TIPS.find(t => t.condKey === 'repMid');
    if (t) tips.push(t);
  }
  if ((g.loans || []).length > 2) {
    const t = VINNIE_TIPS.find(t => t.condKey === 'loanHeavy');
    if (t) tips.push(t);
  }

  // New contextual conditions
  // overstockedJunk: junk tires > 50% of inventory
  const junkCount = (g.inventory?.used_junk || 0) + (g.warehouseInventory?.used_junk || 0);
  if (inv > 0 && junkCount > inv * 0.5) {
    tips.push({ condKey: 'overstockedJunk', tip: "Lots of junk tires sitting around. Ever thought about retreading them?" });
  }

  // winterComing: month approaching winter (Oct-Nov)
  const day = g.day || g.week || 1;
  const cal = getCalendar(day);
  if (cal.monthName === 'October' || cal.monthName === 'November') {
    tips.push({ condKey: 'winterComing', tip: "Winter's coming! Stock up on winter tires \u2014 prices go up." });
  }

  // summerComing: month approaching summer (Mar-Apr)
  if (cal.monthName === 'March' || cal.monthName === 'April') {
    tips.push({ condKey: 'summerComing', tip: "Summer driving season ahead. All-season and performance tires will be hot." });
  }

  // profitNegative: dayProfit < 0
  if ((g.dayProfit || 0) < 0) {
    tips.push({ condKey: 'profitNegative', tip: "Ouch, we lost money today. Check your prices \u2014 might be selling below cost." });
  }

  // cashRich: cash > 100000
  if (g.cash > 100000) {
    tips.push({ condKey: 'cashRich', tip: "Sitting on a lot of cash! Maybe open a new location or invest in marketing." });
  }

  // Holiday awareness
  if (cal.monthName === 'November') {
    tips.push({ condKey: 'blackFriday', tip: "Black Friday is coming! Demand will spike 3x \u2014 stock up now and raise prices." });
  }
  if (cal.monthName === 'December') {
    tips.push({ condKey: 'christmas', tip: "Christmas week is slow. Use this time to retread tires and restock." });
  }

  // Multi-shop tip
  if (g.locations.length === 1 && g.cash > 100000) {
    tips.push({ condKey: 'multiShop', tip: "One shop is a start. Two shops doubles your empire. Look at cities with low competition!" });
  }

  // Loan awareness
  if ((g.loans || []).length > 0 && g.cash > 50000) {
    tips.push({ condKey: 'payLoan', tip: "Got spare cash? Paying off loans early saves interest and boosts your reputation." });
  }

  // Negative cash warning
  if (g.cash < -5000) {
    tips.push({ condKey: 'deepDebt', tip: "Deep in the red! Sell some inventory, cut staff, or use TireCoins for a Vinnie bailout." });
  }

  // Contract opportunity
  if (g.reputation >= 15 && !(g.govContracts || []).length && g.locations.length > 0) {
    tips.push({ condKey: 'govContract', tip: "Your reputation is solid! Check Shops for government contracts \u2014 steady guaranteed revenue." });
  }

  // Fallback
  if (tips.length === 0) {
    const t = VINNIE_TIPS.find(t => t.condKey === 'default');
    if (t) tips.push(t);
  }

  return tips;
}

export default function VinnieTip() {
  const { state } = useGame();
  const g = state.game;
  if (!g) return null;

  const tips = collectMatchingTips(g);
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
