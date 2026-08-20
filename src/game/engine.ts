import type {
  GameState, City, Company, Building, Product, Economy, IsometricTile,
  BuildingType, Notification, EconomyCycle, FreightRoute, ProductKind,
  AISkill, TradedAsset, IncomingOffer, OfferResult, Loan, NewsTickerItem,
  ForwardGuidance, ZoneType, MovingEntity, MenuItem, SupplierLink,
} from './types';
import {
  PRODUCT_CATEGORIES, PRODUCT_RULES, BUILDING_CONFIGS, CITY_NAMES,
  COMPANY_NAMES, COMPANY_COLORS, segmentFor, isHospitality,
  MENU_TEMPLATES, KIDS_TOY_COST, VENUE_INGREDIENTS, RETAIL_CATEGORIES,
} from './constants';
import {
  invalidateRoadCache, allHighwayTiles, tileIsRoad, isOnHighway,
  snapOffRoad, highwayProximity, CITY_ROAD_RADIUS,
} from './roads';
import { buildStateIndex, queryRadius, type StateIndex } from './indexing';

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
    const rawPop = 80000 + Math.floor(rand() * 1200000);
    const tier = rawPop > 800000 ? 'metropolis' as const : rawPop > 400000 ? 'large' as const : rawPop > 200000 ? 'medium' as const : 'small' as const;
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
    };
  });
}

// ============= COMPANY GENERATION =============
function generateCompanies(rand: () => number, playerName: string): Company[] {
  const player: Company = {
    id: generateId(), name: playerName, isPlayer: true,
    cash: 50_000_000, revenue: 0, profit: 0, expenses: 0,
    totalAssets: 50_000_000, debt: 0, interestRate: 5,
    sharePrice: 10, sharesOutstanding: 1_000_000,
    marketCap: 10_000_000, brandValue: 10, color: '#10b981',
    aiStrategy: 'balanced', buildings: [], bondRating: 'A',
    skill: 'competent', acumen: 0.58, dividendPayout: 20, monthsInDistress: 0,
    brandAwareness: 5, assetHoldings: {}, assetCostBasis: {},
    observedPlayerShare: {}, realisedGains: 0,
  };

  const numAI = 8 + Math.floor(rand() * 4);
  const ai: Company[] = [];
  for (let i = 0; i < numAI; i++) {
    const strategy = (['aggressive', 'balanced', 'conservative'] as const)[Math.floor(rand() * 3)];
    const skillRoll = rand();
    const skill: AISkill = skillRoll < 0.28 ? 'novice' : skillRoll < 0.68 ? 'competent' : skillRoll < 0.90 ? 'shrewd' : 'ruthless';
    const acumen = SKILL_ACUMEN[skill];
    const cash = (12_000_000 + rand() * 120_000_000) * (0.6 + acumen * 0.9);
    const shares = 500_000 + Math.floor(rand() * 4_500_000);
    const price = 5 + rand() * 100;
    ai.push({
      id: generateId(),
      name: COMPANY_NAMES[i % COMPANY_NAMES.length] + (i >= COMPANY_NAMES.length ? ` ${Math.floor(i / COMPANY_NAMES.length) + 1}` : ''),
      isPlayer: false, cash, revenue: 1_000_000 + rand() * 50_000_000,
      profit: -500_000 + rand() * 15_000_000, expenses: 500_000 + rand() * 20_000_000,
      totalAssets: 30_000_000 + rand() * 500_000_000, debt: rand() * 100_000_000,
      interestRate: 4 + rand() * 5, sharePrice: price, sharesOutstanding: shares,
      marketCap: price * shares, brandValue: 20 + rand() * 60,
      color: COMPANY_COLORS[i % COMPANY_COLORS.length],
      aiStrategy: strategy, buildings: [], bondRating: (['AAA', 'AA', 'A', 'BBB', 'BB', 'B'] as const)[Math.floor(rand() * 6)],
      skill, acumen, dividendPayout: 10 + rand() * 35, monthsInDistress: 0,
      brandAwareness: 15 + rand() * 40, assetHoldings: {}, assetCostBasis: {},
      observedPlayerShare: {}, realisedGains: 0,
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
): Product[] {
  const { type } = building;

  if (isHospitality(type)) {
    // Kitchens buy bulk ingredients, never finished retail goods.
    const allowed = new Set(VENUE_INGREDIENTS[type] ?? []);
    return products.filter(p => allowed.has(p.name));
  }

  if (type === 'farm') return products.filter(p => p.kind === 'farm');

  if (type === 'mine') {
    // A mine can only extract the deposit under it.
    if (building.resourceType) {
      const match = products.filter(p => p.name.toLowerCase() === building.resourceType!.toLowerCase());
      if (match.length > 0) return match;
    }
    return products.filter(p => p.kind === 'raw');
  }

  if (type === 'factory') return products.filter(p => p.kind === 'semi' || p.kind === 'consumer');

  if (type === 'retail_store') {
    const consumer = products.filter(p => p.kind === 'consumer');
    // Specialty stores stock only their own category.
    if (building.specialisation) return consumer.filter(p => p.category === building.specialisation);
    return consumer;
  }

  if (type === 'warehouse') return products.filter(p => p.kind !== 'digital');
  if (type === 'seaport') return products.filter(p => p.kind === 'semi' || p.kind === 'raw' || p.kind === 'consumer');

  // HQ, R&D, apartments and offices don't trade goods at all.
  return [];
}

/** Builds a fresh menu board for a hospitality venue. */
function buildMenu(type: BuildingType): MenuItem[] {
  const template = MENU_TEMPLATES[type];
  if (!template) return [];
  return template.map(item => ({ ...item, id: generateId() }));
}

// ============= BUILDING CREATION =============
function createBuilding(
  type: BuildingType, companyId: string, city: City, products: Product[],
  x?: number, y?: number, cities?: City[],
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

  const eligible = eligibleProductsFor({ type, specialisation }, products);
  const firstProduct = eligible[Math.floor(Math.random() * Math.max(1, eligible.length))];
  // Retailers open with a couple of lines from their own category.
  const initialLines = type === 'retail_store'
    ? eligible.slice(0, 3).map(p => p.id)
    : firstProduct ? [firstProduct.id] : [];

  return {
    id: generateId(), type, name: cfg.name, companyId, cityId: city.id,
    x: offsetX, y: offsetY, width: cfg.w, height: cfg.h,
    level: 1, maxLevel: 9, operatingCost: cfg.cost * 0.02,
    revenue: 0, profit: 0, cogs: 0,
    employees: cfg.employees, trainingLevel: 1 + Math.floor(Math.random() * 3),
    trainingBudget: 0.35,
    capacity: cfg.capacity, utilization: 30 + Math.random() * 50,
    customerTraffic: type === 'retail_store' ? 40 + Math.random() * 60 : 0,
    landValue: cfg.cost * city.landCostMultiplier * 0.1,
    constructionCost: cfg.cost * city.landCostMultiplier,
    condition: 80 + Math.random() * 20, isOperating: true,
    productId: initialLines[0] ?? firstProduct?.id ?? null,
    products: initialLines,
    inventory: {},
    inventoryCapacity: Math.max(100, cfg.capacity * (type === 'warehouse' ? 3 : 1)),
    pricingMultiplier: 1,
    lastUnitsSold: 0, lastUnitsProduced: 0,
    supply: 0, demand: 0,
    resourceType: null, resourceRemaining: type === 'mine' ? 1400 : 0,
    resourceMax: type === 'mine' ? 1400 : 0,
    occupancy: type === 'apartment' || type === 'commercial' ? 65 : 0,
    rentMultiplier: 1, rentPerUnit: 0,
    employeeSatisfaction: 55 + Math.random() * 20,
    monthsUnprofitable: 0,
    adBudget: 0, cachedAsk: 0, offersMade: 0, negotiationBlockedUntil: 0,
    highwayAccess: cities ? highwayProximity(cities, offsetX, offsetY) : 0,
    parkingScore: Math.max(0.1, Math.min(1, Math.hypot(offsetX - city.x, offsetY - city.y) / 12)),
    specialisation,
    productSlots: type === 'retail_store' ? 4 : 1,
    menu: buildMenu(type),
    supplierLinks: [],
    freightCost: 0,
    inputCost: 0,
    internalSale: false,
    portKind: null,
    chainBonus: 1,
  };
}

function generateInitialBuildings(cities: City[], companies: Company[], products: Product[]): Building[] {
  const buildings: Building[] = [];
  const aiTypes: BuildingType[] = ['retail_store', 'factory', 'apartment', 'commercial', 'farm', 'warehouse'];

  for (const company of companies) {
    if (company.isPlayer) continue;
    const numBuildings = 4 + Math.floor(Math.random() * 6);
    for (let i = 0; i < numBuildings; i++) {
      const city = cities[Math.floor(Math.random() * cities.length)];
      const type = aiTypes[Math.floor(Math.random() * aiTypes.length)];
      const building = createBuilding(type, company.id, city, products, undefined, undefined, cities);
      buildings.push(building);
      company.buildings.push(building.id);
    }
  }

  // Extra apartments/commercial per city
  for (const city of cities) {
    const aiCompanies = companies.filter(c => !c.isPlayer);
    const popFactor = city.population / 1_000_000;
    const numExtra = Math.floor(4 + popFactor * 3);
    const venueTypes: BuildingType[] = [];
    const venueCount = Math.floor(3 + popFactor * 2);
    for (let v = 0; v < venueCount; v++) {
      const roll = Math.random();
      venueTypes.push(roll < 0.34 ? 'fast_food' : roll < 0.62 ? 'cafe' : roll < 0.85 ? 'restaurant' : 'bar');
    }
    for (let i = 0; i < numExtra + venueTypes.length; i++) {
      const owner = aiCompanies[Math.floor(Math.random() * aiCompanies.length)];
      const type: BuildingType = i < numExtra ? (i % 3 === 0 ? 'commercial' : 'apartment') : venueTypes[i - numExtra];
      const angle = Math.random() * Math.PI * 2;
      const radius = 4 + Math.random() * 8;
      const bx = Math.round(city.x + Math.cos(angle) * radius);
      const by = Math.round(city.y + Math.sin(angle) * radius);
      const [sx, sy] = snapOffRoad(cities, city, bx, by);
      const building = createBuilding(type, owner.id, city, products, sx, sy);
      buildings.push(building);
      owner.buildings.push(building.id);
    }
  }

  // ── Seaports: the import lifeline that lets a new firm skip whole chains ──
  const portCities = cities.slice(0, Math.max(2, Math.floor(cities.length / 2.5)));
  for (const [i, city] of portCities.entries()) {
    const portKind: 'industrial' | 'commercial' = i % 2 === 0 ? 'industrial' : 'commercial';
    const stock = products
      .filter(p => portKind === 'industrial'
        ? (p.kind === 'semi' || p.kind === 'raw')
        : p.kind === 'consumer')
      .filter((_p, idx) => (idx + i) % 2 === 0)
      .slice(0, 10);
    const port = createBuilding('seaport', 'system', city, products,
      Math.round(city.x + 8), Math.round(city.y + 6));
    port.name = `${city.name} ${portKind === 'industrial' ? 'Industrial' : 'Commercial'} Port`;
    port.portKind = portKind;
    port.products = stock.map(p => p.id);
    port.productId = stock[0]?.id ?? null;
    port.inventory = Object.fromEntries(stock.map(p => [p.id, 1000]));
    port.inventoryCapacity = 20000;
    port.constructionCost = 0;
    port.landValue = 0;
    port.trainingLevel = 5;
    buildings.push(port);
  }

  return buildings;
}

// ============= TRADED ASSETS =============
function generateTradedAssets(): TradedAsset[] {
  const seeds: Array<Omit<TradedAsset, 'id' | 'history' | 'playerHolding' | 'playerCostBasis'>> = [
    { symbol: 'CL', name: 'Crude Oil', assetClass: 'commodity', price: 78, anchor: 72, volatility: 0.38, unit: 'barrel' },
    { symbol: 'NG', name: 'Natural Gas', assetClass: 'commodity', price: 2.6, anchor: 3.1, volatility: 0.55, unit: 'MMBtu' },
    { symbol: 'ZW', name: 'Wheat', assetClass: 'commodity', price: 5.9, anchor: 6.2, volatility: 0.24, unit: 'bushel' },
    { symbol: 'HG', name: 'Copper', assetClass: 'commodity', price: 4.15, anchor: 3.9, volatility: 0.26, unit: 'lb' },
    { symbol: 'LI', name: 'Lithium', assetClass: 'commodity', price: 13800, anchor: 15000, volatility: 0.62, unit: 'tonne' },
    { symbol: 'XAU', name: 'Gold', assetClass: 'metal', price: 2340, anchor: 2050, volatility: 0.15, unit: 'oz' },
    { symbol: 'XAG', name: 'Silver', assetClass: 'metal', price: 27.4, anchor: 25, volatility: 0.29, unit: 'oz' },
    { symbol: 'XPT', name: 'Platinum', assetClass: 'metal', price: 965, anchor: 950, volatility: 0.22, unit: 'oz' },
    { symbol: 'BTC', name: 'Bitcoin', assetClass: 'crypto', price: 64000, anchor: 45000, volatility: 0.85, unit: 'BTC' },
    { symbol: 'ETH', name: 'Ethereum', assetClass: 'crypto', price: 3200, anchor: 2400, volatility: 0.95, unit: 'ETH' },
    { symbol: 'SPY', name: 'Market ETF', assetClass: 'etf', price: 520, anchor: 480, volatility: 0.16, unit: 'share' },
    { symbol: 'GLDX', name: 'Gold Miners ETF', assetClass: 'etf', price: 34, anchor: 32, volatility: 0.31, unit: 'share' },
  ];
  return seeds.map(seed => ({
    ...seed,
    id: generateId(),
    history: Array.from({ length: 60 }, (_, i) => seed.price * (0.9 + Math.sin(i / 8) * 0.08 + Math.random() * 0.05)),
    playerHolding: 0,
    playerCostBasis: 0,
  }));
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
export function createNewGame(seed: number = 1337, playerName: string = 'Your Corporation'): GameState {
  const rand = mulberry32(seed);
  const size = 150;
  const products = generateProducts(rand);
  const cities = generateCities(rand, size);
  const companies = generateCompanies(rand, playerName);
  const buildings = generateInitialBuildings(cities, companies, products);
  const playerCompany = companies[0];

  return {
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
    },
    notifications: [{ id: generateId(), message: 'Welcome! Your business empire awaits. Start by placing buildings on the map.', type: 'info', tick: 0 }],
    selectedBuilding: null, selectedCity: null,
    camera: { x: cities[0]?.x ?? 75, y: cities[0]?.y ?? 75, zoom: 1.2 },
    mapSize: size, seed, overlay: 'none', paused: false, freight: [],
    incomingOffers: [], lastOffer: null, loans: [],
    replayHistory: [],
  };
}

// ============= HELPERS =============
function addNotification(state: GameState, n: Notification) {
  state.notifications.unshift(n);
  if (state.notifications.length > 50) state.notifications.pop();
}

function addNewsTicker(state: GameState, text: string, type: NewsTickerItem['type'] = 'info') {
  state.stockMarket.ticker.unshift({ id: generateId(), text, type, tick: state.tick });
  if (state.stockMarket.ticker.length > 30) state.stockMarket.ticker.pop();
}

// ============= ECONOMY =============
function simulateEconomy(state: GameState): void {
  const eco = state.economy;
  eco.cycleMonth += 1 / (24 * 30);

  if (eco.cycleMonth > 36 + Math.random() * 48) {
    eco.cycleMonth = 0;
    const cycles: EconomyCycle[] = ['boom', 'growth', 'recession', 'recovery'];
    const idx = cycles.indexOf(eco.cycle);
    eco.cycle = cycles[(idx + 1) % 4];
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
  eco.inflation += (phillips - eco.inflation) * 0.04;
  eco.inflation = Math.max(-3, Math.min(22, eco.inflation));

  const taylorTarget = Math.max(0.25, 2 + eco.inflation + 0.5 * (eco.inflation - 2) + 0.25 * (eco.gdpGrowth - 2.5));
  const urgency = eco.inflation > 8 ? 0.45 : eco.inflation > 5 ? 0.30 : 0.15;
  eco.interestRate += (taylorTarget - eco.interestRate) * urgency;
  eco.interestRate = Math.max(-0.5, Math.min(22, eco.interestRate));

  eco.unemployment = Math.max(2, Math.min(20, eco.unemployment + (eco.cycle === 'recession' ? 0.003 : eco.cycle === 'boom' ? -0.004 : -0.001)));
  eco.purchasingPowerIndex *= 1 - (eco.inflation / 100) / (24 * 365);
  eco.cpi *= 1 + (eco.inflation / 100) / (24 * 365);

  // Money supply / QE-QT
  const qeSignal = eco.interestRate < 1.5 ? 0.08 : eco.interestRate < 3 ? 0.02
    : eco.interestRate > 6 ? -0.06 : -0.01;
  eco.moneySupply = Math.max(40, Math.min(250, eco.moneySupply + qeSignal));
}

// ============= FUEL MARKET =============
function updateFuelMarket(state: GameState) {
  const eco = state.economy;
  const longRun = 3.4 * (1 + eco.inflation / 100);
  eco.dieselPrice += (longRun - eco.dieselPrice) * 0.06 + (Math.random() - 0.5) * 0.18;

  if (eco.fuelShockMonths > 0) {
    eco.fuelShockMonths -= 1;
    if (eco.fuelShockMonths === 0) {
      addNewsTicker(state, 'Energy markets normalise as supply disruption eases', 'info');
    }
  } else if (Math.random() < 0.012) {
    const events = [
      'Middle East tension disrupts crude shipping lanes',
      'Refinery outages tighten distillate supply',
      'Export embargo announced on key producing nation',
      'Hurricane shuts Gulf Coast refining capacity',
    ];
    eco.fuelShockMonths = 4 + Math.floor(Math.random() * 4);
    eco.dieselPrice *= 1.35 + Math.random() * 0.2;
    addNewsTicker(state, `${events[Math.floor(Math.random() * events.length)]} — diesel spikes to $${eco.dieselPrice.toFixed(2)}/gal`, 'breaking');
    addNotification(state, {
      id: generateId(),
      message: `Fuel crisis: diesel at $${eco.dieselPrice.toFixed(2)}/gal. Freight costs will rise.`,
      type: 'warning', tick: state.tick,
    });
  }
  eco.dieselPrice = Math.max(1.4, Math.min(7.5, eco.dieselPrice));
}

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

/**
 * Overall product rating on the Capitalism model: a weighted blend of price
 * competitiveness, quality and brand. The weights differ per product, so
 * cosmetics live or die on brand while frozen goods compete on price.
 */
export function productRating(product: Product, priceMultiplier: number): number {
  const priceScore = Math.max(0, 100 - Math.max(0, priceMultiplier - 0.6) * 90);
  return (
    priceScore * product.priceWeight +
    product.perceivedQuality * product.qualityWeight +
    product.brand * product.brandWeight
  ) / 100;
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

  for (const building of state.buildings) {
    if (!building.isOperating) continue;
    const city = index.citiesById.get(building.cityId);
    if (!city) continue;
    const product = building.productId ? index.productsById.get(building.productId) : null;

    const shiftFactor = isDaytime ? 0.34 : 0.12;
    const wageCost = building.employees * city.wageRate * shiftFactor;
    const maintenance = building.constructionCost * 0.0000045;
    const trainingCost = wageCost * building.trainingBudget * 0.18;
    building.operatingCost = wageCost + maintenance + trainingCost;
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
      const productionUnits = building.capacity / 720 * efficiency * seasonal * inputReadiness * reserveFactor;
      building.lastUnitsProduced = productionUnits;

      if (building.type === 'factory' && product.inputs.length > 0) {
        for (const input of product.inputs) {
          building.inventory[input.productId] = Math.max(0, (building.inventory[input.productId] || 0) - input.quantity * productionUnits);
        }
      }
      if (building.type === 'mine' && building.resourceRemaining > 0) {
        building.resourceRemaining = Math.max(0, building.resourceRemaining - productionUnits * 0.3);
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
      const marketAbsorb = building.internalSale
        ? 0
        : (product.marketDemand / 100) * (building.capacity / 12) * (0.7 + city.population / 8_000_000);
      const shipped = Math.min(onHand, groupDemand + Math.max(building.internalSale ? 0 : productionUnits * 0.6, marketAbsorb));
      building.inventory[product.id] = Math.max(0, Math.min(building.inventoryCapacity, onHand - shipped));

      const unitInputCost = product.inputs.reduce((sum, inp) => {
        const input = index.productsById.get(inp.productId);
        return sum + inp.quantity * (input?.productionCost || 0) * (state.economy.dieselPrice / 3.65);
      }, 0);
      const spotPrice = product.currentPrice * 0.72;
      building.revenue = shipped * spotPrice;
      building.cogs = shipped * unitInputCost;
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
      const service = 0.75 + (building.employeeSatisfaction / 100) * 0.25
        + (building.trainingLevel / 9) * 0.2;

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

      const perLineCapacity = (building.capacity / Math.max(1, stocked.length)) / 14;
      let totalRevenue = 0, totalCogs = 0, totalSold = 0, totalSupply = 0, totalDemand = 0;

      for (const line of stocked) {
        // Necessities hold up in a downturn; luxuries are income-elastic.
        const necessity = line.demandIndex / 100;
        const incomeElasticity = necessity > 0.7 ? 0.25 : necessity > 0.4 ? 0.9 : 1.6;
        const wageRatio = city.wageRate / 22;
        const incomeTerm = Math.pow(Math.max(0.4, wageRatio), incomeElasticity);
        const confidenceExp = necessity > 0.7 ? 0.35 : 1.2;
        const confidenceTerm = Math.pow(Math.max(0.05, confidence), confidenceExp);

        // Rating drives share: a 0..100 score blending price, quality, brand.
        const rating = productRating(line, building.pricingMultiplier);
        const ratingTerm = Math.max(0.05, Math.pow(rating / 45, 1.35));

        const demographics = demographicFit(city, line);
        const popMul = Math.min(4, city.population / 420_000);

        // How many rival outlets carry the same line here.
        const rivals = (index.buildingsByCity.get(city.id) ?? [])
          .filter(b => b.id !== building.id && b.products.includes(line.id)).length;
        const shareOfMarket = 1 / (1 + rivals * 0.55);

        const desired = perLineCapacity * trafficFactor * confidenceTerm * incomeTerm
          * ratingTerm * demographics * popMul * timeFactor * access
          * service * chainBonus * shareOfMarket;

        const available = building.inventory[line.id] || 0;
        const sold = Math.min(desired, available);
        const landed = building.supplierLinks.find(l => l.productId === line.id);
        const unitCost = landed
          ? landed.pricePerUnit + landed.freightPerUnit
          : line.productionCost * 1.35;

        if (sold > 0) {
          building.inventory[line.id] = Math.max(0, available - sold);
          totalRevenue += sold * line.currentPrice * building.pricingMultiplier;
          totalCogs += sold * unitCost;
          totalSold += sold;
        }
        totalSupply += available;
        totalDemand += desired * 14;
      }

      building.revenue = totalRevenue;
      building.cogs = totalCogs;
      building.lastUnitsSold = totalSold;
      building.customerTraffic = localTraffic;
      building.supply = totalSupply;
      building.demand = totalDemand;
      building.utilization = Math.min(100,
        (totalSold / Math.max(0.001, perLineCapacity * Math.max(1, stocked.length))) * 100);
      building.operatingCost += building.adBudget / 720;
    }

    // ── Hospitality: covers × menu mix, consuming bulk ingredients ──
    else if (isHospitality(building.type)) {
      const localTraffic = locationTraffic(city, building.x, building.y, index);
      const locationMul = 0.4 + (localTraffic / 100) * 0.9;
      const popMul = Math.min(3, city.population / 400_000);
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
      const service = 0.7 + (building.employeeSatisfaction / 100) * 0.35
        + (building.trainingLevel / 9) * 0.2;

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

      // ── Ingredient constraint: no stock, no service ──
      const ingredients = building.products
        .map(id => index.productsById.get(id))
        .filter((p): p is Product => Boolean(p));
      if (ingredients.length > 0) {
        const readiness = ingredients.filter(ing => (building.inventory[ing.id] || 0) > 0.5).length / ingredients.length;
        // A kitchen missing half its ingredients runs a reduced menu.
        covers *= 0.25 + readiness * 0.75;
        // Consume roughly 0.2 units of each ingredient per cover.
        for (const ing of ingredients) {
          const used = covers * 0.2 / ingredients.length;
          building.inventory[ing.id] = Math.max(0, (building.inventory[ing.id] || 0) - used);
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
      building.utilization = Math.min(100, covers / Math.max(0.001, seatCapacity) * 100);
      building.operatingCost += building.adBudget / 720;
    }

    // ── Seaport: always stocked, sells imports at a markup ──
    else if (building.type === 'seaport') {
      building.utilization = 55 + Math.sin(state.tick / 24) * 12;
      for (const pid of building.products) building.inventory[pid] = 1000;
      building.operatingCost = 0;
      building.revenue = 0;
      building.supply = 1000;
    }

    // Apartments — rent based on wage × 30% norm × occupancy
    else if (building.type === 'apartment') {
      const monthlyGrossIncome = city.wageRate * 173;
      const marketRent = monthlyGrossIncome * 0.30 * (0.5 + city.qualityOfLife / 200);
      building.rentPerUnit = marketRent * building.rentMultiplier;

      const demandIndex = -city.housingDemand;
      const targetOccupancy = Math.max(20, Math.min(100, 72 + demandIndex * 0.4 - (building.rentMultiplier - 1) * 30));
      building.occupancy += (targetOccupancy - building.occupancy) * 0.02;
      building.utilization = building.occupancy;
      building.revenue = building.rentPerUnit * building.capacity * (building.occupancy / 100) / 720;
      building.landValue *= 1 + (state.economy.inflation + state.economy.gdpGrowth) / 100 / (365 * 24);
    }

    // Commercial — cap rate driven
    else if (building.type === 'commercial') {
      const capRate = 0.04 + Math.min(0.04, city.wageRate / 45 * 0.04);
      const marketRent = (building.constructionCost + building.landValue) * capRate / 12 / Math.max(1, building.capacity);
      building.rentPerUnit = marketRent * building.rentMultiplier;

      const targetOccupancy = 45 + state.economy.businessConfidence * 0.5 - (building.rentMultiplier - 1) * 25;
      building.occupancy += (targetOccupancy - building.occupancy) * 0.02;
      building.utilization = building.occupancy;
      building.revenue = building.rentPerUnit * building.capacity * (building.occupancy / 100) / 720;
    }

    // Warehouse
    else if (building.type === 'warehouse') {
      const stored = Object.values(building.inventory).reduce((s, v) => s + v, 0);
      building.utilization = Math.min(100, stored / building.inventoryCapacity * 100);
      building.supply = stored;
      const cityDemand = city.population / 4_000_000;
      building.revenue = stored * 0.55 * (1 + building.trainingLevel * 0.03) + building.inventoryCapacity * 0.05 * cityDemand;
    }

    // HQ / R&D
    else if (building.type === 'hq') {
      building.utilization = 82;
      building.operatingCost *= 1.6;
    } else if (building.type === 'rd_center') {
      building.utilization = 92;
      building.operatingCost *= 1.4;
    }

    // Employee satisfaction ramp
    const overwork = Math.max(0, building.utilization - 88) / 100;
    const satTarget = Math.max(10, Math.min(100,
      50 + (building.trainingBudget - 0.5) * 60 + building.trainingLevel * 3.2 - overwork * 90 + (building.condition - 60) * 0.15));
    building.employeeSatisfaction += (satTarget - building.employeeSatisfaction) * 0.005;

    building.profit = building.revenue - building.cogs - building.operatingCost;
    building.condition = Math.max(20, building.condition - 0.0015);
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

    // Portfolio value
    let portfolioValue = 0;
    for (const [assetId, units] of Object.entries(company.assetHoldings)) {
      const asset = state.tradedAssets.find(a => a.id === assetId);
      if (asset && units > 0) portfolioValue += asset.price * units;
    }

    company.totalAssets = company.cash + bookValue + portfolioValue;
    company.marketCap = company.sharePrice * company.sharesOutstanding;

    if (company.isPlayer) {
      state.player.netWorth = state.player.cash + company.cash + bookValue + portfolioValue - company.debt;
    }
  }
}

// ============= CITIES =============
function simulateCities(state: GameState, index: StateIndex): void {
  if (state.hour !== 0) return; // once per day
  for (const city of state.cities) {
    const cityBuildings = index.buildingsByCity.get(city.id) ?? [];
    const jobs = cityBuildings.reduce((s, b) => s + b.employees, 0);
    const popFactor = city.population / 1_000_000;
    const housingCapacity = cityBuildings.filter(b => b.type === 'apartment').reduce((s, b) => s + b.capacity, 0);

    city.unemploymentRate = Math.max(1, Math.min(25,
      10 - (jobs / (popFactor * 1000)) * 2 + (Math.random() - 0.5) * 0.5));

    const housedPeople = housingCapacity * 2.6;
    city.housingDemand = Math.max(-100, Math.min(100, (housedPeople - city.population) / Math.max(1, city.population) * 100));

    const civicScore = cityBuildings.reduce((s, b) => s + (b.type === 'hq' ? 2 : 0), 0);
    city.qualityOfLife = Math.max(20, Math.min(100, 52 + civicScore - city.unemploymentRate * 1.4));
    city.trafficLevel = Math.max(12, Math.min(100, 24 + cityBuildings.length * 1.8 + city.population / 350000));

    // Demographics: births, deaths, migration
    const affluence = city.wageRate / 30;
    const educationDrag = city.educationIndex / 100;
    const youthBonus = Math.max(0, (38 - city.medianAge) / 38);
    const recessionDelay = state.economy.cycle === 'recession' ? 0.86 : 1;
    city.birthRate = Math.max(6, Math.min(28,
      (17 - affluence * 3.2 - educationDrag * 4.5 + youthBonus * 6 + city.familyShare * 5) * recessionDelay));
    city.deathRate = Math.max(4.5, Math.min(16, 4.5 + Math.max(0, city.medianAge - 28) * 0.28));
    city.naturalIncrease = city.birthRate - city.deathRate;

    const maxPop = Math.max(20_000, housedPeople * 1.12);
    const nationalWage = state.cities.reduce((s, c) => s + c.wageRate, 0) / Math.max(1, state.cities.length);
    const wagePull = (city.wageRate / Math.max(1, nationalWage) - 1) * 22;
    const jobPull = (6 - city.unemploymentRate) * 1.8;
    const amenityPull = (city.qualityOfLife - 55) * 0.14;
    const desiredMigration = wagePull + jobPull + amenityPull;
    const headroom = (maxPop - city.population) / Math.max(1, city.population) * 1000;
    city.netMigrationRate = desiredMigration > 0 ? Math.min(desiredMigration, Math.max(0, headroom)) : desiredMigration;

    const perDay = 1 / 365;
    const births = city.population * (city.birthRate / 1000) * perDay;
    const deaths = city.population * (city.deathRate / 1000) * perDay;
    const migrants = city.population * (city.netMigrationRate / 1000) * perDay;
    city.population = Math.max(500, Math.round(city.population + births - deaths + migrants));

    const ageingPressure = (city.deathRate - city.birthRate) * 0.0000009 * 24;
    const migrantYouth = migrants > 0 ? -Math.abs(migrants) / Math.max(1, city.population) * 4 : 0;
    city.medianAge = Math.max(22, Math.min(52, city.medianAge + ageingPressure + migrantYouth + perDay * 8));

    city.growthRate = (city.naturalIncrease + city.netMigrationRate) / 10;
    city.wageRate *= (1 + (state.economy.inflation / 100) / 365);
    city.gdpPerCapita *= 1 + (state.economy.gdpGrowth + state.economy.inflation) / 100 / 365;

    if (state.day === 1) {
      city.populationHistory.push(city.population);
      if (city.populationHistory.length > 120) city.populationHistory.shift();
    }
  }
  state.economy.unemployment = state.cities.reduce((s, c) => s + c.unemploymentRate, 0) / Math.max(1, state.cities.length);
}

// ============= FREIGHT =============
function simulateFreightRoutes(state: GameState): void {
  const completed: string[] = [];
  for (const route of state.freight) {
    route.progress = Math.min(100, route.progress + Math.max(1.2, 100 / Math.max(5, route.distance * 1.4)));
    if (route.progress >= 100) {
      route.status = 'delivered';
      completed.push(route.id);
      const buyer = state.buildings.find(b => b.id === route.toBuildingId);
      if (buyer) buyer.inventory[route.good] = (buyer.inventory[route.good] || 0) + route.amount;
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
    const profitMargin = company.revenue > 0 ? company.profit / company.revenue : -0.1;
    const growth = profitMargin * 0.002 + (Math.random() - 0.5) * 0.005;
    company.sharePrice = Math.max(0.01, company.sharePrice * (1 + growth));
    company.marketCap = company.sharePrice * company.sharesOutstanding;
  }
}

// ============= TRADED ASSETS =============
function simulateAssetPrices(state: GameState) {
  const eco = state.economy;
  const realRate = eco.interestRate - eco.inflation;

  for (const asset of state.tradedAssets) {
    const pull = (asset.anchor - asset.price) / asset.price * 0.015 * (1 - asset.volatility * 0.7);
    const dailyVol = asset.volatility / Math.sqrt(252);
    const shock = (Math.random() + Math.random() + Math.random() - 1.5) * dailyVol * 1.4;

    let macro = 0;
    switch (asset.symbol) {
      case 'XAU': case 'XAG': case 'XPT':
        macro = -realRate * 0.0018 + (eco.cycle === 'recession' ? 0.0012 : 0); break;
      case 'CL': case 'NG':
        macro = eco.gdpGrowth * 0.0004 + (eco.fuelShockMonths > 0 ? 0.012 : 0); break;
      case 'BTC': case 'ETH':
        macro = (eco.moneySupply - 100) * 0.00018 - realRate * 0.0012
          + (state.stockMarket.sentiment === 'bullish' ? 0.002 : state.stockMarket.sentiment === 'bearish' ? -0.003 : 0);
        break;
      case 'SPY':
        macro = (state.stockMarket.index / 10000 - 1) * 0.004; break;
      case 'GLDX':
        macro = -realRate * 0.0022; break;
      case 'ZW':
        macro = (state.season === 'summer' ? -0.0015 : state.season === 'winter' ? 0.0012 : 0) + eco.inflation * 0.0002; break;
      case 'HG': case 'LI':
        macro = eco.gdpGrowth * 0.0006 + (state.year > 2010 && asset.symbol === 'LI' ? 0.0008 : 0); break;
    }

    asset.price = Math.max(asset.anchor * 0.15, asset.price * (1 + pull + shock + macro));
    asset.anchor *= 1 + (eco.inflation / 100) / 365;

    if (state.hour === 0) {
      asset.history.push(asset.price);
      if (asset.history.length > 180) asset.history.shift();
    }
  }

  if (Math.random() < 0.004) {
    const asset = state.tradedAssets[Math.floor(Math.random() * state.tradedAssets.length)];
    const move = (Math.random() - 0.4) * asset.volatility * 0.4;
    asset.price = Math.max(asset.anchor * 0.2, asset.price * (1 + move));
    const dir = move > 0 ? 'surges' : 'slides';
    addNewsTicker(state, `${asset.name} ${dir} ${Math.abs(move * 100).toFixed(1)}% on heavy volume`, move > 0 ? 'info' : 'warning');
  }
}

// ============= AI COMPANIES =============
function simulateAICompanies(state: GameState): void {
  for (const company of state.companies) {
    if (company.isPlayer) continue;

    // Expansion
    const appetite = company.aiStrategy === 'aggressive' ? 0.7 : company.aiStrategy === 'conservative' ? 0.95 : 0.85;
    const gate = Math.max(0.18, Math.min(0.92, (appetite - 0.25) / Math.max(0.4, 0.85 * (0.7 + company.acumen * 0.6))));
    if (company.cash > 3_000_000 && Math.random() > gate) {
      const preferred: BuildingType[] = company.aiStrategy === 'aggressive'
        ? ['retail_store', 'fast_food', 'cafe', 'restaurant', 'factory']
        : company.aiStrategy === 'conservative'
          ? ['apartment', 'commercial', 'warehouse']
          : ['retail_store', 'apartment', 'factory', 'warehouse', 'cafe'];

      let best: { city: City; type: BuildingType; score: number } | null = null;
      for (const city of state.cities) {
        const cbldgs = state.buildings.filter(b => b.cityId === city.id);
        const popM = city.population / 1_000_000;
        for (const type of preferred) {
          const existing = cbldgs.filter(b => b.type === type).length;
          const carrying = type === 'apartment' ? 6 + popM * 3
            : type === 'commercial' ? 4 + popM * 1.5
            : type === 'warehouse' ? 2 + popM
            : 3 + popM * 2;
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
      if (best && best.score > 0.25 && best.type !== 'mine') {
        const cfg = BUILDING_CONFIGS[best.type];
        const cost = cfg.cost * best.city.landCostMultiplier;
        if (company.cash >= cost) {
          const building = createBuilding(best.type, company.id, best.city, state.products, undefined, undefined, state.cities);
          building.constructionCost = cost;
          company.cash -= cost;
          state.buildings.push(building);
          company.buildings.push(building.id);
        }
      }
    }

    // Pricing response
    for (const b of state.buildings.filter(b => b.companyId === company.id)) {
      if (b.type !== 'retail_store' && !['restaurant', 'fast_food', 'cafe', 'bar'].includes(b.type)) continue;
      if (b.utilization < 40 && b.pricingMultiplier > 0.68) b.pricingMultiplier -= 0.005;
      if (b.utilization > 88 && b.pricingMultiplier < 1.5) b.pricingMultiplier += 0.005;
    }

    // Close chronically unprofitable
    for (const b of [...state.buildings.filter(b => b.companyId === company.id)]) {
      if (b.type === 'hq') continue;
      const monthly = b.profit * 24 * 30;
      if (monthly < 0) b.monthsUnprofitable++;
      else b.monthsUnprofitable = Math.max(0, b.monthsUnprofitable - 1);
      const patience = Math.round(24 - company.acumen * 13);
      if (b.monthsUnprofitable >= patience) {
        const salvage = b.constructionCost * 0.4 + b.landValue * 0.9;
        company.cash += salvage;
        company.buildings = company.buildings.filter(id => id !== b.id);
        state.buildings = state.buildings.filter(x => x.id !== b.id);
        addNewsTicker(state, `${company.name} shutters loss-making ${b.name.toLowerCase()} after a year of red ink`, 'info');
      }
    }

    // Distress/bankruptcy tracking
    if (company.cash < 0) {
      company.monthsInDistress++;
      if (company.monthsInDistress === 1) addNewsTicker(state, `${company.name} warns of liquidity strain`, 'warning');
      if (company.monthsInDistress >= 4) {
        // Liquidation
        const recovered = state.buildings.filter(b => b.companyId === company.id)
          .reduce((s, b) => s + b.constructionCost * 0.35 + b.landValue * 0.8, 0);
        company.cash += recovered;
        addNewsTicker(state, `${company.name} enters liquidation — assets sold for $${(recovered / 1_000_000).toFixed(1)}M`, 'breaking');
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

// ============= AI CAPITAL ALLOCATION =============
function simulateAiCapitalAllocation(state: GameState) {
  for (const company of state.companies) {
    if (company.isPlayer) continue;
    const buffer = Math.max(4_000_000, company.expenses * TICKS_PER_MONTH * 3);
    const surplus = company.cash - buffer;
    if (surplus < 5_000_000) continue;

    // Hedging into hard assets
    if (Math.random() < 0.12 && company.acumen > 0.45) {
      const realRate = state.economy.interestRate - state.economy.inflation;
      let preferred: string;
      if (realRate < 0 || state.economy.inflation > 5) preferred = 'XAU';
      else if (state.economy.cycle === 'boom' && company.aiStrategy === 'aggressive') preferred = 'BTC';
      else if (state.economy.cycle === 'recession') preferred = 'XAU';
      else preferred = 'SPY';
      const asset = state.tradedAssets.find(a => a.symbol === preferred);
      if (asset) {
        const budget = surplus * (0.10 + company.acumen * 0.12);
        const units = budget / asset.price;
        if (units > 0) {
          company.cash -= budget;
          company.assetHoldings[asset.id] = (company.assetHoldings[asset.id] || 0) + units;
        }
      }
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
  const fairValue = valueAsset(state, target, buyer);
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
  const needed: string[] = [];

  if (building.type === 'factory') {
    const product = building.productId ? index.productsById.get(building.productId) : null;
    if (product) needed.push(...product.inputs.map(i => i.productId));
  } else if (building.type === 'retail_store' || building.type === 'warehouse') {
    needed.push(...building.products.slice(0, building.productSlots));
  } else if (isHospitality(building.type)) {
    // A kitchen's shopping list is its bulk ingredients — nothing else.
    const allowed = VENUE_INGREDIENTS[building.type] ?? [];
    const ids = state.products.filter(p => allowed.includes(p.name)).map(p => p.id);
    building.products = ids;
    needed.push(...ids);
  }
  if (needed.length === 0) return;

  // Economies of scale: chain leverage plus order-size tiers.
  const sameFormat = (index.buildingsByCompany.get(building.companyId) ?? [])
    .filter(b => b.type === building.type).length;
  const chainLeverage = sameFormat >= 10 ? 0.92 : sameFormat >= 5 ? 0.97 : 1;
  const orderSize = Math.max(20, building.capacity * 0.18 * sameFormat);
  const orderTier = orderSize > 5000 ? 0.88 : orderSize > 1000 ? 0.95 : 1;
  const volumeDiscount = chainLeverage * orderTier;

  const links: SupplierLink[] = [];

  for (const productId of needed) {
    const inputProduct = index.productsById.get(productId);
    if (!inputProduct) continue;

    const offers = state.buildings
      .filter(sup => sup.id !== building.id && sup.isOperating && sup.products.includes(productId))
      .filter(sup => ['seaport', 'farm', 'mine', 'factory', 'warehouse'].includes(sup.type))
      // Internal-sale suppliers withhold from outsiders.
      .filter(sup => !sup.internalSale || sup.companyId === building.companyId)
      .map(sup => {
        const distance = Math.max(1, Math.hypot(sup.x - building.x, sup.y - building.y));
        // Freight = distance × fuel burn × diesel + driver hours × wage.
        const fuel = distance * 0.06 * state.economy.dieselPrice;
        const driverWage = index.citiesById.get(sup.cityId)?.wageRate ?? 15;
        const timeCost = (distance / 60) * driverWage;
        const crossCity = sup.cityId === building.cityId ? 1 : 1.35;
        const freightPerUnit = (fuel + timeCost) * crossCity
          * Math.max(0.02, inputProduct.productionCost * 0.006);
        // Seaports charge an import premium; trained plants charge for quality.
        const pricePerUnit = inputProduct.productionCost
          * (sup.companyId === 'system' ? 1.28 : 0.92 + sup.trainingLevel * 0.025);
        // Farms and factories improve quality with training; mines cannot.
        const quality = sup.type === 'mine'
          ? inputProduct.quality
          : Math.min(100, inputProduct.quality + sup.trainingLevel * 2.2);
        return { sup, pricePerUnit, freightPerUnit, quality,
                 score: pricePerUnit + freightPerUnit - quality * 0.12 };
      })
      .sort((a, b) => a.score - b.score);

    const best = offers[0];
    if (!best) continue;

    links.push({
      productId,
      supplierBuildingId: best.sup.id,
      pricePerUnit: best.pricePerUnit * volumeDiscount,
      freightPerUnit: best.freightPerUnit,
      quality: best.quality,
    });

    // Reorder when stock runs below the safety threshold.
    const onHand = building.inventory[productId] || 0;
    const reorderPoint = building.inventoryCapacity * 0.35;
    if (onHand >= reorderPoint) continue;

    const wanted = building.inventoryCapacity * 0.45 - onHand;
    const availableAtSupplier = best.sup.companyId === 'system'
      ? wanted
      : Math.min(wanted, best.sup.inventory[productId] || 0);
    if (availableAtSupplier < 1) continue;

    const buyer = index.companiesById.get(building.companyId);
    const totalFreight = best.freightPerUnit * availableAtSupplier;
    const totalGoods = best.pricePerUnit * volumeDiscount * availableAtSupplier;
    if (!buyer || buyer.cash < totalFreight + totalGoods) continue;

    // Pay on dispatch; goods arrive when the truck does.
    buyer.cash -= totalFreight + totalGoods;
    if (best.sup.companyId !== 'system') {
      best.sup.inventory[productId] = Math.max(0, (best.sup.inventory[productId] || 0) - availableAtSupplier);
      const seller = index.companiesById.get(best.sup.companyId);
      if (seller) seller.cash += totalGoods;
    }

    const distance = Math.max(1, Math.hypot(best.sup.x - building.x, best.sup.y - building.y));
    state.freight.push({
      id: generateId(), fromBuildingId: best.sup.id, toBuildingId: building.id,
      good: productId, amount: availableAtSupplier, progress: 0, distance,
      freightCost: totalFreight, status: 'loading',
    });
  }

  building.supplierLinks = links;
  building.freightCost = links.reduce((sum, l) => sum + l.freightPerUnit, 0);
  building.inputCost = links.reduce((sum, l) => sum + l.pricePerUnit, 0);
  if (state.freight.length > 120) state.freight.splice(0, state.freight.length - 120);
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

  simulateAICompanies(state);
  simulateProductLifecycle(state);
  updateFuelMarket(state);
  simulateCentralBank(state);
  simulateAiCapitalAllocation(state);
  simulateIncomingOffers(state);

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

  // Dividends (quarterly)
  if (state.month % 3 === 0) {
    for (const company of state.companies) {
      const annual = company.profit * 24 * 365;
      if (annual <= 0 || company.dividendPayout <= 0) continue;
      const div = (annual * company.dividendPayout / 100) / 4;
      if (company.cash >= div) company.cash -= div;
    }
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

function simulateYearly(state: GameState): void {
  addNewsTicker(state, `Year ${state.year} begins. New opportunities emerge.`);
  addNotification(state, { id: generateId(), message: `Year ${state.year} — Annual review`, type: 'info', tick: state.tick });
  // Reset carry-forward losses
  for (const company of state.companies) company.realisedGains = Math.min(0, company.realisedGains);
}

// ============= MAIN TICK =============
export function simulateTick(state: GameState): GameState {
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
  simulateFreightRoutes(s);
  simulateCompanies(s, index);
  simulateBuildings(s, index);
  simulateStockMarket(s);
  simulateAssetPrices(s);
  simulateCities(s, index);

  return s;
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
  const land = tile ? tile.landValue * cfg.w * cfg.h * 1400 : cfg.cost * 0.2;
  const cost = tiles ? materials + labour + land : cfg.cost * city.landCostMultiplier;
  if (player.cash < cost) {
    addNotification(state, { id: generateId(), message: `Not enough cash — need $${(cost / 1_000_000).toFixed(1)}M.`, type: 'danger', tick: state.tick });
    return { ...state };
  }
  const building = createBuilding(type, player.id, city, state.products, x, y);
  building.constructionCost = cost;
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
  state.buildings.push(building);
  player.buildings.push(building.id);
  invalidateRoadCache(building.cityId);
  addNotification(state, {
    id: generateId(),
    message: `Built ${cfg.name} in ${city.name} for $${formatMoney(cost)}`,
    type: 'success', tick: state.tick,
  });
  addNewsTicker(state, `${player.name} invests in a new ${cfg.name.toLowerCase()} in ${city.name}`);
  return { ...state };
}

export function setBuildingProduct(state: GameState, buildingId: string, productId: string): GameState {
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
  const building = state.buildings.find(b => b.id === buildingId);
  if (!building) return state;
  building.products = building.products.filter(id => id !== productId);
  if (building.productId === productId) building.productId = building.products[0] ?? null;
  building.supplierLinks = building.supplierLinks.filter(l => l.productId !== productId);
  return { ...state };
}

/** Re-specialise a store. Clears the shelf, since the range no longer fits. */
export function setRetailSpecialisation(state: GameState, buildingId: string, category: string | null): GameState {
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
  const item = state.buildings.find(b => b.id === buildingId)?.menu.find(m => m.id === itemId);
  if (item) item.price = Math.max(0.25, price);
  return { ...state };
}

/** Toggle a menu line on or off the board. */
export function toggleMenuItem(state: GameState, buildingId: string, itemId: string): GameState {
  const item = state.buildings.find(b => b.id === buildingId)?.menu.find(m => m.id === itemId);
  if (item) item.enabled = !item.enabled;
  return { ...state };
}

/** Withhold output from rivals. Denies them supply, costs you spot revenue. */
export function toggleInternalSale(state: GameState, buildingId: string): GameState {
  const building = state.buildings.find(b => b.id === buildingId);
  if (!building) return state;
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
  const building = state.buildings.find(b => b.id === buildingId);
  if (!building || building.level >= building.maxLevel) return state;
  const player = state.companies.find(c => c.isPlayer);
  if (!player || building.companyId !== player.id) return state;
  const cost = building.constructionCost * 0.3 * building.level;
  if (player.cash < cost) return state;
  player.cash -= cost;
  building.level += 1;
  building.capacity = Math.floor(building.capacity * 1.25);
  building.employees = Math.floor(building.employees * 1.15);
  building.trainingLevel = Math.min(9, building.trainingLevel + 1);
  building.condition = 100;
  addNotification(state, {
    id: generateId(),
    message: `Upgraded ${building.name} to level ${building.level}`,
    type: 'success', tick: state.tick,
  });
  return { ...state };
}

export function sellBuilding(state: GameState, buildingId: string): GameState {
  const building = state.buildings.find(b => b.id === buildingId);
  if (!building) return state;
  const player = state.companies.find(c => c.isPlayer);
  if (!player || building.companyId !== player.id) return state;
  const salePrice = building.constructionCost * 0.6 * (building.condition / 100);
  player.cash += salePrice;
  state.buildings = state.buildings.filter(b => b.id !== buildingId);
  player.buildings = player.buildings.filter(id => id !== buildingId);
  invalidateRoadCache(building.cityId);
  addNotification(state, {
    id: generateId(),
    message: `Sold ${building.name} for $${formatMoney(salePrice)}`,
    type: 'info', tick: state.tick,
  });
  return { ...state, selectedBuilding: null };
}

export function setBuildingPrice(state: GameState, buildingId: string, mul: number): GameState {
  const building = state.buildings.find(b => b.id === buildingId);
  if (building) building.pricingMultiplier = Math.max(0.55, Math.min(1.8, mul));
  return { ...state };
}

export function setAdBudget(state: GameState, buildingId: string, budget: number): GameState {
  const building = state.buildings.find(b => b.id === buildingId);
  if (building) building.adBudget = Math.max(0, Math.min(150_000, budget));
  return { ...state };
}

// ── Loans ──
export function takeLoan(state: GameState, amount: number, termMonths: number): GameState {
  const player = state.companies.find(c => c.isPlayer);
  if (!player || amount <= 0) return state;
  const maxLoan = Math.max(0, player.totalAssets * 0.7 - player.debt);
  const loanAmount = Math.min(amount, maxLoan);
  if (loanAmount < 100_000) {
    addNotification(state, { id: generateId(), message: 'Insufficient borrowing capacity.', type: 'warning', tick: state.tick });
    return state;
  }
  const rate = state.economy.interestRate + 2.5;
  const monthlyRate = rate / 100 / 12;
  const payment = loanAmount * monthlyRate / (1 - Math.pow(1 + monthlyRate, -termMonths));
  const loan: Loan = { id: generateId(), amount: loanAmount, interestRate: rate, monthsRemaining: termMonths, monthlyPayment: payment };
  state.loans.push(loan);
  player.cash += loanAmount;
  player.debt += loanAmount;
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

// ── Asset trading ──
export function buyAsset(state: GameState, assetId: string, units: number): GameState {
  const asset = state.tradedAssets.find(a => a.id === assetId);
  const player = state.companies.find(c => c.isPlayer);
  if (!asset || !player || units <= 0) return state;
  const cost = asset.price * units;
  if (player.cash < cost) {
    addNotification(state, {
      id: generateId(),
      message: `Insufficient cash: need $${formatMoney(cost)}.`,
      type: 'danger', tick: state.tick,
    });
    return state;
  }
  player.cash -= cost;
  const priorValue = asset.playerHolding * asset.playerCostBasis;
  asset.playerHolding += units;
  asset.playerCostBasis = (priorValue + cost) / asset.playerHolding;
  addNotification(state, {
    id: generateId(),
    message: `Bought ${units.toFixed(2)} ${asset.unit} of ${asset.name} @ $${asset.price.toFixed(2)}.`,
    type: 'success', tick: state.tick,
  });
  return { ...state };
}

export function sellAsset(state: GameState, assetId: string, units: number): GameState {
  const asset = state.tradedAssets.find(a => a.id === assetId);
  const player = state.companies.find(c => c.isPlayer);
  if (!asset || !player) return state;
  const sellUnits = Math.min(units, asset.playerHolding);
  if (sellUnits <= 0) return state;
  const proceeds = asset.price * sellUnits;
  const basis = asset.playerCostBasis * sellUnits;
  const gain = proceeds - basis;
  player.cash += proceeds;
  asset.playerHolding -= sellUnits;

  // Capital gains tax (assume 6 months held for player convenience)
  let tax = 0;
  if (gain > 0) {
    tax = gain * (state.economy.shortTermCapitalGainsRate / 100);
    player.cash -= tax;
  } else {
    player.realisedGains += gain;
  }
  addNotification(state, {
    id: generateId(),
    message: `Sold ${sellUnits.toFixed(2)} ${asset.unit} of ${asset.name} for $${formatMoney(proceeds)} — ${gain >= 0 ? 'gain' : 'loss'} $${formatMoney(Math.abs(gain))}${tax > 0 ? `, tax $${formatMoney(tax)}` : ''}.`,
    type: gain >= 0 ? 'success' : 'warning', tick: state.tick,
  });
  return { ...state };
}

// ── Building acquisitions ──
export function getAskingPrice(state: GameState, buildingId: string): number | null {
  const building = state.buildings.find(b => b.id === buildingId);
  if (!building) return null;
  const seller = state.companies.find(c => c.id === building.companyId);
  if (!seller || seller.isPlayer) return null;
  return valueAsset(state, building, seller);
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
  const askingPrice = valueAsset(state, building, seller);
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

export function clearLastOffer(state: GameState): GameState {
  state.lastOffer = null;
  return { ...state };
}


// ============= RE-EXPORTS =============
export { generateEntities, updateEntities } from './entities';
export {
  getRoadNetwork, tileIsRoad, isOnHighway, allHighwayTiles,
  highwayEdges, nearestIntersection, highwayTiles, invalidateRoadCache,
  CITY_ROAD_RADIUS,
} from './roads';
export { buildStateIndex, queryRadius } from './indexing';
