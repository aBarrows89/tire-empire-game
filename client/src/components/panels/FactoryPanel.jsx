import React, { useState } from 'react';
import { useGame } from '../../context/GameContext.jsx';
import { postAction } from '../../api/client.js';
import { FACTORY } from '@shared/constants/factory.js';
import { RAW_MATERIALS, RD_PROJECTS, CERTIFICATIONS, FACTORY_DISCOUNT_TIERS_DEFAULT, EXCLUSIVE_TIRES, CFO_ROLE, RUBBER_FARM, SYNTHETIC_LAB } from '@shared/constants/factoryBrand.js';
import { TIRES } from '@shared/constants/tires.js';
import { fmt } from '@shared/helpers/format.js';
import { getEffectiveProductionCost, computeTireAttributes, tireName } from '@shared/helpers/factoryBrand.js';
import { hapticsMedium } from '../../api/haptics.js';

const PRODUCIBLE_TYPES = Object.keys(FACTORY.productionCost);

export default function FactoryPanel() {
  const { state, refreshState } = useGame();
  const g = state.game;
  const [busy, setBusy] = useState(false);
  const [selectedType, setSelectedType] = useState(PRODUCIBLE_TYPES[0]);
  const [qty, setQty] = useState(10);
  const [brandName, setBrandName] = useState('');
  const [tab, setTab] = useState('dashboard');

  const factory = g.factory || null;
  const hasFactory = !!g.hasFactory;

  const doAction = async (action, params = {}) => {
    setBusy(true);
    const res = await postAction(action, params);
    if (res.ok) { hapticsMedium(); refreshState(); }
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
  const queue = factory?.productionQueue || [];
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

  const TABS = [['dashboard', 'Dashboard'], ['production', 'Production'], ['wholesale', 'Wholesale'], ['rd', 'R&D'], ['staff', 'Staff'], ['supply', 'Supply Chain']];

  return (
    <>
      {/* Tab navigation */}
      <div className="card">
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
      {tab === 'production' && (
        <>
          {/* Current Production Line */}
          {factory?.currentLine && (
            <div className="card">
              <div className="card-title">Current Line</div>
              <div className="row-between mb-4">
                <span className="text-sm text-dim">Active Type</span>
                <span className="font-bold">{tireName(factory.currentLine, g)}</span>
              </div>
              {(factory.switchCooldown || 0) > 0 && (
                <div className="text-xs text-red mb-4">Line switching cooldown: {factory.switchCooldown} day(s)</div>
              )}
            </div>
          )}

          {/* Production Queue */}
          {queue.length > 0 && (
            <div className="card">
              <div className="card-title">Production Queue</div>
              {queue.map((job, i) => {
                const baseKey = job.tire.replace('brand_', '');
                const displayName = tireName(job.tire, g);
                const daysLeft = Math.max(0, (job.completionDay || 0) - (g.day || 0));
                const totalDays = Math.max(1, (job.completionDay || 0) - (job.startDay || 0));
                const progress = Math.round(((totalDays - daysLeft) / totalDays) * 100);
                return (
                  <div key={i} style={{ marginBottom: i < queue.length - 1 ? 8 : 0 }}>
                    <div className="row-between text-sm mb-4">
                      <span className="font-bold">{displayName}</span>
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
            {factory?.currentLine && factory.currentLine !== selectedType && (
              <div className="text-xs text-red mb-4">Line switch required: +1 day cooldown</div>
            )}
            <button className="btn btn-full btn-green" disabled={g.cash < totalCost || qty < 1 || busy}
              onClick={() => doAction('produceFactoryTires', { tire: selectedType, qty })}>
              {busy ? 'Starting...' : g.cash < totalCost ? 'Not Enough Cash' : `Produce ${qty} tires`}
            </button>
          </div>
        </>
      )}

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
            return (
              <div key={type} className="card">
                <div className="font-bold text-sm mb-4">{factory?.brandName ? `${factory.brandName} ${t?.n || type}` : (t?.n || type)}</div>
                <div className="row-between text-xs mb-4">
                  <span className="text-dim">Production cost: ${prodCost} (base ${baseProdCost})</span>
                  <span className={margin > 0 ? 'text-green' : 'text-red'}>Margin: ${margin} ({marginPct}%)</span>
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
        </>
      )}

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

          {/* Rubber Supply */}
          <div className="card">
            <div className="card-title">Rubber Supply</div>
            <div className="row-between text-sm mb-4">
              <span className="text-dim">Accumulated Units</span>
              <span className="font-bold">{factory?.rubberSupply || 0}</span>
            </div>
            <div className="row-between text-sm mb-4">
              <span className="text-dim">Effective Rubber Index</span>
              <span className={`font-bold ${(factory?._effectiveRubberIndex || rm.rubber) < 0.9 ? 'text-green' : 'text-accent'}`}>
                {((factory?._effectiveRubberIndex || rm.rubber) * 100).toFixed(0)}%
              </span>
            </div>
            <div className="row-between text-sm mb-4">
              <span className="text-dim">Market Rubber Price</span>
              <span className="font-bold">{(rm.rubber * 100).toFixed(0)}%</span>
            </div>
            {(factory?.rubberSupply || 0) > 0 && (() => {
              const pricePerUnit = Math.round((rm.rubber || 1.0) * 500);
              const totalValue = (factory?.rubberSupply || 0) * pricePerUnit;
              return (
                <button className="btn btn-full btn-sm btn-green" disabled={busy}
                  onClick={() => doAction('sellRubberSurplus')}>
                  Sell {factory.rubberSupply} units (${fmt(totalValue)})
                </button>
              );
            })()}
            {(factory?.rubberSupply || 0) === 0 && (
              <div className="text-xs text-dim">No surplus to sell. Build a farm or lab to produce rubber.</div>
            )}
          </div>
        </>
      )}
    </>
  );
}
