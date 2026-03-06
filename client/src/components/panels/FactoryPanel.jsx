import React, { useState } from 'react';
import { useGame } from '../../context/GameContext.jsx';
import { postAction, getWholesaleSuppliers } from '../../api/client.js';
import { FACTORY } from '@shared/constants/factory.js';
import { RAW_MATERIALS, RD_PROJECTS, CERTIFICATIONS, FACTORY_DISCOUNT_TIERS_DEFAULT, EXCLUSIVE_TIRES, CFO_ROLE, RUBBER_FARM, SYNTHETIC_LAB, MATERIAL_SUPPLIERS, RUBBER_STORAGE, RUBBER_PER_TIRE, RUBBER_QUALITY } from '@shared/constants/factoryBrand.js';
import { TIRES } from '@shared/constants/tires.js';
import { SUPPLIERS } from '@shared/constants/suppliers.js';
import { fmt } from '@shared/helpers/format.js';
import { getEffectiveProductionCost, computeTireAttributes, tireName } from '@shared/helpers/factoryBrand.js';
import { hapticsMedium } from '../../api/haptics.js';
import InfoBubble from '../ui/InfoBubble.jsx';

const PRODUCIBLE_TYPES = Object.keys(FACTORY.productionCost);

export default function FactoryPanel() {
  const { state, applyState } = useGame();
  const g = state.game;
  const [busy, setBusy] = useState(false);
  const [selectedType, setSelectedType] = useState(PRODUCIBLE_TYPES[0]);
  const [qty, setQty] = useState(10);
  const [brandName, setBrandName] = useState('');
  const [tab, setTab] = useState('dashboard');
  const [selectedLine, setSelectedLine] = useState(0);
  const [buyRubberType, setBuyRubberType] = useState('natural');
  const [buyRubberQty, setBuyRubberQty] = useState(10);
  const [sellRubberType, setSellRubberType] = useState('natural');
  const [sellRubberQty, setSellRubberQty] = useState(10);
  // Contracts state
  const [contractSellers, setContractSellers] = useState([]);
  const [contractForm, setContractForm] = useState({ sellerId: '', tireType: 'allSeason', qty: 500, pricePerUnit: 100, durationDays: 90, batchSize: 50, paymentTerms: 'on_delivery' });

  const factory = g.factory || null;
  const hasFactory = !!g.hasFactory;

  const doAction = async (action, params = {}) => {
    setBusy(true);
    const res = await postAction(action, params);
    if (res.ok) { hapticsMedium(); applyState(res); }
    setBusy(false);
  };

  if (!hasFactory) {
    const canAfford = g.cash >= FACTORY.buildCost;
    const hasRep = g.reputation >= FACTORY.minRep;
    const hasLocs = g.locations.length >= FACTORY.minLocations;
    const canBuild = canAfford && hasRep && hasLocs;

    return (
      <>
        <div className="card">
          <div className="card-title">Factory</div>
          <div className="text-sm text-dim" style={{ lineHeight: 1.5, marginBottom: 8 }}>
            Build your own tire manufacturing plant. Create your brand, hire factory staff,
            invest in R&D, and sell to other shops.
          </div>
        </div>
        <div className="card">
          <div className="card-title">Requirements</div>
          <div className="row-between mb-4">
            <span className="text-sm text-dim">Cash</span>
            <span className={`font-bold ${canAfford ? 'text-green' : 'text-red'}`}>
              ${fmt(g.cash)} / ${fmt(FACTORY.buildCost)}
            </span>
          </div>
          <div className="row-between mb-4">
            <span className="text-sm text-dim">Reputation</span>
            <span className={`font-bold ${hasRep ? 'text-green' : 'text-red'}`}>
              {g.reputation.toFixed(1)} / {FACTORY.minRep}
            </span>
          </div>
          <div className="row-between mb-4">
            <span className="text-sm text-dim">Locations</span>
            <span className={`font-bold ${hasLocs ? 'text-green' : 'text-red'}`}>
              {g.locations.length} / {FACTORY.minLocations}
            </span>
          </div>
          <button
            className="btn btn-full btn-green"
            disabled={!canBuild || busy}
            onClick={() => doAction('buildFactory')}
          >
            {busy ? 'Building...' : canBuild ? `Build Factory ($${fmt(FACTORY.buildCost)})` : 'Requirements Not Met'}
          </button>
        </div>
      </>
    );
  }

  const currentLevel = factory?.level || 1;
  const levelData = FACTORY.levels.find(l => l.level === currentLevel) || FACTORY.levels[0];
  const nextLevel = FACTORY.levels.find(l => l.level === currentLevel + 1);
  const fStaff = factory?.staff || { lineWorkers: 0, inspectors: 0, engineers: 0, manager: 0 };
  const qualityPct = Math.round((factory?.qualityRating || 0.80) * 100);
  const qualityCapPct = Math.round(levelData.qualityMax * 100);
  const defectRate = Math.max(1, Math.round((FACTORY.baseDefectRate - (fStaff.inspectors || 0) * 0.02) * 100));
  const effectiveCap = factory?.dailyCapacity || levelData.dailyCapacity;
  const brandRep = Math.round(factory?.brandReputation || 0);
  const rm = factory?.rawMaterials || { rubber: 1.0, steel: 1.0, chemicals: 1.0 };
  const earnedCerts = (factory?.certifications || []).filter(c => c.earned);
  const activeRD = factory?.rdProjects || [];
  const unlockedSpecials = factory?.unlockedSpecials || [];
  const customerList = factory?.customerList || [];
  const orderHistory = factory?.orderHistory || [];
  const vinnieInv = factory?.vinnieInventory || {};
  const vinnieTotalLoss = factory?.vinnieTotalLoss || 0;

  // Get producible types including exclusives
  const allProducible = [
    ...PRODUCIBLE_TYPES,
    ...unlockedSpecials.filter(k => EXCLUSIVE_TIRES[k]),
  ];

  // Effective cost for selected type
  const isExclusive = selectedType.startsWith('brand_');
  const effectiveUnitCost = isExclusive
    ? (EXCLUSIVE_TIRES[selectedType]?.baseCost || 80)
    : getEffectiveProductionCost(factory, selectedType);
  const totalCost = effectiveUnitCost * qty;

  // Factory staff payroll
  let factoryPayroll = Object.entries(fStaff).reduce((a, [role, count]) => {
    const staffDef = FACTORY.staff?.[role];
    return a + (staffDef ? staffDef.salary * count : 0);
  }, 0);
  if (factory?.hasCFO) factoryPayroll += CFO_ROLE.salary;

  // Raw material color helper
  const rmColor = (val) => val < 0.9 ? 'text-green' : val > 1.1 ? 'text-red' : 'text-accent';

  const TABS = [['dashboard', 'Dashboard'], ['production', 'Production'], ['wholesale', 'Wholesale'], ['contracts', 'Contracts'], ['rd', 'R&D'], ['staff', 'Staff'], ['supply', 'Supply Chain']];

  return (
    <>
      {/* Tab navigation */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
          <span className="card-title" style={{ margin: 0 }}>Factory</span>
          <InfoBubble title="Your Factory">
            <p style={{ margin: '0 0 4px' }}><b style={{ color: 'var(--text)' }}>Production</b> — Produce your own branded tires. Quality improves with R&D projects and certifications.</p>
            <p style={{ margin: '0 0 4px' }}><b style={{ color: 'var(--text)' }}>Wholesale</b> — Set wholesale prices so other players can buy your tires. Set MAP (minimum advertised price) to protect your brand.</p>
            <p style={{ margin: '0 0 4px' }}><b style={{ color: 'var(--text)' }}>Supply Chain</b> — Build rubber farms and synthetic labs to reduce raw material costs.</p>
          </InfoBubble>
        </div>
        <div className="row gap-8" style={{ flexWrap: 'wrap' }}>
          {TABS.map(([id, label]) => (
            <button key={id} className={`btn btn-sm ${tab === id ? '' : 'btn-outline'}`} style={{ flex: 1, minWidth: 60 }} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ═══ DASHBOARD TAB ═══ */}
      {tab === 'dashboard' && (
        <>
          {/* Brand Card */}
          <div className="card">
            <div className="card-title">Brand: {factory?.brandName || 'My Tires'}</div>
            <div className="row gap-8 mb-4">
              <input
                type="text" className="autoprice-offset"
                style={{ flex: 1, textAlign: 'left' }}
                placeholder={factory?.brandName || 'Brand name'}
                value={brandName}
                onChange={e => setBrandName(e.target.value)}
              />
              <button className="btn btn-sm btn-green" disabled={!brandName.trim() || busy}
                onClick={() => { doAction('setFactoryBrandName', { brandName: brandName.trim() }); setBrandName(''); }}>
                Rename
              </button>
            </div>
            <div className="row-between mb-4">
              <span className="text-sm text-dim">Brand Reputation</span>
              <span className="font-bold">{brandRep}/100</span>
            </div>
            <div className="progress-bar mb-4">
              <div className="progress-fill" style={{ width: `${brandRep}%`, background: 'var(--accent)' }} />
            </div>
            {earnedCerts.length > 0 && (
              <div className="row gap-8" style={{ flexWrap: 'wrap' }}>
                {earnedCerts.map(c => {
                  const def = CERTIFICATIONS.find(cd => cd.id === c.id);
                  return <span key={c.id} className="text-xs" style={{ background: 'var(--green)', color: '#000', padding: '2px 6px', borderRadius: 4 }}>{def?.name || c.id}</span>;
                })}
              </div>
            )}
          </div>

          {/* Factory Stats */}
          <div className="card">
            <div className="card-title">{levelData.name} (Lv {currentLevel})</div>
            <div className="row-between mb-4">
              <span className="text-sm text-dim">Daily Capacity</span>
              <span className="font-bold">{effectiveCap} tires</span>
            </div>
            <div className="row-between mb-4">
              <span className="text-sm text-dim">Quality</span>
              <span className="font-bold text-accent">{qualityPct}% / {qualityCapPct}%</span>
            </div>
            <div className="progress-bar mb-4">
              <div className="progress-fill" style={{ width: `${(qualityPct / qualityCapPct) * 100}%`, background: 'var(--accent)' }} />
            </div>
            {/* Tire Performance Attributes */}
            {factory && (() => {
              const attrs = computeTireAttributes(factory);
              const attrColor = v => v > 70 ? 'var(--green)' : v >= 40 ? 'var(--accent)' : 'var(--red)';
              return (
                <div style={{ marginBottom: 8 }}>
                  <div className="text-xs text-dim mb-4">Tire Performance</div>
                  {[['Grip', attrs.grip], ['Durability', attrs.durability], ['Comfort', attrs.comfort], ['Tread Life', attrs.treadLife], ['Efficiency', attrs.efficiency]].map(([label, val]) => (
                    <div key={label} className="row-between mb-4" style={{ alignItems: 'center' }}>
                      <span className="text-xs" style={{ width: 70 }}>{label}</span>
                      <div style={{ flex: 1, height: 8, background: 'var(--bg)', borderRadius: 4, marginLeft: 8, marginRight: 8, overflow: 'hidden' }}>
                        <div style={{ width: `${val}%`, height: '100%', background: attrColor(val), borderRadius: 4, transition: 'width 0.3s' }} />
                      </div>
                      <span className="text-xs font-bold" style={{ width: 24, textAlign: 'right' }}>{val}</span>
                    </div>
                  ))}
                </div>
              );
            })()}

            <div className="row-between mb-4">
              <span className="text-sm text-dim">Defect Rate</span>
              <span className={`font-bold ${defectRate <= 5 ? 'text-green' : defectRate <= 10 ? 'text-accent' : 'text-red'}`}>{defectRate}%</span>
            </div>
            <div className="row-between mb-4">
              <span className="text-sm text-dim">Distribution</span>
              <span className={`font-bold ${factory?.isDistributor ? 'text-green' : 'text-dim'}`}>
                {factory?.isDistributor ? 'Active' : 'Not enabled'}
              </span>
            </div>
            {!factory?.isDistributor && g.hasDist && (
              <button className="btn btn-full btn-sm btn-outline mb-4" disabled={g.cash < 250000 || busy}
                onClick={() => doAction('enableFactoryDistribution')}>
                Enable Distribution ($250K)
              </button>
            )}
            {nextLevel && (
              <button className="btn btn-full btn-sm btn-outline" disabled={g.cash < nextLevel.upgradeCost || busy}
                onClick={() => doAction('upgradeFactory')}>
                Upgrade to {nextLevel.name} (${fmt(nextLevel.upgradeCost)})
              </button>
            )}
          </div>

          {/* Raw Materials */}
          <div className="card">
            <div className="card-title">Raw Material Indices</div>
            <div className="text-xs text-dim mb-4">Prices drift weekly. Lower = cheaper production.</div>
            {Object.entries(RAW_MATERIALS).map(([mat, cfg]) => {
              const val = rm[mat] ?? cfg.base;
              return (
                <div key={mat} className="row-between mb-4">
                  <span className="text-sm" style={{ textTransform: 'capitalize' }}>{mat}</span>
                  <span className={`font-bold ${rmColor(val)}`}>{(val * 100).toFixed(0)}%</span>
                </div>
              );
            })}
          </div>

          {/* Key Metrics */}
          <div className="card">
            <div className="card-title">Key Metrics</div>
            <div className="row-between mb-4">
              <span className="text-sm text-dim">Wholesale Revenue (Total)</span>
              <span className="font-bold text-green">${fmt(factory?.totalWholesaleRev || 0)}</span>
            </div>
            <div className="row-between mb-4">
              <span className="text-sm text-dim">Wholesale Orders</span>
              <span className="font-bold">{factory?.totalWholesaleOrders || 0}</span>
            </div>
            <div className="row-between mb-4">
              <span className="text-sm text-dim">Active Customers</span>
              <span className="font-bold">{customerList.length}</span>
            </div>
            <div className="row-between mb-4">
              <span className="text-sm text-dim">Monthly Overhead</span>
              <span className="font-bold text-red">${fmt(FACTORY.monthlyOverhead)}</span>
            </div>
            <div className="row-between mb-4">
              <span className="text-sm text-dim">Staff Payroll</span>
              <span className="font-bold text-red">${fmt(factoryPayroll)}/mo</span>
            </div>
          </div>

          {/* Quality & Warranty Dashboard */}
          <div className="card">
            <div className="card-title">Quality & Warranty</div>
            {(() => {
              const defectHistory = factory?.defectHistory || [];
              const last30 = defectHistory.filter(d => (g.day || 0) - (d.day || 0) <= 30);
              const avgDefect = last30.length > 0
                ? last30.reduce((sum, d) => sum + (d.defectRate || 0), 0) / last30.length
                : 0;
              const avgDefectPct = Math.round(avgDefect * 100);
              const defectColor = avgDefectPct < 5 ? 'text-green' : avgDefectPct <= 10 ? 'text-accent' : 'text-red';

              // Breakdown by type
              const cosmetic = last30.reduce((s, d) => s + (d.cosmetic || 0), 0);
              const structural = last30.reduce((s, d) => s + (d.structural || 0), 0);
              const critical = last30.reduce((s, d) => s + (d.critical || 0), 0);

              const totalClaims = factory?.totalWarrantyClaims || 0;
              const totalWarrantyCost = factory?.totalWarrantyCost || 0;

              const recentBatches = defectHistory.slice(-5).reverse();

              return (
                <>
                  <div className="row-between mb-4">
                    <span className="text-sm text-dim">Avg Defect Rate (30d)</span>
                    <span className={`font-bold ${defectColor}`}>{avgDefectPct}%</span>
                  </div>

                  {last30.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div className="text-xs text-dim mb-4">Defect Breakdown (30d)</div>
                      <div className="row gap-8 text-xs mb-4">
                        <span>Cosmetic: <strong>{cosmetic}</strong></span>
                        <span>Structural: <strong>{structural}</strong></span>
                        <span style={{ color: critical > 0 ? 'var(--red)' : undefined }}>Critical: <strong>{critical}</strong></span>
                      </div>
                    </div>
                  )}

                  <div className="row-between mb-4">
                    <span className="text-sm text-dim">Total Warranty Claims</span>
                    <span className="font-bold">{totalClaims}</span>
                  </div>
                  <div className="row-between mb-4">
                    <span className="text-sm text-dim">Total Warranty Cost</span>
                    <span className="font-bold text-red">${fmt(totalWarrantyCost)}</span>
                  </div>

                  {recentBatches.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div className="text-xs text-dim mb-4">Recent Defect Batches</div>
                      {recentBatches.map((batch, bi) => {
                        const batchIdx = defectHistory.length - 1 - bi;
                        const tName = tireName(batch.tire, g);
                        const batchDefectPct = Math.round((batch.defectRate || 0) * 100);
                        const batchColor = batchDefectPct < 5 ? 'text-green' : batchDefectPct <= 10 ? 'text-accent' : 'text-red';
                        return (
                          <div key={bi} className="row-between text-sm mb-4" style={{ padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                            <div>
                              <span className="font-bold">{tName}</span>
                              <span className="text-dim" style={{ marginLeft: 6 }}>{batch.qty} tires</span>
                            </div>
                            <div className="row gap-8" style={{ alignItems: 'center' }}>
                              <span className={batchColor}>{batchDefectPct}%</span>
                              {!batch.recalled && (
                                <button className="btn btn-sm btn-red" disabled={busy}
                                  onClick={() => doAction('recallBatch', { batchIndex: batchIdx })}>
                                  Recall
                                </button>
                              )}
                              {batch.recalled && (
                                <span className="text-xs text-dim">Recalled</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {defectHistory.length === 0 && (
                    <div className="text-xs text-dim">No defect data yet. Start producing to track quality.</div>
                  )}
                </>
              );
            })()}
          </div>

          {/* Vinnie's Adventures */}
          {(Object.keys(vinnieInv).length > 0 || vinnieTotalLoss > 0) && (
            <div className="card" style={{ borderLeft: '3px solid var(--red)' }}>
              <div className="card-title">Vinnie's Adventures</div>
              <div className="row-between mb-4">
                <span className="text-sm text-dim">Total Money Lost</span>
                <span className="font-bold text-red">${fmt(vinnieTotalLoss)}</span>
              </div>
              {Object.entries(vinnieInv).map(([id, item]) => (
                <div key={id} className="row-between text-sm mb-4">
                  <span>{item.name} ({item.qty} left)</span>
                  <span className="text-dim">Sell rate: {Math.round(item.sellRate * 100)}%/day</span>
                </div>
              ))}
              {!factory?.hasCFO && (
                <button className="btn btn-full btn-sm btn-outline" disabled={g.cash < CFO_ROLE.salary || busy}
                  onClick={() => doAction('hireFactoryCFO')}>
                  Hire CFO (${fmt(CFO_ROLE.salary)}/mo) — blocks 50% of Vinnie's deals
                </button>
              )}
              {factory?.hasCFO && (
                <div className="row-between text-sm mb-4">
                  <span className="text-green font-bold">CFO Active</span>
                  <button className="btn btn-sm btn-red" disabled={busy} onClick={() => doAction('fireFactoryCFO')}>Fire</button>
                </div>
              )}
            </div>
          )}

          {/* Sell Factory */}
          <div className="card">
            <div className="card-title">Sell Factory</div>
            <div className="text-xs text-dim mb-4">
              Asset value: ${fmt(FACTORY.factoryValue?.[currentLevel] || 5000000)}
            </div>
            {g.factoryListing ? (
              <>
                <div className="row-between mb-4">
                  <span className="text-sm text-dim">Listed for</span>
                  <span className="font-bold text-green">${fmt(g.factoryListing.askingPrice)}</span>
                </div>
                <button className="btn btn-full btn-sm btn-red" disabled={busy} onClick={() => doAction('delistFactory')}>
                  Remove Listing
                </button>
              </>
            ) : (
              <button className="btn btn-full btn-sm btn-outline" disabled={busy}
                onClick={() => doAction('listFactoryForSale', { askingPrice: FACTORY.factoryValue?.[currentLevel] || 5000000 })}>
                List for Sale (${fmt(FACTORY.factoryValue?.[currentLevel] || 5000000)})
              </button>
            )}
          </div>
        </>
      )}

      {/* ═══ PRODUCTION TAB ═══ */}
      {tab === 'production' && (() => {
        const maxLines = FACTORY.productionLines.byLevel[currentLevel - 1] || 1;
        const lines = factory?.lines || [];
        const maintCost = FACTORY.productionLines.maintenance.cost[currentLevel - 1] || 15000;
        return (
        <>
          {/* Production Lines */}
          {Array.from({ length: Math.max(maxLines, 3) }, (_, idx) => {
            const isAvailable = idx < maxLines;
            const line = lines[idx];
            if (!isAvailable) {
              return (
                <div key={idx} className="card" style={{ opacity: 0.4 }}>
                  <div className="card-title" style={{ color: 'var(--text-dim)' }}>Line {idx + 1} — Locked</div>
                  <div className="text-sm text-dim">Upgrade factory to unlock this production line.</div>
                </div>
              );
            }

            const lineQueue = line?.queue || [];
            const lineStatus = line?.status || 'active';
            const lineType = line?.currentType || null;
            const runStreak = line?.runStreak || 0;
            const lastMaintDay = line?.lastMaintDay || 0;
            const daysSinceMaint = (g.day || 0) - lastMaintDay;
            const maintColor = daysSinceMaint > 30 ? 'var(--red)' : daysSinceMaint > 25 ? '#ff9800' : 'var(--green)';

            // Run streak defect bonus
            const thresholds = FACTORY.productionLines.runEfficiency.thresholds;
            const defectReductions = FACTORY.productionLines.runEfficiency.defectReduction;
            let streakBonus = 0;
            for (let t = thresholds.length - 1; t >= 0; t--) {
              if (runStreak >= thresholds[t]) { streakBonus = defectReductions[t]; break; }
            }

            return (
              <div key={idx} className="card" style={{ borderLeft: lineStatus === 'maintenance' ? '3px solid #ff9800' : idx === selectedLine ? '3px solid var(--accent)' : undefined }}>
                <div className="row-between mb-4">
                  <div className="card-title" style={{ margin: 0 }}>Line {idx + 1}</div>
                  <span className={`text-xs font-bold ${lineStatus === 'active' ? 'text-green' : ''}`}
                    style={lineStatus === 'maintenance' ? { color: '#ff9800' } : undefined}>
                    {lineStatus === 'active' ? 'Active' : 'Maintenance'}
                  </span>
                </div>

                {lineType && (
                  <div className="row-between text-sm mb-4">
                    <span className="text-dim">Current Type</span>
                    <span className="font-bold">{tireName(lineType, g)}</span>
                  </div>
                )}

                {runStreak > 0 && (
                  <div className="text-xs mb-4" style={{ color: 'var(--green)' }}>
                    Run streak: {runStreak} {streakBonus > 0 ? `\u2014 ${Math.round(streakBonus * 100)}% less defects` : ''}
                  </div>
                )}

                {/* Maintenance status */}
                <div className="row-between text-sm mb-4">
                  <span className="text-dim">Maintenance</span>
                  <span className="font-bold" style={{ color: maintColor }}>
                    {daysSinceMaint > 30 ? 'Overdue' : daysSinceMaint > 25 ? 'Due soon' : 'Good'}
                    <span className="text-dim" style={{ fontWeight: 'normal', marginLeft: 4 }}>({daysSinceMaint}d ago)</span>
                  </span>
                </div>

                {lineStatus === 'active' && (
                  <button className="btn btn-full btn-sm btn-outline mb-4" disabled={busy || g.cash < maintCost}
                    onClick={() => doAction('maintainFactoryLine', { lineIndex: idx })}>
                    Run Maintenance (${fmt(maintCost)})
                  </button>
                )}

                {/* Line queue */}
                {lineQueue.length > 0 && (
                  <div style={{ marginTop: 4 }}>
                    <div className="text-xs text-dim mb-4">Queue ({lineQueue.length})</div>
                    {lineQueue.map((job, ji) => {
                      const tName = tireName(job.tire, g);
                      const daysLeft = Math.max(0, (job.completionDay || 0) - (g.day || 0));
                      const totalDays = Math.max(1, (job.completionDay || 0) - (job.startDay || 0));
                      const progress = Math.round(((totalDays - daysLeft) / totalDays) * 100);
                      return (
                        <div key={ji} style={{ marginBottom: ji < lineQueue.length - 1 ? 6 : 0 }}>
                          <div className="row-between text-sm mb-4">
                            <span className="font-bold">{tName}</span>
                            <span className="text-dim">{job.qty} tires - {daysLeft}d left</span>
                          </div>
                          <div className="progress-bar">
                            <div className="progress-fill" style={{ width: `${progress}%`, background: 'var(--green)' }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {lineQueue.length === 0 && lineStatus === 'active' && (
                  <div className="text-xs text-dim">No jobs queued.</div>
                )}
              </div>
            );
          })}

          {/* Raw Material Trend */}
          <div className="card">
            <div className="card-title">Raw Material Prices</div>
            {Object.entries(RAW_MATERIALS).map(([mat, cfg]) => {
              const val = rm[mat] ?? cfg.base;
              return (
                <div key={mat} className="row-between mb-4">
                  <span className="text-sm" style={{ textTransform: 'capitalize' }}>{mat}</span>
                  <span className={`font-bold ${rmColor(val)}`}>
                    {(val * 100).toFixed(0)}% ({val < cfg.base ? 'cheap' : val > cfg.base ? 'expensive' : 'normal'})
                  </span>
                </div>
              );
            })}
          </div>

          {/* New Production Order */}
          <div className="card">
            <div className="card-title">New Production Order</div>

            {/* Line selector (only if >1 available) */}
            {maxLines > 1 && (
              <div style={{ marginBottom: 8 }}>
                <label className="text-xs text-dim" style={{ display: 'block', marginBottom: 4 }}>Target Line</label>
                <select className="autoprice-select" style={{ width: '100%' }} value={selectedLine} onChange={(e) => setSelectedLine(Number(e.target.value))}>
                  {Array.from({ length: maxLines }, (_, i) => {
                    const ln = lines[i];
                    const lnStatus = ln?.status || 'active';
                    return <option key={i} value={i} disabled={lnStatus === 'maintenance'}>Line {i + 1}{lnStatus === 'maintenance' ? ' (Maintenance)' : ''}</option>;
                  })}
                </select>
              </div>
            )}

            <div style={{ marginBottom: 8 }}>
              <label className="text-xs text-dim" style={{ display: 'block', marginBottom: 4 }}>Tire Type</label>
              <select className="autoprice-select" style={{ width: '100%' }} value={selectedType} onChange={(e) => setSelectedType(e.target.value)}>
                {allProducible.map(type => {
                  const isExcl = type.startsWith('brand_');
                  const name = tireName(type, g);
                  const cost = isExcl ? (EXCLUSIVE_TIRES[type]?.baseCost || 80) : getEffectiveProductionCost(factory, type);
                  return <option key={type} value={type}>{name} -- ${cost}/tire{isExcl ? ' (Exclusive)' : ''}</option>;
                })}
              </select>
            </div>
            <div style={{ marginBottom: 8 }}>
              <label className="text-xs text-dim" style={{ display: 'block', marginBottom: 4 }}>Quantity</label>
              <input type="number" className="autoprice-offset" style={{ width: '100%', textAlign: 'left' }}
                min={1} max={effectiveCap * 7} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value)))} onFocus={e => e.target.select()} />
            </div>
            <div className="row-between text-sm mb-4">
              <span className="text-dim">Effective Cost (with materials)</span>
              <span className={`font-bold ${g.cash < totalCost ? 'text-red' : 'text-green'}`}>${fmt(totalCost)}</span>
            </div>
            {(() => {
              const targetLine = lines[selectedLine];
              const targetLineType = targetLine?.currentType;
              if (targetLineType && targetLineType !== selectedType) {
                return <div className="text-xs text-red mb-4">Line switch required: +1 day cooldown</div>;
              }
              return null;
            })()}
            <button className="btn btn-full btn-green" disabled={g.cash < totalCost || qty < 1 || busy || (lines[selectedLine]?.status === 'maintenance')}
              onClick={() => doAction('produceFactoryTires', { tire: selectedType, qty, lineIndex: selectedLine })}>
              {busy ? 'Starting...' : g.cash < totalCost ? 'Not Enough Cash' : lines[selectedLine]?.status === 'maintenance' ? 'Line in Maintenance' : `Produce ${qty} tires`}
            </button>
          </div>
        </>
        );
      })()}

      {/* ═══ WHOLESALE TAB ═══ */}
      {tab === 'wholesale' && (
        <>
          {/* Distribution Status */}
          <div className="card">
            <div className="card-title">Wholesale Distribution</div>
            {factory?.isDistributor ? (
              <div className="text-sm text-green font-bold mb-4">Distribution Active</div>
            ) : (
              <>
                <div className="text-sm text-dim mb-4">Enable distribution to let other players buy from your factory.</div>
                {g.hasDist ? (
                  <button className="btn btn-full btn-green" disabled={g.cash < 250000 || busy}
                    onClick={() => doAction('enableFactoryDistribution')}>
                    Enable Distribution ($250K)
                  </button>
                ) : (
                  <>
                    <div className="text-xs text-dim mb-4">
                      Requires: Rep 50+, 5+ locations, wholesale channel, $500K
                    </div>
                    <button className="btn btn-full btn-blue" disabled={g.cash < 500000 || g.reputation < 50 || (g.locations || []).length < 5 || !g.hasWholesale || busy}
                      onClick={() => doAction('unlockDist')}>
                      Unlock Distribution Network ($500K)
                    </button>
                  </>
                )}
              </>
            )}
          </div>

          {/* Wholesale Price Editor */}
          <div className="card">
            <div className="card-title">Wholesale Prices</div>
            <div className="text-xs text-dim mb-4">Set prices per tire. Buyers compare against other suppliers.</div>
          </div>
          {PRODUCIBLE_TYPES.map(type => {
            const t = TIRES[type];
            const prodCost = getEffectiveProductionCost(factory, type);
            const baseProdCost = FACTORY.productionCost[type];
            const currentPrice = factory?.wholesalePrices?.[type] || Math.round(baseProdCost * 1.5);
            const margin = currentPrice - prodCost;
            const marginPct = prodCost > 0 ? Math.round((margin / prodCost) * 100) : 0;
            const mapPrice = factory?.mapPrices?.[type] || '';
            const minOrder = factory?.minOrders?.[type] || 10;
            // Supplier price range for comparison
            const basePrice = t?.bMin || 0;
            const supLow = Math.round(basePrice * (1 - Math.max(...SUPPLIERS.map(s => s.disc))));
            const supHigh = Math.round(basePrice);
            return (
              <div key={type} className="card">
                <div className="font-bold text-sm mb-4">{tireName(type, g)}</div>
                <div className="row-between text-xs mb-4">
                  <span className="text-dim">Your cost: <strong>${prodCost}</strong></span>
                  <span className={margin > 0 ? 'text-green' : 'text-red'}>Margin: ${margin} ({marginPct}%)</span>
                </div>
                <div className="text-xs mb-4" style={{ background: 'rgba(78,168,222,0.08)', borderRadius: 4, padding: '4px 6px' }}>
                  Supplier range: <strong>${supLow}</strong> (cheapest) — <strong>${supHigh}</strong> (most expensive)
                  {currentPrice <= supLow && <span className="text-green" style={{ marginLeft: 6 }}>Competitive!</span>}
                  {currentPrice > supHigh && <span className="text-red" style={{ marginLeft: 6 }}>Above all suppliers</span>}
                  {currentPrice > supLow && currentPrice <= supHigh && <span style={{ marginLeft: 6, color: '#ff9800' }}>Mid-range</span>}
                </div>
                <div className="row gap-8 mb-4">
                  <div style={{ flex: 1 }}>
                    <label className="text-xs text-dim" style={{ display: 'block', marginBottom: 2 }}>Wholesale $</label>
                    <input type="number" className="autoprice-offset" style={{ flex: 1, textAlign: 'left' }}
                      min={baseProdCost} defaultValue={currentPrice}
                      onBlur={e => doAction('setFactoryWholesalePrice', { tire: type, price: Number(e.target.value) })} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="text-xs text-dim" style={{ display: 'block', marginBottom: 2 }}>MAP $</label>
                    <input type="number" className="autoprice-offset" style={{ flex: 1, textAlign: 'left' }}
                      min={baseProdCost} defaultValue={mapPrice || ''}
                      placeholder="Optional"
                      onBlur={e => { if (e.target.value) doAction('setFactoryMAP', { tire: type, price: Number(e.target.value) }); }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="text-xs text-dim" style={{ display: 'block', marginBottom: 2 }}>Min Order</label>
                    <input type="number" className="autoprice-offset" style={{ flex: 1, textAlign: 'left' }}
                      min={1} defaultValue={minOrder}
                      onBlur={e => doAction('setFactoryMinOrder', { tire: type, minQty: Number(e.target.value) })} />
                  </div>
                </div>
              </div>
            );
          })}

          {/* Active Listings — confirmation of what's visible to buyers */}
          {factory?.isDistributor && (
            <div className="card">
              <div className="card-title">Your Active Listings</div>
              <div className="text-xs text-dim mb-4">These tires are visible to other players in the wholesale marketplace.</div>
              {(() => {
                const listings = PRODUCIBLE_TYPES.filter(type => (factory?.wholesalePrices?.[type] || 0) > 0);
                if (listings.length === 0) return <div className="text-sm text-dim">No prices set yet. Set wholesale prices above to list your tires.</div>;
                return listings.map(type => {
                  const t = TIRES[type];
                  const brandKey = `brand_${type}`;
                  const stock = (g.warehouseInventory?.[brandKey] || 0) + (g.warehouseInventory?.[type] || 0);
                  const price = factory.wholesalePrices[type];
                  const displayName = tireName(type, g);
                  return (
                    <div key={type} className="row-between text-sm mb-4" style={{ padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                      <div>
                        <span className="font-bold">{displayName}</span>
                        <span className="text-dim ml-4"> — ${price}/ea</span>
                      </div>
                      <div>
                        {stock > 0
                          ? <span className="text-green">{fmt(stock)} in stock</span>
                          : <span className="text-red">Out of stock</span>}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          )}

          {/* Discount Tiers */}
          <div className="card">
            <div className="card-title">Discount Tiers</div>
            <div className="text-xs text-dim mb-4">Repeat customers earn automatic discounts.</div>
            {(factory?.discountTiers || FACTORY_DISCOUNT_TIERS_DEFAULT).map((tier, i) => (
              <div key={i} className="row-between text-sm mb-4">
                <span>{tier.label}</span>
                <span className="text-dim">{tier.min}+ units = {Math.round(tier.disc * 100)}% off</span>
              </div>
            ))}
          </div>

          {/* Customer List */}
          {customerList.length > 0 && (
            <div className="card">
              <div className="card-title">Customers ({customerList.length})</div>
              {customerList.slice(0, 20).map((cust, i) => {
                const tier = (factory?.discountTiers || FACTORY_DISCOUNT_TIERS_DEFAULT).reduce((t, tier2) => cust.totalPurchased >= tier2.min ? tier2 : t, { label: 'New', disc: 0 });
                return (
                  <div key={i} className="row-between text-sm mb-4">
                    <span>{cust.name}</span>
                    <span className="text-dim">{cust.totalPurchased} units | {tier.label} | Day {cust.lastOrderDay}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Recent Orders */}
          {orderHistory.length > 0 && (
            <div className="card">
              <div className="card-title">Recent Orders</div>
              {orderHistory.slice(-15).reverse().map((order, i) => (
                <div key={i} className="row-between text-sm mb-4">
                  <span>{order.shopName}: {order.qty}x</span>
                  <span className="text-dim">${order.price}/ea | {order.tier} | Day {order.day}</span>
                </div>
              ))}
            </div>
          )}

          {/* Exclusivity Deals — Pending Offers */}
          {(factory?.exclusivityOffers || []).length > 0 && (
            <div className="card">
              <div className="card-title">Exclusivity Offers</div>
              <div className="text-xs text-dim mb-4">AI shops want exclusive supply deals. Offers expire in 14 days.</div>
              {factory.exclusivityOffers.map(offer => {
                const totalRev = offer.monthlyQty * offer.durationMonths * offer.pricePerUnit;
                const daysLeft = offer.expiresDay - (g.day || 0);
                return (
                  <div key={offer.id} style={{ padding: 8, marginBottom: 8, borderRadius: 6, border: '1px solid var(--border)' }}>
                    <div className="font-bold text-sm mb-4">{offer.shopName}</div>
                    <div className="row-between text-xs mb-4">
                      <span>Type: {offer.tireType}</span>
                      <span>{offer.monthlyQty}/mo for {offer.durationMonths} months</span>
                    </div>
                    <div className="row-between text-xs mb-4">
                      <span>${fmt(offer.pricePerUnit)}/unit</span>
                      <span className="text-green font-bold">Total: ${fmt(totalRev)}</span>
                    </div>
                    <div className="text-xs text-dim mb-4">Expires in {daysLeft} days</div>
                    <div className="row gap-8">
                      <button className="btn btn-sm btn-green" style={{ flex: 1 }} disabled={busy}
                        onClick={() => doAction('acceptExclusivityDeal', { offerId: offer.id })}>
                        Accept
                      </button>
                      <button className="btn btn-sm btn-red" style={{ flex: 1 }} disabled={busy}
                        onClick={() => doAction('declineExclusivityDeal', { offerId: offer.id })}>
                        Decline
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Active Exclusivity Deals */}
          {(factory?.exclusivityDeals || []).filter(d => d.status === 'active').length > 0 && (
            <div className="card">
              <div className="card-title">Active Exclusivity Deals</div>
              {factory.exclusivityDeals.filter(d => d.status === 'active').map(deal => {
                const totalTarget = deal.totalQty || (deal.monthlyQty * deal.durationMonths);
                const delivered = deal.deliveredQty || 0;
                const pct = totalTarget > 0 ? Math.round(delivered / totalTarget * 100) : 0;
                const daysLeft = deal.endDay - (g.day || 0);
                return (
                  <div key={deal.id} style={{ padding: 8, marginBottom: 8, borderRadius: 6, border: '1px solid var(--border)' }}>
                    <div className="row-between mb-4">
                      <span className="font-bold text-sm">{deal.shopName}</span>
                      <span className="text-xs text-dim">{daysLeft} days left</span>
                    </div>
                    <div className="text-xs mb-4">{deal.tireType} — {deal.monthlyQty}/mo @ ${fmt(deal.pricePerUnit)}/unit</div>
                    <div style={{ background: 'var(--border)', borderRadius: 4, height: 10, overflow: 'hidden', marginBottom: 4 }}>
                      <div style={{ width: `${pct}%`, background: 'var(--green)', height: '100%' }} />
                    </div>
                    <div className="text-xs text-dim">{delivered} / {totalTarget} delivered ({pct}%)</div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Completed Deals History */}
          {(factory?.exclusivityDeals || []).filter(d => d.status === 'completed').length > 0 && (
            <div className="card">
              <div className="card-title">Completed Deals</div>
              {factory.exclusivityDeals.filter(d => d.status === 'completed').slice(-5).map(deal => (
                <div key={deal.id} className="row-between text-xs mb-4">
                  <span>{deal.shopName} — {deal.tireType}</span>
                  <span className="text-dim">{deal.deliveredQty}/{deal.totalQty}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ═══ CONTRACTS TAB ═══ */}
      {tab === 'contracts' && (() => {
        const p2p = g.p2pContracts || [];
        const commodity = g.commodityContracts || [];
        const activeP2P = p2p.filter(c => c.status === 'active' || c.status === 'paused');
        const pendingP2P = p2p.filter(c => c.status === 'proposed' || c.status === 'countered');
        const historyP2P = p2p.filter(c => ['completed', 'cancelled', 'denied', 'expired'].includes(c.status)).slice(-10);
        const activeCommodity = commodity.filter(c => c.status === 'active');
        const isSeller = (c) => c.sellerId === g.id;
        const allocations = factory?.contractAllocations || {};

        return (
          <>
            {/* Pending Proposals */}
            {pendingP2P.length > 0 && (
              <div className="card">
                <div className="card-title">Pending Proposals ({pendingP2P.length})</div>
                {pendingP2P.map(c => (
                  <div key={c.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <div className="row-between">
                      <span className="font-bold text-sm">{isSeller(c) ? `From: ${c.buyerName}` : `To: ${c.sellerName}`}</span>
                      <span className="text-xs" style={{ background: 'rgba(255,193,7,0.15)', color: '#ffca28', padding: '2px 8px', borderRadius: 8 }}>
                        {c.status === 'countered' ? `Counter #${c.counterCount}` : 'Proposed'}
                      </span>
                    </div>
                    <div className="text-xs text-dim mt-4">
                      {TIRES[c.terms?.tireType]?.n || c.terms?.tireType} — {c.terms?.qty} units @ ${c.terms?.pricePerUnit}/ea — {c.terms?.durationDays}d
                    </div>
                    <div className="text-xs text-dim">Payment: {c.terms?.paymentTerms} — Batch: {c.terms?.batchSize} — Expires day {c.expiresDay}</div>
                    <div className="row gap-8 mt-4">
                      {/* Can accept if other party proposed/countered */}
                      {((isSeller(c) && c.proposedBy === 'buyer') || (!isSeller(c) && c.proposedBy === 'seller')) && (
                        <button className="btn btn-sm" disabled={busy} style={{ background: 'var(--green)', color: '#fff', fontSize: 11 }}
                          onClick={() => doAction('acceptContract', { contractId: c.id })}>Accept</button>
                      )}
                      <button className="btn btn-sm btn-outline" disabled={busy} style={{ fontSize: 11 }}
                        onClick={() => doAction('denyContract', { contractId: c.id })}>Deny</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Active P2P Contracts */}
            <div className="card">
              <div className="card-title">Active Production Contracts ({activeP2P.length})</div>
              {activeP2P.length === 0 && <div className="text-xs text-dim">No active contracts. Propose one to a factory distributor below.</div>}
              {activeP2P.map(c => {
                const alloc = allocations[c.id];
                const progress = c.terms?.qty > 0 ? Math.round((c.deliveredQty || 0) / c.terms.qty * 100) : 0;
                return (
                  <div key={c.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <div className="row-between">
                      <span className="font-bold text-sm">
                        {isSeller(c) ? `Buyer: ${c.buyerName}` : `Seller: ${c.sellerName}`}
                      </span>
                      <span className="text-xs" style={{ background: c.status === 'paused' ? 'rgba(255,152,0,0.15)' : 'rgba(76,175,80,0.15)', color: c.status === 'paused' ? '#ff9800' : 'var(--green)', padding: '2px 8px', borderRadius: 8 }}>
                        {c.status}
                      </span>
                    </div>
                    <div className="text-xs text-dim mt-4">
                      {TIRES[c.terms?.tireType]?.n || c.terms?.tireType} — {c.deliveredQty || 0}/{c.terms?.qty} delivered ({progress}%) — ${c.terms?.pricePerUnit}/ea
                    </div>
                    {/* Progress bar */}
                    <div style={{ height: 4, background: 'var(--bg-card)', borderRadius: 2, marginTop: 4 }}>
                      <div style={{ height: '100%', width: `${progress}%`, background: 'var(--green)', borderRadius: 2 }} />
                    </div>
                    {/* Seller allocation controls */}
                    {isSeller(c) && alloc && (
                      <div className="text-xs mt-4" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="text-dim">Allocation: {alloc.percent}%</span>
                        <span className="text-dim">Auto-run: {alloc.autoRun ? 'ON' : 'OFF'}</span>
                        <button className="btn btn-sm btn-outline" disabled={busy} style={{ fontSize: 10, padding: '2px 6px' }}
                          onClick={() => doAction('toggleContractAutoRun', { contractId: c.id })}>
                          {alloc.autoRun ? 'Pause Auto' : 'Enable Auto'}
                        </button>
                      </div>
                    )}
                    <div className="row gap-8 mt-4">
                      {c.status === 'active' && (
                        <button className="btn btn-sm btn-outline" disabled={busy} style={{ fontSize: 11 }}
                          onClick={() => doAction('pauseContract', { contractId: c.id })}>Pause</button>
                      )}
                      {c.status === 'paused' && (
                        <button className="btn btn-sm btn-outline" disabled={busy} style={{ fontSize: 11 }}
                          onClick={() => doAction('resumeContract', { contractId: c.id })}>Resume</button>
                      )}
                      <button className="btn btn-sm" disabled={busy} style={{ fontSize: 11, background: 'rgba(239,83,80,0.15)', color: 'var(--red)', border: '1px solid rgba(239,83,80,0.3)' }}
                        onClick={() => doAction('cancelContract', { contractId: c.id })}>Cancel (10% fee)</button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Active Commodity Contracts */}
            {activeCommodity.length > 0 && (
              <div className="card">
                <div className="card-title">Commodity Supply Contracts ({activeCommodity.length})</div>
                {activeCommodity.map(c => {
                  const isCommoditySeller = c.sellerPlayerId === g.id;
                  return (
                    <div key={c.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                      <div className="row-between">
                        <span className="font-bold text-sm">
                          {isCommoditySeller ? `Buyer: ${c.buyerName}` : `Seller: ${c.sellerName}`}
                        </span>
                        <span className="text-xs" style={{ background: 'rgba(76,175,80,0.15)', color: 'var(--green)', padding: '2px 8px', borderRadius: 8 }}>active</span>
                      </div>
                      <div className="text-xs text-dim mt-4">
                        {c.commodity} — {c.qtyPerDay}/day @ ${c.pricePerUnit}/unit ({c.priceType}) — ends day {c.endDay}
                      </div>
                      <div className="text-xs text-dim">Delivered: {c.deliveredQty || 0} — Revenue: ${(c.totalRevenue || 0).toLocaleString()}</div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Propose New Contract */}
            <div className="card">
              <div className="card-title">Propose Production Contract</div>
              <div className="text-xs text-dim mb-8">Find a factory distributor and propose a contract to buy their branded tires.</div>
              {contractSellers.length === 0 ? (
                <button className="btn btn-sm" disabled={busy} onClick={async () => {
                  setBusy(true);
                  try {
                    const res = await getWholesaleSuppliers();
                    setContractSellers((res || []).filter(s => s.id !== g.id));
                  } catch {}
                  setBusy(false);
                }}>Load Factory Distributors</button>
              ) : (
                <>
                  <div className="text-xs mb-4">
                    <label className="text-dim">Seller</label>
                    <select value={contractForm.sellerId} onChange={e => setContractForm(f => ({ ...f, sellerId: e.target.value }))}
                      style={{ width: '100%', padding: 4, marginTop: 2 }}>
                      <option value="">Select a factory...</option>
                      {contractSellers.map(s => (
                        <option key={s.id} value={s.id}>{s.brandName || s.companyName} (Lv{s.factoryLevel})</option>
                      ))}
                    </select>
                  </div>
                  <div className="row gap-8 mb-4">
                    <div style={{ flex: 1 }}>
                      <label className="text-xs text-dim">Tire Type</label>
                      <select value={contractForm.tireType} onChange={e => setContractForm(f => ({ ...f, tireType: e.target.value }))}
                        style={{ width: '100%', padding: 4, marginTop: 2 }}>
                        {Object.entries(TIRES).filter(([k, t]) => !t.used).map(([k, t]) => (
                          <option key={k} value={k}>{t.n}</option>
                        ))}
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <label className="text-xs text-dim">Total Qty</label>
                      <input type="number" value={contractForm.qty} onChange={e => setContractForm(f => ({ ...f, qty: parseInt(e.target.value) || 0 }))}
                        style={{ width: '100%', padding: 4, marginTop: 2 }} min={100} />
                    </div>
                  </div>
                  <div className="row gap-8 mb-4">
                    <div style={{ flex: 1 }}>
                      <label className="text-xs text-dim">$/unit</label>
                      <input type="number" value={contractForm.pricePerUnit} onChange={e => setContractForm(f => ({ ...f, pricePerUnit: parseInt(e.target.value) || 0 }))}
                        style={{ width: '100%', padding: 4, marginTop: 2 }} min={1} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label className="text-xs text-dim">Duration (days)</label>
                      <input type="number" value={contractForm.durationDays} onChange={e => setContractForm(f => ({ ...f, durationDays: parseInt(e.target.value) || 90 }))}
                        style={{ width: '100%', padding: 4, marginTop: 2 }} min={30} max={365} />
                    </div>
                  </div>
                  <div className="row gap-8 mb-8">
                    <div style={{ flex: 1 }}>
                      <label className="text-xs text-dim">Batch Size</label>
                      <input type="number" value={contractForm.batchSize} onChange={e => setContractForm(f => ({ ...f, batchSize: parseInt(e.target.value) || 50 }))}
                        style={{ width: '100%', padding: 4, marginTop: 2 }} min={10} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label className="text-xs text-dim">Payment</label>
                      <select value={contractForm.paymentTerms} onChange={e => setContractForm(f => ({ ...f, paymentTerms: e.target.value }))}
                        style={{ width: '100%', padding: 4, marginTop: 2 }}>
                        <option value="on_delivery">On Delivery</option>
                        <option value="prepaid">Prepaid</option>
                      </select>
                    </div>
                  </div>
                  <div className="text-xs text-dim mb-4">
                    Total value: ${((contractForm.qty || 0) * (contractForm.pricePerUnit || 0)).toLocaleString()} + 2% commission + $2/tire delivery
                  </div>
                  <button className="btn btn-sm" disabled={busy || !contractForm.sellerId || !contractForm.qty}
                    onClick={() => doAction('proposeContract', contractForm)}>
                    Propose Contract
                  </button>
                </>
              )}
            </div>

            {/* Contract History */}
            {historyP2P.length > 0 && (
              <div className="card">
                <div className="card-title">Contract History</div>
                {historyP2P.map(c => (
                  <div key={c.id} className="row-between text-xs" style={{ padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                    <span>{isSeller(c) ? c.buyerName : c.sellerName} — {TIRES[c.terms?.tireType]?.n || c.terms?.tireType}</span>
                    <span className="text-dim">{c.status} — {c.deliveredQty || 0}/{c.terms?.qty}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        );
      })()}

      {/* ═══ R&D TAB ═══ */}
      {tab === 'rd' && (
        <>
          {/* Active R&D Projects */}
          {activeRD.length > 0 && (
            <div className="card">
              <div className="card-title">Active R&D Projects</div>
              {activeRD.map((proj, i) => {
                const def = RD_PROJECTS.find(r => r.id === proj.id);
                const daysLeft = Math.max(0, (proj.completionDay || 0) - (g.day || 0));
                const totalDays = def?.days || 30;
                const progress = Math.round(((totalDays - daysLeft) / totalDays) * 100);
                return (
                  <div key={i} style={{ marginBottom: i < activeRD.length - 1 ? 8 : 0 }}>
                    <div className="row-between text-sm mb-4">
                      <span className="font-bold">{def?.name || proj.id}</span>
                      <span className="text-dim">{daysLeft}d left</span>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${progress}%`, background: 'var(--accent)' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Available R&D Projects */}
          <div className="card">
            <div className="card-title">Available R&D Projects</div>
            {(fStaff.engineers || 0) < 1 && (
              <div className="text-xs text-red mb-4">Hire at least 1 engineer to start R&D</div>
            )}
          </div>
          {RD_PROJECTS.map(proj => {
            const inProgress = activeRD.some(p => p.id === proj.id);
            const completed = proj.unlocksExclusive && unlockedSpecials.includes(proj.unlocksExclusive);
            const qualityDone = !proj.qualityBoost || (factory?.qualityRating || 0) < 1.0;
            return (
              <div key={proj.id} className="card" style={{ opacity: completed ? 0.5 : 1 }}>
                <div className="font-bold text-sm mb-4">{proj.name}</div>
                <div className="row-between text-xs mb-4">
                  <span className="text-dim">Cost: ${fmt(proj.cost)} | Duration: {proj.days} days</span>
                </div>
                {proj.qualityBoost && <div className="text-xs text-green mb-4">+{Math.round(proj.qualityBoost * 100)}% quality</div>}
                {proj.unlocksExclusive && <div className="text-xs text-accent mb-4">Unlocks: {tireName(proj.unlocksExclusive, g)}</div>}
                {completed ? (
                  <div className="text-xs text-green font-bold">Completed</div>
                ) : (
                  <button className="btn btn-full btn-sm btn-outline"
                    disabled={inProgress || (fStaff.engineers || 0) < 1 || activeRD.length >= 2 || g.cash < proj.cost || busy}
                    onClick={() => doAction('startRDProject', { projectId: proj.id })}>
                    {inProgress ? 'In Progress' : activeRD.length >= 2 ? 'Max 2 Active' : `Start ($${fmt(proj.cost)})`}
                  </button>
                )}
              </div>
            );
          })}

          {/* Certifications */}
          <div className="card">
            <div className="card-title">Certifications</div>
          </div>
          {CERTIFICATIONS.map(cert => {
            const existing = (factory?.certifications || []).find(c => c.id === cert.id);
            const earned = existing?.earned;
            const inProgress = existing && !earned;
            const meetsQuality = !cert.qualityReq || (factory?.qualityRating || 0) >= cert.qualityReq;
            const daysLeft = inProgress ? Math.max(0, (existing.completionDay || 0) - (g.day || 0)) : 0;
            return (
              <div key={cert.id} className="card">
                <div className="row-between mb-4">
                  <span className="font-bold text-sm">{cert.name}</span>
                  {earned && <span className="text-xs" style={{ background: 'var(--green)', color: '#000', padding: '2px 6px', borderRadius: 4 }}>Earned</span>}
                </div>
                <div className="text-xs text-dim mb-4">
                  Cost: ${fmt(cert.cost)} | {cert.days} days | +{cert.repBoost} brand rep
                  {cert.qualityReq && ` | Requires ${Math.round(cert.qualityReq * 100)}% quality`}
                </div>
                {inProgress && (
                  <div className="progress-bar mb-4">
                    <div className="progress-fill" style={{ width: `${Math.round(((cert.days - daysLeft) / cert.days) * 100)}%`, background: 'var(--accent)' }} />
                  </div>
                )}
                {!earned && !inProgress && (
                  <button className="btn btn-full btn-sm btn-outline"
                    disabled={!meetsQuality || g.cash < cert.cost || busy}
                    onClick={() => doAction('startCertification', { certId: cert.id })}>
                    {!meetsQuality ? `Need ${Math.round(cert.qualityReq * 100)}% quality` : `Start ($${fmt(cert.cost)})`}
                  </button>
                )}
              </div>
            );
          })}

          {/* Exclusive Tire Showcase */}
          {unlockedSpecials.length > 0 && (
            <div className="card">
              <div className="card-title">Exclusive Tires</div>
              {unlockedSpecials.map(key => {
                const def = EXCLUSIVE_TIRES[key];
                if (!def) return null;
                return (
                  <div key={key} className="row-between text-sm mb-4">
                    <span className="font-bold">{factory?.brandName} {def.n}</span>
                    <span className="text-dim">Cost: ${def.baseCost} | Sells: ${def.def}</span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ═══ STAFF TAB ═══ */}
      {tab === 'staff' && (
        <>
          <div className="card">
            <div className="card-title">Factory Staff</div>
            <div className="text-xs text-dim mb-4">
              Monthly payroll: <span className="text-red font-bold">${fmt(factoryPayroll)}/mo</span>
            </div>
          </div>

          {Object.entries(FACTORY.staff || {}).map(([role, info]) => {
            const count = fStaff[role] || 0;
            const isMaxed = info.max && count >= info.max;
            return (
              <div key={role} className="card">
                <div className="row-between mb-4">
                  <div>
                    <div className="font-bold text-sm">{info.label}</div>
                    <div className="text-xs text-dim">${fmt(info.salary)}/mo each</div>
                    {info.capacityBoost && <div className="text-xs text-green">+{info.capacityBoost} tires/day capacity each</div>}
                    {info.defectReduce && <div className="text-xs text-green">-{(info.defectReduce * 100).toFixed(0)}% defect rate each</div>}
                    {info.qualityBoost && <div className="text-xs text-green">+{(info.qualityBoost * 100).toFixed(1)}% quality/month each</div>}
                    {info.efficiencyBoost && <div className="text-xs text-green">+{(info.efficiencyBoost * 100).toFixed(0)}% efficiency boost</div>}
                  </div>
                  <div className="font-bold text-accent">{count}{info.max ? `/${info.max}` : ''}</div>
                </div>
                <div className="row gap-8">
                  <button className="btn btn-sm btn-green" style={{ flex: 1 }} disabled={isMaxed || g.cash < info.salary || busy}
                    onClick={() => doAction('hireFactoryStaff', { role })}>
                    {isMaxed ? 'Max' : `Hire ($${fmt(info.salary)})`}
                  </button>
                  <button className="btn btn-sm btn-red" style={{ flex: 1 }} disabled={count <= 0 || busy}
                    onClick={() => doAction('fireFactoryStaff', { role })}>
                    Fire
                  </button>
                </div>
              </div>
            );
          })}

          {/* CFO */}
          <div className="card">
            <div className="row-between mb-4">
              <div>
                <div className="font-bold text-sm">{CFO_ROLE.label}</div>
                <div className="text-xs text-dim">${fmt(CFO_ROLE.salary)}/mo</div>
                <div className="text-xs text-green">Blocks 50% of Vinnie's schemes</div>
              </div>
              <div className="font-bold text-accent">{factory?.hasCFO ? '1/1' : '0/1'}</div>
            </div>
            <div className="row gap-8">
              <button className="btn btn-sm btn-green" style={{ flex: 1 }}
                disabled={factory?.hasCFO || g.cash < CFO_ROLE.salary || busy}
                onClick={() => doAction('hireFactoryCFO')}>
                {factory?.hasCFO ? 'Hired' : `Hire ($${fmt(CFO_ROLE.salary)})`}
              </button>
              <button className="btn btn-sm btn-red" style={{ flex: 1 }}
                disabled={!factory?.hasCFO || busy}
                onClick={() => doAction('fireFactoryCFO')}>
                Fire
              </button>
            </div>
          </div>
        </>
      )}

      {/* ═══ SUPPLY CHAIN TAB ═══ */}
      {tab === 'supply' && (
        <>
          {/* Rubber Farm */}
          <div className="card">
            <div className="card-title">{'\u{1F331}'} Rubber Farm</div>
            {factory?.rubberFarm ? (() => {
              const farmLevel = RUBBER_FARM.levels.find(l => l.level === factory.rubberFarm.level) || RUBBER_FARM.levels[0];
              const nextFarmLevel = RUBBER_FARM.levels.find(l => l.level === factory.rubberFarm.level + 1);
              return (
                <>
                  <div className="row-between text-sm mb-4">
                    <span className="text-dim">Level</span>
                    <span className="font-bold">{farmLevel.level}</span>
                  </div>
                  <div className="row-between text-sm mb-4">
                    <span className="text-dim">Daily Output</span>
                    <span className="font-bold text-green">{farmLevel.dailyOutput} units/day</span>
                  </div>
                  <div className="row-between text-sm mb-4">
                    <span className="text-dim">Operating Cost</span>
                    <span className="font-bold text-red">${fmt(RUBBER_FARM.operatingCost)}/day</span>
                  </div>
                  <div className="text-xs text-dim mb-4">Vulnerable to weather events (production -50%)</div>
                  {nextFarmLevel && (
                    <button className="btn btn-full btn-sm btn-outline" disabled={busy || (g.tireCoins || 0) < nextFarmLevel.upgradeTcCost || g.cash < nextFarmLevel.upgradeCashCost}
                      onClick={() => doAction('upgradeRubberFarm')}>
                      Upgrade to Lv{nextFarmLevel.level} ({nextFarmLevel.upgradeTcCost} TC + ${fmt(nextFarmLevel.upgradeCashCost)})
                    </button>
                  )}
                  {!nextFarmLevel && <div className="text-xs text-green font-bold">Max Level</div>}
                </>
              );
            })() : (
              <>
                <div className="text-sm text-dim mb-4">
                  Grow natural rubber to reduce raw material costs. Produces rubber units daily that lower your effective rubber index.
                </div>
                <button className="btn btn-full btn-green" disabled={busy || (g.tireCoins || 0) < RUBBER_FARM.tcCost}
                  onClick={() => doAction('buyRubberFarm')}>
                  {(g.tireCoins || 0) < RUBBER_FARM.tcCost ? `Need ${RUBBER_FARM.tcCost} TC` : `Buy Rubber Farm (${RUBBER_FARM.tcCost} TC)`}
                </button>
              </>
            )}
          </div>

          {/* Synthetic Lab */}
          <div className="card">
            <div className="card-title">{'\u{1F9EA}'} Synthetic Rubber Lab</div>
            {factory?.syntheticLab ? (() => {
              const labLevel = SYNTHETIC_LAB.levels.find(l => l.level === factory.syntheticLab.level) || SYNTHETIC_LAB.levels[0];
              const nextLabLevel = SYNTHETIC_LAB.levels.find(l => l.level === factory.syntheticLab.level + 1);
              return (
                <>
                  <div className="row-between text-sm mb-4">
                    <span className="text-dim">Level</span>
                    <span className="font-bold">{labLevel.level}</span>
                  </div>
                  <div className="row-between text-sm mb-4">
                    <span className="text-dim">Daily Output</span>
                    <span className="font-bold text-green">{labLevel.dailyOutput} units/day</span>
                  </div>
                  <div className="row-between text-sm mb-4">
                    <span className="text-dim">Operating Cost</span>
                    <span className="font-bold text-red">${fmt(SYNTHETIC_LAB.operatingCost)}/day</span>
                  </div>
                  <div className="text-xs text-green mb-4">Immune to weather events</div>
                  <div className="text-xs text-dim mb-4">Increases chemical index slightly (+{SYNTHETIC_LAB.chemicalIndexIncrease}/mo)</div>
                  {nextLabLevel && (
                    <button className="btn btn-full btn-sm btn-outline" disabled={busy || (g.tireCoins || 0) < nextLabLevel.upgradeTcCost || g.cash < nextLabLevel.upgradeCashCost}
                      onClick={() => doAction('upgradeSyntheticLab')}>
                      Upgrade to Lv{nextLabLevel.level} ({nextLabLevel.upgradeTcCost} TC + ${fmt(nextLabLevel.upgradeCashCost)})
                    </button>
                  )}
                  {!nextLabLevel && <div className="text-xs text-green font-bold">Max Level</div>}
                </>
              );
            })() : (
              <>
                <div className="text-sm text-dim mb-4">
                  Produce synthetic rubber — more effective than natural, immune to weather, but increases chemical costs.
                </div>
                <button className="btn btn-full btn-green" disabled={busy || (g.tireCoins || 0) < SYNTHETIC_LAB.tcCost || g.cash < SYNTHETIC_LAB.cashCost}
                  onClick={() => doAction('buySyntheticLab')}>
                  {(g.tireCoins || 0) < SYNTHETIC_LAB.tcCost
                    ? `Need ${SYNTHETIC_LAB.tcCost} TC`
                    : g.cash < SYNTHETIC_LAB.cashCost
                      ? `Need $${fmt(SYNTHETIC_LAB.cashCost)}`
                      : `Buy Synthetic Lab (${SYNTHETIC_LAB.tcCost} TC + $${fmt(SYNTHETIC_LAB.cashCost)})`}
                </button>
              </>
            )}
          </div>

          {/* Rubber Storage */}
          <div className="card">
            <div className="card-title">Rubber Storage</div>
            {factory?.rubberStorage ? (() => {
              const storageLvl = factory.rubberStorage.level;
              const storageDef = RUBBER_STORAGE.levels.find(l => l.level === storageLvl) || RUBBER_STORAGE.levels[0];
              const nextStorage = RUBBER_STORAGE.levels.find(l => l.level === storageLvl + 1);
              const natRubber = factory.naturalRubber || 0;
              const synRubber = factory.syntheticRubber || 0;
              const totalRubber = natRubber + synRubber;
              const pctUsed = storageDef.capacity > 0 ? Math.round(totalRubber / storageDef.capacity * 100) : 0;

              // Daily consumption estimate
              const dailyProd = factory.dailyCapacity || 0;
              const avgRubberPerTire = 1.5; // rough average
              const daysRemaining = dailyProd > 0 && totalRubber > 0 ? Math.floor(totalRubber / (dailyProd * avgRubberPerTire)) : 0;

              return (
                <>
                  <div className="row-between text-sm mb-4">
                    <span className="text-dim">Level {storageLvl}</span>
                    <span className="font-bold">{totalRubber} / {storageDef.capacity} ({pctUsed}%)</span>
                  </div>
                  <div style={{ background: 'var(--border)', borderRadius: 4, height: 14, marginBottom: 8, overflow: 'hidden', display: 'flex' }}>
                    <div style={{ width: `${storageDef.capacity > 0 ? (natRubber / storageDef.capacity * 100) : 0}%`, background: '#4caf50', height: '100%' }} />
                    <div style={{ width: `${storageDef.capacity > 0 ? (synRubber / storageDef.capacity * 100) : 0}%`, background: '#2196f3', height: '100%' }} />
                  </div>
                  <div className="row gap-8 text-xs mb-4">
                    <span style={{ color: '#4caf50' }}>Natural: {natRubber}</span>
                    <span style={{ color: '#2196f3' }}>Synthetic: {synRubber}</span>
                  </div>
                  {daysRemaining > 0 && (
                    <div className="text-xs text-dim mb-4">~{daysRemaining} days of rubber remaining</div>
                  )}
                  {nextStorage && (
                    <button className="btn btn-full btn-sm btn-outline" disabled={busy || g.cash < nextStorage.upgradeCost || (g.tireCoins || 0) < nextStorage.upgradeTcCost}
                      onClick={() => doAction('upgradeRubberStorage')}>
                      Upgrade to Lv{nextStorage.level} — {nextStorage.capacity} cap (${fmt(nextStorage.upgradeCost)} + {nextStorage.upgradeTcCost} TC)
                    </button>
                  )}
                  {!nextStorage && <div className="text-xs text-green font-bold">Max Level</div>}
                </>
              );
            })() : (
              <>
                <div className="text-sm text-dim mb-4">
                  Required to store rubber from your farm/lab. Without storage, production is paused.
                </div>
                <button className="btn btn-full btn-green" disabled={busy || g.cash < RUBBER_STORAGE.levels[0].buildCost}
                  onClick={() => doAction('buildRubberStorage')}>
                  Build Storage — {RUBBER_STORAGE.levels[0].capacity} capacity (${fmt(RUBBER_STORAGE.levels[0].buildCost)})
                </button>
              </>
            )}
          </div>

          {/* Rubber Preference */}
          {factory?.rubberStorage && (
            <div className="card">
              <div className="card-title">Rubber Preference</div>
              <div className="text-xs text-dim mb-4">Controls which rubber type is consumed first when producing tires.</div>
              <div className="row gap-8">
                {['auto', 'natural', 'synthetic'].map(pref => (
                  <button key={pref} disabled={busy}
                    className={`btn btn-sm ${(factory.rubberPreference || 'auto') === pref ? 'btn-accent' : 'btn-outline'}`}
                    style={{ flex: 1, textTransform: 'capitalize' }}
                    onClick={() => doAction('setRubberPreference', { preference: pref })}>
                    {pref}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Buy Rubber from NPC Market */}
          {factory?.rubberStorage && (
            <div className="card">
              <div className="card-title">Buy Rubber (Market)</div>
              <div className="row gap-8 mb-4">
                <select value={buyRubberType} onChange={e => setBuyRubberType(e.target.value)}
                  style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }}>
                  <option value="natural">Natural (${ Math.round((rm.rubber || 1) * 500)}/u)</option>
                  <option value="synthetic">Synthetic (${ Math.round((rm.rubber || 1) * 600)}/u)</option>
                </select>
                <input type="number" min={1} max={500} value={buyRubberQty}
                  onChange={e => setBuyRubberQty(Math.max(1, parseInt(e.target.value) || 1))}
                  style={{ width: 70, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', textAlign: 'center' }} />
              </div>
              <button className="btn btn-full btn-sm btn-green" disabled={busy}
                onClick={() => doAction('buyRubberMarket', { rubberType: buyRubberType, qty: buyRubberQty })}>
                Buy {buyRubberQty} {buyRubberType} (${fmt(Math.round((rm.rubber || 1) * (buyRubberType === 'natural' ? 500 : 600)) * buyRubberQty)})
              </button>
            </div>
          )}

          {/* Sell Rubber */}
          {factory?.rubberStorage && ((factory.naturalRubber || 0) + (factory.syntheticRubber || 0)) > 0 && (
            <div className="card">
              <div className="card-title">Sell Rubber</div>
              <div className="row gap-8 mb-4">
                <select value={sellRubberType} onChange={e => setSellRubberType(e.target.value)}
                  style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }}>
                  <option value="natural">Natural ({factory.naturalRubber || 0} avail)</option>
                  <option value="synthetic">Synthetic ({factory.syntheticRubber || 0} avail)</option>
                </select>
                <input type="number" min={1}
                  max={sellRubberType === 'natural' ? (factory.naturalRubber || 0) : (factory.syntheticRubber || 0)}
                  value={sellRubberQty}
                  onChange={e => setSellRubberQty(Math.max(1, parseInt(e.target.value) || 1))}
                  style={{ width: 70, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', textAlign: 'center' }} />
              </div>
              <button className="btn btn-full btn-sm btn-green" disabled={busy}
                onClick={() => doAction('sellRubberSurplus', { rubberType: sellRubberType, qty: sellRubberQty })}>
                Sell {sellRubberQty} {sellRubberType} (${fmt(Math.round((rm.rubber || 1) * (sellRubberType === 'natural' ? 500 : 600)) * sellRubberQty)})
              </button>
            </div>
          )}

          {/* Market Rubber Price Reference */}
          <div className="card">
            <div className="card-title">Rubber Market</div>
            <div className="row-between text-sm mb-4">
              <span className="text-dim">Commodity Rubber Index</span>
              <span className="font-bold">{(rm.rubber * 100).toFixed(0)}%</span>
            </div>
            <div className="row-between text-sm mb-4">
              <span className="text-dim">NPC Natural Price</span>
              <span className="font-bold">${fmt(Math.round((rm.rubber || 1) * 500))}/unit</span>
            </div>
            <div className="row-between text-sm mb-4">
              <span className="text-dim">NPC Synthetic Price</span>
              <span className="font-bold">${fmt(Math.round((rm.rubber || 1) * 600))}/unit</span>
            </div>
          </div>

          {/* Material Suppliers */}
          <div className="card">
            <div className="card-title">Material Suppliers</div>
            <div className="text-xs text-dim mb-4">Choose suppliers for steel and chemicals. Better suppliers cost more but reduce defects.</div>
            {Object.entries(MATERIAL_SUPPLIERS).map(([material, tiers]) => {
              const currentSupplierId = factory?.suppliers?.[material] || tiers.find(t => t.id.includes('standard'))?.id || tiers[1]?.id;
              return (
                <div key={material} style={{ marginBottom: 12 }}>
                  <div className="font-bold text-sm mb-4" style={{ textTransform: 'capitalize' }}>{material}</div>
                  {tiers.map(tier => {
                    const isSelected = currentSupplierId === tier.id;
                    const meetsRep = (factory?.brandReputation || 0) >= tier.minRep;
                    const priceLabel = tier.priceMod < 1
                      ? `-${Math.round((1 - tier.priceMod) * 100)}% cost`
                      : tier.priceMod > 1
                        ? `+${Math.round((tier.priceMod - 1) * 100)}% cost`
                        : 'Base cost';
                    const qualityLabel = tier.qualityMod > 1
                      ? `+${Math.round((tier.qualityMod - 1) * 100)}% defects`
                      : tier.qualityMod < 1
                        ? `-${Math.round((1 - tier.qualityMod) * 100)}% defects`
                        : 'Base quality';
                    return (
                      <div key={tier.id}
                        style={{
                          padding: '8px',
                          marginBottom: 4,
                          borderRadius: 6,
                          border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border)',
                          background: isSelected ? 'rgba(78,168,222,0.08)' : undefined,
                          opacity: !meetsRep ? 0.5 : 1,
                          cursor: meetsRep && !isSelected ? 'pointer' : 'default',
                        }}
                        onClick={() => {
                          if (meetsRep && !isSelected && !busy) {
                            doAction('setMaterialSupplier', { material, supplierId: tier.id });
                          }
                        }}
                      >
                        <div className="row-between mb-4">
                          <div className="row gap-8" style={{ alignItems: 'center' }}>
                            <span style={{
                              width: 14, height: 14, borderRadius: '50%',
                              border: '2px solid var(--accent)',
                              background: isSelected ? 'var(--accent)' : 'transparent',
                              display: 'inline-block', flexShrink: 0,
                            }} />
                            <span className="font-bold text-sm">{tier.label}</span>
                          </div>
                          {isSelected && <span className="text-xs text-accent font-bold">Active</span>}
                        </div>
                        <div className="row gap-8 text-xs" style={{ flexWrap: 'wrap', marginLeft: 22 }}>
                          <span style={{ color: tier.priceMod < 1 ? 'var(--green)' : tier.priceMod > 1 ? 'var(--red)' : undefined }}>{priceLabel}</span>
                          <span style={{ color: tier.qualityMod > 1 ? 'var(--red)' : tier.qualityMod < 1 ? 'var(--green)' : undefined }}>{qualityLabel}</span>
                          <span className="text-dim">Reliability: {Math.round(tier.reliability * 100)}%</span>
                        </div>
                        {!meetsRep && tier.minRep > 0 && (
                          <div className="text-xs text-red" style={{ marginLeft: 22, marginTop: 2 }}>
                            Requires {tier.minRep} brand rep (you have {Math.round(factory?.brandReputation || 0)})
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
