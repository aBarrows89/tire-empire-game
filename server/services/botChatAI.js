/**
 * Bot Chat AI Service
 *
 * Replaces static template-based bot chat with Claude-generated messages.
 * All bots that want to chat this tick are batched into a SINGLE API call.
 *
 * Intensity (1-10) drives expertise level:
 *   1-3  → Casual newcomer. Basic questions, simple observations, often confused
 *   4-6  → Competent operator. Understands the game, talks shop strategy
 *   7-8  → Veteran. Advanced mechanics, precise numbers, mentors others
 *   9-10 → Elite. Talks like a professional — margins, arbitrage, market timing
 *
 * Falls back to template generation silently if:
 *   - ANTHROPIC_API_KEY is not set
 *   - The API call fails or times out
 *   - The response can't be parsed
 */

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-haiku-4-5-20251001';
const TIMEOUT_MS = 8000;

const PERSONALITY_TRAITS = {
  hoarder:         'Stockpiles inventory, reluctant seller, slightly paranoid about running out',
  flipper:         'High-volume low-margin, moves fast, always hunting deals',
  empire_builder:  'Aggressive expander, loves debt if it fuels growth, thinks big',
  conservative:    'Slow and steady, debt-averse, cautious but profitable',
  speculator:      'Obsessed with the stock exchange and market timing, loves a hot take',
  regional_king:   'Dominates their home city, territorial, proud of local reputation',
  ecom_focused:    'Online-first, impatient with retail overhead, tech-forward',
  social_butterfly:'Chatty, supportive, loves the community, easily excited',
  bargain_hunter:  'Price-obsessed, always complaining costs are too high',
  factory_dreamer: 'Fixated on building their own brand, talks about the factory constantly',
};

// How each intensity tier talks — defines vocabulary, confidence, and topic depth
const INTENSITY_PROFILES = {
  novice: { // 1-3
    label: 'casual newcomer (intensity 1-3)',
    voice: 'New to the game. Asks basic questions, makes simple observations, sometimes confused by mechanics. Short sentences. Occasional typos or casual shorthand. Does not talk about advanced features they likely haven\'t unlocked.',
    topics: 'basic shop operations, prices feeling high or low, wondering how things work, slow days, first impressions',
    avoids: 'wholesale margins, factory ROI, stock exchange, arbitrage, advanced strategy — they don\'t know this stuff yet',
    examples: [
      'how do i know if my prices are too high?',
      'slow day today lol',
      'is it worth hiring a second tech?',
      'anyone else just starting out?',
    ],
  },
  competent: { // 4-6
    label: 'competent operator (intensity 4-6)',
    voice: 'Understands the game well. Talks strategy, shares what\'s working, asks informed questions. Comfortable with most mechanics. Normal chat style.',
    topics: 'pricing strategy, staff optimization, when to expand, inventory management, loan timing, reputation milestones',
    avoids: 'highly technical arbitrage plays or elite-level market manipulation',
    examples: [
      'finally got my 3rd shop profitable. margins matter more than volume at this stage',
      'winter tire demand is spiking — loaded up on inventory yesterday',
      'anyone else find wholesale way more consistent than retail?',
    ],
  },
  veteran: { // 7-8
    label: 'veteran player (intensity 7-8)',
    voice: 'Confident and knowledgeable. Gives specific advice, references exact mechanics, sometimes mentors newer players. Uses game terminology naturally.',
    topics: 'factory efficiency, wholesale client strategy, pricing analyst ROI, multi-city logistics, stock exchange plays, margin optimization',
    avoids: 'nothing — they know the whole game',
    examples: [
      'pricing analyst pays for itself in about 8 days if you\'re doing volume above $3K/day',
      'the trick with wholesale is lock in your top 3 clients before someone undercuts you',
      '@newplayer stick to all-seasons until rep 25 — margins are more forgiving',
    ],
  },
  elite: { // 9-10
    label: 'elite operator (intensity 9-10)',
    voice: 'Plays at a professional level. Precise, data-driven, talks about optimization and arbitrage. Occasionally condescending without meaning to be. References specific numbers and mechanics with confidence.',
    topics: 'factory brand premium, TC arbitrage, dividend strategy, short selling timing, market cornering, cross-city logistics efficiency, competitor analysis',
    avoids: 'nothing — and they\'ll tell you exactly why',
    examples: [
      'factory brand premium compounds — at quality 90+ you\'re looking at 18-22% loyalty lift',
      'shorted GCTP before the rubber event. covered at -31%. clean',
      'if your e-commerce isn\'t doing at least 40% of your retail volume you\'re leaving money on the table',
    ],
  },
};

function getIntensityProfile(intensity) {
  if (intensity <= 3) return INTENSITY_PROFILES.novice;
  if (intensity <= 6) return INTENSITY_PROFILES.competent;
  if (intensity <= 8) return INTENSITY_PROFILES.veteran;
  return INTENSITY_PROFILES.elite;
}

/**
 * Generate AI chat messages for a batch of bots in one API call.
 */
export async function generateAIBotChats(chatQueue, shared) {
  if (!ANTHROPIC_API_KEY || chatQueue.length === 0) return [];

  const recentChat = (shared.recentChatMessages || []).slice(-15).map(m => ({
    name: m.playerName,
    text: m.text,
    id: m.id,
    isBot: !!m.isBot,
  }));

  const leaderboardSnippet = (shared.leaderboard || []).slice(0, 5).map((e, i) =>
    `#${i + 1} ${e.name} ($${Math.floor((e.wealth || 0) / 1000)}K)`
  ).join(', ');

  const events = (shared.globalEvents || []).map(e => e.label || e.id).join(', ') || 'none';

  const botDescriptions = chatQueue.map(b => {
    const s = b.stateSnippet;
    const profile = getIntensityProfile(b.intensity || 5);
    return {
      id: b.botId,
      name: b.botName,
      personality: b.personality,
      traits: PERSONALITY_TRAITS[b.personality] || 'average tire shop owner',
      expertiseLevel: profile.label,
      voiceGuide: profile.voice,
      topicsTheyKnow: profile.topics,
      topicsTheyAvoid: profile.avoids,
      mentionedBy: b.mentionedBy || null,
      game: {
        day: s.day,
        cash: `$${Math.floor((s.cash || 0) / 1000)}K`,
        shops: s.shopCount,
        rep: Math.floor(s.rep || 0),
        city: s.city || 'unknown',
        doing: s.doing,
        hasFactory: s.hasFactory,
        hasWholesale: s.hasWholesale,
        recentAction: s.recentEvent || null,
      },
    };
  });

  const systemPrompt = `You generate chat messages for AI players in "Tire Empire" — a multiplayer tire business simulation game.

GAME CONTEXT:
- Players run tire shops: buy inventory, set prices, hire staff, expand to cities
- Advanced features unlock with reputation: wholesale (25), e-commerce (30), factory (75)
- Stock exchange (TESX) lets players trade shares and IPO their company
- TireCoins (TC) are premium currency. Pricing analyst, warehouse, 3PL storage are mid-game upgrades
- Players compete on a leaderboard by total wealth

YOUR ROLE:
Generate one realistic chat message per bot. Each bot has a specific expertise level based on their intensity score. This is the most important factor — a novice and an elite player should sound completely different.

EXPERTISE LEVELS MATTER:
- Novices ask basic questions, don't know advanced mechanics, keep it simple
- Competent players talk strategy and share what's working
- Veterans give specific advice with real numbers, mentor others
- Elite players are precise and data-driven, reference exact mechanics

RULES:
1. 90% game topics, 10% brief casual human texture
2. Respond to real players (👤) when relevant — highest priority
3. Bots can reply to each other naturally
4. Max 110 characters per message — these are chat messages
5. No hashtags. Minimal emoji. Lowercase casual tone is fine
6. Never contradict the bot's actual game state
7. Novices MUST NOT reference mechanics they haven't unlocked
8. Elite bots should reference specific numbers and advanced plays
9. If a bot was mentioned/called out, they MUST respond to that person

RESPOND WITH ONLY a JSON array. No preamble. No markdown. Example:
[
  {"id": "bot123", "text": "is it worth getting a pricing analyst this early?"},
  {"id": "bot456", "text": "@PlayerName analyst ROI breaks even around day 8 at your volume", "replyToId": "msg_id", "replyToName": "PlayerName"}
]`;

  const userPrompt = `GAME STATE:
- Day ${shared.day || '?'} | Active events: ${events}
- Leaderboard: ${leaderboardSnippet || 'loading'}
- TC value: $${Math.floor((shared.tcValue || 0) / 1000)}K

RECENT CHAT (newest last):
${recentChat.map(m => `[${m.id}] ${m.isBot ? '🤖' : '👤'} ${m.name}: ${m.text}`).join('\n') || '(no recent messages)'}

BOTS TO GENERATE FOR (one message each):
${JSON.stringify(botDescriptions, null, 2)}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 600,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      console.warn('[BotChatAI] API error:', res.status);
      return [];
    }

    const data = await res.json();
    const raw = data.content?.[0]?.text || '';
    const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    let messages;
    try {
      messages = JSON.parse(cleaned);
    } catch {
      console.warn('[BotChatAI] Failed to parse response:', cleaned.slice(0, 200));
      return [];
    }

    if (!Array.isArray(messages)) return [];

    return messages
      .filter(m => m && typeof m.text === 'string' && m.text.trim().length > 0)
      .map(m => {
        const bot = chatQueue.find(b => b.botId === m.id);
        if (!bot) return null;
        return {
          botId: m.id,
          botName: bot.botName,
          text: m.text.slice(0, 140),
          replyToId: m.replyToId || null,
          replyToName: m.replyToName || null,
        };
      })
      .filter(Boolean);

  } catch (err) {
    if (err.name !== 'AbortError') {
      console.warn('[BotChatAI] Fetch error:', err.message);
    }
    return [];
  }
}
