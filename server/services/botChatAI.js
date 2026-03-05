/**
 * Bot Chat AI Service
 *
 * Replaces static template-based bot chat with Claude-generated messages.
 * All bots that want to chat this tick are batched into a SINGLE API call,
 * keeping costs low while enabling coherent multi-bot conversations.
 *
 * Falls back to template generation silently if:
 *   - ANTHROPIC_API_KEY is not set
 *   - The API call fails (network error, timeout, etc.)
 *   - The response can't be parsed
 */

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-haiku-4-5-20251001';
const TIMEOUT_MS = 8000;

// Personality descriptions for the prompt — short enough to fit in context
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

/**
 * Generate AI chat messages for a batch of bots in one API call.
 *
 * @param {Array} chatQueue - bots that want to chat, each: { botId, botName, personality, stateSnippet }
 * @param {object} shared   - tick shared context (recentChatMessages, globalEvents, leaderboard, etc.)
 * @returns {Promise<Array>} - array of { botId, botName, text, replyToId?, replyToName? }
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

  // Build compact bot descriptions
  const botDescriptions = chatQueue.map(b => {
    const s = b.stateSnippet;
    return {
      id: b.botId,
      name: b.botName,
      personality: b.personality,
      traits: PERSONALITY_TRAITS[b.personality] || 'average tire shop owner',
      game: {
        day: s.day,
        cash: `$${Math.floor((s.cash || 0) / 1000)}K`,
        shops: s.shopCount,
        rep: Math.floor(s.rep || 0),
        city: s.city || 'unknown',
        doing: s.doing, // 'well' | 'ok' | 'struggling'
        hasFactory: s.hasFactory,
        hasWholesale: s.hasWholesale,
        recentEvent: s.recentEvent || null,
      },
    };
  });

  const systemPrompt = `You generate chat messages for AI players in "Tire Empire" — a multiplayer tire business simulation game.

GAME CONTEXT:
- Players run tire shops: buy inventory, set prices, hire staff, expand to new cities
- Advanced features: wholesale distribution, tire factory, stock exchange, e-commerce
- Players compete on a leaderboard ranked by total wealth
- The in-game currency is dollars. TireCoins (TC) are a premium currency

YOUR ROLE:
Generate realistic chat messages for the AI bots listed in the request. Each bot has a distinct personality and current game situation. Messages should feel like real competitive business owners chatting in a game lobby.

RULES:
1. 90% game topics (pricing, inventory, market conditions, competition, strategy, events)
2. 10% casual human stuff (brief, natural — "rough morning", "finally got wifi working lol", things real people say)
3. Bots SHOULD respond to real players' messages when relevant — this is the most important behavior
4. Bots CAN reply to each other's messages to create natural back-and-forth
5. Each message max 110 characters — these are chat messages, not essays
6. No hashtags. Minimal emoji (only if personality demands). Lowercase is fine.
7. Never contradict the bot's actual game state (don't brag if struggling, don't complain if thriving)
8. Bots should feel like different people — use their personality traits to vary tone
9. Avoid repeating phrases from recent chat — keep it fresh

RESPOND WITH ONLY a JSON array. No preamble. No explanation. Example format:
[
  {"id": "bot123", "text": "anyone else getting crushed by the rubber shortage?"},
  {"id": "bot456", "text": "@PlayerName solid advice, been doing that for weeks", "replyToId": "msg_id_here", "replyToName": "PlayerName"}
]`;

  const userPrompt = `GAME STATE:
- Day ${shared.day || '?'} | Active events: ${events}
- Leaderboard: ${leaderboardSnippet || 'loading'}
- TC value: $${Math.floor((shared.tcValue || 0) / 1000)}K

RECENT CHAT (last ${recentChat.length} messages, newest last):
${recentChat.map(m => `[${m.id}] ${m.isBot ? '🤖' : '👤'} ${m.name}: ${m.text}`).join('\n') || '(no recent messages)'}

BOTS THAT NEED TO CHAT NOW (generate exactly one message per bot):
${JSON.stringify(botDescriptions, null, 2)}

Generate one message per bot. Reply to real player messages (👤) when natural. Bots can also reply to each other.`;

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
      const err = await res.text();
      console.warn('[BotChatAI] API error:', res.status, err.slice(0, 200));
      return [];
    }

    const data = await res.json();
    const raw = data.content?.[0]?.text || '';

    // Strip markdown fences if present
    const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    let messages;
    try {
      messages = JSON.parse(cleaned);
    } catch {
      console.warn('[BotChatAI] Failed to parse response:', cleaned.slice(0, 300));
      return [];
    }

    if (!Array.isArray(messages)) return [];

    // Validate and enrich each message
    return messages
      .filter(m => m && typeof m.text === 'string' && m.text.trim().length > 0)
      .map(m => {
        const bot = chatQueue.find(b => b.botId === m.id);
        if (!bot) return null;
        return {
          botId: m.id,
          botName: bot.botName,
          text: m.text.slice(0, 140), // hard cap
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
