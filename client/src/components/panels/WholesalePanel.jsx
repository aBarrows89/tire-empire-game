import React from 'react';
import { useGame } from '../../context/GameContext.jsx';
import { postAction } from '../../api/client.js';
import { getWholesaleSuppliers, placeWholesaleOrder, setWholesalePrices } from '../../api/client.js';
import { WS_MIN_REP, WS_MIN_STORAGE, VOL_TIERS, P2P_DELIVERY_FEE, P2P_COMMISSION } from '@shared/constants/wholesale.js';
import { TIRES } from '@shared/constants/tires.js';
import { fmt } from '@shared/helpers/format.js';
import { getVolTier } from '@shared/helpers/wholesale.js';
import { getCap } from '@shared/helpers/inventory.js';
import { getAllTires } from '@shared/helpers/factoryBrand.js';
import { hapticsMedium } from '../../api/haptics.js';

export default function WholesalePanel() {
  const { state, refreshState } = useGame();
  const g = state.game;
  const [busy, setBusy] = React.useState(false);
  const [suppliers, setSuppliers] = React.useState([]);
  const [loadingSuppliers, setLoadingSuppliers] = React.useState(false);
  const [orderQty, setOrderQty] = React.useState({});
  const [priceInputs, setPriceInputs] = React.useState({});
  const [savingPrices, setSavingPrices] = React.useState(false);
  const [tab, setTab] = React.useState('buy'); // buy | sell | history

  const [wsError, setWsError] = React.useState('');
  const unlockWholesale = async () => {
    setBusy(true);
    setWsError('');
    try {
      const res = await postAction('unlockWholesale');
      if (res.error) { setWsError(res.error); }
      else if (res.ok) { hapticsMedium(); refreshState(); }
      else { setWsError('Something went wrong'); }
    } catch (e) { setWsError(e.message); }
    setBusy(false);
  };

  const loadSuppliers = async () => {
    setLoadingSuppliers(true);
    try {
      const res = await getWholesaleSuppliers();
      if (res.ok) setSuppliers(res.suppliers || []);
    } catch {}
    setLoadingSuppliers(false);
  };

  const handleOrder = async (supplierId, tireType) => {
    const key = `${supplierId}_${tireType}`;
    const qty = Math.floor(Number(orderQty[key]) || 0);
    if (qty <= 0) return;
    setBusy(true);
    const res = await placeWholesaleOrder(supplierId, tireType, qty);
    if (res.ok) {
      hapticsMedium();
      refreshState();
      loadSuppliers();
      setOrderQty(prev => ({ ...prev, [key]: '' }));
    }
    setBusy(false);
  };

  const handleSavePrices = async () => {
    setSavingPrices(true);
    const prices = {};
    for (const [k, v] of Object.entries(priceInputs)) {
      const num = Math.floor(Number(v));
      if (num > 0) prices[k] = num;
    }
    const res = await setWholesalePrices(prices);
    if (res.ok) { hapticsMedium(); refreshState(); }
    setSavingPrices(false);
  };

  // Initialize price inputs from current state
  React.useEffect(() => {
    if (g.wholesalePrices && Object.keys(g.wholesalePrices).length > 0) {
      setPriceInputs(prev => {
        const merged = { ...prev };
        for (const [k, v] of Object.entries(g.wholesalePrices)) {
          if (!merged[k]) merged[k] = String(v);
        }
        return merged;
      });
    }
  }, [g.wholesalePrices]);

  // Load suppliers on mount
  React.useEffect(() => {
    if (g.hasWholesale) loadSuppliers();
  }, [g.hasWholesale]);

  // --- Unlock gate ---
  if (!g.hasWholesale) {
    const hasRep = g.reputation >= WS_MIN_REP;
    const totalCap = getCap(g);
    const hasStorage = totalCap >= WS_MIN_STORAGE;
    const canUnlock = hasRep && hasStorage;

    return (
      <>
        <div className="card">
          <div className="card-title">Wholesale Channel</div>
          <div className="text-sm text-dim" style={{ lineHeight: 1.5, marginBottom: 8 }}>
            Open a B2B wholesale channel to supply tires in bulk to fleet operators,
            dealerships, and other players. Buy from other players or set your own prices to sell.
          </div>
        </div>

        <div className="card">
          <div className="card-title">Requirements</div>
          <div className="row-between mb-4">
            <span className="text-sm text-dim">Reputation</span>
            <span className={`font-bold ${hasRep ? 'text-green' : 'text-red'}`}>
              {g.reputation.toFixed(1)} / {WS_MIN_REP}
            </span>
          </div>
          <div className="row-between mb-4">
            <span className="text-sm text-dim">Storage Capacity</span>
            <span className={`font-bold ${hasStorage ? 'text-green' : 'text-red'}`}>
              {fmt(totalCap)} / {fmt(WS_MIN_STORAGE)}
            </span>
          </div>
          <button
            className="btn btn-full btn-green"
            disabled={!canUnlock || busy}
            onClick={unlockWholesale}
          >
            {busy ? 'Opening...' : canUnlock ? 'Open Wholesale Channel' : 'Requirements Not Met'}
          </button>
          {wsError && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>{wsError}</div>}
        </div>
      </>
    );
  }

  // --- Unlocked view ---
  const allTires = getAllTires(g);
  const tier = getVolTier(g.monthlyPurchaseVol || 0);
  const clients = g.wsClients || [];
  const nextTier = VOL_TIERS.find(t => t.min > (g.monthlyPurchaseVol || 0));
  const ordersPlaced = g.wholesaleOrdersPlaced || [];
  const ordersReceived = g.wholesaleOrdersReceived || [];

  return (
    <>
      {/* Wholesale Stats Card */}
      <div className="card">
        <div className="card-title">Wholesale Stats</div>
        <div className="row-between mb-4">
          <span className="text-sm text-dim">Monthly Volume</span>
          <span className="font-bold">{fmt(g.monthlyPurchaseVol || 0)} tires</span>
        </div>
        <div className="row-between mb-4">
          <span className="text-sm text-dim">Total Revenue</span>
          <span className="font-bold text-green">${fmt(g.totalWholesaleRevenue || 0)}</span>
        </div>
        <div className="row-between mb-4">
          <span className="text-sm text-dim">NPC Clients</span>
          <span className="font-bold">{clients.length}</span>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="card" style={{ padding: '4px' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {[
            { id: 'buy', label: 'Buy from Players' },
            { id: 'sell', label: 'Set Your Prices' },
            { id: 'history', label: 'Orders' },
          ].map(t => (
            <button
              key={t.id}
              className={`btn ${tab === t.id ? 'btn-green' : ''}`}
              style={{ flex: 1, fontSize: 12, padding: '6px 4px' }}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* === BUY FROM PLAYERS === */}
      {tab === 'buy' && (
        <>
          <div className="card">
            <div className="row-between mb-4">
              <div className="card-title" style={{ margin: 0 }}>Player Suppliers</div>
              <button
                className="btn btn-sm"
                onClick={loadSuppliers}
                disabled={loadingSuppliers}
                style={{ fontSize: 11, padding: '4px 8px' }}
              >
                {loadingSuppliers ? 'Loading...' : 'Refresh'}
              </button>
            </div>

            {suppliers.length === 0 && !loadingSuppliers && (
              <div className="text-sm text-dim" style={{ lineHeight: 1.5 }}>
                No player suppliers found. Other players need to unlock wholesale and set prices.
              </div>
            )}

            {suppliers.map((sup) => (
              <div key={`${sup.playerId}-${sup.type}`} style={{ marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                <div className="row-between mb-4">
                  <span className="font-bold text-sm">
                    {sup.companyName}
                    {sup.type === 'factory' && <span className="text-xs text-accent"> (Factory)</span>}
                  </span>
                  <span className="text-xs text-dim">Rep: {Math.round(sup.reputation)}</span>
                </div>
                {sup.brandName && (
                  <div className="text-xs text-dim mb-4">Brand: {sup.brandName}</div>
                )}

                {Object.entries(sup.tireTypes).map(([tireKey, info]) => {
                  const tire = allTires[tireKey];
                  const qtyKey = `${sup.playerId}_${tireKey}`;
                  const inputQty = orderQty[qtyKey] || '';
                  const estCost = inputQty ? (Number(inputQty) * info.price + Number(inputQty) * P2P_DELIVERY_FEE) : 0;

                  return (
                    <div key={tireKey} style={{ marginTop: 6, padding: '6px 0' }}>
                      <div className="row-between text-xs mb-4">
                        <span>{tire?.n || tireKey}</span>
                        <span>${info.price}/ea ({info.stock} in stock)</span>
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input
                          type="number"
                          min="1"
                          max={info.stock}
                          placeholder="Qty"
                          value={inputQty}
                          onChange={e => setOrderQty(prev => ({ ...prev, [qtyKey]: e.target.value }))}
                          className="input"
                          style={{ width: 70, fontSize: 12, padding: '4px 6px' }}
                        />
                        <button
                          className="btn btn-green btn-sm"
                          disabled={busy || !inputQty || Number(inputQty) <= 0}
                          onClick={() => handleOrder(sup.playerId, tireKey)}
                          style={{ fontSize: 11, padding: '4px 10px' }}
                        >
                          Buy
                        </button>
                        {estCost > 0 && (
                          <span className="text-xs text-dim">${fmt(Math.round(estCost))} total</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="card">
            <div className="text-xs text-dim" style={{ lineHeight: 1.6 }}>
              Delivery fee: ${P2P_DELIVERY_FEE}/tire. Seller pays {(P2P_COMMISSION * 100).toFixed(0)}% commission.
            </div>
          </div>
        </>
      )}

      {/* === SET YOUR PRICES === */}
      {tab === 'sell' && (
        <div className="card">
          <div className="card-title">Your Wholesale Prices</div>
          <div className="text-xs text-dim mb-4" style={{ lineHeight: 1.5 }}>
            Set prices for tires you want to sell to other players. Only tires with a price set will appear to buyers.
          </div>

          {Object.entries(allTires).filter(([k, t]) => !t.used).map(([k, t]) => (
            <div key={k} className="row-between mb-4" style={{ gap: 8 }}>
              <span className="text-sm" style={{ flex: 1 }}>{t.n}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span className="text-xs text-dim">$</span>
                <input
                  type="number"
                  min="1"
                  placeholder="Price"
                  value={priceInputs[k] || ''}
                  onChange={e => setPriceInputs(prev => ({ ...prev, [k]: e.target.value }))}
                  className="input"
                  style={{ width: 70, fontSize: 12, padding: '4px 6px' }}
                />
              </div>
            </div>
          ))}

          <button
            className="btn btn-full btn-green"
            onClick={handleSavePrices}
            disabled={savingPrices}
            style={{ marginTop: 8 }}
          >
            {savingPrices ? 'Saving...' : 'Save Prices'}
          </button>
        </div>
      )}

      {/* === ORDER HISTORY === */}
      {tab === 'history' && (
        <>
          {/* Orders received */}
          <div className="card">
            <div className="card-title">Orders Received ({ordersReceived.length})</div>
            {ordersReceived.length === 0 && (
              <div className="text-sm text-dim">No orders received yet. Set your wholesale prices to attract buyers.</div>
            )}
            {ordersReceived.slice(0, 20).map((o) => (
              <div key={o.id} style={{ marginBottom: 6, paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>
                <div className="row-between text-xs">
                  <span className="font-bold">{o.buyerName}</span>
                  <span className="text-green">+${fmt(o.revenue)}</span>
                </div>
                <div className="row-between text-xs text-dim">
                  <span>{o.qty}x {allTires[o.tireType]?.n || o.tireType}</span>
                  <span>Day {o.day}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Orders placed */}
          <div className="card">
            <div className="card-title">Orders Placed ({ordersPlaced.length})</div>
            {ordersPlaced.length === 0 && (
              <div className="text-sm text-dim">No orders placed yet. Browse player suppliers above.</div>
            )}
            {ordersPlaced.slice(0, 20).map((o) => (
              <div key={o.id} style={{ marginBottom: 6, paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>
                <div className="row-between text-xs">
                  <span className="font-bold">{o.supplierName}</span>
                  <span className="text-red">-${fmt(o.totalPaid)}</span>
                </div>
                <div className="row-between text-xs text-dim">
                  <span>{o.qty}x {allTires[o.tireType]?.n || o.tireType}</span>
                  <span>Day {o.day}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* NPC Client List (existing) */}
      <div className="card">
        <div className="card-title">B2B NPC Clients ({clients.length})</div>
        {clients.length === 0 && (
          <div className="text-sm text-dim" style={{ lineHeight: 1.5 }}>
            No NPC clients yet. Keep building your reputation and stocking your warehouse
            — clients will find you automatically each week.
          </div>
        )}
        {clients.map((client) => {
          const tire = allTires[client.preferredTire];
          const satisfaction = client.satisfaction ?? 100;
          const satColor = satisfaction >= 70 ? 'text-green' : satisfaction >= 40 ? 'text-gold' : 'text-red';
          return (
            <div key={client.id} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
              <div className="row-between mb-4">
                <span className="font-bold text-sm">{client.name}</span>
                <span className={`text-xs font-bold ${satColor}`}>{satisfaction}% happy</span>
              </div>
              <div className="row-between text-xs">
                <span className="text-dim">Wants: {tire?.n || client.preferredTire}</span>
                <span className="text-dim">{client.minOrder}&ndash;{client.maxOrder}/order</span>
              </div>
              <div className="row-between text-xs" style={{ marginTop: 2 }}>
                <span className="text-dim">Total ordered: {fmt(client.totalOrdered || 0)}</span>
                <span className="text-dim">Since day {client.joinedDay}</span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
