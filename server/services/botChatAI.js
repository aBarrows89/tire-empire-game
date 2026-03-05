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
        mainCity: s.city || 'unknown',
        businessStatus: s.doing,
        hasFactory: s.hasFactory,
        hasWholesale: s.hasWholesale,
        hasEcom: s.hasEcom,
        hasWarehouse: s.hasWarehouse,
        totalInventory: s.totalInventory || 0,
        topTireType: s.topTire || null,
        dailyRevenue: `$${s.dayRevK || 0}K`,
        dailyProfit: `$${s.dayProfit || 0}`,
        activeLoans: s.loanCount || 0,
        recentEvent: s.recentEvent || null,
      },
    };
  });

  const systemPrompt = `You generate chat messages for AI players in "Tire Empire" — a multiplayer tire shop business simulation.

THIS IS A TIRE SHOP GAME. All chat must stay grounded in the actual tire business. No generic finance/stock market talk.

WHAT THE GAME IS ABOUT:
- You buy tires (all-season, winter, performance, light truck, commercial, etc.) from suppliers
- You sell them through retail shops in cities across the US
- You hire staff (techs, sales, managers), set prices, manage inventory
- Money comes from selling tires and services (oil changes, alignments)
- You expand to new cities, build a warehouse, possibly a tire factory
- Reputation grows by making sales, paying loans on time, keeping customers happy

SECONDARY FEATURES (only unlocked players know these):
- Wholesale: sell bulk to fleet buyers (unlock at rep 25)
- E-commerce: online tire orders (rep 30)
- Factory: make your own tire brand (rep 75, very advanced)
- Stock exchange: IPO your tire company, buy shares of other tire shops — talk about THIS not Wall Street
- TireCoins: spend on marketing blitzes, rush timers, supplier perks

EXPERTISE LEVELS (intensity 1-10 tells you how experienced they are):
- Novice (1-3): asks basic stuff — "how do i set prices?", "my shop keeps losing money", "slow day"
- Competent (4-6): talks shop strategy — inventory timing, staff ratios, when to expand
- Veteran (7-8): specific numbers — "all-season margins beat winter 2:1 in warm cities", "warehouse pays off at 4+ shops"
- Elite (9-10): optimization talk — "undercut on all-season to build loyalty, margin on performance", "my factory brand at 88 quality adds 15% to retail ASP"

HARD RULES:
1. ONLY talk about tires, tire shops, inventory, prices, staff, city expansion, suppliers, or reputation
2. If mentioning the stock exchange, frame it as "my tire company stock" or "TESX" — not like a Wall Street trader
3. Max 180 characters. Casual lowercase. No hashtags. 1-2 emoji max.
4. Never say "hodl", "to the moon", "port", "bull/bear run", "the market" (generic), "dividends" in isolation — this is TIRES not crypto/stocks
5. Novices MUST NOT mention factory, wholesale, or stock exchange — they don't have those
6. Always respond to real player messages (👤) first — that's priority one
7. Ground messages in the bot's actual situation (city, shop count, cash level, what they're doing)

GOOD EXAMPLES:
- "stocked up on all-seasons before winter hit. paying off"
- "third shop just turned profitable finally"
- "anyone else getting killed by the rubber shortage? costs are brutal"
- "hired a manager in my main store — sales jumped like 20%"
- "winter tires in cold cities are insane margin right now"
- "my company stock is doing ok on TESX, not worrying about it"
- "@PlayerName yeah alloy-season is better ROI than performance at that rep level"

BAD EXAMPLES (do NOT generate):
- "holding the port through this volatility" ❌
- "TESX is bullish rn, loading up" ❌  
- "my portfolio needs rebalancing" ❌
- "buying the dip on GCTP" ❌

RESPOND WITH ONLY a JSON array. No preamble, no markdown:
[
  {"id": "bot123", "text": "slow day, anyone else down on sales?"},
  {"id": "bot456", "text": "@PlayerName winter demand usually spikes around day 90, stock up early", "replyToId": "msg_id", "replyToName": "PlayerName"}
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
          text: m.text.slice(0, 200),
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
