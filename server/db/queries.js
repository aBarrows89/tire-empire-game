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
export const cleanOldChatMessages = (...args) => impl.cleanOldChatMessages ? impl.cleanOldChatMessages(...args) : 0;
export const addDM = (...args) => impl.addDM ? impl.addDM(...args) : null;
export const getDMs = (...args) => impl.getDMs ? impl.getDMs(...args) : [];
export const getRecentDMPartners = (...args) => impl.getRecentDMPartners ? impl.getRecentDMPartners(...args) : [];
export const getUnreadDMCount = (...args) => impl.getUnreadDMCount ? impl.getUnreadDMCount(...args) : 0;
export const markDMsRead = (...args) => impl.markDMsRead ? impl.markDMsRead(...args) : null;
export const addChatReport = (...args) => impl.addChatReport ? impl.addChatReport(...args) : null;
export const getChatReports = (...args) => impl.getChatReports ? impl.getChatReports(...args) : [];
export const updateChatReport = (...args) => impl.updateChatReport ? impl.updateChatReport(...args) : null;
export const saveFile = (...args) => impl.saveFile(...args);
export const getFile = (...args) => impl.getFile(...args);
export const withPlayerLock = (...args) => impl.withPlayerLock ? impl.withPlayerLock(...args) : args[1]();
export const savePlayerFinancials = (...args) => impl.savePlayerFinancials ? impl.savePlayerFinancials(...args) : null;
export const savePlayerStats = (...args) => impl.savePlayerStats ? impl.savePlayerStats(...args) : null;
export const getPlayerContract = (...args) => impl.getPlayerContract ? impl.getPlayerContract(...args) : null;
export const createPlayerContract = (...args) => impl.createPlayerContract ? impl.createPlayerContract(...args) : null;
export const updatePlayerContract = (...args) => impl.updatePlayerContract ? impl.updatePlayerContract(...args) : null;
export const getPlayerContracts = (...args) => impl.getPlayerContracts ? impl.getPlayerContracts(...args) : [];

// Cache management (only available with postgres backend)
export { getCacheStats, invalidateAllPlayers, invalidateGame, invalidateLeaderboard } from './playerCache.js';

// Re-export error class for catch handling
export { VersionConflictError } from './pgStore.js';

export const createFranchiseOffering = (...args) => impl.createFranchiseOffering?.(...args);
export const getFranchiseOfferings = (...args) => impl.getFranchiseOfferings?.(...args);
export const getFranchiseOfferingById = (...args) => impl.getFranchiseOfferingById?.(...args);
export const updateFranchiseOffering = (...args) => impl.updateFranchiseOffering?.(...args);
export const createFranchiseAgreement = (...args) => impl.createFranchiseAgreement?.(...args);
export const getFranchiseAgreements = (...args) => impl.getFranchiseAgreements?.(...args);
export const getFranchiseAgreementById = (...args) => impl.getFranchiseAgreementById?.(...args);
export const updateFranchiseAgreement = (...args) => impl.updateFranchiseAgreement?.(...args);
