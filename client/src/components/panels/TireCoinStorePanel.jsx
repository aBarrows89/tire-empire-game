import React, { useState } from 'react';
import { useGame } from '../../context/GameContext.jsx';
import { MONET } from '@shared/constants/monetization.js';
import { TC_RUSH, TC_SUPPLIER_ACCESS, TC_INTEL, TC_FINANCIAL, TC_OPERATIONS } from '@shared/constants/tcUtility.js';
import { postAction } from '../../api/client.js';
import { hapticsMedium } from '../../api/haptics.js';

function TCBalance({ g }) {
  const baseCap = MONET.tcStorage?.baseCap || 500;
  const premBonus = g.isPremium ? (MONET.tcStorage?.premiumBonus || 1500) : 0;
  const upgBonus = (MONET.tcStorage?.upgrades || [])
    .filter(u => u.level <= (g.tcStorageLevel || 0))
    .reduce((a, u) => a + u.addCap, 0);
  const cap = baseCap + premBonus + upgBonus;
  const pct = cap > 0 ? Math.round(((g.tireCoins || 0) / cap) * 100) : 0;

  return (
    <div className="card" style={{ borderLeft: '3px solid var(--gold)' }}>
      <div className="row-between mb-4">
        <span className="text-sm text-dim">TireCoins</span>
        <span className="font-bold text-gold" style={{ fontSize: 20 }}>🪙 {g.tireCoins || 0}</span>
      </div>
      <div className="progress-bar mb-4">
        <div className="progress-fill" style={{ width: `${Math.min(100, pct)}%`, background: pct >= 90 ? 'var(--red)' : 'var(--gold)' }} />
      </div>
      <div className="row-between">
        <span className="text-xs text-dim">Storage: {g.tireCoins || 0} / {cap}</span>
        {pct >= 90 && <span className="text-xs" style={{ color: 'var(--red)' }}>⚠️ Almost full!</span>}
      </div>
    </div>
  );
}

function StoreSection({ title, icon, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card">
      <div className="row-between" onClick={() => setOpen(!open)} style={{ cursor: 'pointer' }}>
        <div className="card-title" style={{ margin: 0 }}>{icon} {title}</div>
        <span style={{ fontSize: 18 }}>{open ? '▾' : '▸'}</span>
      </div>
      {open && <div style={{ marginTop: 12 }}>{children}</div>}
    </div>
  );
}

function StoreItem({ name, cost, description, onBuy, busy, disabled, disabledReason, tc }) {
  const canAfford = (tc || 0) >= cost;
  return (
    <div style={{ padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <div className="row-between">
        <div>
          <div className="font-bold text-sm">{name}</div>
          <div className="text-xs text-dim" style={{ marginTop: 2 }}>{description}</div>
          {disabled && disabledReason && <div className="text-xs" style={{ color: 'var(--yellow)', marginTop: 2 }}>{disabledReason}</div>}
        </div>
        <button
          className="btn btn-sm"
          style={{
            background: canAfford && !disabled ? 'var(--gold)' : 'rgba(255,255,255,0.1)',
            color: canAfford && !disabled ? '#000' : 'var(--text-dim)',
            minWidth: 70,
            opacity: disabled ? 0.5 : 1,
          }}
          onClick={onBuy}
          disabled={!canAfford || busy || disabled}
        >
          {busy ? '...' : `${cost} TC`}
        </button>
      </div>
    </div>
  );
}

function PurchaseTier({ tier, g, onBuy, busy }) {
  const isFirst = !g._firstTcPurchase;
  const displayTC = isFirst ? tier.tc * 2 : g.isPremium ? Math.floor(tier.tc * 1.2) : tier.tc;
  const bonusLabel = isFirst ? '2X FIRST PURCHASE!' : g.isPremium ? '+20% PRO Bonus' : tier.bonus > 0 ? `+${tier.bonus} bonus` : null;

  return (
    <div
      style={{
        padding: 12,
        borderRadius: 8,
        border: tier.popular ? '2px solid var(--gold)' : '1px solid rgba(255,255,255,0.1)',
        background: tier.popular ? 'rgba(255,215,0,0.05)' : 'transparent',
        marginBottom: 8,
        position: 'relative',
      }}
    >
      {tier.popular && (
        <div style={{
          position: 'absolute', top: -10, right: 12, background: 'var(--gold)', color: '#000',
          fontSize: 10, fontWeight: 'bold', padding: '2px 8px', borderRadius: 4,
        }}>MOST POPULAR</div>
      )}
      <div className="row-between">
        <div>
          <div className="font-bold">{tier.label}</div>
          <div className="text-gold font-bold" style={{ fontSize: 18 }}>🪙 {displayTC} TC</div>
          {bonusLabel && <div className="text-xs" style={{ color: isFirst ? 'var(--green)' : 'var(--gold)' }}>{bonusLabel}</div>}
        </div>
        <button
          className="btn"
          style={{ background: 'var(--green)', color: '#fff', fontWeight: 'bold', minWidth: 80 }}
          onClick={() => onBuy(tier.id)}
          disabled={busy}
        >
          ${tier.price}
        </button>
      </div>
    </div>
  );
}

export default function TireCoinStorePanel() {
  const { state, refreshState } = useGame();
  const g = state.game;
  const [busy, setBusy] = useState(null);

  const doAction = async (action, params = {}) => {
    setBusy(action);
    try {
      await postAction(action, params);
      hapticsMedium();
      await refreshState();
    } catch (e) {
      // Error handled by postAction toast
    }
    setBusy(null);
  };

  const tc = g.tireCoins || 0;
  const purchaseTiers = MONET.tcPurchase?.tiers || [];

  return (
    <>
      <TCBalance g={g} />

      {/* ── BUY TC ── */}
      <StoreSection title="Buy TireCoins" icon="💰" defaultOpen={true}>
        {purchaseTiers.map(tier => (
          <PurchaseTier
            key={tier.id}
            tier={tier}
            g={g}
            onBuy={(tierId) => doAction('purchaseTC', { tierId })}
            busy={busy === 'purchaseTC'}
          />
        ))}
        {!g.isPremium && (
          <div className="text-xs text-dim" style={{ marginTop: 8, textAlign: 'center' }}>
            PRO members get 20% bonus TC on all purchases
          </div>
        )}
      </StoreSection>

      {/* ── RUSH TIMERS ── */}
      <StoreSection title="Rush Timers" icon="⏩">
        <StoreItem
          name="Rush Retread"
          cost={TC_RUSH.retreading.cost}
          description="Complete all pending retreads instantly"
          onBuy={() => doAction('rushRetread')}
          busy={busy === 'rushRetread'}
          disabled={!(g.retreadQueue || []).some(r => r.completionDay > g.day)}
          disabledReason="No retreads in progress"
          tc={tc}
        />
        <StoreItem
          name="Fast-Track Grand Opening"
          cost={TC_RUSH.shopConstruction.cost}
          description="Finish shop construction instantly"
          onBuy={() => doAction('rushShopConstruction')}
          busy={busy === 'rushShopConstruction'}
          disabled={!g._pendingShop}
          disabledReason="No shop under construction"
          tc={tc}
        />
        <StoreItem
          name="Expedite Production"
          cost={TC_RUSH.factoryBatch.costPerDay * 3}
          description={`Skip up to 50% of production time (${TC_RUSH.factoryBatch.costPerDay} TC/day skipped)`}
          onBuy={() => doAction('rushFactoryBatch')}
          busy={busy === 'rushFactoryBatch'}
          disabled={!g.hasFactory || !(g.factory?.productionQueue || []).some(q => q.completionDay > g.day)}
          disabledReason={!g.hasFactory ? 'No factory' : 'No production in progress'}
          tc={tc}
        />
        <StoreItem
          name="Accelerate R&D"
          cost={TC_RUSH.rdProject.costPerDay * 5}
          description={`Skip up to 30% of R&D time (${TC_RUSH.rdProject.costPerDay} TC/day skipped)`}
          onBuy={() => doAction('rushRDProject')}
          busy={busy === 'rushRDProject'}
          disabled={!g.factory?.rdProjects?.some(p => !p.earned && p.completionDay > g.day)}
          disabledReason="No R&D in progress"
          tc={tc}
        />
      </StoreSection>

      {/* ── VINNIE'S CONNECTIONS ── */}
      <StoreSection title="Vinnie's Connections" icon="🤝">
        <StoreItem
          name="Unlock Supplier Early"
          cost={TC_SUPPLIER_ACCESS.premiumSupplierUnlock.cost}
          description={`Reduce supplier rep requirement by ${TC_SUPPLIER_ACCESS.premiumSupplierUnlock.repDiscount} (${TC_SUPPLIER_ACCESS.premiumSupplierUnlock.maxUses - (g._supplierUnlockUses || 0)} uses left)`}
          onBuy={() => doAction('buySupplierAccess')}
          busy={busy === 'buySupplierAccess'}
          disabled={(g._supplierUnlockUses || 0) >= TC_SUPPLIER_ACCESS.premiumSupplierUnlock.maxUses}
          disabledReason="All uses spent"
          tc={tc}
        />
        <StoreItem
          name="Priority Restocking"
          cost={TC_SUPPLIER_ACCESS.priorityRestocking.cost}
          description="First dibs on supply during crunches for 7 days"
          onBuy={() => doAction('buyPriorityRestock')}
          busy={busy === 'buyPriorityRestock'}
          disabled={g._priorityRestock && g.day < g._priorityRestock.expiresDay}
          disabledReason={g._priorityRestock ? `Active (${g._priorityRestock.expiresDay - g.day} days left)` : null}
          tc={tc}
        />
      </StoreSection>

      {/* ── INTELLIGENCE ── */}
      <StoreSection title="Market Intelligence" icon="🔍">
        <StoreItem
          name="City Demand Heatmap"
          cost={TC_INTEL.cityDemandHeatmap.cost}
          description={`See real-time demand across all cities (${TC_INTEL.cityDemandHeatmap.duration} days)`}
          onBuy={() => doAction('buyDemandHeatmap')}
          busy={busy === 'buyDemandHeatmap'}
          disabled={g.demandHeatmap && g.day < g.demandHeatmap.expiresDay}
          disabledReason={g.demandHeatmap ? `Active (${g.demandHeatmap.expiresDay - g.day} days left)` : null}
          tc={tc}
        />
        <StoreItem
          name="Competitor Pricing"
          cost={TC_INTEL.competitorPricing.cost}
          description={`See exact pricing of all shops in your cities (${TC_INTEL.competitorPricing.duration} days)`}
          onBuy={() => doAction('buyCompetitorPricing')}
          busy={busy === 'buyCompetitorPricing'}
          disabled={g.competitorPricing && g.day < g.competitorPricing.expiresDay}
          disabledReason={g.competitorPricing ? `Active (${g.competitorPricing.expiresDay - g.day} days left)` : null}
          tc={tc}
        />
        <StoreItem
          name="Supplier Forecast"
          cost={TC_INTEL.supplierForecast.cost}
          description={`Predicted supplier prices for 30 days (75% accurate)`}
          onBuy={() => doAction('buySupplierForecast')}
          busy={busy === 'buySupplierForecast'}
          disabled={g.supplierForecast && g.day < g.supplierForecast.expiresDay}
          disabledReason={g.supplierForecast ? `Active (${g.supplierForecast.expiresDay - g.day} days left)` : null}
          tc={tc}
        />
        <StoreItem
          name="Stock Insider Tip"
          cost={TC_INTEL.stockInsider.cost}
          description="Vinnie's market direction tip (75% reliable)"
          onBuy={() => doAction('buyStockInsider')}
          busy={busy === 'buyStockInsider'}
          disabled={g.stockInsiderTip && g.day < g.stockInsiderTip.expiresDay}
          disabledReason={g.stockInsiderTip ? `Tip active: market trending ${g.stockInsiderTip.tip}` : null}
          tc={tc}
        />
        <StoreItem
          name="Market Intel"
          cost={MONET.marketIntelCost || 100}
          description={`${MONET.marketIntelDuration || 7}-day city demand analysis`}
          onBuy={() => doAction('buyMarketIntel')}
          busy={busy === 'buyMarketIntel'}
          disabled={g.marketIntel && g.day < g.marketIntel.expiresDay}
          disabledReason={g.marketIntel ? `Active (${g.marketIntel.expiresDay - g.day} days left)` : null}
          tc={tc}
        />
      </StoreSection>

      {/* ── FINANCIAL PERKS ── */}
      <StoreSection title="Financial Perks" icon="🏦">
        <StoreItem
          name="Loan Rate Reduction"
          cost={TC_FINANCIAL.loanRateReduction.cost}
          description={`Permanently reduce loan rates by ${TC_FINANCIAL.loanRateReduction.rateReduction * 100}% (${TC_FINANCIAL.loanRateReduction.maxReductions - (g._loanRateReductions || 0)} left)`}
          onBuy={() => doAction('buyLoanRateReduction')}
          busy={busy === 'buyLoanRateReduction'}
          disabled={(g._loanRateReductions || 0) >= TC_FINANCIAL.loanRateReduction.maxReductions}
          disabledReason="Max reductions reached"
          tc={tc}
        />
        <StoreItem
          name="Emergency Credit Line"
          cost={TC_FINANCIAL.creditLine.cost}
          description={`$${(TC_FINANCIAL.creditLine.cashAmount/1000)}K cash, ${TC_FINANCIAL.creditLine.interestRate*100}% interest, ${TC_FINANCIAL.creditLine.repaymentDays} days`}
          onBuy={() => doAction('buyCreditLine')}
          busy={busy === 'buyCreditLine'}
          disabled={g._activeCreditLine && g._activeCreditLine.remaining > 0}
          disabledReason="Already have active credit line"
          tc={tc}
        />
        <StoreItem
          name="Insurance Boost"
          cost={TC_FINANCIAL.insuranceUpgrade.cost}
          description={`+${Math.round(TC_FINANCIAL.insuranceUpgrade.coverageBoost * 100)}% coverage for ${TC_FINANCIAL.insuranceUpgrade.duration} days`}
          onBuy={() => doAction('buyInsuranceUpgrade')}
          busy={busy === 'buyInsuranceUpgrade'}
          disabled={g._insuranceBoost && g.day < g._insuranceBoost.expiresDay}
          disabledReason={g._insuranceBoost ? `Active (${g._insuranceBoost.expiresDay - g.day} days left)` : null}
          tc={tc}
        />
      </StoreSection>

      {/* ── BOOSTS ── */}
      <StoreSection title="Boosts" icon="🚀">
        <StoreItem
          name="Marketing Blitz"
          cost={75}
          description="+50% customer traffic for 7 days"
          onBuy={() => doAction('buyMarketingBlitz')}
          busy={busy === 'buyMarketingBlitz'}
          disabled={g.marketingBlitz && g.day < g.marketingBlitz.expiresDay}
          disabledReason={g.marketingBlitz ? `Active (${g.marketingBlitz.expiresDay - g.day} days left)` : null}
          tc={tc}
        />
        <StoreItem
          name="Reputation Boost"
          cost={150}
          description="+5 reputation for 14 days"
          onBuy={() => doAction('buyRepBoost')}
          busy={busy === 'buyRepBoost'}
          disabled={g.repBoost && g.day < g.repBoost.expiresDay}
          disabledReason={g.repBoost ? `Active (${g.repBoost.expiresDay - g.day} days left)` : null}
          tc={tc}
        />
      </StoreSection>

      {/* ── STAFF & OPERATIONS ── */}
      <StoreSection title="Staff & Operations" icon="👥">
        <div className="text-xs text-dim" style={{ marginBottom: 8 }}>
          Select a location first, then hire elite staff or start training.
        </div>
        {(g.locations || []).map(loc => {
          const city = loc.cityId;
          return (
            <div key={loc.id} style={{ marginBottom: 12 }}>
              <div className="text-sm font-bold" style={{ marginBottom: 4 }}>📍 {city}</div>
              <StoreItem
                name="Elite Tech"
                cost={TC_OPERATIONS.eliteHire.cost}
                description="1.5x productivity tech"
                onBuy={() => doAction('hireElite', { locationId: loc.id, role: 'techs' })}
                busy={busy === 'hireElite'}
                disabled={loc._eliteStaff?.techs}
                disabledReason="Already hired"
                tc={tc}
              />
              <StoreItem
                name="Elite Sales"
                cost={TC_OPERATIONS.eliteHire.cost}
                description="1.5x productivity salesperson"
                onBuy={() => doAction('hireElite', { locationId: loc.id, role: 'sales' })}
                busy={busy === 'hireElite'}
                disabled={loc._eliteStaff?.sales}
                disabledReason="Already hired"
                tc={tc}
              />
              <StoreItem
                name="Staff Training"
                cost={TC_OPERATIONS.trainingProgram.cost}
                description={`Permanent +${Math.round(TC_OPERATIONS.trainingProgram.boost * 100)}% productivity (${TC_OPERATIONS.trainingProgram.duration} days)`}
                onBuy={() => doAction('buyTrainingProgram', { locationId: loc.id })}
                busy={busy === 'buyTrainingProgram'}
                disabled={loc._trainingComplete || loc._trainingInProgress}
                disabledReason={loc._trainingComplete ? 'Training complete' : loc._trainingInProgress ? 'In progress' : null}
                tc={tc}
              />
            </div>
          );
        })}
        {(g.locations || []).length === 0 && (
          <div className="text-sm text-dim">Open a shop first to unlock staff options.</div>
        )}
      </StoreSection>

      {/* ── COSMETICS ── */}
      <StoreSection title="Cosmetics" icon="✨">
        {(MONET.cosmetics || []).map(item => (
          <StoreItem
            key={item.id}
            name={item.n}
            cost={item.cost}
            description={item.desc}
            onBuy={() => doAction('buyCosmetic', { cosmeticId: item.id })}
            busy={busy === 'buyCosmetic'}
            disabled={(g.cosmetics || []).includes(item.id)}
            disabledReason="Owned"
            tc={tc}
          />
        ))}
      </StoreSection>

      {/* ── TC STORAGE UPGRADE ── */}
      <StoreSection title="TC Storage" icon="📦">
        {(MONET.tcStorage?.upgrades || []).map(upg => {
          const owned = (g.tcStorageLevel || 0) >= upg.level;
          return (
            <StoreItem
              key={upg.level}
              name={`Storage Level ${upg.level}`}
              cost={upg.tcCost}
              description={`+${upg.addCap} TC capacity`}
              onBuy={() => doAction('upgradeTcStorage')}
              busy={busy === 'upgradeTcStorage'}
              disabled={owned || (g.tcStorageLevel || 0) !== upg.level - 1}
              disabledReason={owned ? 'Owned' : 'Unlock previous level first'}
              tc={tc}
            />
          );
        })}
      </StoreSection>

      {/* ── PREMIUM ── */}
      {!g.isPremium && (
        <div className="card" style={{ border: '2px solid var(--gold)', background: 'rgba(255,215,0,0.03)' }}>
          <div className="card-title" style={{ color: 'var(--gold)' }}>⭐ Go PRO</div>
          <div className="text-sm" style={{ marginBottom: 8 }}>
            +1500 TC storage, 100 TC/month, auto-restock, 2% marketplace fees, 20% bonus on TC purchases, and more.
          </div>
          <div className="row-between">
            <div>
              <div className="font-bold">$4.99/mo</div>
              <div className="text-xs text-dim">or $29.99/yr (save 50%)</div>
            </div>
            <button
              className="btn"
              style={{ background: 'var(--gold)', color: '#000', fontWeight: 'bold' }}
              onClick={() => doAction('activatePremium')}
            >
              Upgrade
            </button>
          </div>
        </div>
      )}
    </>
  );
}
