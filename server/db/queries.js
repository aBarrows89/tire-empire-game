import { STORAGE_TYPE } from '../config.js';

let impl;

if (STORAGE_TYPE === 'postgres') {
  const pg = await import('./pgStore.js');
  impl = pg;
} else {
  const { createMemoryStore } = await import('./memoryStore.js');
  impl = createMemoryStore();
  const { seedMemoryStore } = await import('./seed.js');
  await seedMemoryStore(impl);
}

export const getPlayer = (...args) => impl.getPlayer(...args);
export const createPlayer = (...args) => impl.createPlayer(...args);
export const savePlayerState = (...args) => impl.savePlayerState(...args);
export const isCompanyNameTaken = (...args) => impl.isCompanyNameTaken(...args);
export const getAllActivePlayers = (...args) => impl.getAllActivePlayers(...args);
export const getGame = (...args) => impl.getGame(...args);
export const saveGame = (...args) => impl.saveGame(...args);
export const getLeaderboard = (...args) => impl.getLeaderboard(...args);
export const upsertLeaderboard = (...args) => impl.upsertLeaderboard(...args);
export const getPlayerListings = (...args) => impl.getPlayerListings(...args);
export const addPlayerListing = (...args) => impl.addPlayerListing(...args);
export const updatePlayerListing = (...args) => impl.updatePlayerListing(...args);
export const getPlayerListingById = (...args) => impl.getPlayerListingById(...args);
export const getDirectTrades = (...args) => impl.getDirectTrades(...args);
export const addDirectTrade = (...args) => impl.addDirectTrade(...args);
export const getDirectTradeById = (...args) => impl.getDirectTradeById(...args);
export const updateDirectTrade = (...args) => impl.updateDirectTrade(...args);
export const getTournament = (...args) => impl.getTournament(...args);
export const saveTournament = (...args) => impl.saveTournament(...args);
export const getChatMessages = (...args) => impl.getChatMessages(...args);
export const addChatMessage = (...args) => impl.addChatMessage(...args);
export const getShopSaleListings = (...args) => impl.getShopSaleListings(...args);
export const addShopSaleListing = (...args) => impl.addShopSaleListing(...args);
export const getShopSaleListingById = (...args) => impl.getShopSaleListingById(...args);
export const updateShopSaleListing = (...args) => impl.updateShopSaleListing(...args);
export const removeShopSaleListing = (...args) => impl.removeShopSaleListing(...args);
export const removePlayer = (...args) => impl.removePlayer(...args);
export const getChatMutes = (...args) => impl.getChatMutes(...args);
export const setChatMute = (...args) => impl.setChatMute(...args);
export const removeChatMute = (...args) => impl.removeChatMute(...args);
export const deleteChatMessage = (...args) => impl.deleteChatMessage(...args);
export const saveFile = (...args) => impl.saveFile(...args);
export const getFile = (...args) => impl.getFile(...args);
