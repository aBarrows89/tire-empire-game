import React, { useState, useEffect, useCallback } from 'react';
import { useGame } from '../../context/GameContext.jsx';
import {
  openBrokerage, getExchangeOverview, getStocks, getStockDetail,
  placeOrder, cancelOrder, getPortfolio, getTradeHistory,
  applyForIPO, setDividendRatio, unlockExchangeFeature,
  requestVinnieTip, shortSell, coverShort, setAlert,
  buyScratchTicket, claimScratchPrize,
} from '../../api/client.js';
import PriceChart from '../PriceChart.jsx';
import OrderBook from '../OrderBook.jsx';
import RewardedAdButton from '../RewardedAdButton.jsx';
import { UICard, MiniSparkline, Tag, TireCoin } from '../ui/ui.jsx';
import { getCalendar, MONTH_NAMES } from '@shared/helpers/calendar.js';

const TABS = ['Market', 'Portfolio', 'Trade', 'IPO', 'Premium'];

const RISK_COLORS = { 'Very Low': '#4caf50', 'Low': '#4a9', 'Moderate': '#ff9800', 'High': '#f44336', 'Very High': '#d32f2f', 'Unknown': '#888' };
const SEGMENT_LABELS = { retail: 'Retail', ecommerce: 'E-Commerce', wholesale: 'Wholesale', manufacturing: 'Factory', services: 'Services', government: 'Gov Contracts' };

function InvestorProspectus({ prospectus, stock }) {
  const p = prospectus;
  const riskColor = RISK_COLORS[p.riskRating] || '#888';

  // Revenue segment bars
  const segments = Object.entries(p.revenueBySegment || {}).filter(([, v]) => v > 0);
  const totalDailyRev = segments.reduce((a, [, v]) => a + v, 0);

  return (
    <div className="card" style={{ padding: 12, marginBottom: 8 }}>
      <h4 style={{ margin: '0 0 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        Investor Summary
        <span style={{ fontSize: 11, color: riskColor, border: `1px solid ${riskColor}`, borderRadius: 4, padding: '2px 6px' }}>
          {p.riskRating} Risk
        </span>
      </h4>

      {/* Key Metrics */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ flex: '1 0 70px', textAlign: 'center', background: 'var(--bg)', borderRadius: 6, padding: 6 }}>
          <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>P/E Ratio</div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{p.peRatio != null ? p.peRatio : 'N/A'}</div>
        </div>
        <div style={{ flex: '1 0 70px', textAlign: 'center', background: 'var(--bg)', borderRadius: 6, padding: 6 }}>
          <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>Div Yield</div>
          <div style={{ fontWeight: 700, fontSize: 14, color: p.dividendYield > 0 ? 'var(--green)' : 'var(--text-dim)' }}>
            {(p.dividendYield * 100).toFixed(1)}%
          </div>
        </div>
        <div style={{ flex: '1 0 70px', textAlign: 'center', background: 'var(--bg)', borderRadius: 6, padding: 6 }}>
          <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>Margin</div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{(p.profitMargin * 100).toFixed(0)}%</div>
        </div>
        <div style={{ flex: '1 0 70px', textAlign: 'center', background: 'var(--bg)', borderRadius: 6, padding: 6 }}>
          <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>Wk Growth</div>
          <div style={{ fontWeight: 700, fontSize: 14, color: p.weeklyGrowth > 0 ? 'var(--green)' : p.weeklyGrowth < 0 ? 'var(--red)' : 'var(--text-dim)' }}>
            {p.weeklyGrowth > 0 ? '+' : ''}{(p.weeklyGrowth * 100).toFixed(0)}%
          </div>
        </div>
      </div>

      {/* Company Profile */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10, fontSize: 11, color: 'var(--text-dim)' }}>
        <span>Age: {p.companyAge} days</span>
        <span>Staff: {p.staffCount}</span>
        <span>Locations: {stock.locations}</span>
        {p.hasFactory && <span style={{ color: 'var(--green)' }}>Factory</span>}
        {p.hasEcom && <span style={{ color: 'var(--green)' }}>E-Com</span>}
        {p.hasWholesale && <span style={{ color: 'var(--green)' }}>Wholesale</span>}
      </div>

      {/* Revenue Segment Breakdown */}
      {segments.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>Daily Revenue by Segment</div>
          {segments.map(([key, val]) => {
            const pctOfTotal = totalDailyRev > 0 ? val / totalDailyRev : 0;
            const segColors = { retail: '#4caf50', ecommerce: '#2196f3', wholesale: '#ff9800', manufacturing: '#9c27b0', services: '#00bcd4', government: '#795548' };
            return (
              <div key={key} style={{ marginBottom: 3 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                  <span>{SEGMENT_LABELS[key] || key}</span>
                  <span>${Math.round(val)} ({(pctOfTotal * 100).toFixed(0)}%)</span>
                </div>
                <div style={{ background: 'var(--bg)', borderRadius: 3, height: 6, overflow: 'hidden' }}>
                  <div style={{ width: (pctOfTotal * 100) + '%', height: '100%', background: segColors[key] || '#888', borderRadius: 3 }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Revenue & Profit History Chart */}
      {p.revenueHistory && p.revenueHistory.length > 2 && (
        <div style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>Revenue & Profit (30-day)</div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 50 }}>
            {p.revenueHistory.map((h, i) => {
              const maxRev = Math.max(...p.revenueHistory.map(x => x.rev), 1);
              const revH = Math.max(2, (h.rev / maxRev) * 44);
              const profH = Math.max(0, (Math.max(0, h.profit) / maxRev) * 44);
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                  <div style={{ width: '100%', maxWidth: 8, height: revH, background: 'rgba(33,150,243,0.3)', borderRadius: 2 }} />
                  <div style={{ width: '100%', maxWidth: 8, height: profH, background: h.profit >= 0 ? 'rgba(76,175,80,0.6)' : 'rgba(244,67,54,0.6)', borderRadius: 2, marginTop: -profH }} />
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>
            <span><span style={{ display: 'inline-block', width: 8, height: 8, background: 'rgba(33,150,243,0.3)', borderRadius: 2, marginRight: 3 }}></span>Revenue</span>
            <span><span style={{ display: 'inline-block', width: 8, height: 8, background: 'rgba(76,175,80,0.6)', borderRadius: 2, marginRight: 3 }}></span>Profit</span>
          </div>
        </div>
      )}

      {/* Book Value */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-dim)', borderTop: '1px solid var(--border)', paddingTop: 6 }}>
        <span>Book Value: {fmt(p.bookValue)}</span>
        <span>BV/Share: ${p.bookValuePerShare?.toFixed(2)}</span>
        <span>Total Rev: {fmt(p.totalRevenue)}</span>
      </div>
    </div>
  );
}

const fmt = n => {
  if (n == null) return '$0';
  if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (Math.abs(n) >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + Math.round(n).toLocaleString();
};

const pct = n => (n > 0 ? '+' : '') + (n || 0).toFixed(2) + '%';

export default function ExchangePanel() {
  const { state, refreshState } = useGame();
  const g = state.game;
  const se = g.stockExchange || {};
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [overview, setOverview] = useState(null);
  const [stocks, setStocksData] = useState([]);
  const [portfolio, setPortfolio] = useState(null);
  const [selectedTicker, setSelectedTicker] = useState(null);
  const [stockDetail, setStockDetail] = useState(null);
  const [orderForm, setOrderForm] = useState({ side: 'buy', type: 'market', qty: '', limitPrice: '' });
  const [msg, setMsg] = useState('');
  const [vinnieTip, setVinnieTip] = useState(null);
  const [scratchTicket, setScratchTicket] = useState(null);
  const [scratchRevealed, setScratchRevealed] = useState(new Set());
  const [scratchClaimed, setScratchClaimed] = useState(false);
  const [stockSearch, setStockSearch] = useState('');
  const [divRatio, setDivRatio] = useState(Math.round((se.dividendPayoutRatio || 0.25) * 100));
  const [ipoDivRatio, setIpoDivRatio] = useState(25);
  const [showExchangeInfo, setShowExchangeInfo] = useState(false);
  const [myStockDetail, setMyStockDetail] = useState(null);
  const divTimerRef = React.useRef(null);
  const myTicker = se.ticker || null;

  const load = useCallback(async () => {
    try {
      const ov = await getExchangeOverview();
      setOverview(ov);
      const st = await getStocks();
      setStocksData(st.stocks || []);
      if (se.hasBrokerage) {
        const p = await getPortfolio();
        setPortfolio(p);
      }
    } catch (e) { console.error(e); }
  }, [se.hasBrokerage]);

  useEffect(() => { if (se.hasBrokerage) load(); }, [se.hasBrokerage, load]);

  // Auto-refresh selected stock detail every tick so trade logs stay live
  useEffect(() => {
    if (!selectedTicker || !se.hasBrokerage) return;
    getStockDetail(selectedTicker).then(setStockDetail).catch(() => {});
  }, [state.game?.day]);

  // Auto-refresh MY stock detail every tick
  useEffect(() => {
    if (!myTicker || !se.hasBrokerage) return;
    getStockDetail(myTicker).then(setMyStockDetail).catch(() => {});
  }, [state.game?.day, myTicker]);

  // Pick up stock ticker from leaderboard quick-access
  useEffect(() => {
    try {
      const ticker = localStorage.getItem('te_viewStock');
      if (ticker && se.hasBrokerage) {
        localStorage.removeItem('te_viewStock');
        selectStock(ticker);
        setTab(2); // Trade tab
      }
    } catch {}
  }, [se.hasBrokerage]);

  const doAction = async (fn, successMsg) => {
    setLoading(true); setMsg('');
    try {
      const res = await fn();
      if (res.error) setMsg(res.error);
      else { setMsg(successMsg || 'Done!'); await refreshState(); await load(); }
    } catch (e) { setMsg(e.message); }
    setLoading(false);
  };

  const handleOpenAccount = () => doAction(() => openBrokerage(), 'Brokerage account opened!');

  const handlePlaceOrder = () => {
    if (!selectedTicker || !orderForm.qty) return setMsg('Select a stock and enter quantity');
    const qty = parseInt(orderForm.qty);
    if (!qty || qty <= 0) return setMsg('Invalid quantity');
    const params = { ticker: selectedTicker, side: orderForm.side, type: orderForm.type, qty };
    if (orderForm.type === 'limit' && orderForm.limitPrice) params.limitPrice = parseFloat(orderForm.limitPrice);
    doAction(() => placeOrder(params), 'Order placed!');
  };

  const selectStock = async (ticker) => {
    setSelectedTicker(ticker);
    try {
      const detail = await getStockDetail(ticker);
      setStockDetail(detail);
    } catch (e) { console.error(e); }
  };

  const handleScratchBuy = async () => {
    setLoading(true); setMsg('');
    try {
      const res = await buyScratchTicket();
      if (res.error) { setMsg(res.error); }
      else {
        setScratchTicket(res.ticket);
        setScratchRevealed(new Set());
        setScratchClaimed(false);
        await refreshState();
      }
    } catch (e) { setMsg(e.message); }
    setLoading(false);
  };

  const handleScratchReveal = (idx) => {
    setScratchRevealed(prev => new Set([...prev, idx]));
  };

  const allRevealed = scratchTicket && scratchRevealed.size >= 9;

  const handleScratchClaim = async () => {
    if (!scratchTicket || scratchClaimed) return;
    setScratchClaimed(true);
    doAction(() => claimScratchPrize(scratchTicket.prize), 'You won ' + fmt(scratchTicket.prize) + '!');
  };

  // Not opened yet
  if (!se.hasBrokerage) {
    return (
      <div className="panel">
        <h2>Tire Empire Stock Exchange</h2>
        <div className="card" style={{ textAlign: 'center', padding: 24 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>&#x1F4C8;</div>
          <h3>Open a Brokerage Account</h3>
          <p style={{ color: 'var(--text-dim)', marginBottom: 16 }}>
            Trade stocks of other player companies, earn dividends, and grow your wealth on the TESX.
          </p>
          <ul style={{ textAlign: 'left', color: 'var(--text-dim)', marginBottom: 16 }}>
            <li>Reputation 10+ required</li>
            <li>At least 1 shop location</li>
            <li>$500/month brokerage fee</li>
          </ul>
          <button className="btn btn-green" onClick={handleOpenAccount} disabled={loading}>
            {loading ? 'Opening...' : 'Open Account'}
          </button>
          {msg && <p style={{ color: 'var(--red)', marginTop: 8 }}>{msg}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>TESX Exchange</h2>
        <span
          onClick={() => setShowExchangeInfo(!showExchangeInfo)}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 24, height: 24, borderRadius: '50%', fontSize: 14, fontWeight: 700,
            background: showExchangeInfo ? '#2196f3' : 'rgba(33,150,243,0.15)',
            color: showExchangeInfo ? '#fff' : '#2196f3',
            cursor: 'pointer',
          }}
        >i</span>
      </div>
      {showExchangeInfo && (
        <div style={{ background: 'rgba(33,150,243,0.08)', borderRadius: 8, padding: '10px 12px', margin: '8px 0', fontSize: 12, lineHeight: 1.6, color: 'var(--text-dim)' }}>
          <div style={{ fontWeight: 600, color: '#2196f3', marginBottom: 4 }}>How the Stock Exchange Works</div>
          <p style={{ margin: '0 0 6px' }}>The TESX (Tire Empire Stock Exchange) lets players trade shares of public companies.</p>
          <p style={{ margin: '0 0 4px' }}><b style={{ color: 'var(--text)' }}>IPO</b> — Take your company public once you meet requirements. You keep 51% as founder shares. The remaining 49% are sold to investors.</p>
          <p style={{ margin: '0 0 4px' }}><b style={{ color: 'var(--text)' }}>Stock Price</b> — Driven by company performance (revenue, profit, reputation, assets) and supply/demand from trades.</p>
          <p style={{ margin: '0 0 4px' }}><b style={{ color: 'var(--text)' }}>Dividends</b> — Public companies pay a % of weekly profit to shareholders. Set your payout ratio (0-75%) in the IPO tab.</p>
          <p style={{ margin: '0 0 4px' }}><b style={{ color: 'var(--text)' }}>Market/Limit Orders</b> — Market orders execute instantly at current price. Limit orders wait until price hits your target.</p>
          <p style={{ margin: '0 0 4px' }}><b style={{ color: 'var(--text)' }}>Short Selling</b> — Borrow shares and sell high, buy back low. Risky — losses are unlimited if the price rises.</p>
          <p style={{ margin: '6px 0 0', color: 'var(--text)' }}>Commission is ~1.5% per trade. Build a diversified portfolio for steady income!</p>
        </div>
      )}
      <div className="tab-bar">
        {TABS.map((t, i) => (
          <button key={t} className={`tab-btn ${tab === i ? 'active' : ''}`} onClick={() => { setTab(i); setMsg(''); }}>
            {t}
          </button>
        ))}
      </div>

      {msg && <div className="card" style={{ background: 'var(--red-dim)', color: 'var(--red)', padding: 8, marginBottom: 8 }}>{msg}</div>}

      {/* Market Tab */}
      {tab === 0 && (
        <div>
          {overview && (
            <>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                <UICard style={{ flex: 1, minWidth: 80, textAlign: 'center', padding: 10 }}>
                  <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: 0.5 }}>TESX INDEX</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent)' }}>
                    {overview.indices?.TESX ? (overview.indices.TESX).toFixed(2) : '—'}
                  </div>
                </UICard>
                <UICard style={{ flex: 1, minWidth: 80, textAlign: 'center', padding: 10 }}>
                  <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: 0.5 }}>SENTIMENT</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: (overview.sentiment || 1) >= 1 ? 'var(--green)' : 'var(--red)' }}>
                    {((overview.sentiment || 1) * 100).toFixed(0)}%
                  </div>
                </UICard>
                <UICard style={{ flex: 1, minWidth: 80, textAlign: 'center', padding: 10 }}>
                  <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: 0.5 }}>VOLUME</div>
                  <div style={{ fontSize: 20, fontWeight: 800 }}>{(overview.dayVolume || 0).toLocaleString()}</div>
                </UICard>
              </div>
              {overview.crashActive && (
                <UICard glow="var(--red)" style={{ textAlign: 'center', padding: 10, background: 'rgba(239,83,80,0.08)' }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--red)' }}>
                    \u26A0\uFE0F MARKET CRASH IN PROGRESS \u26A0\uFE0F
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>Prices are volatile — trade with caution</div>
                </UICard>
              )}
            </>
          )}

          {/* Daily Market Report */}
          {overview?.marketReport && (
            <div className="card" style={{ padding: 12, marginBottom: 12 }}>
              <h4 style={{ margin: '0 0 8px' }}>Daily Market Report</h4>
              {/* Top Movers — all players */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>Top Movers</div>
                {(overview.marketReport.topMovers || []).map(m => (
                  <div key={m.ticker} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 3 }}>
                    <span><strong>${m.ticker}</strong> <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>{m.companyName}</span></span>
                    <span style={{ color: m.change >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>
                      {m.change >= 0 ? '+' : ''}{m.change?.toFixed(2)}%
                    </span>
                  </div>
                ))}
              </div>
              {/* Premium: Predictions */}
              {g.isPremium ? (
                <>
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>Price Predictions</div>
                    {(overview.marketReport.predictions || []).map(p => (
                      <div key={p.ticker} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 3 }}>
                        <span><strong>${p.ticker}</strong></span>
                        <span>
                          <span style={{ color: p.direction === 'up' ? 'var(--green)' : p.direction === 'down' ? 'var(--red)' : 'var(--text-dim)', marginRight: 6 }}>
                            {p.direction === 'up' ? '\u2191' : p.direction === 'down' ? '\u2193' : '\u2192'}
                          </span>
                          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{p.confidence}% conf</span>
                        </span>
                      </div>
                    ))}
                  </div>
                  {/* Premium: Sector Analysis */}
                  {(overview.marketReport.sectorAnalysis || []).length > 0 && (
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>Sector Performance</div>
                      {overview.marketReport.sectorAnalysis.map(s => (
                        <div key={s.sector} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 3 }}>
                          <span>{s.sector} <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>({s.count})</span></span>
                          <span style={{ color: s.avgChange >= 0 ? 'var(--green)' : 'var(--red)' }}>
                            {s.avgChange >= 0 ? '+' : ''}{s.avgChange}% avg
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ padding: '8px 0', textAlign: 'center', borderTop: '1px solid var(--border)', marginTop: 8 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>
                    Upgrade to <strong style={{ color: '#f0c040' }}>PRO</strong> for price predictions & sector analysis
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ETFs & Indices */}
          {overview?.etfs && Object.keys(overview.etfs).length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <h4 style={{ margin: '0 0 6px' }}>Indices & ETFs</h4>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {Object.entries(overview.etfs).map(([ticker, etf]) => {
                  const hasStocks = (etf.components?.length || 0) > 0;
                  const changeVal = etf.change || 0;
                  return (
                    <div key={ticker} className="card" style={{ flex: '1 0 90px', textAlign: 'center', padding: 8 }}>
                      <div style={{ fontWeight: 700, fontSize: 11, color: 'var(--text-dim)', marginBottom: 2 }}>${ticker}</div>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>
                        {hasStocks ? `$${(etf.price || 0).toFixed(2)}` : <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>No stocks</span>}
                      </div>
                      {hasStocks && (
                        <div style={{ fontSize: 10, color: changeVal >= 0 ? 'var(--green)' : 'var(--red)' }}>
                          {changeVal >= 0 ? '▲' : '▼'} {Math.abs(changeVal).toFixed(2)}%
                        </div>
                      )}
                      <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 2 }}>
                        {etf.name || ticker} {hasStocks ? `(${etf.components.length})` : ''}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Commodities */}
          {overview?.commodities && Object.keys(overview.commodities).length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <h4 style={{ margin: '0 0 6px' }}>Commodities</h4>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {Object.entries(overview.commodities).map(([ticker, comm]) => {
                  const base = comm.baseValue || 100;
                  const chg = base > 0 ? ((comm.price - base) / base * 100) : 0;
                  return (
                    <div key={ticker} className="card" style={{ flex: '1 0 90px', textAlign: 'center', padding: 8 }}>
                      <div style={{ fontWeight: 700, fontSize: 11, color: 'var(--text-dim)', marginBottom: 2 }}>{ticker}</div>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>{(comm.price || 100).toFixed(1)}</div>
                      <div style={{ fontSize: 10, color: chg >= 0 ? 'var(--green)' : 'var(--red)' }}>
                        {chg >= 0 ? '▲' : '▼'} {Math.abs(chg).toFixed(1)}%
                      </div>
                      <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 2 }}>{comm.name}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Stocks List */}
          <h4 style={{ margin: '12px 0 6px' }}>Listed Stocks</h4>
          <input
            type="text"
            placeholder="Search by ticker or company name..."
            value={stockSearch}
            onChange={e => setStockSearch(e.target.value)}
            style={{ width: '100%', padding: 8, borderRadius: 8, background: 'var(--card-bg)', color: 'var(--text)', border: '1px solid var(--border)', marginBottom: 8, fontSize: 13 }}
          />
          {stocks.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 16 }}>
              No companies listed yet. Be the first to IPO!
            </div>
          ) : (
            <div>
              {stocks.filter(s => {
                if (!stockSearch) return true;
                const q = stockSearch.toLowerCase();
                return s.ticker.toLowerCase().includes(q) || s.companyName.toLowerCase().includes(q);
              }).map(s => {
                const riskColor = { 'Very Low': '#4caf50', 'Low': '#44aa99', 'Moderate': '#ff9800', 'High': '#f44336', 'Very High': '#d32f2f' }[s.riskRating] || '#7a8599';
                return (
                  <UICard key={s.ticker} onClick={() => { selectStock(s.ticker); setTab(2); }}
                    style={{ padding: '10px 12px', marginBottom: 6, cursor: 'pointer' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--accent)' }}>${s.ticker}</span>
                          <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>{s.companyName}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                          <Tag color={riskColor} bg={riskColor + '18'}>{s.riskRating}</Tag>
                          {s.dividendYield > 0 && <Tag color="var(--green)" bg="rgba(76,175,80,0.1)">Div {(s.dividendYield * 100).toFixed(1)}%</Tag>}
                          <Tag>{s.locations} shops</Tag>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 18, fontWeight: 700 }}>{fmt(s.price)}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                          <MiniSparkline data={s.priceHistory || [s.price * 0.95, s.price * 0.97, s.price * 0.99, s.price]} color={s.change >= 0 ? 'var(--green)' : 'var(--red)'} width={50} height={16}/>
                          <span style={{ fontSize: 11, fontWeight: 700, color: s.change >= 0 ? 'var(--green)' : 'var(--red)' }}>
                            {s.change >= 0 ? '\u25B2' : '\u25BC'}{Math.abs(s.change || 0).toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </UICard>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Portfolio Tab */}
      {tab === 1 && (
        <div>
          {portfolio ? (
            <>
              <UICard style={{ padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: 1, textTransform: 'uppercase' }}>PORTFOLIO VALUE</div>
                    <div style={{ fontSize: 26, fontWeight: 800 }}>{fmt(portfolio.totalValue)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: 1, textTransform: 'uppercase' }}>TOTAL P&L</div>
                    <div style={{ fontSize: 26, fontWeight: 800, color: portfolio.totalPnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {portfolio.totalPnl >= 0 ? '+' : ''}{fmt(portfolio.totalPnl)}
                    </div>
                  </div>
                </div>
              </UICard>

              <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                <UICard style={{ flex: 1, textAlign: 'center', padding: 8 }}>
                  <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: 0.5 }}>DIVIDENDS</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--green)' }}>{fmt(portfolio.dividendIncome)}</div>
                </UICard>
                <UICard style={{ flex: 1, textAlign: 'center', padding: 8 }}>
                  <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: 0.5 }}>TAXES</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--red)' }}>{fmt(portfolio.taxesPaid)}</div>
                </UICard>
                <UICard style={{ flex: 1, textAlign: 'center', padding: 8 }}>
                  <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: 0.5 }}>MARGIN</div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{fmt(portfolio.marginDebt)}</div>
                </UICard>
              </div>

              <h4 style={{ margin: '0 0 6px' }}>Positions</h4>
              {(portfolio.positions || []).length === 0 ? (
                <div className="card" style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 16 }}>
                  No positions. Buy some stocks!
                </div>
              ) : (
                portfolio.positions.map(p => (
                  <UICard key={p.ticker} onClick={() => { selectStock(p.ticker); setTab(2); }}
                    style={{ padding: '10px 12px', marginBottom: 6, cursor: 'pointer' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--accent)' }}>${p.ticker}</span>
                        <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>{p.qty} shares @ {fmt(p.avgCost)}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 16, fontWeight: 700 }}>{fmt(p.currentPrice)}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                          <MiniSparkline data={p.priceHistory || []} color={p.pnl >= 0 ? 'var(--green)' : 'var(--red)'} width={50} height={16}/>
                          <span style={{ fontSize: 11, fontWeight: 700, color: p.pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
                            {p.pnl >= 0 ? '+' : ''}{fmt(p.pnl)}
                          </span>
                        </div>
                      </div>
                    </div>
                    {/* Sparkline now inline above */}
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <button style={{ flex: 1, padding: '6px 10px', borderRadius: 8, border: 'none', background: 'var(--green)', color: '#fff', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}
                        onClick={(e) => { e.stopPropagation(); selectStock(p.ticker); setTab(2); setOrderForm({ side: 'buy', type: 'market', qty: '', limitPrice: '' }); }}>
                        Buy More
                      </button>
                      <button style={{ flex: 1, padding: '6px 10px', borderRadius: 8, border: 'none', background: 'var(--red)', color: '#fff', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}
                        onClick={(e) => { e.stopPropagation(); selectStock(p.ticker); setTab(2); setOrderForm({ side: 'sell', type: 'market', qty: String(p.qty), limitPrice: '' }); }}>
                        Sell
                      </button>
                      <button style={{ flex: 1, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--accent)', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}
                        onClick={(e) => { e.stopPropagation(); selectStock(p.ticker); setTab(2); }}>
                        Details
                      </button>
                    </div>
                  </UICard>
                ))
              )}

              {/* Open Orders */}
              {(portfolio.openOrders || []).length > 0 && (
                <>
                  <h4 style={{ margin: '12px 0 6px' }}>Open Orders</h4>
                  {portfolio.openOrders.map(o => (
                    <div key={o.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', marginBottom: 4 }}>
                      <span>{o.side.toUpperCase()} {o.qty} ${o.ticker} @ {fmt(o.price)}</span>
                      <button className="btn btn-small btn-red" onClick={() => doAction(() => cancelOrder(o.id), 'Order cancelled')}>Cancel</button>
                    </div>
                  ))}
                </>
              )}

              {/* Short Positions */}
              {Object.keys(portfolio.shortPositions || {}).length > 0 && (
                <>
                  <h4 style={{ margin: '12px 0 6px' }}>Short Positions</h4>
                  {Object.entries(portfolio.shortPositions).map(([ticker, pos]) => (
                    <div key={ticker} className="card" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', marginBottom: 4 }}>
                      <span>SHORT {pos.qty} ${ticker} @ {fmt(pos.openPrice)}</span>
                      <button className="btn btn-small btn-green" onClick={() => doAction(() => coverShort({ ticker }), 'Short covered!')}>Cover</button>
                    </div>
                  ))}
                </>
              )}
            </>
          ) : (
            <div className="card" style={{ textAlign: 'center', padding: 16 }}>
              <button className="btn btn-blue" onClick={load}>Load Portfolio</button>
            </div>
          )}
        </div>
      )}

      {/* Trade Tab */}
      {tab === 2 && (
        <div>
          {/* Stock Selector */}
          <div style={{ marginBottom: 8 }}>
            <select value={selectedTicker || ''} onChange={e => selectStock(e.target.value)}
              style={{ width: '100%', padding: 8, borderRadius: 8, background: 'var(--card-bg)', color: 'var(--text)', border: '1px solid var(--border)' }}>
              <option value="">Select a stock...</option>
              {stocks.map(s => (
                <option key={s.ticker} value={s.ticker}>${s.ticker} - {s.companyName} ({fmt(s.price)})</option>
              ))}
            </select>
          </div>

          {stockDetail && (
            <>
              <div className="card" style={{ padding: 12, marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 700 }}>${stockDetail.stock.ticker}</div>
                    <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>{stockDetail.stock.companyName}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 20, fontWeight: 700 }}>{fmt(stockDetail.stock.price)}</div>
                    <div style={{ fontSize: 12, color: stockDetail.stock.change >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {pct(stockDetail.stock.change)}
                    </div>
                  </div>
                </div>
                {stockDetail.priceHistory && stockDetail.priceHistory.length > 2 && (
                  <PriceChart data={stockDetail.priceHistory.map(h => h.close)} width={320} height={80} />
                )}
                <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 11, color: 'var(--text-dim)' }}>
                  <span>EPS: {fmt(stockDetail.stock.eps)}</span>
                  <span>Sector: {stockDetail.stock.sector}</span>
                  <span>Shares: {(stockDetail.stock.totalShares || 0).toLocaleString()}</span>
                </div>
              </div>

              {/* Investor Prospectus */}
              {stockDetail.prospectus && <InvestorProspectus prospectus={stockDetail.prospectus} stock={stockDetail.stock} />}

              {/* Order Book */}
              <OrderBook orderBook={stockDetail.orderBook} />

              {/* Recent Trades (Share Trade Log) */}
              {stockDetail.tradeLogs && stockDetail.tradeLogs.length > 0 && (
                <div className="card" style={{ padding: 12, marginTop: 8 }}>
                  <h4 style={{ margin: '0 0 8px' }}>Recent Trades</h4>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', display: 'flex', gap: 4, marginBottom: 4, padding: '0 4px' }}>
                    <span style={{ flex: '0 0 36px' }}>Day</span>
                    <span style={{ flex: 1 }}>Buyer</span>
                    <span style={{ flex: 1 }}>Seller</span>
                    <span style={{ flex: '0 0 40px', textAlign: 'right' }}>Qty</span>
                    <span style={{ flex: '0 0 56px', textAlign: 'right' }}>Price</span>
                  </div>
                  <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                    {stockDetail.tradeLogs.map((t, i) => {
                      const worldDay = (g.startDay || 1) + (t.day || 0) - 1;
                      const cal = getCalendar(worldDay);
                      const dateStr = `${cal.monthName.slice(0,3)} ${cal.dayOfMonth}`;
                      const iAmBuyer = t.buyerId === g.id;
                      const iAmSeller = t.sellerId === g.id;
                      return (
                        <div key={i} style={{ display: 'flex', gap: 4, fontSize: 11, padding: '3px 4px', borderTop: '1px solid var(--border)', background: (iAmBuyer || iAmSeller) ? '#ffffff08' : 'transparent' }}>
                          <span style={{ flex: '0 0 48px', color: 'var(--text-dim)' }}>{dateStr}</span>
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: iAmBuyer ? 'var(--accent)' : 'var(--green)', fontWeight: iAmBuyer ? 700 : 400 }}>{iAmBuyer ? '👤 You' : t.buyerName}</span>
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: iAmSeller ? 'var(--accent)' : 'var(--red)', fontWeight: iAmSeller ? 700 : 400 }}>{iAmSeller ? '👤 You' : t.sellerName}</span>
                          <span style={{ flex: '0 0 36px', textAlign: 'right' }}>{t.qty}</span>
                          <span style={{ flex: '0 0 56px', textAlign: 'right', fontWeight: 600 }}>${t.price?.toFixed(2)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Order Form */}
              <div className="card" style={{ padding: 12, marginTop: 8 }}>
                <h4 style={{ margin: '0 0 8px' }}>Place Order</h4>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <button className={`btn ${orderForm.side === 'buy' ? 'btn-green' : ''}`} style={{ flex: 1 }}
                    onClick={() => setOrderForm({ ...orderForm, side: 'buy' })}>Buy</button>
                  <button className={`btn ${orderForm.side === 'sell' ? 'btn-red' : ''}`} style={{ flex: 1 }}
                    onClick={() => setOrderForm({ ...orderForm, side: 'sell' })}>Sell</button>
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <button className={`btn btn-small ${orderForm.type === 'market' ? 'active' : ''}`}
                    onClick={() => setOrderForm({ ...orderForm, type: 'market' })}>Market</button>
                  <button className={`btn btn-small ${orderForm.type === 'limit' ? 'active' : ''}`}
                    onClick={() => setOrderForm({ ...orderForm, type: 'limit' })}>Limit</button>
                </div>
                <input type="number" placeholder="Quantity" value={orderForm.qty}
                  onChange={e => setOrderForm({ ...orderForm, qty: e.target.value })}
                  style={{ width: '100%', marginBottom: 8, padding: 8, borderRadius: 6, background: 'var(--card-bg)', color: 'var(--text)', border: '1px solid var(--border)' }} />
                {orderForm.type === 'limit' && (
                  <input type="number" placeholder="Limit Price" value={orderForm.limitPrice}
                    onChange={e => setOrderForm({ ...orderForm, limitPrice: e.target.value })}
                    style={{ width: '100%', marginBottom: 8, padding: 8, borderRadius: 6, background: 'var(--card-bg)', color: 'var(--text)', border: '1px solid var(--border)' }} />
                )}
                {orderForm.qty && stockDetail && (
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 8 }}>
                    Est. total: {fmt(parseInt(orderForm.qty || 0) * stockDetail.stock.price)} + ~1.5% commission
                  </div>
                )}
                <button className={`btn ${orderForm.side === 'buy' ? 'btn-green' : 'btn-red'}`} style={{ width: '100%' }}
                  onClick={handlePlaceOrder} disabled={loading}>
                  {loading ? 'Placing...' : (orderForm.side === 'buy' ? 'Buy' : 'Sell') + ' ' + (orderForm.qty || '0') + ' shares'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* IPO Tab */}
      {tab === 3 && (
        <div>
          {se.isPublic ? (
            <div className="card" style={{ padding: 16 }}>
              <h3 style={{ margin: '0 0 8px' }}>Your Company is Public!</h3>
              <div style={{ marginBottom: 12 }}>
                <div>Ticker: <strong>${se.ticker}</strong></div>
                <div>IPO Day: {se.ipoDay}</div>
                <div>Founder Shares: {(se.founderSharesLocked || 0).toLocaleString()}</div>
              </div>
              {/* My Stock Activity */}
              {myStockDetail && (
                <div style={{ marginBottom: 16 }}>
                  <h4 style={{ margin: '0 0 8px', display: 'flex', justifyContent: 'space-between' }}>
                    <span>📈 ${se.ticker} Activity</span>
                    <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 400 }}>
                      Price: <strong style={{ color: 'var(--text)' }}>${(myStockDetail.stock?.price || 0).toFixed(2)}</strong>
                    </span>
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 10 }}>
                    {[
                      { label: 'Float Shares', value: (myStockDetail.stock?.floatShares || 0).toLocaleString() },
                      { label: 'Market Cap', value: `$${Math.round((myStockDetail.stock?.price || 0) * (myStockDetail.stock?.totalShares || 0)).toLocaleString()}` },
                      { label: 'Recent Trades', value: (myStockDetail.tradeLogs?.length || 0) },
                    ].map(s => (
                      <div key={s.label} style={{ background: '#111', borderRadius: 6, padding: '6px 8px', textAlign: 'center' }}>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{s.value}</div>
                        <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                  {/* Order book depth for my stock */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, color: 'var(--green)', fontWeight: 700, marginBottom: 4 }}>BIDS (buyers)</div>
                      {(myStockDetail.orderBook?.bids || []).slice(0,5).map((b, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                          <span style={{ color: 'var(--green)' }}>${b.price.toFixed(2)}</span>
                          <span style={{ color: 'var(--text-dim)' }}>{b.qty} sh</span>
                        </div>
                      ))}
                      {!myStockDetail.orderBook?.bids?.length && <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>No bids</div>}
                    </div>
                    <div style={{ width: 1, background: 'var(--border)' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, color: 'var(--red)', fontWeight: 700, marginBottom: 4 }}>ASKS (sellers)</div>
                      {(myStockDetail.orderBook?.asks || []).slice(0,5).map((a, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                          <span style={{ color: 'var(--red)' }}>${a.price.toFixed(2)}</span>
                          <span style={{ color: 'var(--text-dim)' }}>{a.qty} sh</span>
                        </div>
                      ))}
                      {!myStockDetail.orderBook?.asks?.length && <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>No asks</div>}
                    </div>
                  </div>
                  {/* Recent trades on MY stock */}
                  {myStockDetail.tradeLogs?.length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Recent Trades on Your Stock</div>
                      <div style={{ maxHeight: 160, overflowY: 'auto' }}>
                        {myStockDetail.tradeLogs.map((t, i) => {
                          const worldDay = (g.startDay || 1) + (t.day || 0) - 1;
                          const cal = getCalendar(worldDay);
                          const dateStr = `${cal.monthName.slice(0,3)} ${cal.dayOfMonth}`;
                          const totalVal = (t.qty * t.price);
                          return (
                            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '4px 0', borderBottom: '1px solid #1e1e1e', fontSize: 11 }}>
                              <span style={{ color: 'var(--text-dim)', flex: '0 0 48px' }}>{dateStr}</span>
                              <span style={{ flex: 1, fontWeight: 600, color: 'var(--green)' }}>{t.buyerName}</span>
                              <span style={{ flex: '0 0 40px', textAlign: 'right', color: 'var(--text-dim)' }}>{t.qty} sh</span>
                              <span style={{ flex: '0 0 64px', textAlign: 'right', fontWeight: 700, color: 'var(--accent)' }}>${Math.round(totalVal).toLocaleString()}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {!myStockDetail.tradeLogs?.length && (
                    <div style={{ fontSize: 12, color: 'var(--text-dim)', textAlign: 'center', padding: '12px 0' }}>No trades yet — bots will start buying soon</div>
                  )}
                </div>
              )}

              <h4 style={{ margin: '12px 0 6px' }}>Dividend Payout Ratio</h4>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="range" min="0" max="75" value={divRatio}
                  onChange={e => {
                    const val = parseInt(e.target.value);
                    setDivRatio(val);
                    clearTimeout(divTimerRef.current);
                    divTimerRef.current = setTimeout(() => {
                      doAction(() => setDividendRatio(val / 100), `Dividend ratio set to ${val}%`);
                    }, 500);
                  }}
                  style={{ flex: 1 }} />
                <span style={{ fontWeight: 700 }}>{divRatio}%</span>
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-dim)' }}>% of weekly profit distributed to shareholders as dividends.</p>
            </div>
          ) : (
            <div className="card" style={{ padding: 16 }}>
              <h3 style={{ margin: '0 0 8px' }}>Take Your Company Public</h3>
              <p style={{ color: 'var(--text-dim)', marginBottom: 12 }}>
                IPO your company on TESX. Other players can buy shares and receive dividends. You retain 51% as founder.
              </p>
              <h4 style={{ margin: '0 0 6px' }}>Requirements</h4>
              <ul style={{ margin: '0 0 12px', paddingLeft: 20 }}>
                {[
                  { label: 'Reputation 40+', met: (g.reputation || 0) >= 40 },
                  { label: '$500K total revenue', met: (g.totalRev || 0) >= 500000 },
                  { label: '3+ shop locations', met: (g.locations || []).length >= 3 },
                  { label: '60+ days old', met: (g.day || 0) >= 60 },
                  { label: '$50K cash on hand', met: (g.cash || 0) >= 50000 },
                ].map(r => (
                  <li key={r.label} style={{ color: r.met ? 'var(--green)' : 'var(--text-dim)' }}>
                    {r.met ? '\u2713' : '\u2717'} {r.label}
                  </li>
                ))}
              </ul>
              <div style={{ marginBottom: 12 }}>
                <h4 style={{ margin: '0 0 4px' }}>Dividend Ratio</h4>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="range" min="0" max="75" value={ipoDivRatio}
                    onChange={e => setIpoDivRatio(parseInt(e.target.value))}
                    style={{ flex: 1 }} />
                  <span style={{ fontWeight: 700 }}>{ipoDivRatio}%</span>
                </div>
              </div>
              <div style={{ marginBottom: 8, fontSize: 12, color: 'var(--text-dim)' }}>
                Listing fee: $25,000 + 2% of IPO proceeds
              </div>
              <button className="btn btn-green" style={{ width: '100%' }} disabled={loading}
                onClick={() => {
                  doAction(() => applyForIPO({ dividendPayoutRatio: ipoDivRatio / 100 }), 'IPO successful!');
                }}>
                {loading ? 'Processing...' : 'Launch IPO'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Premium Tab */}
      {tab === 4 && (
        <div>
          <h4 style={{ margin: '0 0 8px' }}>Premium Features (TC)</h4>
          {[
            { key: 'margin', icon: '\u{1F4B0}', unlocked: se.marginEnabled },
            { key: 'darkPool', icon: '\u{1F576}', unlocked: se.darkPoolAccess },
            { key: 'shortSelling', icon: '\u{1F4C9}', unlocked: se.shortSellingEnabled },
            { key: 'charting', icon: '\u{1F4CA}', unlocked: se.advancedCharting },
            { key: 'alerts', icon: '\u{1F514}', unlocked: se.realTimeAlerts },
            { key: 'ipoPriority', icon: '\u{2B50}', unlocked: se.ipoPriority },
          ].map(f => {
            const feat = { margin: { cost: 1000, label: 'Margin Trading', desc: '2:1 leverage' }, darkPool: { cost: 2000, label: 'Dark Pool Access', desc: 'Hidden large orders' }, shortSelling: { cost: 1500, label: 'Short Selling', desc: 'Profit from drops' }, charting: { cost: 300, label: 'Advanced Charting', desc: 'Candlestick + indicators' }, alerts: { cost: 500, label: 'Price Alerts', desc: 'Up to 10 alerts' }, ipoPriority: { cost: 750, label: 'IPO Priority', desc: '5% guaranteed allocation' } }[f.key];
            return (
              <div key={f.key} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', marginBottom: 4 }}>
                <div>
                  <span style={{ marginRight: 8 }}>{f.icon}</span>
                  <strong>{feat.label}</strong>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{feat.desc}</div>
                </div>
                {f.unlocked ? (
                  <span style={{ color: 'var(--green)', fontWeight: 700 }}>{'\u2713'} Unlocked</span>
                ) : (
                  <button className="btn btn-small btn-blue" disabled={loading}
                    onClick={() => doAction(() => unlockExchangeFeature(f.key), feat.label + ' unlocked!')}>
                    {feat.cost} TC
                  </button>
                )}
              </div>
            );
          })}

          {/* Vinnie's Tips */}
          <div className="card" style={{ padding: 12, marginTop: 12 }}>
            <h4 style={{ margin: '0 0 6px' }}>{'\u{1F50D}'} Vinnie's Stock Tips</h4>
            <p style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8 }}>
              Vinnie claims 60% accuracy. You get what you pay for...
            </p>
            {vinnieTip && (
              <div className="card" style={{ background: 'var(--card-bg)', padding: 10, marginBottom: 8 }}>
                <div style={{ fontWeight: 700 }}>${vinnieTip.ticker} - {vinnieTip.companyName}</div>
                <div style={{ fontSize: 13 }}>{vinnieTip.message}</div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Confidence: {vinnieTip.confidence}%</div>
              </div>
            )}
            <button className="btn btn-small" disabled={loading}
              onClick={async () => {
                setLoading(true);
                try {
                  const res = await requestVinnieTip();
                  if (res.error) setMsg(res.error);
                  else { setVinnieTip(res.tip); await refreshState(); }
                } catch (e) { setMsg(e.message); }
                setLoading(false);
              }}>
              Buy Tip (200 TC)
            </button>
          </div>

          {/* Scratch Ticket */}
          <div className="card" style={{ padding: 12, marginTop: 12 }}>
            <h4 style={{ margin: '0 0 6px' }}>{'\u{1F3B0}'} Lucky Scratch Ticket</h4>
            <p style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8 }}>
              Win $50 to $5,000,000! Match 3 symbols to win.
            </p>

            {scratchTicket ? (
              <div>
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6,
                  maxWidth: 240, margin: '0 auto 12px',
                }}>
                  {scratchTicket.cells.map((cell, i) => (
                    <div key={i}
                      onClick={() => handleScratchReveal(i)}
                      style={{
                        width: '100%', aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        borderRadius: 8, fontSize: 24, fontWeight: 700, cursor: scratchRevealed.has(i) ? 'default' : 'pointer',
                        background: scratchRevealed.has(i) ? 'var(--card-bg)' : 'linear-gradient(135deg, #c0c0c0, #808080)',
                        border: '2px solid var(--border)',
                        transition: 'all 0.3s',
                        color: scratchRevealed.has(i) ? 'var(--text)' : 'transparent',
                        userSelect: 'none',
                      }}>
                      {scratchRevealed.has(i) ? cell : '?'}
                    </div>
                  ))}
                </div>
                {!allRevealed && (
                  <div style={{ textAlign: 'center' }}>
                    <button className="btn btn-small" onClick={() => {
                      const all = new Set();
                      for (let i = 0; i < 9; i++) all.add(i);
                      setScratchRevealed(all);
                    }}>Reveal All</button>
                  </div>
                )}
                {allRevealed && !scratchClaimed && (
                  <div style={{ textAlign: 'center', marginTop: 8 }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--green)', marginBottom: 8 }}>
                      You won {fmt(scratchTicket.prize)}!
                    </div>
                    <button className="btn btn-green" onClick={handleScratchClaim}>Claim Prize</button>
                  </div>
                )}
                {scratchClaimed && (
                  <div style={{ textAlign: 'center', marginTop: 8 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--green)' }}>
                      {'\u2713'} Prize claimed!
                    </div>
                    <button className="btn btn-small" style={{ marginTop: 8 }} onClick={handleScratchBuy}>
                      Buy Another (1,000 TC)
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button className="btn btn-blue" onClick={handleScratchBuy} disabled={loading}>
                {loading ? 'Buying...' : 'Buy Ticket (1,000 TC)'}
              </button>
            )}
          </div>

          {/* Rewarded Ad — free TC for non-premium */}
          <RewardedAdButton />
        </div>
      )}
    </div>
  );
}
