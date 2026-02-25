import { getInv } from '../helpers/index.js';

export const ACHIEVEMENTS = [
  // --- Early Game ---
  { id: 'first_tire', title: 'Tire Curious', desc: 'Buy your first tire', icon: '🛞', coins: 2,
    check: g => getInv(g) >= 1 },
  { id: 'first_sale', title: 'First Sale', desc: 'Sell your first tire', icon: '💵', coins: 5,
    check: g => g.totalSold >= 1 },
  { id: '10_sales', title: 'Getting Rolling', desc: 'Sell 10 tires', icon: '🔟', coins: 10,
    check: g => g.totalSold >= 10 },
  { id: '100_sales', title: 'Centurion', desc: 'Sell 100 tires', icon: '💯', coins: 50,
    check: g => g.totalSold >= 100 },
  { id: '1000_sales', title: 'Tire Tycoon', desc: 'Sell 1,000 tires', icon: '🏆', coins: 250,
    check: g => g.totalSold >= 1000 },

  // --- Revenue ---
  { id: 'rev_1k', title: 'First Grand', desc: 'Earn $1,000 in total revenue', icon: '💰', coins: 10,
    check: g => g.totalRev >= 1000 },
  { id: 'rev_10k', title: 'Five Figures', desc: 'Earn $10,000 in total revenue', icon: '💰', coins: 25,
    check: g => g.totalRev >= 10000 },
  { id: 'rev_100k', title: 'Six Figures', desc: 'Earn $100,000 in total revenue', icon: '💎', coins: 75,
    check: g => g.totalRev >= 100000 },
  { id: 'rev_1m', title: 'Millionaire', desc: 'Earn $1,000,000 in total revenue', icon: '👑', coins: 500,
    check: g => g.totalRev >= 1000000 },

  // --- Business ---
  { id: 'first_shop', title: 'Grand Opening', desc: 'Open your first shop', icon: '🏪', coins: 10,
    check: g => (g.locations || []).length >= 1 },
  { id: '2_shops', title: 'Expanding', desc: 'Own 2 shops', icon: '🏬', coins: 25,
    check: g => (g.locations || []).length >= 2 },
  { id: '5_shops', title: 'Chain Reaction', desc: 'Own 5 shops', icon: '🏙️', coins: 100,
    check: g => (g.locations || []).length >= 5 },
  { id: 'first_hire', title: 'Boss Mode', desc: 'Hire your first employee', icon: '🧑‍🔧', coins: 10,
    check: g => { const s = g.staff || {}; return (s.techs||0) + (s.sales||0) + (s.managers||0) + (s.drivers||0) >= 1; } },
  { id: 'first_supplier', title: 'Supply Line', desc: 'Establish a supplier relationship', icon: '🤝', coins: 5,
    check: g => (g.unlockedSuppliers || []).length >= 1 },
  { id: 'warehouse', title: 'Warehouse Unlocked', desc: 'Purchase a warehouse', icon: '🏭', coins: 30,
    check: g => !!g.hasWarehouse },

  // --- Reputation ---
  { id: 'rep_10', title: 'Known Name', desc: 'Reach 10 reputation', icon: '⭐', coins: 10,
    check: g => g.reputation >= 10 },
  { id: 'rep_25', title: 'Respected', desc: 'Reach 25 reputation', icon: '🌟', coins: 30,
    check: g => g.reputation >= 25 },
  { id: 'rep_50', title: 'Legendary', desc: 'Reach 50 reputation', icon: '✨', coins: 150,
    check: g => g.reputation >= 50 },

  // --- Channels ---
  { id: 'ecom', title: 'Digital Storefront', desc: 'Launch your e-commerce channel', icon: '🛒', coins: 25,
    check: g => !!g.hasEcom },
  { id: 'wholesale', title: 'Bulk Dealer', desc: 'Start selling wholesale', icon: '📦', coins: 25,
    check: g => !!g.hasWholesale },

  // --- Van Warrior / Flea / Car Meet ---
  { id: 'road_warrior', title: 'Road Warrior', desc: 'Sell 100 tires from your van (no shops)', icon: '🚐', coins: 50,
    check: g => (g.vanTotalSold || 0) >= 100 },
  { id: 'van_life', title: 'Van Life', desc: 'Profitable for 30 days with only a van', icon: '🏕️', coins: 100,
    check: g => (g.vanOnlyDays || 0) >= 30 },
  { id: 'flea_king', title: 'Flea Market King', desc: 'Sell 200 tires at flea market stands', icon: '🏪', coins: 75,
    check: g => (g.fleaMarketTotalSold || 0) >= 200 },
  { id: 'car_meet_legend', title: 'Car Meet Legend', desc: 'Attend 10 car meets', icon: '🏎️', coins: 100,
    check: g => (g.carMeetsAttended || 0) >= 10 },
  { id: 'summer_hustler', title: 'Summer Hustler', desc: 'Sell 50 tires at car meets', icon: '☀️', coins: 150,
    check: g => (g.carMeetTotalSold || 0) >= 50 },
];
