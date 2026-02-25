/**
 * Tutorial steps for Vinnie's walkthrough.
 * Each step guides the player through a core mechanic.
 * Panel hints tell the UI which tab to highlight.
 */
export const TUTORIAL_STEPS = [
  {
    title: "Welcome to the Grind",
    text: "Listen up, kid. I'm Vinnie — 40 years in the tire game. You got $400 and a van. That's it. But every empire starts somewhere. I'm gonna show you the ropes.",
    panel: null,
    vinnieEmotion: "smirk",
  },
  {
    title: "Source Some Rubber",
    text: "First thing — you need tires to sell. Hit the SOURCE tab. Scrap yards, flea markets, garage cleanouts. It ain't glamorous, but used tires are how you bootstrap this thing. Buy low, sell higher.",
    panel: "source",
    vinnieEmotion: "point",
  },
  {
    title: "Set Your Prices",
    text: "Now go to PRICING. Every tire type has a slider. Set it too high, nobody buys. Set it too low, you're working for free. Start near the defaults — you can adjust as you learn the market.",
    panel: "pricing",
    vinnieEmotion: "think",
  },
  {
    title: "The Van Life",
    text: "Right now you're selling out of your van. It's slow — maybe a tire or two a day. But it's free and it builds reputation. Every sale earns you a little rep. Rep opens doors.",
    panel: "dashboard",
    vinnieEmotion: "shrug",
  },
  {
    title: "Watch the Clock",
    text: "This is a LIVE economy. Time keeps moving whether you're here or not. Every game day, your tires sell automatically based on demand, your prices, and your reputation. Check your dashboard for daily stats.",
    panel: "dashboard",
    vinnieEmotion: "serious",
  },
  {
    title: "Storage Matters",
    text: "Your van holds 20 tires. That's nothing. When you save up some cash, check the STORAGE tab for upgrades. A rented garage gets you 80 slots. More inventory = more sales.",
    panel: "storage",
    vinnieEmotion: "point",
  },
  {
    title: "Need Cash Fast?",
    text: "The BANK has loans. Start with a Micro loan — $5K at 14%. It's steep, but it lets you stock more inventory faster. Just make sure you can cover the weekly payments.",
    panel: "bank",
    vinnieEmotion: "money",
  },
  {
    title: "Build That Rep",
    text: "Reputation unlocks EVERYTHING. Better sources, suppliers, loans, even cities to open shops in. Sell tires consistently and your rep climbs. It's the most important number in the game.",
    panel: "dashboard",
    vinnieEmotion: "serious",
  },
  {
    title: "Your First Shop",
    text: "When you hit $137.5K cash, you can open a real tire shop in any city. Shops sell WAY more than a van — but you'll need to hire techs and sales staff. Check the SHOP tab when you're ready.",
    panel: "shop",
    vinnieEmotion: "excited",
  },
  {
    title: "Go Get 'Em",
    text: "That's the basics, kid. Source tires, set prices, watch the money roll in. When you're ready, there's suppliers for NEW tires, wholesale deals, e-commerce, government contracts — the whole nine yards. Now quit wastin' time and start buildin' your empire!",
    panel: null,
    vinnieEmotion: "thumbsup",
  },
];
