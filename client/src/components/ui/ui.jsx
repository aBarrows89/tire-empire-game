import React from 'react';

// ─── TIRECOIN ICON ───
export function TireCoin({ size = 24, spinning = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100"
      style={spinning ? { animation: 'coinSpin 2s ease-in-out infinite' } : {}}>
      <defs>
        <radialGradient id="tc-cf" cx="40%" cy="35%" r="60%">
          <stop offset="0%" stopColor="#ffe082"/><stop offset="45%" stopColor="#ffd54f"/>
          <stop offset="80%" stopColor="#ffb300"/><stop offset="100%" stopColor="#e6a100"/>
        </radialGradient>
        <linearGradient id="tc-cr" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffb300"/><stop offset="50%" stopColor="#c68400"/><stop offset="100%" stopColor="#a06800"/>
        </linearGradient>
        <radialGradient id="tc-cs" cx="30%" cy="25%" r="40%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.6)"/><stop offset="100%" stopColor="rgba(255,255,255,0)"/>
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="46" fill="url(#tc-cr)"/>
      {Array.from({length: 36}).map((_, i) => {
        const a = i * 10 * (Math.PI / 180);
        return <line key={i} x1={50+Math.cos(a)*43} y1={50+Math.sin(a)*43} x2={50+Math.cos(a)*46} y2={50+Math.sin(a)*46} stroke="#8b6914" strokeWidth="1.8" strokeLinecap="round"/>;
      })}
      <circle cx="50" cy="50" r="39" fill="url(#tc-cf)"/>
      <circle cx="50" cy="50" r="33" fill="none" stroke="#c68400" strokeWidth="1" opacity="0.5"/>
      <text x="50" y="58" textAnchor="middle" fontSize="30" fontWeight="900" fill="#8b6914" letterSpacing="-1" fontFamily="sans-serif">TC</text>
      <text x="50" y="57" textAnchor="middle" fontSize="30" fontWeight="900" fill="#c68400" letterSpacing="-1" fontFamily="sans-serif">TC</text>
      <text x="50" y="56.5" textAnchor="middle" fontSize="30" fontWeight="900" fill="#ffd54f" letterSpacing="-1" fontFamily="sans-serif">TC</text>
      <circle cx="50" cy="50" r="39" fill="url(#tc-cs)"/>
      <g transform="translate(32,30)" opacity="0.8">
        <line x1="-4" y1="0" x2="4" y2="0" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="0" y1="-4" x2="0" y2="4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>
      </g>
    </svg>
  );
}

// ─── PROGRESS RING ───
export function ProgressRing({ value, max, size = 44, stroke = 3.5, color = 'var(--accent)', children }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  return (
    <div style={{ position: 'relative', width: size, height: size, display: 'inline-block' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}/>
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.24, fontWeight: 700, color: 'var(--text)',
      }}>{children}</div>
    </div>
  );
}

// ─── PROGRESS BAR ───
export function ProgressBar({ pct, color = 'var(--accent)', height = 5 }) {
  return (
    <div style={{ height, background: 'rgba(255,255,255,0.06)', borderRadius: height / 2, overflow: 'hidden' }}>
      <div style={{
        height: '100%', width: `${Math.min(pct, 100)}%`,
        background: color, borderRadius: height / 2,
        transition: 'width 0.5s ease',
      }}/>
    </div>
  );
}

// ─── MINI SPARKLINE ───
export function MiniSparkline({ data, color = 'var(--green)', width = 70, height = 22 }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) =>
    `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * height}`
  ).join(' ');
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round"/>
    </svg>
  );
}

// ─── TAG / PILL ───
export function Tag({ children, color = 'var(--text-dim)', bg = 'rgba(255,255,255,0.05)' }) {
  return (
    <span style={{
      fontSize: 9, padding: '2px 6px', borderRadius: 4,
      background: bg, color, whiteSpace: 'nowrap', display: 'inline-block',
    }}>{children}</span>
  );
}

// ─── CARD (new visual) ───
export function UICard({ children, glow, style = {}, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: 'var(--card)', borderRadius: 14, padding: 14,
      border: `1px solid ${glow || 'var(--border)'}`,
      boxShadow: glow ? `0 0 12px ${glow}22` : 'none',
      marginBottom: 8, transition: 'all 0.3s ease',
      cursor: onClick ? 'pointer' : 'default',
      ...style,
    }}>{children}</div>
  );
}

// ─── SECTION HEADER ───
export function SectionHeader({ title, icon, right }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 700 }}>{icon} {title}</div>
      {right && <div>{right}</div>}
    </div>
  );
}

// ─── CHANNEL BAR (revenue breakdown) ───
export function ChannelBar({ label, icon, value, maxValue }) {
  const pct = maxValue > 0 ? Math.min(value / maxValue * 100, 100) : 0;
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
        <span style={{ color: 'var(--text-dim)' }}>{icon} {label}</span>
        <span style={{ fontWeight: 700, color: 'var(--green)' }}>${value.toLocaleString()}</span>
      </div>
      <ProgressBar pct={pct} color="var(--accent)"/>
    </div>
  );
}

// ─── HEALTH COLOR HELPERS ───
export function profitColor(profit) {
  return profit >= 0 ? 'var(--green)' : 'var(--red)';
}
export function profitBg(profit) {
  return profit >= 0 ? 'rgba(76,175,80,0.12)' : 'rgba(239,83,80,0.1)';
}
export function loyaltyColor(loyalty) {
  return loyalty >= 70 ? 'var(--green)' : loyalty >= 40 ? 'var(--gold)' : 'var(--red)';
}
export function invColor(inv, cap) {
  const pct = cap > 0 ? inv / cap : 0;
  return pct > 0.3 ? 'var(--accent)' : 'var(--red)';
}

// ─── STAT PILL (compact stat display) ───
export function StatPill({ icon, label, value, color = 'var(--text)' }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
      background: 'var(--card)', borderRadius: 10, border: '1px solid var(--border)',
    }}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: 0.5, textTransform: 'uppercase' }}>{label}</div>
        <div style={{ fontSize: 15, fontWeight: 700, color }}>{value}</div>
      </div>
    </div>
  );
}
