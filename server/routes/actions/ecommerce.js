import { getCap } from '../../../shared/helpers/inventory.js';

export async function handleEcommerce(action, params, g, ctx) {
  switch (action) {
    case 'unlockEcom': {
      if (g.hasEcom) return ctx.fail('Already unlocked');
      const { ECOM_UNLOCK_COST, ECOM_MIN_REP, ECOM_MIN_STORAGE } = await import('../../../shared/constants/ecommerce.js');
      if (g.reputation < ECOM_MIN_REP) return ctx.fail(`Need reputation ${ECOM_MIN_REP}+`);
      const totalCap = getCap(g);
      if (totalCap < ECOM_MIN_STORAGE) return ctx.fail(`Need ${ECOM_MIN_STORAGE}+ storage capacity`);
      if (g.cash < ECOM_UNLOCK_COST) return ctx.fail('Not enough cash');
      g.cash -= ECOM_UNLOCK_COST;
      g.hasEcom = true;
      if (!g.ecomStaff) g.ecomStaff = {};
      if (!g.ecomUpgrades) g.ecomUpgrades = [];
      g.ecomTotalSpent = (g.ecomTotalSpent || 0) + ECOM_UNLOCK_COST;
      g.log.push('Launched online tire store!');
      break;
    }

    case 'hireEcomStaff': {
      const { role } = params;
      if (!g.hasEcom || !g.ecomStaff) return ctx.fail('Unlock e-commerce first');
      const { ECOM_STAFF: ESTAFF } = await import('../../../shared/constants/ecommerce.js');
      if (!ESTAFF[role]) return ctx.fail('Invalid role');
      if (g.ecomStaff[role]) return ctx.fail('Already hired');
      const staff = ESTAFF[role];
      if (staff.req) {
        for (const [req2] of Object.entries(staff.req)) {
          if (!g.ecomStaff[req2]) return ctx.fail(`Requires ${ESTAFF[req2]?.title || req2} first`);
        }
      }
      if (g.cash < staff.salary) return ctx.fail('Not enough cash for first month salary');
      g.cash -= staff.salary;
      g.ecomStaff[role] = true;
      g.ecomTotalSpent = (g.ecomTotalSpent || 0) + staff.salary;
      break;
    }

    case 'fireEcomStaff': {
      const { role } = params;
      if (!g.ecomStaff || !g.ecomStaff[role]) return ctx.fail('Staff not hired');
      g.ecomStaff[role] = false;
      break;
    }

    case 'buyEcomUpgrade': {
      const { upgradeId } = params;
      const { ECOM_UPGRADES: EUPG } = await import('../../../shared/constants/ecommerce.js');
      if (!EUPG[upgradeId]) return ctx.fail('Invalid upgrade');
      if ((g.ecomUpgrades || []).includes(upgradeId)) return ctx.fail('Already purchased');
      const up = EUPG[upgradeId];
      if (up.req) {
        for (const [req2] of Object.entries(up.req)) {
          if (!g.ecomStaff?.[req2]) return ctx.fail(`Requires ${req2} first`);
        }
      }
      if (g.cash < up.cost) return ctx.fail('Not enough cash');
      g.cash -= up.cost;
      if (!g.ecomUpgrades) g.ecomUpgrades = [];
      g.ecomUpgrades.push(upgradeId);
      g.ecomTotalSpent = (g.ecomTotalSpent || 0) + up.cost;
      break;
    }

    default: return null;
  }
  return g;
}
