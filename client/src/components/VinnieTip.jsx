import React from 'react';
import { useGame } from '../context/GameContext.jsx';
import { VINNIE_TIPS } from '@shared/constants/vinnieTips.js';
import { getCap, getInv } from '@shared/helpers/inventory.js';

function evaluateTip(g) {
  const inv = getInv(g);
  const cap = getCap(g);

  if (inv === 0) return VINNIE_TIPS.find(t => t.condKey === 'noTires');
  if (g.cash < 0) return VINNIE_TIPS.find(t => t.condKey === 'cashNeg');
  if (g.cash < 100 && inv < 3) return VINNIE_TIPS.find(t => t.condKey === 'lowCash');
  if (inv >= cap - 2 && cap > 0) return VINNIE_TIPS.find(t => t.condKey === 'storFull');
  if (inv < 5 && cap > 20) return VINNIE_TIPS.find(t => t.condKey === 'storEmpty');
  if (g.weekSold === 0 && inv > 0) return VINNIE_TIPS.find(t => t.condKey === 'noSales');
  if (g.weekSold > 0 && g.week < 5) return VINNIE_TIPS.find(t => t.condKey === 'firstSale');
  if ((g.inventory?.used_junk || 0) > 15) return VINNIE_TIPS.find(t => t.condKey === 'junkHeavy');
  if (g.cash >= 137500 && g.locations.length === 0) return VINNIE_TIPS.find(t => t.condKey === 'canShop');
  if (g.locations.length > 0 && g.staff.techs === 0) return VINNIE_TIPS.find(t => t.condKey === 'hasShop');
  if (g.locations.length > 0 && (g.staff.techs + g.staff.sales) < 2) return VINNIE_TIPS.find(t => t.condKey === 'noStaff');
  if (g.cash > 50000 && g.locations.length === 0) return VINNIE_TIPS.find(t => t.condKey === 'highCash');
  if (g.reputation < 5) return VINNIE_TIPS.find(t => t.condKey === 'repLow');
  if (g.reputation >= 15 && g.locations.length === 0) return VINNIE_TIPS.find(t => t.condKey === 'repMid');
  if ((g.loans || []).length > 2) return VINNIE_TIPS.find(t => t.condKey === 'loanHeavy');

  return VINNIE_TIPS.find(t => t.condKey === 'default');
}

export default function VinnieTip() {
  const { state } = useGame();
  const g = state.game;
  if (!g) return null;

  const tip = evaluateTip(g);
  if (!tip) return null;

  return (
    <div className="vinnie-tip">
      <span className="vinnie-tip-icon">{"\u{1F9D4}"}</span>
      <span className="vinnie-tip-text">{tip.tip}</span>
    </div>
  );
}
