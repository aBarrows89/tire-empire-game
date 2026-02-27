import React, { useState, useEffect } from 'react';
import { useGame } from '../../context/GameContext.jsx';
import { TIRES } from '@shared/constants/tires.js';
import { fmt } from '@shared/helpers/format.js';
import { getTrades, createTradeOffer, tradeAction, postAction, API_BASE, getHeaders } from '../../api/client.js';
import { getUid } from '../../services/firebase.js';

export default function TradePanel() {
  const { state, refreshState } = useGame();
  const g = state.game;
  const [trades, setTrades] = useState([]);
  const [tab, setTab] = useState('active'); // active | new
  const [showVinnieWarn, setShowVinnieWarn] = useState(false);

  // Show Vinnie warning on first visit
  useEffect(() => {
    if (g && !(g.vinnieSeen || []).includes('p2p_trade_warning')) {
      setShowVinnieWarn(true);
    }
  }, []);
  const [busy, setBusy] = useState(null);

  // New trade form
  const [receiverId, setReceiverId] = useState('');
  const [offerType, setOfferType] = useState('sellTires');
  const [tireType, setTireType] = useState('');
  const [qty, setQty] = useState(10);
  const [cashAmount, setCashAmount] = useState(100);
  const [revSharePct, setRevSharePct] = useState(5);
  const [revShareDays, setRevShareDays] = useState(30);
  const [upfrontCash, setUpfrontCash] = useState(0);

  // Leaderboard for receiver picker
  const [players, setPlayers] = useState([]);

  const fetchTrades = () => {
    getTrades().then(data => setTrades(Array.isArray(data) ? data : [])).catch(() => {});
  };

  useEffect(() => { fetchTrades(); }, [g?.day]);
  useEffect(() => {
    getHeaders().then(h =>
      fetch(`${API_BASE}/leaderboard?limit=50`, { headers: h })
        .then(r => r.json())
        .then(data => setPlayers(Array.isArray(data) ? data.filter(p => p.player_id !== (getUid() || g?.id)) : []))
        .catch(() => {})
    );
  }, []);

  const submitOffer = async () => {
    if (!receiverId) return;
    setBusy('offer');
    let payload;
    if (offerType === 'revShare') {
      payload = { receiverId, offerType, upfrontCash, revSharePct: revSharePct / 100, revShareDays };
    } else {
      if (!tireType || qty <= 0 || cashAmount <= 0) { setBusy(null); return; }
      payload = { receiverId, offerType, tireType, qty, cashAmount };
    }
    const res = await createTradeOffer(payload);
    if (res.ok) {
      fetchTrades();
      setTab('active');
    } else if (res.error) {
      alert(res.error);
    }
    setBusy(null);
  };

  const doAction = async (action, tradeId) => {
    setBusy(tradeId);
    const res = await tradeAction(action, tradeId);
    if (res.ok) {
      fetchTrades();
      refreshState();
    } else if (res.error) {
      alert(res.error);
    }
    setBusy(null);
  };

  // Available tires for selling
  const availTires = Object.entries(TIRES).filter(([k]) => {
    const total = (g.warehouseInventory?.[k] || 0) +
      (g.locations || []).reduce((a, l) => a + (l.inventory?.[k] || 0), 0);
    return total > 0;
  }).map(([k, t]) => {
    const total = (g.warehouseInventory?.[k] || 0) +
      (g.locations || []).reduce((a, l) => a + (l.inventory?.[k] || 0), 0);
    return { key: k, name: t.n, qty: total };
  });

  const pending = trades.filter(t => t.status === 'pending');
  const accepted = trades.filter(t => t.status === 'accepted');
  const completed = trades.filter(t => ['completed', 'declined', 'cancelled'].includes(t.status));

  const dismissVinnie = async () => {
    await postAction('dismissVinnie', { id: 'p2p_trade_warning' });
    setShowVinnieWarn(false);
    refreshState();
  };

  return (
    <>
      {/* Vinnie first-time warning */}
      {showVinnieWarn && (
        <div className="vinnie-popup-backdrop" onClick={dismissVinnie}>
          <div className="vinnie-popup-card" onClick={e => e.stopPropagation()}>
            <div className="vinnie-popup-emoji">{'\u{1F9D4}'}</div>
            <div className="vinnie-popup-title">Whoa, Hold Up Kid...</div>
            <div className="vinnie-popup-message">
              You sure about this? Direct trades got NO protection. You wire cash to some guy and he
              doesn't ship the tires? Tough luck, kid — you're out your money. Or maybe YOU ship the
              tires and that scumbag never pays the bill? Same deal. Gone. No refunds, no complaints
              department, no nothing. The marketplace takes a cut, but at least you don't get burned.
              Your call, kid.
            </div>
            <div className="vinnie-popup-actions">
              <button className="btn btn-full btn-sm btn-outline" onClick={dismissVinnie}>
                I Understand the Risk
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-title">Direct Trades</div>
        <div className="text-xs text-dim mb-4">
          Private player-to-player deals. No escrow, no protection.
          {' '}If they don't pay or ship, you're out of luck.
          {' '}<span className="text-accent">The marketplace is the safe option.</span>
        </div>
        <div className="row gap-8">
          {['active', 'new', 'history'].map(t => (
            <button
              key={t}
              className={`btn btn-sm ${tab === t ? '' : 'btn-outline'}`}
              onClick={() => setTab(t)}
              style={{ flex: 1 }}
            >
              {t === 'active' ? `Active (${pending.length + accepted.length})` : t === 'new' ? 'New Offer' : 'History'}
            </button>
          ))}
        </div>
      </div>

      {tab === 'active' && (
        <>
          {pending.length === 0 && accepted.length === 0 && (
            <div className="card">
              <div className="text-sm text-dim">No active trades.</div>
            </div>
          )}

          {/* Pending offers (waiting for accept/decline) */}
          {pending.map(trade => {
            const isSender = trade.senderId === (getUid() || g?.id);
            const t = TIRES[trade.tireType];
            return (
              <div key={trade.id} className="card" style={{ borderLeft: '3px solid var(--accent)' }}>
                <div className="row-between mb-4">
                  <span className="text-xs font-bold" style={{ color: 'var(--accent)' }}>PENDING</span>
                  <span className="text-xs text-dim">{isSender ? 'You sent' : 'You received'}</span>
                </div>
                <div className="text-sm mb-4">
                  {trade.offerType === 'sellTires' ? (
                    <>{trade.senderName} offers <span className="font-bold">{trade.qty} {t?.n}</span> for <span className="text-green font-bold">${fmt(trade.cashAmount)}</span></>
                  ) : (
                    <>{trade.senderName} offers <span className="text-green font-bold">${fmt(trade.cashAmount)}</span> for <span className="font-bold">{trade.qty} {t?.n}</span></>
                  )}
                </div>
                {isSender ? (
                  <button className="btn btn-sm btn-red btn-full" disabled={busy === trade.id} onClick={() => doAction('cancel', trade.id)}>
                    Cancel Offer
                  </button>
                ) : (
                  <div className="row gap-8">
                    <button className="btn btn-sm btn-green" style={{ flex: 1 }} disabled={busy === trade.id} onClick={() => doAction('accept', trade.id)}>
                      Accept
                    </button>
                    <button className="btn btn-sm btn-red" style={{ flex: 1 }} disabled={busy === trade.id} onClick={() => doAction('decline', trade.id)}>
                      Decline
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {/* Accepted trades (need fulfillment) */}
          {accepted.map(trade => {
            const isSender = trade.senderId === (getUid() || g?.id);
            const t = TIRES[trade.tireType];
            const myFulfilled = isSender ? trade.senderFulfilled : trade.receiverFulfilled;
            const theirFulfilled = isSender ? trade.receiverFulfilled : trade.senderFulfilled;

            // What do I need to do?
            const iSendTires = (trade.offerType === 'sellTires' && isSender) ||
                               (trade.offerType === 'buyTires' && !isSender);
            const myAction = iSendTires ? `Ship ${trade.qty} ${t?.n}` : `Wire $${fmt(trade.cashAmount)}`;
            const theirAction = iSendTires ? `Wire $${fmt(trade.cashAmount)}` : `Ship ${trade.qty} ${t?.n}`;

            return (
              <div key={trade.id} className="card" style={{ borderLeft: '3px solid var(--green, #0f0)' }}>
                <div className="row-between mb-4">
                  <span className="text-xs font-bold text-green">ACCEPTED</span>
                  <span className="text-xs text-dim">
                    with {isSender ? trade.receiverName : trade.senderName}
                  </span>
                </div>
                <div className="text-sm mb-4">
                  {trade.offerType === 'sellTires' ? (
                    <>{trade.qty} {t?.n} for ${fmt(trade.cashAmount)}</>
                  ) : (
                    <>${fmt(trade.cashAmount)} for {trade.qty} {t?.n}</>
                  )}
                </div>
                <div className="text-xs mb-4">
                  <div>You: {myFulfilled ? '\u2705 Fulfilled' : `\u23F3 ${myAction}`}</div>
                  <div>Them: {theirFulfilled ? '\u2705 Fulfilled' : `\u23F3 ${theirAction}`}</div>
                </div>
                {!myFulfilled && (
                  <button
                    className="btn btn-sm btn-green btn-full"
                    disabled={busy === trade.id}
                    onClick={() => doAction('fulfill', trade.id)}
                  >
                    {busy === trade.id ? 'Processing...' : myAction}
                  </button>
                )}
                {myFulfilled && !theirFulfilled && (
                  <div className="text-xs text-dim" style={{ textAlign: 'center' }}>
                    Waiting for the other party... No guarantees they'll fulfill.
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}

      {tab === 'new' && (
        <div className="card">
          <div className="card-title">Create Trade Offer</div>
          <div className="text-xs text-red mb-4">
            WARNING: Direct trades have NO protection. Only trade with players you trust.
          </div>

          <div className="mb-4">
            <div className="text-xs text-dim mb-4">Trade With</div>
            <select className="autoprice-select" style={{ width: '100%' }} value={receiverId} onChange={e => setReceiverId(e.target.value)}>
              <option value="">Select player...</option>
              {players.map(p => (
                <option key={p.player_id} value={p.player_id}>{p.name} (Rep {(p.reputation || 0).toFixed(1)})</option>
              ))}
            </select>
          </div>

          <div className="mb-4">
            <div className="text-xs text-dim mb-4">Offer Type</div>
            <select className="autoprice-select" style={{ width: '100%' }} value={offerType} onChange={e => setOfferType(e.target.value)}>
              <option value="sellTires">I send tires, they send cash</option>
              <option value="buyTires">I send cash, they send tires</option>
              <option value="revShare">Revenue share deal</option>
            </select>
          </div>

          {offerType !== 'revShare' && (
            <>
              <div className="mb-4">
                <div className="text-xs text-dim mb-4">Tire Type</div>
                <select className="autoprice-select" style={{ width: '100%' }} value={tireType} onChange={e => setTireType(e.target.value)}>
                  <option value="">Select tire...</option>
                  {offerType === 'sellTires' ? (
                    availTires.map(t => (
                      <option key={t.key} value={t.key}>{t.name} ({t.qty} in stock)</option>
                    ))
                  ) : (
                    Object.entries(TIRES).map(([k, t]) => (
                      <option key={k} value={k}>{t.n}</option>
                    ))
                  )}
                </select>
              </div>

              <div className="row gap-8 mb-4">
                <div style={{ flex: 1 }}>
                  <div className="text-xs text-dim mb-4">Quantity</div>
                  <input type="number" className="autoprice-offset" style={{ width: '100%' }} min={1} value={qty} onChange={e => setQty(Math.max(1, Number(e.target.value)))} />
                </div>
                <div style={{ flex: 1 }}>
                  <div className="text-xs text-dim mb-4">Cash Amount ($)</div>
                  <input type="number" className="autoprice-offset" style={{ width: '100%' }} min={1} value={cashAmount} onChange={e => setCashAmount(Math.max(1, Number(e.target.value)))} />
                </div>
              </div>

              <div className="text-xs text-dim mb-4">
                {offerType === 'sellTires'
                  ? `You'll ship ${qty} tires and expect $${fmt(cashAmount)} in return.`
                  : `You'll wire $${fmt(cashAmount)} and expect ${qty} tires in return.`
                }
                {' '}No guarantees.
              </div>
            </>
          )}

          {offerType === 'revShare' && (
            <>
              <div className="text-xs text-dim mb-4">
                Propose a revenue share: they pay you upfront + a percentage of their daily revenue for a set period.
              </div>
              <div className="row gap-8 mb-4">
                <div style={{ flex: 1 }}>
                  <div className="text-xs text-dim mb-4">Upfront Cash ($)</div>
                  <input type="number" className="autoprice-offset" style={{ width: '100%' }} min={0} value={upfrontCash} onChange={e => setUpfrontCash(Math.max(0, Number(e.target.value)))} />
                </div>
                <div style={{ flex: 1 }}>
                  <div className="text-xs text-dim mb-4">Rev Share (%)</div>
                  <input type="number" className="autoprice-offset" style={{ width: '100%' }} min={1} max={50} value={revSharePct} onChange={e => setRevSharePct(Math.max(1, Math.min(50, Number(e.target.value))))} />
                </div>
              </div>
              <div className="mb-4">
                <div className="text-xs text-dim mb-4">Duration (days)</div>
                <input type="number" className="autoprice-offset" style={{ width: '100%' }} min={7} max={365} value={revShareDays} onChange={e => setRevShareDays(Math.max(7, Math.min(365, Number(e.target.value))))} />
              </div>
              <div className="text-xs text-dim mb-4">
                They pay ${fmt(upfrontCash)} upfront + {revSharePct}% of their daily revenue for {revShareDays} days.
              </div>
            </>
          )}

          <button
            className="btn btn-full btn-sm"
            style={{ background: 'var(--accent)', color: '#000' }}
            disabled={!receiverId || (offerType !== 'revShare' && (!tireType || qty <= 0 || cashAmount <= 0)) || busy === 'offer'}
            onClick={submitOffer}
          >
            {busy === 'offer' ? 'Sending...' : 'Send Trade Offer'}
          </button>
        </div>
      )}

      {tab === 'history' && (
        <>
          {completed.length === 0 && (
            <div className="card">
              <div className="text-sm text-dim">No trade history.</div>
            </div>
          )}
          {completed.map(trade => {
            const isSender = trade.senderId === (getUid() || g?.id);
            const t = TIRES[trade.tireType];
            const statusColor = trade.status === 'completed' ? 'text-green' : 'text-dim';
            return (
              <div key={trade.id} className="card">
                <div className="row-between mb-4">
                  <span className={`text-xs font-bold ${statusColor}`}>{trade.status.toUpperCase()}</span>
                  <span className="text-xs text-dim">
                    with {isSender ? trade.receiverName : trade.senderName}
                  </span>
                </div>
                <div className="text-sm">
                  {trade.qty} {t?.n} for ${fmt(trade.cashAmount)}
                </div>
              </div>
            );
          })}
        </>
      )}
    </>
  );
}
