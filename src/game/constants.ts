import type { BuildingType, ProductKind } from './types';

export const TICKS_PER_DAY = 24;
export const TICKS_PER_MONTH = TICKS_PER_DAY * 30;
export const TICKS_PER_YEAR = TICKS_PER_MONTH * 12;

// ============================ PRODUCTS ============================
export interface ProductDef {
  name: string; icon: string; category: string; kind: ProductKind;
  cost: number; demand: number; inputs?: Array<[string, number]>;
}

export const PRODUCT_DEFS: ProductDef[] = [
  // ---- raw extraction ----
  { name: 'Iron Ore', icon: '⛏️', category: 'Minerals', kind: 'raw', cost: 12, demand: 55 },
  { name: 'Coal', icon: '🪨', category: 'Minerals', kind: 'raw', cost: 8, demand: 50 },
  { name: 'Crude Oil', icon: '🛢️', category: 'Energy', kind: 'raw', cost: 15, demand: 70 },
  { name: 'Lithium', icon: '🔋', category: 'Minerals', kind: 'raw', cost: 30, demand: 60 },
  { name: 'Timber', icon: '🌲', category: 'Materials', kind: 'raw', cost: 9, demand: 48 },
  // ---- agriculture ----
  { name: 'Grain', icon: '🌾', category: 'Agriculture', kind: 'farm', cost: 4, demand: 80 },
  { name: 'Vegetables', icon: '🥬', category: 'Agriculture', kind: 'farm', cost: 6, demand: 82 },
  { name: 'Milk', icon: '🥛', category: 'Agriculture', kind: 'farm', cost: 7, demand: 78 },
  { name: 'Livestock', icon: '🐄', category: 'Agriculture', kind: 'farm', cost: 24, demand: 66 },
  { name: 'Coffee Beans', icon: '🫘', category: 'Agriculture', kind: 'farm', cost: 11, demand: 62 },
  // ---- intermediates ----
  { name: 'Steel', icon: '🧱', category: 'Materials', kind: 'semi', cost: 0, demand: 58, inputs: [['Iron Ore', 2], ['Coal', 1]] },
  { name: 'Plastic', icon: '🧴', category: 'Materials', kind: 'semi', cost: 0, demand: 60, inputs: [['Crude Oil', 2]] },
  { name: 'Lumber', icon: '🪵', category: 'Materials', kind: 'semi', cost: 0, demand: 52, inputs: [['Timber', 2]] },
  { name: 'Fabric', icon: '🧵', category: 'Materials', kind: 'semi', cost: 0, demand: 55, inputs: [['Crude Oil', 1]] },
  { name: 'Flour', icon: '🍚', category: 'Food Inputs', kind: 'semi', cost: 0, demand: 74, inputs: [['Grain', 2]] },
  { name: 'Microchips', icon: '🔌', category: 'Components', kind: 'semi', cost: 0, demand: 68, inputs: [['Plastic', 1], ['Lithium', 1]] },
  // ---- consumer goods ----
  { name: 'Smartphone', icon: '📱', category: 'Electronics', kind: 'consumer', cost: 0, demand: 84, inputs: [['Microchips', 2], ['Plastic', 1]] },
  { name: 'Laptop', icon: '💻', category: 'Electronics', kind: 'consumer', cost: 0, demand: 72, inputs: [['Microchips', 3], ['Steel', 1]] },
  { name: 'Appliances', icon: '🧺', category: 'Home', kind: 'consumer', cost: 0, demand: 63, inputs: [['Steel', 2], ['Plastic', 1]] },
  { name: 'Furniture', icon: '🛋️', category: 'Home', kind: 'consumer', cost: 0, demand: 58, inputs: [['Lumber', 3], ['Fabric', 1]] },
  { name: 'Clothing', icon: '👕', category: 'Apparel', kind: 'consumer', cost: 0, demand: 86, inputs: [['Fabric', 2]] },
  { name: 'Packaged Meals', icon: '🥫', category: 'Grocery', kind: 'consumer', cost: 0, demand: 94, inputs: [['Flour', 1], ['Vegetables', 1]] },
  { name: 'Roast Coffee', icon: '☕', category: 'Grocery', kind: 'consumer', cost: 0, demand: 80, inputs: [['Coffee Beans', 2]] },
  { name: 'Beer', icon: '🍺', category: 'Beverage', kind: 'consumer', cost: 0, demand: 70, inputs: [['Grain', 2]] },
  { name: 'Automobile', icon: '🚗', category: 'Auto', kind: 'consumer', cost: 0, demand: 55, inputs: [['Steel', 5], ['Plastic', 2], ['Microchips', 1]] },
  { name: 'Medicines', icon: '💊', category: 'Health', kind: 'consumer', cost: 0, demand: 88, inputs: [['Vegetables', 2], ['Plastic', 1]] },
];

export const RETAIL_CATEGORIES = ['Electronics', 'Home', 'Apparel', 'Grocery', 'Beverage', 'Auto', 'Health'];

/** 3 days for every building. The same lead time on every kind is a design
 *  choice — the differentiator between them is cost, not how long they take. */
export const BUILD_DAYS = 3;
export const BUILD_HOURS = BUILD_DAYS * 24;

/** Every city is graded to this exact ground height, so the urban floor is
 *  perfectly level. Buildings, streets and vehicles all share this plane. */
export const CITY_PAD_ELEVATION = 0.38;

// Ingredients consumed by each hospitality format (per cover)
export const VENUE_INGREDIENTS: Partial<Record<BuildingType, string[]>> = {
  cafe: ['Roast Coffee', 'Milk', 'Flour'],
  fast_food: ['Livestock', 'Flour', 'Vegetables'],
  restaurant: ['Livestock', 'Vegetables', 'Milk'],
  bar: ['Beer', 'Grain', 'Vegetables'],
};

export const VENUE_TICKET: Partial<Record<BuildingType, number>> = {
  cafe: 7.5, fast_food: 11, restaurant: 44, bar: 26,
};

// Ingredient units consumed per cover — sets the food-cost percentage.
export const VENUE_FOOD_FACTOR: Partial<Record<BuildingType, number>> = {
  cafe: 0.09, fast_food: 0.18, restaurant: 0.9, bar: 0.5,
};

// ============================ BUILDINGS ============================
export interface BuildingConfig {
  name: string; icon: string; cost: number; capacity: number; employees: number;
  group: 'production' | 'commerce' | 'property' | 'corporate';
  color: string; roof: string; blurb: string; height: number;
}

export const BUILDING_CONFIGS: Record<BuildingType, BuildingConfig> = {
  // All assets take the same 3 days to construct. Why every kind: a mine and
  // an apartment block don't really take 30 days and 55 days respectively —
  // they take roughly the same number of working hours to mobilise, and the
  // interesting differentiator is cost. Three days is enough to be visible
  // without making the player wait.
  // ── Starting staff: small, realistic day-one headcounts ──
  // Upgrades multiply capacity ×1.28 and headcount ×1.22 per level, so a
  // level-5 fast food has ~5 staff, a level-5 factory has ~22, etc.
  farm: { name: 'Farm', icon: '🌾', cost: 1_400_000, capacity: 900, employees: 3, group: 'production', color: '#a3701f', roof: '#c8912c', blurb: 'Grows crops and raises livestock. Seasonal yields, weather risk.', height: 0.55 },
  mine: { name: 'Mine', icon: '⛏️', cost: 3_200_000, capacity: 1200, employees: 5, group: 'production', color: '#6b6f76', roof: '#8b9099', blurb: 'Extracts the deposit beneath it. Finite reserves.', height: 0.7 },
  factory: { name: 'Factory', icon: '🏭', cost: 5_600_000, capacity: 2200, employees: 8, group: 'production', color: '#7c6f8f', roof: '#a094b5', blurb: 'Converts inputs into intermediates and finished goods.', height: 1.05 },
  warehouse: { name: 'Distribution Hub', icon: '📦', cost: 2_400_000, capacity: 9000, employees: 4, group: 'production', color: '#5a7f93', roof: '#7ea6bd', blurb: 'Bulk storage. Cuts freight costs for nearby stores.', height: 0.75 },
  retail_store: { name: 'Retail Store', icon: '🏬', cost: 1_800_000, capacity: 700, employees: 3, group: 'commerce', color: '#2f7f6f', roof: '#41a894', blurb: 'Sells consumer goods. Traffic and price drive volume.', height: 0.85 },
  cafe: { name: 'Café', icon: '☕', cost: 620_000, capacity: 700, employees: 2, group: 'commerce', color: '#8a5a34', roof: '#b57a49', blurb: 'Morning trade. Small footprint, fast payback.', height: 0.6 },
  fast_food: { name: 'Fast Food', icon: '🍔', cost: 980_000, capacity: 620, employees: 2, group: 'commerce', color: '#b8473f', roof: '#e06a5c', blurb: 'High volume, thin ticket, lunch-peaked.', height: 0.62 },
  restaurant: { name: 'Restaurant', icon: '🍽️', cost: 1_650_000, capacity: 340, employees: 4, group: 'commerce', color: '#7a3f63', roof: '#a35b87', blurb: 'Evening covers, high ticket, high food cost.', height: 0.8 },
  bar: { name: 'Bar', icon: '🍺', cost: 1_150_000, capacity: 380, employees: 3, group: 'commerce', color: '#4a3f80', roof: '#6c5fae', blurb: 'Night trade. Strong margins, licence costs.', height: 0.72 },
  apartment: { name: 'Apartment Block', icon: '🏢', cost: 1_200_000, capacity: 6, employees: 0, group: 'property', color: '#5d6b8a', roof: '#8494b5', blurb: 'Small residential rental. Upgrades add floors and units.', height: 0.7 },
  office: { name: 'Office Tower', icon: '🏙️', cost: 2_000_000, capacity: 6, employees: 0, group: 'property', color: '#3f5a75', roof: '#6d8dab', blurb: 'Small commercial space. Upgrades add floors.', height: 0.8 },
  hq: { name: 'Headquarters', icon: '🏛️', cost: 6_200_000, capacity: 120, employees: 4, group: 'corporate', color: '#8d7b3f', roof: '#c0aa5c', blurb: 'Executives lift group-wide productivity.', height: 1.6 },
  lab: { name: 'R&D Lab', icon: '🔬', cost: 4_800_000, capacity: 80, employees: 3, group: 'corporate', color: '#2f6f8f', roof: '#4fa2c4', blurb: 'Runs research that raises quality and cuts costs.', height: 1.1 },
  seaport: { name: 'Seaport', icon: '⚓', cost: 800_000_000, capacity: 500_000, employees: 180, group: 'production', color: '#41556b', roof: '#6b8299', blurb: 'State import terminal. Buy inputs without a supply chain.', height: 0.9 },
};

export const BUILDABLE: BuildingType[] = [
  'farm', 'mine', 'factory', 'warehouse', 'retail_store',
  'cafe', 'fast_food', 'restaurant', 'bar', 'apartment', 'office', 'hq', 'lab',
];

export const CITY_NAMES = [
  'Ashford', 'Baymont', 'Cedar Falls', 'Dunmore', 'Eastvale', 'Fairhaven',
  'Granite Bay', 'Harlow', 'Ironbridge', 'Juniper', 'Kingsport', 'Lakeshore',
];

export const COMPANY_NAMES = [
  'Meridian Holdings', 'Cascade Industries', 'Northgate Group', 'Vertex Retail',
  'Ironwood Capital', 'Solstice Foods', 'Harbor & Vine', 'Kestrel Logistics',
  'Brightline Estates', 'Coalcrest Mining', 'Verdant Agri', 'Lumen Electronics',
  'Sable Hospitality', 'Pinnacle Realty', 'Orchid Brands', 'Delta Manufacturing',
  'Redstone Partners', 'Halcyon Ventures',
];

export const COMPANY_COLORS = [
  '#e0574c', '#e08b3a', '#e0c341', '#8dc45a', '#48b08a', '#3fa6c4',
  '#5f7fe0', '#8a63d2', '#c45fa8', '#d4667f', '#6fb0a0', '#b08a4a',
  '#7f8fa6', '#59a96a', '#c47f3f', '#9a5fd2', '#4fa8b0', '#d05f8f',
];

export const PERSONALITIES: Record<string, string[]> = {
  novice: ['Impatient founder', 'Bootstrapping local operator', 'Over-leveraged optimist'],
  competent: ['Cash-flow disciplinarian', 'Pragmatic regional builder', 'Steady compounder'],
  shrewd: ['Opportunistic consolidator', 'Data-driven specialist', 'Contrarian allocator'],
  ruthless: ['Ruthless empire builder', 'Predatory price-setter', 'Leveraged raider'],
};

export const SKILL_ACUMEN: Record<string, number> = {
  novice: 0.30, competent: 0.58, shrewd: 0.80, ruthless: 0.96,
};

export const RESEARCH_MENU = [
  { name: 'Lean Manufacturing', category: 'Operations', cost: 2_400_000, months: 8, effect: '-8% factory input cost' },
  { name: 'Precision Agriculture', category: 'Agriculture', cost: 1_800_000, months: 6, effect: '+12% farm yield' },
  { name: 'Cold Chain Logistics', category: 'Logistics', cost: 2_100_000, months: 7, effect: '-25% spoilage, -10% freight' },
  { name: 'Brand Science', category: 'Marketing', cost: 3_000_000, months: 9, effect: '+15% ad effectiveness' },
  { name: 'Automation Suite', category: 'Operations', cost: 4_500_000, months: 12, effect: '-12% payroll per unit' },
  { name: 'Materials Science', category: 'R&D', cost: 3_600_000, months: 10, effect: '+10 product quality ceiling' },
];

// ============================ AGRICULTURE DEPTH ============================
export interface BreedDef {
  id: string; name: string; produces: string; yieldMul: number; priceMul: number;
  qualityBonus: number; costMul: number; investment: number; blurb: string;
}

export const LIVESTOCK_BREEDS: BreedDef[] = [
  { id: 'commodity_herd', name: 'Commodity Herd', produces: 'Livestock', yieldMul: 1.0, priceMul: 1.0, qualityBonus: 0, costMul: 1.0, investment: 0, blurb: 'Standard stock. No premium, no risk.' },
  { id: 'angus', name: 'Angus Cattle', produces: 'Livestock', yieldMul: 0.88, priceMul: 1.55, qualityBonus: 16, costMul: 1.3, investment: 420_000, blurb: 'Fewer head, far better marbling and price.' },
  { id: 'holstein', name: 'Holstein Dairy', produces: 'Milk', yieldMul: 1.45, priceMul: 0.95, qualityBonus: 4, costMul: 1.15, investment: 380_000, blurb: 'Volume dairy: huge yield, commodity pricing.' },
  { id: 'jersey', name: 'Jersey Dairy', produces: 'Milk', yieldMul: 0.92, priceMul: 1.4, qualityBonus: 14, costMul: 1.2, investment: 340_000, blurb: 'Butterfat-rich milk for premium buyers.' },
  { id: 'heritage_grain', name: 'Heritage Grain', produces: 'Grain', yieldMul: 0.8, priceMul: 1.6, qualityBonus: 18, costMul: 1.25, investment: 260_000, blurb: 'Low-yield ancient varietals with a cult following.' },
  { id: 'hybrid_grain', name: 'Hybrid High-Yield Grain', produces: 'Grain', yieldMul: 1.55, priceMul: 0.92, qualityBonus: -4, costMul: 1.1, investment: 300_000, blurb: 'Engineered for tonnage, not for flavour.' },
];

export const PRODUCT_TIERS = [
  { id: 'standard' as const, label: 'Standard', priceMul: 1.0, costMul: 1.0, qualityBonus: 0, cert: 0, blurb: 'Commodity grade sold on price alone.' },
  { id: 'premium' as const, label: 'Premium', priceMul: 1.32, costMul: 1.18, qualityBonus: 12, cert: 90_000, blurb: 'Graded and branded for discerning retail.' },
  { id: 'organic' as const, label: 'Organic', priceMul: 1.68, costMul: 1.42, qualityBonus: 22, cert: 320_000, blurb: 'Certified organic — top shelf, lower yield.' },
];

export const RETAIL_SPECIALISATIONS = RETAIL_CATEGORIES;

// ============================ SEGMENT & RATING WEIGHTS ============================
import type { MarketSegment } from './types';

const LUXURY_NAMES = new Set(['Sports Car', 'Designer Watch', 'Champagne', 'Grand Piano', 'Yacht Charter']);
const PREMIUM_NAMES = new Set(['Laptop', 'Smartphone', 'Espresso Machine', 'Leather Jacket', 'Wine', 'Designer Fragrance']);

/** Where a product sits on the value ladder — drives income-tier fit. */
export function segmentFor(name: string, category: string, cost: number): MarketSegment {
  if (LUXURY_NAMES.has(name)) return 'luxury';
  if (PREMIUM_NAMES.has(name)) return 'premium';
  if (category === 'Raw Materials' || category === 'Farm Products' || category === 'Semi Products') return 'value';
  if (category === 'Cosmetics' || category === 'Leather Goods') return 'luxury';
  if (cost > 400) return 'premium';
  if (cost < 30) return 'value';
  return 'mainstream';
}

/**
 * Price / quality / brand weights sum to 100 and decide the product's overall
 * rating — the Capitalism model. Cosmetics live on brand; frozen meat lives on
 * price and quality.
 */
export function ratingWeights(category: string, kind: ProductKind):
  { priceWeight: number; qualityWeight: number; brandWeight: number } {
  if (kind !== 'consumer') return { priceWeight: 78, qualityWeight: 22, brandWeight: 0 };
  switch (category) {
    case 'Cosmetics': case 'Leather Goods':
      return { priceWeight: 18, qualityWeight: 22, brandWeight: 60 };
    case 'Beverage':
      return { priceWeight: 32, qualityWeight: 16, brandWeight: 52 };
    case 'Apparel': case 'Toys':
      return { priceWeight: 35, qualityWeight: 25, brandWeight: 40 };
    case 'Electronics': case 'Computers': case 'Communication':
      return { priceWeight: 32, qualityWeight: 52, brandWeight: 16 };
    case 'Health':
      return { priceWeight: 34, qualityWeight: 42, brandWeight: 24 };
    case 'Grocery':
      return { priceWeight: 52, qualityWeight: 33, brandWeight: 15 };
    case 'Auto':
      return { priceWeight: 34, qualityWeight: 44, brandWeight: 22 };
    case 'Home':
      return { priceWeight: 42, qualityWeight: 43, brandWeight: 15 };
    default:
      return { priceWeight: 45, qualityWeight: 35, brandWeight: 20 };
  }
}

// ============================ HOSPITALITY MENUS ============================
// Real quick-service economics: combos carry the margin, drinks carry the
// gross profit (fountain soda costs cents), kids boxes buy family footfall.
import type { MenuItem } from './types';

export type MenuTemplate = Omit<MenuItem, 'id'>;

export const MENU_TEMPLATES: Partial<Record<BuildingType, MenuTemplate[]>> = {
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
    { name: 'Ribeye Steak', category: 'main', price: 32.0, foodCost: 11.2, popularity: 0.16, includesToy: false, enabled: true },
    { name: 'Handmade Pasta', category: 'main', price: 19.5, foodCost: 4.3, popularity: 0.22, includesToy: false, enabled: true },
    { name: 'Wood-Fired Pizza', category: 'main', price: 17.0, foodCost: 3.9, popularity: 0.20, includesToy: false, enabled: true },
    { name: 'Garden Salad', category: 'side', price: 8.5, foodCost: 1.95, popularity: 0.10, includesToy: false, enabled: true },
    { name: 'Kids Pasta Plate', category: 'kids', price: 8.95, foodCost: 2.1, popularity: 0.07, includesToy: true, enabled: true },
    { name: 'House Wine (glass)', category: 'drink', price: 11.0, foodCost: 2.6, popularity: 0.15, includesToy: false, enabled: true },
    { name: 'Tiramisu', category: 'dessert', price: 9.0, foodCost: 2.15, popularity: 0.10, includesToy: false, enabled: true },
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
    { name: 'Craft Draught Pint', category: 'drink', price: 8.5, foodCost: 1.7, popularity: 0.30, includesToy: false, enabled: true },
    { name: 'Signature Cocktail', category: 'drink', price: 14.0, foodCost: 3.1, popularity: 0.20, includesToy: false, enabled: true },
    { name: 'Bar Burger', category: 'main', price: 16.5, foodCost: 4.6, popularity: 0.20, includesToy: false, enabled: true },
    { name: 'Loaded Fries', category: 'side', price: 9.0, foodCost: 2.05, popularity: 0.16, includesToy: false, enabled: true },
    { name: 'Wings Platter', category: 'side', price: 13.5, foodCost: 4.2, popularity: 0.14, includesToy: false, enabled: true },
  ],
};

/** Licensed toy cost per kids box — a real line item in QSR P&L. */
export const KIDS_TOY_COST = 0.42;

let menuSeq = 0;
export function buildMenu(type: BuildingType): MenuItem[] {
  return (MENU_TEMPLATES[type] ?? []).map(t => ({ ...t, id: `m${++menuSeq}` }));
}

export const isHospitality = (t: BuildingType) =>
  t === 'cafe' || t === 'fast_food' || t === 'restaurant' || t === 'bar';

export const isProducer = (t: BuildingType) =>
  t === 'farm' || t === 'mine' || t === 'factory';

export const isProperty = (t: BuildingType) => t === 'apartment' || t === 'office';
