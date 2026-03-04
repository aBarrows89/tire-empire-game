import { TIRES } from '../../../shared/constants/tires.js';
import { SERVICES } from '../../../shared/constants/services.js';

export function handlePricing(action, params, g, ctx) {
  switch (action) {
    case 'setPrice': {
      const { tire, price } = params;
      if (!TIRES[tire]) return ctx.fail('Invalid tire type');
      const t = TIRES[tire];
      g.prices[tire] = Math.max(t.lo, Math.min(t.hi, price));
      break;
    }

    case 'setAutoPrice': {
      const { tire, strategy, offset } = params;
      if (!TIRES[tire]) return ctx.fail('Invalid tire type');
      const validStrategies = ['off', 'undercut', 'above', 'match', 'max'];
      if (!validStrategies.includes(strategy)) return ctx.fail('Invalid strategy');
      if (!g.staff.pricingAnalyst || g.staff.pricingAnalyst <= 0) {
        return ctx.fail('Hire a Pricing Analyst first');
      }
      if (!g.autoPrice) g.autoPrice = {};
      g.autoPrice[tire] = { strategy, offset: Math.max(0, Number(offset) || 0) };
      break;
    }

    case 'setServicePrice': {
      const { service, price } = params;
      if (!SERVICES[service]) return ctx.fail('Invalid service');
      const svc = SERVICES[service];
      const clamped = Math.max(Math.round(svc.price * 0.5), Math.min(Math.round(svc.price * 3), Number(price)));
      if (!g.servicePrices) g.servicePrices = {};
      g.servicePrices[service] = clamped;
      break;
    }

    default: return null;
  }
  return g;
}
