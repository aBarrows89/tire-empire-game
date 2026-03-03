import React, { useState, useEffect } from 'react';
import { MONET } from '@shared/constants/monetization.js';

const ADS = MONET.adContent;
const ROTATE_MS = 8000;

export default function AdBanner({ onOpenPremium }) {
  const [index, setIndex] = useState(0);
  const [dismissed, setDismissed] = useState(() => {
    try {
      const ts = localStorage.getItem('te_adDismissed');
      // Stay dismissed for 10 minutes
      return ts && Date.now() - Number(ts) < 600000;
    } catch { return false; }
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex(i => (i + 1) % ADS.length);
    }, ROTATE_MS);
    return () => clearInterval(timer);
  }, []);

  // Hide banner when keyboard is likely open (input focused)
  const [inputFocused, setInputFocused] = useState(false);
  useEffect(() => {
    const onFocus = (e) => { if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') setInputFocused(true); };
    const onBlur = () => setInputFocused(false);
    document.addEventListener('focusin', onFocus);
    document.addEventListener('focusout', onBlur);
    return () => { document.removeEventListener('focusin', onFocus); document.removeEventListener('focusout', onBlur); };
  }, []);

  if (dismissed || inputFocused) return null;

  const ad = ADS[index];

  return (
    <div
      className="ad-banner"
      style={{ background: ad.color }}
      onClick={onOpenPremium}
    >
      <span className="ad-banner-text">{ad.text}</span>
      <span className="ad-banner-pro">Remove ads — Go PRO</span>
      <button
        className="ad-banner-close"
        onClick={e => {
          e.stopPropagation();
          setDismissed(true);
          try { localStorage.setItem('te_adDismissed', String(Date.now())); } catch {}
        }}
        aria-label="Dismiss ad"
      >
        {'\u2715'}
      </button>
    </div>
  );
}
