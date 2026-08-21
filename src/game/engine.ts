import type {
  GameState, City, Company, Building, Product, Economy, IsometricTile,
  BuildingType, Notification, EconomyCycle, FreightRoute, ProductKind,
  AISkill, TradedAsset, IncomingOffer, OfferResult, Loan, NewsTickerItem,
  ForwardGuidance, ZoneType, MovingEntity, MenuItem, SupplierLink, SupplyContractOffer, LandHolding,
} from './types';
import {
  PRODUCT_CATEGORIES, PRODUCT_RULES, BUILDING_CONFIGS, CITY_NAMES,
  COMPANY_NAMES, COMPANY_COLORS, segmentFor, isHospitality,
  MENU_TEMPLATES, KIDS_TOY_COST, VENUE_INGREDIENTS, RETAIL_CATEGORIES,
  LIVESTOCK_BREEDS, PRODUCT_TIERS,
} from './constants';
import {
  invalidateRoadCache, allHighwayTiles, tileIsRoad, isOnHighway,
  snapOffRoad, highwayProximity, CITY_ROAD_RADIUS,
} from './roads';
import { buildStateIndex, queryRadius, type StateIndex } from './indexing';
import {
  updateHouseholdBudgets, incomeFit, categorySpendPool, priceResponseLogit,
  anchoringMultiplier, scarcityMultiplier, socialProofMultiplier,
  impulseMultiplier, bulkBuyingMultiplier, switchingCostMultiplier,
  updateSocialProof, retailDemand, productRating,
} from './consumers';
import {
  generateTradedAssets, createIndexFunds, simulateAssetPrices,
  simulateAiCapitalAllocation, buyAsset, sellAsset, playerPortfolioValue,
} from './markets';
import {
  collectPropertyTax, collectCorporateTax, payDividends, updateMoneySupply,
  reviewTaxPolicy, replenishSeaports, rollFiscalYear,
} from './taxation';
import {
  generateInitialBonds, markToMarket, payCoupons, settleBonds,
  computeYieldCurve,
} from './bonds';
import {
  runFiscalBudget, runCentralBank, updateYieldCurve,
  updateWageSpiral, updateCpiBreakdown, simulateEnergyMarket,
  personalIncomeTax, TAX_BRACKETS_ANNUAL,
} from './macro';
import {
  bullwhipOrderQuantity, rushPenalty, updateEffectiveTraining,
  propagateSupplierFailure, simulateSupplierFailures, resolveResearch,
  patentPremium, importCostMultiplier, simulateTrade, simulateGovernment,
  simulateAntitrust, simulateCartels, simulatePredatoryPricing,
  simulateHerding, messyLiquidation, reviewCreditRatings,
} from './supplychain';

// ============= CONSTANTS =============
const TICKS_PER_MONTH = 24 * 30;
const TICKS_PER_YEAR = TICKS_PER_MONTH * 12;

export const SKILL_ACUMEN: Record<AISkill, number> = {
  novice: 0.30, competent: 0.58, shrewd: 0.80, ruthless: 0.96,
};

// ============= UTILITIES =============
let _idCounter = 0;
export function generateId(): string {
  _idCounter += 1;
  return `id_${_idCounter}_${Math.random().toString(36).slice(2, 8)}`;
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2d(seed: number) {
  return (x: number, y: number) => {
    const h = Math.sin(x * 374.5 + y * 271.3 + seed * 13.7) * 43758.5453;
    return h - Math.floor(h);
  };
}

function smoothstep(t: number) { return t * t * (3 - 2 * t); }

function valueNoise(seed: number, x: number, y: number, scale: number) {
  const h = hash2d(seed);
  const x0 = Math.floor(x / scale);
  const y0 = Math.floor(y / scale);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const fx = smoothstep((x / scale) - x0);
  const fy = smoothstep((y / scale) - y0);
  const a = h(x0, y0); const b = h(x1, y0);
  const c = h(x0, y1); const d = h(x1, y1);
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

function fbm(seed: number, x: number, y: number, octaves = 4, baseScale = 18, persistence = 0.5) {
  let total = 0, amplitude = 1, frequency = 1, maxValue = 0;
  for (let i = 0; i < octaves; i++) {
    total += valueNoise(seed + i, x, y, baseScale / frequency) * amplitude;
    maxValue += amplitude;
    amplitude *= persistence;
    frequency *= 2;
  }
  return total / maxValue;
}

// ============= PRODUCT GENERATION =============
function generateProducts(rand: () => number): Product[] {
  const products: Product[] = [];
  for (const [category, data] of Object.entries(PRODUCT_CATEGORIES)) {
    for (const name of data.products) {
      const rule = PRODUCT_RULES[name];
      const kind: ProductKind = rule?.kind || 'consumer';
      const cost = rule?.cost || (kind === 'consumer' ? 55 + rand() * 240 : 30 + rand() * 80);
      const quality = 30 + rand() * 40;
      products.push({
        id: generateId(), name, category,
        basePrice: cost * (1.25 + rand() * 0.35),
        currentPrice: cost * (1.25 + rand() * 0.35),
        quality, perceivedQuality: quality,
        reviewScore: 3.2 + rand() * 0.8,
        brand: 10 + rand() * 30,
        demandIndex: data.necessity,
        inputs: [],
        icon: data.icon,
        kind, productionCost: cost,
        unlockYear: rule?.unlockYear ?? 1980,
        priceWeight: rule?.priceWeight ?? 40,
        qualityWeight: rule?.qualityWeight ?? 35,
        brandWeight: rule?.brandWeight ?? 25,
        techLevel: 1 + rand() * 4,
        marketDemand: 35 + rand() * 65,
        playerMarketShare: 0,
        segment: segmentFor(name, category, cost),
      });
    }
  }
  const byName = new Map(products.map(p => [p.name, p]));
  for (const product of products) {
    product.inputs = (PRODUCT_RULES[product.name]?.inputs || []).flatMap(([inputName, quantity]) => {
      const input = byName.get(inputName);
      return input ? [{ productId: input.id, productName: inputName, quantity }] : [];
    });
  }
  return products;
}

// ============= CITY GENERATION =============
function generateCities(rand: () => number, size: number): City[] {
  const positions: Array<{ x: number; y: number }> = [];
  const numCities = 8 + Math.floor(rand() * 4);
  let attempts = 0;
  while (positions.length < numCities && attempts < 800) {
    attempts++;
    const x = 15 + rand() * (size - 30);
    const y = 15 + rand() * (size - 30);
    const tooClose = positions.some(p => Math.hypot(p.x - x, p.y - y) < 25);
    if (tooClose) continue;
    positions.push({ x, y });
  }
  return positions.map((pos, i) => {
    const rawPop = 15000 + Math.floor(rand() * 65000);
    const tier = rawPop > 100000 ? 'metropolis' as const : rawPop > 60000 ? 'large' as const : rawPop > 30000 ? 'medium' as const : 'small' as const;
    const low = 0.28 + rand() * 0.22;
    const affluent = 0.08 + rand() * 0.17;
    return {
      id: generateId(),
      name: CITY_NAMES[i % CITY_NAMES.length] + (i >= CITY_NAMES.length ? ` ${Math.floor(i / CITY_NAMES.length) + 1}` : ''),
      x: Math.round(pos.x), y: Math.round(pos.y),
      population: rawPop,
      wageRate: 7.25 + Math.pow(rand(), 1.35) * 37.75,
      landCostMultiplier: 0.5 + rand() * 2.5,
      demandMultiplier: 0.85 + rand() * 0.3,
      unemploymentRate: 3 + rand() * 7,
      growthRate: 0.4 + rand() * 3.2,
      color: `hsl(${(i * 47) % 360}, 65%, 55%)`,
      tier,
      gdpPerCapita: 18000 + rand() * 62000,
      populationHistory: Array.from({ length: 24 }, (_, m) => Math.floor(rawPop * (0.92 + m * 0.003 + rand() * 0.01))),
      medianAge: 28 + rand() * 16,
      educationIndex: 18 + rand() * 72,
      familyShare: 0.18 + rand() * 0.30,
      birthRate: 10 + rand() * 5,
      deathRate: 7 + rand() * 2.5,
      netMigrationRate: 0,
      naturalIncrease: 0,
      housingDemand: -35 + rand() * 70,
      qualityOfLife: 40 + rand() * 45,
      trafficLevel: 25 + rand() * 60,
      incomeMix: { low, middle: Math.max(0.15, 1 - low - affluent), affluent },
      discretionaryBudget: { low: 0, middle: 0, affluent: 0 },
      nimbyLevel: 20 + rand() * 45,
      // Most residents live in owner-occupied homes or small private rentals
      // that are not corporate assets on the map. Corporate apartment blocks
      // are the investable slice of the housing market.
      backgroundHousingUnits: Math.floor(rawPop / 2.4 * (0.88 + rand() * 0.08)),
      backgroundJobs: Math.floor(rawPop * (0.40 + rand() * 0.08)),
      pollution: 4 + rand() * 8,
      householdSavingsMonths: 1.5 + rand() * 1.5,
      householdDebtRatio: 0.12 + rand() * 0.10,
    };
  });
}

// ============= COMPANY GENERATION =============
function generateCompanies(rand: () => number, playerName: string, playerColor: string = '#10b981'): Company[] {
  const player: Company = {
    id: generateId(), name: playerName, isPlayer: true,
    cash: 50_000_000, revenue: 0, profit: 0, expenses: 0,
    totalAssets: 50_000_000, debt: 0, interestRate: 5,
    sharePrice: 10, sharesOutstanding: 1_000_000,
    marketCap: 10_000_000, brandValue: 10, color: playerColor,
    aiStrategy: 'balanced', buildings: [], bondRating: 'A',
    skill: 'competent', acumen: 0.58, dividendPayout: 20, monthsInDistress: 0,
    brandAwareness: 5, assetHoldings: {}, assetCostBasis: {},
    observedPlayerShare: {}, researchedCategories: [],
    expectedEarnings: 0, predatoryTicks: 0, cartelId: null, sentiment: 1,
    personality: 'Founder-led operator', sectorFocus: 'diversified', riskTolerance: 0.5,
    planningHorizonMonths: 36, playerIntelLevel: 2, intelExpiresTick: Number.MAX_SAFE_INTEGER,
    espionageCostIntelUntilTick: 0,
    lossCarryforward: 0, taxesPaidYTD: 0, pretaxProfitYTD: 0, taxesPaidLastYear: 0,
    equityHoldings: {}, equityCostBasis: {}, founderShares: 700_000,
    shareIssuanceYear: 2000, sharesIssuedThisYear: 0,
    dailyCash: 50_000_000, dailyMarketCap: 10_000_000, dailySharePrice: 10,
    dailyRevenue: 0, dailyProfit: 0, dailyExpenses: 0, dailyNetWorth: 0,
    revenueAccum: 0, profitAccum: 0, expensesAccum: 0,
    sharePriceHistory: Array(60).fill(10),
    operatingCashFlow: 0, investingCashFlow: 0, financingCashFlow: 0,
  };

  const numAI = 14 + Math.floor(rand() * 6);
  const ai: Company[] = [];
  // Shuffle the palette so each AI gets a distinct colour every game;
  // remove the player's colour first so no two firms clash.
  const availableColors = COMPANY_COLORS
    .filter(c => c.toLowerCase() !== playerColor.toLowerCase())
    .slice()
    .sort(() => rand() - 0.5);
  for (let i = 0; i < numAI; i++) {
    const strategy = (['aggressive', 'balanced', 'conservative'] as const)[Math.floor(rand() * 3)];
    const skillRoll = rand();
    // New distribution: more novices, more ruthless, fewer in the middle.
    const skill: AISkill = skillRoll < 0.42 ? 'novice' : skillRoll < 0.68 ? 'competent' : skillRoll < 0.88 ? 'shrewd' : 'ruthless';
    const acumen = SKILL_ACUMEN[skill];
    // Cash spread: novices start with almost nothing; ruthles companies start
    // with deep pockets. A "gap" company is a death sentence — it builds,
    // bleeds, and dies within 18 months. Great for the player's early win.
    const cash = skill === 'novice' ? (50_000 + rand() * 450_000)
      : skill === 'competent' ? (5_000_000 + rand() * 15_000_000)
      : skill === 'shrewd' ? (30_000_000 + rand() * 60_000_000)
      : (70_000_000 + rand() * 120_000_000);
    const shares = skill === 'novice'
      ? 100_000 + Math.floor(rand() * 300_000)
      : 500_000 + Math.floor(rand() * 4_500_000);
    const price = Math.max(1, cash * (0.45 + acumen * 0.25) / shares);
    const startingDebt = skill === 'novice' ? rand() * 50_000
      : skill === 'competent' ? rand() * 2_000_000
      : skill === 'shrewd' ? rand() * 10_000_000 : rand() * 25_000_000;
    const focuses = ['retail', 'industrial', 'real_estate', 'hospitality', 'diversified'] as const;
    const sectorFocus = focuses[i % focuses.length];
    const personality = skill === 'novice'
      ? (strategy === 'aggressive' ? 'Impatient founder' : 'Bootstrapping local operator')
      : skill === 'competent'
        ? (strategy === 'conservative' ? 'Cash-flow disciplinarian' : 'Pragmatic regional builder')
        : skill === 'shrewd'
          ? (strategy === 'aggressive' ? 'Opportunistic consolidator' : 'Data-driven specialist')
          : 'Ruthless empire builder';
    const riskTolerance = strategy === 'aggressive' ? 0.8 + acumen * 0.2
      : strategy === 'conservative' ? 0.2 + acumen * 0.25 : 0.45 + acumen * 0.25;
    ai.push({
      id: generateId(),
      name: COMPANY_NAMES[i % COMPANY_NAMES.length] + (i >= COMPANY_NAMES.length ? ` ${Math.floor(i / COMPANY_NAMES.length) + 1}` : ''),
      isPlayer: false, cash, revenue: 0,
      profit: 0, expenses: 0,
      totalAssets: cash, debt: startingDebt,
      interestRate: 4 + rand() * 5, sharePrice: price, sharesOutstanding: shares,
      marketCap: price * shares, brandValue: 20 + rand() * 60,
      color: availableColors[i % availableColors.length],
      aiStrategy: strategy, buildings: [], bondRating: (['AAA', 'AA', 'A', 'BBB', 'BB', 'B'] as const)[Math.floor(rand() * 6)],
      skill, acumen, dividendPayout: 10 + rand() * 35, monthsInDistress: 0,
      brandAwareness: 15 + rand() * 40, assetHoldings: {}, assetCostBasis: {},
      observedPlayerShare: {}, researchedCategories: [],
      expectedEarnings: 0, predatoryTicks: 0, cartelId: null, sentiment: 0.85 + rand() * 0.3,
      personality, sectorFocus, riskTolerance,
      planningHorizonMonths: skill === 'novice' ? 6 + Math.round(rand() * 6)
        : skill === 'competent' ? 18 + Math.round(rand() * 18)
        : skill === 'shrewd' ? 36 + Math.round(rand() * 24) : 72,
      playerIntelLevel: 0, intelExpiresTick: 0, espionageCostIntelUntilTick: 0,
      lossCarryforward: 0, taxesPaidYTD: 0, pretaxProfitYTD: 0, taxesPaidLastYear: 0,
      equityHoldings: {}, equityCostBasis: {}, founderShares: Math.floor(shares * 0.55),
      shareIssuanceYear: 2000, sharesIssuedThisYear: 0,
      dailyCash: cash, dailyMarketCap: price * shares, dailySharePrice: price,
      dailyRevenue: 0, dailyProfit: 0, dailyExpenses: 0, dailyNetWorth: 0,
      revenueAccum: 0, profitAccum: 0, expensesAccum: 0,
      sharePriceHistory: Array(60).fill(price),
      operatingCashFlow: 0, investingCashFlow: 0, financingCashFlow: 0,
    });
  }
  return [player, ...ai];
}

// ============= PRODUCT ELIGIBILITY =============
/**
 * The single source of truth for what a building may produce or sell.
 *
 * This is what stops a fast-food outlet from stocking vitamins: a kitchen
 * only consumes bulk ingredients, a specialty retailer only sells its own
 * category, a farm only grows farm produce, and a mine only extracts the
 * mineral it physically sits on.
 */
export function eligibleProductsFor(
  building: { type: BuildingType; specialisation?: string | null; resourceType?: string | null },
  products: Product[],
  year?: number,
): Product[] {
  const { type } = building;
  const yearFilter = year !== undefined ? (p: Product) => p.unlockYear <= year : () => true;

  if (isHospitality(type)) {
    // Kitchens buy bulk ingredients, never finished retail goods.
    const allowed = new Set(VENUE_INGREDIENTS[type] ?? []);
    return products.filter(p => allowed.has(p.name) && yearFilter(p));
  }

  if (type === 'farm') return products.filter(p => p.kind === 'farm' && yearFilter(p));

  if (type === 'mine') {
    // A mine can only extract the deposit under it.
    if (building.resourceType) {
      const match = products.filter(p => p.name.toLowerCase() === building.resourceType!.toLowerCase() && yearFilter(p));
      if (match.length > 0) return match;
    }
    return products.filter(p => p.kind === 'raw' && yearFilter(p));
  }

  if (type === 'factory') return products.filter(p => (p.kind === 'semi' || p.kind === 'consumer') && yearFilter(p));

  if (type === 'retail_store') {
    const consumer = products.filter(p => p.kind === 'consumer' && yearFilter(p));
    // Specialty stores stock only their own category.
    if (building.specialisation) return consumer.filter(p => p.category === building.specialisation);
    return consumer;
  }

  if (type === 'warehouse') return products.filter(p => p.kind !== 'digital' && yearFilter(p));
  if (type === 'seaport') return products.filter(p => (p.kind === 'semi' || p.kind === 'raw' || p.kind === 'consumer') && yearFilter(p));

  // HQ, R&D, apartments and offices don't trade goods at all.
  return [];
}

/** Builds a fresh menu board for a hospitality venue. */
function buildMenu(type: BuildingType): MenuItem[] {
  const template = MENU_TEMPLATES[type];
  if (!template) return [];
  return template.map(item => ({ ...item, id: generateId() }));
}

// Construction lead times (days). Buildings cannot operate or earn before then,
// which closes pause-queue and instant-production exploits.
const CONSTRUCTION_LEAD_DAYS: Partial<Record<BuildingType, number>> = {
  retail_store: 45, factory: 90, farm: 60, mine: 75, warehouse: 40,
  hq: 60, rd_center: 60, apartment: 120, commercial: 120,
  restaurant: 50, fast_food: 35, cafe: 30, bar: 40,
};

// ============= BUILDING CREATION =============
function createBuilding(
  type: BuildingType, companyId: string, city: City, products: Product[],
  x?: number, y?: number, cities?: City[], year?: number,
): Building {
  const cfg = BUILDING_CONFIGS[type] || BUILDING_CONFIGS.retail_store;
  let offsetX = x ?? city.x + (-9 + Math.floor(Math.random() * 18));
  let offsetY = y ?? city.y + (-9 + Math.floor(Math.random() * 18));
  // AI/auto placements: nudge off street centrelines and highway right-of-way.
  if (x === undefined && cities) {
    [offsetX, offsetY] = snapOffRoad(cities, city, offsetX, offsetY);
  }

  // Retail stores pick a specialisation up front so they sell a coherent range.
  const specialisation = type === 'retail_store'
    ? RETAIL_CATEGORIES[Math.floor(Math.random() * RETAIL_CATEGORIES.length)]
    : null;

  const eligible = eligibleProductsFor({ type, specialisation }, products, year);
  const firstProduct = eligible[Math.floor(Math.random() * Math.max(1, eligible.length))];
  // Retailers open with a couple of lines from their own category.
  const initialLines = type === 'retail_store'
    ? eligible.slice(0, 3).map(p => p.id)
    : firstProduct ? [firstProduct.id] : [];

  return {
    id: generateId(), type, name: cfg.name, companyId, cityId: city.id,
    x: offsetX, y: offsetY, width: cfg.w, height: cfg.h,
    level: 1, maxLevel: 9, operatingCost: cfg.cost * 0.02,
    costBreakdown: {
      rentMortgage: 0, utilities: 0, inventoryStock: 0, staffWages: 0,
      payrollTaxesBenefits: 0, marketingAdvertising: 0, equipment: 0,
      insurance: 0, licensesPermits: 0, maintenanceRepairs: 0,
      cardProcessing: 0, packagingBags: 0, accountingLegal: 0,
      propertyTax: 0, municipalFees: 0, reserveContribution: 0,
      freight: 0, other: 0,
    },
    revenue: 0, profit: 0, cogs: 0,
    employees: companyId === 'system' ? cfg.employees : 0,
    targetEmployees: type === 'hq' || type === 'rd_center' ? cfg.capacity : cfg.employees,
    averageAnnualSalary: 0,
    staffSkill: 0,
    recruitingRate: 0,
    maintenanceReserve: 0,
    reserveRate: 0.012,
    sellPriceMultiplier: 1,
    productTier: 'standard',
    livestockBreed: null,
    feedQuality: 0.5,
    vetProgram: 0,
    openMarketSales: true,
    marketUnitsSold: 0,
    financingPayment: 0,
    financingMonthsLeft: 0,
    isLeased: false,
    farmSizeHectares: type === 'farm' ? 120 : 0,
    soilHealth: type === 'farm' ? 78 : 0,
    weatherFactor: 1,
    growthStage: 'dormant',
    irrigationLevel: type === 'farm' ? 0.25 : 0,
    farmTechniqueLevel: 0,
    farmEquipmentLevel: 0,
    transferPricingMode: 'cost_basis',
    transferPriceMultiplier: 1.0,
    diseaseTicksRemaining: 0,
    spoilageLossYTD: 0,
    trainingLevel: 1 + Math.floor(Math.random() * 3),
    trainingBudget: 0.35,
    capacity: cfg.capacity, utilization: 30 + Math.random() * 50,
    customerTraffic: type === 'retail_store' ? 40 + Math.random() * 60 : 0,
    landValue: cfg.cost * city.landCostMultiplier * 0.1,
    constructionCost: cfg.cost * city.landCostMultiplier,
    condition: 80 + Math.random() * 20, isOperating: true,
    productId: initialLines[0] ?? firstProduct?.id ?? null,
    products: initialLines,
    inventory: {},
    inventoryCapacity: Math.max(500, cfg.capacity * (type === 'warehouse' ? 3 : type === 'retail_store' ? 15 : 1.5)),
    pricingMultiplier: 1,
    lastUnitsSold: 0, lastUnitsProduced: 0,
    supply: 0, demand: 0,
    resourceType: null, resourceRemaining: type === 'mine' ? 6000 : 0,
    resourceMax: type === 'mine' ? 6000 : 0,
    occupancy: 0,
    rentMultiplier: 1, rentPerUnit: 0,
    tenants: 0,
    rentLastAdjustedTick: 0,
    leaseExpiryTick: 0,
    employeeSatisfaction: 55 + Math.random() * 20,
    monthsUnprofitable: 0,
    adBudget: 0, cachedAsk: 0, offersMade: 0, negotiationBlockedUntil: 0,
    highwayAccess: cities ? highwayProximity(cities, offsetX, offsetY) : 0,
    parkingScore: Math.max(0.1, Math.min(1, Math.hypot(offsetX - city.x, offsetY - city.y) / 12)),
    specialisation,
    productSlots: type === 'retail_store' ? 4 : 1,
    menu: buildMenu(type),
    supplierLinks: [],
    supplierRelationships: {},
    supplyMode: 'auto',
    monthlyFairValue: 0,
    forSale: false,
    askingPrice: 0,
    freightCost: 0,
    inputCost: 0,
    internalSale: false,
    portKind: null,
    chainBonus: 1,
    anchorPrice: 0,
    socialProof: 0,
    loyalCustomerBase: 0.05,
    effectiveTraining: 1,
    demandForecast: cfg.capacity / 14,
    safetyStockPolicy: 0.5,
    productionIntensity: 1,
    supplyDisrupted: false,
    constructionEndsTick: 0,
    brandEquity: 0,
    unionized: false,
    unionWagePremium: 0,
    strikeTicks: 0,
    purchasePrice: 0,
    acquiredAtTick: 0,
    revenueAccum: 0, cogsAccum: 0, opexAccum: 0, profitAccum: 0,
    utilizationAccum: 0, soldUnitsAccum: 0, producedUnitsAccum: 0,
    dailyRevenue: 0, dailyCogs: 0, dailyOpex: 0, dailyProfit: 0,
    dailyUtilization: 0, dailySold: 0, dailyProduced: 0,
  };
}

function generateInitialBuildings(cities: City[], companies: Company[], products: Product[], year: number): Building[] {
  const buildings: Building[] = [];
  const focusTypes: Record<Company['sectorFocus'], BuildingType[]> = {
    retail: ['retail_store', 'warehouse'],
    industrial: ['farm', 'factory', 'warehouse'],
    real_estate: ['apartment', 'commercial'],
    hospitality: ['cafe', 'fast_food', 'restaurant', 'bar'],
    diversified: ['retail_store', 'factory', 'farm', 'warehouse', 'apartment', 'commercial', 'cafe'],
  };

  for (const company of companies) {
    if (company.isPlayer) continue;
    const target = company.skill === 'novice' ? (Math.random() < 0.25 ? 1 : 0)
      : company.skill === 'competent' ? 1 + Math.floor(Math.random() * 2)
      : company.skill === 'shrewd' ? 3 + Math.floor(Math.random() * 3)
      : 5 + Math.floor(Math.random() * 4);
    const preferred = focusTypes[company.sectorFocus];

    for (let i = 0; i < target; i++) {
      const city = cities[Math.floor(Math.random() * cities.length)];
      const type = preferred[Math.floor(Math.random() * preferred.length)];
      const cfg = BUILDING_CONFIGS[type];
      const cost = cfg.cost * city.landCostMultiplier;
      // Keep a 15% working-capital buffer; no free buildings.
      if (company.cash < cost * 1.15) continue;
      const building = createBuilding(type, company.id, city, products,
        undefined, undefined, cities, year);
      building.constructionCost = cost;
      building.purchasePrice = cost;
      building.acquiredAtTick = 0;
      company.cash -= cost;
      buildings.push(building);
      company.buildings.push(building.id);
    }
    const book = buildings
      .filter(building => building.companyId === company.id)
      .reduce((sum, building) => sum + building.constructionCost + building.landValue, 0);
    company.totalAssets = company.cash + book;
  }

  // ── Institutional & background property market ──
  // Banks, the state and private landlords own real estate that the player can
  // buy or lease. This makes cities look inhabited AND gives an acquisition
  // market: some buildings are listed for sale from day one.
  const bankNames = ['First National Bank', 'Metro Trust', 'City Development Fund',
    'State Housing Authority', 'Heritage Property Group', 'Pension Realty Trust'];
  for (const city of cities) {
    const popScale = Math.max(1, Math.round(city.population / 12000));
    // Residential + commercial stock scales with population.
    const apartmentBlocks = 4 + popScale * 2 + Math.floor(Math.random() * 4);
    const commercialBlocks = 2 + popScale + Math.floor(Math.random() * 3);
    const retailUnits = 2 + popScale + Math.floor(Math.random() * 2);

    const placeInstitutional = (type: BuildingType, forSaleChance: number) => {
      const angle = Math.random() * Math.PI * 2;
      const radius = 3 + Math.random() * 10;
      const [sx, sy] = snapOffRoad(cities, city,
        Math.round(city.x + Math.cos(angle) * radius),
        Math.round(city.y + Math.sin(angle) * radius));
      const b = createBuilding(type, 'system', city, products, sx, sy, cities, year);
      const owner = bankNames[Math.floor(Math.random() * bankNames.length)];
      b.name = type === 'apartment' ? `${owner} Residences`
        : type === 'commercial' ? `${owner} Offices`
        : `${owner} Retail`;
      if (type === 'apartment' || type === 'commercial') {
        b.tenants = Math.round(b.capacity * (0.55 + Math.random() * 0.4));
        b.occupancy = b.tenants / b.capacity * 100;
      }
      // Realistic institutional asset value.
      b.constructionCost = BUILDING_CONFIGS[type].cost * city.landCostMultiplier * (0.8 + Math.random() * 0.5);
      b.landValue = b.constructionCost * 0.35;
      // A slice of the market is actively listed for sale.
      if (Math.random() < forSaleChance) {
        b.forSale = true;
        b.askingPrice = Math.round((b.constructionCost + b.landValue) * (0.9 + Math.random() * 0.4));
      }
      b.monthlyFairValue = b.constructionCost + b.landValue;
      buildings.push(b);
    };

    for (let i = 0; i < apartmentBlocks; i++) placeInstitutional('apartment', 0.35);
    for (let i = 0; i < commercialBlocks; i++) placeInstitutional('commercial', 0.4);
    for (let i = 0; i < retailUnits; i++) placeInstitutional('retail_store', 0.45);
  }

  // ── Seaports: the import lifeline that lets a new firm skip whole chains ──
  const portCities = cities.slice(0, Math.max(2, Math.floor(cities.length / 2.5)));
  for (const [i, city] of portCities.entries()) {
    const portKind: 'industrial' | 'commercial' = i % 2 === 0 ? 'industrial' : 'commercial';
    const stock = products
      .filter(p => portKind === 'industrial'
        ? (p.kind === 'semi' || p.kind === 'raw' || p.kind === 'farm')
        : p.kind === 'consumer')
      .filter(p => p.unlockYear <= year);
    const port = createBuilding('seaport', 'system', city, products,
      Math.round(city.x + 8), Math.round(city.y + 6), cities, year);
    port.capacity = 500_000;
    port.name = `${city.name} ${portKind === 'industrial' ? 'Industrial' : 'Commercial'} Port`;
    port.portKind = portKind;
    port.products = stock.map(p => p.id);
    port.productId = stock[0]?.id ?? null;
    // Deep berths: ports are the import lifeline for raw/semi goods — too thin
    // and every factory in the country starves on day one.
    // Uneven starter stock: staples and industrial inputs carry deeper reserves;
    // expensive finished goods carry smaller lots. No identical 30K stacks.
    port.inventory = Object.fromEntries(stock.map((product, productIndex) => {
      const base = product.kind === 'raw' || product.kind === 'farm' ? 18_000
        : product.kind === 'semi' ? 12_000
        : Math.max(1_500, 8_000 / Math.max(1, Math.log10(product.productionCost + 10)));
      const variation = 0.65 + ((productIndex * 37 + i * 19) % 70) / 100;
      return [product.id, Math.round(base * variation)];
    }));
    port.inventoryCapacity = 1_500_000;
    // Real port infrastructure: cranes, docks, warehouses, customs facility.
    // A working seaport is worth ~$800M and sits on ~$120M of waterfront land.
    port.constructionCost = 800_000_000;
    port.landValue = 120_000_000;
    port.trainingLevel = 5;
    // Ports are state infrastructure — never listed for private sale.
    port.forSale = false;
    port.askingPrice = 0;
    buildings.push(port);
  }

  return buildings;
}

// ============= MAP GENERATION =============
export function generateMap(state: GameState): IsometricTile[][] {
  const size = state.mapSize;
  const tiles: IsometricTile[][] = [];
  const seed = state.seed;
  invalidateRoadCache();
  const highwaySet = allHighwayTiles(state.cities);

  for (let y = 0; y < size; y++) {
    tiles[y] = [];
    for (let x = 0; x < size; x++) {
      let elevation = fbm(seed, x, y, 5, 22, 0.55);
      const moisture = fbm(seed + 9999, x, y, 4, 18, 0.5);

      let type: IsometricTile['type'] = 'grass';
      if (elevation < 0.32) type = 'water';
      else if (elevation < 0.36) type = 'beach';
      else if (elevation > 0.72) type = moisture > 0.55 ? 'snow' : 'mountain';
      else if (elevation > 0.58) type = 'hills';
      else if (moisture < 0.4 && elevation > 0.45) type = 'desert';
      else if (moisture > 0.6) type = 'forest';

      let cityId: string | null = null;
      let homeCity: City | null = null;
      for (const city of state.cities) {
        if (Math.hypot(x - city.x, y - city.y) < CITY_ROAD_RADIUS + 3) {
          cityId = city.id;
          homeCity = city;
          break;
        }
      }
      if (cityId) {
        if (type === 'water' || type === 'mountain' || type === 'snow' || type === 'desert') type = 'grass';
        elevation = Math.min(elevation, 0.35);
      }

      const isHighway = highwaySet.has(`${x},${y}`);
      const isRoad = homeCity ? tileIsRoad(x, y, homeCity) : false;
      if (isHighway) {
        if (type === 'water') elevation = Math.max(elevation, 0.34);
        else if (type === 'mountain' || type === 'snow') { type = 'hills'; elevation = Math.min(elevation, 0.5); }
      }

      // Concentric zoning: commercial core, residential ring, industrial edge.
      let zone: ZoneType = 'industrial';
      if (homeCity) {
        const d = Math.hypot(x - homeCity.x, y - homeCity.y);
        if (d < 4) zone = 'commercial';
        else if (d < 9) zone = 'residential';
        else if (d < 13) zone = 'mixed';
        else zone = 'industrial';
      }

      let resource: IsometricTile['resource'] = null;
      const tileRandom = hash2d(seed + 31337)(x, y);
      const detailRandom = hash2d(seed + 8911)(x, y);
      if (type === 'mountain' && elevation > 0.74 && tileRandom < 0.14) {
        const roll = detailRandom;
        const kind = roll < 0.12 ? 'gold' as const : roll < 0.25 ? 'lithium' as const : roll < 0.45 ? 'silica' as const : roll < 0.72 ? 'iron' as const : 'coal' as const;
        resource = { type: kind, amount: 800 + detailRandom * 1200, maxAmount: 2000 };
      } else if (type === 'forest' && moisture > 0.65 && tileRandom < 0.12) {
        resource = { type: 'timber', amount: 600 + detailRandom * 1000, maxAmount: 1500 };
      } else if (type === 'desert' && tileRandom < 0.03) {
        resource = { type: 'oil', amount: 1500 + detailRandom * 2500, maxAmount: 4000 };
      }

      let landValue = type === 'water' ? 0.5 : type === 'mountain' || type === 'snow' ? 1 : type === 'forest' ? 8 : type === 'hills' ? 6 : 15;
      for (const city of state.cities) {
        const dist = Math.hypot(x - city.x, y - city.y);
        if (dist < 30 && type !== 'water') {
          const factor = Math.max(0, 1 - dist / 30);
          const popMul = 1 + Math.min(3, city.population / 3_000_000);
          const centerPremium = dist < 5 ? 2.5 : dist < 10 ? 1.6 : 1;
          landValue = Math.max(landValue, (5 + factor * 95) * popMul * centerPremium);
        }
      }

      tiles[y][x] = {
        x, y, type, elevation, landValue, cityId, zone,
        road: isRoad, highway: isHighway, resource,
        variant: Math.floor(detailRandom * 8),
      };
    }
  }
  return tiles;
}

/** Validates a placement against terrain, roads, highways and zoning. */
export function checkBuildable(
  tiles: IsometricTile[][], state: GameState, type: BuildingType, x: number, y: number,
): { ok: boolean; reason: string } {
  const tile = tiles[Math.round(y)]?.[Math.round(x)];
  if (!tile) return { ok: false, reason: 'Outside the map.' };
  if (tile.highway) return { ok: false, reason: 'Interstate right-of-way — no structures permitted.' };
  if (tile.road) return { ok: false, reason: 'Cannot build on streets or intersections.' };

  const city = state.cities.find(c => Math.hypot(c.x - x, c.y - y) < CITY_ROAD_RADIUS + 4);
  if (!city) return { ok: false, reason: 'Buildings must be placed near a city.' };

  // City core reserved for civic / HQ use.
  if (Math.hypot(x - city.x, y - city.y) < 2 && type !== 'hq') {
    return { ok: false, reason: `${city.name} town hall square — headquarters only.` };
  }

  const cfg = BUILDING_CONFIGS[type];
  for (const other of state.buildings) {
    const dx = Math.abs(other.x - x);
    const dy = Math.abs(other.y - y);
    if (dx < (other.width + cfg.w) / 2 && dy < (other.height + cfg.h) / 2) {
      return { ok: false, reason: `Overlaps ${other.name}. Move at least one tile clear.` };
    }
  }

  if (tile.type === 'water' || tile.type === 'snow') return { ok: false, reason: 'Terrain unsuitable for construction.' };
  if (tile.type === 'mountain' && type !== 'mine') return { ok: false, reason: 'Only mines may be built on mountains.' };
  if (type === 'mine' && !tile.resource) return { ok: false, reason: 'Mines must sit on a mineral deposit.' };
  if (type === 'farm' && !['grass', 'hills'].includes(tile.type)) return { ok: false, reason: 'Farms need grassland or gentle hills.' };

  // Zoning
  const heavy = type === 'factory' || type === 'mine' || type === 'warehouse';
  const residential = type === 'apartment';
  const commercial = type === 'retail_store' || type === 'commercial'
    || ['restaurant', 'fast_food', 'cafe', 'bar'].includes(type);

  if (heavy && (tile.zone === 'residential' || tile.zone === 'commercial')) {
    return { ok: false, reason: `Zoning: heavy industry prohibited in ${tile.zone} districts.` };
  }
  if (residential && tile.zone === 'industrial') {
    return { ok: false, reason: 'Zoning: housing may not be built on industrial land.' };
  }
  if (commercial && tile.zone === 'industrial') {
    return { ok: false, reason: 'Zoning: customer-facing premises not permitted on industrial land.' };
  }

  return { ok: true, reason: 'Valid building plot.' };
}

// ============= GAME INITIALIZATION =============
export function createNewGame(
  seed: number = 1337,
  playerName: string = 'Your Corporation',
  playerColor: string = '#10b981',
): GameState {
  const rand = mulberry32(seed);
  const size = 150;
  const products = generateProducts(rand);
  const cities = generateCities(rand, size);
  const companies = generateCompanies(rand, playerName, playerColor);
  const buildings = generateInitialBuildings(cities, companies, products, 2000);
  const playerCompany = companies[0];

  const state: GameState = {
    id: generateId(), tick: 0, speed: 1, year: 2000, month: 1, day: 1, hour: 8,
    timeOfDay: 0.33, season: 'winter', dayOfYear: 0,
    player: { name: 'CEO', companyId: playerCompany.id, cash: 5_000_000, salary: 500_000, netWorth: 55_000_000 },
    cities, companies, buildings, products,
    tradedAssets: generateTradedAssets(),
    stockMarket: {
      index: 10000,
      indexHistory: Array.from({ length: 120 }, (_, i) => 8000 + Math.sin(i / 10) * 1500 + i * 18),
      sentiment: 'neutral', interestRate: 5, inflationRate: 2,
      ticker: [{ id: generateId(), text: 'Markets open cautiously as investors await Fed decision', type: 'info', tick: 0 }],
    },
    economy: {
      gdpGrowth: 2.5, inflation: 2, interestRate: 5, consumerConfidence: 65,
      businessConfidence: 60, cycle: 'growth', cycleMonth: 0, unemployment: 5,
      purchasingPowerIndex: 100, moneySupply: 100, cpi: 100,
      dieselPrice: 3.65, fuelShockMonths: 0, cbCredibility: 0.8,
      forwardGuidance: 'neutral', moneyVelocity: 1.15,
      shortTermCapitalGainsRate: 22, longTermCapitalGainsRate: 15,
      carbonTaxPerUnit: 0.15, dividendTaxRate: 15, bankCredit: 0, nominalGdp: 0,
      co2Stock: 372, bankCapitalAdequacy: 0.12, loanLossProvisions: 0, creditTightness: 0,
      centralBankAssets: 10_000_000_000, baseMoney: 100, broadMoney: 100,
      governmentDeficit: 0, governmentDebt: 1_500_000_000,
      tenYearYield: 4.5, twoYearYield: 4.0, threeMonthYield: 3.5,
      cpiByCategory: { food: 100, housing: 100, energy: 100, services: 100, goods: 100 },
      householdSavingsRate: 8, unitLaborCostGrowth: 2, productivityGrowth: 1.5,
      strategicReserveDays: 90,
    },
    notifications: [],
    selectedBuilding: null, selectedCity: null,
    camera: { x: cities[0]?.x ?? 75, y: cities[0]?.y ?? 75, zoom: 1.2 },
    mapSize: size, seed, overlay: 'none', paused: false, freight: [],
    incomingOffers: [], lastOffer: null, loans: [],
    government: { corporateTaxRate: 21, propertyTaxRate: 0.012, carbonTaxPerUnit: 0, minimumWage: 7.25,
      antitrustThreshold: 45, nextReviewTick: 24 * 30 * 6, antitrustWarnings: 0 },
    tradePartners: [
      { id: generateId(), name: 'Pacifica', exchangeRate: 7.2, baseExchangeRate: 7.2, tariffRate: 0.04, wageIndex: 0.28, qualityPenalty: 0.14, relationship: 40 },
      { id: generateId(), name: 'Nordmark', exchangeRate: 0.92, baseExchangeRate: 0.92, tariffRate: 0.02, wageIndex: 1.25, qualityPenalty: 0, relationship: 60 },
      { id: generateId(), name: 'Sudamera', exchangeRate: 18.5, baseExchangeRate: 18.5, tariffRate: 0.06, wageIndex: 0.42, qualityPenalty: 0.09, relationship: 25 },
    ],
    patents: [], cartels: [], researchProjects: [],
    bonds: [],
    landHoldings: [],
    portShipments: [],
    pipelineOrders: [],
    politics: { rulingParty: 'centrist', approval: 52, nextElectionYear: 2004,
      industryLobbyPower: 0.4, environmentalLobbyPower: 0.35 },
    globalMarket: {
      price: Object.fromEntries(products.map(p => [p.id, p.currentPrice * 0.7])),
      netExport: Object.fromEntries(products.map(p => [p.id, 0])),
    },
    replayHistory: [],
  };

  // In-world index funds track the companies that actually exist here.
  state.tradedAssets.push(...createIndexFunds(state));
  // Initial bond inventory issued by AI companies
  state.bonds = generateInitialBonds(state);
  // Household budgets are normally computed monthly — prime them at start so
  // demand works from day one.
  updateHouseholdBudgets(state);
  // Fair value is a monthly snapshot; initialize the first month once here.
  for (const building of state.buildings) {
    building.monthlyFairValue = computeStandardFairValue(state, building);
  }

  // ── Population ↔ housing correlation ──
  // Now that all buildings exist, reconcile each city's population with its
  // real housing stock so tenants, occupancy and population always line up.
  // population = (background homes + corporate apartment units) × household size.
  for (const city of state.cities) {
    const corporateUnits = state.buildings
      .filter(b => b.cityId === city.id && b.type === 'apartment')
      .reduce((sum, b) => sum + b.capacity, 0);
    // Corporate apartments are ~12% of housing; the rest is background stock.
    // Derive population from total housing so the numbers are consistent.
    const totalHousing = city.backgroundHousingUnits + corporateUnits;
    const householdSize = 2.4;
    const occupancyRate = 0.94; // ~6% natural vacancy
    city.population = Math.round(totalHousing * householdSize * occupancyRate);
    city.backgroundJobs = Math.floor(city.population * (0.40 + Math.random() * 0.06));
    city.populationHistory = Array.from({ length: 24 },
      (_, m) => Math.floor(city.population * (0.92 + m * 0.003)));
  }
  updateHouseholdBudgets(state);
  return state;
}

// ============= HELPERS =============
function addNotification(state: GameState, n: Notification) {
  // Prevent exact duplicate notifications from flooding the stack
  if (state.notifications.length > 0 && state.notifications[0].message === n.message) {
    return;
  }
  state.notifications.unshift(n);
  if (state.notifications.length > 30) state.notifications.pop();
}

/** Gate player operational actions until construction completes. */
function blockedByConstruction(state: GameState, buildingId: string): boolean {
  const b = state.buildings.find(item => item.id === buildingId);
  if (!b) return false; // missing-building case is handled by each caller's null check
  if (b.constructionEndsTick > state.tick) {
    addNotification(state, { id: generateId(),
      message: `${b.name} is still under construction — controls unlock in ${Math.ceil((b.constructionEndsTick - state.tick) / 24)} days.`,
      type: 'warning', tick: state.tick });
    return true;
  }
  return false;
}

function addNewsTicker(state: GameState, text: string, type: NewsTickerItem['type'] = 'info') {
  state.stockMarket.ticker.unshift({ id: generateId(), text, type, tick: state.tick });
  if (state.stockMarket.ticker.length > 30) state.stockMarket.ticker.pop();
}

// ============= ECONOMY =============
function simulateEconomy(state: GameState): void {
  const eco = state.economy;
  // CPI breakdown feeds the headline CPI used everywhere else.
  updateCpiBreakdown(state);
  // Wage spiral: real wages track productivity; nominal wages additionally
  // index to inflation expectations through a Phillips bargaining model.
  updateWageSpiral(state);
  // Central bank operations: QE/QT on the balance sheet, M2 from credit.
  runCentralBank(state);
  // Yield curve follows the policy rate and term premium.
  updateYieldCurve(state);
  // Energy market with OPEC-style events and strategic reserves.
  simulateEnergyMarket(state);

  eco.cycleMonth += 1 / (24 * 30);

  // Endogenous business cycle transitions
  let nextCycle = eco.cycle;
  if (eco.cycleMonth > 12) { // Minimum duration
    if (eco.cycle === 'boom') {
      if (eco.inflation > 6 || eco.creditTightness > 0.5) nextCycle = 'recession'; // Overheating or Minsky moment
    } else if (eco.cycle === 'recession') {
      if (eco.unemployment > 7 && eco.interestRate < 2.5 && eco.inflation < 3) nextCycle = 'recovery'; // Bottomed out
      else if (eco.cycleMonth > 48) nextCycle = 'recovery'; // Force recovery eventually
    } else if (eco.cycle === 'recovery') {
      if (eco.gdpGrowth > 2) nextCycle = 'growth';
    } else if (eco.cycle === 'growth') {
      if (eco.gdpGrowth > 4 && eco.unemployment < 5) nextCycle = 'boom';
      else if (eco.creditTightness > 0.6) nextCycle = 'recession'; // Premature crash
    }
  }

  if (nextCycle !== eco.cycle) {
    eco.cycleMonth = 0;
    eco.cycle = nextCycle;
    addNotification(state, {
      id: generateId(),
      message: `Economy entering ${eco.cycle} phase`,
      type: eco.cycle === 'recession' ? 'warning' : eco.cycle === 'boom' ? 'success' : 'info',
      tick: state.tick,
    });
    addNewsTicker(state, `Economy officially enters ${eco.cycle} phase`, eco.cycle === 'recession' ? 'warning' : 'info');
  }

  const cycleEffects: Record<string, { gdp: number; inflation: number; confidence: number }> = {
    boom: { gdp: 0.02, inflation: 0.01, confidence: 0.3 },
    growth: { gdp: 0.01, inflation: 0.005, confidence: 0.1 },
    recession: { gdp: -0.015, inflation: -0.005, confidence: -0.3 },
    recovery: { gdp: 0.005, inflation: 0.002, confidence: 0.2 },
  };
  const e = cycleEffects[eco.cycle];
  eco.gdpGrowth = Math.max(-6, Math.min(9, eco.gdpGrowth + (e.gdp + (Math.random() - 0.5) * 0.01) / 24));
  eco.consumerConfidence = Math.max(10, Math.min(95, eco.consumerConfidence + (e.confidence + (Math.random() - 0.5) * 1.5) / 24));
  eco.businessConfidence = Math.max(10, Math.min(95, eco.businessConfidence + (e.confidence + (Math.random() - 0.5) * 1.5) / 24));

  // Phillips Curve + Taylor Rule
  const NAIRU = 4.5;
  const gap = eco.unemployment - NAIRU;
  const anchorWeight = eco.cbCredibility;
  const expected = eco.inflation * (1 - anchorWeight * 0.6) + 2 * (anchorWeight * 0.6);
  const supplyShock = eco.fuelShockMonths > 0 ? 2.5 : 0;
  const phillips = expected - 0.4 * gap + supplyShock;
  eco.inflation += (phillips - eco.inflation) * 0.008;
  eco.inflation = Math.max(-3, Math.min(22, eco.inflation));

  const taylorTarget = Math.max(0.25, 2 + eco.inflation + 0.5 * (eco.inflation - 2) + 0.25 * (eco.gdpGrowth - 2.5));
  const urgency = eco.inflation > 8 ? 0.45 : eco.inflation > 5 ? 0.30 : 0.15;
  eco.interestRate += (taylorTarget - eco.interestRate) * urgency;
  eco.interestRate = Math.max(-0.5, Math.min(22, eco.interestRate));

  eco.unemployment = Math.max(2, Math.min(20, eco.unemployment + (eco.cycle === 'recession' ? 0.003 : eco.cycle === 'boom' ? -0.004 : -0.001)));
  eco.purchasingPowerIndex = 100 / Math.max(0.01, eco.cpi / 100);

  // Old moneySupply loop is now subsumed by runCentralBank which manages
  // base money and broad money separately via the central bank balance sheet.
}

// (Fuel market now lives in macro.ts simulateEnergyMarket — hourly, with OPEC/reserves.)

// ============= CENTRAL BANK =============
function simulateCentralBank(state: GameState) {
  const eco = state.economy;
  const miss = Math.abs(eco.inflation - 2);
  eco.cbCredibility += miss > 4 ? -0.012 : miss < 1 ? 0.008 : -0.002;
  eco.cbCredibility = Math.max(0.15, Math.min(1, eco.cbCredibility));

  const prev = eco.forwardGuidance;
  eco.forwardGuidance = eco.inflation > 3.5 ? 'hawkish' as ForwardGuidance
    : eco.inflation < 1 || eco.cycle === 'recession' ? 'dovish' as ForwardGuidance
    : 'neutral' as ForwardGuidance;
  if (eco.forwardGuidance !== prev) {
    const msg = eco.forwardGuidance === 'hawkish'
      ? 'Central bank signals further tightening ahead'
      : eco.forwardGuidance === 'dovish' ? 'Central bank signals rate cuts and asset purchases'
      : 'Central bank moves to a neutral stance';
    addNewsTicker(state, msg, eco.forwardGuidance === 'hawkish' ? 'warning' : 'info');
  }

  const targetVelocity = 1.1 + (eco.consumerConfidence - 50) / 220 + eco.gdpGrowth / 45;
  eco.moneyVelocity += (targetVelocity - eco.moneyVelocity) * 0.05;
}

// ============= BUILDINGS =============
/**
 * Accessibility multiplier. Car-dependent cities punish sites without parking;
 * highway frontage is what makes big-box retail and logistics viable at all.
 */
function accessibilityFactor(building: Building): number {
  const bigBox = building.type === 'warehouse' || building.capacity > 400;
  const parkingTerm = 1 - 0.45 * (1 - building.parkingScore);
  const highwayTerm = 1 + building.highwayAccess * (bigBox ? 0.35 : 0.10);
  return Math.max(0.35, parkingTerm) * highwayTerm;
}

/**
 * Demographic fit. Kids goods need families, premium tech needs educated buyers,
 * pharmacy demand rises with median age.
 */
function demographicFit(city: City, product: Product): number {
  let fit = 1;
  if (product.segment === 'luxury' || product.segment === 'premium') {
    fit *= 0.7 + (city.educationIndex / 100) * 0.6;
  }
  if (product.category === 'Drugs') fit *= 0.75 + (city.medianAge / 45) * 0.5;
  if (product.category === 'Computers' || product.category === 'Communication') {
    fit *= 0.7 + (city.educationIndex / 100) * 0.55 + Math.max(0, (38 - city.medianAge) / 38) * 0.25;
  }
  return Math.max(0.25, Math.min(1.9, fit));
}

/** Spatial-hash traffic: only scans buildings in nearby grid cells. */
function locationTraffic(city: City, x: number, y: number, index: StateIndex): number {
  const centerDistance = Math.hypot(x - city.x, y - city.y);
  const centerTraffic = Math.max(4, city.trafficLevel * Math.exp(-centerDistance / 9));
  const nearby = queryRadius(index, x, y, 7).filter(b => b.cityId === city.id);
  let density = 0;
  for (const b of nearby) {
    density += b.type === 'apartment' ? 6 : b.type === 'commercial' ? 5 : b.type === 'retail_store' ? 4 : 1;
  }
  return Math.min(100, centerTraffic + density);
}

function simulateBuildings(state: GameState, index: StateIndex): void {
  const isDaytime = state.timeOfDay > 0.25 && state.timeOfDay < 0.8;

  // Producer capacity proxy per product for market-saturation pressure.
  const producerCapacity = new Map<string, number>();
  for (const b of state.buildings) {
    if (!b.productId || b.constructionEndsTick > state.tick) continue;
    if (b.type === 'factory' || b.type === 'farm' || b.type === 'mine') {
      producerCapacity.set(b.productId,
        (producerCapacity.get(b.productId) ?? 0) + b.capacity / 24);
    }
  }

  for (const building of state.buildings) {
    if (building.constructionEndsTick > state.tick) continue;
    if (building.strikeTicks > 0) {
      // Striking workers halt output but still cost half payroll.
      building.strikeTicks -= 1;
      building.revenue = 0;
      building.cogs = 0;
      building.profit = -building.operatingCost * 0.5;
      continue;
    }
    if (!building.isOperating) continue;
    const city = index.citiesById.get(building.cityId);
    if (!city) continue;
    const product = building.productId ? index.productsById.get(building.productId) : null;

    const shiftFactor = isDaytime ? 0.34 : 0.12;
    const annualSalary = building.averageAnnualSalary > 0
      ? building.averageAnnualSalary : city.wageRate * 2080;
    const wageCost = building.employees * (annualSalary / 2080) * shiftFactor
      * (1 + building.unionWagePremium);
    const staffingFactor = building.targetEmployees > 0
      ? Math.min(1, building.employees / building.targetEmployees) : 1;
    const maintenance = building.constructionCost * 0.0000045;
    const trainingCost = wageCost * building.trainingBudget * 0.18;

    // ── Real-estate operating cost breakdown (monthly, divided to hourly) ──
    // Property tax + insurance + municipal utilities + garbage + street
    // cleaning + maintenance reserves. Taken from real landlord P&Ls.
    let realEstateOpex = 0;
    if (building.type === 'apartment' || building.type === 'commercial') {
      const value = building.constructionCost + building.landValue;
      const monthlyHourly = 1 / 720;
      const annualHourly = 1 / (365 * 24);
      // Insurance: ~0.35% of building value per year.
      const insurance = value * 0.0035 * annualHourly;
      // Municipal utilities: water + sewer + garbage + street cleaning,
      // billed per occupied unit. ~$45/unit/month typical.
      const utilities = building.tenants * 45 * monthlyHourly;
      // Maintenance reserve: 1.2% of value per YEAR (the prior formula
      // accidentally charged the annual rate every month).
      const reserve = value * building.reserveRate * annualHourly;
      building.maintenanceReserve += reserve;
      realEstateOpex = insurance + utilities + reserve;
    }
    building.operatingCost = wageCost + maintenance + trainingCost + realEstateOpex;
    building.revenue = 0;
    building.cogs = 0;
    building.profit = 0;

    // Production: farms, mines, factories
    if ((building.type === 'farm' || building.type === 'mine' || building.type === 'factory') && product) {
      const efficiency = 0.45 + building.trainingLevel / 16;
      const seasonal = building.type === 'farm'
        ? (state.season === 'summer' ? 1.15 : state.season === 'winter' ? 0.55 : 0.9) : 1;
      const inputReadiness = building.type === 'factory' && product.inputs.length > 0
        ? product.inputs.filter(inp => (building.inventory[inp.productId] || 0) >= inp.quantity).length / product.inputs.length
        : 1;
      const reserveFactor = building.type === 'mine' && building.resourceMax > 0
        ? Math.max(0.1, building.resourceRemaining / building.resourceMax) : 1;
      const rush = rushPenalty(building);
      // ── Farm realism: crops follow a growing season with a harvest window.
      // Planting is at 5% capacity, growing rises through the year, harvest
      // happens in autumn. Weather adds a ±20% variance. Soil health degrades
      // slightly with continuous planting and recovers in winter. ──
      let farmGrowth = 1;
      let farmWeather = 1;
      if (building.type === 'farm') {
        const day = state.dayOfYear;
        const livestock = product.name === 'Livestock' || product.name === 'Milk';
        building.growthStage = livestock ? 'growing'
          : day < 90 ? 'planting' : day < 180 ? 'growing'
          : day < 270 ? 'harvest' : 'dormant';

        // Crops only generate a meaningful marketable yield at harvest.
        // Livestock and dairy produce year-round, with a winter feed penalty.
        farmGrowth = livestock
          ? (state.season === 'winter' ? 0.72 : 0.92)
          : building.growthStage === 'harvest' ? 1.45
            : building.growthStage === 'growing' ? 0.04 : 0;

        const wSeed = (state.year * 13 + state.month * 7 + Math.round(building.x)) % 12;
        const rawWeather = [0.8, 1.2, 0.9, 1.1, 0.85, 1.15, 0.95, 1.05, 0.8, 1.2, 0.9, 1.1][wSeed];
        // Irrigation cushions bad weather but costs utilities/maintenance.
        farmWeather = 1 + (rawWeather - 1) * (1 - building.irrigationLevel * 0.7);
        building.weatherFactor = farmWeather;
        farmWeather *= building.soilHealth / 100;
        farmGrowth *= building.farmSizeHectares / 120;

        if (state.hour === 0) {
          if (building.growthStage === 'dormant' || livestock) {
            building.soilHealth = Math.min(100, building.soilHealth + (livestock ? 0.01 : 0.08));
          } else {
            building.soilHealth = Math.max(35,
              building.soilHealth - 0.03 * (1 - building.irrigationLevel * 0.25));
          }
        }
        building.operatingCost += building.farmSizeHectares
          * building.irrigationLevel * 2 / 720;

        // Disease outbreak: 0.5% chance per month if vetProgram === 0
        if (building.vetProgram === 0 && building.diseaseTicksRemaining <= 0 && Math.random() < 0.005 / 720) {
          building.diseaseTicksRemaining = 24 * 20; // 20 days
          addNotification(state, {
            id: generateId(),
            message: `⚠️ Disease outbreak at ${building.name}! Output down 80% for 20 days. Upgrade vet program to prevent outbreaks.`,
            type: 'danger', tick: state.tick,
          });
          addNewsTicker(state, `Agricultural disease outbreak at ${building.name}`, 'warning');
        }

        if (building.diseaseTicksRemaining > 0) {
          building.diseaseTicksRemaining -= 1;
          farmGrowth *= 0.20; // 80% yield loss!
        }
      }
      // Volume scale: capacity/24 per hour (was /720). A 200-capacity farm now
      // moves ~9 units/hour instead of 0.3 — matching the per-unit price scale.
      // ── Farm depth: breed, feed, veterinary program, product tier ──
      let farmBreedMul = 1;
      let farmPriceMul = 1;
      let farmQualityBonus = 0;
      if (building.type === 'farm') {
        const breed = LIVESTOCK_BREEDS.find(b => b.id === building.livestockBreed);
        if (breed && (product.name === breed.producesProduct)) {
          farmBreedMul *= breed.yieldMul;
          farmPriceMul *= breed.priceMul;
          farmQualityBonus += breed.qualityBonus;
        }
        // Feed quality: 0-1 → ±20% yield, ±10% quality
        farmBreedMul *= 0.85 + building.feedQuality * 0.35;
        farmQualityBonus += building.feedQuality * 10;
        // Vet/agronomy program cuts disease/pest losses.
        farmBreedMul *= 1 + building.vetProgram * 0.05;
        // Farm-specific R&D and equipment create durable operational advantage.
        farmBreedMul *= 1 + building.farmTechniqueLevel * 0.08
          + building.farmEquipmentLevel * 0.10;
        farmQualityBonus += building.farmTechniqueLevel * 5
          + building.farmEquipmentLevel * 3;
        // Product tier: standard/premium/organic
        const tier = PRODUCT_TIERS.find(t => t.id === building.productTier);
        if (tier) {
          farmBreedMul *= 1 - (tier.costMul - 1) * 0.15; // extra cost slows raw output slightly
          farmPriceMul *= tier.priceMul;
          farmQualityBonus += tier.qualityBonus;
        }
      }
      const productionUnits = building.capacity / 24 * efficiency * seasonal * farmGrowth * farmWeather * inputReadiness
        * reserveFactor * rush.output * (0.7 + building.effectiveTraining / 15) * staffingFactor * farmBreedMul;
      building.lastUnitsProduced = productionUnits;
      // Negative externality: production adds to the city's pollution stock.
      // Carbon pricing and clean techniques dampen emissions.
      const emissions = productionUnits * 0.004
        * (building.type === 'mine' ? 1.4 : building.type === 'factory' ? 1 : 0.4)
        * (1 - Math.min(0.6, state.economy.carbonTaxPerUnit * 0.12));
      city.pollution = Math.min(150, city.pollution + emissions);
      state.economy.co2Stock = Math.min(1200, state.economy.co2Stock + emissions * 0.00002);

      // Rushing degrades quality over time — defects slip through QA.
      if (rush.quality < 1 && state.tick % 240 === 0) {
        product.quality = Math.max(5, product.quality - (1 - rush.quality) * 0.8);
        building.employeeSatisfaction -= 0.15;
      }

      // Carbon tax on industrial output — heaviest for factories and mines.
      const carbon = building.type === 'factory' ? state.economy.carbonTaxPerUnit
        : building.type === 'mine' ? state.economy.carbonTaxPerUnit * 0.8
        : state.economy.carbonTaxPerUnit * 0.3;
      if (carbon > 0) building.operatingCost += productionUnits * carbon;

      if (building.type === 'factory' && product.inputs.length > 0) {
        for (const input of product.inputs) {
          building.inventory[input.productId] = Math.max(0, (building.inventory[input.productId] || 0) - input.quantity * productionUnits);
        }
      }
      if (building.type === 'mine' && building.resourceRemaining > 0) {
        building.resourceRemaining = Math.max(0, building.resourceRemaining - productionUnits * 0.004);
        if (building.resourceRemaining <= 0) {
          building.isOperating = false;
          addNotification(state, {
            id: generateId(),
            message: `${building.name} has exhausted its reserve. Find a new deposit.`,
            type: 'warning', tick: state.tick,
          });
        }
      }
      // Farm and factory quality responds to training; a mine's is fixed by geology.
      if (building.type !== 'mine' && state.tick % 720 === 0) {
        const ceiling = 30 + building.trainingLevel * 7.8;
        if (product.quality < ceiling) product.quality = Math.min(100, product.quality + 0.6);
      }

      const onHand = (building.inventory[product.id] || 0) + productionUnits;
      // Internal-sale plants only feed the group; everyone else also sells spot.
      const groupDemand = (index.buildingsByCompany.get(building.companyId) ?? [])
        .filter(b => b.id !== building.id && b.products.includes(product.id))
        .reduce((sum, b) => sum + b.capacity / 14 * 0.5, 0);
      // ── Open-market pricing with demand elasticity ──
      // The player sets a sell-price multiplier; charging above spot reduces
      // how many units the market absorbs, charging below spot sells more.
      const priceElasticity = Math.pow(Math.max(0.3, building.sellPriceMultiplier), -1.4);
      // Market saturation: the NPC "world buyer" is not bottomless. When total
      // producer capacity outruns demand, the clearing price and absorption fall.
      const totalProdCap = producerCapacity.get(product.id) ?? building.capacity / 24;
      const demandProxy = Math.max(1, product.marketDemand * 6);
      const saturation = 1 / (1 + Math.max(0, totalProdCap / demandProxy - 1) * 0.9);
      const marketAbsorb = (building.internalSale || !building.openMarketSales)
        ? 0
        : (product.marketDemand / 100) * (building.capacity / 12)
          * (0.7 + city.population / 600_000) * priceElasticity * saturation;
      const shipped = Math.min(onHand, groupDemand + Math.max(
        (building.internalSale || !building.openMarketSales) ? 0 : productionUnits * 0.6, marketAbsorb));
      building.inventory[product.id] = Math.max(0, Math.min(building.inventoryCapacity, onHand - shipped));

      const unitInputCost = product.inputs.reduce((sum, inp) => {
        const input = index.productsById.get(inp.productId);
        return sum + inp.quantity * (input?.productionCost || 0) * (state.economy.dieselPrice / 3.65);
      }, 0);
      // Base spot is 72% of retail price; the player's multiplier moves the gate price.
      // Farm depth: breed + tier lift the gate price and product quality.
      // Saturated markets force deep discounts on the spot price (up to 70% off).
      const priceSat = Math.max(0.3, saturation);
      const spotPrice = product.currentPrice * 0.72 * building.sellPriceMultiplier * farmPriceMul * priceSat;
      if (building.type === 'farm' && farmQualityBonus > 0 && state.tick % 720 === 0) {
        product.quality = Math.min(100, product.quality + farmQualityBonus * 0.02);
      }
      // Feed and vet costs — the price of premium production.
      if (building.type === 'farm') {
        const feedCost = building.capacity * 0.4 * building.feedQuality;
        const vetCost = building.employees * 8 * building.vetProgram;
        const equipmentUpkeep = building.farmEquipmentLevel * 2_500;
        const researchSupport = building.farmTechniqueLevel * 1_200;
        const breed = LIVESTOCK_BREEDS.find(b => b.id === building.livestockBreed);
        const breedCostMul = breed?.costMul ?? 1;
        building.operatingCost += ((feedCost + vetCost) * breedCostMul
          + equipmentUpkeep + researchSupport) / 720;
      }
      const marketShipped = Math.max(0, shipped - groupDemand);
      building.revenue = shipped * spotPrice;
      building.cogs = shipped * unitInputCost;
      building.marketUnitsSold = marketShipped;
      if (marketShipped > 0 && state.globalMarket?.netExport[product.id] !== undefined) {
        // Domestic surplus exported into world markets adds external supply and
        // pushes the next month's world price down.
        state.globalMarket.netExport[product.id] -= marketShipped;
      }
      building.supply = onHand;
      building.demand = marketAbsorb * 12;
      building.utilization = Math.min(100, productionUnits / Math.max(0.01, building.capacity / 720) * 100);
    }

    // Retail
    else if (building.type === 'retail_store') {
      // Multi-line retail: the shop stocks up to `productSlots` lines from its
      // own category, and each line draws its own demand curve.
      const stocked = building.products
        .slice(0, building.productSlots)
        .map(id => index.productsById.get(id))
        .filter((p): p is Product => Boolean(p));

      const localTraffic = locationTraffic(city, building.x, building.y, index);
      const trafficFactor = 0.4 + (localTraffic / 100) * 0.95;
      const confidence = state.economy.consumerConfidence / 100;
      const timeFactor = isDaytime ? 1 : 0.3;
      const access = accessibilityFactor(building);
      const service = (0.75 + (building.employeeSatisfaction / 100) * 0.25
        + (building.trainingLevel / 9) * 0.2) * staffingFactor;

      // ── Retail chain bonus ──
      // Specialty focus plus a network of same-format stores in this city
      // lifts recognition, exactly as the retail chain strategy describes.
      const ownStores = index.buildingsByCompany.get(building.companyId) ?? [];
      const chainInCity = ownStores.filter(b => b.type === 'retail_store' && b.cityId === building.cityId).length;
      const chainNational = ownStores.filter(b => b.type === 'retail_store').length;
      const specialtyBonus = building.specialisation ? 1.18 : 1;
      const chainBonus = Math.min(1.5, 1 + Math.max(0, chainInCity - 1) * 0.07)
        * (1 + Math.log10(1 + chainNational) * 0.20) * specialtyBonus;
      building.chainBonus = chainBonus;
      // Brand equity from sustained advertising: boosts demand 0..+25%.
      const brandBoost = 1 + building.brandEquity / 400;

      const perLineCapacity = (building.capacity / Math.max(1, stocked.length)) / 14;
      let totalRevenue = 0, totalCogs = 0, totalSold = 0, totalSupply = 0, totalDemand = 0;
      let totalDesired = 0;

      for (const line of stocked) {
        // Full behavioural stack: income segmentation, logit price response,
        // anchoring, scarcity, social proof, impulse, bulk buying.
        const desired = retailDemand(city, line, building, localTraffic, confidence,
          isDaytime, index.buildingsByCity) * brandBoost;

        const available = building.inventory[line.id] || 0;
        const scarcity = scarcityMultiplier(available, building.inventoryCapacity, desired);
        const landed = building.supplierLinks.find(l => l.productId === line.id);
        const unitCost = landed
          ? landed.pricePerUnit + landed.freightPerUnit
          : line.productionCost * 1.35;

        let sold = Math.min(desired * scarcity, available);
        // Stockouts strand the loyalty base — empty shelves send shoppers away.
        if (available <= 0) building.loyalCustomerBase = Math.max(0, building.loyalCustomerBase - 0.002);
        else if (sold > 0) building.loyalCustomerBase = Math.min(1, building.loyalCustomerBase + 0.0003);

        if (sold > 0) {
          building.inventory[line.id] = Math.max(0, available - sold);
          totalRevenue += sold * line.currentPrice * building.pricingMultiplier;
          totalCogs += sold * unitCost;
          totalSold += sold;
        }
        totalSupply += available;
        totalDemand += desired * 14;
        totalDesired += desired;
      }

      // Social proof: bestsellers snowball; anchors set on first price seen.
      updateSocialProof(building, totalSold, perLineCapacity * Math.max(1, stocked.length));
      if (building.anchorPrice <= 0) building.anchorPrice = 1;

      building.revenue = totalRevenue;
      building.cogs = totalCogs;
      building.lastUnitsSold = totalSold;
      building.customerTraffic = localTraffic;
      building.supply = totalSupply;
      building.demand = totalDemand;
      building.utilization = Math.min(100,
        (totalSold / Math.max(0.001, perLineCapacity * Math.max(1, stocked.length))) * 100);
      // Brand equity: advertising accumulates goodwill that decays without support.
      building.brandEquity = Math.max(0, Math.min(100,
        building.brandEquity * (1 - 0.00003) + (building.adBudget / 720) * 0.0006));
      building.operatingCost += building.adBudget / 720;
    }

    // ── Hospitality: covers × menu mix, consuming bulk ingredients ──
    else if (isHospitality(building.type)) {
      const localTraffic = locationTraffic(city, building.x, building.y, index);
      const locationMul = 0.4 + (localTraffic / 100) * 0.9;
      const popMul = Math.min(3, city.population / 25_000);
      const confidence = state.economy.consumerConfidence / 100;
      const isEvening = state.hour >= 17 && state.hour <= 23;
      const isLunch = state.hour >= 11 && state.hour <= 14;
      const isMorning = state.hour >= 6 && state.hour <= 10;

      // Each format has its own trading rhythm.
      const daypart = building.type === 'bar' ? (isEvening ? 1.6 : isDaytime ? 0.3 : 0.5)
        : building.type === 'cafe' ? (isMorning ? 1.8 : isLunch ? 1.1 : isDaytime ? 0.6 : 0.15)
        : building.type === 'fast_food' ? (isLunch ? 1.7 : isEvening ? 1.3 : isDaytime ? 0.8 : 0.25)
        : (isEvening ? 1.9 : isLunch ? 1.0 : isDaytime ? 0.4 : 0.15);

      const access = accessibilityFactor(building);
      const service = (0.7 + (building.employeeSatisfaction / 100) * 0.35
        + (building.trainingLevel / 9) * 0.2) * staffingFactor;

      const active = building.menu.filter(m => m.enabled);
      const weight = active.reduce((sum, m) => sum + m.popularity, 0) || 1;

      // A kids offer pulls families in — a genuine QSR traffic driver.
      const kidsLines = active.filter(m => m.category === 'kids');
      const kidsDraw = kidsLines.length > 0 ? 1 + city.familyShare * 0.45 : 1;

      // Price positioning: the whole board is scaled by the pricing multiplier,
      // and diners notice. Cheap eats are far more elastic than fine dining.
      const elasticity = building.type === 'fast_food' ? 1.5
        : building.type === 'cafe' ? 1.2 : building.type === 'bar' ? 0.9 : 0.75;
      const priceTerm = Math.pow(building.pricingMultiplier, -elasticity);

      // Rival venues in the neighbourhood split the trade.
      const rivals = queryRadius(index, building.x, building.y, 8)
        .filter(b => b.id !== building.id && isHospitality(b.type)).length;
      const shareOfMarket = 1 / (1 + rivals * 0.35);

      const seatCapacity = building.capacity / 14;
      let covers = seatCapacity * locationMul * popMul * confidence * daypart
        * access * service * kidsDraw * priceTerm * shareOfMarket;

      // ── Ingredient constraint: no stock = ZERO revenue ──
      const ingredients = building.products
        .map(id => index.productsById.get(id))
        .filter((p): p is Product => Boolean(p));
      if (ingredients.length > 0) {
        const inStockCount = ingredients.filter(ing => (building.inventory[ing.id] || 0) > 0.05).length;
        if (inStockCount === 0) {
          // Completely out of food: restaurant closes, revenue hits $0!
          covers = 0;
          building.supplyDisrupted = true;
        } else {
          const readiness = inStockCount / ingredients.length;
          // Missing ingredients reduces achievable covers proportionally.
          covers *= readiness;
          for (const ing of ingredients) {
            const used = covers * 0.2 / ingredients.length;
            building.inventory[ing.id] = Math.max(0, (building.inventory[ing.id] || 0) - used);
          }
        }
        building.supply = ingredients.reduce((sum, ing) => sum + (building.inventory[ing.id] || 0), 0);
      }

      // ── Menu P&L ──
      let menuRevenue = 0;
      let menuFoodCost = 0;
      for (const item of active) {
        const share = item.popularity / weight;
        const itemCovers = covers * share;
        menuRevenue += itemCovers * item.price * building.pricingMultiplier;
        menuFoodCost += itemCovers * (item.foodCost + (item.includesToy ? KIDS_TOY_COST : 0));
      }

      building.revenue = menuRevenue;
      building.cogs = menuFoodCost;
      building.lastUnitsSold = covers;
      building.customerTraffic = localTraffic;
      building.demand = seatCapacity * 14;
      // Loyalty softens demand shocks: regulars keep coming back.
      building.loyalCustomerBase = Math.min(1, building.loyalCustomerBase + (covers > 0 ? 0.0004 : -0.0008));
      building.utilization = Math.min(100, covers / Math.max(0.001, seatCapacity) * 100);
      building.operatingCost += building.adBudget / 720;
    }

    // ── Seaport: dynamic world-market intermediary ──
    // Ports pull revenue from every unit they ship into the city. Stock is
    // replenished monthly (see replenishSeaports); it does NOT teleport.
    // Revenue is booked when a buyer's contract actually orders from the port,
    // recorded via building.marketUnitsSold below.
    else if (building.type === 'seaport') {
      const totalStock = building.products.reduce((sum, pid) => sum + (building.inventory[pid] ?? 0), 0);
      const totalCapacity = building.products.length * (building.capacity ?? 300000);
      building.utilization = Math.min(100, (1 - totalStock / Math.max(1, totalCapacity)) * 100);
      building.supply = totalStock;
      // Port operating cost: crane labour, customs, dock maintenance
      // — significant, but far below revenue when active.
      building.operatingCost = building.employees * city.wageRate * 0.34
        + building.constructionCost * 0.0000045;
      // Revenue/COGS are booked directly when a buyer dispatches goods from
      // the port. Do not synthesize revenue from stored inventory.
      building.revenue = 0;
      building.cogs = 0;
      building.marketUnitsSold *= 0.98; // rolling throughput indicator
    }

    // ═══ APARTMENTS ═══════════════════════════════════════════════════════
    // Tenants are an integer count that grows or shrinks by at most 1 per
    // day. Demand depends on the city's population, unemployment, nearby
    // amenities (retail, parks), the quality of the building, and the
    // price relative to local wages. A new building starts at 0 tenants
    // and fills over months — there is no instant occupancy.
    else if (building.type === 'apartment') {
      const capRate = 0.045 + Math.min(0.025, (city.qualityOfLife / 100) * 0.025);
      const capRateRent = (building.constructionCost + building.landValue) * capRate / 12 / Math.max(1, building.capacity);
      const affordability = city.wageRate * 173 * 0.30 * 1.08 * (0.5 + city.qualityOfLife / 200);
      const marketRent = Math.min(capRateRent, affordability);
      building.rentPerUnit = Math.max(25, marketRent * building.rentMultiplier);

      // ── Demand drivers ──
      // Population pressure: how many people in this city need housing.
      const housingShortage = Math.max(0, -city.housingDemand) / 100;
      // Employment: unemployed people can't sign leases.
      const employmentFactor = 1 - city.unemploymentRate / 100 * 0.8;
      // Surroundings: nearby retail/commercial/parks raise appeal.
      const nearby = queryRadius(index, building.x, building.y, 8);
      const amenityBonus = Math.min(0.4,
        nearby.filter(b => b.type === 'retail_store').length * 0.06 +
        nearby.filter(b => b.type === 'commercial').length * 0.04 +
        nearby.filter(b => b.type === 'hq' || b.type === 'rd_center').length * 0.08);
      // Building quality: level and condition.
      const qualityFactor = 0.5 + (building.level / building.maxLevel) * 0.3
        + (building.condition / 100) * 0.2;
      // Price sensitivity: high rent drives tenants away.
      const priceFactor = Math.max(0.2, 1.3 - building.rentMultiplier * 0.5);
      // Competition: other apartments nearby split the pool.
      const competitors = nearby.filter(b => b.type === 'apartment' && b.id !== building.id).length;
      const shareOfPool = 1 / (1 + competitors * 0.3);

      // Target tenants draw from the city's renter-household pool. About 35%
      // of households rent; corporate apartment blocks compete for that pool,
      // while background housing represents owner-occupied/small-landlord stock.
      const renterHouseholds = city.population / 2.4 * 0.35;
      const corporateUnits = (index.buildingsByCity.get(city.id) ?? [])
        .filter(b => b.type === 'apartment')
        .reduce((sum, b) => sum + b.capacity, 0);
      const renterPressure = Math.min(1.4,
        renterHouseholds / Math.max(1, corporateUnits));
      const targetTenants = Math.round(building.capacity
        * Math.min(1, (0.25 + housingShortage * 0.35 + amenityBonus + renterPressure * 0.35)
          * employmentFactor * qualityFactor * priceFactor * shareOfPool));

      // ── Lease dynamics: tenants move in/out slowly ──
      // At most +2/day in (lease signing) or -1/day out (notice + 3-month
      // tail). This means a 100-unit building takes ~2 months to fill.
      if (state.hour === 0) {
        if (building.tenants < targetTenants) {
          const moveIns = Math.min(2, targetTenants - building.tenants);
          building.tenants += moveIns;
        } else if (building.tenants > targetTenants + 3) {
          // Tenants give notice; they leave after the lease expiry.
          if (building.leaseExpiryTick === 0 || state.tick > building.leaseExpiryTick) {
            building.tenants = Math.max(0, building.tenants - 1);
            building.leaseExpiryTick = state.tick + 24 * 30 * 3; // 3 months
          }
        }
        building.tenants = Math.max(0, Math.min(building.capacity, building.tenants));
      }

      building.occupancy = building.capacity > 0
        ? (building.tenants / building.capacity) * 100 : 0;
      building.utilization = building.occupancy;
      building.revenue = building.rentPerUnit * building.tenants / 720;
      building.landValue *= 1 + (state.economy.inflation + state.economy.gdpGrowth) / 100 / (365 * 24);
    }

    // ═══ COMMERCIAL ═════════════════════════════════════════════════════
    // Same tenant model but driven by business confidence + CBD proximity.
    else if (building.type === 'commercial') {
      const capRate = 0.04 + Math.min(0.04, city.wageRate / 45 * 0.04);
      const marketRent = (building.constructionCost + building.landValue) * capRate / 12 / Math.max(1, building.capacity);
      building.rentPerUnit = marketRent * building.rentMultiplier;

      const cbdDist = Math.hypot(building.x - city.x, building.y - city.y);
      const locationFactor = Math.max(0.2, 1 - cbdDist / 20);
      const businessDemand = state.economy.businessConfidence / 100;
      const priceFactor = Math.max(0.2, 1.3 - building.rentMultiplier * 0.5);
      const qualityFactor = 0.5 + (building.level / building.maxLevel) * 0.3
        + (building.condition / 100) * 0.2;

      const targetTenants = Math.round(building.capacity
        * Math.min(1, locationFactor * businessDemand * priceFactor * qualityFactor));

      if (state.hour === 0) {
        if (building.tenants < targetTenants) {
          building.tenants = Math.min(building.capacity, building.tenants + Math.min(2, targetTenants - building.tenants));
        } else if (building.tenants > targetTenants + 2) {
          if (building.leaseExpiryTick === 0 || state.tick > building.leaseExpiryTick) {
            building.tenants = Math.max(0, building.tenants - 1);
            building.leaseExpiryTick = state.tick + 24 * 30 * 3;
          }
        }
        building.tenants = Math.max(0, Math.min(building.capacity, building.tenants));
      }

      building.occupancy = building.capacity > 0
        ? (building.tenants / building.capacity) * 100 : 0;
      building.utilization = building.occupancy;
      building.revenue = building.rentPerUnit * building.tenants / 720;
    }

    // Warehouse
    else if (building.type === 'warehouse') {
      const stored = Object.values(building.inventory).reduce((s, v) => s + v, 0);
      building.utilization = Math.min(100, stored / building.inventoryCapacity * 100);
      building.supply = stored;
      // No free storage income. A warehouse profits from the wholesale margin
      // it earns when downstream firms buy through it (handled in the supply
      // chain). Parking goods here previously paid 0.55/unit/day out of thin
      // air — a ~90%/yr money printer with seaport goods.
      building.revenue = 0;
    }

    // ═══ HQ / R&D: empty on day one, staffed by hiring ═══════════════════
    // Headquarters provides company-wide productivity multipliers from
    // executives (they need to actually be hired at a skill level).
    // R&D centres run research projects; progress scales with researcher skill.
    else if (building.type === 'hq' || building.type === 'rd_center') {
      const hasStaff = building.employees > 0;
      // HQ boosts: +2% productivity per executive-level employee (max +40%).
      // Value comes from OTHER buildings producing more — no free revenue.
      if (building.type === 'hq') {
        building.utilization = hasStaff ? 82 : 0;
        if (!hasStaff) building.operatingCost *= 0.3; // empty office, minimal cost
        else building.operatingCost *= 1.2; // administrators cost more than base
      } else {
        building.utilization = hasStaff ? 92 : 0;
        // R&D generates output only if staffed; progress depends on skill.
        if (!hasStaff) building.operatingCost *= 0.25;
      }
    }

    // Employee satisfaction ramp
    const overwork = Math.max(0, building.utilization - 88) / 100;
    const satTarget = Math.max(10, Math.min(100,
      50 + (building.trainingBudget - 0.5) * 60 + building.trainingLevel * 3.2 - overwork * 90 + (building.condition - 60) * 0.15));
    building.employeeSatisfaction += (satTarget - building.employeeSatisfaction) * 0.005;

    updateEffectiveTraining(building, 24 * 30);

    // HQ executive effectiveness lifts revenue/output across the operating group.
    if (building.type !== 'hq') {
      const hqBoost = (index.buildingsByCompany.get(building.companyId) ?? [])
        .filter(item => item.type === 'hq' && item.employees > 0)
        .reduce((sum, hq) => sum + hq.employees * hq.staffSkill * 0.004, 0);
      building.revenue *= 1 + Math.min(0.4, hqBoost);
    }

    // ── Universal detailed cost ledger ──
    const assessedValue = building.constructionCost + building.landValue;
    const annualHourly = 1 / (365 * 24);
    const monthlyHourly = 1 / 720;
    const isCustomerFacing = building.type === 'retail_store' || isHospitality(building.type);
    const freightInCogs = isCustomerFacing
      ? building.lastUnitsSold * (building.freightCost / Math.max(1, building.supplierLinks.length)) : 0;
    const utilities = building.type === 'apartment' || building.type === 'commercial'
      ? building.tenants * 45 * monthlyHourly
      : (building.employees * 140 + building.capacity * (building.type === 'factory' || building.type === 'farm' || building.type === 'mine' ? 0.5 : 0.12)) * monthlyHourly;
    const insurance = assessedValue
      * (building.type === 'factory' || building.type === 'mine' ? 0.009 : 0.0035)
      * annualHourly;
    const permits = (building.type === 'restaurant' || building.type === 'bar' ? 450
      : building.type === 'factory' || building.type === 'mine' ? 750 : 100) * monthlyHourly;
    const equipment = building.constructionCost * 0.006 * annualHourly;
    const marketing = building.adBudget * monthlyHourly;
    const payrollBurden = wageCost * 0.28;
    const cardFees = isCustomerFacing ? building.revenue * 0.025 : 0;
    const packaging = isCustomerFacing ? building.lastUnitsSold * 0.08 : 0;
    const accountingLegal = Math.max(100 * monthlyHourly, building.revenue * 0.005);
    const propertyTax = assessedValue * state.government.propertyTaxRate * annualHourly;
    const municipalFees = (building.type === 'apartment' || building.type === 'commercial')
      ? building.tenants * 12 * monthlyHourly : 0;
    const reserveContribution = (building.type === 'apartment' || building.type === 'commercial')
      ? assessedValue * building.reserveRate * annualHourly : 0;
    // Preserve environmental/carbon or special branch costs not represented above.
    const knownPrior = wageCost + maintenance + trainingCost + realEstateOpex + marketing;
    const other = Math.max(0, building.operatingCost - knownPrior);

    building.costBreakdown = {
      rentMortgage: 0, // corporate-owned asset; financing sits at company level
      utilities,
      inventoryStock: Math.max(0, building.cogs - freightInCogs),
      staffWages: wageCost,
      payrollTaxesBenefits: payrollBurden,
      marketingAdvertising: marketing,
      equipment,
      insurance,
      licensesPermits: permits,
      maintenanceRepairs: maintenance,
      cardProcessing: cardFees,
      packagingBags: packaging,
      accountingLegal,
      propertyTax,
      municipalFees,
      reserveContribution,
      freight: Math.max(0, freightInCogs),
      other,
    };
    building.operatingCost = wageCost + payrollBurden + utilities + marketing
      + equipment + insurance + permits + maintenance + cardFees + packaging
      + accountingLegal + propertyTax + municipalFees + reserveContribution + other;

    building.profit = building.revenue - building.cogs - building.operatingCost;
    // ── Catastrophic failure: when condition drops low, the site breaks down ──
    // Real assets deteriorate under stress: corners cut, machines wear, the
    // roof leaks. Neglect long enough and the plant goes dark, restoring
    // required capex to keep operating.
    if (building.condition < 25) {
      const breakdownChance = (25 - building.condition) / 1000;
      if (Math.random() < breakdownChance) {
        building.isOperating = false;
        addNotification(state, {
          id: generateId(),
          message: `${building.name} suffered a catastrophic failure — repair before resuming operations.`,
          type: 'danger', tick: state.tick,
        });
      }
    }
    // Accumulate for daily snapshot
    building.revenueAccum += building.revenue;
    building.cogsAccum += building.cogs;
    building.opexAccum += building.operatingCost;
    building.profitAccum += building.profit;
    building.utilizationAccum += building.utilization;
    building.soldUnitsAccum += building.lastUnitsSold;
    building.producedUnitsAccum += building.lastUnitsProduced;
    building.condition = Math.max(20, building.condition - 0.00015);
  }
}

// ============= COMPANIES =============
function simulateCompanies(state: GameState, index: StateIndex): void {
  for (const company of state.companies) {
    const cbldgs = index.buildingsByCompany.get(company.id) ?? [];
    let totalRevenue = 0, totalExpenses = 0, bookValue = 0;
    for (const b of cbldgs) {
      bookValue += b.constructionCost + b.landValue;
      if (b.isOperating) { totalRevenue += b.revenue; totalExpenses += b.operatingCost + b.cogs; }
    }
    company.revenue = totalRevenue;
    company.expenses = totalExpenses;
    company.profit = totalRevenue - totalExpenses;
    company.cash += company.profit;
    // Accumulate for daily snapshot
    company.revenueAccum += totalRevenue;
    company.profitAccum += company.profit;
    company.expensesAccum += totalExpenses;
    // Pre-tax profit accrues hour by hour toward the annual tax assessment.
    company.pretaxProfitYTD += company.profit;
    // Expected earnings: a smoothed, slightly optimistic read of the run-rate.
    const annualRunRate = company.profit * 24 * 365;
    company.expectedEarnings = company.expectedEarnings * 0.9 + annualRunRate * 0.1;

    // Portfolio value
    let portfolioValue = 0;
    for (const [assetId, units] of Object.entries(company.assetHoldings)) {
      const asset = state.tradedAssets.find(a => a.id === assetId);
      if (asset && units > 0) portfolioValue += asset.price * units;
    }

    const landValue = state.landHoldings
      .filter(holding => holding.ownerId === company.id && !holding.developedBuildingId)
      .reduce((sum, holding) => sum + holding.currentValue, 0);
    const equityValue = Object.entries(company.equityHoldings).reduce((sum, [id, shares]) => {
      const held = state.companies.find(item => item.id === id);
      return sum + (held ? held.sharePrice * shares : 0);
    }, 0);
    company.totalAssets = company.cash + bookValue + landValue + portfolioValue + equityValue;
    company.marketCap = company.sharePrice * company.sharesOutstanding;
    company.operatingCashFlow += company.profit;

    if (company.isPlayer) {
      state.player.netWorth = state.player.cash + company.cash + bookValue + landValue
        + playerPortfolioValue(state) + equityValue - company.debt;
    }
  }
  // Nominal GDP = annualised value added across every operating business.
  let grossOutput = 0;
  for (const b of state.buildings) {
    if (!b.isOperating || b.companyId === 'system') continue;
    const valueAdded = b.revenue - b.cogs;
    if (valueAdded > 0) grossOutput += valueAdded;
  }
  const annualised = grossOutput * 24 * 365;
  state.economy.nominalGdp = state.economy.nominalGdp * 0.9 + annualised * 0.1;
}

// ============= CITIES =============
function simulateCities(state: GameState, index: StateIndex): void {
  if (state.hour !== 0) return; // once per day
  for (const city of state.cities) {
    const cityBuildings = index.buildingsByCity.get(city.id) ?? [];
    const jobs = city.backgroundJobs + cityBuildings.reduce((s, b) => s + b.employees, 0);
    const corporateHousing = cityBuildings
      .filter(b => b.type === 'apartment')
      .reduce((s, b) => s + b.capacity, 0);
    const housingCapacity = city.backgroundHousingUnits + corporateHousing;

    const labourForce = city.population * 0.48;
    const jobShortfall = Math.max(0, labourForce - jobs) / Math.max(1, labourForce) * 100;
    const cyclicalPenalty = state.economy.cycle === 'recession' ? 3
      : state.economy.cycle === 'boom' ? -1 : 0;
    const targetUnemployment = Math.max(2, Math.min(25,
      3 + jobShortfall * 0.75 + cyclicalPenalty));
    city.unemploymentRate += (targetUnemployment - city.unemploymentRate) * 0.05;

    const housedPeople = housingCapacity * 2.4;
    city.housingDemand = Math.max(-100, Math.min(100,
      (housedPeople - city.population) / Math.max(1, city.population) * 100));

    const civicScore = cityBuildings.reduce((s, b) => s + (b.type === 'hq' ? 2 : 0), 0);
    // Pollution erodes liveability, which feeds back into migration and rents.
    city.qualityOfLife = Math.max(20, Math.min(100,
      52 + civicScore - city.unemploymentRate * 1.4 - Math.max(0, city.pollution - 25) * 0.35));
    city.trafficLevel = Math.max(12, Math.min(100, 24 + cityBuildings.length * 1.2 + Math.min(40, city.population / 3000)));

    // Demographics: births, deaths, migration
    const affluence = city.wageRate / 30;
    const educationDrag = city.educationIndex / 100;
    const youthBonus = Math.max(0, (38 - city.medianAge) / 38);
    const recessionDelay = state.economy.cycle === 'recession' ? 0.86 : 1;
    city.birthRate = Math.max(6, Math.min(28,
      (17 - affluence * 3.2 - educationDrag * 4.5 + youthBonus * 6 + city.familyShare * 5) * recessionDelay));
    city.deathRate = Math.max(4.5, Math.min(16, 4.5 + Math.max(0, city.medianAge - 28) * 0.28));
    city.naturalIncrease = city.birthRate - city.deathRate;

    // Overcrowding is allowed: the population only stops growing once it
    // exceeds 2.2x housed capacity — it never gets forced out of town, so a
    // metro doesn't implode because the AI under-built apartments.
    const maxPop = Math.max(city.population, housedPeople * 2.2);
    const nationalWage = state.cities.reduce((s, c) => s + c.wageRate, 0) / Math.max(1, state.cities.length);
    const wagePull = (city.wageRate / Math.max(1, nationalWage) - 1) * 22;
    const jobPull = (6 - city.unemploymentRate) * 1.8;
    const amenityPull = (city.qualityOfLife - 55) * 0.14;
    // Negative externality: smog repels migrants and raises mortality.
    const pollutionDrag = -Math.max(0, city.pollution - 30) * 0.12;
    const desiredMigration = wagePull + jobPull + amenityPull + pollutionDrag;
    const headroom = (maxPop - city.population) / Math.max(1, city.population) * 1000;
    city.netMigrationRate = desiredMigration > 0 ? Math.min(desiredMigration, Math.max(0, headroom)) : desiredMigration;

    const perDay = 1 / 365;
    const births = city.population * (city.birthRate / 1000) * perDay;
    // Pollution raises effective mortality (respiratory illness) above 30.
    const pollutionMortality = Math.max(0, city.pollution - 30) * 0.02;
    const deaths = city.population * ((city.deathRate + pollutionMortality) / 1000) * perDay;
    const migrants = city.population * (city.netMigrationRate / 1000) * perDay;
    city.population = Math.max(500, Math.round(city.population + births - deaths + migrants));

    const ageingPressure = (city.deathRate - city.birthRate) * 0.0000009 * 24;
    const migrantYouth = migrants > 0 ? -Math.abs(migrants) / Math.max(1, city.population) * 4 : 0;
    city.medianAge = Math.max(22, Math.min(52, city.medianAge + ageingPressure + migrantYouth + perDay * 8));

    city.growthRate = (city.naturalIncrease + city.netMigrationRate) / 10;

    city.gdpPerCapita *= 1 + (state.economy.gdpGrowth + state.economy.inflation) / 100 / 365;

    if (state.day === 1) {
      city.populationHistory.push(city.population);
      if (city.populationHistory.length > 120) city.populationHistory.shift();
    }
  }
  state.economy.unemployment = state.cities.reduce((s, c) => s + c.unemploymentRate, 0) / Math.max(1, state.cities.length);
}

// ============= FREIGHT =============
function simulatePortShipments(state: GameState): void {
  const completed = new Set<string>();
  for (const shipment of state.portShipments) {
    shipment.progress = Math.min(100,
      shipment.progress + 100 / Math.max(1, shipment.transitHours));
    if (shipment.progress < 100) continue;
    const port = state.buildings.find(building => building.id === shipment.portBuildingId);
    if (port?.type === 'seaport') {
      port.inventory[shipment.productId] = Math.min(port.inventoryCapacity,
        (port.inventory[shipment.productId] ?? 0) + shipment.amount);
    }
    completed.add(shipment.id);
  }
  state.portShipments = state.portShipments.filter(shipment => !completed.has(shipment.id));
}


// ============= SUPPLY CHAIN PIPELINE & COLD-CHAIN PROCESSING =============
/**
 * Simulates processing delay (slaughterhouse/packaging/inspection) and
 * cold-chain transit for B2B supply orders. Handles quality rejections and
 * spoilage for perishable goods when pipeline delay exceeds 5 days (120h).
 */
function simulatePipelineOrders(state: GameState): void {
  const completedIds = new Set<string>();
  
  for (const order of state.pipelineOrders) {
    if (order.processingHoursRemaining > 0) {
      order.processingHoursRemaining -= 1;
    } else if (order.transitHoursRemaining > 0) {
      order.transitHoursRemaining -= 1;
    }

    // When transit is active, update or spawn visual freight route
    if (order.processingHoursRemaining <= 0 && order.transitHoursRemaining > 0) {
      const p = 100 - (order.transitHoursRemaining / Math.max(1, order.totalHours)) * 100;
      let existingRoute = state.freight.find(f => f.id === order.id);
      if (!existingRoute) {
        const fromB = state.buildings.find(b => b.id === order.fromBuildingId);
        const toB = state.buildings.find(b => b.id === order.toBuildingId);
        if (fromB && toB) {
          const dist = Math.max(1, Math.hypot(fromB.x - toB.x, fromB.y - toB.y));
          state.freight.push({
            id: order.id, fromBuildingId: order.fromBuildingId, toBuildingId: order.toBuildingId,
            good: order.productId, amount: order.amount, progress: p, distance: dist,
            freightCost: order.freightCost, status: 'in_transit',
          });
        }
      } else {
        existingRoute.progress = Math.min(99, p);
      }
    }

    // Order arrived!
    if (order.processingHoursRemaining <= 0 && order.transitHoursRemaining <= 0) {
      completedIds.add(order.id);
      const buyer = state.buildings.find(b => b.id === order.toBuildingId);
      const supplier = state.buildings.find(b => b.id === order.fromBuildingId);
      const product = state.products.find(p => p.id === order.productId);
      
      if (buyer && product) {
        const contract = buyer.supplierLinks.find(link => link.contractId === order.contractId && link.active)
          || buyer.supplierLinks.find(link => link.productId === order.productId && link.supplierBuildingId === order.fromBuildingId);

        // Quality specification inspection
        let rejectedUnits = 0;
        if (contract && contract.rejectionRate > 0) {
          if (Math.random() < contract.rejectionRate) {
            rejectedUnits = Math.round(order.amount * (0.10 + Math.random() * 0.15));
            if (supplier) supplier.spoilageLossYTD += rejectedUnits * order.unitCost;
            contract.reliability = Math.max(0, contract.reliability - 8);
          }
        }

        // Spoilage risk for perishable goods if total pipeline time > 120h (5 days)
        let spoiledUnits = 0;
        if (order.isPerishable && order.totalHours > 120) {
          const hoursOver = order.totalHours - 120;
          const rate = Math.min(0.50, 0.10 + hoursOver * 0.005);
          spoiledUnits = Math.round((order.amount - rejectedUnits) * rate);
          buyer.spoilageLossYTD += spoiledUnits * order.unitCost;
        }

        const netAccepted = Math.max(0, order.amount - rejectedUnits - spoiledUnits);
        buyer.inventory[order.productId] = Math.min(buyer.inventoryCapacity, (buyer.inventory[order.productId] || 0) + netAccepted);
        buyer.supplyDisrupted = false;

        if (contract) {
          contract.deliveries += 1;
          contract.onTimeDeliveries += 1;
          contract.punctuality = (contract.onTimeDeliveries / contract.deliveries) * 100;
          contract.reliability = Math.min(100, contract.reliability + 1.5);
        }

        if (rejectedUnits > 0 || spoiledUnits > 0) {
          const buyerCo = state.companies.find(c => c.id === buyer.companyId);
          if (buyerCo?.isPlayer) {
            let msg = `${buyer.name} received shipment of ${product.name}: ${netAccepted.toLocaleString()} units accepted.`;
            if (rejectedUnits > 0) msg += ` ${rejectedUnits.toLocaleString()} rejected for quality spec.`;
            if (spoiledUnits > 0) msg += ` ${spoiledUnits.toLocaleString()} spoiled during ${order.totalHours}h transit.`;
            addNotification(state, { id: generateId(), message: msg, type: 'warning', tick: state.tick });
          }
        }
      }
      
      // Clean up visual freight truck
      state.freight = state.freight.filter(f => f.id !== order.id);
    }
  }

  state.pipelineOrders = state.pipelineOrders.filter(o => !completedIds.has(o.id));
}

function simulateFreightRoutes(state: GameState): void {
  const completed: string[] = [];
  // Route congestion: many simultaneous shipments slow each other and raise costs.
  const congestion = Math.min(2, state.freight.length / 50);
  for (const route of state.freight) {
    route.progress = Math.min(100, route.progress
      + Math.max(1.2, 100 / Math.max(5, route.distance * 1.4)) / (1 + congestion * 0.6));
    if (route.progress >= 100) {
      route.status = 'delivered';
      completed.push(route.id);
      const buyer = state.buildings.find(b => b.id === route.toBuildingId);
      if (buyer) {
        buyer.inventory[route.good] = (buyer.inventory[route.good] || 0) + route.amount;
        const contract = buyer.supplierLinks.find(link =>
          link.productId === route.good && link.supplierBuildingId === route.fromBuildingId && link.active);
        if (contract) {
          contract.onTimeDeliveries += 1;
          contract.punctuality = contract.deliveries > 0
            ? contract.onTimeDeliveries / contract.deliveries * 100 : 100;
          contract.reliability = Math.min(100, contract.reliability + 1.5);
          buyer.supplyDisrupted = false;
        }
      }
    } else {
      route.status = 'in_transit';
    }
  }
  state.freight = state.freight.filter(r => !completed.includes(r.id));
}

// ============= STOCK MARKET =============
function simulateStockMarket(state: GameState): void {
  const sm = state.stockMarket;
  const eco = state.economy;
  const drift = eco.gdpGrowth * 0.002 + (eco.consumerConfidence - 50) * 0.0003;
  const noise = (Math.random() - 0.5) * sm.index * 0.001;
  sm.index = Math.max(1000, sm.index + drift * sm.index + noise);
  sm.interestRate = eco.interestRate;
  sm.inflationRate = eco.inflation;
  sm.sentiment = eco.consumerConfidence > 65 ? 'bullish' : eco.consumerConfidence < 40 ? 'bearish' : 'neutral';

  if (state.tick % 240 === 0) {
    sm.indexHistory.push(sm.index);
    if (sm.indexHistory.length > 240) sm.indexHistory.shift();
  }

  for (const company of state.companies) {
    // ── Forward-looking valuation ──
    // Markets discount expected future earnings, not the last print. Book
    // value anchors the floor; the P/E multiple rides on the surprise against
    // expectations — and misses punish harder than beats reward.
    const realisedAnnual = company.profit * 24 * 365;
    const expected = company.expectedEarnings || realisedAnnual;
    const surprise = expected !== 0 ? (realisedAnnual - expected) / Math.abs(expected) : 0;
    // Asymmetric: a miss costs 1.8x what a beat earns.
    const asymmetric = surprise < 0 ? surprise * 1.8 : surprise * 0.9;
    const bookPerShare = Math.max(0.5, (company.totalAssets - company.debt) / company.sharesOutstanding);

    // Sentiment regime: euphoria inflates multiples, panic deflates them.
    const sentimentMultiple = sm.sentiment === 'bullish' ? 1.25 : sm.sentiment === 'bearish' ? 0.8 : 1;
    const growthExpectation = 1 + Math.max(-0.06, Math.min(0.06, asymmetric * 0.5 + eco.gdpGrowth * 0.005));

    const target = Math.max(bookPerShare * 0.9,
      bookPerShare * sentimentMultiple * growthExpectation * (1 + Math.max(0, surprise) * 0.25));
    // Smooth, not instant — prices grind toward the target.
    company.sharePrice = Math.max(0.5, company.sharePrice + (target - company.sharePrice) * 0.05
      + (Math.random() - 0.5) * company.sharePrice * 0.004);
    if (company.sharePrice < 1) {
      // Stock merge: reverse split keeps the bid above $1.00.
      company.sharePrice *= 10;
      company.sharesOutstanding = Math.max(1, Math.floor(company.sharesOutstanding / 10));
    }
    company.marketCap = company.sharePrice * company.sharesOutstanding;
  }
}

// ============= AI COMPANIES =============

function simulatePlayerBehaviors(state: GameState): void {
  const player = state.companies.find(c => c.isPlayer);
  if (!player) return;

  if (player.cash < 0) {
    player.monthsInDistress += 1;
    if (player.monthsInDistress === 1) {
      addNotification(state, { id: generateId(), message: `WARNING: Negative cash balance. You have 3 months to secure funding before forced liquidation.`, type: 'danger', tick: state.tick });
    } else if (player.monthsInDistress >= 4) {
      // Forced liquidation of most valuable asset
      const assets = state.buildings.filter(b => b.companyId === player.id && b.type !== 'hq');
      if (assets.length > 0) {
        // Sort by value descending
        assets.sort((a, b) => (b.constructionCost + b.landValue) - (a.constructionCost + a.landValue));
        const target = assets[0];
        const salvage = target.constructionCost * 0.4 + target.landValue * 0.8;
        player.cash += salvage;
        player.buildings = player.buildings.filter(id => id !== target.id);
        state.buildings = state.buildings.filter(x => x.id !== target.id);
        invalidateRoadCache(target.cityId);
        addNotification(state, { id: generateId(), message: `FORCED LIQUIDATION: ${target.name} sold at fire-sale prices for $${formatMoney(salvage)} to cover debts.`, type: 'danger', tick: state.tick });
        addNewsTicker(state, `${player.name} forced to liquidate assets due to insolvency`, 'breaking');
      } else if (player.debt > 0) {
          // If no assets and still in debt, write down debt to simulate bankruptcy proceedings
          const writedown = player.debt * 0.5;
          player.debt -= writedown;
          player.cash += writedown; // offset the negative cash
          player.bondRating = 'D';
          addNotification(state, { id: generateId(), message: `BANKRUPTCY: Debts restructured. Bond rating downgraded to D.`, type: 'danger', tick: state.tick });
      }
    }
  } else {
    player.monthsInDistress = 0;
  }
}

function simulateAICompanies(state: GameState): void {
  for (const company of state.companies) {
    if (company.isPlayer) continue;

    // ── Recruitment ──
    // Buildings open empty. AI firms recruit gradually and keep six months of
    // payroll liquidity before adding staff.
    for (const building of state.buildings.filter(item => item.companyId === company.id)) {
      if (building.employees >= building.targetEmployees) continue;
      const city = state.cities.find(item => item.id === building.cityId);
      if (!city) continue;
      const hires = Math.min(
        company.skill === 'ruthless' ? 3 : company.skill === 'shrewd' ? 2 : 1,
        building.targetEmployees - building.employees,
      );
      const salary = city.wageRate * 2080 * (0.9 + company.acumen * 0.35);
      const recruitingCost = salary * hires * 0.08;
      const sixMonthsPayroll = salary * (building.employees + hires) * 0.5;
      if (company.cash < recruitingCost + sixMonthsPayroll) continue;
      company.cash -= recruitingCost;
      const oldPayroll = building.averageAnnualSalary * building.employees;
      building.employees += hires;
      building.averageAnnualSalary = (oldPayroll + salary * hires) / building.employees;
      building.staffSkill = Math.min(9,
        (building.staffSkill * (building.employees - hires) + (1 + company.acumen * 5) * hires)
        / building.employees);
    }

    // Expansion
    const appetite = company.aiStrategy === 'aggressive' ? 0.75 : company.aiStrategy === 'conservative' ? 0.55 : 0.65;
    const sentimentGate = Math.max(0.25, Math.min(0.9, company.sentiment / 1.5));
    // AI attempts to expand this month with probability = appetite × sentiment × skill.
    const buildChance = appetite * sentimentGate * (0.5 + company.acumen * 0.5);
    const bleeding = company.monthsInDistress > 0 || (company.profit < 0 && company.cash < company.expenses * 24 * 30 * 3);

    // ── M&A: acquire listed institutional buildings when they are cheap ──
    // Skilled boards scan the property market and pounce on undervalued
    // listings. This makes buildings actually change hands.
    if (!bleeding && company.acumen > 0.4 && Math.random() < 0.25) {
      const bargains = state.buildings
        .filter(b => b.forSale && b.companyId !== company.id
          && b.askingPrice > 0 && b.askingPrice < b.monthlyFairValue * 1.05
          && company.cash > b.askingPrice * 1.15);
      if (bargains.length > 0) {
        const target = bargains[Math.floor(Math.random() * bargains.length)];
        const salePrice = target.askingPrice;
        const seller = state.companies.find(c => c.id === target.companyId);
        if (seller) seller.buildings = seller.buildings.filter(id => id !== target.id);
        company.cash -= salePrice;
        company.investingCashFlow -= salePrice;
        if (seller && !seller.isPlayer) seller.cash += salePrice;
        target.companyId = company.id;
        transferDevelopmentTitle(state, target.id, company.id);
        target.forSale = false;
        target.askingPrice = 0;
        target.purchasePrice = salePrice;
        target.acquiredAtTick = state.tick;
        company.buildings.push(target.id);
        addNewsTicker(state, `${company.name} acquires ${target.name} on the open market`, 'info');
      }
    }

    // Asset-less novices bootstrap with a small, expensive startup loan. They
    // are not gifted a building and can still fail before opening one.
    if (company.buildings.length === 0 && company.cash < 350_000 && company.debt < 1_000_000) {
      const startupLoan = Math.min(250_000, 1_000_000 - company.debt);
      company.cash += startupLoan;
      company.debt += startupLoan;
      company.interestRate = state.economy.interestRate + 8;
    }

    if (company.cash > 300_000 && !bleeding && Math.random() < buildChance) {
      const preferredByFocus: Record<Company['sectorFocus'], BuildingType[]> = {
        retail: ['retail_store', 'warehouse'],
        industrial: ['farm', 'factory', 'warehouse'],
        real_estate: ['apartment', 'commercial'],
        hospitality: ['cafe', 'fast_food', 'restaurant', 'bar'],
        diversified: ['retail_store', 'apartment', 'factory', 'warehouse', 'cafe', 'farm'],
      };
      const preferred = preferredByFocus[company.sectorFocus];

      let best: { city: City; type: BuildingType; score: number } | null = null;
      for (const city of state.cities) {
        const cbldgs = state.buildings.filter(b => b.cityId === city.id);
        const popM = city.population / 1_000_000;
        for (const type of preferred) {
          const existing = cbldgs.filter(b => b.type === type).length;
          const carrying = type === 'apartment' ? 6 + popM * 300
            : type === 'commercial' ? 4 + popM * 150
            : type === 'warehouse' ? 2 + popM * 100
            : type === 'retail_store' ? 4 + popM * 200
            : 3 + popM * 150;
          if (existing >= carrying) continue;
          const headroom = 1 - existing / carrying;
          let demandSignal = 0.5;
          if (type === 'apartment') demandSignal = Math.max(0, -city.housingDemand) / 100;
          else if (type === 'retail_store') demandSignal = (city.trafficLevel / 100) * (city.wageRate / 45);
          const costDrag = type === 'factory' || type === 'warehouse' ? city.wageRate / 45 : (city.wageRate / 45) * 0.4;
          const noise = 1 + (Math.random() - 0.5) * 2 * (1 - company.acumen);
          const score = headroom * (0.5 + demandSignal) * (1.4 - costDrag) * noise;
          if (!best || score > best.score) best = { city, type, score };
        }
      }
      const investmentThreshold = 0.48 + (1 - company.acumen) * 0.18;
      if (best && best.score > investmentThreshold && best.type !== 'mine') {
        const cfg = BUILDING_CONFIGS[best.type];
        const compatibleZones: ZoneType[] = best.type === 'factory' || best.type === 'warehouse'
          ? ['industrial', 'mixed']
          : best.type === 'apartment' ? ['residential', 'mixed']
          : ['commercial', 'mixed'];
        const parcel = state.landHoldings.find(holding =>
          holding.ownerId === company.id && holding.cityId === best!.city.id
          && !holding.developedBuildingId && compatibleZones.includes(holding.zone));
        const landSaving = parcel ? parcel.currentValue : 0;
        const cost = Math.max(cfg.cost * 0.62,
          cfg.cost * best.city.landCostMultiplier - landSaving);
        if (company.cash >= cost * 1.5) {
          const building = createBuilding(best.type, company.id, best.city, state.products,
            parcel?.x, parcel?.y, state.cities, state.year);
          building.constructionCost = cost + landSaving;
          building.constructionEndsTick = state.tick + (CONSTRUCTION_LEAD_DAYS[best.type] ?? 60) * 24;
          building.landValue = landSaving || building.landValue;
          company.cash -= cost;
          company.investingCashFlow -= cost;
          state.buildings.push(building);
          company.buildings.push(building.id);
          if (parcel) {
            parcel.developedBuildingId = building.id;
          } else {
            const zone: ZoneType = best.type === 'apartment' ? 'residential'
              : best.type === 'factory' || best.type === 'warehouse' ? 'industrial'
              : 'commercial';
            state.landHoldings.push({
              id: generateId(), ownerId: company.id, cityId: best.city.id,
              x: Math.round(building.x), y: Math.round(building.y), zone,
              purchasePrice: building.landValue, currentValue: building.landValue,
              purchaseTick: state.tick, developedBuildingId: building.id,
              propertyTaxRate: state.government.propertyTaxRate,
            });
          }
          if (Math.random() < 0.55) {
            addNewsTicker(state, `${company.name} opens a ${BUILDING_CONFIGS[best.type].name.toLowerCase()} in ${best.city.name}`, 'info');
          }
        }
      }
    }

    // Pricing response — real boards respond to utilisation within months,
    // not decades. A store at 1.5x with 5% utilisation loses customers fast;
    // trimming 0.005/month would take 8 years to fix. Sharp boards react
    // proportionally to the gap.
    for (const b of state.buildings.filter(b => b.companyId === company.id)) {
      if (b.type !== 'retail_store' && !['restaurant', 'fast_food', 'cafe', 'bar'].includes(b.type)) continue;
      const gap = b.utilization / 100;
      if (gap < 0.25) b.pricingMultiplier = Math.max(0.68, b.pricingMultiplier - 0.08);
      else if (gap < 0.45) b.pricingMultiplier = Math.max(0.68, b.pricingMultiplier - 0.04);
      else if (gap < 0.7) b.pricingMultiplier = Math.max(0.68, b.pricingMultiplier - 0.015);
      else if (gap > 0.92) b.pricingMultiplier = Math.min(1.5, b.pricingMultiplier + 0.03);
    }

    // Close chronically unprofitable
    for (const b of [...state.buildings.filter(b => b.companyId === company.id)]) {
      if (b.type === 'hq') continue;
      const monthly = b.profit * 24 * 30;
      if (monthly < 0) b.monthsUnprofitable++;
      else b.monthsUnprofitable = Math.max(0, b.monthsUnprofitable - 1);
      const patience = Math.round(12 - company.acumen * 7);
      if (b.monthsUnprofitable >= patience) {
        const salvage = b.constructionCost * 0.4 + b.landValue * 0.9;
        company.cash += salvage;
        company.buildings = company.buildings.filter(id => id !== b.id);
        state.buildings = state.buildings.filter(x => x.id !== b.id);
        addNewsTicker(state, `${company.name} shutters loss-making ${b.name.toLowerCase()} after a year of red ink`, 'info');
      }
    }

    // ── Deleverage: profitable firms pay debt down so interest doesn't
    // compound forever. Boards keep a prudent operating buffer. ──
    if (company.debt > 0 && company.cash > company.expenses * 24 * 30 * 2) {
      const repayment = Math.min(company.debt, Math.max(0, company.profit * 24 * 30) * 2, company.cash * 0.08);
      if (repayment > 0) {
        company.cash -= repayment;
        company.debt -= repayment;
      }
    }

    // Distress/bankruptcy tracking
    if (company.cash < 0) {
      company.monthsInDistress++;
      if (company.monthsInDistress === 1) addNewsTicker(state, `${company.name} warns of liquidity strain`, 'warning');
      if (company.monthsInDistress >= 4) {
        // ── Messy liquidation: fire sales and creditor fights ──
        const liqIndex = buildStateIndex(state);
        const recovered = messyLiquidation(state, company, liqIndex);
        company.cash += recovered;
        addNewsTicker(state, `${company.name} enters liquidation — creditors recover $${(recovered / 1_000_000).toFixed(1)}M`, 'breaking');
        // Remove buildings and company
        state.buildings = state.buildings.filter(b => b.companyId !== company.id);
        state.companies = state.companies.filter(c => c.id !== company.id);
        break;
      }
    } else {
      company.monthsInDistress = 0;
    }
  }
}

// ============= INCOMING OFFERS =============
function valueAsset(state: GameState, building: Building, owner: Company): number {
  const annualNOI = building.profit * 24 * 365;
  const riskPremium = building.type === 'apartment' || building.type === 'commercial' ? 3.0
    : ['restaurant', 'fast_food', 'cafe', 'bar'].includes(building.type) ? 7.5
    : building.type === 'factory' || building.type === 'mine' ? 6.5 : 5.0;
  const discountRate = Math.max(0.045, (state.economy.interestRate + riskPremium) / 100);
  const dcf = annualNOI > 0 ? Math.min(annualNOI / discountRate, annualNOI * 12) : 0;
  const depreciation = Math.max(0.35, building.condition / 100);
  const replacement = building.constructionCost * depreciation * 0.6 + building.landValue;
  const strategyGreed = owner.aiStrategy === 'aggressive' ? 1.28 : owner.aiStrategy === 'conservative' ? 0.97 : 1.12;
  const liquidityPressure = owner.cash < 4_000_000 ? 0.84 : owner.cash > 60_000_000 ? 1.12 : 1;
  const cyclePremium = state.economy.cycle === 'boom' ? 1.15
    : state.economy.cycle === 'recession' ? 0.88 : state.economy.cycle === 'recovery' ? 1.03 : 1;
  const performancePremium = 0.85 + Math.min(0.4, building.utilization / 250);
  const fatigue = 1 + building.offersMade * 0.035;
  const ask = (replacement + dcf) * strategyGreed * liquidityPressure * cyclePremium * performancePremium * fatigue;
  building.cachedAsk = Math.max(120_000, ask);
  return building.cachedAsk;
}

function simulateIncomingOffers(state: GameState) {
  const player = state.companies.find(c => c.isPlayer);
  if (!player) return;
  state.incomingOffers = state.incomingOffers.filter(o => o.expiresTick > state.tick);
  if (state.incomingOffers.length >= 3) return;

  const playerAssets = state.buildings.filter(b => b.companyId === player.id && b.type !== 'hq');
  if (playerAssets.length === 0) return;

  const bidders = state.companies.filter(c => !c.isPlayer && c.cash > 3_000_000);
  if (bidders.length === 0) return;

  const target = playerAssets[Math.floor(Math.random() * playerAssets.length)];
  if (state.incomingOffers.some(o => o.buildingId === target.id)) return;

  const buyer = bidders[Math.floor(Math.random() * bidders.length)];
  // Fair value is frozen from the first day of the month.
  const fairValue = target.monthlyFairValue;
  const bidRatio = 0.88 + Math.random() * 0.20;
  const amount = Math.round(fairValue * bidRatio);
  if (buyer.cash < amount) return;

  const rationale = target.type === 'apartment' || target.type === 'commercial'
    ? `${buyer.name} is consolidating rental stock in this district.`
    : ['restaurant', 'fast_food', 'cafe', 'bar'].includes(target.type)
      ? `${buyer.name} wants to fold this venue into their hospitality chain.`
      : target.utilization > 65
        ? `${buyer.name} has identified this as a high-utilisation asset worth owning.`
        : `${buyer.name} believes they can run this asset better than you can.`;

  state.incomingOffers.push({
    id: generateId(),
    buildingId: target.id, buildingName: target.name,
    buyerId: buyer.id, buyerName: buyer.name,
    amount, fairValue,
    expiresTick: state.tick + TICKS_PER_MONTH * 2,
    rationale,
  });

  addNotification(state, {
    id: generateId(),
    message: `${buyer.name} offers $${(amount / 1_000_000).toFixed(2)}M for your ${target.name}.`,
    type: 'info', tick: state.tick,
  });
}

// ============= PRODUCT LIFECYCLE =============
function simulateProductLifecycle(state: GameState): void {
  for (const product of state.products) {
    const confidence = state.economy.consumerConfidence / 100;
    product.marketDemand = Math.max(2, Math.min(100, product.demandIndex * 0.55 + confidence * 45));
    const avgWage = state.cities.reduce((s, c) => s + c.wageRate, 0) / Math.max(1, state.cities.length);
    const labour = avgWage * 0.35 * (product.kind === 'consumer' ? 1.6 : 1);
    const valueAdded = product.kind === 'consumer' ? 1.6 : product.kind === 'semi' ? 1.45 : 1.08;
    const target = (product.productionCost + labour) * valueAdded;
    product.currentPrice += (target * (1 + state.economy.inflation / 100 / 12) - product.currentPrice) * 0.08;
    product.productionCost *= 1 + state.economy.inflation / 100 / 12;

    // Perception drifts toward truth (bad news faster)
    const gap = product.quality - product.perceivedQuality;
    product.perceivedQuality += gap * (gap < 0 ? 0.22 : 0.09);
    const valueScore = product.perceivedQuality / 100 * 3 + (product.brand / 100) * 1.2 + 0.8;
    product.reviewScore += (Math.max(1, Math.min(5, valueScore)) - product.reviewScore) * 0.15;
  }
}

// ============= SUPPLY CHAIN =============
/**
 * Landed cost sourcing. A buyer scores every willing supplier on
 * purchase price + freight − a quality credit, then contracts the best.
 * Freight is real: distance × fuel burn × diesel price, plus driver hours,
 * with a premium for crossing city lines. This is why clustering plants near
 * each other and near a seaport genuinely saves money.
 */
function refreshBuildingSupply(state: GameState, building: Building, index: StateIndex) {
  if (building.constructionEndsTick > state.tick) return;
  const needed: string[] = [];
  if (building.type === 'factory') {
    const product = building.productId ? index.productsById.get(building.productId) : null;
    if (product) needed.push(...product.inputs.map(i => i.productId));
  } else if (building.type === 'retail_store') {
    // Retail stores ONLY source products from their specialty category.
    // Prevents a computer store from auto-sourcing frozen chicken.
    const validProducts = building.products.slice(0, building.productSlots).filter(pid => {
      const product = state.products.find(p => p.id === pid);
      if (!product) return false;
      if (product.kind !== 'consumer') return false;
      if (building.specialisation && product.category !== building.specialisation) return false;
      return true;
    });
    // Prune the shelf itself so the UI reflects reality.
    building.products = validProducts;
    if (building.productId && !validProducts.includes(building.productId)) {
      building.productId = validProducts[0] ?? null;
    }
    needed.push(...validProducts);
  } else if (building.type === 'warehouse') {
    needed.push(...building.products.slice(0, building.productSlots));
  } else if (isHospitality(building.type)) {
    const allowed = VENUE_INGREDIENTS[building.type] ?? [];
    const ids = state.products.filter(p => allowed.includes(p.name)).map(p => p.id);
    building.products = ids;
    needed.push(...ids);
  }
  if (needed.length === 0) return;

  const sameFormat = (index.buildingsByCompany.get(building.companyId) ?? [])
    .filter(b => b.type === building.type).length;
  const chainLeverage = sameFormat >= 10 ? 0.92 : sameFormat >= 5 ? 0.97 : 1;
  const orderSize = Math.max(20, building.capacity * 0.18 * sameFormat);
  const orderTier = orderSize > 5000 ? 0.88 : orderSize > 1000 ? 0.95 : 1;
  const volumeDiscount = chainLeverage * orderTier;
  const supplierPool = ['seaport', 'farm', 'mine', 'factory', 'warehouse']
    .flatMap(type => index.buildingsByType.get(type) ?? []);
  const nextContracts: SupplierLink[] = [];

  for (const productId of [...new Set(needed)]) {
    const inputProduct = index.productsById.get(productId);
    if (!inputProduct) continue;

    const quotes = supplierPool
      .filter(sup => sup.id !== building.id && sup.isOperating && sup.products.includes(productId))
      .filter(sup => !sup.internalSale || sup.companyId === building.companyId)
      .map(sup => {
        const distance = Math.max(1, Math.hypot(sup.x - building.x, sup.y - building.y));
        const fuel = distance * 0.05 * state.economy.dieselPrice;
        const driverWage = index.citiesById.get(sup.cityId)?.wageRate ?? 15;
        const timeCost = (distance / 50) * driverWage;
        const crossCity = sup.cityId === building.cityId ? 1 : 1.25;
        const freightPerUnit = (fuel + timeCost) * crossCity / 250;
        const relationship = building.supplierRelationships[sup.id] || 0;
        const loyaltyDiscount = Math.min(0.15, relationship / 100 * 0.15);
        const isInternal = sup.companyId === building.companyId;
        const importMul = sup.companyId === 'system' ? importCostMultiplier(state) : 1;
        const worldPrice = state.globalMarket?.price[productId] ?? inputProduct.productionCost * 0.9;
        
        let listPrice: number;
        if (isInternal) {
          // Vertical Integration: Cost basis, custom transfer price, or market spot
          if (sup.transferPricingMode === 'cost_basis') {
            listPrice = sup.inputCost + inputProduct.productionCost * 0.8;
          } else if (sup.transferPricingMode === 'custom') {
            listPrice = inputProduct.productionCost * (sup.transferPriceMultiplier || 1.0);
          } else {
            listPrice = inputProduct.productionCost * 0.92;
          }
        } else if (sup.companyId === 'system') {
          listPrice = worldPrice * 1.12 * importMul;
        } else {
          listPrice = inputProduct.productionCost * (0.92 + sup.trainingLevel * 0.025);
        }
        
        const pricePerUnit = listPrice * (isInternal ? 1 : (1 - loyaltyDiscount) * volumeDiscount);
        const quality = sup.type === 'mine'
          ? inputProduct.quality
          : Math.min(100, inputProduct.quality + sup.trainingLevel * 2.2);
        const stock = sup.inventory[productId] ?? 0;
        const reliability = building.supplierLinks.find(c =>
          c.productId === productId && c.supplierBuildingId === sup.id)?.reliability ?? 75;
        return {
          sup, pricePerUnit, freightPerUnit, quality, stock, loyaltyDiscount,
          score: pricePerUnit + freightPerUnit - quality * 0.12 - reliability * 0.015,
        };
      })
      .sort((a, b) => a.score - b.score);

    const existing = building.supplierLinks.find(c => c.productId === productId && c.active);
    const existingQuote = existing
      ? quotes.find(q => q.sup.id === existing.supplierBuildingId)
      : undefined;
    const existingValid = Boolean(existing && existing.expiresTick > state.tick && existingQuote);

    // Player/manual-contract realism: manual mode NEVER silently creates a
    // supplier contract. The player must sign one from the Supply tab. Auto
    // mode is the flexible market-trading mode.
    if (building.supplyMode === 'manual' && !existingValid) continue;

    // Manual mode never silently switches a valid user-selected supplier.
    // Auto mode keeps a reliable contract until expiry; it only switches early
    // after genuine service failure (<45 reliability).
    let selected = existingValid && (building.supplyMode === 'manual' || (existing!.reliability >= 45))
      ? existingQuote
      : quotes.find(q => q.stock > 0) ?? quotes[0];
    if (!selected) continue;

    let contract: SupplierLink;
    if (existingValid && selected.sup.id === existing!.supplierBuildingId) {
      contract = {
        ...existing!,
        freightPerUnit: selected.freightPerUnit,
        quality: selected.quality,
      };
    } else {
      const isInternal = selected.sup.companyId === building.companyId;
      contract = {
        contractId: generateId(),
        productId,
        supplierBuildingId: selected.sup.id,
        pricePerUnit: selected.pricePerUnit,
        freightPerUnit: selected.freightPerUnit,
        quality: selected.quality,
        startedTick: state.tick,
        expiresTick: state.tick + 24 * 30 * 12,
        reliability: 75,
        punctuality: 100,
        deliveries: 0,
        onTimeDeliveries: 0,
        loyaltyDiscount: selected.loyaltyDiscount,
        minimumOrder: Math.max(10, Math.round(building.capacity * 0.1)),
        noticeMonths: 3,
        active: true,
        contractType: isInternal ? 'internal' : 'forward_contract',
        penaltyFee: Math.round(selected.pricePerUnit * Math.max(10, Math.round(building.capacity * 0.1)) * 3),
        volumeCommitment: Math.round(building.capacity * 0.9),
        rejectionRate: Math.max(0, (50 - selected.quality) * 0.002),
      };
    }
    nextContracts.push(contract);

    const onHand = building.inventory[productId] || 0;
    let expectedConsumptionPerDay: number;
    if (building.type === 'factory' && building.productId) {
      const prod = index.productsById.get(building.productId);
      const unitNeed = prod?.inputs.find(i => i.productId === productId)?.quantity ?? 1;
      expectedConsumptionPerDay = Math.max(1, building.capacity * 0.55 * unitNeed);
    } else {
      expectedConsumptionPerDay = Math.max(1, (building.demand / 14) * 24);
    }
    const reorderPoint = Math.min(building.inventoryCapacity,
      Math.max(contract.minimumOrder, expectedConsumptionPerDay * 7));
    if (onHand >= reorderPoint) continue;

    // Do not place a duplicate order while one is already in transit/processing in pipeline.
    const alreadyInPipeline = state.pipelineOrders.some(p => p.toBuildingId === building.id && p.productId === productId)
      || state.freight.some(route => route.toBuildingId === building.id && route.good === productId);
    if (alreadyInPipeline) continue;

    const wanted = Math.min(building.inventoryCapacity,
      Math.max(contract.minimumOrder, expectedConsumptionPerDay * 30 - onHand));
    const availableAtSupplier = Math.min(wanted,
      selected.sup.inventory[productId] || 0);
    if (availableAtSupplier < contract.minimumOrder) {
      contract.reliability = Math.max(0, contract.reliability - 4);
      building.supplyDisrupted = true;
      continue;
    }

    const buyer = index.companiesById.get(building.companyId);
    const totalFreight = contract.freightPerUnit * availableAtSupplier;
    const totalGoods = contract.pricePerUnit * availableAtSupplier;
    if (!buyer || buyer.cash < totalFreight + totalGoods) continue;

    buyer.cash -= totalFreight + totalGoods;
    building.supplierRelationships[selected.sup.id] = Math.min(100,
      (building.supplierRelationships[selected.sup.id] || 0) + 4);
    if (selected.sup.companyId !== 'system') {
      selected.sup.inventory[productId] = Math.max(0,
        (selected.sup.inventory[productId] || 0) - availableAtSupplier);
      const seller = index.companiesById.get(selected.sup.companyId);
      if (seller) seller.cash += totalGoods;
      selected.sup.marketUnitsSold += availableAtSupplier;
    } else {
      // Port sale: draw down physical stock and recognize world procurement
      // cost plus handling margin in the port's daily ledger.
      selected.sup.inventory[productId] = Math.max(0,
        (selected.sup.inventory[productId] || 0) - availableAtSupplier);
      selected.sup.marketUnitsSold += availableAtSupplier;
      selected.sup.revenueAccum += totalGoods;
      selected.sup.cogsAccum += totalGoods * 0.88;
      selected.sup.profitAccum += totalGoods * 0.12;
      const gm = state.globalMarket;
      if (gm && gm.price[productId] !== undefined) {
        // Imports into the domestic economy are demand in the external market:
        // sustained imports push world prices up; domestic producers lose share.
        gm.netExport[productId] = (gm.netExport[productId] ?? 0) + availableAtSupplier;
      }
    }

    contract.deliveries += 1;
    const dist = Math.max(1, Math.hypot(selected.sup.x - building.x, selected.sup.y - building.y));
    const isPerishable = inputProduct.category === 'Food' || inputProduct.category === 'Beverage' || inputProduct.category === 'Farm Products' || inputProduct.kind === 'farm';
    const processingHours = isPerishable ? 48 : inputProduct.kind === 'semi' ? 24 : 12;
    const transitHours = Math.ceil(dist * 1.5);
    const totalHours = processingHours + transitHours;

    state.pipelineOrders.push({
      id: generateId(),
      contractId: contract.contractId,
      fromBuildingId: selected.sup.id,
      toBuildingId: building.id,
      productId,
      amount: availableAtSupplier,
      processingHoursRemaining: processingHours,
      transitHoursRemaining: transitHours,
      totalHours,
      isPerishable,
      spoilageRate: totalHours > 120 ? Math.min(0.40, 0.10 + (totalHours - 120) * 0.005) : 0,
      unitCost: contract.pricePerUnit,
      freightCost: totalFreight,
      isInternalTransfer: selected.sup.companyId === building.companyId,
    });
  }

  building.supplierLinks = nextContracts;
  building.freightCost = nextContracts.reduce((sum, link) => sum + link.freightPerUnit, 0);
  building.inputCost = nextContracts.reduce((sum, link) => sum + link.pricePerUnit, 0);
  if (state.freight.length > 2000) state.freight.splice(0, state.freight.length - 2000);
}

function refreshSupplyNetworks(state: GameState) {
  const index = buildStateIndex(state);
  for (const building of state.buildings) {
    if (building.companyId === 'system') continue;
    refreshBuildingSupply(state, building, index);
  }
}

// ============= MONTHLY =============
function simulateMonthly(state: GameState): void {
  const player = state.companies.find(c => c.isPlayer);
  if (player) {
    const salary = state.player.salary / 12;
    player.cash -= salary;
    state.player.cash += salary;
  }

  simulatePlayerBehaviors(state);
  simulateAICompanies(state);
  simulateAIBehaviors(state);
  updatePoliticalEconomy(state);
  updateBankingSector(state);
  updateEnvironmentStocks(state);
  updateHouseholdBalanceSheets(state);
  simulateProductLifecycle(state);
  simulateResearch(state);
  simulateCentralBank(state);
  simulateAiCapitalAllocation(state);
  simulateIncomingOffers(state);
  simulateLandMarket(state);

  // ── Property Market & Valuations ──
  for (const b of state.buildings) {
    b.monthlyFairValue = computeStandardFairValue(state, b);
    
    // Decay B2B relationships slightly over time if no orders happen
    for (const supId of Object.keys(b.supplierRelationships)) {
      b.supplierRelationships[supId] = Math.max(0, b.supplierRelationships[supId] - 2);
    }

    // ── Mortgage & lease payments ──
    if (b.financingPayment > 0 && b.financingMonthsLeft > 0) {
      const owner = state.companies.find(c => c.id === b.companyId);
      if (owner) {
        owner.cash -= b.financingPayment;
        if (!b.isLeased) {
          // Mortgage: part of the payment reduces principal (debt).
          const interest = 0; // simplification: treat payment as debt service
          owner.debt = Math.max(0, owner.debt - Math.max(0, b.financingPayment - interest));
        }
      }
      b.financingMonthsLeft -= 1;
      if (b.financingMonthsLeft <= 0 && b.isLeased) {
        // Lease expired: revert to the institutional owner.
        if (owner) owner.buildings = owner.buildings.filter(id => id !== b.id);
        b.companyId = 'system';
        b.isLeased = false;
        b.financingPayment = 0;
        if (owner?.isPlayer) {
          addNotification(state, { id: generateId(), message: `Your lease on ${b.name} has expired and reverted to the landlord.`, type: 'warning', tick: state.tick });
        }
      } else if (b.financingMonthsLeft <= 0) {
        b.financingPayment = 0; // mortgage paid off
      }
    }
  }
  
  // AI buys player buildings that are listed for sale at a good price
  for (const b of state.buildings) {
    if (b.forSale && b.companyId === player?.id) {
      const bidders = state.companies.filter(c => !c.isPlayer && c.cash > b.askingPrice);
      if (bidders.length > 0) {
        const buyer = bidders[Math.floor(Math.random() * bidders.length)];
        const greed = buyer.aiStrategy === 'aggressive' ? 1.2 : 1.0;
        // If the asking price is <= their valuation, they buy it.
        if (b.askingPrice > 0 && b.askingPrice <= b.monthlyFairValue * greed) {
           const salePrice = b.askingPrice;
           buyer.cash -= salePrice;
           player!.cash += salePrice;
           b.companyId = buyer.id;
           transferDevelopmentTitle(state, b.id, buyer.id);
           b.purchasePrice = salePrice;
           b.acquiredAtTick = state.tick;
           b.forSale = false;
           b.askingPrice = 0;
           player!.buildings = player!.buildings.filter(id => id !== b.id);
           buyer.buildings.push(b.id);
           addNotification(state, { id: generateId(), message: `${buyer.name} purchased ${b.name} for $${formatMoney(salePrice)}.`, type: 'success', tick: state.tick });
           addNewsTicker(state, `${buyer.name} acquires ${b.name} from ${player?.name} on the open market`, 'info');
        }
      }
    }
  }

  // ── Taxation: property tax monthly, dividends quarterly, bond payments ──
  const taxIndex = buildStateIndex(state);
  collectPropertyTax(state, taxIndex);
  updateMoneySupply(state);
  replenishSeaports(state);
  if (state.month % 3 === 0) {
    payDividends(state);
    payCoupons(state);
  }

  // ── Fiscal budget runs monthly (GDP-scaled receipts/spending/debt service) ──
  runFiscalBudget(state);

  // ── Institutions: households, government, competition ──
  updateHouseholdBudgets(state);
  simulateHerding(state);
  simulateGovernment(state);
  const monthlyIndex = buildStateIndex(state);
  simulateAntitrust(state, monthlyIndex);
  simulateCartels(state, monthlyIndex);
  simulatePredatoryPricing(state, monthlyIndex);
  simulateSupplierFailures(state, monthlyIndex);
  simulateTrade(state);
  reviewCreditRatings(state);

  refreshSupplyNetworks(state);

  // Debt/loan service
  for (const company of state.companies) {
    if (company.debt > 0) {
      const interest = (company.debt * company.interestRate) / 100 / 12;
      company.cash -= interest;
    }
  }
  if (player) {
    const paidLoans: string[] = [];
    for (const loan of state.loans) {
      player.cash -= loan.monthlyPayment;
      loan.monthsRemaining -= 1;
      const principal = loan.monthlyPayment - (loan.amount * loan.interestRate / 100 / 12);
      loan.amount = Math.max(0, loan.amount - principal);
      player.debt = Math.max(0, player.debt - principal);
      if (loan.monthsRemaining <= 0 || loan.amount <= 0) paidLoans.push(loan.id);
    }
    state.loans = state.loans.filter(l => !paidLoans.includes(l.id));
  }

  // Quarterly news
  if (state.month % 3 === 0) {
    const headlines = [
      'Central bank signals cautious outlook amid mixed economic data',
      'Consumer spending hits record high as confidence surges',
      'New trade agreements open markets in emerging economies',
      'Tech sector leads gains as innovation accelerates',
      'Manufacturing PMI rises for third consecutive month',
      'Energy prices stabilize after volatile quarter',
    ];
    addNewsTicker(state, headlines[Math.floor(Math.random() * headlines.length)]);
  }

  // Replay history
  if (player) {
    state.replayHistory.push({
      year: state.year, month: state.month,
      cash: player.cash, netWorth: state.player.netWorth,
      revenue: player.revenue * 24 * 30, profit: player.profit * 24 * 30,
      gdpGrowth: state.economy.gdpGrowth, inflation: state.economy.inflation,
    });
    if (state.replayHistory.length > 600) state.replayHistory.shift();
  }
}

function simulateResearch(state: GameState): void {
  for (const project of state.researchProjects.filter(p => p.active && !p.completed)) {
    const product = state.products.find(p => p.id === project.productId);
    if (!product) continue;
    const centers = state.buildings.filter(b =>
      b.companyId === project.companyId && b.type === 'rd_center' && b.employees > 0);
    const trainingPower = centers.reduce((sum, center) =>
      sum + center.employees * center.staffSkill
        * (0.6 + center.trainingBudget)
        * (0.5 + center.effectiveTraining / 9), 0);
    if (trainingPower <= 0) continue;
    project.progress += trainingPower * 1.5;
    if (project.progress < 100) continue;
    project.active = false;
    project.completed = true;
    const company = state.companies.find(c => c.id === project.companyId);
    // ── 30% of projects fail outright; patents on success ──
    const succeeded = resolveResearch(state, project.companyId, product.id, trainingPower * 45000);
    if (!succeeded) {
      project.failed = true;
      addNotification(state, {
        id: generateId(),
        message: `${company?.name ?? 'A company'}'s R&D on ${product.name} failed after months of work.`,
        type: 'danger', tick: state.tick,
      });
      addNewsTicker(state, `${company?.name ?? 'A company'} abandons a ${product.name} research program`, 'info');
      continue;
    }
    product.techLevel = Math.max(product.techLevel, project.targetTech);
    if (company) company.totalAssets += product.productionCost * project.targetTech * 12000;
    addNewsTicker(state, `${company?.name ?? 'A company'} completes a technology breakthrough in ${product.name}`, 'breaking');
  }
  state.researchProjects = state.researchProjects.filter(p => !p.completed);
}

function simulatePatents(state: GameState): void {
  // Expired patents fall off; live ones already feed the premium via patentPremium().
  state.patents = state.patents.filter(p => p.expiresYear > state.year);
}

function simulateYearly(state: GameState): void {
  // ── Fiscal year close: assess corporate income tax on pre-tax profit ──
  collectCorporateTax(state);
  reviewTaxPolicy(state);
  rollFiscalYear(state);
  for (const company of state.companies) {
    company.operatingCashFlow = 0;
    company.investingCashFlow = 0;
    company.financingCashFlow = 0;
  }
  // Bond market: mark to market, settle matured issues (coupons are paid
  // quarterly in the monthly tick — paying here double-paid December).
  markToMarket(state);
  settleBonds(state);
  addNewsTicker(state, `Year ${state.year} begins. New opportunities emerge.`);
  addNotification(state, { id: generateId(), message: `Year ${state.year} — Annual review`, type: 'info', tick: state.tick });
}

// ============= MAIN TICK =============

function snapshotDailyStats(state: GameState) {
  // Buildings: snapshot accumulated stats
  for (const b of state.buildings) {
    b.dailyRevenue = b.revenueAccum;
    b.dailyCogs = b.cogsAccum;
    b.dailyOpex = b.opexAccum;
    b.dailyProfit = b.profitAccum;
    b.dailyUtilization = b.utilizationAccum / 24;
    b.dailySold = b.soldUnitsAccum;
    b.dailyProduced = b.producedUnitsAccum;
    // Reset accumulators for the next day
    b.revenueAccum = 0;
    b.cogsAccum = 0;
    b.opexAccum = 0;
    b.profitAccum = 0;
    b.utilizationAccum = 0;
    b.soldUnitsAccum = 0;
    b.producedUnitsAccum = 0;
  }
  // Companies: snapshot financials
  for (const c of state.companies) {
    c.dailyCash = c.cash;
    c.dailyMarketCap = c.marketCap;
    c.dailySharePrice = c.sharePrice;
    c.sharePriceHistory.push(c.sharePrice);
    if (c.sharePriceHistory.length > 365) c.sharePriceHistory.shift();
    c.dailyRevenue = c.revenueAccum;
    c.dailyProfit = c.profitAccum;
    c.dailyExpenses = c.expensesAccum;
    c.revenueAccum = 0;
    c.profitAccum = 0;
    c.expensesAccum = 0;
  }
  // Player net worth
  const player = state.companies.find(c => c.isPlayer);
  if (player) {
    player.dailyNetWorth = state.player.netWorth;
  }
}

export function simulateTick(state: GameState): GameState {
  // Hard engine-level pause guard: no time, production, ordering, freight or
  // finance accrues while paused, even if simulateTick is called externally.
  if (state.paused) return state;
  const s = { ...state, tick: state.tick + 1 };
  s.hour += 1;
  if (s.hour >= 24) {
    s.hour = 0;
    s.day += 1;
    s.dayOfYear += 1;
    if (s.dayOfYear >= 365) s.dayOfYear = 0;
    if (s.day > 30) {
      s.day = 1;
      s.month += 1;
      simulateMonthly(s);
      if (s.month > 12) {
        s.month = 1;
        s.year += 1;
        simulateYearly(s);
      }
    }
  }
  s.timeOfDay = s.hour / 24;
  s.season = s.dayOfYear < 90 ? 'winter' : s.dayOfYear < 180 ? 'spring' : s.dayOfYear < 270 ? 'summer' : 'autumn';

  // One shared index per tick replaces thousands of Array.find / filter scans.
  const index = buildStateIndex(s);

  simulateEconomy(s);
  simulatePortShipments(s);
  simulateFreightRoutes(s);
  simulateCompanies(s, index);
  simulateBuildings(s, index);
  simulateStockMarket(s);
  simulateAssetPrices(s);
  simulateCities(s, index);

  // Freeze UI financials once per calendar day (after the day's last hour).
  if (s.hour === 0) snapshotDailyStats(s);

  // Restock supply chains once a day — plants burn inputs far faster than
  // monthly ordering could ever serve them.
  if (s.tick % 24 === 0) {
    refreshSupplyNetworks(s);
    updateGlobalMarketDaily(s);
  }

  return s;
}

/** Monthly run-rate for the UI: last complete day if we have one, else live hourly. */
export function monthlyRunRate(daily: number, hourly: number): number {
  return Math.abs(daily) > 1e-6 ? daily * 30 : hourly * 24 * 30;
}

// ============= LAND MARKET =============
/**
 * Dynamic land price for one tile. It includes base map value, city wages,
 * population pressure, traffic, zoning, nearby development and resources.
 */
export function getLandPurchasePrice(
  state: GameState, tiles: IsometricTile[][], x: number, y: number,
): number {
  const tile = tiles[Math.round(y)]?.[Math.round(x)];
  if (!tile || tile.type === 'water' || tile.highway || tile.road) return 0;
  const city = state.cities.reduce<{ city: City | null; dist: number }>((best, item) => {
    const dist = Math.hypot(item.x - x, item.y - y);
    return dist < best.dist ? { city: item, dist } : best;
  }, { city: null, dist: Infinity });
  const local = city.city;
  const wageFactor = local ? 0.7 + local.wageRate / 35 : 0.7;
  const populationFactor = local ? 0.75 + Math.min(1.4, local.population / 50_000) : 0.75;
  const trafficFactor = local ? 0.8 + local.trafficLevel / 180 : 0.8;
  const zoningFactor = tile.zone === 'commercial' ? 1.55
    : tile.zone === 'residential' ? 1.25
    : tile.zone === 'industrial' ? 0.85 : 1.05;
  const cbdFactor = local ? 1 + Math.max(0, 16 - city.dist) / 16 * 1.2 : 1;
  const nearby = state.buildings.filter(building => Math.hypot(building.x - x, building.y - y) < 6);
  const developmentFactor = 1 + Math.min(0.8, nearby.length * 0.045);
  const resourceFactor = tile.resource
    ? 1.5 + Math.min(2.5, tile.resource.amount / Math.max(1, tile.resource.maxAmount) * 1.5)
    : 1;
  // Negative externality: smoggy cities discount land values.
  const pollutionFactor = local ? Math.max(0.55, 1 - Math.max(0, local.pollution - 25) * 0.006) : 1;
  return Math.max(10_000, tile.landValue * 2_400 * wageFactor * populationFactor
    * trafficFactor * zoningFactor * cbdFactor * developmentFactor * resourceFactor * pollutionFactor);
}

export function buyLandTile(
  state: GameState, tiles: IsometricTile[][], x: number, y: number,
): GameState {
  const player = state.companies.find(company => company.isPlayer);
  const tile = tiles[Math.round(y)]?.[Math.round(x)];
  if (!player || !tile) return state;
  if (state.landHoldings.some(holding => holding.x === Math.round(x) && holding.y === Math.round(y))) {
    addNotification(state, { id: generateId(), message: 'This land is already owned.', type: 'warning', tick: state.tick });
    return { ...state };
  }
  const occupied = state.buildings.some(building =>
    Math.abs(building.x - x) < building.width / 2 + 0.25
      && Math.abs(building.y - y) < building.height / 2 + 0.25);
  if (occupied) {
    addNotification(state, {
      id: generateId(), message: 'This parcel is already developed. Acquire the building, not the underlying title.',
      type: 'warning', tick: state.tick,
    });
    return { ...state };
  }
  const price = getLandPurchasePrice(state, tiles, x, y);
  if (price <= 0) {
    addNotification(state, { id: generateId(), message: 'This tile cannot be purchased.', type: 'warning', tick: state.tick });
    return { ...state };
  }
  if (player.cash < price) {
    addNotification(state, { id: generateId(), message: `Land costs $${formatMoney(price)}.`, type: 'danger', tick: state.tick });
    return { ...state };
  }
  player.cash -= price;
  player.investingCashFlow -= price;
  const holding: LandHolding = {
    id: generateId(), ownerId: player.id, cityId: tile.cityId,
    x: Math.round(x), y: Math.round(y), zone: tile.zone,
    purchasePrice: price, currentValue: price, purchaseTick: state.tick,
    developedBuildingId: null,
    propertyTaxRate: state.government.propertyTaxRate,
  };
  state.landHoldings.push(holding);
  addNotification(state, {
    id: generateId(), message: `Purchased ${tile.zone} land for $${formatMoney(price)}. Development rights secured.`,
    type: 'success', tick: state.tick,
  });
  return { ...state };
}

/** Monthly appreciation plus strategic AI land acquisition. */
function simulateLandMarket(state: GameState) {
  // Existing titles appreciate with inflation, city growth and nearby development.
  for (const holding of state.landHoldings) {
    const city = state.cities.find(item => item.id === holding.cityId);
    const nearby = state.buildings.filter(building =>
      Math.hypot(building.x - holding.x, building.y - holding.y) < 6).length;
    const cityGrowth = city ? city.growthRate : 0;
    const monthlyGrowth = (state.economy.inflation + cityGrowth * 0.6) / 100 / 12
      + nearby * 0.0008;
    holding.currentValue = Math.max(5_000,
      holding.currentValue * (1 + Math.max(-0.02, Math.min(0.03, monthlyGrowth))));
  }

  // AI firms bank land when they have genuine surplus liquidity.
  for (const company of state.companies.filter(item => !item.isPlayer)) {
    const owned = state.landHoldings.filter(holding => holding.ownerId === company.id);
    const maxParcels = company.sectorFocus === 'real_estate' ? 8
      : company.sectorFocus === 'industrial' ? 5 : 2;
    if (owned.length >= maxParcels || company.cash < 1_000_000) continue;
    const chance = 0.05 + company.acumen * 0.12;
    if (Math.random() > chance) continue;

    const city = [...state.cities].sort((a, b) => {
      const aScore = company.sectorFocus === 'industrial'
        ? a.landCostMultiplier + a.wageRate / 50
        : -(a.growthRate + a.population / 50_000);
      const bScore = company.sectorFocus === 'industrial'
        ? b.landCostMultiplier + b.wageRate / 50
        : -(b.growthRate + b.population / 50_000);
      return aScore - bScore;
    })[0];
    if (!city) continue;
    const zone: ZoneType = company.sectorFocus === 'industrial' ? 'industrial'
      : company.sectorFocus === 'real_estate' ? (Math.random() < 0.7 ? 'residential' : 'commercial')
      : 'mixed';
    const radius = zone === 'commercial' ? 4 + Math.random() * 4 : 9 + Math.random() * 7;
    const angle = Math.random() * Math.PI * 2;
    const [x, y] = snapOffRoad(state.cities, city,
      Math.round(city.x + Math.cos(angle) * radius),
      Math.round(city.y + Math.sin(angle) * radius));
    if (state.landHoldings.some(holding => holding.x === x && holding.y === y)) continue;
    const zoneFactor = zone === 'commercial' ? 1.5 : zone === 'residential' ? 1.2 : 0.8;
    const price = Math.max(20_000,
      120_000 * city.landCostMultiplier * zoneFactor * (0.7 + city.population / 80_000));
    if (company.cash < price * 1.5) continue;
    company.cash -= price;
    company.investingCashFlow -= price;
    state.landHoldings.push({
      id: generateId(), ownerId: company.id, cityId: city.id, x, y, zone,
      purchasePrice: price, currentValue: price, purchaseTick: state.tick,
      developedBuildingId: null, propertyTaxRate: state.government.propertyTaxRate,
    });
  }
}

export function sellLandHolding(state: GameState, holdingId: string): GameState {
  const player = state.companies.find(company => company.isPlayer);
  const holding = state.landHoldings.find(item => item.id === holdingId);
  if (!player || !holding || holding.ownerId !== player.id || holding.developedBuildingId) return state;
  const fee = holding.currentValue * 0.03;
  const proceeds = holding.currentValue - fee;
  const gain = proceeds - holding.purchasePrice;
  player.cash += proceeds;
  player.investingCashFlow += proceeds;
  if (gain > 0) {
    const tax = gain * (state.economy.longTermCapitalGainsRate / 100);
    player.cash -= tax;
    player.taxesPaidYTD += tax;
  } else player.lossCarryforward += -gain;
  state.landHoldings = state.landHoldings.filter(item => item.id !== holdingId);
  return { ...state };
}

function transferDevelopmentTitle(state: GameState, buildingId: string, newOwnerId: string) {
  const title = state.landHoldings.find(holding => holding.developedBuildingId === buildingId);
  if (title) {
    title.ownerId = newOwnerId;
    return;
  }
  const building = state.buildings.find(item => item.id === buildingId);
  if (!building || building.type === 'seaport') return;
  const zone: ZoneType = building.type === 'apartment' ? 'residential'
    : building.type === 'factory' || building.type === 'warehouse' || building.type === 'mine' ? 'industrial'
    : 'commercial';
  state.landHoldings.push({
    id: generateId(), ownerId: newOwnerId, cityId: building.cityId,
    x: Math.round(building.x), y: Math.round(building.y), zone,
    purchasePrice: building.landValue, currentValue: building.landValue,
    purchaseTick: state.tick, developedBuildingId: building.id,
    propertyTaxRate: state.government.propertyTaxRate,
  });
}

// ============= NIMBY =============
/**
 * NIMBY resistance. Residents fight development that lowers amenity near
 * their homes; strong opposition adds planning-delay costs or blocks outright.
 */
export function nimbyObjection(state: GameState, x: number, y: number, type: BuildingType):
  { blocked: boolean; surcharge: number; note: string } {
  const city = state.cities.find(c => Math.hypot(c.x - x, c.y - y) < CITY_ROAD_RADIUS + 4);
  if (!city) return { blocked: false, surcharge: 0, note: '' };

  const nuisance = type === 'factory' || type === 'mine' ? 1
    : type === 'warehouse' || type === 'bar' ? 0.6
    : type === 'fast_food' ? 0.35
    : type === 'apartment' ? 0.25 : 0.1;
  if (nuisance < 0.2) return { blocked: false, surcharge: 0, note: '' };

  const nearbyHomes = state.buildings.filter(b =>
    b.type === 'apartment' && Math.hypot(b.x - x, b.y - y) < 8).length;
  const pressure = (city.nimbyLevel / 100) * nuisance * Math.min(1, nearbyHomes / 5);

  if (pressure > 0.55) {
    return { blocked: true, surcharge: 0, note: `Residents' association has blocked this application in ${city.name}.` };
  }
  if (pressure > 0.2) {
    // Planning concessions: landscaping, traffic studies, community payments.
    return { blocked: false, surcharge: pressure * 0.35, note: `Planning objections add ${(pressure * 35).toFixed(0)}% in concessions and delay.` };
  }
  return { blocked: false, surcharge: 0, note: '' };
}

// ============= PLAYER ACTIONS =============
export function placeBuilding(
  state: GameState, type: BuildingType, x: number, y: number, tiles?: IsometricTile[][],
): GameState {
  const player = state.companies.find(c => c.isPlayer);
  if (!player) return state;
  const cfg = BUILDING_CONFIGS[type];
  if (!cfg) return state;

  if (tiles) {
    const verdict = checkBuildable(tiles, state, type, x, y);
    if (!verdict.ok) {
      addNotification(state, { id: generateId(), message: verdict.reason, type: 'warning', tick: state.tick });
      return { ...state };
    }
    // ── NIMBY: residents resist polluting development near their homes ──
    const nimby = nimbyObjection(state, x, y, type);
    if (nimby.blocked) {
      addNotification(state, { id: generateId(), message: nimby.note, type: 'warning', tick: state.tick });
      return { ...state };
    }
    if (nimby.surcharge > 0) {
      addNotification(state, { id: generateId(), message: nimby.note, type: 'info', tick: state.tick });
    }
  }

  const city = state.cities.find(c => Math.hypot(c.x - x, c.y - y) < CITY_ROAD_RADIUS + 4);
  if (!city) {
    addNotification(state, { id: generateId(), message: 'Buildings must be placed near a city.', type: 'warning', tick: state.tick });
    return { ...state };
  }

  // Real construction breakdown: materials + local labour + land at market value.
  const tile = tiles?.[Math.round(y)]?.[Math.round(x)];
  const materials = cfg.cost * 0.62;
  const labour = city.wageRate * cfg.employees * 160 * 0.8;
  const ownedLand = state.landHoldings.find(holding =>
    holding.ownerId === player.id && holding.x === Math.round(x)
      && holding.y === Math.round(y) && !holding.developedBuildingId);
  // Owned land grants development rights and is not bought twice.
  const land = ownedLand
    ? ownedLand.currentValue
    : tiles ? getLandPurchasePrice(state, tiles, x, y) : cfg.cost * 0.2;
  let cost = tiles ? materials + labour + (ownedLand ? 0 : land)
    : cfg.cost * city.landCostMultiplier;
  // NIMBY concessions ride on top of the construction bill.
  if (tiles) {
    const nimby = nimbyObjection(state, x, y, type);
    cost *= 1 + nimby.surcharge;
  }
  if (player.cash < cost) {
    addNotification(state, { id: generateId(), message: `Not enough cash — need $${(cost / 1_000_000).toFixed(1)}M.`, type: 'danger', tick: state.tick });
    return { ...state };
  }
  const building = createBuilding(type, player.id, city, state.products, x, y, undefined, state.year);
  building.supplyMode = 'manual';
  building.constructionCost = cost;
  building.constructionEndsTick = state.tick + (CONSTRUCTION_LEAD_DAYS[type] ?? 60) * 24;
  building.purchasePrice = cost;
  building.acquiredAtTick = state.tick;
  building.landValue = land;
  building.highwayAccess = highwayProximity(state.cities, x, y);
  // Mines bind to the deposit they sit on.
  if (type === 'mine' && tile?.resource) {
    building.resourceType = tile.resource.type;
    building.resourceRemaining = tile.resource.amount;
    building.resourceMax = tile.resource.maxAmount;
    const match = state.products.find(pr => pr.name.toLowerCase() === tile.resource!.type.toLowerCase());
    if (match) { building.productId = match.id; building.products = [match.id]; }
  }
  player.cash -= cost;
  player.investingCashFlow -= cost;
  state.buildings.push(building);
  player.buildings.push(building.id);
  if (ownedLand) {
    ownedLand.developedBuildingId = building.id;
  } else if (tile) {
    state.landHoldings.push({
      id: generateId(), ownerId: player.id, cityId: tile.cityId,
      x: Math.round(x), y: Math.round(y), zone: tile.zone,
      purchasePrice: land, currentValue: land, purchaseTick: state.tick,
      developedBuildingId: building.id,
      propertyTaxRate: state.government.propertyTaxRate,
    });
  }
  invalidateRoadCache(building.cityId);

  addNewsTicker(state, `${player.name} invests in a new ${cfg.name.toLowerCase()} in ${city.name}`);
  return { ...state };
}

export function setBuildingProduct(state: GameState, buildingId: string, productId: string): GameState {
  if (blockedByConstruction(state, buildingId)) return state;
  const building = state.buildings.find(b => b.id === buildingId);
  if (!building) return state;
  const eligible = eligibleProductsFor(building, state.products);
  if (!eligible.some(p => p.id === productId)) {
    addNotification(state, {
      id: generateId(),
      message: `${BUILDING_CONFIGS[building.type]?.name} cannot handle that product.`,
      type: 'warning', tick: state.tick,
    });
    return { ...state };
  }
  building.productId = productId;
  building.products = [productId];
  building.inventory = {};
  building.supplierLinks = [];
  return { ...state };
}

/** Add a product line to a retailer's shelf, within its slot limit. */
export function addRetailLine(state: GameState, buildingId: string, productId: string): GameState {
  if (blockedByConstruction(state, buildingId)) return state;
  const building = state.buildings.find(b => b.id === buildingId);
  if (!building) return state;
  const eligible = eligibleProductsFor(building, state.products);
  if (!eligible.some(p => p.id === productId)) return { ...state };
  if (building.products.includes(productId)) return { ...state };
  if (building.products.length >= building.productSlots) {
    addNotification(state, {
      id: generateId(),
      message: `All ${building.productSlots} shelf slots are full. Upgrade the store to stock more lines.`,
      type: 'warning', tick: state.tick,
    });
    return { ...state };
  }
  building.products.push(productId);
  if (!building.productId) building.productId = productId;
  return { ...state };
}

export function removeRetailLine(state: GameState, buildingId: string, productId: string): GameState {
  if (blockedByConstruction(state, buildingId)) return state;
  const building = state.buildings.find(b => b.id === buildingId);
  if (!building) return state;
  building.products = building.products.filter(id => id !== productId);
  if (building.productId === productId) building.productId = building.products[0] ?? null;
  building.supplierLinks = building.supplierLinks.filter(l => l.productId !== productId);
  return { ...state };
}

/** Re-specialise a store. Clears the shelf, since the range no longer fits. */
export function setRetailSpecialisation(state: GameState, buildingId: string, category: string | null): GameState {
  if (blockedByConstruction(state, buildingId)) return state;
  const building = state.buildings.find(b => b.id === buildingId);
  if (!building || building.type !== 'retail_store') return state;
  building.specialisation = category;
  const eligible = eligibleProductsFor(building, state.products);
  building.products = eligible.slice(0, building.productSlots).map(p => p.id);
  building.productId = building.products[0] ?? null;
  building.supplierLinks = [];
  addNotification(state, {
    id: generateId(),
    message: category
      ? `${building.name} now specialises in ${category} — specialty stores earn a demand bonus.`
      : `${building.name} converted to general merchandise.`,
    type: 'info', tick: state.tick,
  });
  return { ...state };
}

/** Reprice a single menu line. Margin discipline is the player's problem. */
export function setMenuItemPrice(state: GameState, buildingId: string, itemId: string, price: number): GameState {
  if (blockedByConstruction(state, buildingId)) return state;
  const item = state.buildings.find(b => b.id === buildingId)?.menu.find(m => m.id === itemId);
  if (item) item.price = Math.max(0.25, price);
  return { ...state };
}

/** Toggle a menu line on or off the board. */
export function toggleMenuItem(state: GameState, buildingId: string, itemId: string): GameState {
  if (blockedByConstruction(state, buildingId)) return state;
  const item = state.buildings.find(b => b.id === buildingId)?.menu.find(m => m.id === itemId);
  if (item) item.enabled = !item.enabled;
  return { ...state };
}

/** Withhold output from rivals. Denies them supply, costs you spot revenue. */
export function toggleInternalSale(state: GameState, buildingId: string): GameState {
  const building = state.buildings.find(b => b.id === buildingId);
  if (!building) return state;
  // Friction: flipping internal-sale on a productive plant hurts your public
  // brand. The company is seen as unreliable, which reduces national brand
  // awareness and can trigger an antitrust look on the product.
  if (!building.internalSale) {
    const company = state.companies.find(c => c.id === building.companyId);
    if (company) {
      company.brandAwareness = Math.max(0, company.brandAwareness - 5);
    }
    // Possible antitrust risk when withholding supply from a shared market.
    if (Math.random() < 0.1) {
      addNewsTicker(state, `Regulators probe ${building.name} for potential supply hoarding`, 'warning');
    }
  }
  building.internalSale = !building.internalSale;
  addNotification(state, {
    id: generateId(),
    message: building.internalSale
      ? `${building.name} now supplies your group only — rivals are cut off, but you forfeit spot sales.`
      : `${building.name} is selling on the open market again.`,
    type: 'info', tick: state.tick,
  });
  return { ...state };
}

export function upgradeBuilding(state: GameState, buildingId: string): GameState {
  if (blockedByConstruction(state, buildingId)) return state;
  const building = state.buildings.find(b => b.id === buildingId);
  if (!building || building.level >= building.maxLevel) return state;
  const player = state.companies.find(c => c.isPlayer);
  if (!player || building.companyId !== player.id) return state;
  const cost = building.constructionCost * 0.3 * building.level;
  if (player.cash < cost) return state;
  player.cash -= cost;
  building.level += 1;
  // Real estate: each upgrade adds a fixed block of units (a new floor/annex).
  // Apartment: +4 units per level (12 → 16 → 20). Commercial: +4 suites.
  // Production: capacity +25% compounds.
  if (building.type === 'apartment' || building.type === 'commercial') {
    building.capacity += 4;
  } else {
    building.capacity = Math.floor(building.capacity * 1.25);
    building.targetEmployees = Math.max(building.targetEmployees,
      Math.ceil(building.targetEmployees * 1.15));
  }
  building.trainingLevel = Math.min(9, building.trainingLevel + 1);
  building.condition = 100;
  addNotification(state, {
    id: generateId(),
    message: `Upgraded ${building.name} to level ${building.level}`,
    type: 'success', tick: state.tick,
  });
  return { ...state };
}

export function listBuildingForSale(state: GameState, buildingId: string, askingPrice: number): GameState {
  const building = state.buildings.find(b => b.id === buildingId);
  const player = state.companies.find(c => c.isPlayer);
  if (!building || !player || building.companyId !== player.id) return state;
  const validAsk = Math.max(1, askingPrice || building.monthlyFairValue);
  building.forSale = true;
  building.askingPrice = validAsk;
  
  addNotification(state, {
    id: generateId(),
    message: `Listed ${building.name} on the property market for $${formatMoney(validAsk)}. Offers are reviewed on the first day of each month.`,
    type: 'info', tick: state.tick,
  });
  return { ...state };
}

export function cancelBuildingSale(state: GameState, buildingId: string): GameState {
  const building = state.buildings.find(b => b.id === buildingId);
  const player = state.companies.find(c => c.isPlayer);
  if (!building || !player || building.companyId !== player.id) return state;
  
  building.forSale = false;
  building.askingPrice = 0;
  
  addNotification(state, {
    id: generateId(),
    message: `Removed ${building.name} from the property market.`,
    type: 'info', tick: state.tick,
  });
  return { ...state };
}

export function demolishBuilding(state: GameState, buildingId: string): GameState {
  const building = state.buildings.find(b => b.id === buildingId);
  const player = state.companies.find(c => c.isPlayer);
  if (!building || !player || building.companyId !== player.id) return state;

  // Demolition recovers structural scrap only. The land title remains owned
  // and becomes vacant; refunding land here would double-pay its value.
  const salePrice = building.constructionCost * 0.2 * (building.condition / 100);
  const basis = Math.max(0, building.purchasePrice - building.landValue);
  const gain = salePrice - basis;
  if (gain < 0) player.lossCarryforward += -gain;
  player.cash += salePrice;

  let title = state.landHoldings.find(holding => holding.developedBuildingId === buildingId);
  if (title) {
    title.ownerId = player.id;
    title.developedBuildingId = null;
  } else {
    const zone: ZoneType = building.type === 'apartment' ? 'residential'
      : building.type === 'factory' || building.type === 'warehouse' || building.type === 'mine' ? 'industrial'
      : 'commercial';
    title = {
      id: generateId(), ownerId: player.id, cityId: building.cityId,
      x: Math.round(building.x), y: Math.round(building.y), zone,
      purchasePrice: building.landValue, currentValue: building.landValue,
      purchaseTick: state.tick, developedBuildingId: null,
      propertyTaxRate: state.government.propertyTaxRate,
    };
    state.landHoldings.push(title);
  }

  state.buildings = state.buildings.filter(b => b.id !== buildingId);
  player.buildings = player.buildings.filter(id => id !== buildingId);
  invalidateRoadCache(building.cityId);
  
  addNotification(state, {
    id: generateId(),
    message: `Demolished ${building.name} and recovered $${formatMoney(salePrice)} in structural scrap. The land remains yours and is vacant.`, 
    type: 'info', tick: state.tick,
  });
  return { ...state, selectedBuilding: null };
}

export function setBuildingPrice(state: GameState, buildingId: string, mul: number): GameState {
  if (blockedByConstruction(state, buildingId)) return state;
  const building = state.buildings.find(b => b.id === buildingId);
  if (building) building.pricingMultiplier = Math.max(0.55, Math.min(1.8, mul));
  return { ...state };
}

/** Hire one operating employee at a city/role-adjusted salary. */
export function hireBuildingEmployee(
  state: GameState, buildingId: string, skillLevel = 2,
): GameState {
  if (blockedByConstruction(state, buildingId)) return state;
  const building = state.buildings.find(item => item.id === buildingId);
  const player = state.companies.find(company => company.isPlayer);
  const city = state.cities.find(item => item.id === building?.cityId);
  if (!building || !player || !city || building.companyId !== player.id) return state;
  if (building.type === 'apartment' || building.type === 'commercial'
      || building.type === 'hq' || building.type === 'rd_center') return state;
  if (building.employees >= building.targetEmployees) {
    addNotification(state, {
      id: generateId(), message: 'This building is fully staffed.',
      type: 'warning', tick: state.tick,
    });
    return state;
  }
  const rolePremium = building.type === 'factory' || building.type === 'mine' ? 1.18
    : building.type === 'warehouse' ? 1.08
    : building.type === 'restaurant' ? 1.12 : 1;
  const annualSalary = city.wageRate * 2080 * rolePremium * (0.9 + skillLevel * 0.08);
  const recruitingCost = annualSalary * 0.08;
  if (player.cash < recruitingCost + annualSalary / 12 * 3) {
    addNotification(state, {
      id: generateId(), message: `Recruiting requires $${formatMoney(recruitingCost)} plus three months payroll.`,
      type: 'warning', tick: state.tick,
    });
    return state;
  }
  player.cash -= recruitingCost;
  const oldPayroll = building.averageAnnualSalary * building.employees;
  building.employees += 1;
  building.averageAnnualSalary = (oldPayroll + annualSalary) / building.employees;
  building.staffSkill = (building.staffSkill * (building.employees - 1) + skillLevel)
    / building.employees;
  return { ...state };
}

/** Hire an executive (HQ) or researcher (R&D). Requires free capacity. */
export function hireStaff(state: GameState, buildingId: string, skillLevel: number): GameState {
  if (blockedByConstruction(state, buildingId)) return state;
  const building = state.buildings.find(b => b.id === buildingId);
  if (!building || (building.type !== 'hq' && building.type !== 'rd_center')) return state;
  const player = state.companies.find(c => c.isPlayer);
  if (!player || building.companyId !== player.id) return state;

  if (building.employees >= building.capacity) {
    addNotification(state, { id: generateId(), message: 'No space — upgrade for a larger floor plate.', type: 'warning', tick: state.tick });
    return { ...state };
  }

  const city = state.cities.find(c => c.id === building.cityId);
  if (!city) return state;

  // Higher skill = much higher salary; signing bonus is 6 months of salary.
  const salary = city.wageRate * 800 * (1 + skillLevel * 0.5);
  const signingCost = salary * 6;
  if (player.cash < signingCost) {
    addNotification(state, { id: generateId(), message: `Signing bonus: $${formatMoney(signingCost)}.`, type: 'danger', tick: state.tick });
    return { ...state };
  }

  player.cash -= signingCost;
  const oldPayroll = building.averageAnnualSalary * building.employees;
  building.employees += 1;
  building.averageAnnualSalary = (oldPayroll + salary) / building.employees;
  building.staffSkill = (building.staffSkill * (building.employees - 1) + skillLevel) / building.employees;

  const label = skillLevel >= 6 ? 'Senior' : skillLevel >= 3 ? 'Mid-Level' : 'Junior';
  addNotification(state, {
    id: generateId(),
    message: `Hired a ${label} ${building.type === 'hq' ? 'executive' : 'researcher'} (skill ${skillLevel}/9).`,
    type: 'success', tick: state.tick,
  });
  return { ...state };
}

/** Lay off one staff member (furthest from full productivity). */
export function layOffStaff(state: GameState, buildingId: string): GameState {
  if (blockedByConstruction(state, buildingId)) return state;
  const building = state.buildings.find(b => b.id === buildingId);
  if (!building || building.employees <= 0) return state;
  building.employees = Math.max(0, building.employees - 1);
  return { ...state };
}

/** Restore building condition without changing level/capacity. */
export function repairBuilding(
  state: GameState, buildingId: string, targetCondition = 100,
): GameState {
  if (blockedByConstruction(state, buildingId)) return state;
  const building = state.buildings.find(item => item.id === buildingId);
  const company = state.companies.find(item => item.isPlayer);
  if (!building || !company || building.companyId !== company.id) return state;
  const target = Math.max(building.condition, Math.min(100, targetCondition));
  const points = target - building.condition;
  if (points <= 0) return state;
  const cost = building.constructionCost * 0.006 * points;
  const reserveUse = Math.min(building.maintenanceReserve, cost);
  const cashNeeded = cost - reserveUse;
  if (company.cash < cashNeeded) {
    addNotification(state, {
      id: generateId(), message: `Repairs require $${formatMoney(cost)} ($${formatMoney(reserveUse)} available in reserve).`,
      type: 'warning', tick: state.tick,
    });
    return state;
  }
  building.maintenanceReserve -= reserveUse;
  company.cash -= cashNeeded;
  company.investingCashFlow -= cashNeeded;
  building.condition = target;
  building.isOperating = true;
  addNotification(state, {
    id: generateId(), message: `Repairs completed. ${building.name} condition restored to ${target.toFixed(0)}%.`,
    type: 'success', tick: state.tick,
  });
  return { ...state };
}

/** Asking rent as a multiple of the local market rate. Occupancy follows. */
export function setRentMultiplier(state: GameState, buildingId: string, multiplier: number): GameState {
  if (blockedByConstruction(state, buildingId)) return state;
  const building = state.buildings.find(b => b.id === buildingId);
  if (!building || (building.type !== 'apartment' && building.type !== 'commercial')) return state;

  // ── Monthly rent adjustment rule ──
  // Asking rent can be adjusted once per month per building.
  const MONTH_TICKS = 24 * 30;
  if (building.rentLastAdjustedTick > 0 && state.tick - building.rentLastAdjustedTick < MONTH_TICKS) {
    const daysLeft = Math.ceil((MONTH_TICKS - (state.tick - building.rentLastAdjustedTick)) / 24);
    addNotification(state, {
      id: generateId(),
      message: `Rent was adjusted this month — next change available in ${daysLeft} day(s).`,
      type: 'warning', tick: state.tick,
    });
    return state;
  }

  building.rentMultiplier = Math.max(0.6, Math.min(1.6, multiplier));
  building.rentLastAdjustedTick = state.tick;
  // Existing tenants stay for 3 months at the old rate; lease expiry handles outflow.
  building.leaseExpiryTick = state.tick + 24 * 30 * 3;

  addNotification(state, {
    id: generateId(),
    message: `Rent adjusted to ${(multiplier * 100).toFixed(0)}% of market. Next change in 30 days.`,
    type: 'info', tick: state.tick,
  });
  return { ...state };
}

export function setAdBudget(state: GameState, buildingId: string, budget: number): GameState {
  if (blockedByConstruction(state, buildingId)) return state;
  const building = state.buildings.find(b => b.id === buildingId);
  if (building) building.adBudget = Math.max(0, Math.min(150_000, budget));
  return { ...state };
}

// ── Loans ──
export function takeLoan(state: GameState, amount: number, termMonths: number): GameState {
  const player = state.companies.find(c => c.isPlayer);
  if (!player || amount <= 0) return state;
  const netAssets = Math.max(0, player.totalAssets - player.debt);
  const maxLoan = netAssets * 0.6;
  const loanAmount = Math.min(amount, maxLoan);
  if (loanAmount < 100_000) {
    addNotification(state, { id: generateId(), message: 'Insufficient borrowing capacity.', type: 'warning', tick: state.tick });
    return state;
  }
  const leverage = player.totalAssets > 0 ? player.debt / Math.max(1, player.totalAssets) : 0;
  if (state.economy.creditTightness > 0.6) {
    addNotification(state, { id: generateId(),
      message: 'Credit crunch: banks are not extending new loans right now.',
      type: 'danger', tick: state.tick });
    return { ...state };
  }
  const rate = state.economy.interestRate + 2.5 + leverage * 5
    + state.economy.creditTightness * 4;
  const monthlyRate = rate / 100 / 12;
  const payment = loanAmount * monthlyRate / (1 - Math.pow(1 + monthlyRate, -termMonths));

  // ── DSCR debt covenant ──
  // Banks won't lend if the NEW total monthly debt service exceeds 40% of
  // trailing annual EBITDA (Debt Service Coverage Ratio ≥ 2.5×).
  const annualEbitda = Math.max(0, player.profit * 24 * 365 + player.debt * (rate / 100));
  const existingMonthlyService = state.loans.reduce((s, l) => s + l.monthlyPayment, 0)
    + state.buildings.filter(b => b.companyId === player.id && !b.isLeased).reduce((s, b) => s + b.financingPayment, 0);
  const totalMonthlyService = existingMonthlyService + payment;
  const requiredEbitda = totalMonthlyService * 12 * 2.5;
  if (annualEbitda < requiredEbitda) {
    addNotification(state, {
      id: generateId(),
      message: `Loan declined — DSCR covenant. Need EBITDA of at least $${formatMoney(requiredEbitda)}/yr to service $${formatMoney(totalMonthlyService)}/mo. You have $${formatMoney(annualEbitda)}/yr.`,
      type: 'danger', tick: state.tick,
    });
    return { ...state };
  }

  const loan: Loan = { id: generateId(), amount: loanAmount, interestRate: rate, monthsRemaining: termMonths, monthlyPayment: payment };
  state.loans.push(loan);
  player.cash += loanAmount;
  player.debt += loanAmount;
  player.financingCashFlow += loanAmount;
  addNotification(state, {
    id: generateId(),
    message: `Borrowed $${formatMoney(loanAmount)} at ${rate.toFixed(2)}% for ${termMonths} months. Monthly: $${formatMoney(payment)}.`,
    type: 'success', tick: state.tick,
  });
  return { ...state };
}

export function repayLoan(state: GameState, loanId: string): GameState {
  const player = state.companies.find(c => c.isPlayer);
  const loan = state.loans.find(l => l.id === loanId);
  if (!player || !loan) return state;
  const payoff = loan.amount;
  if (player.cash < payoff) {
    addNotification(state, { id: generateId(), message: `Need $${formatMoney(payoff)} to pay off this loan.`, type: 'warning', tick: state.tick });
    return state;
  }
  player.cash -= payoff;
  player.debt = Math.max(0, player.debt - payoff);
  state.loans = state.loans.filter(l => l.id !== loanId);
  addNotification(state, { id: generateId(), message: `Paid off loan of $${formatMoney(payoff)}.`, type: 'success', tick: state.tick });
  return { ...state };
}

// ── Building acquisitions ──

/** Standardized DCF valuation used to freeze the fair value monthly. */
export function computeStandardFairValue(state: GameState, building: Building): number {
  // System (institutional) buildings are valued on replacement + land so they
  // can be listed, bought and financed like any other asset.
  if (building.companyId === 'system') {
    const depreciation = Math.max(0.4, building.condition / 100);
    return building.constructionCost * depreciation * 0.7 + building.landValue;
  }
  const annualNOI = building.profit * 24 * 365;
  const riskPremium = building.type === 'apartment' || building.type === 'commercial' ? 3.0
    : isHospitality(building.type) ? 7.5 : 6.0;
  const discountRate = Math.max(0.045, (state.economy.interestRate + riskPremium) / 100);
  const dcf = annualNOI > 0 ? Math.min(annualNOI / discountRate, annualNOI * 12) : 0;
  const depreciation = Math.max(0.35, building.condition / 100);
  const replacement = building.constructionCost * depreciation * 0.6 + building.landValue;
  return replacement + dcf;
}

/**
 * Buy a listed building outright, optionally with a mortgage (25% down, the
 * rest financed over the chosen term). Works for both institutional (system)
 * and AI-listed buildings that carry `forSale`.
 */
export function buyListedBuilding(
  state: GameState, buildingId: string, financePercent = 0, termMonths = 120,
): GameState {
  const building = state.buildings.find(b => b.id === buildingId);
  const player = state.companies.find(c => c.isPlayer);
  if (!building || !player) return state;
  // Public infrastructure like seaports is not for sale.
  if (building.type === 'seaport') {
    addNotification(state, { id: generateId(), message: 'Ports are state infrastructure — not for private sale.', type: 'warning', tick: state.tick });
    return { ...state };
  }
  if (!building.forSale && building.companyId !== 'system') return state;
  if (building.companyId === player.id) return state;

  const price = building.askingPrice > 0
    ? building.askingPrice
    : Math.round(computeStandardFairValue(state, building));
  const finance = Math.max(0, Math.min(0.75, financePercent));
  const downPayment = price * (1 - finance);
  const financed = price * finance;

  if (player.cash < downPayment) {
    addNotification(state, {
      id: generateId(),
      message: `Need $${formatMoney(downPayment)} down (${((1 - finance) * 100).toFixed(0)}%) to buy ${building.name}.`,
      type: 'danger', tick: state.tick,
    });
    return { ...state };
  }

  // Pay the seller.
  player.cash -= downPayment;
  player.investingCashFlow -= price;
  if (financed > 0) player.financingCashFlow += financed;
  const seller = state.companies.find(c => c.id === building.companyId);
  if (seller && !seller.isPlayer) seller.cash += price;

  // Set up mortgage financing.
  if (financed > 0) {
    const rate = state.economy.interestRate + 3;
    const monthlyRate = rate / 100 / 12;
    const payment = financed * monthlyRate / (1 - Math.pow(1 + monthlyRate, -termMonths));
    building.financingPayment = payment;
    building.financingMonthsLeft = termMonths;
    player.debt += financed;
  }

  // Transfer ownership.
  const previousOwner = state.companies.find(c => c.id === building.companyId);
  if (previousOwner) previousOwner.buildings = previousOwner.buildings.filter(id => id !== buildingId);
  building.companyId = player.id;
  building.supplyMode = 'manual';
  transferDevelopmentTitle(state, building.id, player.id);
  building.forSale = false;
  building.askingPrice = 0;
  building.isLeased = false;
  building.purchasePrice = price;
  building.acquiredAtTick = state.tick;
  building.employees = 0; // new owner hires their own staff
  building.averageAnnualSalary = 0;
  player.buildings.push(buildingId);
  invalidateRoadCache(building.cityId);

  addNotification(state, {
    id: generateId(),
    message: financed > 0
      ? `Bought ${building.name} for $${formatMoney(price)} — $${formatMoney(downPayment)} down, $${formatMoney(building.financingPayment)}/mo mortgage.`
      : `Bought ${building.name} for $${formatMoney(price)}.`,
    type: 'success', tick: state.tick,
  });
  return { ...state };
}

/**
 * Lease a listed/institutional building: no purchase, just a monthly rent
 * (≈ 0.9%/mo of value) on a 5-year commercial lease. You operate it but do
 * not own it, so you keep no resale value.
 */
export function leaseBuilding(state: GameState, buildingId: string): GameState {
  const building = state.buildings.find(b => b.id === buildingId);
  const player = state.companies.find(c => c.isPlayer);
  if (!building || !player) return state;
  if (building.companyId !== 'system') return state;
  if (building.type !== 'commercial' && building.type !== 'retail_store'
      && !isHospitality(building.type)) {
    addNotification(state, { id: generateId(), message: 'Only commercial, retail and hospitality space can be leased.', type: 'warning', tick: state.tick });
    return { ...state };
  }

  const value = computeStandardFairValue(state, building);
  const monthlyRent = value * 0.009;
  const deposit = monthlyRent * 3;
  if (player.cash < deposit) {
    addNotification(state, { id: generateId(), message: `Lease requires a $${formatMoney(deposit)} deposit (3 months).`, type: 'danger', tick: state.tick });
    return { ...state };
  }

  player.cash -= deposit;
  building.companyId = player.id;
  building.supplyMode = 'manual';
  building.isLeased = true;
  building.financingPayment = monthlyRent;
  building.financingMonthsLeft = 60; // 5-year lease
  building.forSale = false;
  building.employees = 0;
  building.averageAnnualSalary = 0;
  player.buildings.push(buildingId);
  invalidateRoadCache(building.cityId);

  addNotification(state, {
    id: generateId(),
    message: `Leased ${building.name} — $${formatMoney(monthlyRent)}/mo on a 5-year lease.`,
    type: 'success', tick: state.tick,
  });
  return { ...state };
}
export function getAskingPrice(state: GameState, buildingId: string): number | null {
  const building = state.buildings.find(b => b.id === buildingId);
  if (!building || building.companyId === 'system') return null;
  const seller = state.companies.find(c => c.id === building.companyId);
  if (!seller || seller.isPlayer) return null;
  return building.monthlyFairValue;
}

export function makePurchaseOffer(state: GameState, buildingId: string, offerAmount: number): GameState {
  const building = state.buildings.find(b => b.id === buildingId);
  const player = state.companies.find(c => c.isPlayer);
  if (!building || !player || building.companyId === player.id) return state;
  const seller = state.companies.find(c => c.id === building.companyId);
  if (!seller) return state;

  if (state.tick < building.negotiationBlockedUntil) {
    const monthsLeft = Math.max(1, Math.ceil((building.negotiationBlockedUntil - state.tick) / TICKS_PER_MONTH));
    state.lastOffer = {
      buildingId, status: 'rejected', offerAmount, counterAmount: building.cachedAsk,
      message: `${seller.name} broke off talks. Board won't revisit for ${monthsLeft} month(s).`,
      sellerName: seller.name,
    };
    return { ...state };
  }
  // Negotiations reference the month-start valuation; it does not jitter hourly.
  const askingPrice = building.monthlyFairValue;
  if (player.cash < offerAmount) {
    state.lastOffer = { buildingId, status: 'rejected', offerAmount, counterAmount: askingPrice, message: 'You lack the cash to finance this offer.', sellerName: seller.name };
    return { ...state };
  }
  if (offerAmount < askingPrice * 0.55) {
    building.negotiationBlockedUntil = state.tick + TICKS_PER_MONTH * 3;
    building.offersMade = 0;
    state.lastOffer = {
      buildingId, status: 'rejected', offerAmount, counterAmount: askingPrice,
      message: `${seller.name} considers $${formatMoney(offerAmount)} insulting for an asset they value at $${formatMoney(askingPrice)}. Talks closed for 3 months.`,
      sellerName: seller.name,
    };
    return { ...state };
  }
  if (offerAmount >= askingPrice) {
    player.cash -= offerAmount;
    seller.cash += offerAmount;
    seller.buildings = seller.buildings.filter(id => id !== buildingId);
    player.buildings.push(buildingId);
    building.companyId = player.id;
    building.supplyMode = 'manual';
    transferDevelopmentTitle(state, building.id, player.id);
    building.purchasePrice = offerAmount;
    building.acquiredAtTick = state.tick;
    building.offersMade = 0;
    state.lastOffer = { buildingId, status: 'accepted', offerAmount, counterAmount: 0, message: `${seller.name} accepted your offer of $${formatMoney(offerAmount)} for ${building.name}.`, sellerName: seller.name };
    addNotification(state, { id: generateId(), message: `Acquired ${building.name} from ${seller.name} for $${formatMoney(offerAmount)}.`, type: 'success', tick: state.tick });
    addNewsTicker(state, `${player.name} acquires ${building.name} from ${seller.name}`, 'breaking');
    return { ...state };
  }
  building.offersMade += 1;
  if (building.offersMade >= 3) {
    building.negotiationBlockedUntil = state.tick + TICKS_PER_MONTH * 3;
    building.offersMade = 0;
    state.lastOffer = {
      buildingId, status: 'rejected', offerAmount, counterAmount: askingPrice,
      message: `${seller.name} has ended negotiations — talks won't resume for 3 months.`,
      sellerName: seller.name,
    };
    return { ...state };
  }
  state.lastOffer = {
    buildingId, status: 'counter', offerAmount, counterAmount: askingPrice,
    message: `${seller.name} counters at $${formatMoney(askingPrice)}.`,
    sellerName: seller.name,
  };
  return { ...state };
}


/** Counter-offer to an incoming AI buyout bid. */
export function counterIncomingOffer(state: GameState, offerId: string, counterAmount: number): GameState {
  const offer = state.incomingOffers.find(o => o.id === offerId);
  const player = state.companies.find(c => c.isPlayer);
  const building = state.buildings.find(b => b.id === offer?.buildingId);
  const buyer = state.companies.find(c => c.id === offer?.buyerId);
  if (!offer || !player || !building || !buyer) return state;

  const fairValue = building.monthlyFairValue || offer.fairValue;
  const greed = buyer.aiStrategy === 'aggressive' ? 1.15 : buyer.aiStrategy === 'conservative' ? 0.98 : 1.08;
  const maxPriceAIWillPay = fairValue * greed;

  if (counterAmount <= maxPriceAIWillPay) {
    // AI accepts counter-offer!
    const finalPrice = Math.round(counterAmount);
    if (buyer.cash >= finalPrice) {
      buyer.cash -= finalPrice;
      player.cash += finalPrice;
      player.buildings = player.buildings.filter(id => id !== building.id);
      buyer.buildings.push(building.id);
      building.companyId = buyer.id;
      building.purchasePrice = finalPrice;
      building.acquiredAtTick = state.tick;
      building.forSale = false;
      building.askingPrice = 0;
      state.incomingOffers = state.incomingOffers.filter(o => o.id !== offerId);

      addNotification(state, {
        id: generateId(),
        message: `DEAL! ${buyer.name} accepted your counter-offer of $${formatMoney(finalPrice)} for ${building.name}.`,
        type: 'success', tick: state.tick,
      });
      addNewsTicker(state, `${buyer.name} acquires ${building.name} from ${player.name} for $${formatMoney(finalPrice)}`, 'breaking');
      invalidateRoadCache(building.cityId);
      return { ...state };
    }
  }

  if (counterAmount <= maxPriceAIWillPay * 1.15) {
    // AI makes a revised counter-offer
    const aiCounter = Math.round((maxPriceAIWillPay + counterAmount) / 2);
    offer.amount = aiCounter;
    addNotification(state, {
      id: generateId(),
      message: `${buyer.name} rejected $${formatMoney(counterAmount)} but countered at $${formatMoney(aiCounter)} for ${building.name}.`,
      type: 'warning', tick: state.tick,
    });
    return { ...state };
  }

  // AI rejects counter-offer and walks away
  state.incomingOffers = state.incomingOffers.filter(o => o.id !== offerId);
  addNotification(state, {
    id: generateId(),
    message: `${buyer.name} rejected your counter-offer of $${formatMoney(counterAmount)} and walked away.`,
    type: 'warning', tick: state.tick,
  });
  return { ...state };
}

export function acceptIncomingOffer(state: GameState, offerId: string): GameState {
  const offer = state.incomingOffers.find(o => o.id === offerId);
  const player = state.companies.find(c => c.isPlayer);
  const building = state.buildings.find(b => b.id === offer?.buildingId);
  const buyer = state.companies.find(c => c.id === offer?.buyerId);
  if (!offer || !player || !building || !buyer) return state;
  buyer.cash -= offer.amount;
  player.cash += offer.amount;
  player.buildings = player.buildings.filter(id => id !== building.id);
  buyer.buildings.push(building.id);
  building.companyId = buyer.id;
  if (buyer.isPlayer) building.supplyMode = 'manual';
  transferDevelopmentTitle(state, building.id, buyer.id);
  state.incomingOffers = state.incomingOffers.filter(o => o.id !== offerId);
  addNotification(state, { id: generateId(), message: `Sold ${building.name} to ${buyer.name} for $${formatMoney(offer.amount)}.`, type: 'success', tick: state.tick });
  addNewsTicker(state, `${buyer.name} acquires ${building.name} from ${player.name}`, 'breaking');
  return { ...state };
}

export function rejectIncomingOffer(state: GameState, offerId: string): GameState {
  state.incomingOffers = state.incomingOffers.filter(o => o.id !== offerId);
  return { ...state };
}

// ── Utility functions ──
export function formatMoney(amount: number): string {
  if (Math.abs(amount) >= 1_000_000_000) return (amount / 1_000_000_000).toFixed(2) + 'B';
  if (Math.abs(amount) >= 1_000_000) return (amount / 1_000_000).toFixed(2) + 'M';
  if (Math.abs(amount) >= 1_000) return (amount / 1_000).toFixed(1) + 'K';
  return amount.toFixed(0);
}

export function formatPopulation(pop: number): string {
  if (pop >= 1_000_000) return (pop / 1_000_000).toFixed(1) + 'M';
  if (pop >= 1_000) return (pop / 1_000).toFixed(0) + 'K';
  return pop.toString();
}

/** Start an R&D project on an R&D centre. Can genuinely fail (30%). */
export function startResearch(state: GameState, buildingId: string, productId: string): GameState {
  if (blockedByConstruction(state, buildingId)) return state;
  const building = state.buildings.find(b => b.id === buildingId);
  const player = state.companies.find(c => c.isPlayer);
  if (!building || !player || building.companyId !== player.id || building.type !== 'rd_center') return state;
  if (building.employees <= 0 || building.staffSkill <= 0) {
    addNotification(state, {
      id: generateId(), message: 'Hire at least one researcher before starting R&D.',
      type: 'warning', tick: state.tick,
    });
    return { ...state };
  }
  if (state.researchProjects.some(p => p.active && p.companyId === player.id)) {
    addNotification(state, { id: generateId(), message: 'One R&D project at a time per company.', type: 'warning', tick: state.tick });
    return { ...state };
  }
  const product = state.products.find(p => p.id === productId);
  if (!product) return state;
  state.researchProjects.push({
    id: generateId(), productId, companyId: player.id,
    targetTech: Math.ceil(product.techLevel + 5),
    progress: 0, active: true, completed: false, failed: false,
  });
  addNotification(state, {
    id: generateId(),
    message: `R&D started: ${product.name} → tech ${product.techLevel.toFixed(0)}+. ~30% of projects fail.`,
    type: 'info', tick: state.tick,
  });
  return { ...state };
}

/** Farm irrigation cushions weather losses but raises water/maintenance costs. */
export function setFarmIrrigation(
  state: GameState, buildingId: string, level: number,
): GameState {
  if (blockedByConstruction(state, buildingId)) return state;
  const farm = state.buildings.find(building => building.id === buildingId);
  if (farm?.type === 'farm') farm.irrigationLevel = Math.max(0, Math.min(1, level));
  return { ...state };
}

/** Invest in better agronomy/genetics/soil techniques (max level 5). */
export function investFarmResearch(state: GameState, buildingId: string): GameState {
  if (blockedByConstruction(state, buildingId)) return state;
  const farm = state.buildings.find(building => building.id === buildingId);
  const player = state.companies.find(company => company.isPlayer);
  if (!farm || !player || farm.type !== 'farm' || farm.companyId !== player.id) return state;
  if (farm.farmTechniqueLevel >= 5) return state;
  const cost = 75_000 * Math.pow(farm.farmTechniqueLevel + 1, 1.65);
  if (player.cash < cost) return state;
  player.cash -= cost;
  player.investingCashFlow -= cost;
  farm.farmTechniqueLevel += 1;
  addNotification(state, {
    id: generateId(),
    message: `Farm research reached level ${farm.farmTechniqueLevel}: +8% yield and +5 quality potential.`,
    type: 'success', tick: state.tick,
  });
  return { ...state };
}

/** Upgrade farm equipment (tractors, milking, cold storage), max level 5. */
export function upgradeFarmEquipment(state: GameState, buildingId: string): GameState {
  if (blockedByConstruction(state, buildingId)) return state;
  const farm = state.buildings.find(building => building.id === buildingId);
  const player = state.companies.find(company => company.isPlayer);
  if (!farm || !player || farm.type !== 'farm' || farm.companyId !== player.id) return state;
  if (farm.farmEquipmentLevel >= 5) return state;
  const cost = 120_000 * Math.pow(farm.farmEquipmentLevel + 1, 1.55);
  if (player.cash < cost) return state;
  player.cash -= cost;
  player.investingCashFlow -= cost;
  farm.farmEquipmentLevel += 1;
  addNotification(state, {
    id: generateId(),
    message: `Farm equipment reached level ${farm.farmEquipmentLevel}: +10% yield and +3 quality potential.`,
    type: 'success', tick: state.tick,
  });
  return { ...state };
}

/** Introduce a livestock breed (or crop variety) — one-time investment. */
export function setLivestockBreed(state: GameState, buildingId: string, breedId: string): GameState {
  const farm = state.buildings.find(building => building.id === buildingId);
  const player = state.companies.find(c => c.isPlayer);
  const breed = LIVESTOCK_BREEDS.find(b => b.id === breedId);
  if (!farm || !player || !breed || farm.type !== 'farm' || farm.companyId !== player.id) return state;
  if (farm.livestockBreed === breedId) return state;
  if (player.cash < breed.investmentCost) {
    addNotification(state, { id: generateId(), message: `Introducing ${breed.name} requires $${formatMoney(breed.investmentCost)} upfront.`, type: 'danger', tick: state.tick });
    return { ...state };
  }
  player.cash -= breed.investmentCost;
  farm.livestockBreed = breedId;
  // Switching breeds also aligns the output product.
  const product = state.products.find(p => p.name === breed.producesProduct);
  if (product) {
    farm.productId = product.id;
    farm.products = [product.id];
  }
  addNotification(state, { id: generateId(), message: `Introduced ${breed.name}. Yield ×${breed.yieldMul.toFixed(2)}, price ×${breed.priceMul.toFixed(2)}, quality +${breed.qualityBonus}.`, type: 'success', tick: state.tick });
  return { ...state };
}

/** Set farm feed quality (0-1). Better feed = higher yield and quality, higher cost. */
export function setFeedQuality(state: GameState, buildingId: string, level: number): GameState {
  if (blockedByConstruction(state, buildingId)) return state;
  const farm = state.buildings.find(building => building.id === buildingId);
  if (farm?.type === 'farm') farm.feedQuality = Math.max(0, Math.min(1, level));
  return { ...state };
}

/** Set farm veterinary/agronomy program level (0-3). */
export function setVetProgram(state: GameState, buildingId: string, level: number): GameState {
  if (blockedByConstruction(state, buildingId)) return state;
  const farm = state.buildings.find(building => building.id === buildingId);
  if (farm?.type === 'farm') farm.vetProgram = Math.max(0, Math.min(3, Math.round(level)));
  return { ...state };
}

/** Set product tier (standard/premium/organic). Certification takes months. */
export function setProductTier(state: GameState, buildingId: string, tier: 'standard' | 'premium' | 'organic'): GameState {
  if (blockedByConstruction(state, buildingId)) return state;
  const farm = state.buildings.find(building => building.id === buildingId);
  const player = state.companies.find(c => c.isPlayer);
  if (!farm || !player || farm.type !== 'farm' || farm.companyId !== player.id) return state;
  const tierData = PRODUCT_TIERS.find(t => t.id === tier);
  if (!tierData) return state;
  // Certification cost for premium/organic.
  const certCost = tier === 'organic' ? 25000 : tier === 'premium' ? 8000 : 0;
  if (certCost > 0 && player.cash < certCost) {
    addNotification(state, { id: generateId(), message: `${tierData.label} certification costs $${formatMoney(certCost)}.`, type: 'danger', tick: state.tick });
    return { ...state };
  }
  player.cash -= certCost;
  farm.productTier = tier;
  addNotification(state, { id: generateId(), message: `${farm.name} is now ${tierData.label} certified. +${tierData.qualityBonus} quality, ${((tierData.priceMul - 1) * 100).toFixed(0)}% price premium.`, type: 'success', tick: state.tick });
  return { ...state };
}

/** Set the open-market sell price multiplier for a producer (farm/factory/mine). */

/** Set transfer pricing mode for intra-company supply transfers. */
export function setTransferPricingMode(
  state: GameState, buildingId: string, mode: 'cost_basis' | 'custom' | 'market_spot'
): GameState {
  if (blockedByConstruction(state, buildingId)) return state;
  const b = state.buildings.find(item => item.id === buildingId);
  if (b) b.transferPricingMode = mode;
  return { ...state };
}

export function setTransferPriceMultiplier(
  state: GameState, buildingId: string, multiplier: number
): GameState {
  if (blockedByConstruction(state, buildingId)) return state;
  const b = state.buildings.find(item => item.id === buildingId);
  if (b) b.transferPriceMultiplier = Math.max(0.5, Math.min(2.5, multiplier));
  return { ...state };
}

export function setSellPrice(state: GameState, buildingId: string, multiplier: number): GameState {
  if (blockedByConstruction(state, buildingId)) return state;
  const b = state.buildings.find(item => item.id === buildingId);
  if (b && ['farm', 'factory', 'mine'].includes(b.type)) {
    b.sellPriceMultiplier = Math.max(0.4, Math.min(2.0, multiplier));
  }
  return { ...state };
}

/** Toggle whether a producer sells surplus on the open market. */
export function toggleOpenMarketSales(state: GameState, buildingId: string): GameState {
  if (blockedByConstruction(state, buildingId)) return state;
  const b = state.buildings.find(item => item.id === buildingId);
  if (b) b.openMarketSales = !b.openMarketSales;
  return { ...state };
}

/** Purchase a 12-month competitor intelligence report. */
export function buyCompetitorIntel(
  state: GameState, companyId: string, level: 1 | 2,
): GameState {
  const player = state.companies.find(company => company.isPlayer);
  const target = state.companies.find(company => company.id === companyId && !company.isPlayer);
  if (!player || !target) return state;
  const cost = level === 1 ? 50_000 : 250_000;
  if (player.cash < cost) return state;
  player.cash -= cost;
  target.playerIntelLevel = level;
  target.intelExpiresTick = state.tick + 24 * 30 * 12;
  return { ...state };
}

// ── Equity: buy/sell shares of listed companies, issue your own ──

/** Buy shares of any listed company (including a stake in a rival). */
export function buyCompanyShares(state: GameState, companyId: string, shares: number): GameState {
  const player = state.companies.find(c => c.isPlayer);
  const target = state.companies.find(c => c.id === companyId);
  if (!player || !target || shares <= 0 || target.isPlayer) return state;

  const fee = 0.005; // 0.5% brokerage
  const cost = shares * target.sharePrice * (1 + fee);
  if (player.cash < cost) {
    addNotification(state, { id: generateId(), message: `Need $${formatMoney(cost)} to buy ${shares.toLocaleString()} shares.`, type: 'danger', tick: state.tick });
    return { ...state };
  }

  // Cannot buy more than the public float (outstanding minus founder shares).
  const held = player.equityHoldings[companyId] ?? 0;
  const publicFloat = Math.max(0, target.sharesOutstanding - target.founderShares);
  if (held + shares > publicFloat) {
    addNotification(state, { id: generateId(), message: `Only ${(publicFloat - held).toLocaleString()} shares are in public float.`, type: 'warning', tick: state.tick });
    return { ...state };
  }

  player.cash -= cost;
  player.equityHoldings[companyId] = held + shares;
  player.equityCostBasis[companyId] = (player.equityCostBasis[companyId] ?? 0) + cost;
  // Buying pressure nudges the price up.
  target.sharePrice *= 1 + (shares / target.sharesOutstanding) * 0.5;
  target.marketCap = target.sharePrice * target.sharesOutstanding;

  const stakePct = (player.equityHoldings[companyId] / target.sharesOutstanding) * 100;
  // Hostile takeover at >50%.
  if (stakePct > 50) {
    for (const b of state.buildings.filter(b => b.companyId === target.id)) {
      b.companyId = player.id;
      player.buildings.push(b.id);
    }
    target.buildings = [];
    addNewsTicker(state, `${player.name} acquires majority control of ${target.name} in a hostile takeover!`, 'breaking');
    addNotification(state, { id: generateId(), message: `You now control ${target.name} (${stakePct.toFixed(0)}%) — its assets are yours.`, type: 'success', tick: state.tick });
  } else {
    addNotification(state, { id: generateId(), message: `Bought ${shares.toLocaleString()} shares of ${target.name} (${stakePct.toFixed(1)}% stake).`, type: 'success', tick: state.tick });
  }
  return { ...state };
}

/** Sell shares of a company you hold. */
export function sellCompanyShares(state: GameState, companyId: string, shares: number): GameState {
  const player = state.companies.find(c => c.isPlayer);
  const target = state.companies.find(c => c.id === companyId);
  if (!player || !target) return state;
  const held = player.equityHoldings[companyId] ?? 0;
  const sellShares = Math.min(shares, held);
  if (sellShares <= 0) return state;

  const fee = 0.005;
  const proceeds = sellShares * target.sharePrice * (1 - fee);
  const basis = (player.equityCostBasis[companyId] ?? 0) * (sellShares / held);
  const gain = proceeds - basis;

  player.cash += proceeds;
  player.equityHoldings[companyId] = held - sellShares;
  player.equityCostBasis[companyId] = (player.equityCostBasis[companyId] ?? 0) - basis;
  if (player.equityHoldings[companyId] <= 0) {
    delete player.equityHoldings[companyId];
    delete player.equityCostBasis[companyId];
  }
  // Capital gains tax on the profit.
  if (gain > 0) {
    const tax = gain * (state.economy.longTermCapitalGainsRate / 100);
    player.cash -= tax;
    player.taxesPaidYTD += tax;
  } else {
    player.lossCarryforward += -gain;
  }
  // Selling pressure nudges the price down.
  target.sharePrice *= 1 - (sellShares / target.sharesOutstanding) * 0.5;
  target.marketCap = target.sharePrice * target.sharesOutstanding;

  addNotification(state, { id: generateId(), message: `Sold ${sellShares.toLocaleString()} shares of ${target.name} for $${formatMoney(proceeds)} (${gain >= 0 ? 'gain' : 'loss'} $${formatMoney(Math.abs(gain))}).`, type: 'info', tick: state.tick });
  return { ...state };
}

/**
 * Issue new shares of YOUR company to raise cash. Dilutes existing holders,
 * so the share price drops proportionally. Founder stake is diluted too.
 */
export function issueOwnShares(state: GameState, shares: number): GameState {
  const player = state.companies.find(c => c.isPlayer);
  if (!player || shares <= 0) return state;
  if (player.shareIssuanceYear !== state.year) {
    player.shareIssuanceYear = state.year;
    player.sharesIssuedThisYear = 0;
  }
  const annualCap = Math.floor((player.sharesOutstanding - player.sharesIssuedThisYear) * 0.20);
  const remaining = Math.max(0, annualCap - player.sharesIssuedThisYear);
  if (shares > remaining || remaining <= 0) {
    addNotification(state, {
      id: generateId(),
      message: `Annual issuance cap reached. You may issue ${remaining.toLocaleString()} more shares this year.`,
      type: 'warning', tick: state.tick,
    });
    return state;
  }

  // New shares sell at a ~4% discount to market (underwriting).
  const proceeds = shares * player.sharePrice * 0.96;
  const newTotal = player.sharesOutstanding + shares;
  // Dilution: market cap grows by proceeds, but total shares grew more.
  const newMarketCap = player.marketCap + proceeds;
  player.sharesOutstanding = newTotal;
  player.sharePrice = newMarketCap / newTotal;
  player.marketCap = newMarketCap;
  player.cash += proceeds;
  player.financingCashFlow += proceeds;
  player.sharesIssuedThisYear += shares;

  addNotification(state, {
    id: generateId(),
    message: `Issued ${shares.toLocaleString()} new shares, raising $${formatMoney(proceeds)}. Share price now $${player.sharePrice.toFixed(2)}.`,
    type: 'success', tick: state.tick,
  });
  addNewsTicker(state, `${player.name} completes a secondary share offering, raising $${formatMoney(proceeds)}`, 'info');
  return { ...state };
}

/** Run the line harder than nameplate. More output, worse quality. */
export function setProductionIntensity(state: GameState, buildingId: string, intensity: number): GameState {
  if (blockedByConstruction(state, buildingId)) return state;
  const building = state.buildings.find(b => b.id === buildingId);
  if (building) building.productionIntensity = Math.max(0.6, Math.min(1.4, intensity));
  return { ...state };
}

/** Safety stock vs just-in-time. Lean frees cash but risks stockouts. */
export function setSafetyStockPolicy(state: GameState, buildingId: string, policy: number): GameState {
  if (blockedByConstruction(state, buildingId)) return state;
  const building = state.buildings.find(b => b.id === buildingId);
  if (building) building.safetyStockPolicy = Math.max(0, Math.min(1, policy));
  return { ...state };
}

/** Quotes available suppliers for a product, including landed cost and service history. */
export function getSupplyContractOffers(
  state: GameState, buildingId: string, productId: string,
): SupplyContractOffer[] {
  const buyer = state.buildings.find(b => b.id === buildingId);
  const product = state.products.find(p => p.id === productId);
  if (!buyer || !product) return [];
  const buyerCity = state.cities.find(c => c.id === buyer.cityId);
  return state.buildings
    .filter(supplier => supplier.id !== buyer.id && supplier.isOperating && supplier.products.includes(productId))
    .filter(supplier => ['seaport', 'farm', 'mine', 'factory', 'warehouse'].includes(supplier.type))
    .filter(supplier => !supplier.internalSale || supplier.companyId === buyer.companyId)
    .map(supplier => {
      const supplierCity = state.cities.find(c => c.id === supplier.cityId);
      const distance = Math.max(1, Math.hypot(supplier.x - buyer.x, supplier.y - buyer.y));
      const fuel = distance * 0.05 * state.economy.dieselPrice;
      const driverWage = supplierCity?.wageRate ?? buyerCity?.wageRate ?? 15;
      const freightPerUnit = (fuel + distance / 50 * driverWage)
        * (supplier.cityId === buyer.cityId ? 1 : 1.25) / 250;
      const relationship = buyer.supplierRelationships[supplier.id] ?? 0;
      const loyaltyDiscount = Math.min(0.15, relationship / 100 * 0.15);
      const importMul = supplier.companyId === 'system' ? importCostMultiplier(state) : 1;
      const worldPrice = state.globalMarket?.price[productId] ?? product.productionCost * 0.9;
      const pricePerUnit = (supplier.companyId === 'system'
          ? worldPrice * 1.12 * importMul
          : product.productionCost * (0.92 + supplier.trainingLevel * 0.025))
        * (1 - loyaltyDiscount);
      const prior = buyer.supplierLinks.find(link =>
        link.productId === productId && link.supplierBuildingId === supplier.id);
      const supplierCompany = state.companies.find(c => c.id === supplier.companyId);
      return {
        productId,
        supplierBuildingId: supplier.id,
        supplierName: supplier.name,
        supplierCompanyName: supplierCompany?.name ?? 'Public Seaport',
        pricePerUnit,
        freightPerUnit,
        landedCost: pricePerUnit + freightPerUnit,
        quality: supplier.type === 'mine' ? product.quality
          : Math.min(100, product.quality + supplier.trainingLevel * 2.2),
        reliability: prior?.reliability ?? 75,
        availableStock: supplier.inventory[productId] ?? 0,
        loyaltyDiscount,
      };
    })
    .sort((a, b) => a.landedCost - b.landedCost);
}

/** Signs a manual 12-month B2B supply contract. */
export function signSupplyContract(
  state: GameState, buildingId: string, productId: string, supplierBuildingId: string,
): GameState {
  if (blockedByConstruction(state, buildingId)) return state;
  const buyer = state.buildings.find(b => b.id === buildingId);
  if (!buyer) return state;
  const offer = getSupplyContractOffers(state, buildingId, productId)
    .find(item => item.supplierBuildingId === supplierBuildingId);
  if (!offer) return state;

  buyer.supplyMode = 'manual';
  const isInternal = offer.supplierCompanyName === state.companies.find(c => c.id === buyer.companyId)?.name;
  buyer.supplierLinks = buyer.supplierLinks
    .filter(link => link.productId !== productId)
    .concat({
      contractId: generateId(), productId, supplierBuildingId,
      pricePerUnit: offer.pricePerUnit, freightPerUnit: offer.freightPerUnit,
      quality: offer.quality, startedTick: state.tick,
      expiresTick: state.tick + 24 * 30 * 12,
      reliability: offer.reliability, punctuality: 100,
      deliveries: 0, onTimeDeliveries: 0,
      loyaltyDiscount: offer.loyaltyDiscount,
      minimumOrder: Math.max(10, Math.round(buyer.capacity * 0.1)),
      noticeMonths: 3, active: true,
      contractType: isInternal ? 'internal' : 'forward_contract',
      penaltyFee: Math.round(offer.pricePerUnit * Math.max(10, Math.round(buyer.capacity * 0.1)) * 3),
      volumeCommitment: Math.round(buyer.capacity * 0.9),
      rejectionRate: Math.max(0, (50 - offer.quality) * 0.002),
    });
  addNotification(state, {
    id: generateId(),
    message: `Signed a 12-month ${offer.supplierName} contract at $${offer.landedCost.toFixed(2)} landed per unit.`,
    type: 'success', tick: state.tick,
  });
  return { ...state };
}

/** Terminates a contract early; the buyer pays three months of minimum-order value. */
export function terminateSupplyContract(
  state: GameState, buildingId: string, contractId: string,
): GameState {
  if (blockedByConstruction(state, buildingId)) return state;
  const buyer = state.buildings.find(b => b.id === buildingId);
  const company = state.companies.find(c => c.id === buyer?.companyId);
  const contract = buyer?.supplierLinks.find(link => link.contractId === contractId);
  if (!buyer || !company || !contract) return state;
  const fee = contract.minimumOrder * contract.pricePerUnit * contract.noticeMonths;
  if (company.cash < fee) {
    addNotification(state, {
      id: generateId(), message: `Early termination fee is $${formatMoney(fee)}.`,
      type: 'warning', tick: state.tick,
    });
    return state;
  }
  company.cash -= fee;
  buyer.supplierLinks = buyer.supplierLinks.filter(link => link.contractId !== contractId);
  buyer.supplyMode = buyer.supplierLinks.length > 0 ? 'manual' : 'auto';
  addNotification(state, {
    id: generateId(), message: `Contract terminated for $${formatMoney(fee)}.`,
    type: 'info', tick: state.tick,
  });
  return { ...state };
}

export function setSupplyMode(
  state: GameState, buildingId: string, mode: 'auto' | 'manual',
): GameState {
  if (blockedByConstruction(state, buildingId)) return state;
  const building = state.buildings.find(b => b.id === buildingId);
  if (building) building.supplyMode = mode;
  return { ...state };
}

/** Re-source a stranded site after a supplier failure. */
export function autoSourceBuilding(state: GameState, buildingId: string): GameState {
  if (blockedByConstruction(state, buildingId)) return state;
  if (state.paused) {
    addNotification(state, { id: generateId(), message: 'Resume time before requesting operational supply.', type: 'warning', tick: state.tick });
    return { ...state };
  }
  const building = state.buildings.find(b => b.id === buildingId);
  if (!building) return state;
  building.supplyDisrupted = false;
  building.supplierLinks = [];
  const index = buildStateIndex(state);
  refreshBuildingSupply(state, building, index);
  addNotification(state, { id: generateId(), message: `${building.name} re-sourced to the lowest landed-cost supplier.`, type: 'success', tick: state.tick });
  return { ...state };
}

export function clearLastOffer(state: GameState): GameState {
  state.lastOffer = null;
  return { ...state };
}


// ============= RE-EXPORTS =============
export {
  buyAsset, sellAsset, playerPortfolioValue, marketImpact, TRANSACTION_FEE,
  recentSellLoss,
} from './markets';
export { personalIncomeTax, TAX_BRACKETS_ANNUAL } from './macro';
export {
  issueBond, buyBond, sellBond, computeYieldCurve, markToMarket,
} from './bonds';
export { productRating } from './consumers';
export { generateEntities, updateEntities } from './entities';
export {
  getRoadNetwork, tileIsRoad, isOnHighway, allHighwayTiles,
  highwayEdges, nearestIntersection, highwayTiles, invalidateRoadCache,
  CITY_ROAD_RADIUS,
} from './roads';
export { buildStateIndex, queryRadius } from './indexing';

// ============= DAILY WORLD MARKET =============
/**
 * World prices clear DAILY, not monthly. Export surges flood the external
 * market and crash the price within days; import binges bid it up. This closes
 * the "infinite money via seaport exports" exploit: selling into the world
 * market is self-defeating once volume outruns external demand.
 */
function updateGlobalMarketDaily(state: GameState): void {
  const gm = state.globalMarket;
  if (!gm) return;
  for (const product of state.products) {
    const current = gm.price[product.id] ?? product.productionCost * 0.9;
    const targetPrice = product.productionCost * 0.9 * (1 + state.economy.inflation / 100);
    const dailyProdEstimate = Math.max(40, product.marketDemand * 4);
    const netFlowPct = (gm.netExport[product.id] ?? 0) / dailyProdEstimate;
    // Strong daily elasticity: ±25% max move per day from trade pressure.
    const flowShift = Math.max(-0.25, Math.min(0.25, netFlowPct * 0.6));
    const reversion = (targetPrice - current) * 0.03;
    gm.price[product.id] = Math.max(product.productionCost * 0.35,
      Math.min(product.productionCost * 3, current + reversion + current * flowShift));
    gm.netExport[product.id] = (gm.netExport[product.id] ?? 0) * 0.85;
  }
}

// ============= AI BEHAVIORS: R&D, TIERS, MARKETING, UNIONS, COUNTER-INTEL =============
function simulateAIBehaviors(state: GameState): void {
  for (const company of state.companies) {
    if (company.isPlayer) continue;

    // ── AI repays debt when profitable; distressed firms may default ──
    if (company.debt > 0 && company.profit > 0) {
      const repay = Math.min(company.debt, company.profit * 24 * 30 * 0.25);
      company.cash -= repay;
      company.debt -= repay;
      company.financingCashFlow -= repay;
    }

    const myBuildings = state.buildings.filter(b => b.companyId === company.id);

    // ── AI R&D investment: shrewd/ruthless boards fund research ──
    if (company.acumen >= 0.7 && company.cash > 8_000_000) {
      const centers = myBuildings.filter(b => b.type === 'rd_center' && b.employees > 0);
      const hasActive = state.researchProjects.some(pr => pr.active && pr.companyId === company.id);
      if (centers.length > 0 && !hasActive && Math.random() < 0.5) {
        const candidates = state.products.filter(pr =>
          pr.unlockYear <= state.year && (pr.kind === 'consumer' || pr.kind === 'semi')
          && (pr.priceWeight < 45 || pr.qualityWeight > 40));
        if (candidates.length > 0) {
          const target = candidates[Math.floor(Math.random() * candidates.length)];
          state.researchProjects.push({
            id: generateId(), productId: target.id, companyId: company.id,
            targetTech: Math.ceil(target.techLevel + 4 + company.acumen * 3),
            progress: 0, active: true, completed: false, failed: false,
          });
        }
      }
    }

    for (const b of myBuildings) {
      // ── AI product tiering on farms: margin-focused boards go premium ──
      if (b.type === 'farm' && company.acumen >= 0.6 && b.productTier === 'standard'
          && company.cash > 300_000 && Math.random() < 0.2) {
        b.productTier = company.acumen >= 0.85 ? 'organic' : 'premium';
      }

      // ── AI marketing optimisation: spend scales with brand elasticity ──
      if (b.type === 'retail_store' || isHospitality(b.type)) {
        const main = state.products.find(pr => pr.id === (b.productId ?? b.products[0]));
        if (main) {
          const brandElastic = main.brandWeight / 100;
          const margin = Math.max(0, 1 - (b.cogs / Math.max(1, b.revenue)));
          const optimal = brandElastic * margin * b.capacity * 40 * company.acumen;
          // Status-quo bias: only adjust ad budget when the gap is large.
          if (Math.abs(optimal - b.adBudget) > b.adBudget * 0.35 + 2000) {
            b.adBudget = Math.max(0, Math.min(150_000, optimal));
          }
        }
      }

      // ── Unionisation: large factories organise; strikes follow low morale ──
      if ((b.type === 'factory' || b.type === 'mine') && b.employees > 25 && !b.unionized) {
        const city = state.cities.find(c => c.id === b.cityId);
        const prob = 0.03 * (1 + (city?.pollution ?? 0) / 120);
        if (Math.random() < prob) {
          b.unionized = true;
          b.unionWagePremium = 0.08 + Math.random() * 0.07;
          addNewsTicker(state, `${company.name} workforce at ${b.name} votes to unionise (+${(b.unionWagePremium * 100).toFixed(0)}% wages)`, 'info');
        }
      }
      if (b.unionized && b.employeeSatisfaction < 35 && b.strikeTicks <= 0 && Math.random() < 0.25) {
        b.strikeTicks = 24 * 7;
        addNewsTicker(state, `Workers strike at ${company.name}'s ${b.name} — a week of lost output`, 'warning');
      }
    }

    // ── Counter-intel: AI watches the PLAYER's public prices and undercuts ──
    // Prices are public information; a sharp rival reciprocates when the
    // player is running hot, removing the one-way undercut exploit.
    if (company.acumen >= 0.55) {
      for (const b of myBuildings) {
        if (b.type !== 'retail_store' && !isHospitality(b.type)) continue;
        const playerRival = state.buildings.find(pb =>
          pb.companyId !== company.id && state.companies.find(c => c.id === pb.companyId)?.isPlayer
          && pb.cityId === b.cityId && pb.type === b.type && pb.utilization > 80);
        if (playerRival && b.pricingMultiplier > playerRival.pricingMultiplier * 1.02) {
          b.pricingMultiplier = Math.max(0.7, playerRival.pricingMultiplier * (1 - company.acumen * 0.06));
        }
      }
    }
  }
}

// ============= POLITICAL ECONOMY =============
function updatePoliticalEconomy(state: GameState): void {
  const pol = state.politics;
  const eco = state.economy;
  const gov = state.government;

  // Lobby power tracks the size of each bloc in the real economy.
  const totalB = Math.max(1, state.buildings.length);
  const industrial = state.buildings.filter(b => b.type === 'factory' || b.type === 'mine').length;
  pol.industryLobbyPower = Math.min(1, pol.industryLobbyPower * 0.95 + (industrial / totalB) * 0.4);
  pol.environmentalLobbyPower = Math.min(1,
    pol.environmentalLobbyPower * 0.95 + (eco.co2Stock - 370) / 800);

  // Approval responds to jobs, prices and growth.
  pol.approval = Math.max(5, Math.min(95, pol.approval
    + (eco.gdpGrowth - 1.5) * 0.4 - (eco.inflation - 2.5) * 0.8 - (eco.unemployment - 5) * 0.6));

  // Lobby pressure bends policy between elections.
  gov.carbonTaxPerUnit = Math.max(0, gov.carbonTaxPerUnit
    + pol.environmentalLobbyPower * 0.02 - pol.industryLobbyPower * 0.015);

  // ── Elections every four years make policy endogenous ──
  if (state.year >= pol.nextElectionYear) {
    pol.nextElectionYear += 4;
    const roll = Math.random() * 100;
    pol.rulingParty = roll < pol.approval * 0.5 ? 'centrist'
      : roll < pol.approval * 0.5 + 30 ? 'progressive' : 'libertarian';
    if (pol.rulingParty === 'progressive') {
      gov.corporateTaxRate = Math.min(35, gov.corporateTaxRate + 2);
      gov.carbonTaxPerUnit += 0.25;
      gov.antitrustThreshold = Math.max(30, gov.antitrustThreshold - 5);
    } else if (pol.rulingParty === 'libertarian') {
      gov.corporateTaxRate = Math.max(15, gov.corporateTaxRate - 2);
      gov.carbonTaxPerUnit = Math.max(0, gov.carbonTaxPerUnit - 0.25);
      gov.antitrustThreshold = Math.min(60, gov.antitrustThreshold + 5);
    }
    addNewsTicker(state, `${pol.rulingParty.toUpperCase()} government elected (approval ${pol.approval.toFixed(0)}%). Corporate tax now ${gov.corporateTaxRate}%.`, 'breaking');
  }
}

// ============= BANKING SECTOR & MINSKY MOMENT =============
function updateBankingSector(state: GameState): void {
  const eco = state.economy;
  const totalDebt = state.companies.reduce((s, c) => s + c.debt, 0)
    + state.loans.reduce((s, l) => s + l.amount, 0);
  const debtGdp = totalDebt / Math.max(1, eco.nominalGdp);

  // Loan-loss provisions rise with leverage; defaults hit bank capital.
  const defaults = state.companies.filter(c => c.monthsInDistress > 2)
    .reduce((s, c) => s + c.debt * 0.02, 0);
  eco.loanLossProvisions = eco.loanLossProvisions * 0.9 + defaults;
  eco.bankCapitalAdequacy = Math.max(0.02, Math.min(0.2,
    eco.bankCapitalAdequacy + (0.12 - eco.bankCapitalAdequacy) * 0.05
    - defaults / Math.max(1, eco.nominalGdp) * 4));

  // Minsky: prolonged debt accumulation makes the system fragile. When the
  // debt ratio crosses 1.5× GDP and capital erodes, a credit crunch hits.
  if (debtGdp > 1.5 && eco.bankCapitalAdequacy < 0.08 && eco.creditTightness < 0.5
      && Math.random() < 0.06) {
    eco.creditTightness = 0.85;
    addNewsTicker(state, `MINSKY MOMENT: debt/GDP at ${debtGdp.toFixed(1)}× with thin bank capital — credit crunch begins`, 'breaking');
    addNotification(state, { id: generateId(),
      message: 'Credit crunch: banks freeze lending and call margins. Asset prices under pressure.',
      type: 'danger', tick: state.tick });
  }
  // Tightness slowly normalises as balance sheets repair.
  eco.creditTightness = Math.max(0, eco.creditTightness - 0.04);
}

// ============= ENVIRONMENT =============
function updateEnvironmentStocks(state: GameState): void {
  // Pollution decays slowly; climate damage drags growth when CO2 is high.
  for (const city of state.cities) {
    city.pollution = Math.max(0, city.pollution * 0.985);
  }
  const eco = state.economy;
  if (eco.co2Stock > 420) {
    eco.gdpGrowth = Math.max(-6, eco.gdpGrowth - (eco.co2Stock - 420) * 0.00004);
  }
}

// ============= HOUSEHOLD BALANCE SHEETS =============
function updateHouseholdBalanceSheets(state: GameState): void {
  for (const city of state.cities) {
    const recession = state.economy.cycle === 'recession';
    if (recession) {
      // Households first draw down savings, then borrow, then are forced to
      // deleverage — spending collapses only after buffers are exhausted.
      if (city.householdSavingsMonths > 0) {
        city.householdSavingsMonths = Math.max(0, city.householdSavingsMonths - 0.15);
      } else if (city.householdDebtRatio < 0.4) {
        city.householdDebtRatio = Math.min(0.4, city.householdDebtRatio + 0.01);
      } else {
        // Deleveraging: cut spending to repay debt.
        city.householdDebtRatio = Math.max(0.1, city.householdDebtRatio - 0.008);
        city.discretionaryBudget.low *= 0.97;
        city.discretionaryBudget.middle *= 0.97;
        city.discretionaryBudget.affluent *= 0.97;
      }
    } else {
      // In expansions households rebuild savings and slowly repay debt.
      city.householdSavingsMonths = Math.min(4, city.householdSavingsMonths + 0.05);
      city.householdDebtRatio = Math.max(0.1, city.householdDebtRatio - 0.004);
    }
  }
}

// ============= ESPIONAGE MINIGAME =============
/**
 * Industrial espionage: pay $150K to learn a rival's cost floors for 6 months.
 * 60% success; on failure you are fined and the rival hardens its pricing.
 */

/** Purchase market research for a specific product category to reveal hidden metrics. */
export function buyMarketResearch(state: GameState, category: string): GameState {
  const player = state.companies.find(c => c.isPlayer);
  if (!player) return state;
  const cost = 250_000;
  if (player.cash < cost) {
    addNotification(state, { id: generateId(), message: `Market research requires $${formatMoney(cost)}.`, type: 'danger', tick: state.tick });
    return state;
  }
  if (!player.researchedCategories) player.researchedCategories = [];
  if (player.researchedCategories.includes(category)) return state;
  
  player.cash -= cost;
  player.researchedCategories.push(category);
  addNotification(state, { id: generateId(), message: `Market research for ${category} acquired.`, type: 'success', tick: state.tick });
  return { ...state };
}

export function runEspionage(state: GameState, targetCompanyId: string): GameState {
  const player = state.companies.find(c => c.isPlayer);
  const target = state.companies.find(c => c.id === targetCompanyId && !c.isPlayer);
  if (!player || !target) return state;
  const cost = 150_000;
  if (player.cash < cost) return state;
  player.cash -= cost;

  if (Math.random() < 0.6) {
    target.espionageCostIntelUntilTick = state.tick + 24 * 30 * 6;
    addNotification(state, { id: generateId(),
      message: `Espionage successful: ${target.name}'s cost floors exposed for 6 months.`,
      type: 'success', tick: state.tick });
  } else {
    const fine = player.cash * 0.02;
    player.cash -= fine;
    player.taxesPaidYTD += fine;
    addNewsTicker(state, `${player.name} caught spying on ${target.name} — fined $${formatMoney(fine)}`, 'breaking');
    addNotification(state, { id: generateId(),
      message: `Espionage failed. Regulators fined you $${formatMoney(fine)}.`,
      type: 'danger', tick: state.tick });
  }
  return { ...state };
}
