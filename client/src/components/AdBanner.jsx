import React, { useState, useEffect } from 'react';
import { MONET } from '@shared/constants/monetization.js';

const ADS = MONET.adContent;
const ROTATE_MS = 8000;

export default function AdBanner({ onOpenPremium }) {
  const [index, setIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex(i => (i + 1) % ADS.length);
    }, ROTATE_MS);
    return () => clearInterval(timer);
  }, []);

  if (dismissed) return null;

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
        onClick={e => { e.stopPropagation(); setDismissed(true); }}
        aria-label="Dismiss ad"
      >
        {'\u2715'}
      </button>
    </div>
  );
}
