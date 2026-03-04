import React from 'react';

/**
 * Animated Vinnie avatar — CSS-only, no images.
 * Renders a styled "portrait" with emotion-driven expressions.
 * GPU-accelerated: only transforms + opacity change.
 */

const EMOTION_STYLES = {
  smirk:    { mouth: '😏', brow: 'raised-right', bounce: false },
  point:    { mouth: '👉', brow: 'normal',       bounce: true  },
  think:    { mouth: '🤔', brow: 'furrowed',     bounce: false },
  shrug:    { mouth: '🤷', brow: 'raised-both',  bounce: false },
  serious:  { mouth: '😤', brow: 'furrowed',     bounce: false },
  money:    { mouth: '🤑', brow: 'raised-both',  bounce: true  },
  excited:  { mouth: '🤩', brow: 'raised-both',  bounce: true  },
  thumbsup: { mouth: '👍', brow: 'normal',       bounce: true  },
};

export default function VinnieAvatar({ emotion = 'serious', size = 72 }) {
  const cfg = EMOTION_STYLES[emotion] || EMOTION_STYLES.serious;

  return (
    <div
      className={`vinnie-avatar ${cfg.bounce ? 'vinnie-bounce' : ''}`}
      style={{ width: size, height: size }}
    >
      {/* Background circle with gradient */}
      <div className="vinnie-avatar-bg" />
      {/* Suit/collar at bottom */}
      <div className="vinnie-avatar-suit" />
      {/* Face circle */}
      <div className="vinnie-avatar-face">
        {/* Eyes */}
        <div className="vinnie-eyes">
          <div className={`vinnie-eye vinnie-eye-l ${cfg.brow === 'furrowed' ? 'brow-furrowed' : cfg.brow === 'raised-right' ? 'brow-raised-r' : cfg.brow === 'raised-both' ? 'brow-raised' : ''}`} />
          <div className={`vinnie-eye vinnie-eye-r ${cfg.brow === 'furrowed' ? 'brow-furrowed' : cfg.brow === 'raised-right' ? 'brow-raised-r' : cfg.brow === 'raised-both' ? 'brow-raised' : ''}`} />
        </div>
        {/* Mustache */}
        <div className="vinnie-stache" />
        {/* Mouth expression */}
        <div className={`vinnie-mouth vinnie-mouth-${emotion}`} />
      </div>
      {/* Gold chain */}
      <div className="vinnie-chain" />
    </div>
  );
}
