import { FACTORY } from '../../../shared/constants/factory.js';
import { FACTORY_DISCOUNT_TIERS_DEFAULT, RD_PROJECTS, CERTIFICATIONS, EXCLUSIVE_TIRES, CFO_ROLE, LINE_SWITCH_DAYS, RUBBER_FARM, SYNTHETIC_LAB } from '../../../shared/constants/factoryBrand.js';
import { getEffectiveProductionCost, getBrandTireKey } from '../../../shared/helpers/factoryBrand.js';
import { uid } from '../../../shared/helpers/random.js';

export async function handleFactory(action, params, g, ctx) {
  switch (action) {
    case 'buildFactory': {
      if (g.hasFactory) return ctx.fail('Already have a factory');
      if (g.reputation < FACTORY.minRep) return ctx.fail(`Need reputation ${FACTORY.minRep}+`);
      if ((g.locations || []).length < FACTORY.minLocations) return ctx.fail(`Need ${FACTORY.minLocations}+ locations`);
      if (g.cash < FACTORY.buildCost) return ctx.fail('Not enough cash');
      g.cash -= FACTORY.buildCost;
      g.hasFactory = true;
      g.factory = {
        level: 1,
        brandName: (g.companyName || 'My') + ' Tires',
        productionQueue: [],
        dailyCapacity: 50,
        qualityRating: 0.80,
        brandReputation: 0,
        rawMaterials: { rubber: 1.0, steel: 1.0, chemicals: 1.0 },
        staff: { lineWorkers: 0, inspectors: 0, engineers: 0, manager: 0 },
        currentLine: null,
        switchCooldown: 0,
        isDistributor: false,
        discountTiers: [...FACTORY_DISCOUNT_TIERS_DEFAULT],
        wholesalePrices: {},
        mapPrices: {},
        minOrders: {},
        rdProjects: [],
        unlockedSpecials: [],
        certifications: [],
        totalWholesaleRev: 0,
        totalWholesaleOrders: 0,
        customerList: [],
        orderHistory: [],
        vinnieInventory: {},
        vinnieTotalLoss: 0,
        hasCFO: false,
        rubberFarm: null,
        syntheticLab: null,
        rubberSupply: 0,
      };
      break;
    }

    case 'produceFactoryTires': {
      if (!g.hasFactory || !g.factory) return ctx.fail('No factory');
      const { tire, qty: rawQty2 } = params;
      const isExclusive = tire.startsWith('brand_') && (g.factory.unlockedSpecials || []).includes(tire);
      if (!isExclusive && !FACTORY.productionCost[tire]) return ctx.fail('Cannot manufacture this tire type');
      const prodQty = Math.max(1, Math.floor(Number(rawQty2) || 0));
      let unitCost = isExclusive
        ? (EXCLUSIVE_TIRES[tire]?.baseCost || 80)
        : getEffectiveProductionCost(g.factory, tire);
      // 6a: Global commodity prices cascade into factory production costs
      const gameData = await ctx.getGame();
      const gc = gameData?.economy?.commodities || {};
      if (gc.rubber || gc.steel || gc.chemicals) {
        const commodityMult = ((gc.rubber || 1) * 0.4 + (gc.steel || 1) * 0.35 + (gc.chemicals || 1) * 0.25);
        unitCost = Math.round(unitCost * commodityMult);
      }
      const cost = prodQty * unitCost;
      if (g.cash < cost) return ctx.fail('Not enough cash');
      const currentQueue = (g.factory.productionQueue || []).reduce((a, q) => a + q.qty, 0);
      if (currentQueue + prodQty > g.factory.dailyCapacity * 7) {
        return ctx.fail('Production queue full');
      }
      let switchDelay = 0;
      if (g.factory.currentLine && g.factory.currentLine !== tire) {
        switchDelay = LINE_SWITCH_DAYS;
      }
      g.factory.currentLine = tire;
      g.cash -= cost;
      if (!g.factory.productionQueue) g.factory.productionQueue = [];
      const storeKey = tire.startsWith('brand_') ? tire : getBrandTireKey(tire);
      g.factory.productionQueue.push({
        tire: storeKey, qty: prodQty, startDay: g.day,
        completionDay: g.day + switchDelay + Math.ceil(prodQty / g.factory.dailyCapacity),
      });
      if (switchDelay > 0) {
        g.log = g.log || [];
        g.log.push({ msg: `Factory line switch: +${switchDelay} day cooldown`, cat: 'sale' });
      }
      break;
    }

    case 'setFactoryBrandName': {
      if (!g.hasFactory || !g.factory) return ctx.fail('No factory');
      const { brandName } = params;
      if (!brandName || brandName.length < 2) return ctx.fail('Brand name too short');
      g.factory.brandName = brandName.slice(0, 40);
      break;
    }

    case 'hireFactoryStaff': {
      if (!g.hasFactory || !g.factory) return ctx.fail('No factory');
      const { role } = params;
      const factStaff = FACTORY.staff[role];
      if (!factStaff) return ctx.fail('Invalid factory staff role');
      if (!g.factory.staff) g.factory.staff = { lineWorkers: 0, inspectors: 0, engineers: 0, manager: 0 };
      if (role === 'manager' && g.factory.staff.manager >= (factStaff.max || 1)) {
        return ctx.fail('Max 1 factory manager');
      }
      if (g.cash < factStaff.salary) return ctx.fail('Not enough cash');
      g.cash -= factStaff.salary;
      g.factory.staff[role] = (g.factory.staff[role] || 0) + 1;
      break;
    }

    case 'fireFactoryStaff': {
      if (!g.hasFactory || !g.factory) return ctx.fail('No factory');
      const { role } = params;
      if (!g.factory.staff || !g.factory.staff[role] || g.factory.staff[role] <= 0) {
        return ctx.fail('No staff to fire');
      }
      g.factory.staff[role]--;
      break;
    }

    case 'setFactoryWholesalePrice': {
      if (!g.hasFactory || !g.factory) return ctx.fail('No factory');
      const { tire, price: fwPrice } = params;
      if (!FACTORY.productionCost[tire]) return ctx.fail('Invalid factory tire type');
      if (!g.factory.wholesalePrices) g.factory.wholesalePrices = {};
      g.factory.wholesalePrices[tire] = Math.max(1, Math.floor(Number(fwPrice) || 0));
      break;
    }

    case 'setFactoryMinOrder': {
      if (!g.hasFactory || !g.factory) return ctx.fail('No factory');
      const { tire, minQty } = params;
      if (!FACTORY.productionCost[tire]) return ctx.fail('Invalid factory tire type');
      if (!g.factory.minOrders) g.factory.minOrders = {};
      g.factory.minOrders[tire] = Math.max(1, Math.floor(Number(minQty) || 10));
      break;
    }

    case 'upgradeFactory': {
      if (!g.hasFactory || !g.factory) return ctx.fail('No factory');
      const currentLevel = g.factory.level || 1;
      const nextLevel = FACTORY.levels.find(l => l.level === currentLevel + 1);
      if (!nextLevel) return ctx.fail('Already at max level');
      if (g.cash < nextLevel.upgradeCost) return ctx.fail('Not enough cash');
      g.cash -= nextLevel.upgradeCost;
      g.factory.level = nextLevel.level;
      g.factory.dailyCapacity = nextLevel.dailyCapacity;
      g.log.push(`Factory upgraded to ${nextLevel.name}!`);
      break;
    }

    case 'listFactoryForSale': {
      if (!g.hasFactory || !g.factory) return ctx.fail('No factory');
      const { askingPrice: factAskPrice } = params;
      g.factoryListing = {
        askingPrice: Math.max(1, Math.floor(Number(factAskPrice) || FACTORY.factoryValue[g.factory.level] || 5000000)),
        listedDay: g.day,
      };
      g.log.push(`Listed factory for sale at $${g.factoryListing.askingPrice.toLocaleString()}`);
      break;
    }

    case 'delistFactory': {
      g.factoryListing = null;
      g.log.push('Delisted factory from sale');
      break;
    }

    case 'buyFactory': {
      const { sellerId } = params;
      if (!sellerId) return ctx.fail('Missing seller');
      if (g.hasFactory) return ctx.fail('You already own a factory');
      const seller = await ctx.getPlayer(sellerId);
      if (!seller) return ctx.fail('Seller not found');
      const sg = seller.game_state;
      if (!sg.factoryListing || !sg.hasFactory) return ctx.fail('Factory not for sale');
      const price = sg.factoryListing.askingPrice;
      if (g.cash < price) return ctx.fail(`Need $${price.toLocaleString()}`);
      g.cash -= price;
      g.hasFactory = true;
      g.factory = { ...sg.factory };
      g.factory.customerList = [];
      g.factory.orderHistory = [];
      g.factoryListing = null;
      g.log.push(`Purchased ${sg.factory.brandName || 'factory'} from ${sg.companyName} for $${price.toLocaleString()}!`);
      sg.cash += price;
      sg.hasFactory = false;
      sg.factory = null;
      sg.factoryListing = null;
      sg.log = sg.log || [];
      sg.log.push(`Factory sold to ${g.companyName} for $${price.toLocaleString()}!`);
      await ctx.savePlayerState(sellerId, sg);
      break;
    }

    case 'setFactoryMAP': {
      if (!g.hasFactory || !g.factory) return ctx.fail('No factory');
      const { tire: mapTire, price: mapPrice } = params;
      if (!FACTORY.productionCost[mapTire]) return ctx.fail('Invalid factory tire type');
      const minMAP = FACTORY.productionCost[mapTire];
      if (Number(mapPrice) < minMAP) return ctx.fail(`MAP must be >= production cost ($${minMAP})`);
      if (!g.factory.mapPrices) g.factory.mapPrices = {};
      g.factory.mapPrices[mapTire] = Math.max(minMAP, Math.floor(Number(mapPrice) || 0));
      break;
    }

    case 'setFactoryDiscountTier': {
      if (!g.hasFactory || !g.factory) return ctx.fail('No factory');
      const { tiers } = params;
      if (!Array.isArray(tiers) || tiers.length > 5) return ctx.fail('Max 5 tiers');
      for (const t of tiers) {
        if (typeof t.min !== 'number' || typeof t.disc !== 'number' || !t.label) {
          return ctx.fail('Each tier needs min, disc, label');
        }
        if (t.disc > 0.25) return ctx.fail('Max discount is 25%');
      }
      g.factory.discountTiers = tiers.sort((a, b) => a.min - b.min);
      break;
    }

    case 'startRDProject': {
      if (!g.hasFactory || !g.factory) return ctx.fail('No factory');
      const { projectId } = params;
      const rdDef = RD_PROJECTS.find(r => r.id === projectId);
      if (!rdDef) return ctx.fail('Invalid R&D project');
      const fStaff2 = g.factory.staff || {};
      if ((fStaff2.engineers || 0) < 1) return ctx.fail('Need at least 1 engineer');
      if (!g.factory.rdProjects) g.factory.rdProjects = [];
      if (g.factory.rdProjects.length >= 2) return ctx.fail('Max 2 concurrent R&D projects');
      if (g.factory.rdProjects.some(p => p.id === projectId)) return ctx.fail('Project already in progress');
      if ((g.factory.unlockedSpecials || []).includes(rdDef.unlocksExclusive)) {
        return ctx.fail('Already completed this project');
      }
      if (g.cash < rdDef.cost) return ctx.fail('Not enough cash');
      g.cash -= rdDef.cost;
      g.factory.rdProjects.push({ id: projectId, startDay: g.day, completionDay: g.day + rdDef.days });
      g.log = g.log || [];
      g.log.push(`Started R&D: ${rdDef.name} (${rdDef.days} days)`);
      break;
    }

    case 'startCertification': {
      if (!g.hasFactory || !g.factory) return ctx.fail('No factory');
      const { certId } = params;
      const certDef = CERTIFICATIONS.find(c => c.id === certId);
      if (!certDef) return ctx.fail('Invalid certification');
      if (!g.factory.certifications) g.factory.certifications = [];
      if (g.factory.certifications.some(c => c.id === certId)) return ctx.fail('Certification already in progress or earned');
      if (certDef.qualityReq && (g.factory.qualityRating || 0) < certDef.qualityReq) {
        return ctx.fail(`Quality must be ${Math.round(certDef.qualityReq * 100)}%+`);
      }
      if (g.cash < certDef.cost) return ctx.fail('Not enough cash');
      g.cash -= certDef.cost;
      g.factory.certifications.push({ id: certId, startDay: g.day, completionDay: g.day + certDef.days, earned: false });
      g.log = g.log || [];
      g.log.push(`Started certification: ${certDef.name} (${certDef.days} days)`);
      break;
    }

    case 'hireFactoryCFO': {
      if (!g.hasFactory || !g.factory) return ctx.fail('No factory');
      if (g.factory.hasCFO) return ctx.fail('Already have a CFO');
      if (g.cash < CFO_ROLE.salary) return ctx.fail('Not enough cash');
      g.cash -= CFO_ROLE.salary;
      g.factory.hasCFO = true;
      g.log = g.log || [];
      g.log.push(`Hired CFO ($${CFO_ROLE.salary}/mo) \u2014 blocks 50% of Vinnie's schemes`);
      break;
    }

    case 'fireFactoryCFO': {
      if (!g.hasFactory || !g.factory) return ctx.fail('No factory');
      if (!g.factory.hasCFO) return ctx.fail('No CFO to fire');
      g.factory.hasCFO = false;
      g.log = g.log || [];
      g.log.push('Fired factory CFO');
      break;
    }

    case 'buyRubberFarm': {
      if (!g.hasFactory || !g.factory) return ctx.fail('No factory');
      if (g.factory.rubberFarm) return ctx.fail('Already own a rubber farm');
      if ((g.tireCoins || 0) < RUBBER_FARM.tcCost) return ctx.fail(`Need ${RUBBER_FARM.tcCost} TC (you have ${g.tireCoins || 0})`);
      g.tireCoins -= RUBBER_FARM.tcCost;
      g.factory.rubberFarm = { level: 1, purchasedDay: g.day };
      g.log = g.log || [];
      g.log.push({ msg: `\u{1F331} Purchased Rubber Farm (Level 1) for ${RUBBER_FARM.tcCost} TC`, cat: 'event' });
      break;
    }

    case 'upgradeRubberFarm': {
      if (!g.hasFactory || !g.factory?.rubberFarm) return ctx.fail('No rubber farm');
      const currentFarmLevel = g.factory.rubberFarm.level;
      const nextFarmLevel = RUBBER_FARM.levels.find(l => l.level === currentFarmLevel + 1);
      if (!nextFarmLevel) return ctx.fail('Already at max level');
      if ((g.tireCoins || 0) < nextFarmLevel.upgradeTcCost) return ctx.fail(`Need ${nextFarmLevel.upgradeTcCost} TC`);
      if (g.cash < nextFarmLevel.upgradeCashCost) return ctx.fail(`Need $${nextFarmLevel.upgradeCashCost.toLocaleString()} cash`);
      g.tireCoins -= nextFarmLevel.upgradeTcCost;
      g.cash -= nextFarmLevel.upgradeCashCost;
      g.factory.rubberFarm.level = nextFarmLevel.level;
      g.log = g.log || [];
      g.log.push({ msg: `\u{1F331} Rubber Farm upgraded to Level ${nextFarmLevel.level} (${nextFarmLevel.dailyOutput}/day)`, cat: 'event' });
      break;
    }

    case 'buySyntheticLab': {
      if (!g.hasFactory || !g.factory) return ctx.fail('No factory');
      if (g.factory.syntheticLab) return ctx.fail('Already own a synthetic lab');
      if ((g.tireCoins || 0) < SYNTHETIC_LAB.tcCost) return ctx.fail(`Need ${SYNTHETIC_LAB.tcCost} TC (you have ${g.tireCoins || 0})`);
      if (g.cash < SYNTHETIC_LAB.cashCost) return ctx.fail(`Need $${SYNTHETIC_LAB.cashCost.toLocaleString()} cash`);
      g.tireCoins -= SYNTHETIC_LAB.tcCost;
      g.cash -= SYNTHETIC_LAB.cashCost;
      g.factory.syntheticLab = { level: 1, purchasedDay: g.day };
      g.log = g.log || [];
      g.log.push({ msg: `\u{1F9EA} Purchased Synthetic Lab (Level 1) for ${SYNTHETIC_LAB.tcCost} TC + $${SYNTHETIC_LAB.cashCost.toLocaleString()}`, cat: 'event' });
      break;
    }

    case 'upgradeSyntheticLab': {
      if (!g.hasFactory || !g.factory?.syntheticLab) return ctx.fail('No synthetic lab');
      const currentLabLevel = g.factory.syntheticLab.level;
      const nextLabLevel = SYNTHETIC_LAB.levels.find(l => l.level === currentLabLevel + 1);
      if (!nextLabLevel) return ctx.fail('Already at max level');
      if ((g.tireCoins || 0) < nextLabLevel.upgradeTcCost) return ctx.fail(`Need ${nextLabLevel.upgradeTcCost} TC`);
      if (g.cash < nextLabLevel.upgradeCashCost) return ctx.fail(`Need $${nextLabLevel.upgradeCashCost.toLocaleString()} cash`);
      g.tireCoins -= nextLabLevel.upgradeTcCost;
      g.cash -= nextLabLevel.upgradeCashCost;
      g.factory.syntheticLab.level = nextLabLevel.level;
      g.log = g.log || [];
      g.log.push({ msg: `\u{1F9EA} Synthetic Lab upgraded to Level ${nextLabLevel.level} (${nextLabLevel.dailyOutput}/day)`, cat: 'event' });
      break;
    }

    case 'sellRubberSurplus': {
      if (!g.hasFactory || !g.factory) return ctx.fail('No factory');
      const supply = g.factory.rubberSupply || 0;
      if (supply <= 0) return ctx.fail('No rubber surplus to sell');
      const rubberIdx = g.factory.rawMaterials?.rubber || 1.0;
      const pricePerUnit = Math.round(rubberIdx * 500);
      const revenue = supply * pricePerUnit;
      g.cash += revenue;
      g.factory.rubberSupply = 0;
      g.log = g.log || [];
      g.log.push({ msg: `Sold ${supply} rubber units for $${revenue.toLocaleString()} ($${pricePerUnit}/unit)`, cat: 'sale' });
      break;
    }

    default: return null;
  }
  return g;
}
