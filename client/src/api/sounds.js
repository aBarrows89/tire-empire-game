let audioCtx = null;
const MUTE_KEY = 'te_soundMuted';

function getCtx() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
  }
  return audioCtx;
}

export function isMuted() {
  try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
}

export function toggleMute() {
  const muted = !isMuted();
  try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch {}
  return muted;
}

const SOUNDS = {
  purchase: { freq: 880, type: 'sine', dur: 0.12, freq2: 1100 },
  achievement: { freq: 523, type: 'sine', dur: 0.3, freq2: 784, dur2: 0.3 },
  error: { freq: 220, type: 'square', dur: 0.15 },
  cash: { freq: 1200, type: 'sine', dur: 0.08, freq2: 1500 },
};

export function playSound(name) {
  if (isMuted()) return;
  const ctx = getCtx();
  if (!ctx) return;
  const def = SOUNDS[name];
  if (!def) return;

  try {
    // Resume context if suspended (autoplay policy)
    if (ctx.state === 'suspended') ctx.resume();

    const gain = ctx.createGain();
    gain.gain.value = 0.15;
    gain.connect(ctx.destination);

    const osc = ctx.createOscillator();
    osc.type = def.type;
    osc.frequency.setValueAtTime(def.freq, ctx.currentTime);
    if (def.freq2) {
      osc.frequency.linearRampToValueAtTime(def.freq2, ctx.currentTime + def.dur);
    }
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + def.dur + (def.dur2 || 0.05));
    osc.connect(gain);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + def.dur + (def.dur2 || 0.05) + 0.01);

    // Second tone for achievement
    if (name === 'achievement' && def.freq2) {
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      gain2.gain.value = 0.12;
      gain2.connect(ctx.destination);
      osc2.type = 'sine';
      osc2.frequency.value = def.freq2;
      gain2.gain.linearRampToValueAtTime(0, ctx.currentTime + def.dur + def.dur2);
      osc2.connect(gain2);
      osc2.start(ctx.currentTime + def.dur * 0.5);
      osc2.stop(ctx.currentTime + def.dur + def.dur2 + 0.01);
    }
  } catch {}
}
