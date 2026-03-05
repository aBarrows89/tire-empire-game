import { uid } from '../../../shared/helpers/random.js';
import { FACTORY } from '../../../shared/constants/factory.js';
import { TIRES } from '../../../shared/constants/tires.js';
import {
  PRODUCTION_AUTO, CONTRACT_COMMISSION, MAX_ACTIVE_CONTRACTS_PER_PLAYER,
  MAX_COUNTER_OFFERS, CONTRACT_PROPOSAL_EXPIRY_DAYS, FACTORY_MIN_CONTRACT,
  P2P_DELIVERY_FEE, CONTRACTABLE_TIRES,
} from '../../../shared/constants/contracts.js';

/**
 * Send a DM related to a contract action.
 */
async function sendContractDM(ctx, fromId, fromName, toId, contractId, action, terms, message) {
  if (!ctx.addDM) return;
  const lines = [`[Contract ${action}] ID: ${contractId}`];
  if (terms?.tireType) lines.push(`Tire: ${TIRES[terms.tireType]?.n || terms.tireType}`);
  if (terms?.qty) lines.push(`Qty: ${terms.qty}`);
  if (terms?.pricePerUnit) lines.push(`Price: $${terms.pricePerUnit}/ea`);
  if (message) lines.push(`"${message}"`);

  try {
    await ctx.addDM({
      id: uid(), fromId, fromName: fromName || 'Contract System', toId,
      text: lines.join('\n'),
    });
  } catch (e) {
    console.error('[contracts] DM send error:', e.message);
  }
}

/**
 * Count active P2P contracts for a player (as buyer or seller).
 */
function countActiveContracts(g) {
  return (g.p2pContracts || []).filter(c =>
    c.status === 'active' || c.status === 'proposed' || c.status === 'countered'
  ).length;
}

/**
 * Handle all P2P contract-related player actions.
 */
export async function handleContracts(action, params, g, ctx) {
  switch (action) {

    // ═══════════════════════════════════════
    // PROPOSE CONTRACT — buyer proposes to a seller
    // ═══════════════════════════════════════
    case 'proposeContract': {
      const { sellerId, tireType, qty, pricePerUnit, paymentTerms, durationDays, batchSize, message } = params;

      // Validate tire type
      if (!CONTRACTABLE_TIRES.includes(tireType)) return ctx.fail('Invalid tire type for contracts');

      // Buyer can't be at contract limit
      if (countActiveContracts(g) >= MAX_ACTIVE_CONTRACTS_PER_PLAYER) {
        return ctx.fail(`Max ${MAX_ACTIVE_CONTRACTS_PER_PLAYER} active contracts`);
      }

      // Look up seller
      const seller = await ctx.getPlayer(sellerId);
      if (!seller) return ctx.fail('Seller not found');
      const sg = seller.game_state;

      // Seller must have a factory
      if (!sg.hasFactory || !sg.factory) return ctx.fail('Seller has no factory');

      // Validate price
      if (!pricePerUnit || pricePerUnit <= 0) return ctx.fail('Price per unit must be greater than 0');

      // Validate qty meets factory minimum for seller's level
      const sellerLevel = sg.factory.level || 1;
      const minQty = FACTORY_MIN_CONTRACT[sellerLevel] || 200;
      if (qty < minQty) return ctx.fail(`Minimum order for level ${sellerLevel} factory: ${minQty}`);

      // Build contract object
      const contractId = uid();
      const terms = {
        tireType,
        qty,
        pricePerUnit,
        paymentTerms: paymentTerms || 'on_delivery',
        durationDays: durationDays || 90,
        batchSize: batchSize || Math.ceil(qty / 10),
        deliveryFee: P2P_DELIVERY_FEE,
        commission: CONTRACT_COMMISSION,
      };

      const contract = {
        id: contractId,
        buyerId: ctx.playerId,
        buyerName: g.companyName || g.name || 'Unknown',
        sellerId,
        sellerName: sg.companyName || sg.name || 'Unknown',
        status: 'proposed',
        proposedBy: 'buyer',
        terms,
        counterCount: 0,
        createdDay: g.day,
        expiresDay: g.day + CONTRACT_PROPOSAL_EXPIRY_DAYS,
        deliveredQty: 0,
        stagedQty: 0,
        totalPaid: 0,
      };

      // Add to buyer's state
      g.p2pContracts = g.p2pContracts || [];
      g.p2pContracts.push(contract);

      // Add to seller's state
      sg.p2pContracts = sg.p2pContracts || [];
      sg.p2pContracts.push({ ...contract });
      await ctx.savePlayerState(sellerId, sg);

      // Save to DB
      if (ctx.createPlayerContract) {
        await ctx.createPlayerContract({
          id: contractId, buyerId: ctx.playerId, sellerId,
          status: 'proposed', terms, history: [{ action: 'proposed', by: 'buyer', day: g.day }],
        });
      }

      // Notify seller via DM
      await sendContractDM(ctx, ctx.playerId, g.companyName || g.name, sellerId, contractId, 'Proposal', terms, message);

      g.log.push({ msg: `Contract proposed to ${sg.companyName || 'seller'}: ${qty} ${TIRES[tireType]?.n || tireType} @ $${pricePerUnit}/ea`, cat: 'contract' });
      break;
    }

    // ═══════════════════════════════════════
    // COUNTER CONTRACT
    // ═══════════════════════════════════════
    case 'counterContract': {
      const { contractId, terms: newTerms, message } = params;
      const contract = (g.p2pContracts || []).find(c => c.id === contractId);
      if (!contract) return ctx.fail('Contract not found');
      if (contract.status !== 'proposed' && contract.status !== 'countered') {
        return ctx.fail('Contract not open for counter-offers');
      }
      if (contract.counterCount >= MAX_COUNTER_OFFERS) {
        return ctx.fail(`Maximum ${MAX_COUNTER_OFFERS} counter-offers reached`);
      }

      // Determine other party
      const isBuyer = contract.buyerId === ctx.playerId;
      const otherId = isBuyer ? contract.sellerId : contract.buyerId;

      // Merge new terms
      const merged = { ...contract.terms };
      if (newTerms.pricePerUnit != null) merged.pricePerUnit = newTerms.pricePerUnit;
      if (newTerms.qty != null) merged.qty = newTerms.qty;
      if (newTerms.durationDays != null) merged.durationDays = newTerms.durationDays;
      if (newTerms.batchSize != null) merged.batchSize = newTerms.batchSize;
      if (newTerms.paymentTerms != null) merged.paymentTerms = newTerms.paymentTerms;

      contract.terms = merged;
      contract.status = 'countered';
      contract.proposedBy = isBuyer ? 'buyer' : 'seller';
      contract.counterCount++;
      contract.expiresDay = g.day + CONTRACT_PROPOSAL_EXPIRY_DAYS;

      // Update other player
      const other = await ctx.getPlayer(otherId);
      if (other) {
        const og = other.game_state;
        const oc = (og.p2pContracts || []).find(c => c.id === contractId);
        if (oc) {
          Object.assign(oc, { terms: merged, status: 'countered', proposedBy: contract.proposedBy, counterCount: contract.counterCount, expiresDay: contract.expiresDay });
        }
        await ctx.savePlayerState(otherId, og);
      }

      // Update DB
      if (ctx.updatePlayerContract) {
        await ctx.updatePlayerContract(contractId, {
          status: 'countered', terms: merged,
          history: [...(contract.history || []), { action: 'countered', by: isBuyer ? 'buyer' : 'seller', day: g.day }],
        });
      }

      await sendContractDM(ctx, ctx.playerId, g.companyName || g.name, otherId, contractId, 'Counter-Offer', merged, message);
      g.log.push({ msg: `Counter-offer sent on contract ${contractId.slice(0, 8)}`, cat: 'contract' });
      break;
    }

    // ═══════════════════════════════════════
    // ACCEPT CONTRACT
    // ═══════════════════════════════════════
    case 'acceptContract': {
      const { contractId, message } = params;
      const contract = (g.p2pContracts || []).find(c => c.id === contractId);
      if (!contract) return ctx.fail('Contract not found');
      if (contract.status !== 'proposed' && contract.status !== 'countered') {
        return ctx.fail('Contract not open for acceptance');
      }

      const isBuyer = contract.buyerId === ctx.playerId;
      const otherId = isBuyer ? contract.sellerId : contract.buyerId;

      // Verify seller still has a factory
      const sellerCheck = await ctx.getPlayer(contract.sellerId);
      if (!sellerCheck?.game_state?.hasFactory || !sellerCheck?.game_state?.factory) {
        return ctx.fail('Seller no longer has a factory');
      }

      // Handle prepaid payment
      if (contract.terms.paymentTerms === 'prepaid' && isBuyer) {
        const totalCost = contract.terms.qty * contract.terms.pricePerUnit;
        const totalWithFees = totalCost + (contract.terms.qty * contract.terms.deliveryFee) + Math.floor(totalCost * contract.terms.commission);
        if (g.cash < totalWithFees) return ctx.fail('Not enough cash for prepaid contract');
        g.cash -= totalWithFees;
        contract.totalPaid = totalWithFees;
      }

      contract.status = 'active';
      contract.activatedDay = g.day;
      contract.expiresDay = g.day + (contract.terms.durationDays || 90);

      // Set up factory allocations on seller side
      const sellerId = contract.sellerId;
      const sellerPlayer = await ctx.getPlayer(sellerId);
      if (sellerPlayer) {
        const sg = sellerPlayer.game_state;
        const sc = (sg.p2pContracts || []).find(c => c.id === contractId);
        if (sc) {
          Object.assign(sc, { status: 'active', activatedDay: g.day, expiresDay: contract.expiresDay, totalPaid: contract.totalPaid || 0 });
        }

        // Initialize factory contract allocations
        if (sg.factory) {
          if (!sg.factory.contractAllocations) sg.factory.contractAllocations = {};
          if (!sg.factory.contractStaging) sg.factory.contractStaging = {};

          // Default allocation: 10% or minAllocationPercent, whichever is higher
          const defaultPercent = Math.max(PRODUCTION_AUTO.minAllocationPercent, 10);
          const currentTotal = sg.factory.totalAllocatedPercent || 0;
          const available = (PRODUCTION_AUTO.maxContractAllocation * 100) - currentTotal;
          const allocPercent = Math.min(defaultPercent, available);

          sg.factory.contractAllocations[contractId] = {
            contractId,
            tireType: contract.terms.tireType,
            percent: allocPercent,
            autoRun: PRODUCTION_AUTO.autoProduceDefault,
            remainingQty: contract.terms.qty,
          };
          sg.factory.contractStaging[contractId] = 0;
          sg.factory.totalAllocatedPercent = currentTotal + allocPercent;
        }

        // If seller is the current player (accepting as seller)
        if (sellerId === ctx.playerId) {
          // Already updated g above via contract reference
          if (g.factory) {
            if (!g.factory.contractAllocations) g.factory.contractAllocations = {};
            if (!g.factory.contractStaging) g.factory.contractStaging = {};
            const defaultPercent = Math.max(PRODUCTION_AUTO.minAllocationPercent, 10);
            const currentTotal = g.factory.totalAllocatedPercent || 0;
            const available = (PRODUCTION_AUTO.maxContractAllocation * 100) - currentTotal;
            const allocPercent = Math.min(defaultPercent, available);
            g.factory.contractAllocations[contractId] = {
              contractId,
              tireType: contract.terms.tireType,
              percent: allocPercent,
              autoRun: PRODUCTION_AUTO.autoProduceDefault,
              remainingQty: contract.terms.qty,
            };
            g.factory.contractStaging[contractId] = 0;
            g.factory.totalAllocatedPercent = currentTotal + allocPercent;
          }
        } else {
          await ctx.savePlayerState(sellerId, sg);
        }
      }

      // Update buyer's copy if buyer is the other party
      if (isBuyer) {
        // g is the buyer — already updated
      } else {
        const buyerPlayer = await ctx.getPlayer(contract.buyerId);
        if (buyerPlayer) {
          const bg = buyerPlayer.game_state;
          const bc = (bg.p2pContracts || []).find(c => c.id === contractId);
          if (bc) Object.assign(bc, { status: 'active', activatedDay: g.day, expiresDay: contract.expiresDay });
          await ctx.savePlayerState(contract.buyerId, bg);
        }
      }

      if (ctx.updatePlayerContract) {
        await ctx.updatePlayerContract(contractId, { status: 'active' });
      }

      await sendContractDM(ctx, ctx.playerId, g.companyName || g.name, otherId, contractId, 'Accepted', contract.terms, message);
      g.log.push({ msg: `Contract accepted: ${contract.terms.qty} ${TIRES[contract.terms.tireType]?.n || contract.terms.tireType}`, cat: 'contract' });
      break;
    }

    // ═══════════════════════════════════════
    // DENY CONTRACT
    // ═══════════════════════════════════════
    case 'denyContract': {
      const { contractId, message } = params;
      const contract = (g.p2pContracts || []).find(c => c.id === contractId);
      if (!contract) return ctx.fail('Contract not found');

      contract.status = 'denied';

      const otherId = contract.buyerId === ctx.playerId ? contract.sellerId : contract.buyerId;
      const other = await ctx.getPlayer(otherId);
      if (other) {
        const og = other.game_state;
        const oc = (og.p2pContracts || []).find(c => c.id === contractId);
        if (oc) oc.status = 'denied';
        await ctx.savePlayerState(otherId, og);
      }

      if (ctx.updatePlayerContract) {
        await ctx.updatePlayerContract(contractId, { status: 'denied' });
      }

      await sendContractDM(ctx, ctx.playerId, g.companyName || g.name, otherId, contractId, 'Denied', contract.terms, message);
      g.log.push({ msg: `Contract denied: ${contractId.slice(0, 8)}`, cat: 'contract' });
      break;
    }

    // ═══════════════════════════════════════
    // CANCEL CONTRACT (early termination)
    // ═══════════════════════════════════════
    case 'cancelContract': {
      const { contractId, reason } = params;
      const contract = (g.p2pContracts || []).find(c => c.id === contractId);
      if (!contract) return ctx.fail('Contract not found');
      if (contract.status !== 'active') return ctx.fail('Can only cancel active contracts');

      // Early termination fee: 10% of remaining contract value
      const remainingQty = contract.terms.qty - (contract.deliveredQty || 0);
      const terminationFee = Math.floor(remainingQty * contract.terms.pricePerUnit * 0.10);

      // Deduct fee from canceller, credit to other party
      g.cash -= terminationFee;
      contract.status = 'cancelled';

      const otherId = contract.buyerId === ctx.playerId ? contract.sellerId : contract.buyerId;
      const other = await ctx.getPlayer(otherId);
      if (other) {
        const og = other.game_state;
        og.cash += terminationFee;
        const oc = (og.p2pContracts || []).find(c => c.id === contractId);
        if (oc) oc.status = 'cancelled';

        // Clean up factory allocations if seller
        if (otherId === contract.sellerId && og.factory?.contractAllocations?.[contractId]) {
          const alloc = og.factory.contractAllocations[contractId];
          og.factory.totalAllocatedPercent = Math.max(0, (og.factory.totalAllocatedPercent || 0) - alloc.percent);
          delete og.factory.contractAllocations[contractId];
          delete og.factory.contractStaging?.[contractId];
        }

        await ctx.savePlayerState(otherId, og);
      }

      // Clean up factory allocations if this player is the seller
      if (ctx.playerId === contract.sellerId && g.factory?.contractAllocations?.[contractId]) {
        const alloc = g.factory.contractAllocations[contractId];
        g.factory.totalAllocatedPercent = Math.max(0, (g.factory.totalAllocatedPercent || 0) - alloc.percent);
        delete g.factory.contractAllocations[contractId];
        delete g.factory.contractStaging?.[contractId];
      }

      if (ctx.updatePlayerContract) {
        await ctx.updatePlayerContract(contractId, { status: 'cancelled', completedAt: new Date() });
      }

      await sendContractDM(ctx, ctx.playerId, g.companyName || g.name, otherId, contractId, 'Cancelled', contract.terms, reason || 'Early termination');
      g.log.push({ msg: `Contract cancelled — termination fee: $${terminationFee}`, cat: 'contract' });
      break;
    }

    // ═══════════════════════════════════════
    // PAUSE / RESUME CONTRACT
    // ═══════════════════════════════════════
    case 'pauseContract': {
      const contract = (g.p2pContracts || []).find(c => c.id === params.contractId);
      if (!contract) return ctx.fail('Contract not found');
      if (contract.status !== 'active') return ctx.fail('Can only pause active contracts');
      contract.status = 'paused';

      // Pause factory allocation auto_run on seller
      if (ctx.playerId === contract.sellerId && g.factory?.contractAllocations?.[params.contractId]) {
        g.factory.contractAllocations[params.contractId].autoRun = false;
      }

      const otherId = contract.buyerId === ctx.playerId ? contract.sellerId : contract.buyerId;
      const other = await ctx.getPlayer(otherId);
      if (other) {
        const oc = (other.game_state.p2pContracts || []).find(c => c.id === params.contractId);
        if (oc) oc.status = 'paused';
        if (otherId === contract.sellerId && other.game_state.factory?.contractAllocations?.[params.contractId]) {
          other.game_state.factory.contractAllocations[params.contractId].autoRun = false;
        }
        await ctx.savePlayerState(otherId, other.game_state);
      }

      if (ctx.updatePlayerContract) await ctx.updatePlayerContract(params.contractId, { status: 'paused' });
      g.log.push({ msg: `Contract paused: ${params.contractId.slice(0, 8)}`, cat: 'contract' });
      break;
    }

    case 'resumeContract': {
      const contract = (g.p2pContracts || []).find(c => c.id === params.contractId);
      if (!contract) return ctx.fail('Contract not found');
      if (contract.status !== 'paused') return ctx.fail('Contract is not paused');
      contract.status = 'active';

      if (ctx.playerId === contract.sellerId && g.factory?.contractAllocations?.[params.contractId]) {
        g.factory.contractAllocations[params.contractId].autoRun = true;
      }

      const otherId = contract.buyerId === ctx.playerId ? contract.sellerId : contract.buyerId;
      const other = await ctx.getPlayer(otherId);
      if (other) {
        const oc = (other.game_state.p2pContracts || []).find(c => c.id === params.contractId);
        if (oc) oc.status = 'active';
        if (otherId === contract.sellerId && other.game_state.factory?.contractAllocations?.[params.contractId]) {
          other.game_state.factory.contractAllocations[params.contractId].autoRun = true;
        }
        await ctx.savePlayerState(otherId, other.game_state);
      }

      if (ctx.updatePlayerContract) await ctx.updatePlayerContract(params.contractId, { status: 'active' });
      g.log.push({ msg: `Contract resumed: ${params.contractId.slice(0, 8)}`, cat: 'contract' });
      break;
    }

    // ═══════════════════════════════════════
    // SET CONTRACT ALLOCATION — seller adjusts production %
    // ═══════════════════════════════════════
    case 'setContractAllocation': {
      const { contractId, percent } = params;
      if (!g.factory) return ctx.fail('No factory');
      if (!g.factory.contractAllocations?.[contractId]) return ctx.fail('No allocation for this contract');

      const alloc = g.factory.contractAllocations[contractId];
      const oldPercent = alloc.percent;
      const maxPercent = PRODUCTION_AUTO.maxContractAllocation * 100;
      const otherAllocated = (g.factory.totalAllocatedPercent || 0) - oldPercent;

      if (percent < PRODUCTION_AUTO.minAllocationPercent) {
        return ctx.fail(`Minimum allocation: ${PRODUCTION_AUTO.minAllocationPercent}%`);
      }
      if (otherAllocated + percent > maxPercent) {
        return ctx.fail(`Total allocation would exceed ${maxPercent}%`);
      }

      alloc.percent = percent;
      g.factory.totalAllocatedPercent = otherAllocated + percent;
      g.log.push({ msg: `Contract allocation set to ${percent}%`, cat: 'contract' });
      break;
    }

    // ═══════════════════════════════════════
    // TOGGLE CONTRACT AUTO-RUN
    // ═══════════════════════════════════════
    case 'toggleContractAutoRun': {
      const { contractId } = params;
      if (!g.factory) return ctx.fail('No factory');
      if (!g.factory.contractAllocations?.[contractId]) return ctx.fail('No allocation for this contract');
      g.factory.contractAllocations[contractId].autoRun = !g.factory.contractAllocations[contractId].autoRun;
      g.log.push({ msg: `Contract auto-run: ${g.factory.contractAllocations[contractId].autoRun ? 'ON' : 'OFF'}`, cat: 'contract' });
      break;
    }

    // ═══════════════════════════════════════
    // BUILD ADDITIONAL FACTORY
    // ═══════════════════════════════════════
    case 'buildAdditionalFactory': {
      if (!g.hasFactory || !g.factory) return ctx.fail('Need an existing factory first');

      const factoryCount = (g.additionalFactories || []).length + 1;
      if (factoryCount >= FACTORY.maxFactories) return ctx.fail(`Maximum ${FACTORY.maxFactories} factories`);

      const repReq = FACTORY.factoryMinRep[factoryCount] || 95;
      if (g.reputation < repReq) return ctx.fail(`Need reputation ${repReq}+ for factory #${factoryCount + 1}`);

      const costIdx = factoryCount - 1;
      const cost = FACTORY.additionalFactoryCosts[costIdx] || FACTORY.additionalFactoryCosts[FACTORY.additionalFactoryCosts.length - 1];
      if (g.cash < cost) return ctx.fail(`Not enough cash (need $${cost.toLocaleString()})`);

      g.cash -= cost;
      if (!g.additionalFactories) g.additionalFactories = [];
      g.additionalFactories.push({
        id: uid(),
        level: 1,
        productionQueue: [],
        dailyCapacity: FACTORY.levels[0].dailyCapacity,
        staff: { lineWorkers: 0, inspectors: 0, engineers: 0, manager: 0 },
        contractAllocations: {},
        contractStaging: {},
        totalAllocatedPercent: 0,
        qualityRating: 0.80,
      });
      g.log.push({ msg: `Built additional factory #${factoryCount + 1} (-$${cost.toLocaleString()})`, cat: 'factory' });
      break;
    }

    default:
      return null; // Not handled
  }

  return g;
}
