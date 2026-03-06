import React, { useState, useEffect, useCallback } from 'react';
import { useGame } from '../../context/GameContext.jsx';
import { postAction, getHeaders, API_BASE } from '../../api/client.js';
import { fmt } from '@shared/helpers/format.js';
import { FRANCHISE_PERKS, FRANCHISE_REQUIREMENTS } from '@shared/constants/franchise.js';

const { MIN_REP_TO_FRANCHISE, MIN_LOCATIONS_TO_FRANCHISE } = FRANCHISE_REQUIREMENTS;

// ─── Sub-tabs ───────────────────────────────────────────────
const TABS = [
  { key: 'marketplace', label: '🏪 Marketplace' },
  { key: 'my_agreements', label: '📄 My Franchises' },
  { key: 'franchisor', label: '👑 My Offering' },
];

export default function FranchisePanel() {
  const { state, refreshState } = useGame();
  const g = state.game;
  const [tab, setTab] = useState('marketplace');

  return (
    <div>
      <div className="card">
        <div className="card-title">Franchising</div>
        <div className="text-xs text-dim">
          Buy into established brands or franchise your own. DBA agreements, royalties, and brand recognition.
        </div>
      </div>

      <div className="row-between mb-8" style={{ gap: 4 }}>
        {TABS.map(t => (
          <button
            key={t.key}
            className={`btn btn-sm ${tab === t.key ? 'btn-blue' : 'btn-outline'}`}
            style={{ flex: 1, fontSize: 11 }}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'marketplace' && <FranchiseMarketplace g={g} refreshState={refreshState} />}
      {tab === 'my_agreements' && <MyFranchises g={g} refreshState={refreshState} />}
      {tab === 'franchisor' && <FranchisorPanel g={g} refreshState={refreshState} />}
    </div>
  );
}

// ─── Marketplace ───────────────────────────────────────────
function FranchiseMarketplace({ g, refreshState }) {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [buyingLocationId, setBuyingLocationId] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const load = useCallback(async () => {
    try {
      const headers = await getHeaders();
      const res = await fetch(`${API_BASE}/franchise/listings`, { headers });
      const data = await res.json();
      setListings(Array.isArray(data) ? data : []);
    } catch {
      setListings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const availableLocs = (g.locations || []).filter(l => !l.franchise);

  const handleBuy = async () => {
    if (!selected || !buyingLocationId) return;
    setPending(true);
    setError(null);
    try {
      const res = await postAction('buyFranchise', { offeringId: selected.id, locationId: buyingLocationId });
      if (res?.ok) {
        setSuccess(`Welcome to ${selected.brand_name}! Your location is now DBA ${selected.brand_name}.`);
        setSelected(null);
        refreshState();
        load();
      } else {
        setError(res?.error || 'Failed to buy franchise');
      }
    } finally {
      setPending(false);
    }
  };

  if (loading) return <div className="card text-xs text-dim">Loading franchises…</div>;

  return (
    <div>
      {success && <div className="card text-sm" style={{ color: '#4caf50', marginBottom: 8 }}>{success}</div>}

      {listings.length === 0 ? (
        <div className="card text-xs text-dim">No franchise opportunities available yet. Players with factories and high reputation can create offerings.</div>
      ) : (
        listings.map(listing => (
          <FranchiseListing
            key={listing.id}
            listing={listing}
            g={g}
            isSelected={selected?.id === listing.id}
            onSelect={() => setSelected(selected?.id === listing.id ? null : listing)}
            availableLocs={availableLocs}
            buyingLocationId={buyingLocationId}
            setBuyingLocationId={setBuyingLocationId}
            onBuy={handleBuy}
            pending={pending}
            error={error}
          />
        ))
      )}
    </div>
  );
}

function FranchiseListing({ listing, g, isSelected, onSelect, availableLocs, buyingLocationId, setBuyingLocationId, onBuy, pending, error }) {
  const canAfford = g.cash >= listing.buy_in;
  const meetsRep = g.reputation >= listing.min_rep;
  const hasLoc = availableLocs.length > 0;
  const perks = Array.isArray(listing.perks) ? listing.perks : [];

  return (
    <div className="card" style={{ borderLeft: isSelected ? '2px solid #4ea8de' : '2px solid transparent' }}>
      <div className="row-between mb-4">
        <div>
          <div className="font-bold" style={{ fontSize: 15 }}>{listing.brand_name}</div>
          <div className="text-xs text-dim">{listing.description}</div>
        </div>
        <div className="text-xs text-dim" style={{ textAlign: 'right' }}>
          <div>{listing.franchisee_count || 0} / {listing.max_franchisees} locations</div>
        </div>
      </div>

      <div className="row-between mb-8">
        <div className="text-xs">
          <div>💰 Buy-in: <span className="font-bold" style={{ color: canAfford ? '#4caf50' : '#ef5350' }}>${fmt(listing.buy_in)}</span></div>
          <div>📊 Royalty: <span className="font-bold">{(listing.royalty_pct * 100).toFixed(1)}% of shop revenue</span></div>
          <div>📅 Monthly fee: <span className="font-bold">${fmt(listing.monthly_fee)}</span></div>
          {listing.min_rep > 0 && <div>⭐ Min rep: <span className={meetsRep ? 'text-green' : 'text-red'}>{listing.min_rep}</span></div>}
        </div>
        <div className="text-xs">
          {perks.map(p => FRANCHISE_PERKS[p] && (
            <div key={p}>{FRANCHISE_PERKS[p].icon} {FRANCHISE_PERKS[p].label}</div>
          ))}
        </div>
      </div>

      <button
        className={`btn btn-sm ${isSelected ? 'btn-outline' : 'btn-green'}`}
        style={{ width: '100%' }}
        disabled={!canAfford || !meetsRep || !hasLoc}
        onClick={onSelect}
      >
        {isSelected ? 'Cancel' : !hasLoc ? 'No available locations' : !meetsRep ? `Need ${listing.min_rep} rep` : !canAfford ? `Need $${fmt(listing.buy_in)}` : 'Apply for Franchise'}
      </button>

      {isSelected && (
        <div style={{ marginTop: 8 }}>
          <div className="text-xs text-dim mb-4">Select which location to convert to a {listing.brand_name} franchise:</div>
          <select
            className="input mb-8"
            value={buyingLocationId}
            onChange={e => setBuyingLocationId(e.target.value)}
            style={{ width: '100%', fontSize: 13 }}
          >
            <option value="">— Choose location —</option>
            {availableLocs.map(l => (
              <option key={l.id} value={l.id}>{l.name || 'Shop'} (current rev: ${fmt(l.dailyStats?.rev || 0)}/day)</option>
            ))}
          </select>
          <div className="text-xs text-dim mb-8">
            This location will display as: <strong>{listing.brand_name} (DBA {g.companyName})</strong>
          </div>
          {error && <div className="text-xs text-red mb-4">{error}</div>}
          <button
            className="btn btn-green btn-sm"
            style={{ width: '100%' }}
            disabled={!buyingLocationId || pending}
            onClick={onBuy}
          >
            {pending ? 'Processing…' : `Sign Agreement & Pay $${fmt(listing.buy_in)}`}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── My Franchises (as franchisee) ─────────────────────────
function MyFranchises({ g, refreshState }) {
  const [pending, setPending] = useState(null);
  const [error, setError] = useState(null);

  const activeFranchises = (g.franchises || []).filter(f => f.status === 'active');
  const franchisedLocs = (g.locations || []).filter(l => l.franchise);

  const terminate = async (agreementId, brandName) => {
    if (!confirm(`Terminate ${brandName} franchise? This cannot be undone.`)) return;
    setPending(agreementId);
    setError(null);
    try {
      const res = await postAction('terminateFranchise', { agreementId });
      if (res?.ok) refreshState();
      else setError(res?.error || 'Failed');
    } finally {
      setPending(null);
    }
  };

  if (activeFranchises.length === 0) {
    return (
      <div className="card text-xs text-dim">
        You have no active franchise agreements. Browse the Marketplace to find opportunities.
      </div>
    );
  }

  return (
    <div>
      {error && <div className="card text-xs text-red mb-8">{error}</div>}
      {franchisedLocs.map(loc => {
        const franchise = loc.franchise;
        const agreement = activeFranchises.find(f => f.locationId === loc.id);
        if (!franchise || !agreement) return null;

        const totalPaid = agreement.totalRoyaltiesPaid || 0;
        const perks = franchise.perks || [];

        return (
          <div key={loc.id} className="card">
            {/* DBA Header */}
            <div style={{ marginBottom: 8 }}>
              <div className="font-bold" style={{ fontSize: 15 }}>🏪 {franchise.brandName}</div>
              <div className="text-xs text-dim">DBA {g.companyName} — {loc.name || 'Shop'}</div>
            </div>

            <div className="text-xs mb-8">
              <div>📊 Royalty: {(franchise.royaltyPct * 100).toFixed(1)}% of daily revenue</div>
              <div>📅 Monthly fee: ${fmt(franchise.monthlyFee)}</div>
              <div>💸 Total paid: ${fmt(totalPaid)}</div>
              <div>📆 Active since day {franchise.startDay}</div>
              {franchise.requiredBrand && (
                <div style={{ color: '#ff9800', marginTop: 4 }}>
                  ⚠️ Must stock {franchise.requiredBrand} branded tires
                </div>
              )}
            </div>

            {perks.length > 0 && (
              <div className="text-xs mb-8">
                {perks.map(p => FRANCHISE_PERKS[p] && (
                  <div key={p}>{FRANCHISE_PERKS[p].icon} {FRANCHISE_PERKS[p].label}</div>
                ))}
              </div>
            )}

            <div style={{ borderTop: '1px solid #333', paddingTop: 8 }}>
              <div className="text-xs text-dim mb-4">Daily rev: ${fmt(loc.dailyStats?.rev || 0)} → royalty ~${fmt(Math.floor((loc.dailyStats?.rev || 0) * franchise.royaltyPct))}</div>
              <button
                className="btn btn-sm btn-red"
                style={{ width: '100%' }}
                disabled={!!pending}
                onClick={() => terminate(agreement.agreementId, franchise.brandName)}
              >
                {pending === agreement.agreementId ? 'Terminating…' : 'Terminate Agreement'}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Franchisor Panel ──────────────────────────────────────
function FranchisorPanel({ g, refreshState }) {
  const canFranchise = g.hasFactory && g.reputation >= MIN_REP_TO_FRANCHISE && (g.locations || []).length >= MIN_LOCATIONS_TO_FRANCHISE;
  const hasOffering = !!g.franchiseOffering?.active;
  const income = g.franchiseIncome || {};
  const royaltyLog = (g._royaltyLog || []).slice(-5).reverse();

  const [form, setForm] = useState({
    brandName: g.franchiseOffering?.brandName || '',
    description: '',
    buyIn: 50000,
    royaltyPct: 0.07,
    monthlyFee: 1500,
    minRep: 0,
    maxFranchisees: 20,
    perks: ['brand_recognition', 'supply_chain'],
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const togglePerk = (perk) => {
    setForm(f => ({
      ...f,
      perks: f.perks.includes(perk) ? f.perks.filter(p => p !== perk) : [...f.perks, perk],
    }));
  };

  const handleCreate = async () => {
    setPending(true);
    setError(null);
    try {
      const res = await postAction('createFranchiseOffering', form);
      if (res?.ok) {
        setSuccess('Franchise offering created! Other players can now apply.');
        refreshState();
      } else {
        setError(res?.error || 'Failed');
      }
    } finally {
      setPending(false);
    }
  };

  const handleToggleActive = async () => {
    setPending(true);
    try {
      await postAction('updateFranchiseOffering', { active: !g.franchiseOffering.active });
      refreshState();
    } finally {
      setPending(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete your franchise offering permanently? This cannot be undone.')) return;
    setPending(true);
    setError(null);
    try {
      const res = await postAction('deleteFranchiseOffering', {});
      if (res?.ok) {
        setSuccess('Franchise offering deleted.');
        refreshState();
      } else {
        setError(res?.error || 'Failed to delete');
      }
    } finally {
      setPending(false);
    }
  };

  if (!canFranchise) {
    return (
      <div className="card text-xs text-dim">
        <div className="font-bold mb-8">Requirements to create a franchise:</div>
        <div style={{ color: g.hasFactory ? '#4caf50' : '#ef5350' }}>
          {g.hasFactory ? '✓' : '✗'} Factory built
        </div>
        <div style={{ color: g.reputation >= MIN_REP_TO_FRANCHISE ? '#4caf50' : '#ef5350' }}>
          {g.reputation >= MIN_REP_TO_FRANCHISE ? '✓' : '✗'} Reputation {MIN_REP_TO_FRANCHISE}+ (you have {Math.floor(g.reputation)})
        </div>
        <div style={{ color: (g.locations || []).length >= MIN_LOCATIONS_TO_FRANCHISE ? '#4caf50' : '#ef5350' }}>
          {(g.locations || []).length >= MIN_LOCATIONS_TO_FRANCHISE ? '✓' : '✗'} {MIN_LOCATIONS_TO_FRANCHISE}+ locations
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Income summary if already franchising */}
      {(income.totalBuyIns > 0 || income.totalRoyalties > 0) && (
        <div className="card mb-8">
          <div className="card-title">Franchise Income</div>
          <div className="row-between text-xs">
            <div>💰 Total buy-ins received</div>
            <div className="font-bold text-green">${fmt(income.totalBuyIns || 0)}</div>
          </div>
          <div className="row-between text-xs">
            <div>📊 Total royalties earned</div>
            <div className="font-bold text-green">${fmt(income.totalRoyalties || 0)}</div>
          </div>
          <div className="row-between text-xs">
            <div>🏪 Active franchisees</div>
            <div className="font-bold">{g.franchiseOffering?.franchiseeCount || 0}</div>
          </div>
          {royaltyLog.length > 0 && (
            <div style={{ marginTop: 8, borderTop: '1px solid #333', paddingTop: 8 }}>
              <div className="text-xs text-dim mb-4">Recent payments:</div>
              {royaltyLog.map((r, i) => (
                <div key={i} className="text-xs row-between">
                  <span className="text-dim">{r.from} · Day {r.day}</span>
                  <span className="text-green">+${fmt(r.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {hasOffering ? (
        <div className="card">
          <div className="card-title">Your Offering: {g.franchiseOffering.brandName}</div>
          <div className="text-xs mb-8">
            <div>Buy-in: ${fmt(g.franchiseOffering.buyIn)}</div>
            <div>Royalty: {((g.franchiseOffering.royaltyPct || 0) * 100).toFixed(1)}%</div>
            <div>Monthly fee: ${fmt(g.franchiseOffering.monthlyFee)}</div>
          </div>
          <button
            className={`btn btn-sm ${g.franchiseOffering.active ? 'btn-red' : 'btn-green'}`}
            style={{ width: '100%', marginBottom: 6 }}
            disabled={pending}
            onClick={handleToggleActive}
          >
            {g.franchiseOffering.active ? 'Pause Offering (stop new applications)' : 'Reactivate Offering'}
          </button>
          <button
            className="btn btn-sm btn-outline"
            style={{ width: '100%', color: '#ef5350', borderColor: '#ef5350' }}
            disabled={pending}
            onClick={handleDelete}
          >
            Delete Offering Permanently
          </button>
          {error && <div className="text-xs text-red" style={{ marginTop: 6 }}>{error}</div>}
          {success && <div className="text-xs text-green" style={{ marginTop: 6 }}>{success}</div>}
        </div>
      ) : (
        <div className="card">
          <div className="card-title">Create Franchise Offering</div>

          {error && <div className="text-xs text-red mb-8">{error}</div>}
          {success && <div className="text-xs mb-8" style={{ color: '#4caf50' }}>{success}</div>}

          <div className="edit-field mb-8">
            <label className="text-xs text-dim">Franchise Brand Name</label>
            <input className="input" value={form.brandName} onChange={e => setForm(f => ({ ...f, brandName: e.target.value }))} placeholder="e.g. TireMart, FastTrack Tires" />
          </div>

          <div className="edit-field mb-8">
            <label className="text-xs text-dim">Description (sell it)</label>
            <textarea className="input" rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What makes your franchise valuable?" style={{ width: '100%', resize: 'vertical' }} />
          </div>

          <div className="row-between mb-8">
            <div className="edit-field" style={{ flex: 1 }}>
              <label className="text-xs text-dim">Buy-in ($)</label>
              <input className="input" type="number" min={5000} max={5000000} value={form.buyIn} onChange={e => setForm(f => ({ ...f, buyIn: Number(e.target.value) }))} />
            </div>
            <div style={{ width: 8 }} />
            <div className="edit-field" style={{ flex: 1 }}>
              <label className="text-xs text-dim">Royalty %</label>
              <input className="input" type="number" min={2} max={20} step={0.5} value={(form.royaltyPct * 100).toFixed(1)} onChange={e => setForm(f => ({ ...f, royaltyPct: Number(e.target.value) / 100 }))} />
            </div>
          </div>

          <div className="row-between mb-8">
            <div className="edit-field" style={{ flex: 1 }}>
              <label className="text-xs text-dim">Monthly Fee ($)</label>
              <input className="input" type="number" min={0} max={50000} value={form.monthlyFee} onChange={e => setForm(f => ({ ...f, monthlyFee: Number(e.target.value) }))} />
            </div>
            <div style={{ width: 8 }} />
            <div className="edit-field" style={{ flex: 1 }}>
              <label className="text-xs text-dim">Min Rep Required</label>
              <input className="input" type="number" min={0} max={100} value={form.minRep} onChange={e => setForm(f => ({ ...f, minRep: Number(e.target.value) }))} />
            </div>
          </div>

          <div className="edit-field mb-8">
            <label className="text-xs text-dim">Max Franchisees</label>
            <input className="input" type="number" min={1} max={100} value={form.maxFranchisees} onChange={e => setForm(f => ({ ...f, maxFranchisees: Number(e.target.value) }))} />
          </div>

          <div className="mb-8">
            <div className="text-xs text-dim mb-4">Perks included:</div>
            {Object.entries(FRANCHISE_PERKS).map(([key, perk]) => (
              <div key={key} className="row-between mb-4" style={{ cursor: 'pointer' }} onClick={() => togglePerk(key)}>
                <div className="text-xs">{perk.icon} {perk.label}</div>
                <div style={{ width: 16, height: 16, borderRadius: 4, background: form.perks.includes(key) ? '#4ea8de' : '#333', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>
                  {form.perks.includes(key) ? '✓' : ''}
                </div>
              </div>
            ))}
          </div>

          <div className="text-xs text-dim mb-8">
            📝 Revenue estimate: if franchisee earns ${fmt(5000)}/day → you earn ${fmt(Math.floor(5000 * form.royaltyPct))}/day in royalties
          </div>

          <button
            className="btn btn-green"
            style={{ width: '100%' }}
            disabled={pending || !form.brandName || !form.description}
            onClick={handleCreate}
          >
            {pending ? 'Creating…' : 'Launch Franchise Offering'}
          </button>
        </div>
      )}
    </div>
  );
}
