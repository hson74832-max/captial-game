import type {
  GameState, City, Company, Building, Product, MovingEntity, Economy,
  BuildingType, IsometricTile, ResourceNode, Goal, NewsTickerItem, Notification,
  ProductKind, CreditRating, Bond, BankOffer, Executive, ResearchProject, LandHolding
} from './types';
import {
  generateTechnologies, generateSoftwareProducts, generateTalentPool, defaultTelecomStats,
  simulateDigitalHourly, simulateDigitalMonthly, simulateAiTechCompanies,
} from './digital';
import { buildStateIndex, queryRadius, buildingsInCity, type StateIndex } from './indexing';
import {
  getRoadNetwork, nearestNode, randomRoadRoute, buildFreightPolyline,
  samplePolyline, tileIsRoad, invalidateRoadCache, PARKING_OFFSET,
  CITY_ROAD_RADIUS,
} from './roads';

export function isRoadTile(tile: IsometricTile | null | undefined, state: GameState): boolean {
  if (!tile?.cityId || tile.type === 'water') return false;
  const city = state.cities.find(item => item.id === tile.cityId);
  return city ? tileIsRoad(tile.x, tile.y, city) : false;
}

/** A kerbside bay generated one tile off a street node next to a building. */
export function isParkingSlot(x: number, y: number, state: GameState): boolean {
  const city = state.cities.find(item => Math.hypot(item.x - x, item.y - y) < 16);
  if (!city) return false;
  const network = getRoadNetwork(state, city);
  return network.parking.some(slot => Math.hypot(slot.x - x, slot.y - y) < PARKING_OFFSET);
}

export function isBuildableTile(tile: IsometricTile | null | undefined, state: GameState, type: BuildingType): { ok: boolean; reason: string } {
  if (!tile) return { ok: false, reason: 'Outside the country map.' };
  if (isRoadTile(tile, state)) return { ok: false, reason: 'Cannot build on streets or intersections.' };
  if (isParkingSlot(tile.x, tile.y, state)) return { ok: false, reason: 'Cannot build on parking and loading access.' };
  // Block the inner CBD concrete zone
  for (const city of state.cities) {
    if (Math.hypot(tile.x - city.x, tile.y - city.y) < 4) {
      return { ok: false, reason: 'Too close to city center. Use surrounding plots.' };
    }
  }
  if (state.buildings.some(building => Math.hypot(building.x - tile.x, building.y - tile.y) < (building.width + (BUILDING_CONFIGS[type]?.w || 1)) * 0.42)) {
    return { ok: false, reason: 'That plot is occupied.' };
  }
  if (tile.type === 'water' || tile.type === 'snow' || (tile.type === 'mountain' && type !== 'mine')) {
    return { ok: false, reason: 'This terrain is not suitable for construction.' };
  }
  if (type === 'mine' && (!tile.resource || !['iron', 'coal', 'oil', 'timber', 'gold', 'lithium', 'silica'].includes(tile.resource.type))) {
    return { ok: false, reason: 'Mines must be placed directly on a mineral deposit.' };
  }
  if (type === 'farm' && !['grass', 'hills'].includes(tile.type)) return { ok: false, reason: 'Farms require grassland or gentle hills.' };
  return { ok: true, reason: 'Valid building plot.' };
}

/** Validates every tile covered by a building footprint, not just its anchor. */
export function isFootprintBuildable(tiles: IsometricTile[][], state: GameState, type: BuildingType, x: number, y: number): { ok: boolean; reason: string } {
  const cfg = BUILDING_CONFIGS[type];
  const halfW = Math.max(0, Math.floor(cfg.w / 2));
  const halfH = Math.max(0, Math.floor(cfg.h / 2));
  const minX = x - halfW;
  const maxX = x + (cfg.w % 2 === 0 ? halfW - 1 : halfW);
  const minY = y - halfH;
  const maxY = y + (cfg.h % 2 === 0 ? halfH - 1 : halfH);
  let firstReason = '';
  let anyResource = false;
  let allGrassLike = true;
  for (let ty = minY; ty <= maxY; ty++) {
    for (let tx = minX; tx <= maxX; tx++) {
      const tile = tiles[ty]?.[tx];
      const verdict = isBuildableTile(tile ?? undefined, state, type);
      if (!verdict.ok) {
        // Mines only require ONE deposit tile inside the footprint, not all.
        if (type === 'mine' && verdict.reason.includes('mineral deposit')) { allGrassLike = false; continue; }
        if (firstReason === '') firstReason = verdict.reason;
      }
      if (tile?.resource) anyResource = true;
    }
  }
  if (type === 'mine' && !anyResource && firstReason === '') firstReason = 'Mines must be placed directly on a mineral deposit.';
  return { ok: firstReason === '', reason: firstReason || 'Valid building plot.' };
}

/** Nudges a coordinate off any street centreline so generated structures never sit on roads. */
export function snapOffRoad(city: City, x: number, y: number): [number, number] {
  let nx = Math.round(x);
  let ny = Math.round(y);
  for (let guard = 0; guard < 6; guard++) {
    if (Math.hypot(nx - city.x, ny - city.y) >= CITY_ROAD_RADIUS_FOR_PLACEMENT) break;
    if (!tileIsRoad(nx, ny, city)) break;
    nx += 1;
    ny += 1;
  }
  return [nx, ny];
}

const CITY_ROAD_RADIUS_FOR_PLACEMENT = CITY_ROAD_RADIUS;

// ============= CONSTANTS =============

const PRODUCT_CATEGORIES: Record<string, { products: string[], icon: string, necessity: number }> = {
  'Raw Materials': { products: ['Iron', 'Coal', 'Oil', 'Silica', 'Lithium', 'Timber', 'Gold'], icon: '⛏️', necessity: 100 },
  'Farm Products': { products: ['Wheat', 'Corn', 'Livestock', 'Milk', 'Grapes'], icon: '🌾', necessity: 95 },
  'Semi Products': { products: ['Steel', 'Glass', 'Plastic', 'Flour', 'Leather', 'Electronic Components', 'Wheel and Tire', 'Electric Motor', 'Electric Car Battery', 'Car Body', 'Electric Car Chassis'], icon: '⚙️', necessity: 85 },
  'Food': { products: ['Bread', 'Canned Soup', 'Corn Flakes', 'Cakes', 'Pasta'], icon: '🍞', necessity: 90 },
  'Beverage': { products: ['Cola', 'Bottled Milk', 'Wine', 'Grape Juice', 'Bottled Water'], icon: '🥤', necessity: 75 },
  'Electronics': { products: ['Television', 'Hi-fi System', 'Camcorder', 'Game Console'], icon: '📺', necessity: 30 },
  'Computers': { products: ['Desktop Computer', 'Notebook Computer', 'Tablet Computer', 'Printer', 'Server'], icon: '💻', necessity: 25 },
  'Automobile': { products: ['Car', 'Electric Car', 'Motorcycle', 'Truck'], icon: '🚗', necessity: 20 },
  'Apparel': { products: ['Jeans', 'Sweater', 'Blazer', 'Leather Jacket', 'T-Shirt'], icon: '👕', necessity: 70 },
  'Furniture': { products: ['Bed', 'Chair', 'Sofa', 'Table', 'Wardrobe'], icon: '🪑', necessity: 50 },
  'Cosmetics': { products: ['Lipstick', 'Perfume', 'Eye Shadow', 'Hair Color'], icon: '💄', necessity: 35 },
  'Drugs': { products: ['Headache Pills', 'Cold Pills', 'Cough Syrup', 'Vitamins'], icon: '💊', necessity: 80 },
  'Footwear': { products: ['Sport Shoes', 'Shoes', 'Sandals', 'Socks', 'Boots'], icon: '👟', necessity: 65 },
  'Communication': { products: ['Mobile Phone', 'Smart Phone', 'Camera Phone', 'Smartwatch'], icon: '📱', necessity: 40 },
  'Home Appliances': { products: ['Refrigerator', 'Washing Machine', 'Air Conditioner', 'Coffee Machine', 'Microwave'], icon: '🏠', necessity: 45 },
  'Photography': { products: ['Camera', 'Digital Camera', 'Compact Camera'], icon: '📷', necessity: 25 },
  'Leather Goods': { products: ['Leather Bag', 'Leather Belt', 'Leather Wallet'], icon: '👜', necessity: 35 },
  'Toys': { products: ['Stuffed Toy', 'Toy Racing Car', 'Video Game Console'], icon: '🎮', necessity: 30 },
  'Software': { products: ['Computer OS', 'Office Suite', '3D Modelling Software', 'Anti-virus Software'], icon: '💿', necessity: 20 },
};

type ProductRule = {
  kind: ProductKind;
  cost: number;
  priceWeight?: number;
  qualityWeight?: number;
  brandWeight?: number;
  unlockYear?: number;
  replacementName?: string;
  maxShift?: number;
  inputs?: Array<[string, number]>;
};

const PRODUCT_RULES: Record<string, ProductRule> = {
  Iron: { kind: 'raw', cost: 18 }, Coal: { kind: 'raw', cost: 14 }, Oil: { kind: 'raw', cost: 28 },
  Silica: { kind: 'raw', cost: 12 }, Lithium: { kind: 'raw', cost: 42 }, Timber: { kind: 'raw', cost: 16 }, Gold: { kind: 'raw', cost: 95 },
  Wheat: { kind: 'farm', cost: 8 }, Corn: { kind: 'farm', cost: 9 }, Livestock: { kind: 'farm', cost: 24 }, Milk: { kind: 'farm', cost: 13 }, Grapes: { kind: 'farm', cost: 15 },
  Steel: { kind: 'semi', cost: 44, inputs: [['Iron', 2], ['Coal', 1]] },
  Glass: { kind: 'semi', cost: 30, inputs: [['Silica', 2], ['Coal', 0.5]] },
  Plastic: { kind: 'semi', cost: 36, inputs: [['Oil', 1.5]] },
  Flour: { kind: 'semi', cost: 18, inputs: [['Wheat', 2]] },
  Leather: { kind: 'semi', cost: 48, inputs: [['Livestock', 1.5]] },
  'Electronic Components': { kind: 'semi', cost: 70, qualityWeight: 55, inputs: [['Silica', 1], ['Gold', 0.15], ['Plastic', 0.5]] },
  'Wheel and Tire': { kind: 'semi', cost: 68, inputs: [['Steel', 0.6], ['Oil', 0.8]] },
  'Electric Motor': { kind: 'semi', cost: 180, unlockYear: 2003, inputs: [['Steel', 1], ['Electronic Components', 1.2]] },
  'Electric Car Battery': { kind: 'semi', cost: 260, unlockYear: 2005, inputs: [['Lithium', 2], ['Electronic Components', 1]] },
  'Car Body': { kind: 'semi', cost: 420, inputs: [['Plastic', 2], ['Glass', 1], ['Steel', 4]] },
  'Electric Car Chassis': { kind: 'semi', cost: 780, unlockYear: 2005, inputs: [['Wheel and Tire', 4], ['Electric Motor', 1], ['Electric Car Battery', 1]] },
  Bread: { kind: 'consumer', cost: 22, priceWeight: 45, qualityWeight: 35, brandWeight: 20, inputs: [['Flour', 1.5], ['Milk', 0.2]] },
  Cakes: { kind: 'consumer', cost: 34, inputs: [['Flour', 1.2], ['Milk', 0.6]] },
  'Corn Flakes': { kind: 'consumer', cost: 28, inputs: [['Corn', 1.5], ['Milk', 0.2]] },
  Car: { kind: 'consumer', cost: 1250, priceWeight: 30, qualityWeight: 45, brandWeight: 25, replacementName: 'Electric Car', maxShift: 50, inputs: [['Car Body', 1], ['Wheel and Tire', 4], ['Steel', 2], ['Electronic Components', 1]] },
  'Electric Car': { kind: 'consumer', cost: 1800, priceWeight: 28, qualityWeight: 52, brandWeight: 20, unlockYear: 2005, inputs: [['Electric Car Chassis', 1], ['Car Body', 1]] },
  'Mobile Phone': { kind: 'consumer', cost: 180, qualityWeight: 40, brandWeight: 30, priceWeight: 30, replacementName: 'Camera Phone', maxShift: 100, inputs: [['Electronic Components', 2], ['Plastic', 1], ['Glass', 0.5]] },
  'Camera Phone': { kind: 'consumer', cost: 240, unlockYear: 2000, replacementName: 'Smart Phone', maxShift: 100, inputs: [['Electronic Components', 2.5], ['Plastic', 1], ['Glass', 0.8]] },
  'Smart Phone': { kind: 'consumer', cost: 330, unlockYear: 2007, qualityWeight: 50, brandWeight: 30, priceWeight: 20, inputs: [['Electronic Components', 3], ['Plastic', 1], ['Glass', 1]] },
  Camera: { kind: 'consumer', cost: 130, replacementName: 'Digital Camera', maxShift: 100, inputs: [['Glass', 1], ['Plastic', 1]] },
  'Digital Camera': { kind: 'consumer', cost: 210, unlockYear: 1998, inputs: [['Electronic Components', 2], ['Glass', 1], ['Plastic', 1]] },
  Television: { kind: 'consumer', cost: 260, inputs: [['Electronic Components', 2], ['Glass', 2], ['Plastic', 1]] },
  Refrigerator: { kind: 'consumer', cost: 320, inputs: [['Steel', 2], ['Electronic Components', 1], ['Plastic', 1]] },
  'Leather Jacket': { kind: 'consumer', cost: 150, brandWeight: 45, inputs: [['Leather', 2]] },
  'Leather Bag': { kind: 'consumer', cost: 125, brandWeight: 50, inputs: [['Leather', 1.4]] },
  'Computer OS': { kind: 'digital', cost: 60, qualityWeight: 65, brandWeight: 25, priceWeight: 10, unlockYear: 1990 },
  'Office Suite': { kind: 'digital', cost: 45, qualityWeight: 55, brandWeight: 25, priceWeight: 20, unlockYear: 1992 },
  '3D Modelling Software': { kind: 'digital', cost: 140, qualityWeight: 70, brandWeight: 20, priceWeight: 10, unlockYear: 1998 },
  'Anti-virus Software': { kind: 'digital', cost: 35, qualityWeight: 60, brandWeight: 20, priceWeight: 20, unlockYear: 1994 },
};

const CITY_NAMES = ['New York', 'Shanghai', 'London', 'Tokyo', 'Berlin', 'Sydney', 'Singapore', 'São Paulo', 'Mumbai', 'Toronto', 'Paris', 'Dubai'];
const COMPANY_NAMES = ['Apex Corp', 'Titan Industries', 'Nova Group', 'Stellar Holdings', 'Prime Ventures', 'Zenith Corp', 'Crown Ltd'];
const COMPANY_COLORS = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#a855f7', '#ec4899', '#14b8a6'];

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

// Simple 2D value noise (replaces Perlin/Simplex for portability)
function hash2d(seed: number) {
  return (x: number, y: number) => {
    let h = Math.sin(x * 374.5 + y * 271.3 + seed * 13.7) * 43758.5453;
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
  const a = h(x0, y0);
  const b = h(x1, y0);
  const c = h(x0, y1);
  const d = h(x1, y1);
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

function fbm(seed: number, x: number, y: number, octaves = 4, baseScale = 18, persistence = 0.5) {
  let total = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxValue = 0;
  for (let i = 0; i < octaves; i++) {
    total += valueNoise(seed + i, x, y, baseScale / frequency) * amplitude;
    maxValue += amplitude;
    amplitude *= persistence;
    frequency *= 2;
  }
  return total / maxValue;
}

// ============= GAME INITIALIZATION =============

function generateProducts(rand: () => number): Product[] {
  const products: Product[] = [];
  for (const [category, data] of Object.entries(PRODUCT_CATEGORIES)) {
    for (const name of data.products) {
      const rule = PRODUCT_RULES[name];
      const kind: ProductKind = rule?.kind || 'consumer';
      const cost = rule?.cost || (kind === 'consumer' ? 55 + rand() * 240 : 30 + rand() * 80);
      products.push({
        id: generateId(),
        name,
        category,
        basePrice: cost * (1.25 + rand() * 0.35),
        currentPrice: cost * (1.25 + rand() * 0.35),
        quality: 30 + rand() * 40,
        brand: 10 + rand() * 30,
        techLevel: 1 + Math.floor(rand() * 5),
        demandIndex: data.necessity,
        inputs: [],
        icon: data.icon,
        kind,
        productionCost: cost,
        priceWeight: rule?.priceWeight ?? 40,
        qualityWeight: rule?.qualityWeight ?? 35,
        brandWeight: rule?.brandWeight ?? 25,
        unlockYear: rule?.unlockYear ?? 1980,
        replacementName: rule?.replacementName ?? null,
        maxDemandShift: rule?.maxShift ?? 0,
        demandShift: 0,
        obsolete: false,
        marketDemand: 35 + rand() * 65,
        playerMarketShare: 0,
      });
    }
  }
  const byName = new Map(products.map(product => [product.name, product]));
  for (const product of products) {
    product.inputs = (PRODUCT_RULES[product.name]?.inputs || []).flatMap(([inputName, quantity]) => {
      const input = byName.get(inputName);
      return input ? [{ productId: input.id, productName: inputName, quantity }] : [];
    });
  }
  return products;
}

function generateCities(rand: () => number, size: number): City[] {
  // Place cities using poisson-disc-ish: spread out and avoid water
  const positions: Array<{ x: number, y: number }> = [];
  const numCities = 10 + Math.floor(rand() * 4);
  let attempts = 0;
  while (positions.length < numCities && attempts < 800) {
    attempts++;
    const x = 20 + rand() * (size - 40);
    const y = 20 + rand() * (size - 40);
    if (x > size - 30 && y > size - 30) continue;
    const tooClose = positions.some(p => Math.hypot(p.x - x, p.y - y) < 35);
    if (tooClose) continue;
    positions.push({ x, y });
  }

  return positions.map((pos, i) => {
    const population = 200000 + Math.floor(rand() * 12000000);
    const tier = population > 8000000 ? 'metropolis' : population > 3000000 ? 'large' : population > 1000000 ? 'medium' : 'small';
    return {
      id: generateId(),
      name: CITY_NAMES[i % CITY_NAMES.length] + (i >= CITY_NAMES.length ? ` ${Math.floor(i / CITY_NAMES.length) + 1}` : ''),
      x: pos.x,
      y: pos.y,
      population,
      // BLS percentiles: $7.25/hr statutory minimum through ~$45/hr high-skill metros.
      wageRate: 7.25 + Math.pow(rand(), 1.35) * 37.75,
      landCostMultiplier: 0.5 + rand() * 2.5,
      demandMultiplier: 0.85 + rand() * 0.3,
      unemploymentRate: 3 + rand() * 7,
      growthRate: 0.4 + rand() * 3.2,
      hasSeaport: i < 4,
      color: `hsl(${(i * 47) % 360}, 65%, 55%)`,
      tier,
      housingDemand: -35 + rand() * 70,
      officeDemand: -35 + rand() * 70,
      qualityOfLife: 40 + rand() * 45,
      trafficLevel: 25 + rand() * 60,
      gdpPerCapita: (18000 + rand() * 62000) * (scenarioWageScale(pos.x, size)),
      wageHistory: Array.from({ length: 24 }, (_, month) => 18 + month * 0.3 + rand() * 5),
      populationHistory: Array.from({ length: 24 }, (_, month) => Math.floor(population * (0.92 + month * 0.003 + rand() * 0.01))),
      internetUsers: 0,
      bandwidthCapacity: 0,
      ecommerceAdoption: 0,
    };
  });
}

function scenarioWageScale(x: number, size: number) {
  return 0.85 + (x / size) * 0.3;
}

function generateCompanies(rand: () => number, playerName: string): Company[] {
  const numAI = 4 + Math.floor(rand() * 3);
  const player: Company = {
    id: generateId(),
    name: playerName,
    isPlayer: true,
    cash: 50000000,
    revenue: 0,
    profit: 0,
    expenses: 0,
    totalAssets: 50000000,
    debt: 0,
    interestRate: 5,
    sharePrice: 10,
    sharesOutstanding: 1000000,
    sharesOwned: 750000,
    marketCap: 10000000,
    brandValue: 10,
    color: '#10b981',
    aiStrategy: 'balanced',
    buildings: [],
    bondRating: 'A',
    sector: 'diversified',
    dividendPayout: 20,
    intangibleTechnology: 0,
    autoAdjustPrices: true,
  };

  const ai: Company[] = [];
  for (let i = 0; i < numAI; i++) {
    const strategy: Company['aiStrategy'] = (['aggressive', 'balanced', 'conservative'] as const)[Math.floor(rand() * 3)];
    const cash = 20000000 + rand() * 180000000;
    const shares = 500000 + Math.floor(rand() * 4500000);
    const price = 5 + rand() * 100;
    const aiComp: Company = {
      id: generateId(),
      name: COMPANY_NAMES[i % COMPANY_NAMES.length] + (i >= COMPANY_NAMES.length ? ` ${Math.floor(i / COMPANY_NAMES.length) + 1}` : ''),
      isPlayer: false,
      cash,
      revenue: 1000000 + rand() * 50000000,
      profit: -500000 + rand() * 15000000,
      expenses: 500000 + rand() * 20000000,
      totalAssets: 30000000 + rand() * 500000000,
      debt: rand() * 100000000,
      interestRate: 4 + rand() * 5,
      sharePrice: price,
      sharesOutstanding: shares,
      sharesOwned: 0,
      marketCap: price * shares,
      brandValue: 20 + rand() * 60,
      color: COMPANY_COLORS[i % COMPANY_COLORS.length],
      aiStrategy: strategy,
      buildings: [],
      bondRating: (['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC'] as const)[Math.floor(rand() * 7)],
      sector: (['consumer', 'industrial', 'technology', 'real_estate', 'media', 'investment'] as const)[i % 6],
      dividendPayout: 10 + rand() * 35,
      intangibleTechnology: rand() * 30000000,
      autoAdjustPrices: true,
    };
    ai.push(aiComp);
  }

  return [player, ...ai];
}

const BUILDING_CONFIGS: Record<string, { name: string, cost: number, employees: number, capacity: number, w: number, h: number, sprites: number }> = {
  retail_store: { name: 'Retail Store', cost: 500000, employees: 20, capacity: 100, w: 2, h: 2, sprites: 4 },
  factory: { name: 'Factory', cost: 2000000, employees: 100, capacity: 500, w: 3, h: 3, sprites: 4 },
  farm: { name: 'Farm', cost: 300000, employees: 30, capacity: 200, w: 4, h: 4, sprites: 4 },
  mine: { name: 'Mine', cost: 1500000, employees: 50, capacity: 300, w: 3, h: 3, sprites: 4 },
  warehouse: { name: 'Warehouse', cost: 400000, employees: 10, capacity: 800, w: 2, h: 3, sprites: 3 },
  hq: { name: 'Headquarters', cost: 3000000, employees: 50, capacity: 0, w: 2, h: 2, sprites: 3 },
  rd_center: { name: 'R&D Center', cost: 2500000, employees: 80, capacity: 0, w: 2, h: 2, sprites: 3 },
  apartment: { name: 'Apartment Building', cost: 1500000, employees: 5, capacity: 100, w: 2, h: 2, sprites: 4 },
  commercial: { name: 'Commercial Building', cost: 2000000, employees: 5, capacity: 80, w: 2, h: 2, sprites: 4 },
  media_tv: { name: 'TV Station', cost: 5000000, employees: 200, capacity: 0, w: 3, h: 2, sprites: 2 },
  media_radio: { name: 'Radio Station', cost: 1000000, employees: 50, capacity: 0, w: 2, h: 2, sprites: 2 },
  media_newspaper: { name: 'Newspaper', cost: 800000, employees: 40, capacity: 0, w: 2, h: 2, sprites: 2 },
  media_tower: { name: 'Telecom Tower', cost: 600000, employees: 8, capacity: 0, w: 1, h: 1, sprites: 2 },
  civic_school: { name: 'School', cost: 1800000, employees: 85, capacity: 0, w: 3, h: 2, sprites: 2 },
  civic_hospital: { name: 'Hospital', cost: 4200000, employees: 240, capacity: 0, w: 3, h: 3, sprites: 2 },
  civic_stadium: { name: 'Stadium', cost: 6500000, employees: 120, capacity: 0, w: 4, h: 4, sprites: 2 },
  civic_museum: { name: 'Museum', cost: 2800000, employees: 70, capacity: 0, w: 3, h: 2, sprites: 2 },
  civic_park: { name: 'City Park', cost: 650000, employees: 12, capacity: 0, w: 3, h: 3, sprites: 2 },
  internet_search: { name: 'Search Engine', cost: 4500000, employees: 140, capacity: 0, w: 3, h: 2, sprites: 2 },
  internet_social: { name: 'Social Network', cost: 3800000, employees: 120, capacity: 0, w: 3, h: 2, sprites: 2 },
  internet_ecommerce: { name: 'E-Commerce Platform', cost: 5200000, employees: 190, capacity: 500, w: 3, h: 3, sprites: 2 },
  software_company: { name: 'Software Studio', cost: 3200000, employees: 110, capacity: 0, w: 3, h: 2, sprites: 2 },
  telecom: { name: 'Telecom Operator', cost: 4800000, employees: 95, capacity: 0, w: 3, h: 2, sprites: 2 },
  seaport: { name: 'Seaport', cost: 0, employees: 100, capacity: 1000, w: 3, h: 2, sprites: 2 },
};

export function getBuildingConfig(type: BuildingType) {
  return BUILDING_CONFIGS[type];
}

function createBuilding(
  type: BuildingType,
  companyId: string,
  city: City | null,
  products: Product[],
  tick: number,
  x?: number, y?: number,
): Building {
  const cfg = BUILDING_CONFIGS[type] || BUILDING_CONFIGS.retail_store;
  const landFactor = city ? city.landCostMultiplier : 1;
  let offsetX = x !== undefined ? x : (city ? city.x + (-10 + Math.floor(Math.random() * 20)) : 50);
  let offsetY = y !== undefined ? y : (city ? city.y + (-10 + Math.floor(Math.random() * 20)) : 50);
  // AI placements: snap off road centrelines so structures never spawn on streets.
  if (x === undefined && city) {
    [offsetX, offsetY] = snapOffRoad(city, offsetX, offsetY);
  }
  const eligibleProducts = products.filter(product => {
    if (type === 'farm') return product.kind === 'farm';
    if (type === 'mine') return product.kind === 'raw';
    if (type === 'factory') return product.kind === 'semi' || product.kind === 'consumer';
    if (type === 'retail_store') return product.kind === 'consumer';
    if (type === 'software_company') return product.kind === 'digital';
    if (type === 'warehouse') return product.kind !== 'digital';
    if (type === 'rd_center') return product.kind === 'consumer' || product.kind === 'digital';
    return product.kind === 'consumer';
  });
  const firstProduct = eligibleProducts[Math.floor(Math.random() * Math.max(1, eligibleProducts.length))];
  const selectedProducts = firstProduct ? [firstProduct.id] : [];

  return {
    id: generateId(),
    type,
    name: cfg.name,
    companyId,
    cityId: city?.id || '',
    x: offsetX,
    y: offsetY,
    width: cfg.w,
    height: cfg.h,
    level: 1,
    maxLevel: 9,
    operatingCost: cfg.cost * 0.02,
    revenue: 0,
    profit: 0,
    employees: cfg.employees,
    trainingLevel: 1 + Math.floor(Math.random() * 3),
    products: selectedProducts,
    inventory: {},
    capacity: cfg.capacity,
    utilization: 30 + Math.random() * 50,
    customerTraffic: type === 'retail_store' ? 40 + Math.random() * 60 : 0,
    landValue: cfg.cost * landFactor * 0.1,
    constructionCost: cfg.cost * landFactor,
    condition: 80 + Math.random() * 20,
    isOperating: true,
    sprite: Math.floor(Math.random() * cfg.sprites),
    constructedTick: tick,
    smokeAccum: Math.random() * 1000,
    glowPhase: Math.random() * Math.PI * 2,
    productId: selectedProducts[0] || null,
    pricingMultiplier: 1,
    internalSale: false,
    supply: 0,
    demand: 0,
    freightCost: 0,
    inputCost: 0,
    inventoryCapacity: Math.max(100, cfg.capacity * (type === 'warehouse' ? 3 : 1)),
    supplierLinks: [],
    trainingBudget: 0.35,
    occupancy: type === 'apartment' || type === 'commercial' ? 65 : 0,
    rentMultiplier: 1,
    amenityCommunity: 20,
    amenitySports: 20,
    amenityShopping: 20,
    contentBudget: type.startsWith('media_') ? 0.5 : 0,
    advertisingPrice: type.startsWith('media_') ? 2 : 0,
    mediaRating: type.startsWith('media_') ? 10 : 0,
    researchProjectId: null,
    researchProgress: 0,
    portKind: null,
    resourceType: null,
    resourceRemaining: type === 'mine' ? 1400 : 0,
    resourceMax: type === 'mine' ? 1400 : 0,
    lastUnitsSold: 0,
    lastUnitsProduced: 0,
    spoilageLoss: 0,
    expiredUnits: 0,
    telecom: type === 'telecom' ? defaultTelecomStats() : null,
    ecommerceListings: [],
    ecommerceEnabled: false,
    softwareProductId: null,
    featuresQuality: type.startsWith('internet_') ? 15 : 0,
    technologyQuality: 0,
    monthlyVisitors: 0,
    costPerClick: 0.6,
    talentIds: [],
    rentPerUnit: 0,
    standingOffer: null,
    standingOfferBy: null,
  };
}

function generateInitialBuildings(cities: City[], companies: Company[], products: Product[], tick: number): Building[] {
  const buildings: Building[] = [];
  const aiTypes: BuildingType[] = ['retail_store', 'factory', 'apartment', 'commercial', 'farm', 'warehouse'];

  for (const company of companies) {
    if (company.isPlayer) continue;
    const numBuildings = 4 + Math.floor(Math.random() * 6);
    for (let i = 0; i < numBuildings; i++) {
      const city = cities[Math.floor(Math.random() * cities.length)];
      const type = aiTypes[Math.floor(Math.random() * aiTypes.length)];
      const building = createBuilding(type, company.id, city, products, tick);
      buildings.push(building);
      company.buildings.push(building.id);
    }
  }

  // Add seaports
  for (const [portIndex, city] of cities.entries()) {
    if (city.hasSeaport) {
      const portKind = portIndex % 2 === 0 ? 'industrial' : 'commercial';
      const portProducts = products
        .filter(product => portKind === 'industrial' ? product.kind === 'raw' || product.kind === 'semi' : product.kind === 'consumer')
        .filter((_product, index) => (index + portIndex) % 2 === 0)
        .slice(0, 9);
      const b: Building = {
        id: generateId(),
        type: 'seaport',
        name: `${city.name} ${portKind === 'industrial' ? 'Industrial' : 'Commercial'} Port`,
        companyId: 'system',
        cityId: city.id,
        x: city.x + 6,
        y: city.y + 4,
        width: 4,
        height: 3,
        level: 5,
        maxLevel: 5,
        operatingCost: 0,
        revenue: 0,
        profit: 0,
        employees: 100,
        trainingLevel: 5,
        products: portProducts.map(p => p.id),
        inventory: Object.fromEntries(portProducts.map(product => [product.id, 850])),
        capacity: 1000,
        utilization: 60,
        customerTraffic: 80,
        landValue: 0,
        constructionCost: 0,
        condition: 100,
        isOperating: true,
        sprite: Math.floor(Math.random() * 2),
        constructedTick: 0,
        smokeAccum: 0,
        glowPhase: 0,
        productId: portProducts[0]?.id || null,
        pricingMultiplier: 1,
        internalSale: false,
        supply: 1000,
        demand: 500,
        freightCost: 0,
        inputCost: 0,
        inventoryCapacity: 10000,
        supplierLinks: [],
        trainingBudget: 0,
        occupancy: 0,
        rentMultiplier: 1,
        amenityCommunity: 0,
        amenitySports: 0,
        amenityShopping: 0,
        contentBudget: 0,
        advertisingPrice: 0,
        mediaRating: 0,
        researchProjectId: null,
        researchProgress: 0,
        portKind,
        resourceType: null,
        resourceRemaining: 0,
        resourceMax: 0,
        lastUnitsSold: 0,
        lastUnitsProduced: 0,
        spoilageLoss: 0,
        expiredUnits: 0,
        telecom: null,
        ecommerceListings: [],
        ecommerceEnabled: false,
        softwareProductId: null,
        featuresQuality: 0,
        technologyQuality: 0,
        monthlyVisitors: 0,
        costPerClick: 0.6,
        talentIds: [],
        rentPerUnit: 0,
        standingOffer: null,
        standingOfferBy: null,
      };
      buildings.push(b);
    }
  }

  return buildings;
}

function generateGoals(playerCompany: Company): Goal[] {
  return [
    { id: generateId(), name: 'First Million', description: 'Reach $75M in corporate cash', target: 75000000, current: playerCompany.cash, reward: 250000, completed: false, category: 'wealth', knowledgeReward: 2, deadlineYear: null },
    { id: generateId(), name: 'Empire Builder', description: 'Own 10 operating firms', target: 10, current: playerCompany.buildings.length, reward: 500000, completed: false, category: 'expansion', knowledgeReward: 3, deadlineYear: 2010 },
    { id: generateId(), name: 'Billionaire', description: 'Reach $1B market capitalization', target: 1000000000, current: playerCompany.marketCap, reward: 5000000, completed: false, category: 'wealth', knowledgeReward: 8, deadlineYear: null },
    { id: generateId(), name: 'Multi-City', description: 'Operate in 3 different cities', target: 3, current: 0, reward: 1000000, completed: false, category: 'expansion', knowledgeReward: 4, deadlineYear: 2012 },
    { id: generateId(), name: 'Market Dominator', description: 'Lead a product with at least 35% share', target: 35, current: 0, reward: 2000000, completed: false, category: 'dominance', knowledgeReward: 6, deadlineYear: null },
    { id: generateId(), name: 'Innovator', description: 'Reach technology level 10', target: 10, current: 1, reward: 1500000, completed: false, category: 'innovation', knowledgeReward: 8, deadlineYear: null },
    { id: generateId(), name: 'Debt Free', description: 'Return outstanding debt to zero', target: 1, current: 0, reward: 250000, completed: false, category: 'wealth', knowledgeReward: 2, deadlineYear: null },
    { id: generateId(), name: 'Media Mogul', description: 'Own a television station', target: 1, current: 0, reward: 750000, completed: false, category: 'dominance', knowledgeReward: 3, deadlineYear: null },
  ];
}

function generateBankOffers(companies: Company[], rand: () => number): BankOffer[] {
  const corporateBanks = companies.slice(1, 4).map((company, index) => ({
    id: generateId(),
    bankName: `${company.name.split(' ')[0]} Commercial Bank`,
    companyId: company.id,
    interestRate: 4.6 + index * 0.8 + rand(),
    creditLimit: 28000000 + rand() * 65000000,
    currentLoan: 0,
    maxTermYears: 5 + index * 5,
  }));
  return [
    { id: generateId(), bankName: 'National Development Bank', companyId: null, interestRate: 5.2, creditLimit: 85000000, currentLoan: 0, maxTermYears: 20 },
    ...corporateBanks,
  ];
}

function generateExecutives(): Executive[] {
  return [
    { id: generateId(), role: 'COO', name: 'Maya Patel', salary: 1250000, expertise: { Manufacturing: 72, Retail: 58, Farming: 44 }, hired: false, automation: false },
    { id: generateId(), role: 'CTO', name: 'Adrian Kim', salary: 1480000, expertise: { Computers: 86, Communication: 79, Automobile: 52 }, hired: false, automation: false },
    { id: generateId(), role: 'CMO', name: 'Elena Rossi', salary: 1120000, expertise: { Branding: 88, Media: 76, Retail: 63 }, hired: false, automation: false },
  ];
}

function generateInitialBonds(companies: Company[], year: number): Bond[] {
  return companies.slice(1, 4).map((company, index) => {
    const termYears = ([5, 10, 15] as const)[index];
    return {
      id: generateId(), issuerId: company.id, faceValue: 1000, quantity: 6000 + index * 4000,
      termYears, issueYear: year - 1, maturityYear: year + termYears - 1,
      couponRate: 4.8 + index * 1.15, rating: company.bondRating,
      marketPrice: 96 + index * 2.5, holderId: null, defaulted: false,
    };
  });
}

import type { PublicFacility } from './types';

const FACILITY_TYPES: Array<{ type: PublicFacility['type']; name: string; cost: number; reach: number }> = [
  { type: 'city_hall', name: 'City Hall', cost: 4500000, reach: 18 },
  { type: 'police_station', name: 'Police Station', cost: 2200000, reach: 12 },
  { type: 'fire_department', name: 'Fire Department', cost: 1800000, reach: 10 },
  { type: 'public_school', name: 'Public School', cost: 1500000, reach: 8 },
  { type: 'public_hospital', name: 'Public Hospital', cost: 3800000, reach: 14 },
  { type: 'public_park', name: 'Public Park', cost: 600000, reach: 6 },
  { type: 'library', name: 'Public Library', cost: 900000, reach: 7 },
];

function generatePublicFacilities(cities: City[], rand: () => number): PublicFacility[] {
  const facilities: PublicFacility[] = [];
  for (const city of cities) {
    // Every city gets a city hall, police, fire dept. Bigger cities get more.
    const cityFacilityTypes: PublicFacility['type'][] = ['city_hall', 'police_station', 'fire_department'];
    if (city.population > 500000) cityFacilityTypes.push('public_school', 'public_hospital');
    if (city.population > 1500000) cityFacilityTypes.push('public_park', 'library');
    if (city.population > 5000000) cityFacilityTypes.push('police_station', 'public_school', 'public_park');

    for (let i = 0; i < cityFacilityTypes.length; i++) {
      const fType = cityFacilityTypes[i];
      const template = FACILITY_TYPES.find(ft => ft.type === fType)!;
      // Spread facilities around center in a ring pattern, avoiding roads
      const angle = (i / cityFacilityTypes.length) * Math.PI * 2 + rand() * 0.5;
      const radius = 5 + rand() * 7;
      const [fx, fy] = snapOffRoad(city, Math.round(city.x + Math.cos(angle) * radius), Math.round(city.y + Math.sin(angle) * radius));

      facilities.push({
        id: generateId(),
        type: fType,
        name: `${city.name} ${template.name}`,
        cityId: city.id,
        x: fx,
        y: fy,
        funding: 0.6 + rand() * 0.3,
        trainingLevel: 30 + rand() * 40,
        equipmentLevel: 25 + rand() * 45,
        serviceReach: template.reach,
        operatingCost: template.cost * 0.02 / 12,
      });
    }
  }
  return facilities;
}

/** Place AI-owned apartments and commercial buildings off-road in each city. */
function generateRentalBuildings(
  cities: City[],
  companies: Company[],
  products: Product[],
  buildings: Building[],
  rand: () => number,
) {
  const aiCompanies = companies.filter(c => !c.isPlayer);
  if (aiCompanies.length === 0) return;

  for (const city of cities) {
    // Generous residential stock so every city reads as lived-in at start.
    const popMillions = city.population / 1000000;
    const numApartments = Math.floor(6 + popMillions * 1.8 + rand() * 5);
    const numCommercial = Math.floor(3 + popMillions * 0.9 + rand() * 3);

    for (let i = 0; i < numApartments + numCommercial; i++) {
      const type: BuildingType = i < numApartments ? 'apartment' : 'commercial';
      const owner = aiCompanies[Math.floor(rand() * aiCompanies.length)];
      // Place 5-12 tiles from center, snapped off road centrelines
      const angle = rand() * Math.PI * 2;
      const radius = 5 + rand() * 7;
      let bx = Math.round(city.x + Math.cos(angle) * radius);
      let by = Math.round(city.y + Math.sin(angle) * radius);
      [bx, by] = snapOffRoad(city, bx, by);
      // Check not overlapping existing buildings
      const occupied = buildings.some(b => Math.hypot(b.x - bx, b.y - by) < 2.5);
      if (occupied) continue;

      const building = createBuilding(type, owner.id, city, products, 0, bx, by);
      building.occupancy = 40 + rand() * 50;
      building.rentMultiplier = 0.85 + rand() * 0.3;
      buildings.push(building);
      owner.buildings.push(building.id);
    }
  }
}

export function createNewGame(seed: number = 1337, playerName: string = 'Your Corporation', scenario: string = 'standard'): GameState {
  const rand = mulberry32(seed);
  const size = 200; // doubled from 100
  const products = generateProducts(rand);
  const cities = generateCities(rand, size);
  const companies = generateCompanies(rand, playerName);
  const buildings = generateInitialBuildings(cities, companies, products, 0);
  const playerCompany = companies[0];
  const goals = generateGoals(playerCompany);
  const startYear = scenario === 'shanghai1990' ? 1990 : scenario === 'techboom' ? 2004 : 2000;
  const technologies = generateTechnologies();
  const softwareProducts = generateSoftwareProducts(technologies);
  const talentSystem: GameState['digitalAge']['talentSystem'] = 'full';
  const talents = generateTalentPool(cities, technologies, rand, talentSystem);

  // Seed each city with a modest baseline of connectivity so the sector can start.
  for (const city of cities) {
    city.bandwidthCapacity = city.population * 0.04;
    city.internetUsers = city.bandwidthCapacity * 0.25;
  }

  // A specialist AI brings the first operating system to market shortly after start.
  const osSeed = softwareProducts.find(item => item.softwareClass === 'Operating System');
  const techCompany = companies.find(company => !company.isPlayer);
  if (osSeed && techCompany) {
    osSeed.ownerId = techCompany.id;
    osSeed.version = 1;
    osSeed.techLevel = 32;
    osSeed.quality = 45;
    osSeed.releasedYear = startYear + 1;
    osSeed.lastReleaseYear = startYear + 1;
    osSeed.installedBase = 250_000;
    for (const requirement of osSeed.requirements) {
      const technology = technologies.find(tech => tech.id === requirement.technologyId);
      if (!technology) continue;
      technology.levels[techCompany.id] = requirement.requiredLevel + 5;
      technology.topLevel = requirement.requiredLevel + 5;
      technology.topHolderId = techCompany.id;
    }
  }

  invalidateRoadCache();

  // Generate public facilities for each city
  const publicFacilities = generatePublicFacilities(cities, rand);

  // Generate extra rental buildings at start
  generateRentalBuildings(cities, companies, products, buildings, rand);

  return {
    technologies,
    publicFacilities,
    lastOffer: null,
    softwareProducts,
    softwareProjects: [],
    talents,
    digitalAge: {
      enabled: true,
      softwareRevenueIndex: 100,
      internetRevenueIndex: 100,
      talentSystem,
      disruptionToTraditionalMedia: true,
      maxEcommerceShare: 0.45,
    },
    id: generateId(),
    tick: 0,
    speed: 1,
    year: startYear,
    month: 1,
    day: 1,
    hour: 8,
    timeOfDay: 0.33,
    season: 'winter',
    dayOfYear: 0,
    player: {
      name: 'CEO',
      companyId: playerCompany.id,
      cash: 5000000,
      salary: 500000,
      netWorth: 55000000,
      knowledgePoints: 0,
      expertise: {},
    },
    cities,
    companies,
    buildings,
    products,
    stockMarket: {
      index: 10000,
      indexHistory: Array.from({ length: 120 }, (_, i) => 8000 + Math.sin(i / 10) * 1500 + i * 18),
      sentiment: 'neutral',
      interestRate: 5,
      inflationRate: 2,
      volume: 1000000,
      ticker: [
        { id: generateId(), text: 'Markets open on a cautious note as investors await Fed decision', type: 'info', tick: 0 },
      ],
    },
    economy: {
      gdpGrowth: 2.5,
      inflation: 2,
      interestRate: 5,
      consumerConfidence: 65,
      businessConfidence: 60,
      cycle: 'growth',
      cycleMonth: 0,
      taxRate: 25,
      unemployment: 5,
      purchasingPowerIndex: 100,
      realEstateBubble: 12,
      moneySupply: 100,
    },
    notifications: [{
      id: generateId(),
      message: `Welcome to Capital Game! ${scenario === 'shanghai1990' ? 'You start in 1990 Shanghai.' : 'Your business empire awaits.'}`,
      type: 'info',
      tick: 0,
    }],
    selectedBuilding: null,
    selectedCity: null,
    camera: { x: cities[0]?.x ?? 100, y: cities[0]?.y ?? 100, zoom: 0.8 },
    mapSize: size,
    seed,
    goals,
    overlay: 'none',
    paused: false,
    freight: [],
    bonds: generateInitialBonds(companies, startYear),
    bankOffers: generateBankOffers(companies, rand),
    executives: generateExecutives(),
    researchProjects: [],
    landHoldings: [],
    replayHistory: [],
    tutorialStep: 0,
    scoutingComplete: false,
    technologyDisruption: true,
    inverseInflation: false,
    scenario,
  };
}

// ============= MAP GENERATION =============

export function generateMap(state: GameState): IsometricTile[][] {
  const size = state.mapSize;
  const tiles: IsometricTile[][] = [];
  const seed = state.seed;

  for (let y = 0; y < size; y++) {
    tiles[y] = [];
    for (let x = 0; x < size; x++) {
      // Multi-octave noise
      const elevation = fbm(seed, x, y, 5, 22, 0.55);
      const moisture = fbm(seed + 9999, x, y, 4, 18, 0.5);

      // Determine biome
      let type: IsometricTile['type'] = 'grass';
      if (elevation < 0.32) {
        type = 'water';
      } else if (elevation < 0.36) {
        type = 'beach';
      } else if (elevation > 0.72) {
        type = moisture > 0.55 ? 'snow' : 'mountain';
      } else if (elevation > 0.58) {
        type = 'hills';
      } else if (moisture < 0.4 && elevation > 0.45) {
        type = 'desert';
      } else if (moisture > 0.6) {
        type = 'forest';
      } else {
        type = 'grass';
      }

      // Cities override biome with road grid — radius matches CITY_ROAD_RADIUS from roads.ts
      let cityId: string | null = null;
      for (const city of state.cities) {
        const dist = Math.hypot(x - city.x, y - city.y);
        if (dist < 18) { // slightly larger than CITY_ROAD_RADIUS to include outskirts
          cityId = city.id;
          break;
        }
      }
      if (cityId && type === 'water') type = 'grass';

      // Resource node placement (deterministic by noise)
      let resource: ResourceNode | null = null;
      const tileRandom = hash2d(seed + 31337)(x, y);
      const detailRandom = hash2d(seed + 8911)(x, y);
      if (type === 'mountain' && elevation > 0.74 && tileRandom < 0.18) {
        const kinds: ResourceNode['type'][] = ['iron', 'coal', 'gold', 'lithium', 'silica'];
        resource = { type: kinds[Math.floor(detailRandom * kinds.length)], amount: 800 + detailRandom * 1200, maxAmount: 2000 };
      } else if (type === 'forest' && moisture > 0.65 && tileRandom < 0.12) {
        resource = { type: 'timber', amount: 600 + detailRandom * 1000, maxAmount: 1500 };
      } else if (type === 'hills' && tileRandom < 0.08) {
        resource = { type: detailRandom > 0.5 ? 'coal' : 'iron', amount: 500 + detailRandom * 800, maxAmount: 1200 };
      } else if (type === 'desert' && tileRandom < 0.06) {
        resource = { type: 'oil', amount: 1000 + detailRandom * 2000, maxAmount: 3000 };
      } else if (type === 'grass' && moisture > 0.45 && tileRandom < 0.04) {
        resource = { type: 'wheat', amount: 400 + detailRandom * 600, maxAmount: 1000 };
      } else if (type === 'water' && tileRandom < 0.05) {
        resource = { type: 'fish', amount: 800 + detailRandom * 1200, maxAmount: 2000 };
      }

      // Land value (higher near cities, lower on water/mountains)
      let landValue = 1;
      if (type === 'water') landValue = 0.5;
      else if (type === 'mountain' || type === 'snow') landValue = 1;
      else if (type === 'forest') landValue = 8;
      else if (type === 'hills') landValue = 6;
      else if (type === 'desert') landValue = 4;
      else landValue = 15;

      for (const city of state.cities) {
        const dist = Math.hypot(x - city.x, y - city.y);
        if (dist < 35 && type !== 'water') {
          const factor = Math.max(0, 1 - dist / 35);
          // Population density drives land value — bigger cities have pricier land
          const popMultiplier = 1 + Math.min(3, city.population / 3000000);
          // Center premium: CBD land is dramatically more expensive
          const centerPremium = dist < 5 ? 2.5 : dist < 10 ? 1.6 : 1;
          landValue = Math.max(landValue, (5 + factor * 95) * popMultiplier * centerPremium);
        }
      }

      tiles[y][x] = {
        x,
        y,
        type,
        elevation,
        landValue,
        cityId,
        resource,
        variant: Math.floor(detailRandom * 8),
      };
    }
  }
  return tiles;
}

// ============= ENTITY GENERATION =============

/** Vehicles are spawned directly onto a street intersection. */
function spawnOnRoad(state: GameState, city: City): { x: number; y: number } {
  const network = getRoadNetwork(state, city);
  if (network.nodes.length === 0) return { x: city.x, y: city.y };
  const node = network.nodes[Math.floor(Math.random() * network.nodes.length)];
  return { x: node.x, y: node.y };
}

/** Pedestrians walk the pavement, which we model as a narrow band beside a street. */
function spawnOnPavement(state: GameState, city: City): { x: number; y: number } {
  const point = spawnOnRoad(state, city);
  const alongX = Math.random() > 0.5;
  return {
    x: point.x + (alongX ? (Math.random() - 0.5) * 4 : (Math.random() > 0.5 ? 1 : -1) * 0.9),
    y: point.y + (alongX ? (Math.random() > 0.5 ? 1 : -1) * 0.9 : (Math.random() - 0.5) * 4),
  };
}

export function generateEntities(state: GameState): MovingEntity[] {
  const entities: MovingEntity[] = [];
  const carColors = ['#ef4444', '#3b82f6', '#fbbf24', '#10b981', '#f97316', '#a855f7', '#1abc9c', '#f5f5f5', '#475569', '#ec4899'];

  for (const city of state.cities) {
    const popFactor = city.population / 1000000;
    const numCars = Math.min(40, Math.max(2, Math.floor(popFactor * 4) + 3));
    const numPeople = Math.min(50, Math.max(5, Math.floor(popFactor * 5) + 8));
    const numTrucks = Math.min(15, Math.max(1, Math.floor(popFactor * 1.2) + 1));

    for (let i = 0; i < numCars; i++) {
      const start = spawnOnRoad(state, city);
      entities.push({
        id: generateId(), type: 'car', x: start.x, y: start.y,
        targetX: start.x, targetY: start.y,
        speed: 0.05 + Math.random() * 0.06,
        color: carColors[Math.floor(Math.random() * carColors.length)],
        direction: Math.floor(Math.random() * 4), pathIndex: 0, path: [],
      });
    }
    for (let i = 0; i < numPeople; i++) {
      const start = spawnOnPavement(state, city);
      entities.push({
        id: generateId(), type: 'person', x: start.x, y: start.y,
        targetX: start.x, targetY: start.y,
        speed: 0.012 + Math.random() * 0.015,
        color: `hsl(${Math.random() * 360}, 65%, 55%)`,
        direction: Math.floor(Math.random() * 4), pathIndex: 0, path: [],
      });
    }
    for (let i = 0; i < numTrucks; i++) {
      const start = spawnOnRoad(state, city);
      entities.push({
        id: generateId(), type: 'truck', x: start.x, y: start.y,
        targetX: start.x, targetY: start.y,
        speed: 0.03 + Math.random() * 0.03,
        color: '#d97706',
        direction: Math.floor(Math.random() * 4), pathIndex: 0, path: [],
      });
    }
  }
  return entities;
}

/** Cached freight polylines so we do not re-run BFS every animation frame. */
const freightPathCache = new Map<string, Array<[number, number]>>();

function nearestCityTo(state: GameState, x: number, y: number): City {
  let best = state.cities[0];
  let bestDistance = Infinity;
  for (const city of state.cities) {
    const distance = Math.hypot(city.x - x, city.y - y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = city;
    }
  }
  return best;
}

function faceTowards(entity: MovingEntity, dx: number, dy: number) {
  if (Math.abs(dx) > Math.abs(dy)) entity.direction = dx > 0 ? 1 : 3;
  else entity.direction = dy > 0 ? 2 : 0;
}

/**
 * Vehicles advance along a precomputed list of street waypoints. Because every
 * waypoint is an intersection (or a kerbside bay one tile off an intersection)
 * and consecutive waypoints are always orthogonally adjacent, the interpolated
 * position can never leave the road surface.
 */
export function updateEntities(entities: MovingEntity[], state: GameState): void {
  const speedMul = state.paused ? 0 : state.speed;
  if (speedMul === 0) return;

  const routesByTruck = new Map(state.freight.map(route => [route.truckId, route]));
  const buildingsById = new Map(state.buildings.map(building => [building.id, building]));

  // Retire trucks whose freight route has completed.
  for (let index = entities.length - 1; index >= 0; index--) {
    const entity = entities[index];
    if (entity.type === 'freight_truck' && !routesByTruck.has(entity.id)) {
      freightPathCache.delete(entity.id);
      entities.splice(index, 1);
    }
  }

  // Spawn a truck for any freight route that does not have one yet.
  const existingIds = new Set(entities.map(entity => entity.id));
  for (const route of state.freight) {
    if (existingIds.has(route.truckId)) continue;
    const supplier = buildingsById.get(route.fromBuildingId);
    const buyer = buildingsById.get(route.toBuildingId);
    if (!supplier || !buyer) continue;
    const polyline = buildFreightPolyline(state, supplier, buyer);
    freightPathCache.set(route.truckId, polyline);
    const origin = polyline[0] ?? [supplier.x, supplier.y];
    entities.push({
      id: route.truckId, type: 'freight_truck', x: origin[0], y: origin[1],
      targetX: buyer.x, targetY: buyer.y, speed: 0.05, color: '#dc2626', direction: 1,
      pathIndex: 0, path: polyline, fromBuildingId: supplier.id, toBuildingId: buyer.id,
      cargo: { kind: 'raw', category: state.products.find(product => product.id === route.good)?.name || 'Freight' },
    });
  }

  for (const entity of entities) {
    // --- Freight trucks: driven by their route's delivery progress. ---
    if (entity.type === 'freight_truck') {
      const route = routesByTruck.get(entity.id);
      if (!route) continue;
      let polyline = freightPathCache.get(entity.id);
      if (!polyline) {
        const supplier = buildingsById.get(route.fromBuildingId);
        const buyer = buildingsById.get(route.toBuildingId);
        if (!supplier || !buyer) continue;
        polyline = buildFreightPolyline(state, supplier, buyer);
        freightPathCache.set(entity.id, polyline);
      }
      const position = samplePolyline(polyline, route.progress / 100);
      faceTowards(entity, position.x - entity.x, position.y - entity.y);
      entity.x = position.x;
      entity.y = position.y;
      continue;
    }

    // --- Pedestrians: short walks along the pavement band beside a street. ---
    if (entity.type === 'person') {
      const dx = entity.targetX - entity.x;
      const dy = entity.targetY - entity.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 0.35) {
        const destination = spawnOnPavement(state, nearestCityTo(state, entity.x, entity.y));
        entity.targetX = destination.x;
        entity.targetY = destination.y;
        faceTowards(entity, destination.x - entity.x, destination.y - entity.y);
      } else {
        const step = (entity.speed * speedMul) / distance;
        entity.x += dx * step;
        entity.y += dy * step;
      }
      continue;
    }

    // --- Cars, trucks and buses: strict waypoint following on the road graph. ---
    if (entity.path.length === 0 || entity.pathIndex >= entity.path.length) {
      const city = nearestCityTo(state, entity.x, entity.y);
      const network = getRoadNetwork(state, city);
      const route = randomRoadRoute(network, entity.x, entity.y);
      if (route.length === 0) continue;
      entity.path = route;
      entity.pathIndex = 0;
      // Snap onto the first waypoint so we never drift in from off-road.
      const snap = nearestNode(network, entity.x, entity.y);
      if (snap && Math.hypot(snap.x - entity.x, snap.y - entity.y) > 2.5) {
        entity.x = snap.x;
        entity.y = snap.y;
      }
    }

    const [waypointX, waypointY] = entity.path[entity.pathIndex];
    const dx = waypointX - entity.x;
    const dy = waypointY - entity.y;
    const distance = Math.hypot(dx, dy);
    const step = entity.speed * speedMul;

    if (distance <= step || distance < 0.02) {
      // Land exactly on the waypoint, then advance to the next segment.
      entity.x = waypointX;
      entity.y = waypointY;
      entity.pathIndex += 1;
      if (entity.pathIndex < entity.path.length) {
        faceTowards(entity, entity.path[entity.pathIndex][0] - entity.x, entity.path[entity.pathIndex][1] - entity.y);
      }
    } else {
      entity.x += (dx / distance) * step;
      entity.y += (dy / distance) * step;
      faceTowards(entity, dx, dy);
    }
    entity.targetX = waypointX;
    entity.targetY = waypointY;
  }
}

// ============= GAME SIMULATION =============

export function simulateTick(state: GameState): GameState {
  const newState = { ...state, tick: state.tick + 1 };

  // Advance time
  newState.hour += 1;
  if (newState.hour >= 24) {
    newState.hour = 0;
    newState.day += 1;
    newState.dayOfYear += 1;
    if (newState.dayOfYear >= 365) {
      newState.dayOfYear = 0;
    }
    if (newState.day > 30) {
      newState.day = 1;
      newState.month += 1;
      simulateMonthly(newState);
      if (newState.month > 12) {
        newState.month = 1;
        newState.year += 1;
        simulateYearly(newState);
      }
    }
  }
  newState.timeOfDay = newState.hour / 24;
  newState.season = (newState.dayOfYear < 90 ? 'winter' :
                      newState.dayOfYear < 180 ? 'spring' :
                      newState.dayOfYear < 270 ? 'summer' : 'autumn');

  // One shared index per tick replaces thousands of Array.find / filter scans.
  const index = buildStateIndex(newState);

  simulateEconomy(newState);
  simulateFreightRoutes(newState);
  simulateCompanies(newState, index);
  simulateBuildings(newState, index);
  simulateDigitalHourly(newState, index);
  simulateCities(newState, index);
  simulateStockMarket(newState);
  simulateGoals(newState);
  updateNewsTicker(newState);

  return newState;
}

function simulateMonthly(state: GameState): void {
  const playerCompany = state.companies.find(c => c.isPlayer);
  if (playerCompany) {
    const monthlySalary = state.player.salary / 12;
    playerCompany.cash -= monthlySalary;
    playerCompany.expenses += monthlySalary;
    state.player.cash += monthlySalary;
  }

  // AI actions
  for (const company of state.companies) {
    if (company.isPlayer) continue;
    simulateAICompany(state, company);
  }

  refreshSupplyNetworks(state);
  simulateResearch(state);
  simulateProductLifecycle(state);
  updateLandValues(state);
  simulateDigitalMonthly(state);
  simulateAiTechCompanies(state, state.companies);

  if (playerCompany) {
    state.replayHistory.push({
      year: state.year,
      month: state.month,
      cash: playerCompany.cash,
      netWorth: state.player.netWorth,
      revenue: playerCompany.revenue * 24 * 30,
      profit: playerCompany.profit * 24 * 30,
      gdpGrowth: state.economy.gdpGrowth,
      inflation: state.economy.inflation,
    });
    if (state.replayHistory.length > 600) state.replayHistory.shift();
  }

  // Debt interest
  for (const company of state.companies) {
    if (company.debt > 0) {
      const interest = (company.debt * company.interestRate) / 100 / 12;
      company.cash -= interest;
      company.expenses += interest;
      if (company.cash < 0) {
        company.bondRating = downgradeRating(company.bondRating);
      }
    }
  }

  for (const bond of state.bonds) {
    if (bond.defaulted) continue;
    const issuer = state.companies.find(company => company.id === bond.issuerId);
    if (!issuer) continue;
    const monthlyCoupon = bond.faceValue * bond.quantity * (bond.couponRate / 100) / 12;
    issuer.cash -= monthlyCoupon;
    issuer.expenses += monthlyCoupon;
  }

  // Quarterly news
  if (state.month % 3 === 0) {
    addNewsTicker(state, generateQuarterlyNews(state), 'info');
  }
}

function simulateYearly(state: GameState): void {
  if (state.technologyDisruption) {
    for (const product of state.products) {
      product.techLevel = Math.max(1, product.techLevel * 0.9);
    }
  }

  for (const bond of state.bonds) {
    if (bond.defaulted || bond.maturityYear > state.year) continue;
    const issuer = state.companies.find(company => company.id === bond.issuerId);
    const redemption = bond.faceValue * bond.quantity;
    if (!issuer || issuer.cash < redemption) {
      bond.defaulted = true;
      if (issuer) issuer.bondRating = 'D';
      addNewsTicker(state, `${issuer?.name || 'A corporation'} defaults on maturing bonds`, 'danger');
    } else {
      issuer.cash -= redemption;
      bond.marketPrice = 0;
    }
  }

  addNewsTicker(state, `Year ${state.year} begins. New opportunities emerge.`, 'info');
}

function downgradeRating(r: Company['bondRating']): Company['bondRating'] {
  const order: Company['bondRating'][] = ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC', 'CC', 'C', 'D'];
  const idx = order.indexOf(r);
  return order[Math.min(order.length - 1, idx + 1)] || r;
}

function generateQuarterlyNews(_state: GameState): string {
  const headlines = [
    'Central bank signals cautious outlook amid mixed economic data',
    'Consumer spending hits record high as confidence surges',
    'New trade agreements open markets in emerging economies',
    'Tech sector leads gains as innovation accelerates',
    'Manufacturing PMI rises for third consecutive month',
    'Retail sales exceed analyst expectations',
    'Energy prices stabilize after volatile quarter',
    'Property markets cool as interest rates climb',
  ];
  return headlines[Math.floor(Math.random() * headlines.length)];
}

function simulateEconomy(state: GameState): void {
  const eco = state.economy;
  eco.cycleMonth += 1 / (24 * 30);

  if (eco.cycleMonth > 36 + Math.random() * 48) {
    eco.cycleMonth = 0;
    const cycles: Economy['cycle'][] = ['boom', 'growth', 'recession', 'recovery'];
    const idx = cycles.indexOf(eco.cycle);
    const newCycle = cycles[(idx + 1) % 4];
    eco.cycle = newCycle;
    addNotification(state, {
      id: generateId(),
      message: `Economy entering ${newCycle} phase`,
      type: newCycle === 'recession' ? 'warning' : newCycle === 'boom' ? 'success' : 'info',
      tick: state.tick,
    });
    addNewsTicker(state, `Economy officially enters ${newCycle} phase`, newCycle === 'recession' ? 'warning' : 'info');
  }

  const cycleEffects: Record<string, { gdp: number, inflation: number, confidence: number }> = {
    boom: { gdp: 0.02, inflation: 0.01, confidence: 0.3 },
    growth: { gdp: 0.01, inflation: 0.005, confidence: 0.1 },
    recession: { gdp: -0.015, inflation: -0.005, confidence: -0.3 },
    recovery: { gdp: 0.005, inflation: 0.002, confidence: 0.2 },
  };
  const e = cycleEffects[eco.cycle];
  eco.gdpGrowth = Math.max(-6, Math.min(9, eco.gdpGrowth + (e.gdp + (Math.random() - 0.5) * 0.01) / 24));
  eco.inflation = Math.max(-2, Math.min(16, eco.inflation + (e.inflation + (Math.random() - 0.5) * 0.005) / 24));
  eco.consumerConfidence = Math.max(10, Math.min(95, eco.consumerConfidence + (e.confidence + (Math.random() - 0.5) * 1.5) / 24));
  eco.businessConfidence = Math.max(10, Math.min(95, eco.businessConfidence + (e.confidence + (Math.random() - 0.5) * 1.5) / 24));

  // Taylor Rule: r = r* + π + 0.5(π − π*) + 0.25·(GDP gap proxy)
  const inflationGap = eco.inflation - 2.0; // 2% target
  const outputGap = eco.gdpGrowth - 2.5;    // potential-growth proxy
  const taylorTarget = Math.max(0.25, 2 + eco.inflation + 0.5 * inflationGap + 0.25 * outputGap);
  eco.interestRate += (taylorTarget - eco.interestRate) * 0.18;
  eco.interestRate = Math.max(0.25, Math.min(20, eco.interestRate));

  state.stockMarket.interestRate = eco.interestRate;
  state.stockMarket.inflationRate = eco.inflation;
  eco.moneySupply = Math.max(60, Math.min(180, eco.moneySupply + (eco.interestRate < 3 ? 0.01 : -0.004)));
  eco.realEstateBubble = Math.max(0, Math.min(100,
    eco.realEstateBubble + (eco.gdpGrowth > 4 && eco.interestRate < 4 ? 0.025 : -0.006)
  ));
  if (state.inverseInflation) {
    eco.purchasingPowerIndex *= 1 - (eco.inflation / 100) / (24 * 365);
  }
}

function simulateCompanies(state: GameState, index: StateIndex): void {
  // Bucket land holdings once instead of re-filtering per company.
  const landByCompany = new Map<string, number>();
  for (const land of state.landHoldings) {
    landByCompany.set(land.companyId, (landByCompany.get(land.companyId) ?? 0) + land.currentValue);
  }

  for (const company of state.companies) {
    const companyBuildings = index.buildingsByCompany.get(company.id) ?? [];
    let totalRevenue = 0;
    let totalExpenses = 0;
    let bookValue = 0;
    for (const building of companyBuildings) {
      bookValue += building.constructionCost + building.landValue;
      if (building.isOperating) {
        totalRevenue += building.revenue;
        totalExpenses += building.operatingCost;
      }
    }
    company.revenue = totalRevenue;
    company.expenses = totalExpenses;
    company.profit = totalRevenue - totalExpenses;
    company.cash += company.profit;

    company.totalAssets = company.cash + company.intangibleTechnology + bookValue
      + (landByCompany.get(company.id) ?? 0);

    company.marketCap = company.sharePrice * company.sharesOutstanding;

    if (company.isPlayer) {
      state.player.netWorth = state.player.cash +
        (company.sharesOwned / company.sharesOutstanding) * company.marketCap;
    }
  }
}

function getProduct(state: GameState, productId: string | null) {
  return productId ? state.products.find(product => product.id === productId) : undefined;
}

/** Spatial-hash version: only scans buildings in nearby grid cells. */
function locationTraffic(state: GameState, city: City, x: number, y: number, index?: StateIndex) {
  const centerDistance = Math.hypot(x - city.x, y - city.y);
  const centerTraffic = Math.max(4, city.trafficLevel * Math.exp(-centerDistance / 11));
  const nearby = index
    ? queryRadius(index, x, y, 7).filter(building => building.cityId === city.id)
    : state.buildings.filter(building => building.cityId === city.id && Math.hypot(building.x - x, building.y - y) < 7);
  let density = 0;
  for (const building of nearby) {
    density += building.type === 'apartment' ? 6
      : building.type === 'commercial' ? 5
      : building.type === 'retail_store' ? 4 : 1;
  }
  return Math.min(100, centerTraffic + density);
}

function amenityScores(state: GameState, building: Building, index?: StateIndex) {
  const nearby = index
    ? queryRadius(index, building.x, building.y, 9)
    : state.buildings.filter(other => Math.hypot(other.x - building.x, other.y - building.y) < 9);

  let community = 12;
  let sports = 10;
  let shopping = 8;
  for (const other of nearby) {
    if (other.id === building.id) continue;
    switch (other.type) {
      case 'civic_hospital': community += 28; break;
      case 'civic_school': community += 22; break;
      case 'civic_museum': community += 14; break;
      case 'civic_stadium': sports += 32; break;
      case 'civic_park': sports += 18; break;
      case 'retail_store': shopping += 15; break;
      default: break;
    }
  }
  return {
    community: Math.min(100, community),
    sports: Math.min(100, sports),
    shopping: Math.min(100, shopping),
  };
}

function productRating(product: Product, priceMultiplier: number) {
  const priceScore = Math.max(0, 100 - Math.max(0, priceMultiplier - 0.55) * 65);
  return (
    priceScore * product.priceWeight +
    product.quality * product.qualityWeight +
    product.brand * product.brandWeight
  ) / 100;
}

function createFreightRoute(state: GameState, supplier: Building, buyer: Building, productId: string, amount: number, freightCost: number) {
  const duplicate = state.freight.some(route =>
    route.fromBuildingId === supplier.id && route.toBuildingId === buyer.id && route.good === productId && route.status !== 'delivered'
  );
  if (duplicate) return;
  const distance = Math.max(1, Math.hypot(supplier.x - buyer.x, supplier.y - buyer.y));
  state.freight.push({
    id: generateId(),
    fromBuildingId: supplier.id,
    toBuildingId: buyer.id,
    good: productId,
    amount,
    progress: 0,
    truckId: generateId(),
    distance,
    freightCost,
    status: 'loading',
  });
  if (state.freight.length > 80) state.freight.splice(0, state.freight.length - 80);
}

function refreshBuildingSupply(state: GameState, building: Building) {
  const product = getProduct(state, building.productId);
  if (!product) return;
  const neededProducts = building.type === 'factory'
    ? product.inputs.map(input => input.productId)
    : building.type === 'retail_store' || building.type === 'warehouse' || building.type === 'internet_ecommerce'
      ? [product.id]
      : [];
  if (neededProducts.length === 0) return;

  building.supplierLinks = neededProducts.flatMap(productId => {
    const inputProduct = state.products.find(item => item.id === productId);
    if (!inputProduct) return [];
    const offers = state.buildings
      .filter(supplier => supplier.id !== building.id && supplier.products.includes(productId))
      .filter(supplier => supplier.type === 'seaport' || supplier.type === 'farm' || supplier.type === 'mine' || supplier.type === 'factory' || supplier.type === 'warehouse')
      .filter(supplier => !supplier.internalSale || supplier.companyId === building.companyId)
      .map(supplier => {
        const distance = Math.max(1, Math.hypot(supplier.x - building.x, supplier.y - building.y));
        // Freight = distance × (fuel burn × diesel price) + hours driven × driver wage.
        // Diesel tracks inflation in a $3.50–$5.00/gal band; trucking is ~60 km/h.
        const dieselPrice = Math.max(3.5, Math.min(5.0, 3.5 + state.economy.inflation * 0.45));
        const fuelCost = distance * 0.06 * dieselPrice;
        const driverWage = state.cities.find(c => c.id === supplier.cityId)?.wageRate ?? 15;
        const timeCost = (distance / 60) * driverWage;
        const terrainPremium = supplier.cityId === building.cityId ? 1 : 1.35;
        const freightPerUnit = (fuelCost + timeCost) * terrainPremium * Math.max(0.25, inputProduct.productionCost * 0.008);
        const pricePerUnit = inputProduct.productionCost * (supplier.companyId === 'system' ? 1.28 : 0.9 + supplier.trainingLevel * 0.025);
        const quality = Math.min(100, inputProduct.quality + supplier.trainingLevel * 2.2);
        return { supplier, pricePerUnit, freightPerUnit, quality, score: pricePerUnit + freightPerUnit - quality * 0.12 };
      })
      .sort((a, b) => a.score - b.score);
    const best = offers[0];
    if (!best) return [];
    const link = {
      productId,
      supplierBuildingId: best.supplier.id,
      pricePerUnit: best.pricePerUnit,
      freightPerUnit: best.freightPerUnit,
      quality: best.quality,
    };
    const inventory = building.inventory[productId] || 0;
    if (inventory < building.inventoryCapacity * 0.35) {
      const amount = Math.min(building.inventoryCapacity * 0.35, Math.max(20, building.capacity * 0.18));
      createFreightRoute(state, best.supplier, building, productId, amount, best.freightPerUnit * amount);
    }
    return [link];
  });
  building.freightCost = building.supplierLinks.reduce((sum, link) => sum + link.freightPerUnit, 0);
  building.inputCost = building.supplierLinks.reduce((sum, link) => sum + link.pricePerUnit, 0);
}

function refreshSupplyNetworks(state: GameState) {
  for (const building of state.buildings) refreshBuildingSupply(state, building);
}

function simulateFreightRoutes(state: GameState) {
  const completed: string[] = [];
  for (const route of state.freight) {
    const supplier = state.buildings.find(building => building.id === route.fromBuildingId);
    const buyer = state.buildings.find(building => building.id === route.toBuildingId);
    const product = state.products.find(item => item.id === route.good);
    if (!supplier || !buyer || !product) {
      completed.push(route.id);
      continue;
    }
    route.status = 'in_transit';
    route.progress = Math.min(100, route.progress + Math.max(1.2, 100 / Math.max(5, route.distance * 1.4)));
    if (route.progress < 100) continue;

    const available = supplier.companyId === 'system'
      ? route.amount
      : Math.min(route.amount, supplier.inventory[route.good] || route.amount * 0.5);
    if (available > 0) {
      buyer.inventory[route.good] = Math.min(buyer.inventoryCapacity, (buyer.inventory[route.good] || 0) + available);
      if (supplier.companyId !== 'system') supplier.inventory[route.good] = Math.max(0, (supplier.inventory[route.good] || 0) - available);
      const link = buyer.supplierLinks.find(item => item.productId === route.good && item.supplierBuildingId === supplier.id);
      const goodsCost = available * (link?.pricePerUnit || product.productionCost);
      const buyerCompany = state.companies.find(company => company.id === buyer.companyId);
      const supplierCompany = state.companies.find(company => company.id === supplier.companyId);
      if (buyerCompany) buyerCompany.cash -= goodsCost + route.freightCost;
      if (supplierCompany && supplierCompany.id !== buyerCompany?.id) supplierCompany.cash += goodsCost;
    }
    route.status = 'delivered';
    completed.push(route.id);
  }
  state.freight = state.freight.filter(route => !completed.includes(route.id));
}

function simulateResearch(state: GameState) {
  const cto = state.executives.find(executive => executive.role === 'CTO' && executive.hired);
  for (const project of state.researchProjects.filter(item => item.active && !item.completed)) {
    const product = state.products.find(item => item.id === project.productId);
    if (!product) continue;
    const centers = state.buildings.filter(building =>
      building.companyId === project.companyId &&
      (building.type === 'rd_center' || building.type === 'software_company') &&
      building.researchProjectId === project.id
    );
    const trainingPower = centers.reduce((sum, center) => sum + center.trainingLevel * (0.6 + center.trainingBudget), 0);
    const expertise = cto?.expertise[product.category] || cto?.expertise.Computers || 0;
    project.progress += Math.max(0.5, trainingPower * (1 + expertise / 100));
    centers.forEach(center => { center.researchProgress = project.progress; });
    if (project.progress < 100) continue;
    project.progress = 100;
    project.active = false;
    project.completed = true;
    product.techLevel = Math.max(product.techLevel, project.targetTech);
    product.quality = Math.min(100, product.quality + 8);
    const company = state.companies.find(item => item.id === project.companyId);
    if (company) company.intangibleTechnology += product.productionCost * project.targetTech * 12000;
    addNewsTicker(state, `${company?.name || 'A company'} completes a technology breakthrough in ${product.name}`, 'breaking');
  }
}

function simulateProductLifecycle(state: GameState) {
  for (const product of state.products) {
    const replacement = product.replacementName
      ? state.products.find(item => item.name === product.replacementName)
      : undefined;
    const replacementOnMarket = replacement && state.year >= replacement.unlockYear && state.buildings.some(building => building.productId === replacement.id);
    if (replacementOnMarket) {
      product.demandShift = Math.min(product.maxDemandShift, product.demandShift + 0.55);
      product.obsolete = product.demandShift >= 90;
    }
    const confidence = state.economy.consumerConfidence / 100;
    product.marketDemand = Math.max(2, Math.min(100,
      product.demandIndex * 0.55 + confidence * 45 - product.demandShift * 0.7
    ));
    // Markup-chain pricing: Final Price = (RawCost × (1 + ValueAdd)) × (1 + RetailMargin) + Freight.
    // Labour cost is folded into production at the prevailing average wage.
    const avgWage = state.cities.reduce((sum, city) => sum + city.wageRate, 0) / Math.max(1, state.cities.length);
    const labourComponent = avgWage * 0.35 * (product.kind === 'consumer' ? 1.6 : 1);
    const valueAdded = product.kind === 'consumer' ? 1.6 : product.kind === 'semi' ? 1.45 : 1.08;
    const retailMargin = product.kind === 'consumer' ? 0.30 : 0;
    const freightEstimate = product.productionCost * 0.09;
    const targetPrice = (product.productionCost + labourComponent) * valueAdded * (1 + retailMargin) + freightEstimate;
    product.currentPrice += (targetPrice * (1 + state.economy.inflation / 100 / 12) - product.currentPrice) * 0.08;
    product.productionCost *= 1 + state.economy.inflation / 100 / 12;
    const producers = state.buildings.filter(building => building.productId === product.id && (building.type === 'factory' || building.type === 'farm' || building.type === 'mine'));
    const playerId = state.companies.find(company => company.isPlayer)?.id;
    const playerPower = producers.filter(building => building.companyId === playerId).reduce((sum, building) => sum + building.capacity * building.trainingLevel, 0);
    const totalPower = producers.reduce((sum, building) => sum + building.capacity * building.trainingLevel, 0);
    product.playerMarketShare = totalPower > 0 ? playerPower / totalPower * 100 : 0;
  }
}

function updateLandValues(state: GameState) {
  for (const land of state.landHoldings) {
    const city = state.cities.find(item => item.id === land.cityId);
    if (!city) continue;
    const nearbyDevelopment = state.buildings.filter(building => Math.hypot(building.x - land.x, building.y - land.y) < 7).length;
    const annualizedGrowth = state.economy.inflation + Math.max(-2, state.economy.gdpGrowth) + nearbyDevelopment * 0.35;
    land.currentValue *= 1 + annualizedGrowth / 100 / 12;
  }
}

function simulateBuildings(state: GameState, index: StateIndex): void {
  const isDaytime = state.timeOfDay > 0.25 && state.timeOfDay < 0.8;
  const playerCompany = state.companies.find(company => company.isPlayer);

  for (const building of state.buildings) {
    if (!building.isOperating && building.type !== 'seaport') continue;
    const city = state.cities.find(item => item.id === building.cityId);
    if (!city) continue;
    const product = getProduct(state, building.productId);
    const wageCost = building.employees * city.wageRate / (30 * 24);
    const maintenance = building.constructionCost * 0.000015;
    const trainingCost = wageCost * building.trainingBudget * 0.5;
    building.operatingCost = wageCost + maintenance + trainingCost;
    building.revenue = 0;
    building.supply = 0;
    building.demand = 0;

    if (building.type === 'seaport') {
      building.utilization = 55 + Math.sin(state.tick / 24) * 12;
      building.products.forEach(productId => { building.inventory[productId] = 1000; });
      building.operatingCost = 0;
    } else if ((building.type === 'farm' || building.type === 'mine' || building.type === 'factory') && product) {
      const trainingEfficiency = 0.45 + building.trainingLevel / 16;
      const seasonal = building.type === 'farm'
        ? state.season === 'summer' ? 1.15 : state.season === 'winter' ? 0.55 : 0.9
        : 1;
      const inputReadiness = building.type !== 'factory' || product.inputs.length === 0
        ? 1
        : product.inputs.filter(input => (building.inventory[input.productId] || 0) >= input.quantity).length / product.inputs.length;
      const reserveFactor = building.type === 'mine' && building.resourceMax > 0
        ? Math.max(0, building.resourceRemaining / building.resourceMax)
        : 1;
      const productionUnits = building.capacity / 720 * trainingEfficiency * seasonal * inputReadiness * Math.max(0.15, reserveFactor);
      building.lastUnitsProduced = productionUnits;
      if (building.type === 'factory') {
        product.inputs.forEach(input => {
          building.inventory[input.productId] = Math.max(0, (building.inventory[input.productId] || 0) - input.quantity * productionUnits);
        });
        building.smokeAccum += productionUnits;
      }
      if (building.type === 'mine') {
        building.resourceRemaining = Math.max(0, building.resourceRemaining - productionUnits * 0.3);
        if (building.resourceRemaining <= 0) {
          building.isOperating = false;
          addNotification(state, { id: generateId(), message: `${building.name} has exhausted its reserve`, type: 'warning', tick: state.tick });
        }
      }
      building.inventory[product.id] = Math.min(building.inventoryCapacity, (building.inventory[product.id] || 0) + productionUnits);
      building.supply = productionUnits * 720;
      building.demand = product.marketDemand / 100 * building.capacity * 0.78;
      building.utilization = Math.min(100, productionUnits / Math.max(0.01, building.capacity / 720) * 100);
      const externalSaleRatio = building.internalSale ? 0 : Math.max(0, Math.min(0.45, (building.supply - building.demand * 0.6) / Math.max(1, building.supply)));
      building.revenue = productionUnits * product.currentPrice * 0.72 * externalSaleRatio;
    } else if ((building.type === 'retail_store' || building.type === 'internet_ecommerce') && product) {
      const localTraffic = building.type === 'internet_ecommerce'
        ? Math.min(100, state.cities.reduce((sum, item) => sum + item.population, 0) / 1000000 * 2.5)
        : locationTraffic(state, city, building.x, building.y, index);
      let chainCount = 0;
      for (const other of index.buildingsByCompany.get(building.companyId) ?? []) {
        if (other.cityId === building.cityId && other.type === building.type && other.productId === product.id) chainCount++;
      }
      const chainBonus = Math.min(1.45, 1 + Math.max(0, chainCount - 1) * 0.08);
      // ── CES microeconomics: demand = Base × (P/P̄)^(−ε) × (W/W̄)^(income elasticity) ──
      const necessity = product.demandIndex / 100;
      const avgWage = state.cities.reduce((sum, item) => sum + item.wageRate, 0) / Math.max(1, state.cities.length);
      const priceElasticity = necessity > 0.7 ? 0.6 : necessity > 0.4 ? 1.1 : 1.8; // inelastic necessities ↔ elastic luxuries
      const incomeElasticity = necessity > 0.7 ? 0.25 : necessity > 0.4 ? 0.9 : 1.6;
      const priceRatio = building.pricingMultiplier; // shelf price relative to market reference
      const wageRatio = city.wageRate / Math.max(1, avgWage);
      const cesDemand = Math.pow(priceRatio, -priceElasticity) * Math.pow(Math.max(0.4, wageRatio), incomeElasticity);
      const affluence = Math.max(0.45, Math.min(1.6, wageRatio));
      const incomeDemand = necessity + (1 - necessity) * affluence;
      const rating = productRating(product, building.pricingMultiplier) / 100;
      const timeFactor = building.type === 'internet_ecommerce' ? 0.8 : isDaytime ? 1 : 0.22;
      const desiredSales = building.capacity / 720 * (localTraffic / 100) * chainBonus * incomeDemand * rating * timeFactor * 5 * cesDemand;
      const available = building.inventory[product.id] || 0;
      const unitsSold = Math.min(available, desiredSales);
      const perishability = product.category === 'Food' ? 0.0022 : product.category === 'Beverage' ? 0.0012 : product.category === 'Drugs' ? 0.00055 : 0;
      const expiredUnits = Math.min(Math.max(0, available - unitsSold), Math.max(0, available - unitsSold) * perishability);
      building.inventory[product.id] = Math.max(0, available - unitsSold - expiredUnits);
      building.lastUnitsSold = unitsSold;
      building.expiredUnits = expiredUnits;
      building.spoilageLoss = expiredUnits * (building.inputCost || product.productionCost);
      building.customerTraffic = localTraffic;
      building.supply = available;
      building.demand = desiredSales * 720;
      building.utilization = Math.min(100, desiredSales / Math.max(0.01, building.capacity / 720) * 100);
      building.revenue = unitsSold * product.currentPrice * building.pricingMultiplier;
      building.operatingCost += (building.type === 'internet_ecommerce' ? 2200 / 720 : 0) + building.spoilageLoss;
      if (available < building.inventoryCapacity * 0.15 && state.tick % 24 === 0) refreshBuildingSupply(state, building);
    } else if (building.type === 'warehouse') {
      const stored = Object.values(building.inventory).reduce((sum, quantity) => sum + quantity, 0);
      building.utilization = Math.min(100, stored / building.inventoryCapacity * 100);
      building.supply = stored;
      building.demand = building.inventoryCapacity * 0.65;
      building.revenue = stored * 0.018;
    } else if (building.type === 'apartment' || building.type === 'commercial') {
      const amenity = amenityScores(state, building, index);
      building.amenityCommunity = amenity.community;
      building.amenitySports = amenity.sports;
      building.amenityShopping = amenity.shopping;
      const distanceToCbd = Math.hypot(building.x - city.x, building.y - city.y);
      const demandIndex = building.type === 'apartment' ? -city.housingDemand : -city.officeDemand;
      const locationScore = building.type === 'commercial'
        ? Math.max(15, 100 - distanceToCbd * 7)
        : amenity.community * 0.45 + amenity.sports * 0.3 + amenity.shopping * 0.25;
      // ── Real-estate anchor: rent-to-income ≈ 30% of monthly gross income ──
      const monthlyGrossIncome = city.wageRate * 173; // full-time hours/month
      const residentialMarketRent = monthlyGrossIncome * 0.30 * (building.amenityCommunity + building.amenitySports) / 200 * (0.5 + city.trafficLevel / 100);
      // ── Commercial: cap rate 4%–8% (NOI / asset value, monthlyised) ──
      const capRate = 0.04 + Math.min(0.04, city.wageRate / 45 * 0.04);
      const commercialMarketRent = (building.constructionCost + building.landValue) * capRate / 12 / Math.max(1, building.capacity);
      const marketRent = building.type === 'apartment' ? residentialMarketRent : commercialMarketRent;
      building.rentPerUnit = marketRent * building.rentMultiplier;

      const popularityPremium = 1 + Math.max(0, building.occupancy - 70) * 0.015;
      const densityPremium = 1 + Math.min(1.5, city.population / 4000000);
      // High demand lifts market rent and thus achievable revenue.
      const demandPremium = 1 + Math.max(-0.3, demandIndex * 0.006);
      const targetOccupancy = Math.max(18, Math.min(100, 68 + demandIndex * 0.35 + locationScore * 0.28 - (building.rentMultiplier - 1) * 55));
      building.occupancy += (targetOccupancy - building.occupancy) * 0.01;
      building.utilization = building.occupancy;
      building.revenue = building.rentPerUnit * building.capacity * (building.occupancy / 100) * popularityPremium * densityPremium * demandPremium / 720;
      building.landValue *= 1 + (state.economy.inflation + state.economy.gdpGrowth + state.economy.realEstateBubble * 0.04 + building.occupancy * 0.001) / 100 / (365 * 24);
      building.glowPhase += 0.01;
    } else if (building.type === 'media_tv' || building.type === 'media_radio' || building.type === 'media_newspaper') {
      const competition = (index.buildingsByCity.get(city.id) ?? []).filter(other => other.type === building.type).length;
      const reachCap = building.type === 'media_tv' ? 100 : building.type === 'media_radio' ? 78 : 58;
      const targetRating = Math.min(reachCap, building.contentBudget * 82 / Math.max(1, competition * 0.65));
      building.mediaRating += (targetRating - building.mediaRating) * 0.002;
      const priceAppeal = Math.max(0.15, 1.35 - building.advertisingPrice / 5);
      building.utilization = Math.min(100, building.mediaRating * priceAppeal);
      building.revenue = city.population / 1000000 * building.mediaRating * building.advertisingPrice * 0.42;
      building.operatingCost += building.contentBudget * (building.type === 'media_tv' ? 4800 : building.type === 'media_radio' ? 1800 : 1000) / 720;
    } else if (building.type === 'internet_search' || building.type === 'internet_social') {
      const globalPopulation = state.cities.reduce((sum, item) => sum + item.population, 0);
      const networkEffect = (index.buildingsByType.get(building.type) ?? []).length;
      building.mediaRating = Math.min(100, building.mediaRating + building.contentBudget * 0.002);
      building.utilization = Math.min(100, 28 + building.mediaRating - networkEffect * 3);
      building.revenue = globalPopulation / 1000000 * building.utilization * Math.max(0.5, building.advertisingPrice || 1.5) * 0.08;
      building.operatingCost += building.contentBudget * 5200 / 720;
    } else if (building.type === 'rd_center' || building.type === 'software_company') {
      building.utilization = building.researchProjectId ? 92 : 28;
      building.operatingCost += building.trainingBudget * 4200 / 720;
      if (building.companyId === playerCompany?.id && building.researchProjectId) state.player.knowledgePoints += 0.002 * building.trainingLevel;
    } else if (building.type.startsWith('civic_')) {
      building.utilization = 72 + city.qualityOfLife * 0.2;
      building.operatingCost *= 1.4;
      building.revenue = 0;
    } else if (building.type === 'media_tower') {
      building.utilization = 78;
      building.revenue = 18;
    } else if (building.type === 'hq') {
      building.utilization = 82;
      building.operatingCost *= 1.8;
    }

    building.profit = building.revenue - building.operatingCost;
    building.condition = Math.max(20, building.condition - 0.0015);
  }
}

function simulateCities(state: GameState, index: StateIndex): void {
  if (state.hour !== 0) return;
  for (const city of state.cities) {
    const cityBuildings = buildingsInCity(index, city.id);
    const jobs = cityBuildings.reduce((s, b) => s + b.employees, 0);
    const popFactor = city.population / 1000000;
    const housingCapacity = cityBuildings.filter(building => building.type === 'apartment').reduce((sum, building) => sum + building.capacity, 0);
    const officeCapacity = cityBuildings.filter(building => building.type === 'commercial').reduce((sum, building) => sum + building.capacity, 0);
    const civicScore = cityBuildings.reduce((score, building) => score + (building.type.startsWith('civic_') ? 2.5 : 0), 0);

    city.unemploymentRate = Math.max(1, Math.min(25,
      10 - (jobs / (popFactor * 1000)) * 2 + (Math.random() - 0.5) * 0.5
    ));
    city.housingDemand = Math.max(-100, Math.min(100, housingCapacity - popFactor * 46));
    city.officeDemand = Math.max(-100, Math.min(100, officeCapacity - jobs / 42));
    // Public facilities boost quality of life
    const facilityBonus = state.publicFacilities
      .filter(f => f.cityId === city.id)
      .reduce((sum, f) => sum + f.funding * f.trainingLevel * 0.008, 0);
    city.qualityOfLife = Math.max(20, Math.min(100, 52 + civicScore + facilityBonus - city.unemploymentRate * 1.4));
    city.trafficLevel = Math.max(12, Math.min(100, 24 + cityBuildings.length * 1.8 + city.population / 350000));
    const housingGrowth = city.housingDemand < -20 ? 0.9996 : 1.0002;
    const employmentGrowth = city.unemploymentRate < 5 ? 1.00035 : city.unemploymentRate < 10 ? 1.0001 : 0.9996;
    const growthFactor = housingGrowth * employmentGrowth;
    city.population = Math.floor(city.population * growthFactor);
    city.wageRate *= (1 + (state.economy.inflation / 100) / (24 * 365));
    city.gdpPerCapita *= 1 + (state.economy.gdpGrowth + state.economy.inflation) / 100 / 365;
    if (state.day === 1) {
      city.wageHistory.push(city.wageRate);
      city.populationHistory.push(city.population);
      if (city.wageHistory.length > 120) city.wageHistory.shift();
      if (city.populationHistory.length > 120) city.populationHistory.shift();
    }
  }
  state.economy.unemployment = state.cities.reduce((sum, city) => sum + city.unemploymentRate, 0) / Math.max(1, state.cities.length);
}

function simulateStockMarket(state: GameState): void {
  const sm = state.stockMarket;
  const eco = state.economy;
  const sentiment = eco.gdpGrowth > 2 ? 0.0008 : eco.gdpGrowth < 0 ? -0.0008 : 0;
  const noise = (Math.random() - 0.5) * 0.002;
  sm.index = Math.max(1000, sm.index * (1 + sentiment + noise));

  if (state.tick % 24 === 0) {
    sm.indexHistory.push(sm.index);
    if (sm.indexHistory.length > 180) sm.indexHistory.shift();
  }

  sm.sentiment = eco.gdpGrowth > 3 ? 'bullish' : eco.gdpGrowth < 0 ? 'bearish' : 'neutral';

  for (const company of state.companies) {
    const profitFactor = company.profit > 0 ? 1.00005 : 0.99995;
    const marketFactor = 1 + sentiment + (Math.random() - 0.5) * 0.002;
    company.sharePrice = Math.max(0.5, company.sharePrice * profitFactor * marketFactor);
    if (company.sharePrice < 1) {
      company.sharePrice *= 10;
      company.sharesOutstanding = Math.max(1, Math.floor(company.sharesOutstanding / 10));
      company.sharesOwned = Math.floor(company.sharesOwned / 10);
    }
    company.marketCap = company.sharePrice * company.sharesOutstanding;
  }
  for (const bond of state.bonds) {
    if (bond.defaulted) {
      bond.marketPrice = 2;
      continue;
    }
    const requiredYield = eco.interestRate + ratingSpread(bond.rating) + bond.termYears * 0.05;
    bond.marketPrice = Math.max(35, Math.min(125, 100 * bond.couponRate / Math.max(0.5, requiredYield)));
  }
}

function simulateGoals(state: GameState): void {
  const player = state.companies.find(c => c.isPlayer);
  if (!player) return;
  for (const goal of state.goals) {
    switch (goal.id) {
      case 'g_firstMillion': goal.current = player.cash; break;
      default: break;
    }
    if (goal.id === 'g_firstMillion' || goal.name === 'First Million') goal.current = player.cash;
    if (goal.name === 'Empire Builder') goal.current = player.buildings.length;
    if (goal.name === 'Billionaire') goal.current = player.marketCap;
    if (goal.name === 'Multi-City') {
      goal.current = new Set(state.buildings.filter(b => b.companyId === player.id).map(b => b.cityId)).size;
    }
    if (goal.name === 'Debt Free') goal.current = player.debt > 0 ? 0 : 1;
    if (goal.name === 'Market Dominator') goal.current = Math.max(...state.products.map(product => product.playerMarketShare), 0);
    if (goal.name === 'Innovator') goal.current = Math.max(...state.products.map(product => product.techLevel), 1);
    if (goal.name === 'Media Mogul') {
      goal.current = state.buildings.filter(b => b.companyId === player.id && b.type === 'media_tv').length;
    }
    if (!goal.completed && goal.current >= goal.target) {
      goal.completed = true;
      player.cash += goal.reward;
      state.player.knowledgePoints += goal.knowledgeReward;
      addNotification(state, {
        id: generateId(),
        message: `🎯 Goal completed: ${goal.name}! +$${(goal.reward / 1000).toFixed(0)}K reward`,
        type: 'success',
        tick: state.tick,
      });
    }
  }
}

function simulateAICompany(state: GameState, company: Company): void {
  const companyBuildings = state.buildings.filter(b => b.companyId === company.id);
  // Build occasionally
  if (company.cash > 5000000 && Math.random() > (company.aiStrategy === 'aggressive' ? 0.7 : company.aiStrategy === 'conservative' ? 0.95 : 0.85)) {
    const city = state.cities[Math.floor(Math.random() * state.cities.length)];
    const types: BuildingType[] = ['retail_store', 'factory', 'apartment', 'commercial', 'farm', 'warehouse', 'rd_center', 'mine'];
    const type = types[Math.floor(Math.random() * types.length)];
    const building = createBuilding(type, company.id, city, state.products, state.tick);
    if (company.cash >= building.constructionCost) {
      company.cash -= building.constructionCost;
      state.buildings.push(building);
      company.buildings.push(building.id);
    }
  }
  for (const b of companyBuildings) {
    if (b.trainingLevel < 5 && Math.random() > 0.97) {
      b.trainingLevel = Math.min(9, b.trainingLevel + 1);
      company.cash -= 50000;
    }
  }
}

// ============= NEWS TICKER =============

function addNewsTicker(state: GameState, text: string, type: NewsTickerItem['type']) {
  const item: NewsTickerItem = { id: generateId(), text, type, tick: state.tick };
  state.stockMarket.ticker.push(item);
  if (state.stockMarket.ticker.length > 30) state.stockMarket.ticker.shift();
}

function updateNewsTicker(state: GameState) {
  // Occasionally generate breaking news tied to player
  const player = state.companies.find(c => c.isPlayer);
  if (!player) return;
  if (Math.random() < 0.005) {
    const news: string[] = [
      `${player.name} stock surges on positive analyst note`,
      `Industry observers cite ${player.name} as a key player to watch`,
      `${player.name} faces increased competition in retail sector`,
      `Bond rating agencies review ${player.name} debt outlook`,
      `${player.name} expands footprint with new construction projects`,
    ];
    addNewsTicker(state, news[Math.floor(Math.random() * news.length)], 'info');
  }
}

function addNotification(state: GameState, n: Notification) {
  state.notifications.push(n);
  if (state.notifications.length > 30) state.notifications.shift();
}

// ============= PLAYER ACTIONS =============

export function buildBuilding(state: GameState, type: BuildingType, x: number, y: number, tiles?: IsometricTile[][]): GameState {
  const playerCompany = state.companies.find(c => c.isPlayer);
  if (!playerCompany) return state;

  const tile = tiles?.[Math.round(y)]?.[Math.round(x)];
  const buildability = tiles ? isFootprintBuildable(tiles, state, type, Math.round(x), Math.round(y)) : isBuildableTile(tile, state, type);
  if (x < 1 || y < 1 || x >= state.mapSize - 1 || y >= state.mapSize - 1 || !buildability.ok) {
    addNotification(state, {
      id: generateId(),
      message: buildability.reason,
      type: 'warning',
      tick: state.tick,
    });
    return state;
  }
  const buildTile = tile as IsometricTile;

  const nearestCity = state.cities.reduce((closest, city) => {
    const d = Math.hypot(city.x - x, city.y - y);
    return d < closest.dist ? { city, dist: d } : closest;
  }, { city: state.cities[0], dist: Infinity });

  const cfg = BUILDING_CONFIGS[type];
  if (!cfg) return state;

  // Real-world construction breakdown: Materials (~62%) + Labour (local wage ×
  // engineering man-hours) + land acquisition at market value.
  const materialsCost = cfg.cost * 0.62;
  const manHours = cfg.employees * 160;
  const labourCost = nearestCity.city.wageRate * manHours * 0.8;
  const landPurchaseCost = buildTile.landValue * cfg.w * cfg.h * 2200;
  const landCost = materialsCost + labourCost + landPurchaseCost;
  if (playerCompany.cash < landCost) {
    addNotification(state, {
      id: generateId(),
      message: `Not enough cash. Need $${(landCost / 1000000).toFixed(1)}M`,
      type: 'danger',
      tick: state.tick,
    });
    return state;
  }

  const building = createBuilding(type, playerCompany.id, nearestCity.city, state.products, state.tick, x, y);
  building.constructionCost = landCost;
  building.landValue = landPurchaseCost;
  building.customerTraffic = locationTraffic(state, nearestCity.city, x, y);
  if (type === 'mine' && buildTile.resource) {
    building.resourceType = buildTile.resource.type;
    building.resourceRemaining = buildTile.resource.amount;
    building.resourceMax = buildTile.resource.maxAmount;
    const matchingProduct = state.products.find(product => product.name.toLowerCase() === buildTile.resource?.type.toLowerCase());
    if (matchingProduct) {
      building.productId = matchingProduct.id;
      building.products = [matchingProduct.id];
    }
  }
  playerCompany.cash -= landCost;
  state.buildings.push(building);
  playerCompany.buildings.push(building.id);
  // New building means new kerbside parking, so the cached road graph is stale.
  invalidateRoadCache(building.cityId);
  refreshBuildingSupply(state, building);
  state.tutorialStep = Math.max(state.tutorialStep, 2);

  addNotification(state, {
    id: generateId(),
    message: `Built ${building.name} in ${nearestCity.city?.name || 'wilderness'} for $${(landCost / 1000000).toFixed(1)}M`,
    type: 'success',
    tick: state.tick,
  });
  addNewsTicker(state, `${playerCompany.name} invests $${(landCost / 1000000).toFixed(1)}M in new ${building.name.toLowerCase()} in ${nearestCity.city?.name || ''}`, 'info');

  return state;
}

export function demolishBuildingAction(state: GameState, buildingId: string): GameState {
  const building = state.buildings.find(b => b.id === buildingId);
  const company = state.companies.find(c => c.isPlayer);
  if (!building || !company || building.companyId !== company.id) return state;

  const refund = building.constructionCost * 0.4;
  company.cash += refund;
  state.buildings = state.buildings.filter(b => b.id !== buildingId);
  company.buildings = company.buildings.filter(id => id !== buildingId);
  invalidateRoadCache(building.cityId);

  addNotification(state, {
    id: generateId(),
    message: `Demolished ${building.name}, refunded $${(refund / 1000000).toFixed(2)}M`,
    type: 'info',
    tick: state.tick,
  });
  return state;
}

export function takeLoan(state: GameState, amount: number): GameState {
  const company = state.companies.find(c => c.isPlayer);
  if (!company) return state;

  const maxLoan = Math.max(0, company.totalAssets - company.debt);
  const loanAmount = Math.min(amount, maxLoan);
  if (loanAmount <= 0) {
    addNotification(state, {
      id: generateId(),
      message: 'Maximum borrowing capacity reached.',
      type: 'danger',
      tick: state.tick,
    });
    return state;
  }

  company.cash += loanAmount;
  company.debt += loanAmount;
  company.interestRate = state.economy.interestRate + 1.5;
  addNotification(state, {
    id: generateId(),
    message: `Borrowed $${(loanAmount / 1000000).toFixed(1)}M at ${company.interestRate.toFixed(1)}%`,
    type: 'info',
    tick: state.tick,
  });
  addNewsTicker(state, `${company.name} expands its bank borrowing by $${(loanAmount / 1000000).toFixed(0)}M`, 'info');
  return state;
}

export function repayLoan(state: GameState, amount: number): GameState {
  const company = state.companies.find(c => c.isPlayer);
  if (!company) return state;
  const repayAmount = Math.min(amount, company.debt, company.cash);
  if (repayAmount <= 0) {
    addNotification(state, {
      id: generateId(),
      message: 'No debt to repay or insufficient cash.',
      type: 'warning',
      tick: state.tick,
    });
    return state;
  }
  company.cash -= repayAmount;
  company.debt -= repayAmount;
  if (company.debt === 0) {
    company.bondRating = 'AAA';
  }
  addNotification(state, {
    id: generateId(),
    message: `Repaid $${(repayAmount / 1000000).toFixed(1)}M of debt`,
    type: 'success',
    tick: state.tick,
  });
  return state;
}

export function buyShares(state: GameState, companyId: string, amount: number): GameState {
  const target = state.companies.find(c => c.id === companyId);
  const player = state.companies.find(c => c.isPlayer);
  if (!target || !player) return state;
  const cost = amount * target.sharePrice;
  if (player.cash < cost) {
    addNotification(state, {
      id: generateId(),
      message: 'Insufficient cash for purchase.',
      type: 'danger',
      tick: state.tick,
    });
    return state;
  }
  player.cash -= cost;
  target.sharesOwned += amount;
  addNotification(state, {
    id: generateId(),
    message: `Bought ${amount.toLocaleString()} shares of ${target.name} @ $${target.sharePrice.toFixed(2)}`,
    type: 'success',
    tick: state.tick,
  });
  return state;
}

export function sellShares(state: GameState, companyId: string, amount: number): GameState {
  const target = state.companies.find(c => c.id === companyId);
  const player = state.companies.find(c => c.isPlayer);
  if (!target || !player) return state;
  const sellAmount = Math.min(amount, target.sharesOwned);
  const revenue = sellAmount * target.sharePrice;
  player.cash += revenue;
  target.sharesOwned -= sellAmount;
  addNotification(state, {
    id: generateId(),
    message: `Sold ${sellAmount.toLocaleString()} shares of ${target.name} for $${(revenue / 1000000).toFixed(2)}M`,
    type: 'success',
    tick: state.tick,
  });
  return state;
}

export function upgradeBuilding(state: GameState, buildingId: string): GameState {
  const building = state.buildings.find(b => b.id === buildingId);
  const company = state.companies.find(c => c.isPlayer);
  if (!building || !company || building.companyId !== company.id) return state;
  if (building.level >= building.maxLevel) {
    addNotification(state, {
      id: generateId(),
      message: 'Building is at maximum level.',
      type: 'warning',
      tick: state.tick,
    });
    return state;
  }
  const cost = building.constructionCost * 0.4;
  if (company.cash < cost) {
    addNotification(state, {
      id: generateId(),
      message: `Not enough cash to upgrade. Need $${(cost / 1000000).toFixed(1)}M`,
      type: 'danger',
      tick: state.tick,
    });
    return state;
  }
  company.cash -= cost;
  building.level += 1;
  building.capacity *= 1.25;
  building.employees = Math.floor(building.employees * 1.12);
  building.trainingLevel = Math.min(9, building.trainingLevel + 1);
  building.condition = 100;
  addNotification(state, {
    id: generateId(),
    message: `Upgraded ${building.name} to level ${building.level}`,
    type: 'success',
    tick: state.tick,
  });
  return state;
}

export function setBuildingProducts(state: GameState, buildingId: string, productIds: string[]): GameState {
  const building = state.buildings.find(b => b.id === buildingId);
  if (!building) return state;
  building.products = productIds;
  return state;
}

export function setBuildingPrice(state: GameState, buildingId: string, multiplier: number): GameState {
  const building = state.buildings.find(b => b.id === buildingId);
  if (!building) return state;
  building.pricingMultiplier = Math.max(0.55, Math.min(1.8, multiplier));
  return state;
}

export function configureBuildingProduct(state: GameState, buildingId: string, productId: string): GameState {
  const building = state.buildings.find(item => item.id === buildingId);
  const product = state.products.find(item => item.id === productId);
  if (!building || !product || state.year < product.unlockYear) return state;
  building.productId = productId;
  building.products = [productId];
  building.supplierLinks = [];
  building.inventory = {};
  refreshBuildingSupply(state, building);
  return state;
}

export function autoSourceBuilding(state: GameState, buildingId: string): GameState {
  const building = state.buildings.find(item => item.id === buildingId);
  if (building) refreshBuildingSupply(state, building);
  return state;
}

export function optimizeAllSupply(state: GameState): GameState {
  const company = state.companies.find(item => item.isPlayer);
  if (!company) return state;
  state.buildings.filter(building => building.companyId === company.id).forEach(building => refreshBuildingSupply(state, building));
  addNotification(state, { id: generateId(), message: 'All eligible purchasing units switched to the best landed-cost suppliers.', type: 'success', tick: state.tick });
  return state;
}

export function fundAdvertising(state: GameState, productId: string, amount: number): GameState {
  const company = state.companies.find(item => item.isPlayer);
  const product = state.products.find(item => item.id === productId);
  if (!company || !product || company.cash < amount) return state;
  company.cash -= amount;
  const mediaEfficiency = 1 + state.buildings.filter(building => building.companyId === company.id && (building.type.startsWith('media_') || building.type.startsWith('internet_'))).length * 0.08;
  product.brand = Math.min(100, product.brand + amount / 250000 * mediaEfficiency);
  company.brandValue = Math.min(100, company.brandValue + amount / 2000000);
  return state;
}

export function acquireTechnology(state: GameState, productId: string): GameState {
  const company = state.companies.find(item => item.isPlayer);
  const product = state.products.find(item => item.id === productId);
  const hasHeadquarters = state.buildings.some(building => building.companyId === company?.id && building.type === 'hq');
  if (!company || !product || !hasHeadquarters) {
    addNotification(state, { id: generateId(), message: 'A CEO office in your headquarters is required to acquire technology.', type: 'warning', tick: state.tick });
    return state;
  }
  const targetTech = product.techLevel + 3;
  const cost = product.productionCost * targetTech * 4200;
  if (company.cash < cost) return state;
  company.cash -= cost;
  product.techLevel = targetTech;
  product.quality = Math.min(100, product.quality + 4);
  company.intangibleTechnology += cost * 0.7;
  addNewsTicker(state, `${company.name} acquires external ${product.name} technology`, 'info');
  return state;
}

export function toggleInternalSale(state: GameState, buildingId: string): GameState {
  const building = state.buildings.find(item => item.id === buildingId);
  if (building) building.internalSale = !building.internalSale;
  return state;
}

export function setTrainingBudget(state: GameState, buildingId: string, budget: number): GameState {
  const building = state.buildings.find(item => item.id === buildingId);
  if (building) building.trainingBudget = Math.max(0, Math.min(1, budget));
  return state;
}

export function setRentMultiplier(state: GameState, buildingId: string, multiplier: number): GameState {
  const building = state.buildings.find(item => item.id === buildingId);
  if (building) building.rentMultiplier = Math.max(0.6, Math.min(1.6, multiplier));
  return state;
}

export function setMediaPolicy(state: GameState, buildingId: string, contentBudget: number, advertisingPrice: number): GameState {
  const building = state.buildings.find(item => item.id === buildingId);
  if (building) {
    building.contentBudget = Math.max(0, Math.min(1, contentBudget));
    building.advertisingPrice = Math.max(0.5, Math.min(8, advertisingPrice));
  }
  return state;
}

export function startResearch(state: GameState, buildingId: string, productId: string): GameState {
  const building = state.buildings.find(item => item.id === buildingId);
  const product = state.products.find(item => item.id === productId);
  const company = state.companies.find(item => item.isPlayer);
  if (!building || !product || !company || building.companyId !== company.id || !['rd_center', 'software_company'].includes(building.type)) return state;
  if (state.year < product.unlockYear) {
    addNotification(state, { id: generateId(), message: `${product.name} research is locked until ${product.unlockYear}.`, type: 'warning', tick: state.tick });
    return state;
  }
  const project: ResearchProject = {
    id: generateId(), productId, companyId: company.id, targetTech: Math.ceil(product.techLevel + 5),
    progress: 0, durationMonths: Math.max(8, 42 - building.trainingLevel * 3), active: true, completed: false,
  };
  state.researchProjects.push(project);
  building.researchProjectId = project.id;
  building.researchProgress = 0;
  addNotification(state, { id: generateId(), message: `Research started: ${product.name} technology level ${project.targetTech}`, type: 'info', tick: state.tick });
  return state;
}

export function hireExecutive(state: GameState, executiveId: string): GameState {
  const executive = state.executives.find(item => item.id === executiveId);
  const company = state.companies.find(item => item.isPlayer);
  const hasHeadquarters = state.buildings.some(building => building.companyId === company?.id && building.type === 'hq');
  if (!executive || !company || executive.hired) return state;
  if (!hasHeadquarters) {
    addNotification(state, { id: generateId(), message: 'Build a headquarters before hiring senior executives.', type: 'warning', tick: state.tick });
    return state;
  }
  const signingCost = executive.salary * 0.25;
  if (company.cash < signingCost) return state;
  company.cash -= signingCost;
  executive.hired = true;
  addNewsTicker(state, `${company.name} appoints ${executive.name} as ${executive.role}`, 'info');
  return state;
}

export function spendKnowledge(state: GameState, category: string): GameState {
  if (state.player.knowledgePoints < 1) return state;
  state.player.knowledgePoints -= 1;
  state.player.expertise[category] = Math.min(100, (state.player.expertise[category] || 0) + 1);
  return state;
}

export function intensiveTraining(state: GameState): GameState {
  const company = state.companies.find(item => item.isPlayer);
  if (!company) return state;
  const firms = state.buildings.filter(building => building.companyId === company.id && building.trainingLevel < 9);
  const cost = firms.reduce((sum, building) => sum + building.employees * 4200 * (10 - building.trainingLevel), 0);
  if (company.cash < cost) {
    addNotification(state, { id: generateId(), message: `Intensive training requires $${(cost / 1000000).toFixed(1)}M.`, type: 'warning', tick: state.tick });
    return state;
  }
  company.cash -= cost;
  firms.forEach(building => { building.trainingLevel = Math.min(9, building.trainingLevel + 1); });
  return state;
}

function ratingSpread(rating: CreditRating) {
  const spreads: Record<CreditRating, number> = { AAA: 0.4, AA: 0.7, A: 1.1, BBB: 1.8, BB: 3.1, B: 4.8, CCC: 7.2, CC: 9.2, C: 12, D: 18 };
  return spreads[rating];
}

export function issueBond(state: GameState, amount: number, termYears: Bond['termYears']): GameState {
  const company = state.companies.find(item => item.isPlayer);
  if (!company || amount < 1000000) return state;
  const capacity = Math.max(0, company.totalAssets - company.debt);
  const issueAmount = Math.min(amount, capacity);
  if (issueAmount <= 0) return state;
  const faceValue = 1000;
  const quantity = Math.floor(issueAmount / faceValue);
  const couponRate = state.economy.interestRate + ratingSpread(company.bondRating) + termYears * 0.08;
  const bond: Bond = {
    id: generateId(), issuerId: company.id, faceValue, quantity, termYears, issueYear: state.year,
    maturityYear: state.year + termYears, couponRate, rating: company.bondRating, marketPrice: 100,
    holderId: null, defaulted: false,
  };
  state.bonds.push(bond);
  company.cash += faceValue * quantity;
  company.debt += faceValue * quantity;
  addNewsTicker(state, `${company.name} issues a ${termYears}-year bond at ${couponRate.toFixed(1)}%`, 'info');
  return state;
}

export function buyBond(state: GameState, bondId: string): GameState {
  const bond = state.bonds.find(item => item.id === bondId);
  const company = state.companies.find(item => item.isPlayer);
  if (!bond || !company || bond.issuerId === company.id || bond.holderId || bond.defaulted) return state;
  const cost = bond.faceValue * bond.quantity * bond.marketPrice / 100;
  if (company.cash < cost) return state;
  company.cash -= cost;
  bond.holderId = company.id;
  return state;
}

export function issueShares(state: GameState, amount: number): GameState {
  const company = state.companies.find(item => item.isPlayer);
  if (!company || amount <= 0) return state;
  const proceeds = amount * company.sharePrice * 0.97;
  company.cash += proceeds;
  company.sharesOutstanding += amount;
  addNewsTicker(state, `${company.name} raises $${(proceeds / 1000000).toFixed(1)}M in a secondary offering`, 'info');
  return state;
}

export function buyLand(state: GameState, x: number, y: number, size: number, tiles: IsometricTile[][]): GameState {
  const company = state.companies.find(item => item.isPlayer);
  const tile = tiles[Math.round(y)]?.[Math.round(x)];
  if (!company || !tile || tile.type === 'water') return state;
  const city = state.cities.reduce((best, item) => {
    const distance = Math.hypot(item.x - x, item.y - y);
    return distance < best.distance ? { city: item, distance } : best;
  }, { city: state.cities[0], distance: Infinity });
  const purchasePrice = tile.landValue * size * size * 2600;
  if (company.cash < purchasePrice) return state;
  const holding: LandHolding = {
    id: generateId(), companyId: company.id, cityId: city.city.id, x, y, size,
    purchasePrice, currentValue: purchasePrice, purchaseYear: state.year,
  };
  company.cash -= purchasePrice;
  state.landHoldings.push(holding);
  return state;
}

export function sellLand(state: GameState, holdingId: string): GameState {
  const company = state.companies.find(item => item.isPlayer);
  const holding = state.landHoldings.find(item => item.id === holdingId && item.companyId === company?.id);
  if (!company || !holding) return state;
  company.cash += holding.currentValue * 0.97;
  state.landHoldings = state.landHoldings.filter(item => item.id !== holdingId);
  return state;
}

// ============= BUILDING ACQUISITIONS =============

/**
 * Makes an offer for an AI-owned building. The seller's AI evaluates EBITDA multiple,
 * replacement cost, strategy temperament and cash hunger before answering:
 * below ~70% of asking price is refused outright, 70–99% triggers a counter-offer,
 * and >= asking closes the deal immediately.
 */
export function makePurchaseOffer(state: GameState, buildingId: string, offerAmount: number): GameState {
  const building = state.buildings.find(item => item.id === buildingId);
  const player = state.companies.find(item => item.isPlayer);
  if (!building || !player || building.companyId === player.id) return state;
  if (building.companyId === 'system') {
    state.lastOffer = { buildingId, status: 'rejected', offerAmount, counterAmount: 0, message: 'Public infrastructure is not for sale.', sellerName: 'City Government' };
    return state;
  }
  const seller = state.companies.find(item => item.id === building.companyId);
  if (!seller) return state;

  // AI valuation: replacement cost + 3 years of forward NOI + land gain.
  const annualProfit = building.profit * 720 * 30 * 12;
  const incomeValue = Math.max(0, annualProfit * 3);
  const assetValue = building.landValue + building.constructionCost * 0.55;
  const strategyGreed = seller.aiStrategy === 'aggressive' ? 1.35 : seller.aiStrategy === 'conservative' ? 0.95 : 1.15;
  // Cash-hungry sellers discount; cash-rich sellers hold out.
  const liquidityPressure = seller.cash < 5000000 ? 0.82 : seller.cash > 50000000 ? 1.1 : 1;
  const askingPrice = Math.max(50000, (assetValue + incomeValue) * strategyGreed * liquidityPressure);

  if (player.cash < offerAmount) {
    state.lastOffer = { buildingId, status: 'rejected', offerAmount, counterAmount: askingPrice, message: 'You lack the cash to finance this offer.', sellerName: seller.name };
    return state;
  }

  if (offerAmount >= askingPrice) {
    // Deal closes — ownership transfers.
    player.cash -= offerAmount;
    seller.cash += offerAmount;
    seller.buildings = seller.buildings.filter(id => id !== buildingId);
    player.buildings.push(buildingId);
    building.companyId = player.id;
    building.standingOffer = null;
    building.standingOfferBy = null;
    state.lastOffer = { buildingId, status: 'accepted', offerAmount, counterAmount: 0, message: `${seller.name} accepted your offer of $${(offerAmount / 1000000).toFixed(2)}M for ${building.name}.`, sellerName: seller.name };
    addNewsTicker(state, `${player.name} acquires ${building.name} from ${seller.name} for $${(offerAmount / 1000000).toFixed(2)}M`, 'breaking');
    invalidateRoadCache(building.cityId);
    return state;
  }

  if (offerAmount >= askingPrice * 0.7) {
    state.lastOffer = { buildingId, status: 'counter', offerAmount, counterAmount: askingPrice, message: `${seller.name} counters at $${(askingPrice / 1000000).toFixed(2)}M. The board believes the asset's earnings justify it.`, sellerName: seller.name };
  } else {
    state.lastOffer = { buildingId, status: 'rejected', offerAmount, counterAmount: askingPrice, message: `${seller.name} is not interested. Their board values the asset at $${(askingPrice / 1000000).toFixed(2)}M.`, sellerName: seller.name };
  }
  building.standingOffer = offerAmount;
  building.standingOfferBy = player.id;
  return state;
}

/** Returns the seller AI's silent asking price for UI display. */
export function getAskingPrice(state: GameState, buildingId: string): number | null {
  const building = state.buildings.find(item => item.id === buildingId);
  if (!building || building.companyId === 'system') return null;
  const seller = state.companies.find(item => item.id === building.companyId);
  const player = state.companies.find(item => item.isPlayer);
  if (!seller || seller.isPlayer || player?.id === seller.id) return null;
  const annualProfit = building.profit * 720 * 30 * 12;
  const incomeValue = Math.max(0, annualProfit * 3);
  const assetValue = building.landValue + building.constructionCost * 0.55;
  const strategyGreed = seller.aiStrategy === 'aggressive' ? 1.35 : seller.aiStrategy === 'conservative' ? 0.95 : 1.15;
  const liquidityPressure = seller.cash < 5000000 ? 0.82 : seller.cash > 50000000 ? 1.1 : 1;
  return Math.max(50000, (assetValue + incomeValue) * strategyGreed * liquidityPressure);
}

export function completeScouting(state: GameState): GameState {
  state.scoutingComplete = true;
  state.tutorialStep = Math.max(state.tutorialStep, 1);
  return state;
}

export function setOverlay(state: GameState, mode: GameState['overlay']): GameState {
  return { ...state, overlay: mode };
}

export function centerOnCity(state: GameState, cityId: string): GameState {
  const city = state.cities.find(c => c.id === cityId);
  if (!city) return state;
  return {
    ...state,
    camera: { ...state.camera, x: city.x, y: city.y, zoom: Math.max(state.camera.zoom, 1.3) },
    selectedCity: cityId,
  };
}

// ============= DIGITAL AGE RE-EXPORTS =============
export {
  hireTalent, headhuntTalent, raiseTalentSalary, toggleTalentAutoLoyalty,
  startTechnologyProject, startSoftwareProject, toggleAutoNewVersion,
  assignSoftwareToFactory, toggleEcommerceSales, setEcommercePrice,
  setTelecomPolicy, setWebsitePolicy, applyTechnologyToWebsite,
  acquirePrivateCompany, headhuntCost, technologyLevel, softwareTechLevel,
  meetsRequirements, computeTechGain, ecommerceFreightPenalty, firmLeadSkill,
} from './digital';

// rotateCamera removed - fixed isometric perspective
