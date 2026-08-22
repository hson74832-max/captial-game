import type {
  Building, BuildingType, City, Company, GameState, Notification, Product,
} from './types';
import {
  BUILDING_CONFIGS, TICKS_PER_MONTH, VENUE_FOOD_FACTOR, VENUE_INGREDIENTS, VENUE_TICKET,
  isHospitality, isProducer, isProperty, RESEARCH_MENU,
} from './constants';
import {
  canPlace, createBuilding, eligibleProducts, findFreeTile, generateCities,
  generateCompanies, generateMap, generateProducts, mulberry32, uid,
} from './world';
import {
  farmModifiers, nimbyCheck, runProcurement, serviceTenure, simulateAntitrust,
  simulateBanking, simulateEnvironment, simulateHouseholds, simulateLabour,
  simulateLandMarket, simulatePipeline, simulatePolitics, simulateAIBehaviours,
  wireHelpers, landPrice,
} from './systems';
import {
  messyLiquidation, patentPremium, resolveResearch, rushPenalty,
  reviewCreditRatings, simulateCartels, simulateGovernment, simulateHerding,
  simulatePatents, simulatePredatoryPricing, simulateSupplierFailures,
  simulateTrade, updateEffectiveTraining,
} from './supplychain';
import {
  createIndexFunds, generateTradedAssets, playerPortfolioValue,
  simulateAiCapitalAllocation, simulateAssetPrices,
} from './markets';
import {
  computeYieldCurve, generateInitialBonds, markToMarket, payCoupons, settleBonds,
} from './bonds';
import { clearEntityCaches, generateEntities, updateEntities } from './entities';
import {
  retailDemand, productRating, scarcityMultiplier, updateSocialProof,
  updateHouseholdBudgets,
} from './consumers';
import {
  collectCorporateTax, collectPropertyTax, payDividends, replenishSeaports,
  reviewTaxPolicy, rollFiscalYear, simulatePortShipments, updateMoneySupply,
} from './taxation';
import {
  runCentralBank, runFiscalBudget, simulateEnergyMarket, updateCpiBreakdown,
  updateWageSpiral,
} from './macro';

// ============================ SETUP ============================
export function createGame(seed = 20260214, playerName = 'Northwind Group', playerColor = '#22d3a7'): GameState {
  wireHelpers(notify, news, fmtShort);
  const rand = mulberry32(seed);
  const size = 110;
  const products = generateProducts(rand);
  const cities = generateCities(rand, size);
  const tiles = generateMap(seed, size, cities);
  const companies = generateCompanies(rand, playerName, playerColor);

  const state: GameState = {
    tick: 0, seed, speed: 3, paused: false,
    year: 2000, month: 1, day: 1, hour: 7, dayOfYear: 0, season: 'winter', timeOfDay: 7 / 24,
    mapSize: size, tiles, cities, companies, buildings: [], products,
    economy: {
      cycle: 'growth', cycleMonth: 0, gdpGrowth: 2.6, nominalGdp: 0,
      inflation: 2.1, cpi: 100, interestRate: 5.0, unemployment: 5.1,
      consumerConfidence: 64, businessConfidence: 61,
      moneySupply: 100, moneyVelocity: 1.15, purchasingPower: 100,
      dieselPrice: 3.35, energyShockMonths: 0, cbCredibility: 0.82, guidance: 'neutral',
      govDebt: 1_500_000_000, govDeficit: 0,
      corporateTaxRate: 21, propertyTaxRate: 0.011, minimumWage: 7.25, tenYearYield: 4.6,
      carbonTaxPerUnit: 0.12, capitalGainsRate: 15,
      shortTermCapitalGainsRate: 37, longTermCapitalGainsRate: 15,
      twoYearYield: 4.3, threeMonthYield: 5.1, co2Stock: 372,
      dividendTaxRate: 15,
      centralBankAssets: 8_400_000_000, baseMoney: 84, broadMoney: 214,
      productivityGrowth: 1.6, unitLaborCostGrowth: 0.8, householdSavingsRate: 7.2,
      cpiByCategory: { food: 100, housing: 100, energy: 100, services: 100, goods: 100, core: 100 },
      strategicReserveDays: 120,
      creditTightness: 0, bankCapitalAdequacy: 0.12, loanLossProvisions: 0,
      history: { gdp: Array(48).fill(2.6), inflation: Array(48).fill(2.1), rate: Array(48).fill(5), unemployment: Array(48).fill(5.1) },
    },
    politics: {
      rulingParty: 'centrist', approval: 53, nextElectionYear: 2004,
      industryLobby: 0.4, greenLobby: 0.33, antitrustThreshold: 45, nextReviewTick: 720,
    },
    tradePartners: [
      { id: 'tp1', name: 'Meridia', exchangeRate: 0.92, baseExchangeRate: 0.92, tariffRate: 0.04, wageIndex: 0.85, qualityPenalty: 0.06, relationship: 42 },
      { id: 'tp2', name: 'Kashan Federation', exchangeRate: 7.1, baseExchangeRate: 7.1, tariffRate: 0.12, wageIndex: 0.22, qualityPenalty: 0.18, relationship: 8 },
      { id: 'tp3', name: 'Vale Union', exchangeRate: 1.35, baseExchangeRate: 1.35, tariffRate: 0.02, wageIndex: 1.15, qualityPenalty: 0.02, relationship: 66 },
      { id: 'tp4', name: 'Solano Bloc', exchangeRate: 0.61, baseExchangeRate: 0.61, tariffRate: 0.18, wageIndex: 0.34, qualityPenalty: 0.12, relationship: -14 },
    ],
    patents: [], cartels: [], bonds: [], tradedAssets: [],
    globalMarket: { price: {}, netExport: {} }, portShipments: [],
    landHoldings: [], pipeline: [], contracts: {}, negotiation: null,
    stockMarket: {
      index: 10_000,
      indexHistory: Array.from({ length: 80 }, (_, i) => 9200 + Math.sin(i / 8) * 380 + i * 9),
      sentiment: 'neutral',
      ticker: [],
    },
    notifications: [],
    freight: [], agents: generateEntities(cities, rand), loans: [], offers: [], research: [],
    playerCompanyId: companies[0].id,
    selectedBuildingId: null, selectedCityId: null, buildMode: null, landMode: false, overlay: 'none',
    stats: { netWorthHistory: Array(60).fill(40_000_000), revenueHistory: Array(60).fill(0) },
  };

  clearEntityCaches();
  seedWorldBuildings(state, rand);
  // Respawn traffic now that the world (and therefore the road graph) exists,
  // so every vehicle starts life parked on an actual street intersection
  // rather than in a field near the city centre.
  state.agents = generateEntities(cities, rand, state);
  // Capital markets: physical-supply commodities plus in-world index funds,
  // and the AI's opening bond issuance.
  state.tradedAssets = [...generateTradedAssets(), ...createIndexFunds(state)];
  state.bonds = generateInitialBonds(state);
  computeYieldCurve(state);
  markToMarket(state);
  updateHouseholdBudgets(state);
  news(state, 'Markets open for the new millennium — capital is cheap and cities are growing', 'info');
  notify(state, 'Welcome. You have $40M in capital. Pick a site and build your first asset.', 'info');
  return state;
}

function seedWorldBuildings(state: GameState, rand: () => number) {
  // Institutional property market + AI starting estates + state seaports
  const landlords = ['First National', 'Metro Trust', 'City Development Fund', 'Heritage Property', 'Pension Realty'];
  for (const city of state.cities) {
    const scale = Math.max(1, Math.round(city.population / 22_000));
    const plan: Array<[BuildingType, number, number]> = [
      ['apartment', 3 + scale, 0.34],
      ['office', 2 + scale, 0.38],
      ['retail_store', 2 + scale, 0.42],
      ['cafe', 1 + Math.round(scale / 2), 0.5],
    ];
    for (const [type, count, saleChance] of plan) {
      for (let i = 0; i < count; i++) {
        const spot = findFreeTile(state, city, type, rand);
        if (!spot) continue;
        const b = createBuilding(type, 'system', city, state.products, spot.x, spot.y, 0);
        b.name = `${landlords[Math.floor(rand() * landlords.length)]} ${BUILDING_CONFIGS[type].name}`;
        b.employees = Math.round(b.targetEmployees * 0.8);
        if (isProperty(type)) {
          b.tenants = Math.round(b.capacity * (0.5 + rand() * 0.42));
          b.occupancy = (b.tenants / b.capacity) * 100;
        }
        b.fairValue = b.constructionCost + b.landValue;
        // Worldgen listings anchor between 90% and 118% of fair value. A floor
        // at $25,000 prevents the very tiny assets (0–1% of value) from being
        // listed at $0, which previously created the "buy a building for free"
        // glitch.
        if (rand() < saleChance) {
          b.forSale = true;
          b.askingPrice = Math.max(25_000, Math.round(b.fairValue * (0.9 + rand() * 0.28)));
        }
        state.buildings.push(b);
      }
    }
  }

  // AI estates
  const focusTypes: Record<Company['sectorFocus'], BuildingType[]> = {
    retail: ['retail_store', 'warehouse'],
    industrial: ['farm', 'factory', 'warehouse'],
    real_estate: ['apartment', 'office'],
    hospitality: ['cafe', 'fast_food', 'restaurant', 'bar'],
    diversified: ['retail_store', 'factory', 'farm', 'apartment', 'cafe'],
  };
  for (const co of state.companies) {
    if (co.isPlayer) continue;
    const n = co.skill === 'novice' ? Math.floor(rand() * 2)
      : co.skill === 'competent' ? 1 + Math.floor(rand() * 2)
      : co.skill === 'shrewd' ? 3 + Math.floor(rand() * 2) : 4 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++) {
      const city = state.cities[Math.floor(rand() * state.cities.length)];
      const types = focusTypes[co.sectorFocus];
      const type = types[Math.floor(rand() * types.length)];
      const spot = findFreeTile(state, city, type, rand);
      if (!spot) continue;
      const cost = BUILDING_CONFIGS[type].cost * city.landCostMultiplier;
      if (co.cash < cost * 1.2) continue;
      const b = createBuilding(type, co.id, city, state.products, spot.x, spot.y, 0);
      b.employees = Math.round(b.targetEmployees * (0.6 + rand() * 0.4));
      b.name = `${co.name.split(' ')[0]} ${BUILDING_CONFIGS[type].name}`;
      if (isProperty(type)) { b.tenants = Math.round(b.capacity * (0.4 + rand() * 0.4)); b.occupancy = b.tenants / b.capacity * 100; }
      seedInventory(b, state);
      co.cash -= cost;
      state.buildings.push(b);
      co.buildings.push(b.id);
    }
  }

  // Seaports (state-owned import terminals)
  const portCities = state.cities.slice(0, Math.max(2, Math.floor(state.cities.length / 2)));
  for (const city of portCities) {
    const spot = findFreeTile(state, city, 'warehouse', rand) ?? { x: city.x + 5, y: city.y + 5 };
    const port = createBuilding('seaport', 'system', city, state.products, spot.x, spot.y, 0);
    port.name = `${city.name} Import Terminal`;
    port.employees = port.targetEmployees;
    port.products = state.products.map(p => p.id);
    port.inventory = Object.fromEntries(state.products.map(p => [p.id, 12_000 + Math.round(rand() * 14_000)]));
    port.constructionCost = 800_000_000; port.landValue = 120_000_000;
    state.buildings.push(port);
  }
}

function seedInventory(b: Building, state: GameState) {
  for (const pid of b.products) {
    const p = state.products.find(x => x.id === pid);
    if (!p) continue;
    b.inventory[pid] = Math.round(b.inventoryCapacity * 0.25 / Math.max(1, b.products.length));
  }
}

// ============================ HELPERS ============================
export function notify(state: GameState, message: string, type: Notification['type'] = 'info') {
  if (state.notifications[0]?.message === message) return;
  state.notifications.unshift({ id: uid('n'), message, type, tick: state.tick });
  if (state.notifications.length > 40) state.notifications.pop();
}

export function news(state: GameState, text: string, type: 'info' | 'warning' | 'breaking' | 'success' = 'info') {
  state.stockMarket.ticker.unshift({ id: uid('t'), text, type, tick: state.tick });
  if (state.stockMarket.ticker.length > 24) state.stockMarket.ticker.pop();
}

export const playerCo = (s: GameState) => s.companies.find(c => c.id === s.playerCompanyId)!;
export const findBuilding = (s: GameState, id: string | null) => s.buildings.find(b => b.id === id);
export const findProduct = (s: GameState, id: string | null) => s.products.find(p => p.id === id);
export const cityOf = (s: GameState, b: Building) => s.cities.find(c => c.id === b.cityId)!;

interface Index {
  byCompany: Map<string, Building[]>;
  byCity: Map<string, Building[]>;
  products: Map<string, Product>;
  cities: Map<string, City>;
}
function buildIndex(state: GameState): Index {
  const byCompany = new Map<string, Building[]>();
  const byCity = new Map<string, Building[]>();
  for (const b of state.buildings) {
    (byCompany.get(b.companyId) ?? byCompany.set(b.companyId, []).get(b.companyId)!).push(b);
    (byCity.get(b.cityId) ?? byCity.set(b.cityId, []).get(b.cityId)!).push(b);
  }
  return {
    byCompany, byCity,
    products: new Map(state.products.map(p => [p.id, p])),
    cities: new Map(state.cities.map(c => [c.id, c])),
  };
}

// Household income segmentation and discretionary budgets — see consumers.ts.
export { updateHouseholdBudgets } from './consumers';

// ============================ MAIN TICK ============================
export function tick(state: GameState) {
  state.tick++;
  advanceClock(state);
  const idx = buildIndex(state);

  simulateBuildings(state, idx);
  simulateCompanies(state, idx);
  simulateFreight(state);
  simulatePipeline(state);
  simulateAgents(state);

  if (state.tick % 4 === 0) simulateStockMarket(state);
  if (state.tick % 6 === 0) simulateAssetPrices(state);
  // Monetary layer: central bank balance sheet, CPI decomposition, energy.
  runCentralBank(state);
  updateCpiBreakdown(state);
  simulateEnergyMarket(state);
  simulatePortShipments(state);
  if (state.hour === 0) onNewDay(state, idx);
  if (state.hour === 0 && state.day === 1) onNewMonth(state, idx);
  if (state.hour === 0 && state.day === 1 && state.month === 1) onNewYear(state);
}

function advanceClock(state: GameState) {
  state.hour = (state.hour + 1) % 24;
  if (state.hour === 0) {
    state.day++;
    state.dayOfYear = (state.dayOfYear + 1) % 360;
    if (state.day > 30) { state.day = 1; state.month++; }
    if (state.month > 12) { state.month = 1; state.year++; }
  }
  state.timeOfDay = state.hour / 24;
  const m = state.month;
  state.season = m <= 2 || m === 12 ? 'winter' : m <= 5 ? 'spring' : m <= 8 ? 'summer' : 'autumn';
}

// ============================ BUILDINGS ============================
const DAYPART = (hour: number, type: BuildingType) => {
  if (type === 'cafe') return hour >= 6 && hour <= 10 ? 1.9 : hour <= 14 ? 1.1 : hour <= 18 ? 0.55 : 0.08;
  if (type === 'fast_food') return hour >= 11 && hour <= 14 ? 1.8 : hour >= 17 && hour <= 21 ? 1.35 : hour >= 8 ? 0.7 : 0.12;
  if (type === 'restaurant') return hour >= 18 && hour <= 22 ? 2.0 : hour >= 12 && hour <= 14 ? 1.0 : hour >= 10 ? 0.32 : 0.05;
  if (type === 'bar') return hour >= 19 || hour <= 1 ? 1.85 : hour >= 16 ? 0.7 : 0.06;
  if (type === 'retail_store') return hour >= 9 && hour <= 20 ? 1.15 : hour >= 7 ? 0.5 : 0.05;
  return hour >= 6 && hour <= 22 ? 1 : 0.45;
};

const locCache = new Map<string, { tick: number; v: number }>();

function locationScore(b: Building, city: City, idx: Index, tick = 0): number {
  const cached = locCache.get(b.id);
  if (cached && tick - cached.tick < 24) return cached.v;
  const v = computeLocationScore(b, city, idx);
  locCache.set(b.id, { tick, v });
  return v;
}

function computeLocationScore(b: Building, city: City, idx: Index): number {
  const d = Math.hypot(b.x - city.x, b.y - city.y);
  const centrality = Math.max(0.35, 1.25 - d / Math.max(6, city.radius));
  const near = (idx.byCity.get(city.id) ?? []).filter(o =>
    o.id !== b.id && Math.abs(o.x - b.x) < 6 && Math.abs(o.y - b.y) < 6);
  const draw = Math.min(0.55, near.filter(o => o.type === 'apartment').length * 0.05
    + near.filter(o => o.type === 'office').length * 0.045
    + near.filter(o => o.type === 'retail_store').length * 0.02);
  const rivals = near.filter(o => o.type === b.type && o.companyId !== b.companyId).length;
  return centrality * (1 + draw) / (1 + rivals * 0.22);
}

function simulateBuildings(state: GameState, idx: Index) {
  const eco = state.economy;
  for (const b of state.buildings) {
    b.revenue = 0; b.cogs = 0; b.operatingCost = 0; b.profit = 0;
    if (b.constructionEndsTick > state.tick) continue;
    const city = idx.cities.get(b.cityId);
    if (!city) continue;
    if (!b.isOperating) continue;

    // Striking workers halt output but still draw part of payroll.
    if (b.strikeTicks > 0) {
      b.strikeTicks--;
      b.operatingCost = b.employees * (b.wagePerEmployee / 2080) / 8;
      b.profit = -b.operatingCost;
      b.utilization = 0;
      if (b.strikeTicks === 0 && b.companyId === state.playerCompanyId) {
        notify(state, `The strike at ${b.name} has ended. Operations are resuming.`, 'success');
      }
      continue;
    }

    const staffing = b.targetEmployees > 0 ? Math.min(1.15, b.employees / b.targetEmployees) : 1;
    const wageHourly = b.employees * (b.wagePerEmployee / 2080) / 4.16; // 173 paid hours per month
    const skillFactor = 0.72 + (b.staffSkill / 10) * 0.45;
    const conditionFactor = 0.6 + (b.condition / 100) * 0.4;

    // ---- costs common to all assets ----
    const value = b.constructionCost + b.landValue;
    const perHourYear = 1 / (365 * 24);
    const costs = b.costs;
    costs.wages = wageHourly;
    costs.payrollTax = wageHourly * 0.28;
    costs.utilities = (b.employees * 130 + b.capacity * (isProducer(b.type) ? 0.42 : 0.1)) / 720;
    costs.marketing = b.adBudget / 720;
    costs.maintenance = value * 0.012 * perHourYear;
    costs.insurance = value * (isProducer(b.type) ? 0.008 : 0.0035) * perHourYear;
    costs.propertyTax = value * eco.propertyTaxRate * perHourYear;
    costs.other = (b.type === 'bar' || b.type === 'restaurant' ? 420 : 120) / 720
      + wageHourly * b.trainingBudget * 0.16;
    costs.freight = 0;

    // ================== PRODUCERS ==================
    if (isProducer(b.type)) {
      const product = b.productId ? idx.products.get(b.productId) : null;
      if (product) {
        // Throughput scales inversely with unit value: a plant moves far fewer
        // smartphones per day than tonnes of steel, and a farm fewer cattle
        // than bushels of grain. Keeps every product line economically viable.
        const refCost = b.type === 'factory' ? 45 : b.type === 'mine' ? 12 : 6;
        const baseRate = b.type === 'factory' ? b.capacity / 3
          : b.type === 'farm' ? b.capacity * 1.6 : b.capacity * 0.6;
        const perDay = baseRate * Math.min(3, refCost / Math.max(refCost * 0.4, product.productionCost));
        let rate = (perDay / 24) * skillFactor * conditionFactor * staffing * (0.55 + b.level * 0.15);

        if (b.type === 'farm') {
          const livestock = product.name === 'Livestock' || product.name === 'Milk';
          const day = state.dayOfYear;
          b.growthStage = livestock ? 'growing'
            : day < 90 ? 'planting' : day < 200 ? 'growing' : day < 280 ? 'harvest' : 'dormant';
          const seasonMul = livestock ? (state.season === 'winter' ? 0.75 : 0.95)
            : b.growthStage === 'harvest' ? 2.6 : b.growthStage === 'growing' ? 0.25 : 0.05;
          const weather = 1 + Math.sin((state.year * 3 + state.month) * 1.7) * 0.18 * (1 - b.irrigation * 0.7);
          rate *= seasonMul * weather * (b.soilHealth / 100);
          if (state.hour === 3) {
            b.soilHealth = b.growthStage === 'dormant'
              ? Math.min(100, b.soilHealth + 0.12)
              : Math.max(38, b.soilHealth - 0.05 * (1 - b.irrigation * 0.4));
          }
          costs.other += b.irrigation * b.capacity * 0.004;
        }
        if (b.type === 'mine') {
          const depletion = b.resourceMax > 0 ? Math.max(0.12, b.resourceRemaining / b.resourceMax) : 1;
          rate *= 0.45 + depletion * 0.75;
        }

        // input constraint for factories
        let inputCostPerUnit = 0;
        if (b.type === 'factory' && product.inputs.length > 0) {
          let readiness = 1;
          for (const inp of product.inputs) {
            const have = b.inventory[inp.productId] ?? 0;
            const need = inp.quantity * rate;
            readiness = Math.min(readiness, need > 0 ? Math.min(1, have / need) : 1);
            const src = idx.products.get(inp.productId);
            inputCostPerUnit += inp.quantity * (src?.currentPrice ?? 0);
          }
          rate *= readiness;
          for (const inp of product.inputs) {
            b.inventory[inp.productId] = Math.max(0, (b.inventory[inp.productId] ?? 0) - inp.quantity * rate);
          }
          if (readiness < 0.25 && state.hour === 9 && b.companyId === state.playerCompanyId) {
            notify(state, `${b.name} is starved of inputs — production down to ${Math.round(readiness * 100)}%.`, 'warning');
          }
        }

        // Farm depth: breed, feed, veterinary programme, tier and capital.
        let priceMul = 1;
        if (b.type === 'farm') {
          const m = farmModifiers(b, product.name);
          rate *= m.yieldMul;
          priceMul = m.priceMul;
          costs.other += (b.capacity * 0.05 * b.feedQuality + b.employees * 6 * b.vetProgram
            + b.farmEquipmentLevel * 900 + b.farmTechniqueLevel * 500) * m.costMul / 720;
          if (b.diseaseTicks > 0) { b.diseaseTicks--; rate *= 0.22; }
          else if (b.vetProgram === 0 && Math.random() < 0.000012) {
            b.diseaseTicks = 24 * 18;
            if (b.companyId === state.playerCompanyId) {
              notify(state, `Disease outbreak at ${b.name} — yield down 78% for 18 days. Fund a vet programme.`, 'danger');
            }
          }
        }
        // Carbon pricing on industrial output.
        const carbon = eco.carbonTaxPerUnit * (b.type === 'factory' ? 1 : b.type === 'mine' ? 0.85 : 0.3);
        if (carbon > 0) costs.other += rate * carbon;

        b.lastUnitsProduced = rate;
        if (b.type === 'mine') {
          b.resourceRemaining = Math.max(0, b.resourceRemaining - rate);
          if (b.resourceRemaining <= 0 && b.isOperating) {
            b.isOperating = false;
            notify(state, `${b.name} has exhausted its reserve and shut down.`, 'warning');
          }
        }
        city.pollution = Math.min(160, city.pollution + rate * 0.0009 * (b.type === 'mine' ? 1.5 : b.type === 'factory' ? 1.2 : 0.3));

        // Sell to market with price elasticity
        const onHand = (b.inventory[product.id] ?? 0) + rate;
        // Rushing the line lifts output but degrades quality; live patents
        // support a premium that decays to nothing at expiry.
        const rush = rushPenalty(b);
        rate *= rush.output;
        product.quality = Math.max(1, Math.min(100, product.quality * (0.999 + (rush.quality - 1) * 0.002)));
        const patent = patentPremium(state, b.companyId, product.id);
        const spot = product.currentPrice * b.pricingMultiplier * priceMul * b.sellPriceMultiplier * patent;
        const elasticity = Math.pow(Math.max(0.35, b.pricingMultiplier), -1.5);
        const glut = Math.min(2.2, product.worldSupply / Math.max(1, product.worldDemand));
        // Internal-sale plants withhold output from the open market entirely.
        const absorb = b.internalSale ? 0 : rate * 1.15 * elasticity / glut / Math.max(0.5, b.sellPriceMultiplier);
        const sold = Math.min(onHand, absorb);
        b.inventory[product.id] = Math.min(b.inventoryCapacity, onHand - sold);
        b.lastUnitsSold = sold;
        b.revenue = sold * spot;
        b.cogs = sold * (b.type === 'factory' ? inputCostPerUnit * 0.92 : product.productionCost * 0.35);
        b.utilization = Math.min(100, (rate / Math.max(0.001, perDay / 24)) * 100);
        product.worldSupply += rate * 0.02;
      }
    }

    // ================== RETAIL ==================
    else if (b.type === 'retail_store') {
      const lines = b.products.map(id => idx.products.get(id)).filter(Boolean) as Product[];
      const loc = locationScore(b, city, idx, state.tick);
      const traffic = Math.min(100, city.trafficLevel * loc * 0.9 + b.brandEquity * 0.25);
      b.customerTraffic = traffic;
      const service = 0.72 + (b.morale / 100) * 0.2 + (b.staffSkill / 10) * 0.18;
      let rev = 0, cost = 0, sold = 0;
      // Behavioural demand stack: logistic price response, anchoring, scarcity,
      // social proof, impulse, bulk buying, income fit and search friction.
      const isDaytime = state.hour >= 8 && state.hour <= 20;
      const outletsInCity = (idx.byCity.get(city.id) ?? []).length;
      const carrying = (idx.byCity.get(city.id) ?? []).filter(x => x.products.length > 0).length;
      for (const line of lines) {
        const price = line.retailPrice * b.pricingMultiplier;
        const desired = retailDemand(city, line, b, traffic, eco.consumerConfidence,
          isDaytime, outletsInCity, carrying)
          * loc * service * staffing * DAYPART(state.hour, b.type)
          * (1 + b.brandEquity / 260) * (0.6 + city.population / 90_000)
          * productRating(line, b.pricingMultiplier) / 45
          * scarcityMultiplier(b.inventory[line.id] ?? 0, b.capacity / 200);
        // The first price a shopper sees becomes the anchor for this line.
        if (b.anchorPrice <= 0) b.anchorPrice = price;
        b.anchorPrice = b.anchorPrice * 0.999 + price * 0.001;
        const stock = b.inventory[line.id] ?? 0;
        const units = Math.max(0, Math.min(desired, stock));
        updateSocialProof(b, units, Math.max(1, desired));
        if (units > 0) {
          b.inventory[line.id] = stock - units;
          rev += units * price;
          cost += units * (line.currentPrice * 1.02);
          sold += units;
          b.loyalty = Math.min(1, b.loyalty + 0.00012);
          b.loyalCustomerBase = Math.min(0.6, b.loyalCustomerBase + 0.00004);
        } else if (stock <= 0) {
          b.loyalty = Math.max(0, b.loyalty - 0.0006);
          if (state.hour === 12 && b.companyId === state.playerCompanyId && Math.random() < 0.08) {
            notify(state, `${b.name} is out of stock on ${line.name} — sales are being lost.`, 'warning');
          }
        }
        line.worldDemand += units * 0.02;
      }
      b.revenue = rev; b.cogs = cost; b.lastUnitsSold = sold;
      b.utilization = Math.min(100, sold / Math.max(0.001, b.capacity / 8 / 24) * 100);
      b.brandEquity = Math.max(0, Math.min(100, b.brandEquity * 0.9998 + (b.adBudget / 720) * 0.00006));
    }

    // ================== HOSPITALITY ==================
    else if (isHospitality(b.type)) {
      const loc = locationScore(b, city, idx, state.tick);
      const ticket = (VENUE_TICKET[b.type] ?? 12) * b.pricingMultiplier;
      const elasticity = b.type === 'fast_food' ? 1.5 : b.type === 'cafe' ? 1.25 : b.type === 'bar' ? 0.95 : 0.8;
      const conf = eco.consumerConfidence / 100;
      const service = 0.7 + (b.morale / 100) * 0.25 + (b.staffSkill / 10) * 0.2;
      let covers = (b.capacity / 24) * DAYPART(state.hour, b.type) * loc * conf * service * staffing
        * Math.pow(Math.max(0.4, b.pricingMultiplier), -elasticity)
        * (1 + b.brandEquity / 300) * (0.7 + city.population / 110_000);

      const ings = (VENUE_INGREDIENTS[b.type] ?? []).map(n => state.products.find(p => p.name === n)).filter(Boolean) as Product[];
      let ready = 1;
      if (ings.length) {
        const inStock = ings.filter(i => (b.inventory[i.id] ?? 0) > 0.5).length;
        ready = inStock / ings.length;
        covers *= ready;
        if (ready === 0 && state.hour === 12 && b.companyId === state.playerCompanyId && Math.random() < 0.1) {
          notify(state, `${b.name} has no ingredients — the kitchen is closed.`, 'danger');
        }
      }
      let food = 0;
      const foodFactor = VENUE_FOOD_FACTOR[b.type] ?? 0.15;
      for (const ing of ings) {
        const used = covers * foodFactor / Math.max(1, ings.length);
        b.inventory[ing.id] = Math.max(0, (b.inventory[ing.id] ?? 0) - used);
        food += used * ing.currentPrice;
      }
      b.revenue = covers * ticket;
      b.cogs = food;
      b.lastUnitsSold = covers;
      b.customerTraffic = Math.min(100, loc * 60);
      b.utilization = Math.min(100, covers / Math.max(0.001, b.capacity / 24) * 100);
      b.brandEquity = Math.max(0, Math.min(100, b.brandEquity * 0.9998 + (b.adBudget / 720) * 0.00007));
    }

    // ================== PROPERTY ==================
    else if (isProperty(b.type)) {
      const capRate = b.type === 'apartment'
        ? 0.052 + (city.qualityOfLife / 100) * 0.012
        : 0.048 + (city.wageRate / 40) * 0.015;
      const market = value * capRate / 12 / Math.max(1, b.capacity);
      b.rentPerUnit = Math.max(120, market * b.rentMultiplier);
      const affordability = Math.max(0.15, 1.35 - b.rentMultiplier * 0.55);
      const demandDriver = b.type === 'apartment'
        ? (0.35 + Math.max(0, -city.housingDemand) / 130 + (1 - city.unemploymentRate / 100) * 0.35)
        : (0.3 + eco.businessConfidence / 160);
      const loc = locationScore(b, city, idx, state.tick);
      const quality = 0.55 + (b.level / b.maxLevel) * 0.25 + (b.condition / 100) * 0.2;
      const target = Math.round(b.capacity * Math.min(1, demandDriver * affordability * quality * Math.min(1.25, loc)));
      if (state.hour === 6) {
        if (b.tenants < target) b.tenants = Math.min(b.capacity, b.tenants + Math.max(1, Math.round((target - b.tenants) * 0.06)));
        else if (b.tenants > target + 2) b.tenants = Math.max(0, b.tenants - 1);
      }
      b.occupancy = b.capacity > 0 ? (b.tenants / b.capacity) * 100 : 0;
      b.utilization = b.occupancy;
      b.revenue = (b.rentPerUnit * b.tenants) / 720;
      costs.utilities = (b.tenants * 48) / 720;
      b.landValue *= 1 + (eco.inflation + eco.gdpGrowth * 0.4) / 100 / (365 * 24);
    }

    // ================== WAREHOUSE ==================
    else if (b.type === 'warehouse') {
      const stored = Object.values(b.inventory).reduce((s, v) => s + v, 0);
      b.utilization = Math.min(100, (stored / b.inventoryCapacity) * 100);
      b.revenue = 0;
    }

    // ================== HQ / LAB / PORT ==================
    else if (b.type === 'hq' || b.type === 'lab') {
      b.utilization = b.employees > 0 ? 78 + b.staffSkill * 2 : 0;
      if (b.employees === 0) { costs.wages = 0; costs.payrollTax = 0; costs.utilities *= 0.3; }
    } else if (b.type === 'seaport') {
      const stored = Object.values(b.inventory).reduce((s, v) => s + v, 0);
      b.utilization = Math.min(100, (stored / b.inventoryCapacity) * 100);
    }

    // Contract-based replenishment through the processing → transit pipeline.
    if ((b.type === 'retail_store' || isHospitality(b.type) || b.type === 'factory' || b.type === 'warehouse')
      && b.autoRestock && b.companyId !== 'system' && (state.tick + b.x) % 8 === 0) {
      runProcurement(state, b);
    }

    // HQ group productivity bonus
    if (b.type !== 'hq') {
      const hqBoost = (idx.byCompany.get(b.companyId) ?? [])
        .filter(h => h.type === 'hq' && h.employees > 0)
        .reduce((s, h) => s + h.employees * h.staffSkill * 0.0006, 0);
      b.revenue *= 1 + Math.min(0.35, hqBoost);
    }

    b.operatingCost = costs.wages + costs.payrollTax + costs.utilities + costs.marketing
      + costs.maintenance + costs.insurance + costs.propertyTax + costs.freight + costs.other;
    b.profit = b.revenue - b.cogs - b.operatingCost;

    // condition, morale, training
    b.condition = Math.max(12, b.condition - 0.0006 * (isProducer(b.type) ? 1.6 : 1));
    const overwork = Math.max(0, b.utilization - 88) / 100;
    const moraleTarget = Math.max(8, Math.min(100,
      52 + (b.trainingBudget - 0.3) * 55 + b.staffSkill * 2.6 - overwork * 80 + (b.condition - 60) * 0.12
      + (b.wagePerEmployee / Math.max(1, city.wageRate * 2080) - 1) * 60));
    b.morale += (moraleTarget - b.morale) * 0.004;
    if (state.hour === 4) {
      b.staffSkill = Math.min(10, b.staffSkill + b.trainingBudget * 0.004 * (b.employees > 0 ? 1 : 0));
    }

    b.revenueAccum += b.revenue; b.profitAccum += b.profit;
    b.producedAccum += b.lastUnitsProduced; b.soldAccum += b.lastUnitsSold;
  }
}

// ============================ PROCUREMENT ============================
function procure(state: GameState, b: Building, idx: Index) {
  const owner = state.companies.find(c => c.id === b.companyId);
  if (!owner && b.companyId !== 'system') return;
  const needs: string[] = b.type === 'factory'
    ? (idx.products.get(b.productId ?? '')?.inputs.map(i => i.productId) ?? [])
    : b.type === 'warehouse' ? b.products
    : b.products;
  if (!needs.length) return;

  for (const pid of needs) {
    const product = idx.products.get(pid);
    if (!product) continue;
    const perLineCap = b.inventoryCapacity / Math.max(1, needs.length);
    const have = b.inventory[pid] ?? 0;
    if (have > perLineCap * 0.35) continue;
    const orderQty = Math.round(perLineCap * 0.55 - have);
    if (orderQty <= 0) continue;

    // choose a source: own producer/warehouse with stock, else nearest seaport
    const own = (idx.byCompany.get(b.companyId) ?? []).filter(s =>
      s.id !== b.id && (s.inventory[pid] ?? 0) > orderQty * 0.5
      && (isProducer(s.type) || s.type === 'warehouse'));
    const ports = state.buildings.filter(s => s.type === 'seaport' && (s.inventory[pid] ?? 0) > orderQty * 0.5);
    const candidates = [...own, ...ports];
    if (!candidates.length) continue;
    candidates.sort((a, c) =>
      (Math.hypot(a.x - b.x, a.y - b.y) + (a.type === 'seaport' ? 12 : 0))
      - (Math.hypot(c.x - b.x, c.y - b.y) + (c.type === 'seaport' ? 12 : 0)));
    const src = candidates[0];
    const dist = Math.hypot(src.x - b.x, src.y - b.y);
    const internal = src.companyId === b.companyId && b.companyId !== 'system';
    const unitPrice = internal ? product.productionCost * 1.02
      : product.currentPrice * (src.type === 'seaport' ? 1.12 : 1.08);
    const freightPerUnit = dist * 0.012 * (state.economy.dieselPrice / 3.35);
    // Goods are capitalised into inventory here; the cash cost is recognised
    // as COGS when the units are actually sold or consumed downstream.
    if (owner && owner.cash < 0 && !internal) continue;

    src.inventory[pid] = Math.max(0, (src.inventory[pid] ?? 0) - orderQty);
    if (owner && !internal && src.type !== 'seaport') {
      const seller = state.companies.find(c => c.id === src.companyId);
      if (seller && seller.id !== owner.id) { seller.cash += orderQty * unitPrice; seller.revenueAccum += orderQty * unitPrice; }
    }
    b.costs.freight += orderQty * freightPerUnit / 24;

    state.freight.push({
      id: uid('f'), fromX: src.x, fromY: src.y, toX: b.x, toY: b.y,
      progress: 0, speed: Math.max(0.004, 0.09 / Math.max(2, dist)),
      productId: pid, amount: orderQty,
      companyColor: owner?.color ?? '#94a3b8',
      toBuildingId: b.id, unitCost: unitPrice + freightPerUnit,
    });
    product.worldDemand += orderQty * 0.01;
    break; // one order per cycle keeps trucks readable
  }
}

function simulateFreight(state: GameState) {
  const done: string[] = [];
  for (const f of state.freight) {
    f.progress = Math.min(1, f.progress + f.speed);
    if (f.progress >= 1) {
      const dest = state.buildings.find(b => b.id === f.toBuildingId);
      if (dest) dest.inventory[f.productId] = Math.min(dest.inventoryCapacity, (dest.inventory[f.productId] ?? 0) + f.amount);
      done.push(f.id);
    }
  }
  if (done.length) state.freight = state.freight.filter(f => !done.includes(f.id));
  if (state.freight.length > 160) state.freight.splice(0, state.freight.length - 160);
}

/** Street traffic and pavement pedestrians — see entities.ts. */
function simulateAgents(state: GameState) {
  const active = state.timeOfDay > 0.25 && state.timeOfDay < 0.92 ? 1 : 0.35;
  updateEntities(state, Math.random, active);
}

// ============================ COMPANIES ============================
function simulateCompanies(state: GameState, idx: Index) {
  let gross = 0;
  for (const co of state.companies) {
    const bs = idx.byCompany.get(co.id) ?? [];
    let rev = 0, exp = 0, book = 0;
    for (const b of bs) {
      book += b.constructionCost + b.landValue;
      if (b.isOperating && b.constructionEndsTick <= state.tick) {
        rev += b.revenue; exp += b.operatingCost + b.cogs;
      }
    }
    const interest = (co.debt * co.interestRate / 100) / (365 * 24);
    exp += interest;
    co.revenue = rev; co.expenses = exp; co.profit = rev - exp;
    co.cash += co.profit;
    co.revenueAccum += rev; co.profitAccum += co.profit;
    co.pretaxYTD += co.profit;
    const equity = Object.entries(co.equityHoldings).reduce((s, [id, sh]) => {
      const t = state.companies.find(c => c.id === id);
      return s + (t ? t.sharePrice * sh : 0);
    }, 0);
    co.totalAssets = co.cash + book + equity;
    co.marketCap = co.sharePrice * co.sharesOutstanding;
  }
  for (const b of state.buildings) {
    if (b.companyId === 'system' || !b.isOperating) continue;
    const va = b.revenue - b.cogs;
    if (va > 0) gross += va;
  }
  state.economy.nominalGdp = state.economy.nominalGdp * 0.995 + gross * 24 * 365 * 0.005;
}

// ============================ STOCK MARKET ============================
function simulateStockMarket(state: GameState) {
  const sm = state.stockMarket, eco = state.economy;
  const drift = eco.gdpGrowth * 0.00018 + (eco.consumerConfidence - 50) * 0.000025 - (eco.interestRate - 4) * 0.00008;
  sm.index = Math.max(1500, sm.index * (1 + drift) + (Math.random() - 0.5) * sm.index * 0.0016);
  sm.sentiment = eco.consumerConfidence > 66 ? 'bullish' : eco.consumerConfidence < 42 ? 'bearish' : 'neutral';

  for (const co of state.companies) {
    const annual = co.profit * 24 * 365;
    const bookPerShare = Math.max(0.4, (co.totalAssets - co.debt) / Math.max(1, co.sharesOutstanding));
    const multiple = sm.sentiment === 'bullish' ? 1.28 : sm.sentiment === 'bearish' ? 0.82 : 1.05;
    const earningsValue = annual > 0 ? (annual / Math.max(1, co.sharesOutstanding)) * (11 + eco.gdpGrowth) : 0;
    const target = Math.max(bookPerShare * 0.85, (bookPerShare * 0.55 + earningsValue * 0.7) * multiple);
    co.sharePrice = Math.max(0.4, co.sharePrice + (target - co.sharePrice) * 0.02 + (Math.random() - 0.5) * co.sharePrice * 0.005);
    co.marketCap = co.sharePrice * co.sharesOutstanding;
  }
}

// ============================ DAILY ============================
function onNewDay(state: GameState, idx: Index) {
  for (const b of state.buildings) {
    b.dailyRevenue = b.revenueAccum; b.dailyProfit = b.profitAccum;
    b.dailyProduced = b.producedAccum; b.dailySold = b.soldAccum;
    b.profitHistory.push(b.profitAccum);
    if (b.profitHistory.length > 60) b.profitHistory.shift();
    b.revenueAccum = 0; b.profitAccum = 0; b.producedAccum = 0; b.soldAccum = 0;
  }
  simulateCities(state, idx);
  simulateProductMarket(state);
  state.notifications = state.notifications.filter(n => state.tick - n.tick < 24 * 4);
  for (const co of state.companies) {
    co.sharePriceHistory.push(co.sharePrice);
    if (co.sharePriceHistory.length > 120) co.sharePriceHistory.shift();
  }
  state.stockMarket.indexHistory.push(state.stockMarket.index);
  if (state.stockMarket.indexHistory.length > 160) state.stockMarket.indexHistory.shift();
  const p = playerCo(state);
  state.stats.netWorthHistory.push(p.totalAssets - p.debt + playerPortfolioValue(state));
  if (state.stats.netWorthHistory.length > 180) state.stats.netWorthHistory.shift();

  // hiring: staff arrive gradually toward target
  for (const b of state.buildings) {
    if (b.constructionEndsTick > state.tick) continue;
    // Rental property is unstaffed. Maintenance and letting are bought in as
    // a service and already sit in the maintenance line of the cost ledger,
    // so an apartment block carries no payroll of its own.
    if (isProperty(b.type)) { b.employees = 0; b.targetEmployees = 0; continue; }
    const co = state.companies.find(c => c.id === b.companyId);
    if (b.employees < b.targetEmployees) {
      const canAfford = !co || co.cash > b.wagePerEmployee * 0.5;
      if (canAfford) b.employees = Math.min(b.targetEmployees, b.employees + Math.max(1, Math.round(b.targetEmployees * 0.12)));
    } else if (b.employees > b.targetEmployees) {
      b.employees = Math.max(b.targetEmployees, b.employees - Math.max(1, Math.round(b.employees * 0.1)));
    }
  }
}

function simulateCities(state: GameState, idx: Index) {
  for (const c of state.cities) {
    const bs = idx.byCity.get(c.id) ?? [];
    const jobs = c.backgroundJobs + bs.reduce((s, b) => s + b.employees, 0);
    const housing = c.backgroundHousing + bs.filter(b => b.type === 'apartment').reduce((s, b) => s + b.capacity, 0);
    const labour = c.population * 0.48;
    const shortfall = Math.max(0, labour - jobs) / Math.max(1, labour) * 100;
    const cyc = state.economy.cycle === 'recession' ? 3.2 : state.economy.cycle === 'boom' ? -1.2 : 0;
    const targetU = Math.max(2, Math.min(26, 3 + shortfall * 0.8 + cyc));
    c.unemploymentRate += (targetU - c.unemploymentRate) * 0.05;

    const housed = housing * 2.4;
    c.housingDemand = Math.max(-100, Math.min(100, (housed - c.population) / Math.max(1, c.population) * 100));
    c.qualityOfLife = Math.max(15, Math.min(100,
      54 - c.unemploymentRate * 1.5 - Math.max(0, c.pollution - 25) * 0.4
      + bs.filter(b => b.type === 'retail_store' || isHospitality(b.type)).length * 0.35));
    c.trafficLevel = Math.max(12, Math.min(100, 26 + bs.length * 1.1 + Math.min(38, c.population / 3200)));
    c.pollution = Math.max(3, c.pollution - 0.05);

    const nationalWage = state.cities.reduce((s, x) => s + x.wageRate, 0) / state.cities.length;
    const wagePull = (c.wageRate / nationalWage - 1) * 20;
    const jobPull = (6 - c.unemploymentRate) * 1.6;
    const amenity = (c.qualityOfLife - 52) * 0.16;
    const crowding = c.housingDemand < -25 ? c.housingDemand * 0.12 : 0;
    c.netMigrationRate = wagePull + jobPull + amenity + crowding;
    c.birthRate = Math.max(7, Math.min(24, 16.5 - c.wageRate / 12 - c.educationIndex / 28 + c.familyShare * 6));
    c.deathRate = Math.max(5, Math.min(15, 5 + Math.max(0, c.medianAge - 28) * 0.3 + Math.max(0, c.pollution - 30) * 0.02));

    const perDay = 1 / 365;
    const delta = c.population * ((c.birthRate - c.deathRate + c.netMigrationRate) / 1000) * perDay;
    c.population = Math.max(2000, Math.round(c.population + delta));
    c.wageRate *= 1 + (state.economy.inflation / 100 + Math.max(0, (5 - c.unemploymentRate)) * 0.004) / 365;
    c.gdpPerCapita *= 1 + (state.economy.gdpGrowth + state.economy.inflation) / 100 / 365;
    if (state.day === 1) {
      c.populationHistory.push(c.population);
      if (c.populationHistory.length > 120) c.populationHistory.shift();
    }
  }
  state.economy.unemployment = state.cities.reduce((s, c) => s + c.unemploymentRate, 0) / state.cities.length;
}

function simulateProductMarket(state: GameState) {
  for (const p of state.products) {
    // supply/demand pressure moves the clearing price
    const ratio = p.worldSupply / Math.max(1, p.worldDemand);
    const pressure = Math.max(0.75, Math.min(1.3, 1 / Math.pow(ratio, 0.35)));
    const inflationDrift = 1 + state.economy.inflation / 100 / 365;
    let baseline = p.productionCost * (p.kind === 'consumer' ? 1.45 : p.kind === 'semi' ? 1.35 : 1.28);
    if (p.kind === 'raw' || p.kind === 'farm') baseline *= (0.9 + state.economy.dieselPrice / 3.35 * 0.12);
    const target = baseline * pressure;
    p.currentPrice += (target - p.currentPrice) * 0.06;
    p.currentPrice *= inflationDrift;
    p.retailPrice = p.currentPrice * (p.kind === 'consumer' ? 1.55 : 1.15);
    p.productionCost *= inflationDrift;
    p.marketDemand = Math.max(5, Math.min(100, p.demandIndex * 0.6 + state.economy.consumerConfidence * 0.45));
    // decay accumulators toward equilibrium
    p.worldSupply = p.worldSupply * 0.94 + 60;
    p.worldDemand = p.worldDemand * 0.94 + 60;
    p.priceHistory.push(p.currentPrice);
    if (p.priceHistory.length > 90) p.priceHistory.shift();
  }
}

// ============================ MONTHLY ============================
function onNewMonth(state: GameState, idx: Index) {
  simulateEconomy(state);
  simulatePolitics(state);
  simulateBanking(state);
  simulateHouseholds(state);
  simulateEnvironment(state);
  simulateLabour(state);
  simulateAIBehaviours(state);
  simulateHerding(state);
  simulateLandMarket(state);
  serviceTenure(state);
  updateHouseholdBudgets(state);
  payLoans(state);
  collectPropertyTax(state);
  if (state.month % 6 === 0) simulateAntitrust(state);

  // ── Fiscal, monetary and household layers ──
  runFiscalBudget(state);
  updateWageSpiral(state);
  updateMoneySupply(state);
  replenishSeaports(state);
  if (state.month % 3 === 0) payDividends(state);

  // ── Institutions: trade, competition, supplier health, ratings, treasury ──
  simulateGovernment(state);
  simulateTrade(state);
  simulateCartels(state);
  simulatePredatoryPricing(state);
  simulateSupplierFailures(state);
  reviewCreditRatings(state);
  simulateAiCapitalAllocation(state);
  payCoupons(state);
  // Distressed firms that survived three months are liquidated messily.
  for (const co of state.companies) {
    if (co.isPlayer || co.monthsInDistress <= 3 || co.cash > 0) continue;
    const recovered = messyLiquidation(state, co);
    news(state, `${co.name} enters liquidation — assets sold to creditors`, 'breaking');
    co.cash += recovered;
    co.monthsInDistress = 0;
  }
  // Skill converges toward the funded training level over months, not instantly.
  for (const b of state.buildings) updateEffectiveTraining(b);

  runAI(state, idx);
  generateOffers(state);
  restockPorts(state);
  advanceResearch(state);
  revalue(state);

  for (const co of state.companies) {
    co.monthlyRevenue = co.revenueAccum; co.monthlyProfit = co.profitAccum;
    co.profitHistory.push(co.profitAccum);
    if (co.profitHistory.length > 48) co.profitHistory.shift();
    co.revenueAccum = 0; co.profitAccum = 0;
    if (!co.isPlayer && co.profit > 0 && co.dividendPayout > 0) {
      co.cash -= Math.max(0, co.monthlyProfit * co.dividendPayout / 100);
    }
  }

  const p = playerCo(state);
  if (p.cash < 0) {
    p.monthsInDistress++;
    if (p.monthsInDistress === 1) notify(state, 'Cash balance is negative. Secure funding within 3 months or assets will be liquidated.', 'danger');
    if (p.monthsInDistress >= 4) forceLiquidate(state, p);
  } else p.monthsInDistress = 0;

  const eco = state.economy;
  news(state, `${monthName(state.month)} data: GDP ${eco.gdpGrowth.toFixed(1)}%, CPI ${eco.inflation.toFixed(1)}%, unemployment ${eco.unemployment.toFixed(1)}%`,
    eco.cycle === 'recession' ? 'warning' : 'info');
}

function monthName(m: number) {
  return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1];
}

function simulateEconomy(state: GameState) {
  const eco = state.economy;
  eco.cycleMonth++;
  let next = eco.cycle;
  if (eco.cycleMonth > 9) {
    if (eco.cycle === 'boom' && (eco.inflation > 6 || eco.interestRate > 8)) next = 'recession';
    else if (eco.cycle === 'growth' && eco.gdpGrowth > 4.2 && eco.unemployment < 4.6) next = 'boom';
    else if (eco.cycle === 'growth' && eco.gdpGrowth < 0.4) next = 'recession';
    else if (eco.cycle === 'recession' && (eco.interestRate < 3 && eco.cycleMonth > 12)) next = 'recovery';
    else if (eco.cycle === 'recovery' && eco.gdpGrowth > 2.2) next = 'growth';
    if (eco.cycleMonth > 54) next = eco.cycle === 'recession' ? 'recovery' : 'growth';
  }
  if (next !== eco.cycle) {
    eco.cycle = next; eco.cycleMonth = 0;
    notify(state, `The economy is entering a ${next} phase.`, next === 'recession' ? 'warning' : 'success');
    news(state, `ECONOMY ENTERS ${next.toUpperCase()} PHASE`, next === 'recession' ? 'breaking' : 'success');
  }

  const eff: Record<string, { g: number; c: number }> = {
    boom: { g: 0.35, c: 2.2 }, growth: { g: 0.14, c: 0.7 },
    recession: { g: -0.55, c: -3.1 }, recovery: { g: 0.28, c: 1.8 },
  };
  const e = eff[eco.cycle];
  eco.gdpGrowth = Math.max(-6, Math.min(9, eco.gdpGrowth + e.g + (Math.random() - 0.5) * 0.5));
  eco.consumerConfidence = Math.max(12, Math.min(96, eco.consumerConfidence + e.c + (Math.random() - 0.5) * 2.5));
  eco.businessConfidence = Math.max(12, Math.min(96, eco.businessConfidence + e.c * 0.9 + (Math.random() - 0.5) * 2.5));

  // Phillips curve + Taylor rule
  const NAIRU = 4.6;
  const expected = eco.inflation * (1 - eco.cbCredibility * 0.6) + 2 * eco.cbCredibility * 0.6;
  const shock = eco.energyShockMonths > 0 ? 2.2 : 0;
  const phillips = expected - 0.42 * (eco.unemployment - NAIRU) + shock;
  eco.inflation += (phillips - eco.inflation) * 0.22 + (Math.random() - 0.5) * 0.18;
  eco.inflation = Math.max(-2.5, Math.min(18, eco.inflation));
  eco.cpi *= 1 + eco.inflation / 100 / 12;
  eco.purchasingPower = 10_000 / Math.max(1, eco.cpi);

  const taylor = Math.max(0.25, 2 + eco.inflation + 0.5 * (eco.inflation - 2) + 0.35 * (eco.gdpGrowth - 2.5));
  const urgency = eco.inflation > 7 ? 0.42 : eco.inflation > 4 ? 0.26 : 0.14;
  eco.interestRate = Math.max(0.1, Math.min(19, eco.interestRate + (taylor - eco.interestRate) * urgency));
  eco.tenYearYield = eco.interestRate + 0.8 + (eco.inflation - 2) * 0.25;
  eco.guidance = eco.inflation > 3.6 ? 'hawkish' : eco.inflation < 1.2 || eco.cycle === 'recession' ? 'dovish' : 'neutral';
  eco.cbCredibility = Math.max(0.2, Math.min(1, eco.cbCredibility + (Math.abs(eco.inflation - 2) < 1 ? 0.01 : -0.012)));
  eco.moneySupply *= 1 + (eco.guidance === 'dovish' ? 0.008 : eco.guidance === 'hawkish' ? -0.002 : 0.003);

  // energy shocks
  if (eco.energyShockMonths > 0) eco.energyShockMonths--;
  else if (Math.random() < 0.025) {
    eco.energyShockMonths = 3 + Math.floor(Math.random() * 6);
    eco.dieselPrice *= 1.35;
    news(state, 'OPEC supply cut sends diesel prices sharply higher — freight costs jump', 'breaking');
    notify(state, 'Energy shock: freight and utility costs are rising across your portfolio.', 'warning');
  }
  eco.dieselPrice += ((3.3 * (eco.cpi / 100)) - eco.dieselPrice) * 0.08;

  eco.history.gdp.push(eco.gdpGrowth); eco.history.inflation.push(eco.inflation);
  eco.history.rate.push(eco.interestRate); eco.history.unemployment.push(eco.unemployment);
  for (const k of ['gdp', 'inflation', 'rate', 'unemployment'] as const) {
    if (eco.history[k].length > 120) eco.history[k].shift();
  }
}

function payLoans(state: GameState) {
  const p = playerCo(state);
  for (const loan of state.loans) {
    const interest = loan.balance * (loan.rate / 100) / 12;
    const principal = Math.max(0, loan.monthlyPayment - interest);
    const pay = Math.min(loan.monthlyPayment, loan.balance + interest);
    p.cash -= pay;
    loan.balance = Math.max(0, loan.balance - principal);
    loan.monthsLeft--;
  }
  const cleared = state.loans.filter(l => l.balance <= 1 || l.monthsLeft <= 0);
  if (cleared.length) {
    for (const l of cleared) { p.debt = Math.max(0, p.debt - l.balance); notify(state, `Loan from ${l.lender} fully repaid.`, 'success'); }
    state.loans = state.loans.filter(l => l.balance > 1 && l.monthsLeft > 0);
  }
  p.debt = state.loans.reduce((s, l) => s + l.balance, 0);
}

// Property tax, corporate tax, dividends and fiscal policy — see taxation.ts.

function restockPorts(state: GameState) {
  for (const port of state.buildings.filter(b => b.type === 'seaport')) {
    for (const p of state.products) {
      port.inventory[p.id] = Math.min(60_000, (port.inventory[p.id] ?? 0) + 9_000 + Math.random() * 6_000);
    }
  }
}

function revalue(state: GameState) {
  for (const b of state.buildings) {
    const annualNOI = b.dailyProfit * 365;
    const risk = isProperty(b.type) ? 3.2 : isHospitality(b.type) ? 7.5 : isProducer(b.type) ? 6.4 : 5.2;
    const disc = Math.max(0.05, (state.economy.interestRate + risk) / 100);
    const dcf = annualNOI > 0 ? Math.min(annualNOI / disc, annualNOI * 14) : 0;
    const replacement = b.constructionCost * Math.max(0.35, b.condition / 100) * 0.72 + b.landValue;
    b.fairValue = Math.max(150_000, replacement * 0.75 + dcf * 0.55);
  }
}

function advanceResearch(state: GameState) {
  const p = playerCo(state);
  const labs = state.buildings.filter(b => b.companyId === p.id && b.type === 'lab' && b.employees > 0);
  const speed = 1 + labs.reduce((s, l) => s + l.employees * l.staffSkill * 0.004, 0);
  for (const r of state.research) {
    if (r.monthsLeft <= 0) continue;
    r.progress = Math.min(100, r.progress + (100 / Math.max(1, r.monthsLeft)) * 0.35 * speed);
    r.monthsLeft--;
    if (r.monthsLeft <= 0 || r.progress >= 100) {
      r.progress = 100; r.monthsLeft = 0;
      applyResearch(state, r.name);
      // A completed programme targets a product in its category; 30% of the
      // underlying science fails outright, and success grants a 5-year patent.
      const target = state.products.find(pr => pr.category === r.category)
        ?? state.products[Math.floor(Math.random() * state.products.length)];
      if (target) {
        if (resolveResearch(state, p.id, target.id)) {
          news(state, `${p.name} patents a breakthrough in ${target.name} — 5 years of exclusivity`, 'breaking');
        } else {
          notify(state, `The ${r.name} programme's core experiment failed replication. No patent filed.`, 'warning');
        }
      }
      notify(state, `Research complete: ${r.name} — ${r.effect}`, 'success');
      news(state, `${p.name} completes ${r.name} programme`, 'success');
    }
  }
}

function applyResearch(state: GameState, name: string) {
  const p = playerCo(state);
  const mine = state.buildings.filter(b => b.companyId === p.id);
  if (name === 'Precision Agriculture') for (const b of mine) if (b.type === 'farm') { b.capacity *= 1.12; b.soilHealth = Math.min(100, b.soilHealth + 8); }
  if (name === 'Lean Manufacturing') for (const b of mine) if (b.type === 'factory') b.capacity *= 1.08;
  if (name === 'Automation Suite') for (const b of mine) b.targetEmployees = Math.max(2, Math.round(b.targetEmployees * 0.88));
  if (name === 'Materials Science') for (const pr of state.products) pr.quality = Math.min(100, pr.quality + 4);
  if (name === 'Brand Science') for (const b of mine) b.brandEquity = Math.min(100, b.brandEquity + 12);
  if (name === 'Cold Chain Logistics') for (const b of mine) b.inventoryCapacity *= 1.15;
}

function onNewYear(state: GameState) {
  // Bond market: mark to market, then settle matured issues.
  markToMarket(state);
  settleBonds(state);
  simulatePatents(state);

  // Fiscal year close: assess corporate income tax on pre-tax profit, with
  // net operating losses sheltering income before the rate applies.
  collectCorporateTax(state);
  reviewTaxPolicy(state);
  rollFiscalYear(state);
  news(state, `Fiscal year ${state.year} opens — corporate tax set at ${state.economy.corporateTaxRate.toFixed(1)}%`, 'info');
}

// ============================ AI ============================
function runAI(state: GameState, idx: Index) {
  const rand = Math.random;
  for (const co of state.companies) {
    if (co.isPlayer) continue;
    const bs = idx.byCompany.get(co.id) ?? [];

    // pricing reaction
    for (const b of bs) {
      if (b.type !== 'retail_store' && !isHospitality(b.type)) continue;
      const u = b.utilization / 100;
      if (u < 0.3) b.pricingMultiplier = Math.max(0.7, b.pricingMultiplier - 0.05);
      else if (u > 0.9) b.pricingMultiplier = Math.min(1.5, b.pricingMultiplier + 0.03);
      b.adBudget = Math.max(0, Math.min(b.dailyRevenue * 30 * 0.05, b.adBudget + (u < 0.5 ? 2000 : -1000)));
    }

    // close chronic losers
    for (const b of [...bs]) {
      if (b.type === 'hq') continue;
      if (b.dailyProfit < 0) b.monthsUnprofitable++;
      else b.monthsUnprofitable = Math.max(0, b.monthsUnprofitable - 1);
      const patience = Math.round(14 - co.acumen * 8);
      if (b.monthsUnprofitable >= patience) {
        co.cash += b.fairValue * 0.55;
        co.buildings = co.buildings.filter(id => id !== b.id);
        state.buildings = state.buildings.filter(x => x.id !== b.id);
        news(state, `${co.name} shutters a loss-making ${BUILDING_CONFIGS[b.type].name.toLowerCase()} in ${idx.cities.get(b.cityId)?.name}`, 'info');
      }
    }

    // expansion
    const distress = co.cash < 0;
    const appetite = (co.strategy === 'aggressive' ? 0.55 : co.strategy === 'conservative' ? 0.22 : 0.36) * (0.5 + co.acumen);
    if (!distress && rand() < appetite) {
      const focusTypes: Record<Company['sectorFocus'], BuildingType[]> = {
        retail: ['retail_store', 'warehouse'],
        industrial: ['factory', 'farm', 'warehouse'],
        real_estate: ['apartment', 'office'],
        hospitality: ['cafe', 'fast_food', 'restaurant', 'bar'],
        diversified: ['retail_store', 'apartment', 'cafe', 'factory', 'farm'],
      };
      const options = focusTypes[co.sectorFocus];
      const type = options[Math.floor(rand() * options.length)];
      const city = state.cities[Math.floor(rand() * state.cities.length)];
      const cost = BUILDING_CONFIGS[type].cost * city.landCostMultiplier;
      if (co.cash > cost * 1.6) {
        const spot = findFreeTile(state, city, type, rand);
        if (spot) {
          const b = createBuilding(type, co.id, city, state.products, spot.x, spot.y, state.tick);
          b.constructionEndsTick = state.tick + 72; // 3 days
          b.name = `${co.name.split(' ')[0]} ${BUILDING_CONFIGS[type].name}`;
          co.cash -= cost;
          state.buildings.push(b);
          co.buildings.push(b.id);
          if (rand() < 0.4) news(state, `${co.name} breaks ground on a new ${BUILDING_CONFIGS[type].name.toLowerCase()} in ${city.name}`, 'info');
        }
      }
    }

    // Opportunistic acquisitions of listed stock. AI boards only consider
    // a player listing if (a) it matches a type the AI is already expanding
    // into and (b) it is at least 5% below fair value — otherwise the AI
    // would rather build a new one for the same price. The threshold is
    // intentional: this is a real-world M&A pattern ("buy a competitor for
    // 90 cents on the dollar when the right deal comes along").
    if (!distress && co.acumen > 0.55 && rand() < 0.18) {
      const focusList: Record<Company['sectorFocus'], BuildingType[]> = {
        retail: ['retail_store', 'warehouse'],
        industrial: ['factory', 'farm', 'warehouse'],
        real_estate: ['apartment', 'office'],
        hospitality: ['cafe', 'fast_food', 'restaurant', 'bar'],
        diversified: ['retail_store', 'apartment', 'cafe', 'factory', 'farm'],
      };
      const eligible = focusList[co.sectorFocus];
      const bargains = state.buildings.filter(b => b.forSale && b.companyId !== co.id
        && b.askingPrice > 0 && b.askingPrice <= b.fairValue
        && b.askingPrice >= 25_000
        && co.cash > b.askingPrice * 1.3
        && eligible.includes(b.type));
      if (bargains.length) {
        const t = bargains[Math.floor(rand() * bargains.length)];
        const seller = state.companies.find(c => c.id === t.companyId);
        co.cash -= t.askingPrice;
        if (seller) { seller.cash += t.askingPrice; seller.buildings = seller.buildings.filter(i => i !== t.id); }
        t.companyId = co.id; t.forSale = false; t.askingPrice = 0;
        co.buildings.push(t.id);
        news(state, `${co.name} acquires ${t.name}`, 'info');
      }
    }

    // deleveraging & distress
    if (co.debt > 0 && co.cash > co.debt * 0.4 && co.monthlyProfit > 0) {
      const repay = Math.min(co.debt, co.cash * 0.08);
      co.cash -= repay; co.debt -= repay;
    }
    if (co.cash < 0) {
      co.monthsInDistress++;
      if (co.monthsInDistress === 2) news(state, `${co.name} warns of a liquidity crunch`, 'warning');
      if (co.monthsInDistress >= 5) {
        const assets = state.buildings.filter(b => b.companyId === co.id);
        const recovered = assets.reduce((s, b) => s + b.fairValue * 0.42, 0);
        news(state, `${co.name} enters liquidation — creditors recover $${fmtShort(recovered)}`, 'breaking');
        notify(state, `${co.name} has collapsed. Its assets are hitting the market at distressed prices.`, 'warning');
        for (const b of assets) {
          b.companyId = 'system'; b.forSale = true;
          b.askingPrice = Math.round(b.fairValue * 0.62);
        }
        state.companies = state.companies.filter(c => c.id !== co.id);
      }
    } else co.monthsInDistress = 0;
  }
}

function generateOffers(state: GameState) {
  state.offers = state.offers.filter(o => o.expiresTick > state.tick);
  const p = playerCo(state);
  if (state.offers.length >= 2) return;
  const assets = state.buildings.filter(b => b.companyId === p.id && b.type !== 'hq');
  if (!assets.length || Math.random() > 0.35) return;
  const target = assets[Math.floor(Math.random() * assets.length)];
  if (state.offers.some(o => o.buildingId === target.id)) return;
  // A buyer that cannot cover the headline valuation is a non-bidder; this
  // excludes zero-balance firms from the lottery, which is the bug that
  // produced $0 offers on near-empty balance sheets.
  const bidders = state.companies.filter(c => !c.isPlayer && c.cash > target.fairValue * 1.05);
  if (!bidders.length) return;
  const buyer = bidders[Math.floor(Math.random() * bidders.length)];
  // Offers are anchored in the 75–110% of fair-value range. The lower bound
  // is enforced (no zero-dollar offers), and the upper bound caps buyout
  // enthusiasm so a player never gets overbid beyond the asset's worth.
  const ratio = Math.min(1.1, Math.max(0.75, 0.85 + Math.random() * 0.2 + buyer.acumen * 0.04));
  const amount = Math.max(50_000, Math.round(target.fairValue * ratio));
  state.offers.push({
    id: uid('o'), buildingId: target.id, buildingName: target.name,
    buyerId: buyer.id, buyerName: buyer.name, amount, fairValue: target.fairValue,
    expiresTick: state.tick + TICKS_PER_MONTH * 2,
    rationale: target.utilization > 60
      ? `${buyer.name} sees a high-utilisation asset worth folding into their ${buyer.sectorFocus.replace('_', ' ')} platform.`
      : `${buyer.name} believes they can run this site better than you can.`,
  });
  notify(state, `${buyer.name} offers $${fmtShort(amount)} for ${target.name} (value ${fmtShort(target.fairValue)}).`, 'info');
}

function forceLiquidate(state: GameState, p: Company) {
  const assets = state.buildings.filter(b => b.companyId === p.id).sort((a, b) => b.fairValue - a.fairValue);
  if (!assets.length) return;
  const t = assets[0];
  const salvage = t.fairValue * 0.45;
  p.cash += salvage;
  p.buildings = p.buildings.filter(i => i !== t.id);
  t.companyId = 'system'; t.forSale = true; t.askingPrice = Math.round(t.fairValue * 0.8);
  notify(state, `FORCED SALE: ${t.name} sold for $${fmtShort(salvage)} to cover debts.`, 'danger');
  news(state, `${p.name} forced into a distressed asset sale`, 'breaking');
  p.monthsInDistress = 0;
}

// ============================ PLAYER ACTIONS ============================
export function placeBuilding(state: GameState, type: BuildingType, x: number, y: number): boolean {
  const check = canPlace(state, type, x, y);
  if (!check.ok) { notify(state, check.reason, 'warning'); return false; }
  const city = state.cities.find(c => Math.hypot(c.x - x, c.y - y) <= c.radius + 8)
    ?? state.cities[0];
  const cfg = BUILDING_CONFIGS[type];
  const p = playerCo(state);
  const tile = state.tiles[y][x];

  // Someone else may already hold the title to this parcel.
  const title = state.landHoldings.find(h => h.x === x && h.y === y);
  if (title && title.ownerId !== p.id) {
    notify(state, 'Another party holds the title to this parcel.', 'warning');
    return false;
  }

  // Residents can object to — or outright block — nuisance development.
  const nimby = nimbyCheck(state, x, y, type);
  if (nimby.blocked) { notify(state, nimby.note, 'warning'); return false; }

  const land = title ? 0 : landPrice(state, x, y);
  const build = cfg.cost * (0.55 + city.landCostMultiplier * 0.45);
  const cost = (build + land) * (1 + nimby.surcharge);
  if (p.cash < cost) { notify(state, `Insufficient cash — this project costs ${fmtMoney(cost)}.`, 'warning'); return false; }
  if (nimby.surcharge > 0) notify(state, nimby.note, 'info');

  const b = createBuilding(type, p.id, city, state.products, x, y, state.tick, tile.resource?.type ?? null);
  b.constructionCost = build;
  b.landValue = title ? title.currentValue : land;
  b.constructionEndsTick = state.tick + 72; // 3 days, every asset
  b.name = `${cfg.name} · ${city.name}`;
  if (tile.resource) b.resourceRemaining = b.resourceMax = tile.resource.amount * 12;
  p.cash -= cost;
  state.buildings.push(b);
  p.buildings.push(b.id);
  if (title) title.developedBuildingId = b.id;
  else {
    state.landHoldings.push({
      id: uid('land'), ownerId: p.id, cityId: tile.cityId, x, y, zone: tile.zone,
      purchasePrice: land, currentValue: land, purchaseTick: state.tick, developedBuildingId: b.id,
    });
  }
  state.selectedBuildingId = b.id;
  state.buildMode = null;
  notify(state, `Construction started: ${b.name}. Ready in 3 days.`, 'success');
  return true;
}

export function buyListedBuilding(state: GameState, buildingId: string): boolean {
  const b = findBuilding(state, buildingId);
  const p = playerCo(state);
  if (!b || !b.forSale) return false;
  // A zero asking price is treated as a market-stale listing, not a free
  // gift. The system would otherwise let the player scoop up any building
  // whose seller previously had their own askingPrice wiped.
  if (b.askingPrice < 25_000) {
    notify(state, `${b.name} has no live listing. Wait for the market to reprice it.`, 'info');
    return false;
  }
  if (p.cash < b.askingPrice) { notify(state, 'Insufficient cash for this acquisition.', 'warning'); return false; }
  p.cash -= b.askingPrice;
  const seller = state.companies.find(c => c.id === b.companyId);
  if (seller) { seller.cash += b.askingPrice; seller.buildings = seller.buildings.filter(i => i !== b.id); }
  b.companyId = p.id; b.purchasePrice = b.askingPrice; b.forSale = false; b.askingPrice = 0;
  p.buildings.push(b.id);
  notify(state, `Acquired ${b.name}.`, 'success');
  news(state, `${p.name} acquires ${b.name}`, 'info');
  return true;
}

export function sellBuilding(state: GameState, buildingId: string) {
  const b = findBuilding(state, buildingId);
  const p = playerCo(state);
  if (!b || b.companyId !== p.id) return;
  // Sales close at 88% of fair value, never more — the spread between
  // construction cost and resale is the broker's cut, and that cut is the
  // reason the "build → list → sell → build" rotation is a net loss, not a
  // free money glitch. A 6% slippage below fair value is normal for an
  // arm's-length transaction, too.
  const proceeds = b.fairValue * 0.88;
  p.cash += proceeds;
  p.buildings = p.buildings.filter(i => i !== b.id);
  b.companyId = 'system'; b.forSale = true; b.askingPrice = Math.round(b.fairValue * 1.05);
  state.selectedBuildingId = null;
  notify(state, `Sold ${b.name} for $${fmtShort(proceeds)}.`, 'success');
}

export function upgradeBuilding(state: GameState, buildingId: string) {
  const b = findBuilding(state, buildingId);
  const p = playerCo(state);
  if (!b || b.companyId !== p.id || b.level >= b.maxLevel) return;
  const cost = b.constructionCost * 0.42 * b.level;
  if (p.cash < cost) { notify(state, `Upgrade needs $${fmtShort(cost)}.`, 'warning'); return; }
  p.cash -= cost;
  b.level++;
  b.capacity = Math.round(b.capacity * 1.28);
  b.targetEmployees = Math.round(b.targetEmployees * 1.22);
  b.inventoryCapacity = Math.round(b.inventoryCapacity * 1.25);
  b.constructionCost += cost * 0.7;
  b.condition = Math.min(100, b.condition + 12);
  notify(state, `${b.name} upgraded to level ${b.level}.`, 'success');
}

export function repairBuilding(state: GameState, buildingId: string) {
  const b = findBuilding(state, buildingId);
  const p = playerCo(state);
  if (!b || b.companyId !== p.id) return;
  // ── Refurbishment must not be an arbitrage ──
  // Restoring condition c→100 lifts fair value by roughly
  //   (1 - c/100) × constructionCost × 0.72 (replacement) × 0.75 (weight)
  //   ≈ 0.54 × (1 - c/100) × constructionCost.
  // At the old 0.25 rate the works cost less than half the value they
  // created, so "buy a derelict → refurbish → sell" printed money forever.
  // Pricing the works slightly ABOVE the value restored kills the flip while
  // leaving the real reason to refurbish intact: a run-down building
  // produces less, breaks down, and eventually stops operating altogether.
  const cost = (100 - b.condition) / 100 * b.constructionCost * 0.55;
  if (p.cash < cost) { notify(state, `Refurbishment needs $${fmtShort(cost)}.`, 'warning'); return; }
  p.cash -= cost; b.condition = 100; b.isOperating = true;
  notify(state, `${b.name} refurbished to as-new condition for $${fmtShort(cost)}.`, 'success');
}

export function setBuildingField<K extends keyof Building>(state: GameState, id: string, field: K, value: Building[K]) {
  const b = findBuilding(state, id);
  if (!b || b.companyId !== state.playerCompanyId) return;
  (b[field] as Building[K]) = value;
}

export function setProductLine(state: GameState, id: string, productId: string) {
  const b = findBuilding(state, id);
  if (!b || b.companyId !== state.playerCompanyId) return;
  if (isProducer(b.type)) {
    b.productId = productId; b.products = [productId];
  } else if (b.type === 'retail_store' || b.type === 'warehouse') {
    if (b.products.includes(productId)) b.products = b.products.filter(p => p !== productId);
    else if (b.products.length < (b.type === 'warehouse' ? 8 : 5)) b.products.push(productId);
    b.productId = b.products[0] ?? null;
  }
}

export function takeLoan(state: GameState, amount: number, months: number) {
  const p = playerCo(state);
  const assets = p.totalAssets;
  if (state.economy.creditTightness > 0.6) {
    notify(state, 'Credit crunch: banks have suspended new lending until conditions normalise.', 'danger');
    return;
  }
  if (p.debt + amount > assets * 0.65) { notify(state, 'Lenders decline: leverage would exceed 65% of assets.', 'warning'); return; }
  const rate = state.economy.interestRate + 2.4 + (p.debt / Math.max(1, assets)) * 6
    + state.economy.creditTightness * 5;
  const r = rate / 100 / 12;
  const payment = amount * r / (1 - Math.pow(1 + r, -months));

  // DSCR covenant: total debt service must be covered 1.6× by trailing EBITDA.
  const ebitda = Math.max(0, p.monthlyProfit * 12) + p.debt * (rate / 100);
  const service = (state.loans.reduce((s, l) => s + l.monthlyPayment, 0)
    + state.buildings.filter(b => b.companyId === p.id && !b.isLeased).reduce((s, b) => s + b.financingPayment, 0)
    + payment) * 12;
  if (service > 0 && ebitda < service * 1.6) {
    notify(state, `Loan declined on covenant: lenders need ${fmtMoney(service * 1.6)}/yr of EBITDA to cover `
      + `${fmtMoney(service / 12)}/mo of service. You generate ${fmtMoney(ebitda)}/yr.`, 'danger');
    return;
  }
  state.loans.push({
    id: uid('l'), principal: amount, balance: amount, rate, termMonths: months,
    monthsLeft: months, monthlyPayment: payment, lender: 'First National Bank',
  });
  p.cash += amount; p.debt += amount;
  notify(state, `Loan drawn: $${fmtShort(amount)} at ${rate.toFixed(2)}% over ${months} months.`, 'success');
}

export function repayLoan(state: GameState, loanId: string) {
  const p = playerCo(state);
  const l = state.loans.find(x => x.id === loanId);
  if (!l) return;
  if (p.cash < l.balance) { notify(state, 'Not enough cash to clear this loan.', 'warning'); return; }
  p.cash -= l.balance; p.debt = Math.max(0, p.debt - l.balance);
  state.loans = state.loans.filter(x => x.id !== loanId);
  notify(state, 'Loan repaid in full.', 'success');
}

/**
 * Equity trade with honest market impact.
 *
 * The previous version paid the pre-trade price and only *then* moved the
 * quote, which meant buying a block and instantly selling it returned more
 * cash than it cost — a risk-free money printer worth ~4% of notional per
 * round trip. Impact must be charged on the execution price: you buy through
 * the offer and sell into the bid, so a round trip is always a loss.
 */
export function tradeShares(state: GameState, companyId: string, shares: number) {
  const p = playerCo(state);
  const target = state.companies.find(c => c.id === companyId);
  if (!target || shares === 0) return;
  const FEE = 0.004;
  const impact = Math.min(0.05, Math.abs(shares) / Math.max(1, target.sharesOutstanding));

  if (shares > 0) {
    const execPrice = target.sharePrice * (1 + impact); // you move the price against yourself
    const cost = execPrice * shares * (1 + FEE);
    if (p.cash < cost) { notify(state, 'Insufficient cash for this trade.', 'warning'); return; }
    p.cash -= cost;
    p.equityHoldings[companyId] = (p.equityHoldings[companyId] ?? 0) + shares;
    target.sharePrice *= 1 + impact * 0.6; // part of the move is permanent
  } else {
    const held = p.equityHoldings[companyId] ?? 0;
    const sell = Math.min(held, -shares);
    if (sell <= 0) return;
    const execPrice = target.sharePrice * (1 - impact);
    p.cash += execPrice * sell * (1 - FEE);
    p.equityHoldings[companyId] = held - sell;
    if (p.equityHoldings[companyId] <= 0) delete p.equityHoldings[companyId];
    target.sharePrice *= 1 - impact * 0.6;
  }
  target.marketCap = target.sharePrice * target.sharesOutstanding;
}

export function respondToOffer(state: GameState, offerId: string, accept: boolean) {
  const offer = state.offers.find(o => o.id === offerId);
  if (!offer) return;
  const p = playerCo(state);
  if (accept) {
    const b = findBuilding(state, offer.buildingId);
    const buyer = state.companies.find(c => c.id === offer.buyerId);
    if (b && buyer) {
      // The offer floor is enforced here as well: refusing an offer
      // trivially low (a typo, a glitch, a malicious AI) keeps the player
      // whole. No buyout pays less than half the going-concern value.
      if (offer.amount < b.fairValue * 0.5) {
        notify(state, `${buyer.name}'s offer is far below market value. Counter or decline.`, 'warning');
        return;
      }
      p.cash += offer.amount;
      buyer.cash -= offer.amount;
      b.companyId = buyer.id;
      p.buildings = p.buildings.filter(i => i !== b.id);
      buyer.buildings.push(b.id);
      notify(state, `Sold ${b.name} to ${buyer.name} for $${fmtShort(offer.amount)}.`, 'success');
      news(state, `${buyer.name} acquires ${b.name} from ${p.name}`, 'info');
    }
  } else {
    notify(state, `Offer from ${offer.buyerName} declined.`, 'info');
  }
  state.offers = state.offers.filter(o => o.id !== offerId);
}

export function startResearch(state: GameState, name: string) {
  const def = RESEARCH_MENU.find(r => r.name === name);
  const p = playerCo(state);
  if (!def) return;
  if (state.research.some(r => r.name === name)) { notify(state, 'That programme is already running.', 'warning'); return; }
  if (p.cash < def.cost) { notify(state, `Research needs $${fmtShort(def.cost)} of funding.`, 'warning'); return; }
  p.cash -= def.cost;
  state.research.push({
    id: uid('r'), name: def.name, category: def.category, progress: 0,
    cost: def.cost, monthsLeft: def.months, effect: def.effect,
  });
  notify(state, `R&D programme launched: ${def.name}.`, 'success');
}

export function manualRestock(state: GameState, buildingId: string) {
  const b = findBuilding(state, buildingId);
  if (!b) return;
  const idx = buildIndex(state);
  const before = Object.values(b.inventory).reduce((s, v) => s + v, 0);
  procure(state, b, idx);
  const after = state.freight.filter(f => f.toBuildingId === b.id).length;
  notify(state, after > 0 ? `Emergency order dispatched to ${b.name}.` : `No supplier has stock for ${b.name}.`,
    after > 0 ? 'success' : 'warning');
  void before;
}

/** Negotiate for an asset that is not publicly listed. */
export { autoSource, makeOffer, buyLand, sellLand, signContract, cancelContract, acquireBuilding,
  leaseBuilding, buyShares, sellShares, issueShares, runEspionage, buyMarketResearch,
  setBreed, setTier, investFarm, landPrice } from './systems';

export function eligibleFor(state: GameState, b: Building): Product[] {
  return eligibleProducts(b.type, null, b.resourceType, state.products);
}

// ============================ FORMATTERS ============================
export function fmtShort(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(0);
}

export function fmtMoney(n: number): string {
  return `${n < 0 ? '-' : ''}$${fmtShort(Math.abs(n))}`;
}

export function fmtNum(n: number): string {
  return Math.round(n).toLocaleString();
}
