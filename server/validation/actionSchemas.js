import { z } from 'zod';

// Reusable field helpers
const str = z.string().min(1).max(200);
const optStr = z.string().max(200).optional();
const num = z.coerce.number();
const optNum = z.coerce.number().optional();
const id = z.string().min(1).max(100);
const optId = z.string().max(100).optional();

// No params required
const empty = z.object({}).passthrough();

/** Map of action name → zod schema for params (excluding `action` field). */
export const ACTION_SCHEMAS = {
  // ── Pricing ──
  setPrice:        z.object({ tire: str, price: num }),
  setAutoPrice:    z.object({ tire: str, strategy: str, offset: optNum }),
  setServicePrice: z.object({ service: str, price: num }),

  // ── Sourcing ──
  buySource:            z.object({ sourceId: str }),
  buySupplier:          z.object({ index: num }),
  orderTires:           z.object({ tire: str, qty: num, supplierIndex: num }),
  signSupplierContract: z.object({ supplierIndex: num, tire: str }),
  setAutoSource:        z.object({ sourceId: optStr }).passthrough(),
  inspectSource:        z.object({ sourceId: str }),
  buyFromLot:           z.object({ indices: z.union([z.literal('all'), z.array(z.coerce.number())]) }),
  dismissLot:           empty,
  importOrder:          z.object({ mfgId: optStr, tire: optStr, type: optStr, qty: num }),
  exportTires:          z.object({ tire: str, qty: num }),
  retreadTires:         z.object({ tire: str, qty: num }),
  addAutoSupplier:      z.object({ supplierIndex: num, tire: str, qty: optNum, threshold: optNum }),
  removeAutoSupplier:   z.object({ supplierIndex: num, tire: str }),

  // ── Storage ──
  buyStorage:    z.object({ type: str }),
  buyStorageTC:  empty,
  sellStorage:   z.object({ storageId: id }),
  transferTires: z.object({ from: str, to: str, tire: str, qty: num }),
  setDisposalFee: z.object({ fee: num }),

  // ── Shop ──
  openShop:           z.object({ cityId: id }),
  hireStaff:          z.object({ role: str }),
  fireStaff:          z.object({ role: str }),
  upgradeShopStorage: z.object({ locationId: id }),
  setMarketing:       z.object({ locationId: id, tier: optStr }),
  setInsurance:       z.object({ tier: optStr }).passthrough(),
  financeShop:        z.object({ cityId: id }),
  sellShop:           z.object({ locationId: id }),

  // ── Bank ──
  takeLoan:     z.object({ index: num }),
  repayLoan:    z.object({ loanIndex: num, amount: num }),
  bankDeposit:  z.object({ amount: num }),
  bankWithdraw: z.object({ amount: num }),

  // ── Wholesale ──
  unlockWholesale:           empty,
  unlockDist:                empty,
  openDistCenter:            z.object({ regionId: str, cityId: str }),
  closeDistCenter:           z.object({ dcId: str }),
  enableFactoryDistribution: empty,

  // ── E-Commerce ──
  unlockEcom:     empty,
  hireEcomStaff:  z.object({ role: str }),
  fireEcomStaff:  z.object({ role: str }),
  buyEcomUpgrade: z.object({ upgradeId: str }),

  // ── Factory ──
  buildFactory:             empty,
  produceFactoryTires:      z.object({ tire: str, qty: num, lineIndex: optNum }),
  setFactoryBrandName:      z.object({ brandName: z.string().min(2).max(40) }),
  hireFactoryStaff:         z.object({ role: str }),
  fireFactoryStaff:         z.object({ role: str }),
  setFactoryWholesalePrice: z.object({ tire: str, price: num }),
  setFactoryMinOrder:       z.object({ tire: str, minQty: num }),
  upgradeFactory:           empty,
  listFactoryForSale:       z.object({ askingPrice: optNum }).passthrough(),
  delistFactory:            empty,
  buyFactory:               z.object({ sellerId: id }),
  setFactoryMAP:            z.object({ tire: str, price: num }),
  setFactoryDiscountTier:   z.object({ tiers: z.array(z.object({ min: num, disc: num, label: str })).max(5) }),
  startRDProject:           z.object({ projectId: str }),
  startCertification:       z.object({ certId: str }),
  hireFactoryCFO:           empty,
  fireFactoryCFO:           empty,
  maintainFactoryLine:      z.object({ lineIndex: num }),
  recallBatch:              z.object({ batchIndex: num }),
  setMaterialSupplier:      z.object({ material: str, supplierId: str }),
  buyRubberFarm:            empty,
  upgradeRubberFarm:        empty,
  buySyntheticLab:          empty,
  upgradeSyntheticLab:      empty,
  sellRubberSurplus:        empty,

  // ── P2P Factory Contracts ──
  proposeContract:        z.object({ sellerId: id, tireType: str, qty: num, pricePerUnit: num, paymentTerms: optStr, durationDays: optNum, batchSize: optNum, message: optStr }),
  counterContract:        z.object({ contractId: id, terms: z.object({}).passthrough(), message: optStr }),
  acceptContract:         z.object({ contractId: id, message: optStr }),
  denyContract:           z.object({ contractId: id, message: optStr }),
  cancelContract:         z.object({ contractId: id, reason: optStr }),
  pauseContract:          z.object({ contractId: id }),
  resumeContract:         z.object({ contractId: id }),
  setContractAllocation:  z.object({ contractId: id, percent: num }),
  toggleContractAutoRun:  z.object({ contractId: id }),
  buildAdditionalFactory: empty,

  // ── Shop Marketplace ──
  listShopForSale: z.object({ locationId: id, askingPrice: optNum }),
  delistShop:      z.object({ locationId: id }),
  acceptShopBid:   z.object({ bidId: id }),
  rejectShopBid:   z.object({ bidId: id }),

  // ── Misc ──
  tutorialAdvance:            empty,
  tutorialDone:               empty,
  registerPushToken:          z.object({ token: z.string().min(1).max(500) }),
  devBoost:                   z.object({ cash: optNum, reputation: optNum, adminKey: optStr }).passthrough(),
  dismissVinnie:              z.object({ id: str }),
  resetGame:                  empty,
  hireMarketplaceSpecialist:  empty,
  fireMarketplaceSpecialist:  empty,
  unlockFranchise:            empty,
  createFranchiseTemplate:    z.object({ name: optStr, sourceLocationId: id }),
  openFranchise:              z.object({ cityId: id, templateId: id }),
  vinnieBailout:              empty,
  buyCosmetic:                z.object({ cosmeticId: str }),
  bidOnContract:              z.object({ contractType: str }),
  openFleaStand:              z.object({ marketId: str }),
  closeFleaStand:             z.object({ standId: id }),
  attendCarMeet:              z.object({ meetId: str }),
  setPremium:                 empty,
  activatePremium:            empty,
  rewardAdWatch:              empty,
  activateAutoRestock:        empty,
  setAutoRestock:             z.object({ enabled: z.boolean().optional(), threshold: optNum, maxSpend: optNum }).passthrough(),
  blockPlayer:                z.object({ targetPlayerId: id, targetName: optStr }),
  unblockPlayer:              z.object({ targetPlayerId: id }),
  updateNotifications:        z.object({}).passthrough(), // dynamic keys validated in handler
  instantRetread:             empty,
  buyMarketIntel:             empty,
  upgradeTcStorage:           empty,
  buyMarketingBlitz:          empty,
  buyRepBoost:                empty,
  devSetState:                z.object({ cash: optNum, reputation: optNum, day: optNum, tireCoins: optNum, adminKey: optStr }).passthrough(),

  // Vacation
  startVacation:              z.object({ tierId: str }),
  cancelVacation:             empty,

  // Franchise system
  createFranchiseOffering:    z.object({ brandName: str, description: str, buyIn: z.number(), royaltyPct: z.number(), monthlyFee: z.number(), requiredBrand: optStr, minRep: optNum, maxFranchisees: optNum, perks: z.array(z.string()).optional() }),
  updateFranchiseOffering:    z.object({ active: z.boolean().optional(), buyIn: optNum, royaltyPct: optNum, monthlyFee: optNum, description: optStr }),
  buyFranchise:               z.object({ offeringId: str, locationId: str }),
  terminateFranchise:         z.object({ agreementId: str }),
  deleteFranchiseOffering:    empty,

  // ── TC Utility (rush timers) ──
  rushRetread:                empty,
  rushShopConstruction:       empty,
  rushFactoryBatch:           empty,
  rushRDProject:              empty,

  // ── TC Utility (supplier access) ──
  buySupplierAccess:          empty,
  buyPriorityRestock:         empty,
  buyExclusiveLot:            z.object({ tireType: str, qty: num, discount: num, tcCost: num }),

  // ── TC Utility (intelligence) ──
  buyDemandHeatmap:           empty,
  buyCompetitorPricing:       empty,
  buySupplierForecast:        empty,
  buyPlayerScout:             z.object({ targetPlayerId: id }),
  buyStockInsider:            empty,

  // ── TC Utility (financial) ──
  buyLoanRateReduction:       empty,
  buyCreditLine:              empty,
  buyInsuranceUpgrade:        empty,

  // ── TC Utility (operations) ──
  hireElite:                  z.object({ locationId: id, role: str }),
  buyTrainingProgram:         z.object({ locationId: id }),

  // ── TC Purchase ──
  purchaseTC:                 z.object({ tierId: str, receipt: optStr }),

  // ── 3PL / Storage Marketplace ──
  listStorage:                z.object({ capacity: num, pricePerSlot: num }),
  delistStorage:              z.object({ listingId: id }),
  rentStorage:                z.object({ listingId: id, slots: num }),
  cancelLease:                z.object({ leaseId: id }),
  evictTenant:                z.object({ leaseId: id }),
  tplTransfer:                z.object({ leaseId: id, tire: str, qty: num, direction: str }),

  // ── Wholesale ──
  upgradeWholesale:           empty,
};

/** Top-level request body schema */
export const actionBodySchema = z.object({
  action: z.string().min(1).max(50),
}).passthrough();
