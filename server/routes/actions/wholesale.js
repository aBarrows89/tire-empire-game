import { getCap } from '../../../shared/helpers/inventory.js';
import { uid } from '../../../shared/helpers/random.js';

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
      // Migrate: initialize distCenters array (replaces legacy distClients)
      if (!g.distCenters) g.distCenters = [];
      g.distClients = g.distClients || []; // keep for backward compat
      g.log.push(`Distribution network unlocked! (-$${DIST_UNLOCK_COST.toLocaleString()})`);
      break;
    }

    case 'openDistCenter': {
      if (!g.hasDist) return ctx.fail('Need distribution network first');
      const { DC_OPEN_COST, DC_MAX, REGIONS, getRegionForState } = await import('../../../shared/constants/distribution.js');
      if (!g.distCenters) g.distCenters = [];
      if (g.distCenters.length >= DC_MAX) return ctx.fail(`Max ${DC_MAX} distribution centers`);

      const { regionId, cityId } = params;
      if (!REGIONS[regionId]) return ctx.fail('Invalid region');

      // Verify they don't already have a DC in this region
      if (g.distCenters.some(dc => dc.regionId === regionId)) {
        return ctx.fail(`Already have a DC in ${REGIONS[regionId].n}`);
      }

      // Verify the city is in the specified region
      const { CITIES } = await import('../../../shared/constants/cities.js');
      const city = CITIES.find(c => c.id === cityId);
      if (!city) return ctx.fail('Invalid city');
      if (getRegionForState(city.state) !== regionId) {
        return ctx.fail(`${city.name} is not in the ${REGIONS[regionId].n} region`);
      }

      if (g.cash < DC_OPEN_COST) return ctx.fail(`Need $${DC_OPEN_COST.toLocaleString()}`);
      g.cash -= DC_OPEN_COST;

      g.distCenters.push({
        id: uid(),
        regionId,
        cityId,
        cityName: city.name,
        state: city.state,
        openedDay: g.day,
      });

      g.log.push(`Opened distribution center in ${city.name}, ${city.state} (${REGIONS[regionId].n}) (-$${DC_OPEN_COST.toLocaleString()})`);
      break;
    }

    case 'closeDistCenter': {
      if (!g.distCenters || g.distCenters.length === 0) return ctx.fail('No distribution centers');
      const { dcId } = params;
      const idx = g.distCenters.findIndex(dc => dc.id === dcId);
      if (idx === -1) return ctx.fail('Distribution center not found');
      const dc = g.distCenters[idx];
      g.distCenters.splice(idx, 1);
      g.log.push(`Closed distribution center in ${dc.cityName}, ${dc.state}`);
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
