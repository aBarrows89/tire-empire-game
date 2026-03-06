import { uid } from '../../../shared/helpers/random.js';
import {
  createFranchiseOffering, getFranchiseOfferingById, getFranchiseOfferings, updateFranchiseOffering, deleteFranchiseOffering,
  createFranchiseAgreement, getFranchiseAgreements, getFranchiseAgreementById,
  updateFranchiseAgreement, getPlayer, savePlayerState, withPlayerLock,
} from '../../db/queries.js';

const MIN_REP_TO_FRANCHISE = 75;
const MIN_LOCATIONS_TO_FRANCHISE = 2;
const MAX_ROYALTY_PCT = 0.20;
const MIN_ROYALTY_PCT = 0.02;
const GRACE_PERIOD_DAYS = 7; // missed payments before termination warning
const MAX_MISSED_PAYMENTS = 3;

export async function handleFranchise(action, params, g, ctx) {
  switch (action) {

    // ── CREATE / UPDATE FRANCHISE OFFERING ──
    case 'createFranchiseOffering': {
      if (!g.hasFactory) return ctx.fail('A factory is required to create a franchise');
      if (g.reputation < MIN_REP_TO_FRANCHISE) return ctx.fail(`Need reputation ${MIN_REP_TO_FRANCHISE}+ to franchise (you have ${Math.floor(g.reputation)})`);
      if ((g.locations || []).length < MIN_LOCATIONS_TO_FRANCHISE) return ctx.fail(`Need at least ${MIN_LOCATIONS_TO_FRANCHISE} locations to franchise`);
      if (g.franchiseOffering?.active) return ctx.fail('You already have an active franchise offering. Edit it instead.');

      const { brandName, description, buyIn, royaltyPct, monthlyFee, requiredBrand, minRep, maxFranchisees, perks } = params;

      if (!brandName || brandName.trim().length < 2) return ctx.fail('Brand name required (min 2 chars)');
      if (!description || description.trim().length < 10) return ctx.fail('Description required (min 10 chars)');
      if (buyIn < 5000 || buyIn > 5000000) return ctx.fail('Buy-in must be between $5,000 and $5,000,000');
      if (royaltyPct < MIN_ROYALTY_PCT || royaltyPct > MAX_ROYALTY_PCT) return ctx.fail(`Royalty must be between ${MIN_ROYALTY_PCT * 100}% and ${MAX_ROYALTY_PCT * 100}%`);
      if (monthlyFee < 0 || monthlyFee > 50000) return ctx.fail('Monthly fee must be between $0 and $50,000');

      const offeringId = uid();
      const offering = {
        id: offeringId,
        franchisorId: g.id,
        brandName: brandName.trim(),
        description: description.trim(),
        buyIn: Math.floor(buyIn),
        royaltyPct,
        monthlyFee: Math.floor(monthlyFee),
        requiredBrand: requiredBrand || null,
        minRep: Math.max(0, Math.min(100, minRep || 0)),
        maxFranchisees: Math.max(1, Math.min(100, maxFranchisees || 20)),
        perks: perks || ['brand_recognition', 'supply_chain'],
        territoryIds: [],
      };

      await createFranchiseOffering(offering);

      g.franchiseOffering = {
        id: offeringId,
        brandName: offering.brandName,
        active: true,
        royaltyPct,
        monthlyFee,
        buyIn,
        franchiseeCount: 0,
      };

      g.log = g.log || [];
      g.log.push({ msg: `Created franchise offering: ${offering.brandName}`, cat: 'event' });
      break;
    }

    case 'updateFranchiseOffering': {
      if (!g.franchiseOffering?.id) return ctx.fail('No franchise offering found');
      const { active, buyIn, royaltyPct, monthlyFee, description } = params;
      const updates = {};
      if (active !== undefined) updates.active = active;
      if (buyIn !== undefined) updates.buyIn = Math.floor(buyIn);
      if (royaltyPct !== undefined) updates.royaltyPct = royaltyPct;
      if (monthlyFee !== undefined) updates.monthlyFee = Math.floor(monthlyFee);
      if (description !== undefined) updates.description = description;
      await updateFranchiseOffering(g.franchiseOffering.id, updates);
      g.franchiseOffering = { ...g.franchiseOffering, ...updates };
      break;
    }

    // ── BUY INTO A FRANCHISE ──
    case 'buyFranchise': {
      const { offeringId, locationId } = params;
      if (!offeringId || !locationId) return ctx.fail('offeringId and locationId required');

      const loc = (g.locations || []).find(l => l.id === locationId);
      if (!loc) return ctx.fail('Location not found');
      if (loc.franchise) return ctx.fail('This location is already franchised');

      // Check for existing franchise on this location
      const existing = (g.franchises || []).find(f => f.locationId === locationId && f.status === 'active');
      if (existing) return ctx.fail('This location already has an active franchise agreement');

      const offering = await getFranchiseOfferingById(offeringId);
      if (!offering) return ctx.fail('Franchise offering not found');
      if (!offering.active) return ctx.fail('This franchise is no longer accepting applications');
      if (offering.franchisor_id === g.id) return ctx.fail("Can't franchise your own brand");

      if (g.reputation < offering.min_rep) return ctx.fail(`Need reputation ${offering.min_rep}+ for this franchise`);
      if (g.cash < offering.buy_in) return ctx.fail(`Need $${offering.buy_in.toLocaleString()} buy-in (you have $${Math.floor(g.cash).toLocaleString()})`);

      // Check franchisee cap
      const activeAgreements = await getFranchiseAgreements({ franchisorId: offering.franchisor_id, status: 'active' });
      if (activeAgreements.length >= offering.max_franchisees) return ctx.fail('This franchise has reached its maximum locations');

      // Territory perk enforcement — if any existing franchisee in this city has territory rights, block
      const offeringPerks = parseJson(offering.perks) || [];
      if (offeringPerks.includes('territory')) {
        const locCityId = loc.cityId;
        for (const existing of activeAgreements) {
          if (existing.franchisee_id === g.id) continue; // Skip self
          const existingPlayer = await getPlayer(existing.franchisee_id);
          if (!existingPlayer) continue;
          const eg = existingPlayer.game_state;
          const existingLoc = (eg.locations || []).find(l => l.id === existing.location_id);
          if (existingLoc && existingLoc.cityId === locCityId) {
            return ctx.fail(`Territory rights: another franchisee already operates in this city`);
          }
        }
      }

      // Deduct buy-in
      g.cash -= offering.buy_in;

      const agreementId = uid();
      const agreement = {
        id: agreementId,
        offeringId,
        franchisorId: offering.franchisor_id,
        franchiseeId: g.id,
        locationId,
        brandName: offering.brand_name,
        buyInPaid: offering.buy_in,
        royaltyPct: offering.royalty_pct,
        monthlyFee: offering.monthly_fee,
        requiredBrand: offering.required_brand || null,
        startDay: g.day,
      };

      await createFranchiseAgreement(agreement);

      // Apply franchise to location
      loc.franchise = {
        agreementId,
        offeringId,
        franchisorId: offering.franchisor_id,
        brandName: offering.brand_name,
        royaltyPct: offering.royalty_pct,
        monthlyFee: offering.monthly_fee,
        requiredBrand: offering.required_brand || null,
        perks: parseJson(offering.perks) || [],
        startDay: g.day,
      };

      // Track on player state
      if (!g.franchises) g.franchises = [];
      g.franchises.push({
        agreementId,
        offeringId,
        franchisorId: offering.franchisor_id,
        franchisorName: offering.brand_name,
        locationId,
        status: 'active',
        startDay: g.day,
        totalRoyaltiesPaid: 0,
      });

      // Pay buy-in to franchisor (cross-player transaction)
      try {
        await withPlayerLock(offering.franchisor_id, async () => {
          const franchisorPlayer = await getPlayer(offering.franchisor_id);
          if (franchisorPlayer) {
            const fs = { ...franchisorPlayer.game_state };
            fs.cash = (fs.cash || 0) + offering.buy_in;
            if (!fs.franchiseOffering) fs.franchiseOffering = {};
            fs.franchiseOffering.franchiseeCount = (fs.franchiseOffering.franchiseeCount || 0) + 1;
            if (!fs.franchiseIncome) fs.franchiseIncome = { totalBuyIns: 0, totalRoyalties: 0 };
            fs.franchiseIncome.totalBuyIns = (fs.franchiseIncome.totalBuyIns || 0) + offering.buy_in;
            await savePlayerState(offering.franchisor_id, fs);
          }
        });
      } catch (e) {
        console.error('[Franchise] Error paying buy-in to franchisor:', e.message);
      }

      g.log = g.log || [];
      g.log.push({ msg: `Joined ${offering.brand_name} franchise for $${offering.buy_in.toLocaleString()}`, cat: 'event' });
      break;
    }

    // ── DELETE FRANCHISE OFFERING ──
    case 'deleteFranchiseOffering': {
      // Handle stuck offerings in DB that never got saved to player state (old ctx.log crash)
      if (!g.franchiseOffering?.id) {
        const allOfferings = await getFranchiseOfferings(false);
        const myOfferings = allOfferings.filter(o => o.franchisor_id === g.id);
        if (myOfferings.length === 0) return ctx.fail('No franchise offering to delete');
        // Clean up all orphaned offerings
        for (const o of myOfferings) await deleteFranchiseOffering(o.id);
        g.log = g.log || [];
        g.log.push({ msg: `Cleaned up ${myOfferings.length} orphaned franchise offering(s)`, cat: 'event' });
        g.franchiseOffering = null;
        break;
      }
      // Check for active franchisees first
      const activeAgreements = await getFranchiseAgreements({ franchisorId: g.id, status: 'active' });
      if (activeAgreements.length > 0) return ctx.fail(`Cannot delete while ${activeAgreements.length} franchisee(s) are active. They must terminate first.`);
      await deleteFranchiseOffering(g.franchiseOffering.id);
      g.log = g.log || [];
      g.log.push({ msg: `Deleted franchise offering: ${g.franchiseOffering.brandName}`, cat: 'event' });
      g.franchiseOffering = null;
      break;
    }

    // ── TERMINATE A FRANCHISE AGREEMENT ──
    case 'terminateFranchise': {
      const { agreementId } = params;
      const franchiseEntry = (g.franchises || []).find(f => f.agreementId === agreementId && f.status === 'active');
      if (!franchiseEntry) return ctx.fail('Active franchise agreement not found');

      const loc = (g.locations || []).find(l => l.id === franchiseEntry.locationId);
      if (loc) delete loc.franchise;

      franchiseEntry.status = 'terminated';
      await updateFranchiseAgreement(agreementId, { status: 'terminated' });

      // Notify franchisor (cross-player)
      try {
        await withPlayerLock(franchiseEntry.franchisorId, async () => {
          const fp = await getPlayer(franchiseEntry.franchisorId);
          if (fp) {
            const fs = { ...fp.game_state };
            if (fs.franchiseOffering) {
              fs.franchiseOffering.franchiseeCount = Math.max(0, (fs.franchiseOffering.franchiseeCount || 1) - 1);
            }
            await savePlayerState(franchiseEntry.franchisorId, fs);
          }
        });
      } catch {}

      g.log = g.log || [];
      g.log.push({ msg: 'Franchise agreement terminated', cat: 'event' });
      break;
    }

    default:
      return null;
  }
  return g;
}

function parseJson(val) {
  if (typeof val === 'string') { try { return JSON.parse(val); } catch { return val; } }
  return val;
}
