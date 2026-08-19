import type {
  GameState, City, Company, Building, Product, MovingEntity, Economy,
  BuildingType, IsometricTile, ResourceNode, IncomingOffer, NewsTickerItem, Notification,
  ProductKind, CreditRating, Bond, BankOffer, Executive, ResearchProject, LandHolding,
  MarketSegment, MenuItem, CreditEntry, TradePartner, LabourUnion, Government,
  Cartel, Patent, ZoneType, IncomeTier, AISkill
} from './types';

/**
 * Board competence, 0..1. Drives forecast accuracy, pricing discipline,
 * expansion judgement and reaction speed to competitors.
 */
export const SKILL_ACUMEN: Record<AISkill, number> = {
  novice: 0.30,
  competent: 0.58,
  shrewd: 0.80,
  ruthless: 0.96,
};

export const SKILL_LABEL: Record<AISkill, string> = {
  novice: 'Novice',
  competent: 'Competent',
  shrewd: 'Shrewd',
  ruthless: 'Ruthless',
};
import {
  generateTechnologies, generateSoftwareProducts, generateTalentPool, defaultTelecomStats,
  simulateDigitalHourly, simulateDigitalMonthly, simulateAiTechCompanies,
} from './digital';
import { buildStateIndex, queryRadius, buildingsInCity, type StateIndex } from './indexing';
import {
  updateHouseholdBudgets, addressableSpend, behaviouralMultiplier, updateSocialProof,
  simulateDelivery, simulateLabour, simulateStrikes, labourAvailability,
  lossAversionMultiplier, bandwagonMultiplier,
  bullwhipOrderQuantity, propagateSupplierFailure, rushPenalty,
  simulateGovernment, simulateAntitrust, collectTaxes,
  simulateTrade, importCostMultiplier, offshoreProduction,
  resolveResearch, simulatePatents, patentPremium, simulateStandardsWar,
  simulateHerding, simulatePredatoryPricing, simulateCartels, messyLiquidation,
  updateForwardEarnings, reviewCreditRatings, simulateActivists, hedgeCommodity,
} from './institutions';
import {
  generateTradedAssets, simulateAssetPrices, simulateAiCapitalAllocation,
  simulateCentralBank, settleCapitalGains, applyCapitalGainsTax,
  playerPortfolioValue, buyAsset, sellAsset,
} from './markets';
import {
  getRoadNetwork, nearestNode, randomRoadRoute, buildFreightPolyline,
  samplePolyline, tileIsRoad, invalidateRoadCache, PARKING_OFFSET,
  CITY_ROAD_RADIUS, cityHighway, highwayEdges, highwayTiles, nearestIntersection,
  highwayProximity, isOnHighway,
} from './roads';

export function isRoadTile(tile: IsometricTile | null | undefined, state: GameState): boolean {
  if (!tile?.cityId || tile.type === 'water') return false;
  const city = state.cities.find(item => item.id === tile.cityId);
  return city ? tileIsRoad(tile.x, tile.y, city) : false;
}

/**
 * A kerbside bay is *the tile itself* — an integer coordinate immediately off
 * a street node next to a building. The check compares rounded coordinates so
 * only the exact bay tile is blocked, not the two-tile neighbourhood.
 */
export function isParkingSlot(x: number, y: number, state: GameState): boolean {
  const tx = Math.round(x);
  const ty = Math.round(y);
  const city = state.cities.find(item => Math.hypot(item.x - tx, item.y - ty) < 16);
  if (!city) return false;
  const network = getRoadNetwork(state, city);
  return network.parking.some(slot => Math.round(slot.x) === tx && Math.round(slot.y) === ty);
}

export function isBuildableTile(tile: IsometricTile | null | undefined, state: GameState, type: BuildingType): { ok: boolean; reason: string } {
  if (!tile) return { ok: false, reason: 'Outside the country map.' };
  if (tile.highway) return { ok: false, reason: 'Interstate highway right-of-way — no structures permitted.' };
  if (isRoadTile(tile, state)) return { ok: false, reason: 'Cannot build on streets or intersections.' };
  // Parking bays: the check now uses the true kerbside footprint, not a generous
  // ring around every building. Empty tiles are never wrongly flagged as parking.
  if (isParkingSlot(tile.x, tile.y, state)) return { ok: false, reason: 'Kerbside loading zone — service access must stay clear.' };

  // The city core is reserved for civic uses. Everything else keeps a small
  // hard-block on top of the town hall footprint (2 tiles), so surrounding
  // plots inside the CBD stay build-able and simply carry premium land value.
  const cbd = state.cities.find(city => Math.hypot(tile.x - city.x, tile.y - city.y) < 2);
  if (cbd) {
    if (type.startsWith('civic_') || type === 'hq') return { ok: true, reason: 'City centre — civic and headquarters use permitted.' };
    return { ok: false, reason: `${cbd.name} town hall square — reserved for civic buildings and headquarters.` };
  }

  // Occupation check must use the actual footprints of both buildings, not
  // an average of widths — a large factory next to a small kiosk was wrongly
  // blocking clean plots between them.
  const cfg = BUILDING_CONFIGS[type];
  for (const other of state.buildings) {
    const dx = Math.abs(other.x - tile.x);
    const dy = Math.abs(other.y - tile.y);
    // Both extents must overlap for a real collision.
    if (dx < (other.width + cfg.w) / 2 && dy < (other.height + cfg.h) / 2) {
      return { ok: false, reason: `Overlaps ${other.name} (${other.width}×${other.height}). Move at least one tile clear.` };
    }
  }
  if (tile.type === 'water' || tile.type === 'snow' || (tile.type === 'mountain' && type !== 'mine')) {
    return { ok: false, reason: 'This terrain is not suitable for construction.' };
  }
  if (type === 'mine' && (!tile.resource || !['iron', 'coal', 'oil', 'timber', 'gold', 'lithium', 'silica'].includes(tile.resource.type))) {
    return { ok: false, reason: 'Mines must be placed directly on a mineral deposit.' };
  }
  if (type === 'farm' && !['grass', 'hills'].includes(tile.type)) return { ok: false, reason: 'Farms require grassland or gentle hills.' };

  // ── Zoning: heavy industry is not permitted beside homes or hospitals ──
  const heavy = type === 'factory' || type === 'mine' || type === 'warehouse';
  const residentialUse = type === 'apartment';
  const commercialUse = type === 'retail_store' || type === 'commercial' || isHospitality(type)
    || type.startsWith('media_') || type.startsWith('internet_') || type === 'hq' || type === 'software_company';

  if (heavy && (tile.zone === 'residential' || tile.zone === 'commercial')) {
    return { ok: false, reason: `Zoning: heavy industry is prohibited in ${tile.zone} districts.` };
  }
  if (residentialUse && tile.zone === 'industrial') {
    return { ok: false, reason: 'Zoning: housing may not be built on industrial land.' };
  }
  if (commercialUse && tile.zone === 'industrial' && type !== 'hq') {
    return { ok: false, reason: 'Zoning: customer-facing premises are not permitted on industrial land.' };
  }
  // Hospitals and schools carry a statutory buffer against polluting uses.
  if (heavy) {
    const sensitive = state.publicFacilities.some(f =>
      (f.type === 'public_hospital' || f.type === 'public_school') &&
      Math.hypot(f.x - tile.x, f.y - tile.y) < 6);
    if (sensitive) return { ok: false, reason: 'Cannot site polluting industry within the buffer around a hospital or school.' };
  }

  return { ok: true, reason: 'Valid building plot.' };
}

/**
 * NIMBY resistance. Residents fight development that lowers amenity near
 * their homes; strong opposition adds planning delay costs or blocks outright.
 */
export function nimbyObjection(state: GameState, tile: IsometricTile, type: BuildingType): { blocked: boolean; surcharge: number; note: string } {
  const city = state.cities.find(c => c.id === tile.cityId);
  if (!city) return { blocked: false, surcharge: 0, note: '' };

  const nuisance = type === 'factory' || type === 'mine' ? 1
    : type === 'warehouse' || type === 'bar' ? 0.6
    : type === 'fast_food' || type === 'media_tower' ? 0.35
    : type === 'apartment' ? 0.25 : 0.1;
  if (nuisance < 0.2) return { blocked: false, surcharge: 0, note: '' };

  const nearbyHomes = state.buildings.filter(b =>
    b.type === 'apartment' && Math.hypot(b.x - tile.x, b.y - tile.y) < 8).length;
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
  if (firstReason !== '') return { ok: false, reason: firstReason };

  // NIMBY check on the anchor tile so the preview colour matches the actual outcome.
  const anchorTile = tiles[y]?.[x];
  if (anchorTile) {
    const nimby = nimbyObjection(state, anchorTile, type);
    if (nimby.blocked) return { ok: false, reason: nimby.note };
  }
  return { ok: true, reason: 'Valid building plot.' };
}

/** Nudges a coordinate off any street centreline so generated structures never sit on roads. */
/** Spiral search in 8 directions — guarantees an off-road tile is found. */
export function snapOffRoad(city: City, x: number, y: number): [number, number] {
  let nx = Math.round(x);
  let ny = Math.round(y);
  if (!tileIsRoad(nx, ny, city)) return [nx, ny];
  // Try each offset direction: cardinals first, then diagonals.
  const offsets: Array<[number, number]> = [
    [1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1],
  ];
  for (let radius = 1; radius <= 4; radius++) {
    for (const [dx, dy] of offsets) {
      const cx = nx + dx * radius;
      const cy = ny + dy * radius;
      if (!tileIsRoad(cx, cy, city) && !isOnHighway([city], cx, cy)) return [cx, cy];
    }
  }
  return [nx + 2, ny + 2]; // fallback: move clear
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
  'Prepared Food': { products: ['Burger Meal', 'Pizza', 'Pasta Dish', 'Steak Dinner', 'Coffee', 'Craft Beer', 'Sandwich', 'Salad Bowl'], icon: '🍽️', necessity: 62 },
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
  // ── Prices anchored to real 2024 retail shelf / factory gate in USD ──
  Bread: { kind: 'consumer', cost: 1.15, priceWeight: 45, qualityWeight: 35, brandWeight: 20, inputs: [['Flour', 1.5], ['Milk', 0.2]] },
  Cakes: { kind: 'consumer', cost: 3.80, inputs: [['Flour', 1.2], ['Milk', 0.6]] },
  'Corn Flakes': { kind: 'consumer', cost: 2.40, inputs: [['Corn', 1.5], ['Milk', 0.2]] },
  Car: { kind: 'consumer', cost: 18500, priceWeight: 30, qualityWeight: 45, brandWeight: 25, replacementName: 'Electric Car', maxShift: 50, inputs: [['Car Body', 1], ['Wheel and Tire', 4], ['Steel', 2], ['Electronic Components', 1]] },
  'Electric Car': { kind: 'consumer', cost: 32000, priceWeight: 28, qualityWeight: 52, brandWeight: 20, unlockYear: 2005, inputs: [['Electric Car Chassis', 1], ['Car Body', 1]] },
  'Mobile Phone': { kind: 'consumer', cost: 85, qualityWeight: 40, brandWeight: 30, priceWeight: 30, replacementName: 'Camera Phone', maxShift: 100, inputs: [['Electronic Components', 2], ['Plastic', 1], ['Glass', 0.5]] },
  'Camera Phone': { kind: 'consumer', cost: 145, unlockYear: 2000, replacementName: 'Smart Phone', maxShift: 100, inputs: [['Electronic Components', 2.5], ['Plastic', 1], ['Glass', 0.8]] },
  'Smart Phone': { kind: 'consumer', cost: 420, unlockYear: 2007, qualityWeight: 50, brandWeight: 30, priceWeight: 20, inputs: [['Electronic Components', 3], ['Plastic', 1], ['Glass', 1]] },
  Camera: { kind: 'consumer', cost: 110, replacementName: 'Digital Camera', maxShift: 100, inputs: [['Glass', 1], ['Plastic', 1]] },
  'Digital Camera': { kind: 'consumer', cost: 180, unlockYear: 1998, inputs: [['Electronic Components', 2], ['Glass', 1], ['Plastic', 1]] },
  Television: { kind: 'consumer', cost: 290, inputs: [['Electronic Components', 2], ['Glass', 2], ['Plastic', 1]] },
  Refrigerator: { kind: 'consumer', cost: 480, inputs: [['Steel', 2], ['Electronic Components', 1], ['Plastic', 1]] },
  'Leather Jacket': { kind: 'consumer', cost: 185, brandWeight: 45, inputs: [['Leather', 2]] },
  'Leather Bag': { kind: 'consumer', cost: 210, brandWeight: 50, inputs: [['Leather', 1.4]] },
  'Computer OS': { kind: 'digital', cost: 60, qualityWeight: 65, brandWeight: 25, priceWeight: 10, unlockYear: 1990 },
  'Office Suite': { kind: 'digital', cost: 45, qualityWeight: 55, brandWeight: 25, priceWeight: 20, unlockYear: 1992 },
  '3D Modelling Software': { kind: 'digital', cost: 140, qualityWeight: 70, brandWeight: 20, priceWeight: 10, unlockYear: 1998 },
  'Anti-virus Software': { kind: 'digital', cost: 35, qualityWeight: 60, brandWeight: 20, priceWeight: 20, unlockYear: 1994 },
  // Prepared food: made on premises from farm/semi inputs, sold same day.
  'Burger Meal': { kind: 'consumer', cost: 4.2, priceWeight: 42, qualityWeight: 33, brandWeight: 25, inputs: [['Livestock', 0.3], ['Flour', 0.2]] },
  Pizza: { kind: 'consumer', cost: 5.1, priceWeight: 40, qualityWeight: 35, brandWeight: 25, inputs: [['Flour', 0.35], ['Milk', 0.15]] },
  'Pasta Dish': { kind: 'consumer', cost: 4.6, priceWeight: 38, qualityWeight: 37, brandWeight: 25, inputs: [['Flour', 0.3]] },
  'Steak Dinner': { kind: 'consumer', cost: 13.5, priceWeight: 25, qualityWeight: 45, brandWeight: 30, inputs: [['Livestock', 0.8]] },
  Coffee: { kind: 'consumer', cost: 1.1, priceWeight: 35, qualityWeight: 30, brandWeight: 35, inputs: [['Milk', 0.1]] },
  'Craft Beer': { kind: 'consumer', cost: 2.4, priceWeight: 32, qualityWeight: 33, brandWeight: 35, inputs: [['Wheat', 0.25]] },
  Sandwich: { kind: 'consumer', cost: 3.1, priceWeight: 45, qualityWeight: 32, brandWeight: 23, inputs: [['Flour', 0.2], ['Livestock', 0.1]] },
  'Salad Bowl': { kind: 'consumer', cost: 3.4, priceWeight: 40, qualityWeight: 38, brandWeight: 22, inputs: [['Corn', 0.2]] },
};

/** Menu specialisation per hospitality venue type. */
const VENUE_MENUS: Record<string, string[]> = {
  restaurant: ['Pasta Dish', 'Steak Dinner', 'Pizza', 'Salad Bowl'],
  fast_food: ['Burger Meal', 'Sandwich', 'Pizza'],
  cafe: ['Coffee', 'Sandwich', 'Salad Bowl'],
  bar: ['Craft Beer', 'Burger Meal', 'Steak Dinner'],
};

export function isHospitality(type: BuildingType) {
  return type === 'restaurant' || type === 'fast_food' || type === 'cafe' || type === 'bar';
}

/** Luxury names sit at the top of the value ladder and behave as Veblen goods. */
const LUXURY_NAMES = new Set(['Steak Dinner', 'Wine', 'Perfume', 'Leather Jacket', 'Leather Bag', 'Electric Car', 'Smart Phone', 'Craft Beer']);
const PREMIUM_NAMES = new Set(['Camera Phone', 'Digital Camera', 'Notebook Computer', 'Tablet Computer', 'Blazer', 'Sofa', 'Air Conditioner']);

function segmentFor(name: string, category: string, cost: number): MarketSegment {
  if (LUXURY_NAMES.has(name)) return 'luxury';
  if (PREMIUM_NAMES.has(name)) return 'premium';
  if (category === 'Raw Materials' || category === 'Farm Products' || category === 'Semi Products') return 'value';
  if (cost > 400) return 'premium';
  if (cost < 30) return 'value';
  return 'mainstream';
}

/** Twelve monthly multipliers. Retail peaks in December, AC in summer, and so on. */
function seasonalityFor(category: string, name: string): number[] {
  const flat = () => Array(12).fill(1);
  const curve = (peaks: Record<number, number>) => {
    const arr = flat();
    for (const [month, value] of Object.entries(peaks)) arr[Number(month)] = value;
    return arr;
  };
  if (name === 'Air Conditioner') return curve({ 4: 1.5, 5: 2.1, 6: 2.4, 7: 2.2, 8: 1.5, 11: 0.5, 0: 0.45, 1: 0.5 });
  if (name === 'Coffee') return curve({ 10: 1.25, 11: 1.35, 0: 1.35, 1: 1.25, 6: 0.85, 7: 0.85 });
  if (name === 'Craft Beer' || name === 'Bottled Water') return curve({ 5: 1.3, 6: 1.45, 7: 1.4, 11: 0.85, 0: 0.8 });
  switch (category) {
    case 'Toys':
      return curve({ 10: 1.6, 11: 3.2, 0: 0.55, 1: 0.6 });
    case 'Electronics': case 'Computers': case 'Communication':
      return curve({ 10: 1.45, 11: 2.1, 0: 0.7, 1: 0.75 });
    case 'Apparel': case 'Footwear': case 'Cosmetics': case 'Jewelry':
      return curve({ 8: 1.2, 10: 1.35, 11: 1.9, 0: 0.7 });
    case 'Food': case 'Beverage': case 'Prepared Food':
      return curve({ 11: 1.35, 6: 1.1, 0: 0.9 });
    case 'Furniture': case 'Home Appliances':
      return curve({ 4: 1.2, 5: 1.25, 10: 1.2, 11: 1.3, 1: 0.8 });
    case 'Drugs':
      return curve({ 0: 1.3, 1: 1.25, 10: 1.2, 11: 1.25, 6: 0.85 });
    default:
      return flat();
  }
}

// ── Hospitality menu templates ────────────────────────────────────────────────
// Real quick-service economics: combos carry the margin, drinks carry the
// gross profit (fountain soda costs cents), kids boxes buy family footfall.
type MenuTemplate = Omit<MenuItem, 'id'>;

const MENU_TEMPLATES: Record<string, MenuTemplate[]> = {
  fast_food: [
    { name: 'Classic Burger', category: 'main', price: 5.49, foodCost: 1.62, popularity: 0.22, includesToy: false, enabled: true },
    { name: 'Crispy Chicken Sandwich', category: 'main', price: 6.29, foodCost: 1.88, popularity: 0.14, includesToy: false, enabled: true },
    { name: 'Value Combo Meal', category: 'combo', price: 9.99, foodCost: 2.94, popularity: 0.26, includesToy: false, enabled: true },
    { name: 'Kids Fun Box', category: 'kids', price: 4.99, foodCost: 1.35, popularity: 0.11, includesToy: true, enabled: true },
    { name: 'Fries', category: 'side', price: 2.79, foodCost: 0.41, popularity: 0.10, includesToy: false, enabled: true },
    { name: 'Fountain Soft Drink', category: 'drink', price: 2.19, foodCost: 0.24, popularity: 0.13, includesToy: false, enabled: true },
    { name: 'Soft-Serve Cone', category: 'dessert', price: 1.99, foodCost: 0.38, popularity: 0.04, includesToy: false, enabled: true },
  ],
  restaurant: [
    { name: 'Ribeye Steak', category: 'main', price: 32.00, foodCost: 11.20, popularity: 0.16, includesToy: false, enabled: true },
    { name: 'Handmade Pasta', category: 'main', price: 19.50, foodCost: 4.30, popularity: 0.22, includesToy: false, enabled: true },
    { name: 'Wood-Fired Pizza', category: 'main', price: 17.00, foodCost: 3.90, popularity: 0.20, includesToy: false, enabled: true },
    { name: 'Garden Salad', category: 'side', price: 8.50, foodCost: 1.95, popularity: 0.10, includesToy: false, enabled: true },
    { name: 'Kids Pasta Plate', category: 'kids', price: 8.95, foodCost: 2.10, popularity: 0.07, includesToy: true, enabled: true },
    { name: 'House Wine (glass)', category: 'drink', price: 11.00, foodCost: 2.60, popularity: 0.15, includesToy: false, enabled: true },
    { name: 'Tiramisu', category: 'dessert', price: 9.00, foodCost: 2.15, popularity: 0.10, includesToy: false, enabled: true },
  ],
  cafe: [
    { name: 'Drip Coffee', category: 'drink', price: 2.95, foodCost: 0.38, popularity: 0.26, includesToy: false, enabled: true },
    { name: 'Latte', category: 'drink', price: 4.85, foodCost: 0.82, popularity: 0.24, includesToy: false, enabled: true },
    { name: 'Cold Brew', category: 'drink', price: 5.25, foodCost: 0.91, popularity: 0.12, includesToy: false, enabled: true },
    { name: 'Breakfast Sandwich', category: 'main', price: 6.75, foodCost: 1.85, popularity: 0.16, includesToy: false, enabled: true },
    { name: 'Almond Croissant', category: 'dessert', price: 4.25, foodCost: 1.05, popularity: 0.14, includesToy: false, enabled: true },
    { name: 'Kids Hot Chocolate', category: 'kids', price: 3.25, foodCost: 0.62, popularity: 0.08, includesToy: true, enabled: true },
  ],
  bar: [
    { name: 'Craft Draught Pint', category: 'drink', price: 8.50, foodCost: 1.70, popularity: 0.30, includesToy: false, enabled: true },
    { name: 'Signature Cocktail', category: 'drink', price: 14.00, foodCost: 3.10, popularity: 0.20, includesToy: false, enabled: true },
    { name: 'Bar Burger', category: 'main', price: 16.50, foodCost: 4.60, popularity: 0.20, includesToy: false, enabled: true },
    { name: 'Loaded Fries', category: 'side', price: 9.00, foodCost: 2.05, popularity: 0.16, includesToy: false, enabled: true },
    { name: 'Wings Platter', category: 'side', price: 13.50, foodCost: 4.20, popularity: 0.14, includesToy: false, enabled: true },
  ],
};

/** Licensed toy cost per kids box — a real line item in QSR P&L. */
export const KIDS_TOY_COST = 0.42;

function buildMenu(type: BuildingType): MenuItem[] {
  const template = MENU_TEMPLATES[type];
  if (!template) return [];
  return template.map(item => ({ ...item, id: generateId() }));
}

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
        segment: segmentFor(name, category, cost),
        perceivedQuality: 30 + rand() * 40,
        reviewScore: 3.2 + rand() * 0.8,
        seasonality: seasonalityFor(category, name),
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
    // Population is set by the number of apartments that generateRentalBuildings
    // will actually create for this city: ~(6 + 1.8×pop_M + rand*5) apartments of
    // capacity ~100 each × 2.6 residents/unit. We generate the pop target first,
    // then the buildings match it. Startling with realistic metro sizes but the
    // player must BUILD housing to grow the city beyond its starting stock.
    const rawPop = 80000 + Math.floor(rand() * 1200000);
    const population = rawPop;
    const tier = rawPop > 800000 ? 'metropolis' : rawPop > 400000 ? 'large' : rawPop > 200000 ? 'medium' : 'small';
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
      // Demographics: wealthier metros skew older and better educated; young
      // family suburbs drive kids-menu and family-goods demand.
      medianAge: 28 + rand() * 16,
      educationIndex: Math.min(95, 18 + (18 + rand() * 90) * 0.55 + rand() * 20),
      familyShare: 0.18 + rand() * 0.30,
      carDependency: 0.25 + rand() * 0.6,
      // Income distribution roughly follows a Pareto-ish split.
      incomeMix: (() => {
        const low = 0.28 + rand() * 0.22;
        const affluent = 0.08 + rand() * 0.17;
        return { low, middle: Math.max(0.15, 1 - low - affluent), affluent };
      })(),
      discretionaryBudget: { low: 0, middle: 0, affluent: 0 }, // computed on first tick
      unionId: null,
      nimbyLevel: 20 + rand() * 45,
      propertyTaxRate: 0.008 + rand() * 0.017,
      // Vital statistics seeded near developed-world norms; the demographic
      // model then drives them apart as cities diverge in wealth and age.
      birthRate: 10 + rand() * 5,
      deathRate: 7 + rand() * 2.5,
      netMigrationRate: 0,
      naturalIncrease: 0,
      suppressedMigration: 0,
      birthsThisYear: 0,
      deathsThisYear: 0,
      migrationThisYear: 0,
    };
  });
}

function scenarioWageScale(x: number, size: number) {
  return 0.85 + (x / size) * 0.3;
}

function generateCompanies(rand: () => number, playerName: string): Company[] {
  // A crowded field: 9–13 rivals spanning the full competence range, so no
  // market is ever uncontested and skill differences are visible.
  const numAI = 9 + Math.floor(rand() * 5);
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
    monthsInDistress: 0,
    maxOfferRounds: 3,
    brandAwareness: 5,
    credit: [],
    observedPlayerShare: {},
    nextPriceReviewTick: 0,
    sentiment: 1,
    predatoryTicks: 0,
    cartelId: null,
    expectedEarnings: 0,
    creditorClaims: 0,
    skill: 'competent',
    acumen: 1,
    sharesFloat: 250000,
    operatingCashFlow: 0,
    dividendsPaid: 0,
    treasuryShares: 0,
    equityHoldings: {},
    assetHoldings: {},
    realisedGains: 0,
  };

  const ai: Company[] = [];
  for (let i = 0; i < numAI; i++) {
    const strategy: Company['aiStrategy'] = (['aggressive', 'balanced', 'conservative'] as const)[Math.floor(rand() * 3)];
    // Skill distribution: a crowded field of mostly-average operators with a
    // few genuinely dangerous strategists at the top and some weak hands below.
    const skillRoll = rand();
    const skill: AISkill = skillRoll < 0.28 ? 'novice'
      : skillRoll < 0.68 ? 'competent'
      : skillRoll < 0.90 ? 'shrewd'
      : 'ruthless';
    const acumen = SKILL_ACUMEN[skill];
    // Better boards have compounded more capital by the time play starts.
    const cash = (12000000 + rand() * 120000000) * (0.6 + acumen * 0.9);
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
      monthsInDistress: 0,
      // Sharper boards hold out longer in negotiation; novices fold sooner.
      maxOfferRounds: Math.max(2, Math.min(4, Math.round(2 + acumen * 2.2))),
      brandAwareness: 15 + rand() * 40,
      credit: [],
      observedPlayerShare: {},
      nextPriceReviewTick: Math.floor(rand() * 2160),
      sentiment: 0.85 + rand() * 0.3,
      predatoryTicks: 0,
      cartelId: null,
      expectedEarnings: 0,
      creditorClaims: 0,
      skill,
      acumen,
      sharesFloat: Math.floor(shares * (0.45 + rand() * 0.3)),
      operatingCashFlow: 0,
      dividendsPaid: 0,
      // Founders and the board retain a meaningful stake in their own firm.
      treasuryShares: Math.floor(shares * (0.08 + rand() * 0.22)),
      equityHoldings: {},
      assetHoldings: {},
      realisedGains: 0,
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
  // ── Hospitality: high-turnover, small footprint, thin margins ──
  restaurant: { name: 'Restaurant', cost: 850000, employees: 24, capacity: 320, w: 2, h: 2, sprites: 3 },
  fast_food: { name: 'Fast Food Outlet', cost: 520000, employees: 18, capacity: 620, w: 2, h: 2, sprites: 3 },
  cafe: { name: 'Cafe', cost: 310000, employees: 10, capacity: 380, w: 1, h: 1, sprites: 3 },
  bar: { name: 'Bar & Grill', cost: 640000, employees: 16, capacity: 260, w: 2, h: 2, sprites: 3 },
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
  // AI placements: snap off street centrelines and interstate right-of-way so
  // generated structures never spawn on a road.
  if (x === undefined && city) {
    [offsetX, offsetY] = snapOffRoad(city, offsetX, offsetY);
  }
  const eligibleProducts = products.filter(product => {
    if (isHospitality(type)) return (VENUE_MENUS[type] || []).includes(product.name);
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
    offersMade: 0,
    negotiationBlockedUntil: 0,
    cogs: 0,
    cachedAsk: 0,
    askDrift: 0,
    productSlots: 4,
    warehouseTier: type === 'warehouse'
      ? (['general', 'cold', 'hazmat'] as const)[Math.floor(Math.random() * 3)]
      : 'general',
    marketingBudget: type === 'telecom' ? 0.3 : 0,
    menu: buildMenu(type),
    loyalCustomerBase: 0.05,
    // Suburban plots get generous surface parking; dense CBD sites do not.
    parkingScore: city ? Math.max(0.1, Math.min(1, Math.hypot(offsetX - city.x, offsetY - city.y) / 14)) : 0.8,
    highwayAccess: 0,
    employeeSatisfaction: 55 + Math.random() * 20,
    monthsUnprofitable: 0,
    adBudget: 0,
    delivery: {
      enabled: false,
      mode: 'platform',
      radius: 6,
      couriers: 2,
      customerFee: 3.99,
      commissionRate: 0.30,
      ordersLastTick: 0,
      avgDeliveryMinutes: 32,
    },
    staffedEmployees: 0, // ramps up after opening
    effectiveTraining: 1,
    vacancyTicks: 0,
    demandForecast: cfg.capacity / 14,
    safetyStockPolicy: 0.5,
    productionIntensity: 1,
    supplyDisrupted: false,
    anchorPrice: 0,
    socialProof: 0,
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
        offersMade: 0,
        negotiationBlockedUntil: 0,
        cogs: 0,
        cachedAsk: 0,
        askDrift: 0,
        productSlots: 4,
        warehouseTier: 'general',
        marketingBudget: 0,
        menu: [],
        loyalCustomerBase: 0,
        parkingScore: 1,
        highwayAccess: 1,
        employeeSatisfaction: 70,
        monthsUnprofitable: 0,
        adBudget: 0,
        delivery: { enabled: false, mode: 'platform', radius: 0, couriers: 0, customerFee: 0, commissionRate: 0, ordersLastTick: 0, avgDeliveryMinutes: 0 },
        staffedEmployees: 100,
        effectiveTraining: 5,
        vacancyTicks: 0,
        demandForecast: 500,
        safetyStockPolicy: 0.5,
        productionIntensity: 1,
        supplyDisrupted: false,
        anchorPrice: 0,
        socialProof: 0,
      };
      buildings.push(b);
    }
  }

  return buildings;
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
      // City hall anchors the CBD square; other facilities ring the centre.
      let fx: number, fy: number;
      if (fType === 'city_hall') {
        fx = Math.round(city.x);
        fy = Math.round(city.y);
      } else {
        const angle = (i / cityFacilityTypes.length) * Math.PI * 2 + rand() * 0.5;
        const radius = 5 + rand() * 7;
        [fx, fy] = snapOffRoad(city, Math.round(city.x + Math.cos(angle) * radius), Math.round(city.y + Math.sin(angle) * radius));
      }

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

    // Hospitality density tracks population — every city eats out.
    const venueTypes: BuildingType[] = [];
    const venueCount = Math.floor(4 + popMillions * 2.2 + rand() * 4);
    for (let v = 0; v < venueCount; v++) {
      const roll = rand();
      venueTypes.push(roll < 0.34 ? 'fast_food' : roll < 0.62 ? 'cafe' : roll < 0.85 ? 'restaurant' : 'bar');
    }

    for (let i = 0; i < numApartments + numCommercial + venueTypes.length; i++) {
      const type: BuildingType = i < numApartments ? 'apartment'
        : i < numApartments + numCommercial ? 'commercial'
        : venueTypes[i - numApartments - numCommercial];
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
      if (type === 'apartment' || type === 'commercial') {
        building.occupancy = 40 + rand() * 50;
        building.rentMultiplier = 0.85 + rand() * 0.3;
      } else {
        // Venues open with stock on hand and market-rate pricing.
        building.pricingMultiplier = 0.9 + rand() * 0.35;
        building.trainingLevel = 2 + Math.floor(rand() * 4);
      }
      buildings.push(building);
      owner.buildings.push(building.id);
    }
  }
}

function generateTradePartners(rand: () => number): TradePartner[] {
  const seeds = [
    { name: 'Pacifica', rate: 7.2, wage: 0.28, quality: 0.14 },
    { name: 'Nordmark', rate: 0.92, wage: 1.25, quality: 0 },
    { name: 'Sudamera', rate: 18.5, wage: 0.42, quality: 0.09 },
    { name: 'Eastbridge', rate: 82, wage: 0.34, quality: 0.11 },
  ];
  return seeds.map(seed => ({
    id: generateId(),
    name: seed.name,
    exchangeRate: seed.rate,
    baseExchangeRate: seed.rate,
    tariffRate: 0.02 + rand() * 0.05,
    retaliatoryTariff: 0.02 + rand() * 0.05,
    wageIndex: seed.wage,
    qualityPenalty: seed.quality,
    relationship: 20 + rand() * 50,
  }));
}

function generateUnions(cities: City[], rand: () => number): LabourUnion[] {
  return cities.map(city => {
    const union: LabourUnion = {
      id: generateId(),
      cityId: city.id,
      // Older, industrial, higher-wage cities organise more heavily.
      density: Math.max(4, Math.min(78, (city.medianAge - 24) * 2.2 + rand() * 30)),
      wagePremium: 0.02 + rand() * 0.06,
      strikeTicks: 0,
      militancy: 20 + rand() * 45,
    };
    city.unionId = union.id;
    return union;
  });
}

function defaultGovernment(): Government {
  return {
    corporateTaxRate: 25,
    carbonTaxPerUnit: 0,
    minimumWage: 7.25,
    antitrustThreshold: 45,
    subsidisedCategories: [],
    nextReviewTick: 24 * 30 * 6,
    antitrustWarnings: 0,
  };
}

export function createNewGame(seed: number = 1337, playerName: string = 'Your Corporation', scenario: string = 'standard'): GameState {
  const rand = mulberry32(seed);
  const size = 200; // doubled from 100
  const products = generateProducts(rand);
  const cities = generateCities(rand, size);
  const companies = generateCompanies(rand, playerName);
  const buildings = generateInitialBuildings(cities, companies, products, 0);
  const playerCompany = companies[0];
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

  // Nothing may sit on interstate right-of-way; nudge any generated site clear
  // of it, then cache highway proximity (fixed for the life of the building).
  for (const building of buildings) {
    let guard = 0;
    while (isOnHighway(cities, building.x, building.y) && guard++ < 8) {
      building.x += 1;
      building.y += 1;
    }
    building.highwayAccess = highwayProximity(cities, building.x, building.y);
  }

  return {
    technologies,
    publicFacilities,
    tradedAssets: generateTradedAssets(),
    government: defaultGovernment(),
    tradePartners: generateTradePartners(rand),
    unions: generateUnions(cities, rand),
    cartels: [],
    patents: [],
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
      dieselPrice: 3.65,
      fuelShockMonths: 0,
      cpi: 100,
      // US-style two-tier capital gains: punitive on churn, mild on patience.
      shortTermCapitalGainsRate: 22,
      longTermCapitalGainsRate: 15,
      forwardGuidance: 'neutral',
      cbCredibility: 0.8,
      moneyVelocity: 1.15,
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
    incomingOffers: [],
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
      let elevation = fbm(seed, x, y, 5, 22, 0.55);
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
      // ── Flatten terrain under every city ─────────────────────────────────
      // A CBD cannot sit on a lake or a mountain pass. Ranges are graded to
      // plains so the built-up area is fully buildable, with elevation nudged
      // to the flat threshold so no relief cliffs render inside the city.
      if (cityId) {
        if (type === 'water') type = 'grass';
        else if (type === 'mountain' || type === 'snow' || type === 'hills' || type === 'desert') type = 'grass';
        elevation = Math.min(elevation, 0.3);
      }

      // Resource node placement (deterministic by noise).
      // Base minerals (iron/coal/silica) are common; precious/strategic
      // deposits are deliberately rare — gold ~8%, lithium ~12% of mountain
      // nodes, and oil fields are an exceptional desert find.
      let resource: ResourceNode | null = null;
      const tileRandom = hash2d(seed + 31337)(x, y);
      const detailRandom = hash2d(seed + 8911)(x, y);
      if (type === 'mountain' && elevation > 0.74 && tileRandom < 0.14) {
        const roll = detailRandom;
        const kind: ResourceNode['type'] =
          roll < 0.08 ? 'gold'
          : roll < 0.20 ? 'lithium'
          : roll < 0.40 ? 'silica'
          : roll < 0.70 ? 'iron'
          : 'coal';
        const rich = kind === 'gold' || kind === 'lithium';
        resource = { type: kind, amount: rich ? 300 + detailRandom * 400 : 800 + detailRandom * 1200, maxAmount: rich ? 700 : 2000 };
      } else if (type === 'forest' && moisture > 0.65 && tileRandom < 0.12) {
        resource = { type: 'timber', amount: 600 + detailRandom * 1000, maxAmount: 1500 };
      } else if (type === 'hills' && tileRandom < 0.06) {
        const hillRoll = detailRandom;
        const kind: ResourceNode['type'] = hillRoll < 0.06 ? 'gold' : hillRoll < 0.5 ? 'coal' : 'iron';
        resource = { type: kind, amount: kind === 'gold' ? 150 + detailRandom * 250 : 500 + detailRandom * 800, maxAmount: kind === 'gold' ? 400 : 1200 };
      } else if (type === 'desert' && tileRandom < 0.02) {
        resource = { type: 'oil', amount: 1500 + detailRandom * 2500, maxAmount: 4000 };
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

      // ── Zoning ──────────────────────────────────────────────────────────
      // Concentric planning: a commercial core, a residential ring, and
      // industrial land pushed to the periphery near freight corridors.
      let zone: ZoneType = 'mixed';
      if (cityId) {
        const home = state.cities.find(c => c.id === cityId)!;
        const d = Math.hypot(x - home.x, y - home.y);
        if (d < 5) zone = 'commercial';
        else if (d < 11) zone = 'residential';
        else if (d < 15) zone = 'mixed';
        else zone = 'industrial';
      } else {
        zone = 'industrial'; // rural land carries no residential protection
      }

      tiles[y][x] = {
        x,
        y,
        type,
        elevation,
        landValue,
        cityId,
        zone,
        highway: false,
        resource,
        variant: Math.floor(detailRandom * 8),
      };
    }
  }

  // ── Interstate highways ───────────────────────────────────────────────────
  // Every city links to its two nearest neighbours. Each route is an unbroken,
  // orthogonally-connected chain of tiles that terminates on a real street node
  // at both ends, so the drawn road, the freight path and the build rules all
  // agree on exactly where the highway is.
  for (const [a, b] of highwayEdges(state.cities)) {
    const exit = nearestIntersection(a, b.x, b.y);
    const entry = nearestIntersection(b, a.x, a.y);
    for (const [tx, ty] of highwayTiles(exit, entry)) {
      if (tx < 0 || ty < 0 || tx >= size || ty >= size) continue;
      const tile = tiles[ty]?.[tx];
      if (!tile) continue;
      tile.highway = true;
      // A highway is built ground: water becomes a bridge, wild terrain graded.
      if (tile.type === 'water') tile.elevation = Math.max(tile.elevation, 0.34);
      else if (tile.type === 'mountain' || tile.type === 'snow') {
        // Cuttings and passes flatten the ridge the road runs through.
        tile.type = 'hills';
        tile.elevation = Math.min(tile.elevation, 0.5);
      }
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
  simulateLabour(newState, index);
  simulateStockMarket(newState);
  simulateAssetPrices(newState);
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

  const monthlyIndex = buildStateIndex(state);
  aiPriceResponse(state);
  aiCompetitiveResponse(state, monthlyIndex);
  aiCloseUnprofitable(state, monthlyIndex);
  updateBrandAwareness(state, monthlyIndex);
  driftAskingPrices(state);
  simulateBankruptcy(state);
  simulatePoaching(state);
  updateFuelMarket(state);
  updateProductPerception(state);
  settleTradeCredit(state);

  // ── Institutions: households, labour, government, trade, markets ──
  updateHouseholdBudgets(state);
  simulateStrikes(state, monthlyIndex);
  simulateGovernment(state, monthlyIndex);
  simulateAntitrust(state, monthlyIndex);
  collectTaxes(state, monthlyIndex);
  simulateTrade(state);
  simulatePatents(state);
  simulateStandardsWar(state);
  simulateHerding(state, monthlyIndex);
  simulatePredatoryPricing(state, monthlyIndex);
  simulateCartels(state, monthlyIndex);
  updateForwardEarnings(state, monthlyIndex);
  reviewCreditRatings(state);
  simulateActivists(state);
  simulateSupplierFailures(state);
  simulateCentralBank(state);
  simulateAiCapitalAllocation(state);
  if (state.month === 1) settleCapitalGains(state);

  refreshSupplyNetworks(state);
  simulateResearch(state);
  simulateProductLifecycle(state);
  updateLandValues(state);
  simulateDigitalMonthly(state);
  simulateAiTechCompanies(state, state.companies);
  simulateIncomingOffers(state);

  // ── Dividends: every quarter, profitable firms pay their payout ratio ──
  if (state.month % 3 === 0) {
    for (const company of state.companies) {
      const annualProfit = company.profit * 24 * 365;
      if (annualProfit <= 0 || company.dividendPayout <= 0) { company.dividendsPaid = 0; continue; }
      const dividend = (annualProfit * company.dividendPayout / 100) / 4;
      if (company.cash < dividend) continue;
      company.cash -= dividend;
      company.dividendsPaid = dividend * 4;
    }
  }

  // Reset operating cash flow at the start of each year.
  if (state.month === 1) {
    for (const company of state.companies) company.operatingCashFlow = 0;
  }

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
  eco.consumerConfidence = Math.max(10, Math.min(95, eco.consumerConfidence + (e.confidence + (Math.random() - 0.5) * 1.5) / 24));
  eco.businessConfidence = Math.max(10, Math.min(95, eco.businessConfidence + (e.confidence + (Math.random() - 0.5) * 1.5) / 24));

  // ── Phillips Curve inflation ────────────────────────────────────────────
  // π = πᵉ − β(u − uₙ) + supply shocks + money supply effect
  // Replaces the simple random walk with a structural macro model that
  // produces realistic crisis-level jumps when supply shocks and unemployment
  // interact, instead of the too-smooth glide of the previous formula.
  const NAIRU = 4.5;
  const unemploymentGap = eco.unemployment - NAIRU;
  // Anchored expectations: a credible central bank pulls expectations toward
  // the 2% target, so shocks fade. A discredited one lets them drift, which is
  // how transitory inflation becomes entrenched.
  const anchorWeight = eco.cbCredibility;
  const expectedInflation = eco.inflation * (1 - anchorWeight * 0.6) + 2 * (anchorWeight * 0.6);
  const supplyShock = eco.fuelShockMonths > 0 ? 2.5 : 0;
  const phillipsInflation = expectedInflation - 0.4 * unemploymentGap + supplyShock;

  // Money supply effect (Quantity Theory: MV = PY → π ≈ ΔM + ΔV − ΔY).
  const prevMoney = Math.max(40, eco.moneySupply - 0.15);
  const moneyGrowth = (eco.moneySupply - prevMoney) / Math.max(1, prevMoney) * 100;
  const velocityAdjust = (eco.moneyVelocity - 1.15) * 3;
  const monetaryPush = moneyGrowth + velocityAdjust - eco.gdpGrowth * 0.3;

  const rawInflation = 0.55 * phillipsInflation + 0.35 * (eco.inflation + monetaryPush) + 0.10 * e.inflation;
  eco.inflation += (rawInflation - eco.inflation) * 0.04;
  eco.inflation = Math.max(-3, Math.min(22, eco.inflation));

  // ── Taylor Rule: r = r* + π + 0.5(π − π*) + 0.25·(output gap) ──────
  const inflationGap = eco.inflation - 2.0;
  const outputGap = eco.gdpGrowth - 2.5;
  const taylorTarget = Math.max(0.25, 2 + eco.inflation + 0.5 * inflationGap + 0.25 * outputGap);
  // Central bank moves gradually — unless inflation is crisis-level.
  const urgency = eco.inflation > 8 ? 0.45 : eco.inflation > 5 ? 0.30 : 0.15;
  eco.interestRate += (taylorTarget - eco.interestRate) * urgency;
  eco.interestRate = Math.max(-0.5, Math.min(22, eco.interestRate));

  state.stockMarket.interestRate = eco.interestRate;
  state.stockMarket.inflationRate = eco.inflation;

  // ── Money supply: QE/QT channel ─────────────────────────────────────────
  const qeSignal = eco.interestRate < 1.5 ? 0.08 : eco.interestRate < 3 ? 0.02
    : eco.interestRate > 6 ? -0.06 : -0.01;
  eco.moneySupply = Math.max(40, Math.min(250, eco.moneySupply + qeSignal));

  eco.realEstateBubble = Math.max(0, Math.min(100,
    eco.realEstateBubble + (eco.gdpGrowth > 4 && eco.interestRate < 4 ? 0.025 : -0.006)
  ));
  // CPI tracks purchasing power continuously so the player sees erosion.
  eco.purchasingPowerIndex *= 1 - (eco.inflation / 100) / (24 * 365);
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

    // Operating cash flow accumulates through the year, reset monthly.
    company.operatingCashFlow += company.profit;

    company.totalAssets = company.cash + company.intangibleTechnology + bookValue
      + (landByCompany.get(company.id) ?? 0);

    company.marketCap = company.sharePrice * company.sharesOutstanding;
    company.sharesFloat = Math.max(0, company.sharesOutstanding - company.sharesOwned);

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

/**
 * Accessibility multiplier. Car-dependent cities punish sites without parking;
 * highway frontage is what makes big-box retail and logistics viable at all.
 */
function accessibilityFactor(state: GameState, city: City, building: Building): number {
  const bigBox = building.type === 'warehouse' || building.capacity > 400;
  // Parking matters in proportion to how much the city drives.
  const parkingNeed = city.carDependency;
  const parkingTerm = 1 - parkingNeed * 0.55 * (1 - building.parkingScore);
  // Highway frontage: strong for big-box/logistics, mild for urban formats.
  const highwayTerm = 1 + building.highwayAccess * (bigBox ? 0.35 : 0.10);
  return Math.max(0.35, parkingTerm) * highwayTerm;
}

/**
 * Highway access, measured against the real interstate tiles rather than a
 * straight line between city centres — so the score matches the drawn road.
 */
function computeHighwayAccess(state: GameState, building: Building): number {
  return highwayProximity(state.cities, building.x, building.y);
}

/**
 * Demographic fit. Kids menus need families, premium tech needs educated buyers,
 * pharmacy demand rises with median age.
 */
function demographicFit(city: City, product: Product): number {
  let fit = 1;
  if (product.segment === 'luxury' || product.segment === 'premium') {
    fit *= 0.7 + (city.educationIndex / 100) * 0.6;
  }
  if (product.category === 'Drugs') fit *= 0.75 + (city.medianAge / 45) * 0.5;
  if (product.category === 'Toys') fit *= 0.55 + city.familyShare * 1.8;
  if (product.category === 'Computers' || product.category === 'Communication') {
    fit *= 0.7 + (city.educationIndex / 100) * 0.55 + Math.max(0, (38 - city.medianAge) / 38) * 0.25;
  }
  return Math.max(0.25, Math.min(1.9, fit));
}

/**
 * Price response with Veblen behaviour at the top of the ladder.
 *
 * Ordinary goods: quantity falls as price rises (negative exponent).
 * Luxury goods: brand carries the purchase, price sensitivity collapses, and
 * within a band a *higher* price signals exclusivity and lifts demand.
 */
function priceResponse(product: Product, priceMultiplier: number, confidence: number): number {
  const brandStrength = product.brand / 100;
  const baseElasticity = product.demandIndex > 70 ? 0.6 : product.demandIndex > 40 ? 1.1 : 1.8;

  if (product.segment === 'luxury' && product.brand > 70) {
    // Veblen band: demand peaks around a 1.35× premium then falls away.
    const veblenPeak = 1.35;
    const distance = Math.abs(priceMultiplier - veblenPeak);
    const veblen = Math.max(0.35, 1.25 - distance * 0.85);
    // Recessions gut discretionary luxury spending far harder than staples.
    const luxuryConfidence = Math.pow(Math.max(0.05, confidence / 100), 2.2);
    return veblen * luxuryConfidence;
  }

  // Strong brands blunt price sensitivity even outside true luxury.
  const effectiveElasticity = baseElasticity * (1 - brandStrength * 0.55);
  const confidenceExponent = product.demandIndex > 70 ? 0.35 : product.segment === 'premium' ? 1.7 : 1.1;
  const confidenceTerm = Math.pow(Math.max(0.05, confidence / 100), confidenceExponent);
  return Math.pow(priceMultiplier, -effectiveElasticity) * confidenceTerm;
}

/** National chain reach: awareness scales with total footprint, not just one city. */
function nationalBrandFactor(company: Company | undefined, storeCount: number): number {
  const awareness = company ? company.brandAwareness : 0;
  // Diminishing returns on footprint, mirroring real chain economics.
  const reach = Math.log10(1 + storeCount) * 0.22;
  return 1 + reach + (awareness / 100) * 0.35;
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
  const isShop = building.type === 'retail_store' || building.type === 'internet_ecommerce';
  const neededProducts = building.type === 'factory'
    ? product.inputs.map(input => input.productId)
    : isShop || building.type === 'warehouse'
      ? building.products.slice(0, building.productSlots)
      : [];
  if (neededProducts.length === 0) return;

  // ── Economies of scale ────────────────────────────────────────────────────
  // Two effects stack, as in real procurement:
  //  1. Chain leverage — a 10+ outlet group negotiates better standing terms.
  //  2. Order-size tiers — >1,000 units earns 5%, >5,000 units earns 12%.
  const sameFormatCount = state.buildings.filter(b => b.companyId === building.companyId && b.type === building.type).length;
  const chainLeverage = sameFormatCount >= 10 ? 0.92 : sameFormatCount >= 5 ? 0.97 : 1;
  const orderSize = Math.max(20, building.capacity * 0.18 * sameFormatCount);
  const orderTier = orderSize > 5000 ? 0.88 : orderSize > 1000 ? 0.95 : 1;
  const volumeDiscount = chainLeverage * orderTier;

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
        const dieselPrice = state.economy.dieselPrice;
        const fuelCost = distance * 0.06 * dieselPrice;
        const driverWage = state.cities.find(c => c.id === supplier.cityId)?.wageRate ?? 15;
        const timeCost = (distance / 60) * driverWage;
        const terrainPremium = supplier.cityId === building.cityId ? 1 : 1.35;
        const freightPerUnit = (fuelCost + timeCost) * terrainPremium * Math.max(0.25, inputProduct.productionCost * 0.008);
        // Seaport goods are imports: exchange rates and tariffs land on the invoice.
        const importMultiplier = supplier.type === 'seaport' ? importCostMultiplier(state) : 1;
        const pricePerUnit = inputProduct.productionCost
          * (supplier.companyId === 'system' ? 1.28 : 0.9 + supplier.trainingLevel * 0.025)
          * importMultiplier;
        const quality = Math.min(100, inputProduct.quality + supplier.trainingLevel * 2.2);
        return { supplier, pricePerUnit, freightPerUnit, quality, score: pricePerUnit + freightPerUnit - quality * 0.12 };
      })
      .sort((a, b) => a.score - b.score);
    const best = offers[0];
    if (!best) return [];
    const link = {
      productId,
      supplierBuildingId: best.supplier.id,
      pricePerUnit: best.pricePerUnit * volumeDiscount,
      freightPerUnit: best.freightPerUnit,
      quality: best.quality,
    };
    // ── Inventory psychology ────────────────────────────────────────────────
    // Buyers hoard when supply looks fragile or prices are climbing: the reorder
    // trigger rises and order sizes swell, exactly as in the 2020–22 shortages.
    const scarcity = inputProduct.marketDemand > 75 ? 1 : 0;
    const priceClimbing = state.economy.inflation > 5 ? 1 : 0;
    const fuelCrisis = state.economy.fuelShockMonths > 0 ? 1 : 0;
    const panic = Math.min(1, (scarcity + priceClimbing + fuelCrisis) / 3);
    const reorderPoint = building.inventoryCapacity * (0.35 + panic * 0.35);
    const orderMultiple = 1 + panic * 1.2;

    const inventory = building.inventory[productId] || 0;
    if (inventory < reorderPoint) {
      // ── Bullwhip: each echelon forecasts, buffers and batches, so orders
      // amplify as they travel upstream from the shelf to the mine. ──
      const echelonDepth = building.type === 'retail_store' || building.type === 'internet_ecommerce' ? 0
        : building.type === 'warehouse' ? 1
        : building.type === 'factory' ? 2 : 3;
      const observedDemand = Math.max(1, building.demand / 12);
      const bullwhipOrder = bullwhipOrderQuantity(building, observedDemand, echelonDepth);

      const amount = Math.min(
        building.inventoryCapacity * (0.4 + panic * 0.4),
        Math.max(20, bullwhipOrder * orderMultiple),
      );
      createFreightRoute(state, best.supplier, building, productId, amount, best.freightPerUnit * amount);
      building.supplyDisrupted = false;
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
      // Freight is paid on collection; goods run on net-30 trade credit.
      if (buyerCompany) buyerCompany.cash -= route.freightCost;
      const NET_30 = 24 * 30;
      if (buyerCompany && supplierCompany && supplierCompany.id !== buyerCompany.id) {
        buyerCompany.credit.push({
          id: generateId(), counterpartyId: supplierCompany.id, amount: goodsCost,
          dueTick: state.tick + NET_30, kind: 'payable',
        });
        supplierCompany.credit.push({
          id: generateId(), counterpartyId: buyerCompany.id, amount: goodsCost,
          dueTick: state.tick + NET_30, kind: 'receivable',
        });
      } else if (buyerCompany) {
        // Intra-group transfer settles immediately.
        buyerCompany.cash -= goodsCost;
        if (supplierCompany) supplierCompany.cash += goodsCost;
      }
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
    const company = state.companies.find(item => item.id === project.companyId);
    // Research is uncertain — funding improves the odds but never guarantees a result.
    const investment = trainingPower * 45000;
    const succeeded = resolveResearch(state, project.companyId, product.id, investment);
    if (!succeeded) {
      centers.forEach(center => { center.researchProjectId = null; center.researchProgress = 0; });
      continue;
    }
    product.techLevel = Math.max(product.techLevel, project.targetTech);
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
    // ── Labour: headcount is payroll, not concurrent staffing. Roughly a third of
    // staff are on shift at any hour, so hourly cost = headcount × wage × shift factor.
    const shiftFactor = isDaytime ? 0.34 : 0.12;
    const wageCost = building.employees * city.wageRate * shiftFactor;
    const maintenance = building.constructionCost * 0.0000045;
    const trainingCost = wageCost * building.trainingBudget * 0.18;
    building.operatingCost = wageCost + maintenance + trainingCost;
    building.revenue = 0;
    building.cogs = 0;
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
      // Rushing the line lifts output but degrades quality; strikes and vacancies cut it.
      const rush = rushPenalty(building);
      const labour = labourAvailability(state, building, city);
      const productionUnits = building.capacity / 720 * trainingEfficiency * seasonal
        * inputReadiness * Math.max(0.15, reserveFactor) * rush.output * labour;
      building.lastUnitsProduced = productionUnits;
      if (rush.quality < 1 && state.tick % 240 === 0) {
        // Defects from over-running the plant erode the product's quality stat.
        product.quality = Math.max(5, product.quality - (1 - rush.quality) * 0.8);
      }
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
      // ── Producer sales model ─────────────────────────────────────────────
      // Output splits into three channels:
      //   1. Internal group transfers (own downstream plants) — booked at cost+10%.
      //   2. Contract sales to linked external buyers (only when NOT internal-sale).
      //   3. Open spot market at a wholesale discount (only when NOT internal-sale).
      // "Internal sale" therefore genuinely withholds supply from rivals and trades
      // away spot revenue — it is a strategic choice, never a free exploit.
      const onHand = (building.inventory[product.id] || 0) + productionUnits;

      const ownDownstream = state.buildings.filter(b =>
        b.companyId === building.companyId && b.id !== building.id &&
        (b.type === 'factory' || b.type === 'retail_store' || b.type === 'warehouse') &&
        b.supplierLinks.some(l => l.supplierBuildingId === building.id && l.productId === product.id)
      );
      const internalDemand = ownDownstream.reduce((sum, b) => sum + b.capacity / 14 * 0.5, 0);
      const internalUnits = Math.min(onHand, internalDemand);

      const marketAbsorption = (product.marketDemand / 100) * (building.capacity / 12) * (0.7 + city.population / 8_000_000);
      const externalUnits = building.internalSale
        ? 0
        : Math.min(onHand - internalUnits, Math.max(productionUnits * 0.6, marketAbsorption));

      const unitsShipped = internalUnits + externalUnits;
      building.inventory[product.id] = Math.max(0, Math.min(building.inventoryCapacity, onHand - unitsShipped));

      const unitInputCost = product.inputs.reduce((sum, input) => {
        const link = building.supplierLinks.find(l => l.productId === input.productId);
        return sum + input.quantity * ((link?.pricePerUnit ?? 0) + (link?.freightPerUnit ?? 0));
      }, 0);
      const internalPrice = unitInputCost * 1.10 || product.productionCost * 0.95;
      // A live patent supports a premium until exclusivity lapses.
      const spotPrice = product.currentPrice * 0.72 * patentPremium(state, building.companyId, product.id);
      building.revenue = internalUnits * internalPrice + externalUnits * spotPrice;
      building.cogs = unitsShipped * unitInputCost;

      building.supply = onHand;
      building.demand = (internalDemand + marketAbsorption) * 12;
      building.utilization = Math.min(100, productionUnits / Math.max(0.01, building.capacity / 720) * 100);
    } else if ((building.type === 'retail_store' || building.type === 'internet_ecommerce' || isHospitality(building.type)) && product) {
      // Multi-line retail: a shop stocks up to `productSlots` product lines and each
      // line draws its own demand curve. Venues keep a single menu.
      const isShop = building.type === 'retail_store' || building.type === 'internet_ecommerce';
      const stocked: Product[] = isShop
        ? building.products
            .slice(0, building.productSlots)
            .map(id => state.products.find(p => p.id === id))
            .filter((p): p is Product => Boolean(p))
        : [product];

      const localTraffic = building.type === 'internet_ecommerce'
        ? Math.min(100, state.cities.reduce((sum, item) => sum + item.population, 0) / 1000000 * 2.5)
        : locationTraffic(state, city, building.x, building.y, index);
      const avgWage = state.cities.reduce((sum, item) => sum + item.wageRate, 0) / Math.max(1, state.cities.length);
      const wageRatio = city.wageRate / Math.max(1, avgWage);
      const tradingHours = isHospitality(building.type) ? 10 : 14;
      const baseHourly = (building.capacity / Math.max(1, stocked.length)) / tradingHours;
      const timeFactor = building.type === 'internet_ecommerce' ? 0.85 : isDaytime ? 1 : 0.2;
      const trafficFactor = 0.4 + (localTraffic / 100) * 0.95;

      // ── Structural multipliers applied to every line in this store ──
      const owner = index.companiesById.get(building.companyId);
      const nationalStores = (index.buildingsByCompany.get(building.companyId) ?? [])
        .filter(b => b.type === building.type).length;
      const brandReach = nationalBrandFactor(owner, nationalStores);
      const access = building.type === 'internet_ecommerce' ? 1 : accessibilityFactor(state, city, building);
      // Happy staff serve better, and service quality converts footfall into repeat custom.
      // Effective training lags the funded level, and understaffing hurts service.
      const staffing = labourAvailability(state, building, city);
      const serviceQuality = (0.75 + (building.employeeSatisfaction / 100) * 0.35
        + (building.effectiveTraining / 9) * 0.15) * staffing;
      const seasonIndex = state.month - 1;
      // Anchoring, scarcity and social proof.
      const behavioural = behaviouralMultiplier(building, stocked[0]?.currentPrice ?? 1);

      let totalRevenue = 0;
      let totalCogs = 0;
      let totalSold = 0;
      let totalExpired = 0;
      let totalSupply = 0;
      let totalDemand = 0;
      let needsRestock = false;
      let loyaltyPull = 0;

      for (const line of stocked) {
        let chainCount = 0;
        for (const other of index.buildingsByCompany.get(building.companyId) ?? []) {
          if (other.cityId === building.cityId && other.type === building.type && other.productId === line.id) chainCount++;
        }
        const localChain = Math.min(1.45, 1 + Math.max(0, chainCount - 1) * 0.08);
        const necessity = line.demandIndex / 100;
        const incomeElasticity = necessity > 0.7 ? 0.25 : necessity > 0.4 ? 0.9 : 1.6;
        // Price/confidence response, Veblen-aware for luxury lines.
        const priceTerm = priceResponse(line, building.pricingMultiplier, state.economy.consumerConfidence);
        const incomeTerm = Math.pow(Math.max(0.4, wageRatio), incomeElasticity);
        const incomeDemand = necessity + (1 - necessity) * Math.max(0.45, Math.min(1.6, wageRatio));
        // Consumers judge perceived quality and reviews, not the hidden stat.
        const reputation = 0.55 + (line.perceivedQuality / 100) * 0.55 + (line.reviewScore - 3) * 0.12;
        const demographics = demographicFit(city, line);
        const season = line.seasonality[seasonIndex] ?? 1;

        // ── Household budgets cap what the city can actually absorb ──
        // addressableSpend is $/month per household; scale to the whole city
        // (~2.4 people per household) to get a true market ceiling in units/hr.
        const households = city.population / 2.4;
        const spendPool = addressableSpend(city, line) * households; // $/month, city-wide
        const unitsPerMonth = spendPool / Math.max(0.25, line.currentPrice * building.pricingMultiplier);
        const budgetCeiling = Math.max(0, unitsPerMonth) / 30 / Math.max(1, tradingHours);

        // ── Behavioural overlays ──
        // Loss aversion: a price rise above the anchor hurts ~2.25× more than
        // an equivalent cut helps. Bandwagon: hot products snowball.
        const shelfPrice = line.currentPrice * building.pricingMultiplier;
        const lossAversion = lossAversionMultiplier(shelfPrice, building.anchorPrice || shelfPrice);
        const bandwagon = bandwagonMultiplier(building.socialProof, owner?.brandAwareness ?? 0);

        const baseDemand = baseHourly * trafficFactor * reputation * localChain * brandReach
            * incomeDemand * priceTerm * incomeTerm * timeFactor * access
            * serviceQuality * demographics * season * behavioural
            * lossAversion * bandwagon;
        // A single outlet is capped by city demand, and by the number of outlets
        // sharing that demand (saturating market share).
        const outletsHere = (index.buildingsByCity.get(city.id) ?? [])
          .filter(b => b.products.includes(line.id) && (b.type === building.type || isHospitality(b.type))).length;
        const marketShare = 1 / Math.max(1, outletsHere);
        const desiredSales = Math.min(baseDemand, budgetCeiling * marketShare * 3);
        loyaltyPull += desiredSales;

        const available = isHospitality(building.type) ? desiredSales : (building.inventory[line.id] || 0);
        const unitsSold = Math.min(available, desiredSales);
        const perishability = isHospitality(building.type) ? 0
          : line.category === 'Food' ? 0.0022 : line.category === 'Beverage' ? 0.0012 : line.category === 'Drugs' ? 0.00055 : 0;
        const expiredUnits = Math.max(0, available - unitsSold) * perishability;
        if (!isHospitality(building.type)) {
          building.inventory[line.id] = Math.max(0, available - unitsSold - expiredUnits);
          if (building.inventory[line.id] < building.inventoryCapacity * 0.15) needsRestock = true;
        }

        const unitCost = isHospitality(building.type)
          ? line.productionCost * 1.05
          : ((building.supplierLinks.find(l => l.productId === line.id)?.pricePerUnit ?? 0) +
             (building.supplierLinks.find(l => l.productId === line.id)?.freightPerUnit ?? 0) || line.productionCost * 1.35);

        totalRevenue += unitsSold * line.currentPrice * building.pricingMultiplier;
        totalCogs += unitsSold * unitCost + expiredUnits * unitCost;
        totalSold += unitsSold;
        totalExpired += expiredUnits;
        totalSupply += available;
        totalDemand += desiredSales * tradingHours;
      }

      // ── Customer loyalty & switching friction ──────────────────────────────
      // A store's habitual base migrates slowly: at most ~15% of customers switch
      // per month even when a rival is clearly better, so undercutting buys share
      // gradually rather than instantly.
      const competitiveAppeal = Math.min(1, loyaltyPull / Math.max(0.001, baseHourly * stocked.length));
      const monthlySwitchRate = 0.15 / (30 * 24); // per-hour equivalent
      building.loyalCustomerBase += (competitiveAppeal - building.loyalCustomerBase) * monthlySwitchRate * 24;
      building.loyalCustomerBase = Math.max(0, Math.min(1, building.loyalCustomerBase));
      // Locked-in customers keep buying regardless of today's price; the rest are contestable.
      const loyaltyFloor = building.loyalCustomerBase * 0.55;
      const stickiness = loyaltyFloor + (1 - loyaltyFloor) * competitiveAppeal;
      const loyaltyAdjusted = stickiness / Math.max(0.001, competitiveAppeal || 1);
      totalSold *= loyaltyAdjusted;
      totalRevenue *= loyaltyAdjusted;
      totalCogs *= loyaltyAdjusted;

      // ── Hospitality menu P&L: covers × menu mix, not a single product line ──
      if (isHospitality(building.type) && building.menu.length > 0) {
        const active = building.menu.filter(item => item.enabled);
        const weight = active.reduce((sum, item) => sum + item.popularity, 0) || 1;
        const covers = totalSold; // one cover chooses one line
        let menuRevenue = 0;
        let menuCost = 0;
        // Families follow the kids offer, so a kids box lifts total covers.
        const kidsLines = active.filter(item => item.category === 'kids');
        const kidsDraw = kidsLines.length > 0 ? 1 + city.familyShare * 0.45 : 1;
        for (const item of active) {
          const share = item.popularity / weight;
          const itemCovers = covers * share * kidsDraw;
          menuRevenue += itemCovers * item.price * building.pricingMultiplier;
          menuCost += itemCovers * (item.foodCost + (item.includesToy ? KIDS_TOY_COST : 0));
        }
        totalRevenue = menuRevenue;
        totalCogs = menuCost;
        totalSold = covers * kidsDraw;
      }

      // ── Delivery channel ────────────────────────────────────────────────
      // Runs alongside dine-in/walk-in trade and reaches households the
      // storefront never would — at the cost of commission or a courier fleet.
      if (building.delivery.enabled && totalSold > 0) {
        const avgOrderValue = totalRevenue / Math.max(0.001, totalSold);
        const del = simulateDelivery(state, building, city, index, avgOrderValue, isDaytime);
        totalRevenue += del.revenue - del.commission;
        totalCogs += del.orders * (totalCogs / Math.max(0.001, totalSold));
        building.operatingCost += del.cost;
        totalSold += del.orders;
      } else {
        building.delivery.ordersLastTick = 0;
      }

      updateSocialProof(building, totalSold, baseHourly * stocked.length);

      building.lastUnitsSold = totalSold;
      building.expiredUnits = totalExpired;
      building.cogs = totalCogs;
      building.spoilageLoss = Math.max(0, totalExpired * (stocked[0]?.productionCost ?? 0));
      building.customerTraffic = localTraffic;
      building.supply = totalSupply;
      building.demand = totalDemand;
      building.utilization = Math.min(100, (totalSold / Math.max(0.001, baseHourly * stocked.length)) * 100);
      building.revenue = totalRevenue;
      building.operatingCost += (building.type === 'internet_ecommerce' ? 3.1 : 0) + building.adBudget / 720;
      if (!isHospitality(building.type) && needsRestock && state.tick % 24 === 0) {
        refreshBuildingSupply(state, building);
      }
    } else if (building.type === 'warehouse') {
      // ── Tiered logistics: cold chain and hazmat command premium rates but cost
      // more to run and only fill when the local product mix needs them. ──
      const stored = Object.values(building.inventory).reduce((sum, quantity) => sum + quantity, 0);
      const utilization = Math.min(100, stored / building.inventoryCapacity * 100);
      building.utilization = utilization;
      building.supply = stored;
      const tierRate = building.warehouseTier === 'cold' ? 1.05 : building.warehouseTier === 'hazmat' ? 1.4 : 0.55;
      const tierOpex = building.warehouseTier === 'cold' ? 0.55 : building.warehouseTier === 'hazmat' ? 0.8 : 0.15;
      const contractPremium = 1 + building.trainingLevel * 0.03; // SLA quality lifts rates
      const cityDemand = city.population / 4_000_000;
      building.demand = building.inventoryCapacity * (0.4 + cityDemand * 0.35);
      building.revenue = stored * tierRate * contractPremium + building.inventoryCapacity * 0.05;
      building.operatingCost += building.inventoryCapacity * tierOpex / 720;
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

      // ── Local rent competition ──────────────────────────────────────────────
      // Tenants shop the neighbourhood. If comparable buildings within ~12 tiles
      // ask less per unit, this block loses occupancy; if it undercuts them, it
      // fills up. Moving is disruptive, so the shift is gradual, not instant.
      const comparables = queryRadius(index, building.x, building.y, 12)
        .filter(other => other.id !== building.id && other.type === building.type && other.rentPerUnit > 0);
      let rentCompetitiveness = 1;
      if (comparables.length > 0) {
        const areaAverage = comparables.reduce((sum, other) => sum + other.rentPerUnit, 0) / comparables.length;
        if (areaAverage > 0 && building.rentPerUnit > 0) {
          // Cheaper than the area → above 1; pricier → below 1. Housing demand is
          // fairly elastic locally, so a 10% discount meaningfully shifts tenants.
          rentCompetitiveness = Math.max(0.45, Math.min(1.6, Math.pow(areaAverage / building.rentPerUnit, 1.35)));
        }
      }

      const targetOccupancy = Math.max(8, Math.min(100,
        (68 + demandIndex * 0.35 + locationScore * 0.28) * rentCompetitiveness - (building.rentMultiplier - 1) * 30));
      building.occupancy += (targetOccupancy - building.occupancy) * 0.01;
      building.utilization = building.occupancy;
      // Vacancy friction: below 85% occupancy, broker commissions, fit-out and
      // void periods eat a share of the rent roll.
      const vacancyTurnoverCost = building.occupancy < 85 ? ((85 - building.occupancy) / 85) * 0.30 : 0;
      building.revenue = building.rentPerUnit * building.capacity * (building.occupancy / 100)
        * popularityPremium * densityPremium * demandPremium * (1 - vacancyTurnoverCost) / 720;
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

    // ── Employee satisfaction: pay relative to local market, training investment
    // and how hard the site is being pushed. Feeds service quality above. ──
    const payRatio = building.trainingBudget * 0.5 + 0.8;
    const overwork = Math.max(0, building.utilization - 88) / 100;
    const satisfactionTarget = Math.max(10, Math.min(100,
      50 + (payRatio - 1) * 60 + building.trainingLevel * 3.2 - overwork * 90 + (building.condition - 60) * 0.15));
    building.employeeSatisfaction += (satisfactionTarget - building.employeeSatisfaction) * 0.004;

    // True margin: gross sales less cost of goods less operating expenses.
    building.profit = building.revenue - building.cogs - building.operatingCost;
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
    // ── Housing balance measured in actual households, not arbitrary units ──
    // Each apartment unit houses ~2.6 people (US Census average). Demand is the
    // percentage surplus/shortfall of supply against the resident population,
    // so a city of 500k with 1,500 units reads as the severe crisis it is.
    const housedPeople = housingCapacity * 2.6;
    const housingBalance = (housedPeople - city.population) / Math.max(1, city.population);
    city.housingDemand = Math.max(-100, Math.min(100, housingBalance * 100));

    // Office demand compares lettable desks against the jobs that need them.
    const officeBalance = (officeCapacity - jobs * 0.35) / Math.max(1, jobs * 0.35);
    city.officeDemand = Math.max(-100, Math.min(100, officeBalance * 100));
    // Public facilities boost quality of life
    const facilityBonus = state.publicFacilities
      .filter(f => f.cityId === city.id)
      .reduce((sum, f) => sum + f.funding * f.trainingLevel * 0.008, 0);
    city.qualityOfLife = Math.max(20, Math.min(100, 52 + civicScore + facilityBonus - city.unemploymentRate * 1.4));
    city.trafficLevel = Math.max(12, Math.min(100, 24 + cityBuildings.length * 1.8 + city.population / 350000));

    // ── Demographics: births, deaths and migration ────────────────────────
    // Population is a real quantity produced by three independent flows, not a
    // growth multiplier. Each is expressed per 1,000 residents per year and
    // applied hourly, so the annual rates the UI reports are literally true.
    const housedCapacity = housingCapacity * 2.6; // 2.6 residents/unit (Census)
    const maxPop = Math.max(20_000, housedCapacity * 1.12); // +12% informal/overcrowding

    // Healthcare access lowers mortality; hospitals matter more than clinics.
    const healthcare = state.publicFacilities
      .filter(f => f.cityId === city.id && (f.type === 'public_hospital'))
      .reduce((sum, f) => sum + f.funding * (f.serviceReach / 14), 0);

    // ── Births: the demographic transition ──
    // Wealth and education suppress fertility; a young, family-heavy city
    // raises it. Recessions visibly delay childbearing.
    const affluence = city.wageRate / 30;                  // 1.0 ≈ median wage
    const educationDrag = city.educationIndex / 100;
    const youthBonus = Math.max(0, (38 - city.medianAge) / 38);
    const recessionDelay = state.economy.cycle === 'recession' ? 0.86 : 1;
    city.birthRate = Math.max(6, Math.min(28,
      (17 - affluence * 3.2 - educationDrag * 4.5 + youthBonus * 6 + city.familyShare * 5) * recessionDelay
    ));

    // ── Deaths: ageing against healthcare ──
    city.deathRate = Math.max(4.5, Math.min(16,
      4.5 + Math.max(0, city.medianAge - 28) * 0.28 - healthcare * 1.1
    ));

    city.naturalIncrease = city.birthRate - city.deathRate;

    // ── Migration: the swing factor ──
    // People move toward jobs, wages and liveability — and away from
    // unemployment. Crucially, they can only arrive if housing exists.
    const nationalWage = state.cities.reduce((s, c) => s + c.wageRate, 0) / Math.max(1, state.cities.length);
    const wagePull = (city.wageRate / Math.max(1, nationalWage) - 1) * 22;
    const jobPull = (6 - city.unemploymentRate) * 1.8;
    const amenityPull = (city.qualityOfLife - 55) * 0.14;
    const desiredMigration = wagePull + jobPull + amenityPull;

    // Housing is a hard gate. When the city is full, would-be arrivals are
    // turned away — recorded so the player can see the unmet demand that is
    // driving rents up.
    const headroom = (maxPop - city.population) / Math.max(1, city.population) * 1000;
    const actualMigration = desiredMigration > 0
      ? Math.min(desiredMigration, Math.max(0, headroom))
      : desiredMigration; // out-migration is never blocked
    city.suppressedMigration = Math.max(0, desiredMigration - actualMigration);
    city.netMigrationRate = actualMigration;

    // Apply all three flows for one hour.
    const perHour = 1 / (365 * 24);
    const births = city.population * (city.birthRate / 1000) * perHour;
    const deaths = city.population * (city.deathRate / 1000) * perHour;
    const migrants = city.population * (city.netMigrationRate / 1000) * perHour;

    city.birthsThisYear += births;
    city.deathsThisYear += deaths;
    city.migrationThisYear += migrants;
    city.population = Math.max(500, Math.round(city.population + births - deaths + migrants));

    // Median age drifts: births pull it down, ageing pushes it up, and
    // migrants skew young (working-age adults move, retirees rarely do).
    const ageingPressure = (city.deathRate - city.birthRate) * 0.0000009;
    const migrantYouth = migrants > 0 ? -Math.abs(migrants) / Math.max(1, city.population) * 4 : 0;
    city.medianAge = Math.max(22, Math.min(52, city.medianAge + ageingPressure + migrantYouth + perHour * 0.35));

    // Headline growth rate the UI reports, as an annual percentage.
    city.growthRate = (city.naturalIncrease + city.netMigrationRate) / 10;

    city.wageRate *= (1 + (state.economy.inflation / 100) / (24 * 365));
    city.gdpPerCapita *= 1 + (state.economy.gdpGrowth + state.economy.inflation) / 100 / 365;

    if (state.day === 1) {
      city.wageHistory.push(city.wageRate);
      city.populationHistory.push(city.population);
      if (city.wageHistory.length > 120) city.wageHistory.shift();
      if (city.populationHistory.length > 120) city.populationHistory.shift();

      // Annual counters roll over on 1 January.
      if (state.month === 1) {
        city.birthsThisYear = 0;
        city.deathsThisYear = 0;
        city.migrationThisYear = 0;
      }
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
    // ── Forward-looking valuation ──
    // Markets discount expected future earnings, not the last print, and they
    // punish a miss against expectations harder than they reward a beat.
    const realisedAnnual = company.profit * 24 * 365;
    const surprise = company.expectedEarnings !== 0
      ? (realisedAnnual - company.expectedEarnings) / Math.abs(company.expectedEarnings)
      : 0;
    const asymmetric = surprise < 0 ? surprise * 1.8 : surprise * 0.9; // losses hurt more
    const expectationsFactor = 1 + Math.max(-0.004, Math.min(0.004, asymmetric * 0.0015));
    const marketFactor = 1 + sentiment + (Math.random() - 0.5) * 0.002;
    company.sharePrice = Math.max(0.5, company.sharePrice * expectationsFactor * marketFactor);
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

function simulateAICompany(state: GameState, company: Company): void {
  const companyBuildings = state.buildings.filter(b => b.companyId === company.id);

  // ── Strategy-driven expansion ────────────────────────────────────────────
  // The board screens cities and formats on observable ROI rather than guessing:
  // it favours undersupplied markets, avoids saturated ones, and never opens a
  // mine where there is no deposit or a factory with no route to inputs.
  const appetite = company.aiStrategy === 'aggressive' ? 0.7 : company.aiStrategy === 'conservative' ? 0.95 : 0.85;
  // Sentiment (herding) and competence both gate how readily a board commits
  // capital — capable firms act on opportunity, weak ones dither or overreach.
  // Base gate lowered so competent boards genuinely expand — roughly one build
  // every 2–3 months for an active firm rather than one or two a year.
  const gate = Math.max(0.18, Math.min(0.92, (appetite - 0.25) / Math.max(0.4, company.sentiment * (0.7 + company.acumen * 0.6))));
  if (company.cash > 3_000_000 && Math.random() > gate) {
    const preferred: BuildingType[] = company.aiStrategy === 'aggressive'
      ? ['retail_store', 'fast_food', 'cafe', 'restaurant', 'bar', 'factory']
      : company.aiStrategy === 'conservative'
        ? ['apartment', 'commercial', 'warehouse']
        : ['retail_store', 'apartment', 'factory', 'warehouse', 'cafe', 'commercial'];

    type Candidate = { city: City; type: BuildingType; score: number };
    let best: Candidate | null = null;

    for (const city of state.cities) {
      const cityBuildings = state.buildings.filter(b => b.cityId === city.id);
      const popM = city.population / 1_000_000;

      for (const type of preferred) {
        const existing = cityBuildings.filter(b => b.type === type).length;
        // Saturation: how many outlets of this format the city can carry.
        const carrying = type === 'apartment' ? 6 + popM * 3
          : type === 'commercial' ? 4 + popM * 1.5
          : type === 'warehouse' ? 2 + popM
          : isHospitality(type) ? 4 + popM * 2.4
          : 3 + popM * 2;
        if (existing >= carrying) continue;
        const headroom = 1 - existing / carrying;

        // Format-specific demand read.
        let demandSignal: number;
        if (type === 'apartment') demandSignal = Math.max(0, -city.housingDemand) / 100;
        else if (type === 'commercial') demandSignal = Math.max(0, -city.officeDemand) / 100;
        else if (isHospitality(type)) demandSignal = (city.trafficLevel / 100) * (0.6 + city.familyShare);
        else if (type === 'retail_store') demandSignal = (city.trafficLevel / 100) * (city.wageRate / 45);
        else demandSignal = 0.4 + (state.economy.businessConfidence / 200);

        // Cheap labour and land lift returns; wages hurt service formats most.
        const costDrag = type === 'factory' || type === 'warehouse'
          ? city.wageRate / 45
          : (city.wageRate / 45) * 0.4;
        // ── Resource validation ──────────────────────────────────────────
        // A board will not sink capital into a plant it cannot supply. Mines
        // need a deposit in reach; factories need a route to their inputs.
        if (type === 'mine') continue; // mines require a surveyed deposit — handled separately
        if (type === 'factory') {
          const hasInputSource = state.buildings.some(b =>
            (b.type === 'seaport' || b.type === 'farm' || b.type === 'mine' || b.type === 'warehouse') &&
            (b.cityId === city.id || Math.hypot(b.x - city.x, b.y - city.y) < 45));
          if (!hasInputSource) continue;
        }
        if (isHospitality(type) || type === 'retail_store') {
          // Retail needs customers: skip cities with no residential base.
          const homes = cityBuildings.filter(b => b.type === 'apartment').length;
          if (homes < 2) continue;
        }

        // Market research is imperfect, and the weaker the board the noisier
        // its read: a novice effectively guesses, a ruthless board sees clearly.
        const forecastError = (1 - company.acumen) * 0.9;
        const noise = 1 + (Math.random() - 0.5) * 2 * forecastError;
        const score = headroom * (0.5 + demandSignal) * (1.4 - costDrag) * noise;
        if (!best || score > best.score) best = { city, type, score };
      }
    }

    if (best && best.score > 0.25) {
      const building = createBuilding(best.type, company.id, best.city, state.products, state.tick);
      // Keep new sites clear of interstate right-of-way.
      let guard = 0;
      while (isOnHighway(state.cities, building.x, building.y) && guard++ < 8) {
        building.x += 1;
        building.y += 1;
      }
      building.highwayAccess = highwayProximity(state.cities, building.x, building.y);
      if (company.cash >= building.constructionCost) {
        company.cash -= building.constructionCost;
        state.buildings.push(building);
        company.buildings.push(building.id);
        invalidateRoadCache(best.city.id);
      }
    }
  }
  // ── Training investment with a real productivity link ────────────────────
  // Boards fund training where it pays: sites running hot, or with poor morale.
  // Spend raises the funded level; effectiveTraining then ramps toward it over
  // months (see simulateLabour), so the cash buys a measurable capability gain.
  for (const b of companyBuildings) {
    if (b.trainingLevel >= 9) continue;
    const strained = b.utilization > 70 || b.employeeSatisfaction < 45;
    const worthIt = strained && company.cash > 1_500_000;
    // Competent boards invest deliberately; novices do it at random.
    const chance = worthIt ? 0.10 + company.acumen * 0.14 : 0.015;
    if (Math.random() > chance) continue;

    const cost = 25_000 + b.employees * 850;
    if (company.cash < cost) continue;
    company.cash -= cost;
    company.expenses += cost;
    b.trainingLevel = Math.min(9, b.trainingLevel + 1);
    // Immediate morale lift; skill itself ramps in over the following months.
    b.employeeSatisfaction = Math.min(100, b.employeeSatisfaction + 6);
    b.trainingBudget = Math.min(1, b.trainingBudget + 0.08);
  }
}

/**
 * Quarterly price review plus continuous competitive response.
 *
 * Every quarter each AI compares realised utilisation against a 70–85% target band
 * and adjusts list prices. Between reviews it still reacts to undercutting rivals,
 * defending share down to a hard margin floor — so price wars are real and mutual.
 */
function aiPriceResponse(state: GameState) {
  const FLOOR = 0.68;   // ~32% gross margin — nobody trades below this for long
  const CEILING = 1.55;

  for (const company of state.companies) {
    if (company.isPlayer) continue;
    // Sharp boards review monthly; novices only get round to it twice a year.
    const reviewMonths = company.acumen > 0.85 ? 1 : company.acumen > 0.7 ? 2 : company.acumen > 0.45 ? 3 : 6;
    const dueForReview = state.tick >= company.nextPriceReviewTick;
    if (dueForReview) company.nextPriceReviewTick = state.tick + 24 * 30 * reviewMonths;

    for (const building of state.buildings) {
      if (building.companyId !== company.id) continue;
      if (building.type !== 'retail_store' && building.type !== 'internet_ecommerce' && !isHospitality(building.type)) continue;
      const product = state.products.find(p => p.id === building.productId);
      if (!product) continue;

      let target = building.pricingMultiplier;

      // ── Quarterly review against the 70–85% utilisation band ──
      if (dueForReview) {
        if (building.utilization < 50) target *= 0.88;        // deep discount to fill the store
        else if (building.utilization < 70) target *= 0.95;   // trim to reach the band
        else if (building.utilization > 90) target *= 1.08;   // demand outstrips capacity
        else if (building.utilization > 85) target *= 1.04;
      }

      // ── Continuous stock pressure ──
      if (building.supply > building.demand * 0.5) target -= 0.04;
      else if (building.supply < building.demand * 0.15) target += 0.03;

      // ── Defend against undercutting, including by the player ──
      const rivals = state.buildings.filter(b =>
        b.id !== building.id && b.cityId === building.cityId && b.type === building.type &&
        b.products.includes(product.id) && b.companyId !== company.id
      );
      const cheapestRival = rivals.reduce((min, r) => Math.min(min, r.pricingMultiplier), Infinity);
      if (Number.isFinite(cheapestRival) && cheapestRival < building.pricingMultiplier - 0.04) {
        // Aggressive boards undercut back; conservative ones merely match.
        const response = company.aiStrategy === 'aggressive' ? 0.96 : 0.99;
        target = Math.min(target, Math.max(FLOOR, cheapestRival * response));
      }

      building.pricingMultiplier = Math.max(FLOOR, Math.min(CEILING,
        building.pricingMultiplier + (target - building.pricingMultiplier) * 0.5));
    }
  }
}

/**
 * Competitive intelligence. Boards track the player's share by product and city;
 * a jump of more than 15 points in a quarter triggers a defensive package:
 * price cuts on the contested line, extra advertising, and a new store on the turf.
 */
function aiCompetitiveResponse(state: GameState, index: StateIndex) {
  const player = state.companies.find(c => c.isPlayer);
  if (!player) return;

  for (const company of state.companies) {
    if (company.isPlayer) continue;

    for (const building of index.buildingsByCompany.get(company.id) ?? []) {
      if (building.type !== 'retail_store' && !isHospitality(building.type)) continue;
      const productId = building.productId;
      if (!productId) continue;
      const key = `${productId}|${building.cityId}`;

      const localRivals = (index.buildingsByCity.get(building.cityId) ?? [])
        .filter(b => b.products.includes(productId));
      const playerOutlets = localRivals.filter(b => b.companyId === player.id).length;
      const share = localRivals.length > 0 ? (playerOutlets / localRivals.length) * 100 : 0;

      const previous = company.observedPlayerShare[key] ?? share;
      company.observedPlayerShare[key] = share;
      // Sharp boards notice a 6-point shift; novices only wake at 25 points.
      const alertThreshold = 25 - company.acumen * 19;
      if (share - previous <= alertThreshold) continue;

      // Defensive package — price, promotion, and presence.
      building.pricingMultiplier = Math.max(0.7, building.pricingMultiplier * 0.93);
      building.adBudget = Math.min(120_000, building.adBudget + 25_000);

      const city = index.citiesById.get(building.cityId);
      if (city && company.cash > 8_000_000 && Math.random() > 0.55) {
        const defender = createBuilding(building.type, company.id, city, state.products, state.tick);
        if (company.cash >= defender.constructionCost) {
          company.cash -= defender.constructionCost;
          defender.productId = productId;
          defender.products = [productId];
          state.buildings.push(defender);
          company.buildings.push(defender.id);
          addNewsTicker(state, `${company.name} opens a new outlet in ${city.name} to defend market share`, 'warning');
        }
      }
    }
  }
}

/**
 * Closure review. A site that loses money for twelve straight months is compared
 * on NPV: keep bleeding, or take the demolition refund and redeploy the capital.
 */
function aiCloseUnprofitable(state: GameState, index: StateIndex) {
  for (const company of state.companies) {
    if (company.isPlayer) continue;
    for (const building of [...(index.buildingsByCompany.get(company.id) ?? [])]) {
      if (building.type === 'hq') continue;
      const monthlyProfit = building.profit * 24 * 30;
      if (monthlyProfit < 0) building.monthsUnprofitable += 1;
      else building.monthsUnprofitable = Math.max(0, building.monthsUnprofitable - 1);
      // Disciplined boards cut losses inside a year; novices let sites bleed
      // for two before acting — the classic sunk-cost trap.
      const patience = Math.round(24 - company.acumen * 13);
      if (building.monthsUnprofitable < patience) continue;

      // NPV of three more years of losses vs the salvage value today.
      const npvOfOperating = monthlyProfit * 36 * 0.82;
      const salvage = building.constructionCost * 0.4 + building.landValue * 0.9;
      if (npvOfOperating >= salvage) { building.monthsUnprofitable = 0; continue; }

      company.cash += salvage;
      company.buildings = company.buildings.filter(id => id !== building.id);
      state.buildings = state.buildings.filter(b => b.id !== building.id);
      invalidateRoadCache(building.cityId);
      addNewsTicker(state, `${company.name} shutters a loss-making ${building.name.toLowerCase()} after a year of red ink`, 'info');
    }
  }
}

/**
 * Global diesel market. Real diesel ran $1.50 (2020) → $5.50 (2022) → $3.80 (2024),
 * so the price follows a mean-reverting walk with occasional geopolitical spikes
 * that decay over roughly six months.
 */
function updateFuelMarket(state: GameState) {
  const fuel = state.economy;
  const longRun = 3.4 * (1 + fuel.inflation / 100);
  // Mean reversion plus month-to-month noise.
  fuel.dieselPrice += (longRun - fuel.dieselPrice) * 0.06 + (Math.random() - 0.5) * 0.18;

  // Shock decay.
  if (fuel.fuelShockMonths > 0) {
    fuel.fuelShockMonths -= 1;
    if (fuel.fuelShockMonths === 0) {
      addNewsTicker(state, 'Energy markets normalise as supply disruption eases', 'info');
    }
  } else if (Math.random() < 0.012) {
    // ~1.2% chance per month of a supply crisis.
    const events = [
      'Middle East tension disrupts crude shipping lanes',
      'Refinery outages tighten distillate supply',
      'Export embargo announced on key producing nation',
      'Hurricane season shuts Gulf Coast refining capacity',
    ];
    fuel.fuelShockMonths = 4 + Math.floor(Math.random() * 4);
    fuel.dieselPrice *= 1.35 + Math.random() * 0.2;
    addNewsTicker(state, `${events[Math.floor(Math.random() * events.length)]} — diesel spikes to $${fuel.dieselPrice.toFixed(2)}/gal`, 'breaking');
    addNotification(state, {
      id: generateId(),
      message: `Fuel crisis: diesel at $${fuel.dieselPrice.toFixed(2)}/gal. Freight costs across your network will rise sharply.`,
      type: 'warning',
      tick: state.tick,
    });
  }
  fuel.dieselPrice = Math.max(1.4, Math.min(7.5, fuel.dieselPrice));
}

/**
 * Reputation lags reality. Quality improvements take months to register with
 * consumers, and a quality collapse damages reviews long after the fix.
 */
function updateProductPerception(state: GameState) {
  for (const product of state.products) {
    // Perception drifts toward the true stat, but slowly and asymmetrically:
    // bad news travels faster than good.
    const gap = product.quality - product.perceivedQuality;
    const speed = gap < 0 ? 0.22 : 0.09;
    product.perceivedQuality += gap * speed;

    // Reviews track perceived quality and value for money.
    const valueScore = product.perceivedQuality / 100 * 3 + (product.brand / 100) * 1.2 + 0.8;
    product.reviewScore += (Math.max(1, Math.min(5, valueScore)) - product.reviewScore) * 0.15;
  }
}

/**
 * Trade credit settlement. B2B trade runs on net-30/60 terms, so cash lands
 * a month or two after the goods move. Working capital timing becomes strategic.
 */
function settleTradeCredit(state: GameState) {
  for (const company of state.companies) {
    const due = company.credit.filter(entry => entry.dueTick <= state.tick);
    if (due.length === 0) continue;
    for (const entry of due) {
      if (entry.kind === 'receivable') company.cash += entry.amount;
      else company.cash -= entry.amount;
    }
    company.credit = company.credit.filter(entry => entry.dueTick > state.tick);
  }
}

/**
 * Suppliers can fail without warning. A plant running deep losses, or one whose
 * owner is insolvent, may cease operating mid-contract and strand its customers.
 */
function simulateSupplierFailures(state: GameState) {
  for (const building of state.buildings) {
    if (building.companyId === 'system' || !building.isOperating) continue;
    const isSupplier = building.type === 'factory' || building.type === 'farm' || building.type === 'mine';
    if (!isSupplier) continue;

    const owner = state.companies.find(c => c.id === building.companyId);
    const distressed = (owner?.monthsInDistress ?? 0) > 0;
    const bleeding = building.monthsUnprofitable > 8;
    if (!distressed && !bleeding) continue;

    const failureChance = (distressed ? 0.06 : 0) + (bleeding ? 0.04 : 0);
    if (Math.random() > failureChance) continue;

    building.isOperating = false;
    propagateSupplierFailure(state, building.id);
    addNewsTicker(state, `${building.name} halts production — downstream customers scramble for supply`, 'warning');
  }
}

/** National brand awareness grows with footprint and ad spend, and decays without them. */
function updateBrandAwareness(state: GameState, index: StateIndex) {
  for (const company of state.companies) {
    const outlets = (index.buildingsByCompany.get(company.id) ?? [])
      .filter(b => b.type === 'retail_store' || isHospitality(b.type));
    const adSpend = outlets.reduce((sum, b) => sum + b.adBudget, 0);
    // Word of mouth: each store contributes with diminishing returns; ads accelerate it.
    const reachTarget = Math.min(100, Math.log10(1 + outlets.length) * 38 + adSpend / 25_000);
    company.brandAwareness += (reachTarget - company.brandAwareness) * 0.08;
    company.brandAwareness = Math.max(0, Math.min(100, company.brandAwareness - 0.4));
  }
}

/**
 * Insolvent firms get three months to recover. After that, lenders force
 * liquidation: assets are sold to the deepest-pocketed rival at a distressed
 * discount, or scrapped if nobody bids. Markets clear — companies die.
 */
function simulateBankruptcy(state: GameState) {
  for (let i = state.companies.length - 1; i >= 0; i--) {
    const company = state.companies[i];
    if (company.isPlayer) continue; // the player faces a different screen in a fuller build
    if (company.cash < 0) {
      company.monthsInDistress += 1;
      if (company.monthsInDistress === 1) {
        addNewsTicker(state, `${company.name} warns of liquidity strain — creditors are circling`, 'warning');
      }
      if (company.monthsInDistress < 3) continue;

      // Disorderly liquidation: fire sales, a creditor waterfall, and write-offs.
      company.creditorClaims = company.credit
        .filter(e => e.kind === 'payable')
        .reduce((sum, e) => sum + e.amount, 0);
      const liquidationIndex = buildStateIndex(state);
      const recovered = messyLiquidation(state, company, liquidationIndex);
      company.cash += recovered;
      addNewsTicker(state, `${company.name} enters liquidation — assets sold for $${(recovered / 1_000_000).toFixed(1)}M`, 'breaking');
      addNotification(state, { id: generateId(), message: `${company.name} has gone bankrupt and left the market.`, type: 'warning', tick: state.tick });

      // Wind up: clear ownership records and retire the firm from the market.
      company.buildings = [];
      state.bonds = state.bonds.filter(b => b.issuerId !== company.id);
      state.companies.splice(i, 1);
    } else {
      company.monthsInDistress = 0;
    }
  }
}

/**
 * Rivals with spare cash and a matching strategy poach discontented staff.
 * Loyalty below 50 is a standing invitation; the raider pays a signing bonus
 * equal to one year's salary, mirroring the player's own headhunting rules.
 */
function simulatePoaching(state: GameState) {
  if (state.digitalAge.talentSystem === 'greatly_simplified') return;
  const raiders = state.companies.filter(c => !c.isPlayer && c.cash > 10_000_000 && c.aiStrategy !== 'conservative');
  if (raiders.length === 0) return;

  for (const talent of state.talents) {
    if (talent.employerId === null) continue;
    const employer = state.companies.find(c => c.id === talent.employerId);
    if (!employer || !employer.isPlayer) continue; // rivals don't poach each other here
    if (talent.loyalty >= 50) continue;
    if (Math.random() > 0.12) continue;

    const raider = raiders[Math.floor(Math.random() * raiders.length)];
    const bonus = talent.salary;
    if (raider.cash < bonus + talent.salary / 12) continue;

    const building = state.buildings.find(b => b.id === talent.buildingId);
    raider.cash -= bonus;
    talent.employerId = raider.id;
    talent.buildingId = null;
    talent.salary = Math.round(talent.salary * 1.2);
    talent.loyalty = 65;
    if (building) building.talentIds = building.talentIds.filter(id => id !== talent.id);

    addNotification(state, {
      id: generateId(),
      message: `${raider.name} poached ${talent.name} (${talent.specialization}, skill ${talent.skill.toFixed(0)}) with a $${(bonus / 1_000_000).toFixed(2)}M signing bonus. Raise salaries to hold your people.`,
      type: 'danger',
      tick: state.tick,
    });
    break; // one raid per month keeps the noise sane
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

  // ── Planning: residents may object, adding concessions or blocking outright ──
  const nimby = nimbyObjection(state, buildTile, type);
  if (nimby.blocked) {
    addNotification(state, { id: generateId(), message: nimby.note, type: 'warning', tick: state.tick });
    return state;
  }

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
  const landCost = (materialsCost + labourCost + landPurchaseCost) * (1 + nimby.surcharge);
  if (nimby.surcharge > 0) {
    addNotification(state, { id: generateId(), message: nimby.note, type: 'info', tick: state.tick });
  }
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
  building.highwayAccess = computeHighwayAccess(state, building);
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
  const priorShares = target.sharesOwned;
  target.sharesOwned += amount;

  // Weighted-average cost basis; the clock starts on the first purchase.
  const priorBasis = playerCostBasis.get(target.id) ?? 0;
  playerCostBasis.set(target.id, (priorBasis * priorShares + cost) / Math.max(1, target.sharesOwned));
  if (priorShares === 0) playerHoldingOpened.set(target.id, state.tick);

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

  // ── Capital gains tax closes the stock-churn loophole ──
  // Cost basis is tracked per holding; gains are taxed at the short-term rate
  // unless the position has been held over a year.
  const basisPerShare = playerCostBasis.get(target.id) ?? target.sharePrice * 0.85;
  const gain = revenue - basisPerShare * sellAmount;
  const heldTicks = state.tick - (playerHoldingOpened.get(target.id) ?? state.tick);
  const tax = applyCapitalGainsTax(state, player, gain, heldTicks);
  if (target.sharesOwned === 0) {
    playerCostBasis.delete(target.id);
    playerHoldingOpened.delete(target.id);
  }

  addNotification(state, {
    id: generateId(),
    message: `Sold ${sellAmount.toLocaleString()} shares of ${target.name} for $${(revenue / 1_000_000).toFixed(2)}M` +
      (tax > 0
        ? ` — capital gains tax $${(tax / 1_000_000).toFixed(2)}M at the ${heldTicks >= 24 * 30 * 12 ? 'long' : 'short'}-term rate.`
        : gain < 0 ? ` — realised loss of $${(Math.abs(gain) / 1_000_000).toFixed(2)}M carried forward.` : '.'),
    type: gain >= 0 ? 'success' : 'warning',
    tick: state.tick,
  });
  return state;
}

/** Per-company cost basis and holding age for the player's equity book. */
const playerCostBasis = new Map<string, number>();
const playerHoldingOpened = new Map<string, number>();

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
  if (building.type === 'retail_store' || building.type === 'internet_ecommerce') {
    building.productSlots += 2;
  }
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
  const isShop = building.type === 'retail_store' || building.type === 'internet_ecommerce';
  if (isShop) {
    if (building.products.includes(productId)) return state;
    if (building.products.length >= building.productSlots) {
      addNotification(state, { id: generateId(), message: `All ${building.productSlots} shelf slots are filled. Upgrade the store to stock more lines.`, type: 'warning', tick: state.tick });
      return state;
    }
    building.products.push(productId);
    if (!building.productId) building.productId = productId;
  } else {
    building.productId = productId;
    building.products = [productId];
    building.inventory = {};
  }
  building.supplierLinks = [];
  refreshBuildingSupply(state, building);
  return state;
}

export function removeRetailProduct(state: GameState, buildingId: string, productId: string): GameState {
  const building = state.buildings.find(item => item.id === buildingId);
  if (!building) return state;
  building.products = building.products.filter(id => id !== productId);
  if (building.productId === productId) building.productId = building.products[0] ?? null;
  building.supplierLinks = [];
  refreshBuildingSupply(state, building);
  return state;
}

/** Reprice a single menu line. Margin discipline is the player's problem. */
export function setMenuItemPrice(state: GameState, buildingId: string, itemId: string, price: number): GameState {
  const building = state.buildings.find(item => item.id === buildingId);
  const item = building?.menu.find(m => m.id === itemId);
  if (item) item.price = Math.max(0.25, price);
  return state;
}

/** Toggle a menu line on or off the board. */
export function toggleMenuItem(state: GameState, buildingId: string, itemId: string): GameState {
  const building = state.buildings.find(item => item.id === buildingId);
  const item = building?.menu.find(m => m.id === itemId);
  if (item) item.enabled = !item.enabled;
  return state;
}

/** Turn the delivery channel on or off for a venue or store. */
export function toggleDelivery(state: GameState, buildingId: string): GameState {
  const building = state.buildings.find(item => item.id === buildingId);
  if (!building) return state;
  building.delivery.enabled = !building.delivery.enabled;
  addNotification(state, {
    id: generateId(),
    message: building.delivery.enabled
      ? `${building.name} now offers delivery. Platform mode costs 30% commission; in-house keeps revenue but needs couriers.`
      : `${building.name} has stopped taking delivery orders.`,
    type: 'info',
    tick: state.tick,
  });
  return state;
}

/** Configure the delivery operation: channel, radius, fleet and customer fee. */
export function configureDelivery(
  state: GameState,
  buildingId: string,
  patch: Partial<{ mode: 'in_house' | 'platform'; radius: number; couriers: number; customerFee: number }>,
): GameState {
  const building = state.buildings.find(item => item.id === buildingId);
  if (!building) return state;
  const d = building.delivery;
  if (patch.mode !== undefined) d.mode = patch.mode;
  if (patch.radius !== undefined) d.radius = Math.max(2, Math.min(18, patch.radius));
  if (patch.couriers !== undefined) d.couriers = Math.max(0, Math.min(30, Math.round(patch.couriers)));
  if (patch.customerFee !== undefined) d.customerFee = Math.max(0, Math.min(15, patch.customerFee));
  return state;
}

/** Safety stock vs just-in-time. Lean inventory frees cash but risks stockouts. */
export function setSafetyStockPolicy(state: GameState, buildingId: string, policy: number): GameState {
  const building = state.buildings.find(item => item.id === buildingId);
  if (building) building.safetyStockPolicy = Math.max(0, Math.min(1, policy));
  return state;
}

/** Run the line harder than nameplate. More output, worse quality, unhappier staff. */
export function setProductionIntensity(state: GameState, buildingId: string, intensity: number): GameState {
  const building = state.buildings.find(item => item.id === buildingId);
  if (building) building.productionIntensity = Math.max(0.6, Math.min(1.4, intensity));
  return state;
}

export { offshoreProduction, hedgeCommodity };
export { buyAsset, sellAsset } from './markets';

/** Local advertising spend for a single site — feeds national brand awareness. */
export function setAdBudget(state: GameState, buildingId: string, monthlyBudget: number): GameState {
  const building = state.buildings.find(item => item.id === buildingId);
  if (building) building.adBudget = Math.max(0, Math.min(150_000, monthlyBudget));
  return state;
}

export function setWarehouseTier(state: GameState, buildingId: string, tier: Building['warehouseTier']): GameState {
  const building = state.buildings.find(item => item.id === buildingId);
  if (!building || building.type !== 'warehouse') return state;
  // Retooling a facility costs capital and takes the floor offline briefly.
  const retoolCost = tier === 'hazmat' ? 900_000 : tier === 'cold' ? 600_000 : 150_000;
  const company = state.companies.find(c => c.isPlayer);
  if (company && company.cash < retoolCost) {
    addNotification(state, { id: generateId(), message: `Retooling to ${tier} storage needs $${(retoolCost / 1_000_000).toFixed(2)}M.`, type: 'danger', tick: state.tick });
    return state;
  }
  if (company) company.cash -= retoolCost;
  building.warehouseTier = tier;
  addNotification(state, { id: generateId(), message: `Warehouse retooled for ${tier} storage.`, type: 'success', tick: state.tick });
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

/** Raw commodities and unprocessed farm output are fungible — branding cannot apply. */
export function isBrandable(product: Product): boolean {
  return product.kind === 'consumer' || product.kind === 'digital';
}

/** Only manufactured and digital goods carry process technology worth licensing. */
export function isResearchable(product: Product): boolean {
  return product.kind === 'consumer' || product.kind === 'digital' || product.kind === 'semi';
}

export function fundAdvertising(state: GameState, productId: string, amount: number): GameState {
  const company = state.companies.find(item => item.isPlayer);
  const product = state.products.find(item => item.id === productId);
  if (!company || !product || company.cash < amount) return state;
  if (!isBrandable(product)) {
    addNotification(state, {
      id: generateId(),
      message: `${product.name} is a fungible commodity traded on price and grade — advertising cannot build a brand for it.`,
      type: 'warning',
      tick: state.tick,
    });
    return state;
  }
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
  if (!isResearchable(product)) {
    addNotification(state, {
      id: generateId(),
      message: `${product.name} is extracted or grown, not engineered. There is no process technology to license — invest in better deposits, land or training instead.`,
      type: 'warning',
      tick: state.tick,
    });
    return state;
  }
  const targetTech = product.techLevel + 3;
  const cost = product.productionCost * targetTech * 4200;
  if (company.cash < cost) {
    addNotification(state, {
      id: generateId(),
      message: `Technology licence for ${product.name} costs $${(cost / 1_000_000).toFixed(2)}M — insufficient cash.`,
      type: 'danger',
      tick: state.tick,
    });
    return state;
  }
  const previousTech = product.techLevel;
  company.cash -= cost;
  product.techLevel = targetTech;
  product.quality = Math.min(100, product.quality + 4);
  company.intangibleTechnology += cost * 0.7;
  addNotification(state, {
    id: generateId(),
    message: `Licensed ${product.name} technology for $${(cost / 1_000_000).toFixed(2)}M — tech level ${previousTech.toFixed(1)} → ${targetTech.toFixed(1)}, quality +4.`,
    type: 'success',
    tick: state.tick,
  });
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

const TICKS_PER_MONTH = 24 * 30;
const MAX_OFFER_ROUNDS = 3;

/**
 * Discounted-cash-flow valuation of a single asset.
 *
 * Value = replacement cost (depreciated) + land + DCF of forward NOI,
 * discounted at the prevailing risk-free rate plus an asset-risk premium.
 * The result drifts with interest rates, occupancy, inflation and the
 * seller's own liquidity, so no two quotes are ever identical.
 */
export function getAskingPrice(state: GameState, buildingId: string): number | null {
  const building = state.buildings.find(item => item.id === buildingId);
  if (!building || building.companyId === 'system') return null;
  const seller = state.companies.find(item => item.id === building.companyId);
  if (!seller || seller.isPlayer) return null;
  return valueAsset(state, building, seller);
}

function valueAsset(state: GameState, building: Building, owner: Company): number {
  const annualNOI = building.profit * 24 * 365;
  // Discount rate = risk-free + asset risk premium; capped to sane bounds.
  const riskPremium = building.type === 'apartment' || building.type === 'commercial' ? 3.0
    : isHospitality(building.type) ? 7.5
    : building.type === 'factory' || building.type === 'mine' ? 6.5 : 5.0;
  const discountRate = Math.max(0.045, (state.economy.interestRate + riskPremium) / 100);
  // Perpetuity capped at 12 years of earnings so loss-makers aren't valued at zero.
  const dcf = annualNOI > 0 ? Math.min(annualNOI / discountRate, annualNOI * 12) : 0;
  const depreciation = Math.max(0.35, building.condition / 100);
  const replacement = building.constructionCost * depreciation * 0.6 + building.landValue;

  const strategyGreed = owner.aiStrategy === 'aggressive' ? 1.28 : owner.aiStrategy === 'conservative' ? 0.97 : 1.12;
  const liquidityPressure = owner.cash < 4_000_000 ? 0.84 : owner.cash > 60_000_000 ? 1.12 : 1;
  // Sellers hold out harder in booms and capitulate in recessions.
  const cyclePremium = state.economy.cycle === 'boom' ? 1.15
    : state.economy.cycle === 'recession' ? 0.88
    : state.economy.cycle === 'recovery' ? 1.03 : 1;
  // Occupancy/utilisation is visible evidence of quality.
  const performancePremium = 0.85 + Math.min(0.4, building.utilization / 250);
  // Each rejected round hardens the board's position (anchoring effect).
  const negotiationFatigue = 1 + building.offersMade * 0.035;

  // The board's drift term carries month-to-month momentum: rising demand, thin
  // competition and a hot cycle push the ask up; oversupply and distress push it down.
  const ask = (replacement + dcf) * strategyGreed * liquidityPressure * cyclePremium
    * performancePremium * negotiationFatigue * (1 + building.askDrift);
  building.cachedAsk = Math.max(120_000, ask);
  return building.cachedAsk;
}

/** Monthly re-rating of every tradeable asset's asking price. */
function driftAskingPrices(state: GameState) {
  const cityDemand = new Map<string, number>();
  for (const city of state.cities) {
    cityDemand.set(city.id, Math.max(-1, Math.min(1, (-city.housingDemand - city.officeDemand) / 100)));
  }
  for (const building of state.buildings) {
    if (building.companyId === 'system' || building.companyId === state.companies.find(c => c.isPlayer)?.id) continue;
    const demandSignal = cityDemand.get(building.cityId) ?? 0;
    // Competition: more identical rivals nearby depress the seller's leverage.
    const rivals = state.buildings.filter(b => b.id !== building.id && b.cityId === building.cityId && b.type === building.type).length;
    const competitionDrag = Math.min(0.02, rivals * 0.004);
    const utilisationPush = (building.utilization - 55) / 100 * 0.02;
    const cyclePush = state.economy.cycle === 'boom' ? 0.012 : state.economy.cycle === 'recession' ? -0.018 : 0.002;
    const noise = (Math.random() - 0.5) * 0.015;
    building.askDrift = Math.max(-0.35, Math.min(0.45,
      building.askDrift * 0.85 + demandSignal * 0.012 + utilisationPush - competitionDrag + cyclePush + noise));
    building.cachedAsk = 0; // force recompute on next quote
  }
}

/**
 * Player bids for an AI-owned asset. Sellers allow only a handful of rounds,
 * and lowball bids below 55% of book value end talks for three months.
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

  if (state.tick < building.negotiationBlockedUntil) {
    const monthsLeft = Math.max(1, Math.ceil((building.negotiationBlockedUntil - state.tick) / TICKS_PER_MONTH));
    state.lastOffer = {
      buildingId, status: 'rejected', offerAmount, counterAmount: building.cachedAsk,
      message: `${seller.name} has broken off talks. Their board will not revisit this asset for another ${monthsLeft} month${monthsLeft > 1 ? 's' : ''}.`,
      sellerName: seller.name,
    };
    return state;
  }

  const askingPrice = valueAsset(state, building, seller);

  if (player.cash < offerAmount) {
    state.lastOffer = { buildingId, status: 'rejected', offerAmount, counterAmount: askingPrice, message: 'You lack the cash to finance this offer.', sellerName: seller.name };
    return state;
  }

  // Insulting lowball: talks close for three months.
  if (offerAmount < askingPrice * 0.55) {
    building.negotiationBlockedUntil = state.tick + TICKS_PER_MONTH * 3;
    building.offersMade = 0;
    state.lastOffer = {
      buildingId, status: 'rejected', offerAmount, counterAmount: askingPrice,
      message: `${seller.name} considers $${(offerAmount / 1_000_000).toFixed(2)}M insulting for an asset they value at $${(askingPrice / 1_000_000).toFixed(2)}M. Negotiations are closed for three months.`,
      sellerName: seller.name,
    };
    return state;
  }

  if (offerAmount >= askingPrice) {
    player.cash -= offerAmount;
    seller.cash += offerAmount;
    seller.buildings = seller.buildings.filter(id => id !== buildingId);
    player.buildings.push(buildingId);
    building.companyId = player.id;
    building.standingOffer = null;
    building.standingOfferBy = null;
    building.offersMade = 0;
    building.negotiationBlockedUntil = 0;
    state.lastOffer = { buildingId, status: 'accepted', offerAmount, counterAmount: 0, message: `${seller.name} accepted your offer of $${(offerAmount / 1_000_000).toFixed(2)}M for ${building.name}.`, sellerName: seller.name };
    addNotification(state, { id: generateId(), message: `Acquired ${building.name} from ${seller.name} for $${(offerAmount / 1_000_000).toFixed(2)}M`, type: 'success', tick: state.tick });
    addNewsTicker(state, `${player.name} acquires ${building.name} from ${seller.name} for $${(offerAmount / 1_000_000).toFixed(2)}M`, 'breaking');
    invalidateRoadCache(building.cityId);
    return state;
  }

  building.offersMade += 1;
  building.standingOffer = offerAmount;
  building.standingOfferBy = player.id;

  // Each board has its own patience (2–4 rounds). No round counts are shown to the
  // player — they only learn the talks collapsed when the board finally walks away.
  if (building.offersMade >= seller.maxOfferRounds) {
    building.negotiationBlockedUntil = state.tick + TICKS_PER_MONTH * 3;
    building.offersMade = 0;
    state.lastOffer = {
      buildingId, status: 'rejected', offerAmount, counterAmount: askingPrice,
      message: `${seller.name} has ended negotiations — their board sees no path to agreement and will not reconsider for three months.`,
      sellerName: seller.name,
    };
    return state;
  }

  state.lastOffer = {
    buildingId, status: 'counter', offerAmount, counterAmount: askingPrice,
    message: `${seller.name} counters at $${(askingPrice / 1_000_000).toFixed(2)}M.`,
    sellerName: seller.name,
  };
  return state;
}

/** Monthly pass where AI firms bid for the player's assets at a fair, non-inflated price. */
function simulateIncomingOffers(state: GameState) {
  const player = state.companies.find(item => item.isPlayer);
  if (!player) return;

  // Expire stale bids first.
  state.incomingOffers = state.incomingOffers.filter(offer => offer.expiresTick > state.tick);
  if (state.incomingOffers.length >= 3) return;

  const playerAssets = state.buildings.filter(b => b.companyId === player.id && b.type !== 'hq');
  if (playerAssets.length === 0) return;

  const bidders = state.companies.filter(c => !c.isPlayer && c.cash > 3_000_000);
  if (bidders.length === 0) return;

  const target = playerAssets[Math.floor(Math.random() * playerAssets.length)];
  if (state.incomingOffers.some(offer => offer.buildingId === target.id)) return;

  const buyer = bidders[Math.floor(Math.random() * bidders.length)];
  const fairValue = valueAsset(state, target, buyer);

  // Buyers bid 88%–108% of fair value — a realistic band, never wildly overpriced.
  const bidRatio = 0.88 + Math.random() * 0.20;
  const amount = Math.round(fairValue * bidRatio);
  if (buyer.cash < amount) return;

  const rationale = target.type === 'apartment' || target.type === 'commercial'
    ? `${buyer.name} is consolidating rental stock in this district.`
    : isHospitality(target.type)
      ? `${buyer.name} wants to fold this venue into their hospitality chain.`
      : target.utilization > 65
        ? `${buyer.name} has identified this as a high-utilisation asset worth owning.`
        : `${buyer.name} believes they can run this asset better than you can.`;

  state.incomingOffers.push({
    id: generateId(),
    buildingId: target.id,
    buildingName: target.name,
    buyerId: buyer.id,
    buyerName: buyer.name,
    amount,
    fairValue,
    expiresTick: state.tick + TICKS_PER_MONTH * 2,
    rationale,
  });

  addNotification(state, {
    id: generateId(),
    message: `${buyer.name} has offered $${(amount / 1_000_000).toFixed(2)}M for your ${target.name}.`,
    type: 'info',
    tick: state.tick,
  });
}

export function acceptIncomingOffer(state: GameState, offerId: string): GameState {
  const offer = state.incomingOffers.find(item => item.id === offerId);
  const player = state.companies.find(item => item.isPlayer);
  const building = state.buildings.find(item => item.id === offer?.buildingId);
  const buyer = state.companies.find(item => item.id === offer?.buyerId);
  if (!offer || !player || !building || !buyer) return state;

  buyer.cash -= offer.amount;
  player.cash += offer.amount;
  player.buildings = player.buildings.filter(id => id !== building.id);
  buyer.buildings.push(building.id);
  building.companyId = buyer.id;
  state.incomingOffers = state.incomingOffers.filter(item => item.id !== offerId);

  addNotification(state, { id: generateId(), message: `Sold ${building.name} to ${buyer.name} for $${(offer.amount / 1_000_000).toFixed(2)}M`, type: 'success', tick: state.tick });
  addNewsTicker(state, `${buyer.name} acquires ${building.name} from ${player.name} for $${(offer.amount / 1_000_000).toFixed(2)}M`, 'breaking');
  invalidateRoadCache(building.cityId);
  return state;
}

export function rejectIncomingOffer(state: GameState, offerId: string): GameState {
  state.incomingOffers = state.incomingOffers.filter(item => item.id !== offerId);
  return state;
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
