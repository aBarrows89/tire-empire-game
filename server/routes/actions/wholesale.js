import { getCap } from '../../../shared/helpers/inventory.js';

export async function handleWholesale(action, params, g, ctx) {
  switch (action) {
    case 'unlockWholesale': {
      if (g.hasWholesale) return ctx.fail('Already unlocked');
      const { WS_MIN_REP, WS_MIN_STORAGE } = await import('../../../shared/constants/wholesale.js');
      if (g.reputation < WS_MIN_REP) return ctx.fail(`Need reputation ${WS_MIN_REP}+`);
      const wsCap = getCap(g);
      if (wsCap < WS_MIN_STORAGE) return ctx.fail(`Need ${WS_MIN_STORAGE}+ storage capacity`);
      g.hasWholesale = true;
      if (!g.wsClients) g.wsClients = [];
      g.log.push('Opened wholesale distribution channel!');
      break;
    }

    case 'unlockDist': {
      if (g.hasDist) return ctx.fail('Already unlocked');
      const { DIST_UNLOCK_COST, DIST_MIN_REP, DIST_MIN_LOCS } = await import('../../../shared/constants/distribution.js');
      if (g.reputation < DIST_MIN_REP) return ctx.fail(`Need reputation ${DIST_MIN_REP}+`);
      if ((g.locations || []).length < DIST_MIN_LOCS) return ctx.fail(`Need ${DIST_MIN_LOCS}+ locations`);
      if (!g.hasWholesale) return ctx.fail('Need wholesale channel first');
      if (g.cash < DIST_UNLOCK_COST) return ctx.fail(`Need $${DIST_UNLOCK_COST.toLocaleString()}`);
      g.cash -= DIST_UNLOCK_COST;
      g.hasDist = true;
      g.distClients = g.distClients || [];
      g.log.push(`Distribution network unlocked! (-$${DIST_UNLOCK_COST.toLocaleString()})`);
      break;
    }

    case 'enableFactoryDistribution': {
      if (!g.hasFactory || !g.factory) return ctx.fail('No factory');
      if (!g.hasDist) return ctx.fail('Need distribution network');
      if (g.factory.isDistributor) return ctx.fail('Already a distributor');
      const distCost = 250000;
      if (g.cash < distCost) return ctx.fail('Not enough cash ($250K)');
      g.cash -= distCost;
      g.factory.isDistributor = true;
      g.log = g.log || [];
      g.log.push('Factory distribution network enabled! Other players can now buy from you.');
      break;
    }

    default: return null;
  }
  return g;
}
