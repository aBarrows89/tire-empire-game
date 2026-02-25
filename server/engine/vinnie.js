import { VINNIE_TIPS } from '../../shared/constants/vinnieTips.js';

/**
 * Get a contextual Vinnie tip based on current game state.
 * Returns a tip string, or a generic fallback.
 *
 * TODO: Populate VINNIE_TIPS from full source. Each tip has a condition
 * function and tip text. For now returns generic tips.
 */
export function getVinnieTip(g) {
  // Once VINNIE_TIPS is populated, filter by condition:
  // const applicable = VINNIE_TIPS.filter(t => t.cond(g));
  // if (applicable.length > 0) return applicable[Math.floor(Math.random() * applicable.length)].tip;

  // Generic fallbacks based on game state
  if (g.cash < 100) return "You're almost broke, kid. Go hit up a scrap yard — even junk tires flip for something.";
  if (g.reputation < 5) return "Nobody knows you yet. Sell cheap, sell fast, build that rep.";
  if (g.locations.length === 0 && g.cash > 137500) return "You've got enough for a shop. Time to stop working out of your van, don't you think?";
  if ((g.day || g.week || 1) < 30) return "First month is tough. Keep grinding those used tire sources.";
  return "Keep moving tires, kid. That's how empires are built.";
}
