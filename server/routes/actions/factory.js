import { FACTORY } from '../../../shared/constants/factory.js';
import { FACTORY_DISCOUNT_TIERS_DEFAULT, RD_PROJECTS, CERTIFICATIONS, EXCLUSIVE_TIRES, CFO_ROLE, LINE_SWITCH_DAYS, RUBBER_FARM, SYNTHETIC_LAB, MATERIAL_SUPPLIERS, RUBBER_STORAGE, RUBBER_PER_TIRE, RUBBER_QUALITY } from '../../../shared/constants/factoryBrand.js';
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
        lines: [{ id: 0, queue: [], currentType: null, runStreak: 0, lastMaintDay: g.day || 1, status: 'active' }],
        dailyCapacity: FACTORY.levels[0].dailyCapacity,
        qualityRating: 0.80,
        brandReputation: 0,
        rawMaterials: { rubber: 1.0, steel: 1.0, chemicals: 1.0 },
        staff: { lineWorkers: 0, inspectors: 0, engineers: 0, manager: 0 },
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
        rubberStorage: null,
        naturalRubber: 0,
        syntheticRubber: 0,
        rubberPreference: 'auto',
      };
      g.commodityContracts = [];
      break;
    }

    case 'produceFactoryTires': {
      if (!g.hasFactory || !g.factory) return ctx.fail('No factory');
      const { tire, qty: rawQty2, lineIndex: rawLineIdx } = params;
      const isExclusive = tire.startsWith('brand_') && (g.factory.unlockedSpecials || []).includes(tire);
      if (!isExclusive && !FACTORY.productionCost[tire]) return ctx.fail('Cannot manufacture this tire type');
      const prodQty = Math.max(1, Math.floor(Number(rawQty2) || 0));
      let unitCost = isExclusive
        ? (EXCLUSIVE_TIRES[tire]?.baseCost || 80)
        : getEffectiveProductionCost(g.factory, tire);
      // Global commodity prices cascade into factory production costs
      const gameData = await ctx.getGame();
      const gc = gameData?.economy?.commodities || {};
      if (gc.rubber || gc.steel || gc.chemicals) {
        const commodityMult = ((gc.rubber || 1) * 0.4 + (gc.steel || 1) * 0.35 + (gc.chemicals || 1) * 0.25);
        unitCost = Math.round(unitCost * commodityMult);
      }
      const cost = prodQty * unitCost;
      if (g.cash < cost) return ctx.fail('Not enough cash');

      // Rubber consumption — require rubber storage and sufficient rubber
      const prodBaseType = tire.startsWith('brand_') ? tire.replace('brand_', '') : tire;
      const rubberPerUnit = RUBBER_PER_TIRE[prodBaseType] || 1.0;
      const rubberNeeded = rubberPerUnit * prodQty;
      if (g.factory.rubberStorage) {
        const natAvail = g.factory.naturalRubber || 0;
        const synAvail = g.factory.syntheticRubber || 0;
        if (natAvail + synAvail < rubberNeeded) {
          return ctx.fail(`Need ${rubberNeeded} rubber units (have ${natAvail + synAvail}). Produce or buy more rubber.`);
        }
        // Deduct rubber based on preference
        const pref = g.factory.rubberPreference || 'auto';
        let natUse = 0, synUse = 0;
        if (pref === 'natural') {
          natUse = Math.min(natAvail, rubberNeeded);
          synUse = rubberNeeded - natUse;
        } else if (pref === 'synthetic') {
          synUse = Math.min(synAvail, rubberNeeded);
          natUse = rubberNeeded - synUse;
        } else { // auto — prefer natural first
          natUse = Math.min(natAvail, rubberNeeded);
          synUse = rubberNeeded - natUse;
        }
        g.factory.naturalRubber = natAvail - natUse;
        g.factory.syntheticRubber = synAvail - synUse;
        // Store synthetic ratio on the batch for defect calculation
        var syntheticRatio = rubberNeeded > 0 ? synUse / rubberNeeded : 0;
      } else if (g.factory.rubberFarm || g.factory.syntheticLab) {
        return ctx.fail('Build Rubber Storage first to use your rubber production');
      }

      // Multi-line support: determine target line
      const lineIdx = Math.max(0, Math.floor(Number(rawLineIdx) || 0));
      const maxLines = (FACTORY.productionLines?.byLevel?.[g.factory.level - 1]) || 1;
      if (lineIdx >= maxLines) return ctx.fail(`Line ${lineIdx + 1} not available (factory level ${g.factory.level} has ${maxLines} line${maxLines > 1 ? 's' : ''})`);

      // Migrate legacy queue if needed
      if (!g.factory.lines) {
        g.factory.lines = [{
          id: 0, queue: g.factory.productionQueue || [], currentType: g.factory.currentLine || null,
          runStreak: 0, lastMaintDay: g.day, status: 'active', switchCooldown: 0,
        }];
        delete g.factory.productionQueue;
        delete g.factory.currentLine;
      }
      // Ensure line exists
      while (g.factory.lines.length <= lineIdx) {
        g.factory.lines.push({ id: g.factory.lines.length, queue: [], currentType: null, runStreak: 0, lastMaintDay: g.day, status: 'active', switchCooldown: 0 });
      }
      const line = g.factory.lines[lineIdx];
      if (line.status === 'maintenance') return ctx.fail(`Line ${lineIdx + 1} is under maintenance`);

      const currentQueue = line.queue.reduce((a, q) => a + q.qty, 0);
      if (currentQueue + prodQty > g.factory.dailyCapacity * 7) {
        return ctx.fail('Production queue full');
      }
      let switchDelay = 0;
      if (line.currentType && line.currentType !== tire) {
        switchDelay = LINE_SWITCH_DAYS;
      }
      line.currentType = tire;
      g.cash -= cost;
      const storeKey = tire.startsWith('brand_') ? tire : getBrandTireKey(tire);
      line.queue.push({
        tire: storeKey, qty: prodQty, startDay: g.day,
        completionDay: g.day + switchDelay + Math.ceil(prodQty / g.factory.dailyCapacity),
        syntheticRatio: typeof syntheticRatio === 'number' ? syntheticRatio : 0,
      });
      if (switchDelay > 0) {
        g.log = g.log || [];
        g.log.push({ msg: `Line ${lineIdx + 1} switch: +${switchDelay} day cooldown`, cat: 'sale' });
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
      if ((g.factory.completedRD || []).includes(projectId)) return ctx.fail('Already completed this project');
      if (rdDef.unlocksExclusive && (g.factory.unlockedSpecials || []).includes(rdDef.unlocksExclusive)) {
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

    case 'buildRubberStorage': {
      if (!g.hasFactory || !g.factory) return ctx.fail('No factory');
      if (g.factory.rubberStorage) return ctx.fail('Already have rubber storage');
      const storageLv1 = RUBBER_STORAGE.levels[0];
      if (g.cash < storageLv1.buildCost) return ctx.fail(`Need $${storageLv1.buildCost.toLocaleString()}`);
      g.cash -= storageLv1.buildCost;
      g.factory.rubberStorage = { level: 1 };
      g.log = g.log || [];
      g.log.push({ msg: `Built Rubber Storage (capacity: ${storageLv1.capacity} units)`, cat: 'event' });
      break;
    }

    case 'upgradeRubberStorage': {
      if (!g.hasFactory || !g.factory?.rubberStorage) return ctx.fail('No rubber storage');
      const curStorageLvl = g.factory.rubberStorage.level;
      const nextStorage = RUBBER_STORAGE.levels.find(l => l.level === curStorageLvl + 1);
      if (!nextStorage) return ctx.fail('Already at max storage level');
      if (g.cash < nextStorage.upgradeCost) return ctx.fail(`Need $${nextStorage.upgradeCost.toLocaleString()}`);
      if ((g.tireCoins || 0) < nextStorage.upgradeTcCost) return ctx.fail(`Need ${nextStorage.upgradeTcCost} TC`);
      g.cash -= nextStorage.upgradeCost;
      g.tireCoins -= nextStorage.upgradeTcCost;
      g.factory.rubberStorage.level = nextStorage.level;
      g.log = g.log || [];
      g.log.push({ msg: `Rubber Storage upgraded to Level ${nextStorage.level} (capacity: ${nextStorage.capacity})`, cat: 'event' });
      break;
    }

    case 'setRubberPreference': {
      if (!g.hasFactory || !g.factory) return ctx.fail('No factory');
      const { preference } = params;
      if (!['natural', 'synthetic', 'auto'].includes(preference)) return ctx.fail('Invalid preference');
      g.factory.rubberPreference = preference;
      break;
    }

    case 'buyRubberMarket': {
      if (!g.hasFactory || !g.factory) return ctx.fail('No factory');
      if (!g.factory.rubberStorage) return ctx.fail('Build Rubber Storage first');
      const { rubberType: buyType, qty: buyRawQty } = params;
      if (!['natural', 'synthetic'].includes(buyType)) return ctx.fail('Invalid rubber type');
      const buyQty = Math.max(1, Math.floor(Number(buyRawQty) || 0));
      const storageLvl = g.factory.rubberStorage.level;
      const cap = (RUBBER_STORAGE.levels.find(l => l.level === storageLvl) || RUBBER_STORAGE.levels[0]).capacity;
      const currentTotal = (g.factory.naturalRubber || 0) + (g.factory.syntheticRubber || 0);
      if (currentTotal + buyQty > cap) return ctx.fail(`Not enough storage space (${cap - currentTotal} available)`);
      const gameData = await ctx.getGame();
      const rubberIdx = gameData?.economy?.commodities?.rubber || 1.0;
      const basePrice = buyType === 'natural' ? 500 : 600;
      const pricePerUnit = Math.round(basePrice * rubberIdx);
      const totalCost = pricePerUnit * buyQty;
      if (g.cash < totalCost) return ctx.fail(`Need $${totalCost.toLocaleString()}`);
      g.cash -= totalCost;
      if (buyType === 'natural') {
        g.factory.naturalRubber = (g.factory.naturalRubber || 0) + buyQty;
      } else {
        g.factory.syntheticRubber = (g.factory.syntheticRubber || 0) + buyQty;
      }
      g.log = g.log || [];
      g.log.push({ msg: `Bought ${buyQty} ${buyType} rubber at $${pricePerUnit}/unit ($${totalCost.toLocaleString()})`, cat: 'sale' });
      break;
    }

    case 'sellRubberSurplus': {
      if (!g.hasFactory || !g.factory) return ctx.fail('No factory');
      const { rubberType: sellType, qty: sellRawQty } = params || {};
      const rType = ['natural', 'synthetic'].includes(sellType) ? sellType : 'natural';
      const availSupply = rType === 'natural' ? (g.factory.naturalRubber || 0) : (g.factory.syntheticRubber || 0);
      const sellQty = sellRawQty ? Math.min(Math.max(1, Math.floor(Number(sellRawQty) || 0)), availSupply) : availSupply;
      if (sellQty <= 0) return ctx.fail(`No ${rType} rubber to sell`);
      const rubberIdx = g.factory.rawMaterials?.rubber || 1.0;
      const basePrice = rType === 'natural' ? 500 : 600;
      const pricePerUnit = Math.round(rubberIdx * basePrice);
      const revenue = sellQty * pricePerUnit;
      g.cash += revenue;
      if (rType === 'natural') {
        g.factory.naturalRubber = (g.factory.naturalRubber || 0) - sellQty;
      } else {
        g.factory.syntheticRubber = (g.factory.syntheticRubber || 0) - sellQty;
      }
      g.log = g.log || [];
      g.log.push({ msg: `Sold ${sellQty} ${rType} rubber for $${revenue.toLocaleString()} ($${pricePerUnit}/unit)`, cat: 'sale' });
      break;
    }

    case 'maintainFactoryLine': {
      if (!g.hasFactory || !g.factory) return ctx.fail('No factory');
      const { lineIndex } = params;
      const li = Math.max(0, Math.floor(Number(lineIndex) || 0));
      if (!g.factory.lines || !g.factory.lines[li]) return ctx.fail('Line not found');
      const line = g.factory.lines[li];
      if (line.status === 'maintenance') return ctx.fail('Line already in maintenance');
      const maintCost = (FACTORY.productionLines?.maintenance?.cost?.[g.factory.level - 1]) || 15000;
      if (g.cash < maintCost) return ctx.fail(`Need $${maintCost.toLocaleString()} for maintenance`);
      g.cash -= maintCost;
      line.status = 'maintenance';
      line.maintCompleteDay = g.day + (FACTORY.productionLines?.maintenance?.durationDays || 1);
      g.log = g.log || [];
      g.log.push({ msg: `🔧 Line ${li + 1} maintenance started (-$${maintCost.toLocaleString()})`, cat: 'factory' });
      break;
    }

    case 'recallBatch': {
      if (!g.hasFactory || !g.factory) return ctx.fail('No factory');
      const { batchIndex } = params;
      const bi = Math.floor(Number(batchIndex) || 0);
      const batch = g.factory.defectHistory?.[bi];
      if (!batch) return ctx.fail('Batch not found');
      if (batch.recalled) return ctx.fail('Already recalled');
      const totalDefective = (batch.defects?.cosmetic || 0) + (batch.defects?.structural || 0) + (batch.defects?.critical || 0);
      if (totalDefective <= 0) return ctx.fail('No defects to recall');
      const recallCost = Math.floor(totalDefective * (getEffectiveProductionCost(g.factory, batch.tire) || 50) * (FACTORY.warranty?.recallCostMultiplier || 2));
      if (g.cash < recallCost) return ctx.fail(`Need $${recallCost.toLocaleString()} for recall`);
      g.cash -= recallCost;
      g.reputation = Math.min(100, g.reputation + totalDefective * 0.01);
      batch.recalled = true;
      g.factory.totalRecalls = (g.factory.totalRecalls || 0) + 1;
      g.log = g.log || [];
      g.log.push({ msg: `🔄 Recalled batch of ${batch.qty} tires — $${recallCost.toLocaleString()} cost, reputation recovered`, cat: 'factory' });
      break;
    }

    case 'acceptExclusivityDeal': {
      if (!g.hasFactory || !g.factory) return ctx.fail('No factory');
      const { offerId } = params;
      if (!g.factory.exclusivityOffers) return ctx.fail('No pending offers');
      const offerIdx = g.factory.exclusivityOffers.findIndex(o => o.id === offerId);
      if (offerIdx === -1) return ctx.fail('Offer not found');
      const offer = g.factory.exclusivityOffers[offerIdx];
      if (g.day > offer.expiresDay) return ctx.fail('Offer expired');

      // Move from offers to active deals
      if (!g.factory.exclusivityDeals) g.factory.exclusivityDeals = [];
      g.factory.exclusivityDeals.push({
        ...offer,
        status: 'active',
        startDay: g.day,
        endDay: g.day + offer.durationMonths * 30,
        deliveredQty: 0,
      });
      g.factory.exclusivityOffers.splice(offerIdx, 1);
      g.log = g.log || [];
      g.log.push({ msg: `Accepted exclusivity deal with ${offer.shopName}: ${offer.monthlyQty}/mo of ${offer.tireType}`, cat: 'event' });
      break;
    }

    case 'declineExclusivityDeal': {
      if (!g.hasFactory || !g.factory) return ctx.fail('No factory');
      const { offerId: declineId } = params;
      if (!g.factory.exclusivityOffers) return ctx.fail('No pending offers');
      const decIdx = g.factory.exclusivityOffers.findIndex(o => o.id === declineId);
      if (decIdx === -1) return ctx.fail('Offer not found');
      g.factory.exclusivityOffers.splice(decIdx, 1);
      g.log = g.log || [];
      g.log.push({ msg: 'Declined exclusivity offer', cat: 'event' });
      break;
    }

    case 'setMaterialSupplier': {
      if (!g.hasFactory || !g.factory) return ctx.fail('No factory');
      const { material, supplierId } = params;
      const suppliers = MATERIAL_SUPPLIERS?.[material];
      if (!suppliers) return ctx.fail('Invalid material type');
      const sup = suppliers.find(s => s.id === supplierId);
      if (!sup) return ctx.fail('Supplier not found');
      if (g.reputation < (sup.minRep || 0)) return ctx.fail(`Need ${sup.minRep}+ reputation for this supplier`);
      if (!g.factory.suppliers) g.factory.suppliers = {};
      g.factory.suppliers[material] = supplierId;
      g.log = g.log || [];
      g.log.push({ msg: `Switched ${material} supplier to ${sup.label}`, cat: 'factory' });
      break;
    }

    default: return null;
  }
  return g;
}
