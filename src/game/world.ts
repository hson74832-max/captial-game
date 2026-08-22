import type {
  Building, BuildingType, City, Company, GameState, Product, Tile, ZoneType, Agent,
} from './types';
import {
  BUILDING_CONFIGS, CITY_NAMES, COMPANY_COLORS, COMPANY_NAMES, PERSONALITIES,
  PRODUCT_DEFS, RETAIL_CATEGORIES, SKILL_ACUMEN, VENUE_INGREDIENTS, buildMenu, isHospitality,
  ratingWeights, segmentFor, CITY_PAD_ELEVATION,
} from './constants';

let _id = 0;
export function uid(prefix = 'id'): string {
  _id += 1;
  return `${prefix}_${_id.toString(36)}`;
}

export function mulberry32(seed: number) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
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
const smooth = (t: number) => t * t * (3 - 2 * t);

function valueNoise(seed: number, x: number, y: number, scale: number) {
  const h = hash2d(seed);
  const x0 = Math.floor(x / scale), y0 = Math.floor(y / scale);
  const fx = smooth(x / scale - x0), fy = smooth(y / scale - y0);
  const a = h(x0, y0), b = h(x0 + 1, y0), c = h(x0, y0 + 1), d = h(x0 + 1, y0 + 1);
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

export function fbm(seed: number, x: number, y: number, oct = 4, base = 20, pers = 0.5) {
  let total = 0, amp = 1, freq = 1, max = 0;
  for (let i = 0; i < oct; i++) {
    total += valueNoise(seed + i * 101, x, y, base / freq) * amp;
    max += amp; amp *= pers; freq *= 2;
  }
  return total / max;
}

// ============================ PRODUCTS ============================
export function generateProducts(rand: () => number): Product[] {
  const list: Product[] = PRODUCT_DEFS.map(def => ({
    id: uid('p'),
    name: def.name, icon: def.icon, category: def.category, kind: def.kind,
    productionCost: def.cost || 0,
    basePrice: 0, currentPrice: 0, retailPrice: 0,
    quality: 42 + rand() * 26,
    demandIndex: def.demand,
    marketDemand: def.demand * (0.85 + rand() * 0.3),
    inputs: [],
    worldSupply: 1000, worldDemand: 1000,
    priceHistory: [],
    segment: segmentFor(def.name, def.category, def.cost || 0),
    perceivedQuality: 42 + rand() * 26,
    brand: def.kind === 'consumer' ? 12 + rand() * 48 : 4 + rand() * 10,
    ...ratingWeights(def.category, def.kind),
  }));
  const byName = new Map(list.map(p => [p.name, p]));
  // wire recipes
  PRODUCT_DEFS.forEach((def, i) => {
    list[i].inputs = (def.inputs || []).flatMap(([n, q]) => {
      const inp = byName.get(n);
      return inp ? [{ productId: inp.id, quantity: q }] : [];
    });
  });
  // resolve costs bottom-up (raw → semi → consumer)
  for (let pass = 0; pass < 4; pass++) {
    for (const p of list) {
      if (p.inputs.length === 0) continue;
      const inputCost = p.inputs.reduce((s, inp) => {
        const src = list.find(x => x.id === inp.productId)!;
        return s + src.productionCost * inp.quantity;
      }, 0);
      p.productionCost = inputCost * 1.22 + 3;
    }
  }
  for (const p of list) {
    const markup = p.kind === 'consumer' ? 1.45 : p.kind === 'semi' ? 1.35 : 1.28;
    p.currentPrice = p.productionCost * markup;
    p.basePrice = p.currentPrice;
    p.retailPrice = p.currentPrice * (p.kind === 'consumer' ? 1.55 : 1.15);
    // Brand strength moves perception away from the physical quality score.
    p.perceivedQuality = Math.max(5, Math.min(100, p.quality * 0.7 + p.brand * 0.35));
    p.priceHistory = Array.from({ length: 40 }, (_, i) => p.currentPrice * (0.96 + Math.sin(i / 6) * 0.03));
  }
  return list;
}

// ============================ CITIES ============================
export function generateCities(rand: () => number, size: number): City[] {
  const pts: Array<{ x: number; y: number }> = [];
  const target = 7;
  let guard = 0;
  while (pts.length < target && guard++ < 3000) {
    const x = 18 + rand() * (size - 36);
    const y = 18 + rand() * (size - 36);
    if (pts.some(p => Math.hypot(p.x - x, p.y - y) < 26)) continue;
    pts.push({ x, y });
  }
  return pts.map((pos, i) => {
    const pop = 24_000 + Math.floor(rand() * 90_000);
    const low = 0.30 + rand() * 0.18;
    const affluent = 0.10 + rand() * 0.15;
    const tier = pop > 90_000 ? 'metropolis' : pop > 65_000 ? 'large' : pop > 40_000 ? 'medium' : 'small';
    return {
      id: uid('c'),
      name: CITY_NAMES[i % CITY_NAMES.length],
      x: Math.round(pos.x), y: Math.round(pos.y),
      radius: 9 + Math.round(pop / 18_000),
      population: pop,
      color: `hsl(${(i * 53) % 360}, 62%, 58%)`,
      tier: tier as City['tier'],
      wageRate: 11 + Math.pow(rand(), 1.3) * 26,
      landCostMultiplier: 0.6 + rand() * 1.9,
      unemploymentRate: 3.5 + rand() * 5,
      gdpPerCapita: 24_000 + rand() * 52_000,
      medianAge: 29 + rand() * 13,
      educationIndex: 25 + rand() * 62,
      familyShare: 0.2 + rand() * 0.28,
      birthRate: 11 + rand() * 4,
      deathRate: 7 + rand() * 2,
      netMigrationRate: 0,
      qualityOfLife: 45 + rand() * 38,
      trafficLevel: 28 + rand() * 45,
      pollution: 5 + rand() * 9,
      housingDemand: -30 + rand() * 50,
      incomeMix: { low, middle: Math.max(0.2, 1 - low - affluent), affluent },
      discretionary: { low: 0, middle: 0, affluent: 0 },
      backgroundHousing: Math.floor(pop / 2.4 * 0.9),
      backgroundJobs: Math.floor(pop * 0.42),
      growthRate: 0.4 + rand() * 2.6,
      householdSavingsMonths: 1.2 + rand() * 2.4,
      householdDebtRatio: 0.18 + rand() * 0.22,
      populationHistory: Array.from({ length: 30 }, (_, m) => Math.floor(pop * (0.93 + m * 0.0025))),
    } as City;
  });
}

// ============================ ROADS ============================
export function isCityRoad(city: City, x: number, y: number): boolean {
  const dx = x - city.x, dy = y - city.y;
  if (Math.hypot(dx, dy) > city.radius) return false;
  return dx % 4 === 0 || dy % 4 === 0;
}

export function highwayTiles(cities: City[]): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i < cities.length; i++) {
    // connect to nearest 2 cities
    const others = cities
      .filter((_, j) => j !== i)
      .sort((a, b) => Math.hypot(a.x - cities[i].x, a.y - cities[i].y) - Math.hypot(b.x - cities[i].x, b.y - cities[i].y))
      .slice(0, 2);
    for (const o of others) {
      const a = cities[i];
      const midX = o.x;
      for (let x = Math.min(a.x, midX); x <= Math.max(a.x, midX); x++) set.add(`${x},${a.y}`);
      for (let y = Math.min(a.y, o.y); y <= Math.max(a.y, o.y); y++) set.add(`${midX},${y}`);
    }
  }
  return set;
}

// ============================ MAP ============================
export function generateMap(seed: number, size: number, cities: City[]): Tile[][] {
  const tiles: Tile[][] = [];
  const hw = highwayTiles(cities);
  for (let y = 0; y < size; y++) {
    tiles[y] = [];
    for (let x = 0; x < size; x++) {
      let elev = fbm(seed, x, y, 5, 26, 0.55);
      const moist = fbm(seed + 7777, x, y, 4, 20, 0.5);
      let type: Tile['type'] = 'grass';
      if (elev < 0.30) type = 'water';
      else if (elev < 0.345) type = 'beach';
      else if (elev > 0.71) type = 'mountain';
      else if (elev > 0.60) type = 'hills';
      else if (moist < 0.38 && elev > 0.46) type = 'desert';
      else if (moist > 0.60) type = 'forest';

      let cityId: string | null = null;
      let home: City | null = null;
      for (const c of cities) {
        if (Math.hypot(x - c.x, y - c.y) < c.radius + 2) { cityId = c.id; home = c; break; }
      }

      // ── City grading: cities sit on ONE dead-flat pad ──
      // Raw FBM elevation is what makes open country feel real, but a city
      // built on noise looks like a warped floor — every street tile sits at
      // a slightly different height and the whole grid appears to ripple.
      // Real developers grade a site flat before building on it, so we do the
      // same: inside the built radius the elevation is *assigned* (not
      // clamped — clamping left low tiles low, which was the actual bug), and
      // over the next few tiles it blends back into natural terrain so there
      // is no cliff at the city limit.
      let nearestCity: City | null = null;
      let nearestDist = Infinity;
      for (const c of cities) {
        const d = Math.hypot(x - c.x, y - c.y);
        if (d < nearestDist) { nearestDist = d; nearestCity = c; }
      }
      if (nearestCity) {
        const graded = nearestCity.radius + 2;   // fully flat
        const blendEnd = nearestCity.radius + 8; // back to natural terrain
        const blend = nearestDist <= graded ? 1
          : Math.max(0, 1 - (nearestDist - graded) / (blendEnd - graded));
        if (blend > 0) {
          elev = elev * (1 - blend) + CITY_PAD_ELEVATION * blend;
          // A graded pad cannot be open water or a mountain peak.
          if (blend > 0.5 && (type === 'water' || type === 'mountain')) type = 'grass';
        }
      }
      if (home && (type === 'water' || type === 'mountain')) type = 'grass';

      let zone: ZoneType = 'rural';
      if (home) {
        const d = Math.hypot(x - home.x, y - home.y);
        zone = d < 4 ? 'commercial' : d < home.radius * 0.65 ? 'residential'
          : d < home.radius * 0.85 ? 'mixed' : 'industrial';
      }

      const isHw = hw.has(`${x},${y}`) && type !== 'water';
      const road = home ? isCityRoad(home, x, y) : false;

      let resource: Tile['resource'] = null;
      const r = hash2d(seed + 31337)(x, y);
      const r2 = hash2d(seed + 991)(x, y);
      if (type === 'mountain' && r < 0.20) {
        const kind = r2 < 0.16 ? 'Lithium' : r2 < 0.5 ? 'Iron Ore' : 'Coal';
        resource = { type: kind, amount: 3000 + r2 * 5000 };
      } else if (type === 'desert' && r < 0.10) {
        resource = { type: 'Crude Oil', amount: 5000 + r2 * 6000 };
      } else if (type === 'forest' && r < 0.10) {
        resource = { type: 'Timber', amount: 2500 + r2 * 3000 };
      }

      let landValue = type === 'water' ? 2 : type === 'mountain' ? 4 : type === 'forest' ? 12 : 16;
      for (const c of cities) {
        const d = Math.hypot(x - c.x, y - c.y);
        if (d < 34 && type !== 'water') {
          const f = Math.max(0, 1 - d / 34);
          const premium = d < 5 ? 2.6 : d < 10 ? 1.7 : 1;
          landValue = Math.max(landValue, (8 + f * 92) * premium * (0.7 + c.population / 120_000));
        }
      }

      tiles[y][x] = {
        type, elevation: elev, landValue, cityId, zone,
        road, highway: isHw, variant: Math.floor(hash2d(seed + 55)(x, y) * 8), resource,
      };
    }
  }
  return tiles;
}

// ============================ COMPANIES ============================
export function generateCompanies(rand: () => number, playerName: string, playerColor: string): Company[] {
  const player: Company = {
    id: uid('co'), name: playerName, isPlayer: true, color: playerColor,
    cash: 40_000_000, debt: 0, interestRate: 6,
    revenue: 0, expenses: 0, profit: 0, totalAssets: 40_000_000,
    sharePrice: 20, sharesOutstanding: 2_000_000, marketCap: 40_000_000,
    sharePriceHistory: Array(60).fill(20),
    brandValue: 12, bondRating: 'BBB', skill: 'competent', acumen: 0.6,
    strategy: 'balanced', sectorFocus: 'diversified', personality: 'Founder-led operator',
    buildings: [], equityHoldings: {}, equityCostBasis: {},
    founderShares: 1_200_000, sharesIssuedThisYear: 0, shareIssuanceYear: 2000,
    costIntelUntilTick: 0, researchedCategories: [], lossCarryforward: 0,
    monthsInDistress: 0, dividendPayout: 0,
    taxesPaidYTD: 0, taxesPaidLastYear: 0, pretaxYTD: 0, monthlyRevenue: 0, monthlyProfit: 0,
    revenueAccum: 0, profitAccum: 0, profitHistory: Array(24).fill(0),
    assetHoldings: {}, assetCostBasis: {}, observedPlayerShare: {},
    predatoryTicks: 0, cartelId: null, sentiment: 1, riskTolerance: 0.5,
    planningHorizonMonths: 12,
  };

  const palette = COMPANY_COLORS.filter(c => c.toLowerCase() !== playerColor.toLowerCase())
    .slice().sort(() => rand() - 0.5);
  const count = 12;
  const ai: Company[] = [];
  for (let i = 0; i < count; i++) {
    const strategy = (['aggressive', 'balanced', 'conservative'] as const)[Math.floor(rand() * 3)];
    const roll = rand();
    const skill = roll < 0.34 ? 'novice' : roll < 0.64 ? 'competent' : roll < 0.87 ? 'shrewd' : 'ruthless';
    const acumen = SKILL_ACUMEN[skill];
    const cash = skill === 'novice' ? 400_000 + rand() * 2_000_000
      : skill === 'competent' ? 8_000_000 + rand() * 18_000_000
      : skill === 'shrewd' ? 30_000_000 + rand() * 55_000_000
      : 70_000_000 + rand() * 110_000_000;
    const shares = 500_000 + Math.floor(rand() * 4_000_000);
    const price = Math.max(2, cash * 0.7 / shares);
    const focuses = ['retail', 'industrial', 'real_estate', 'hospitality', 'diversified'] as const;
    const pers = PERSONALITIES[skill];
    ai.push({
      id: uid('co'), name: COMPANY_NAMES[i % COMPANY_NAMES.length], isPlayer: false,
      color: palette[i % palette.length],
      cash, debt: rand() * cash * 0.3, interestRate: 4 + rand() * 5,
      revenue: 0, expenses: 0, profit: 0, totalAssets: cash,
      sharePrice: price, sharesOutstanding: shares, marketCap: price * shares,
      sharePriceHistory: Array(60).fill(price),
      brandValue: 20 + rand() * 55,
      bondRating: (['AAA', 'AA', 'A', 'BBB', 'BB', 'B'])[Math.floor(rand() * 6)],
      skill: skill as Company['skill'], acumen, strategy,
      sectorFocus: focuses[i % focuses.length],
      personality: pers[Math.floor(rand() * pers.length)],
      buildings: [], equityHoldings: {}, equityCostBasis: {},
      founderShares: Math.floor(shares * 0.52), sharesIssuedThisYear: 0, shareIssuanceYear: 2000,
      costIntelUntilTick: 0, researchedCategories: [], lossCarryforward: 0,
      monthsInDistress: 0,
      dividendPayout: 8 + rand() * 26,
      assetHoldings: {}, assetCostBasis: {}, observedPlayerShare: {},
      predatoryTicks: 0, cartelId: null,
      sentiment: 0.9 + rand() * 0.6,
      riskTolerance: strategy === 'aggressive' ? 0.75 : strategy === 'conservative' ? 0.3 : 0.5,
      planningHorizonMonths: strategy === 'aggressive' ? 6 : strategy === 'conservative' ? 24 : 12,
      taxesPaidYTD: 0, taxesPaidLastYear: 0, pretaxYTD: 0, monthlyRevenue: 0, monthlyProfit: 0,
      revenueAccum: 0, profitAccum: 0, profitHistory: Array(24).fill(0),
    });
  }
  return [player, ...ai];
}

// ============================ BUILDINGS ============================
export function eligibleProducts(type: BuildingType, specialisation: string | null, resourceType: string | null, products: Product[]): Product[] {
  if (isHospitality(type)) {
    const allow = new Set(VENUE_INGREDIENTS[type] ?? []);
    return products.filter(p => allow.has(p.name));
  }
  if (type === 'farm') return products.filter(p => p.kind === 'farm');
  if (type === 'mine') {
    if (resourceType) {
      const m = products.filter(p => p.name === resourceType);
      if (m.length) return m;
    }
    return products.filter(p => p.kind === 'raw');
  }
  if (type === 'factory') return products.filter(p => p.kind === 'semi' || p.kind === 'consumer');
  if (type === 'retail_store') {
    const cons = products.filter(p => p.kind === 'consumer');
    return specialisation ? cons.filter(p => p.category === specialisation) : cons;
  }
  if (type === 'warehouse' || type === 'seaport') return products;
  return [];
}

export function createBuilding(
  type: BuildingType, companyId: string, city: City, products: Product[],
  x: number, y: number, tick: number, resourceType: string | null = null,
): Building {
  const cfg = BUILDING_CONFIGS[type];
  const specialisation = type === 'retail_store'
    ? RETAIL_CATEGORIES[Math.floor(Math.random() * RETAIL_CATEGORIES.length)] : null;
  const elig = eligibleProducts(type, specialisation, resourceType, products);
  const lines = type === 'retail_store' ? elig.slice(0, 3).map(p => p.id)
    : isHospitality(type) ? elig.map(p => p.id)
    : elig.length ? [elig[Math.floor(Math.random() * elig.length)].id] : [];

  return {
    id: uid('b'), type, name: `${cfg.name} · ${city.name}`, companyId, cityId: city.id,
    x, y, level: 1, maxLevel: 6,
    capacity: cfg.capacity, employees: 0, targetEmployees: cfg.employees,
    wagePerEmployee: city.wageRate * 2080, staffSkill: 1 + Math.random() * 2,
    trainingBudget: 0.3, morale: 58 + Math.random() * 12, condition: 88 + Math.random() * 12,
    isOperating: true, constructionEndsTick: tick,
    constructionCost: cfg.cost * city.landCostMultiplier,
    landValue: cfg.cost * city.landCostMultiplier * 0.22,
    purchasePrice: cfg.cost * city.landCostMultiplier,
    productId: lines[0] ?? null, products: lines,
    inventory: {}, inventoryCapacity: type === 'warehouse' ? 40_000 : type === 'seaport' ? 900_000 : 6_000,
    supplierLinks: [], autoRestock: true,
    pricingMultiplier: 1, adBudget: 0, brandEquity: 0, loyalty: 0.05, socialProof: 0,
    utilization: 0, customerTraffic: 0, lastUnitsSold: 0, lastUnitsProduced: 0,
    revenue: 0, cogs: 0, operatingCost: 0, profit: 0,
    costs: { wages: 0, payrollTax: 0, utilities: 0, marketing: 0, maintenance: 0, insurance: 0, propertyTax: 0, freight: 0, interest: 0, other: 0 },
    tenants: 0, occupancy: 0, rentPerUnit: 0, rentMultiplier: 1,
    resourceType, resourceRemaining: type === 'mine' ? 60_000 : 0, resourceMax: type === 'mine' ? 60_000 : 0,
    soilHealth: type === 'farm' ? 80 : 0, irrigation: type === 'farm' ? 0.25 : 0,
    growthStage: 'dormant',
    forSale: false, askingPrice: 0, fairValue: cfg.cost * city.landCostMultiplier,
    monthsUnprofitable: 0, spoilageYTD: 0,
    isLeased: false, financingPayment: 0, financingMonthsLeft: 0,
    unionized: false, unionWagePremium: 0, strikeTicks: 0,
    supplyMode: 'auto', supplierRelationships: {}, internalSale: false,
    sellPriceMultiplier: 1, transferPricingMode: 'cost_basis', transferPriceMultiplier: 1,
    supplyDisrupted: false,
    demandForecast: 0, safetyStockPolicy: 0.4, productionIntensity: 1,
    trainingLevel: 3, effectiveTraining: 1.5,
    openMarketSales: true, marketUnitsSold: 0, maintenanceReserve: 0,
    anchorPrice: 0, loyalCustomerBase: type === 'retail_store' ? 0.08 : 0.14,
    specialisation: type === 'retail_store' ? RETAIL_CATEGORIES[0] : null,
    productSlots: type === 'retail_store' ? 8 : 12,
    menu: buildMenu(type),
    livestockBreed: null, feedQuality: 0.4, vetProgram: 0, productTier: 'standard',
    farmTechniqueLevel: 0, farmEquipmentLevel: 0, diseaseTicks: 0,
    offersMade: 0, negotiationBlockedUntil: 0,
    dailyRevenue: 0, dailyProfit: 0, dailyProduced: 0, dailySold: 0,
    revenueAccum: 0, profitAccum: 0, producedAccum: 0, soldAccum: 0,
    profitHistory: Array(30).fill(0),
  };
}

export function findFreeTile(state: GameState, city: City, type: BuildingType, rand: () => number): { x: number; y: number } | null {
  for (let tries = 0; tries < 220; tries++) {
    const ang = rand() * Math.PI * 2;
    const rad = 2 + rand() * (city.radius - 1);
    const x = Math.round(city.x + Math.cos(ang) * rad);
    const y = Math.round(city.y + Math.sin(ang) * rad);
    if (canPlace(state, type, x, y).ok) return { x, y };
  }
  return null;
}

export function canPlace(state: GameState, type: BuildingType, x: number, y: number): { ok: boolean; reason: string } {
  const tile = state.tiles[y]?.[x];
  if (!tile) return { ok: false, reason: 'Outside the map boundary.' };
  if (tile.highway) return { ok: false, reason: 'Interstate right-of-way — no structures permitted.' };
  if (tile.road) return { ok: false, reason: 'Cannot build on a street.' };
  if (tile.type === 'water') return { ok: false, reason: 'Cannot build on water.' };
  if (state.buildings.some(b => b.x === x && b.y === y)) return { ok: false, reason: 'Plot already occupied.' };

  if (type === 'mine') {
    if (!tile.resource) return { ok: false, reason: 'Mines must sit on a mineral deposit.' };
    return { ok: true, reason: `Deposit: ${tile.resource.type}` };
  }
  if (tile.type === 'mountain') return { ok: false, reason: 'Only mines may be built on mountains.' };

  if (type === 'farm') {
    if (!['grass', 'hills', 'forest'].includes(tile.type)) return { ok: false, reason: 'Farms need grassland or gentle hills.' };
    return { ok: true, reason: 'Arable land — suitable for agriculture.' };
  }

  const city = state.cities.find(c => Math.hypot(c.x - x, c.y - y) <= c.radius + 1);
  if (!city) return { ok: false, reason: 'Must be built inside a city boundary.' };
  if (Math.hypot(x - city.x, y - city.y) < 2 && type !== 'hq') {
    return { ok: false, reason: `${city.name} civic square — headquarters only.` };
  }

  const heavy = type === 'factory' || type === 'warehouse';
  const commercial = type === 'retail_store' || type === 'office' || isHospitality(type);
  if (heavy && (tile.zone === 'residential' || tile.zone === 'commercial')) {
    return { ok: false, reason: `Zoning: heavy industry prohibited in the ${tile.zone} district.` };
  }
  if (type === 'apartment' && tile.zone === 'industrial') {
    return { ok: false, reason: 'Zoning: housing not permitted on industrial land.' };
  }
  if (commercial && tile.zone === 'industrial') {
    return { ok: false, reason: 'Zoning: customer-facing premises not permitted on industrial land.' };
  }
  return { ok: true, reason: `${tile.zone[0].toUpperCase()}${tile.zone.slice(1)} zone · land value $${Math.round(tile.landValue)}` };
}

// ============================ AGENTS ============================
export function spawnAgents(cities: City[], rand: () => number): Agent[] {
  const agents: Agent[] = [];
  const carColors = ['#e8e8ea', '#4a5568', '#c53030', '#2b6cb0', '#2f855a', '#d69e2e', '#7c3aed'];
  for (const c of cities) {
    const n = 10 + Math.round(c.population / 9000);
    for (let i = 0; i < n; i++) {
      const onX = rand() < 0.5;
      const lane = (Math.floor(rand() * (c.radius / 2)) - Math.floor(c.radius / 4)) * 4;
      const along = c.radius * (rand() * 2 - 1);
      const x = c.x + (onX ? along : lane);
      const y = c.y + (onX ? lane : along);
      const isCar = rand() < 0.62;
      agents.push({
        id: uid('a'), x, y,
        tx: onX ? c.x + c.radius * (rand() * 2 - 1) : x,
        ty: onX ? y : c.y + c.radius * (rand() * 2 - 1),
        kind: isCar ? 'car' : 'person',
        speed: isCar ? 0.05 + rand() * 0.05 : 0.014 + rand() * 0.012,
        color: isCar ? carColors[Math.floor(rand() * carColors.length)] : '#f0d5b8',
        cityId: c.id,
      });
    }
  }
  return agents;
}
