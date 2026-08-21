import type { BuildingType, ProductKind, MarketSegment, MenuItem } from './types';

// ============= PRODUCT CATALOGUE =============
// `necessity` is the demand index: staples stay in the basket during a
// recession, luxuries collapse. Drives income elasticity in the demand model.
export const PRODUCT_CATEGORIES: Record<string, { products: string[]; icon: string; necessity: number }> = {
  'Raw Materials': { products: ['Iron', 'Coal', 'Oil', 'Silica', 'Timber', 'Lithium'], icon: '⛏️', necessity: 100 },
  'Farm Products': { products: ['Wheat', 'Corn', 'Livestock', 'Milk', 'Grapes'], icon: '🌾', necessity: 95 },
  'Semi Products': { products: ['Steel', 'Glass', 'Plastic', 'Flour', 'Leather', 'Electronic Components', 'Wheel and Tire', 'Car Body'], icon: '⚙️', necessity: 85 },
  'Food': { products: ['Bread', 'Canned Soup', 'Corn Flakes', 'Cakes', 'Pasta'], icon: '🍞', necessity: 90 },
  'Beverage': { products: ['Cola', 'Bottled Milk', 'Bottled Water', 'Wine'], icon: '🥤', necessity: 75 },
  'Electronics': { products: ['Television', 'Hi-fi System', 'Game Console'], icon: '📺', necessity: 30 },
  'Computers': { products: ['Desktop Computer', 'Notebook Computer', 'Tablet Computer', 'Printer'], icon: '💻', necessity: 25 },
  'Automobile': { products: ['Car', 'Motorcycle', 'Truck'], icon: '🚗', necessity: 20 },
  'Apparel': { products: ['Jeans', 'Sweater', 'T-Shirt', 'Leather Jacket'], icon: '👕', necessity: 70 },
  'Furniture': { products: ['Bed', 'Chair', 'Sofa', 'Table'], icon: '🪑', necessity: 50 },
  'Drugs': { products: ['Headache Pills', 'Cold Pills', 'Cough Syrup', 'Vitamins'], icon: '💊', necessity: 80 },
  'Footwear': { products: ['Sport Shoes', 'Shoes', 'Boots', 'Sandals'], icon: '👟', necessity: 65 },
  'Communication': { products: ['Mobile Phone', 'Smart Phone'], icon: '📱', necessity: 40 },
  'Home Appliances': { products: ['Refrigerator', 'Washing Machine', 'Coffee Machine', 'Air Conditioner'], icon: '🏠', necessity: 45 },
  'Cosmetics': { products: ['Lipstick', 'Perfume', 'Shampoo'], icon: '💄', necessity: 35 },
  'Leather Goods': { products: ['Leather Bag', 'Leather Belt', 'Leather Wallet'], icon: '👜', necessity: 35 },
  'Toys': { products: ['Stuffed Toy', 'Toy Racing Car'], icon: '🧸', necessity: 30 },
};

/**
 * `priceWeight` / `qualityWeight` / `brandWeight` sum to 100 and decide the
 * product's overall rating — exactly the Capitalism model. Cigarette-style
 * goods live on brand; frozen meat lives on price and quality.
 */
type ProductRule = {
  kind: ProductKind;
  cost: number;
  priceWeight?: number;
  qualityWeight?: number;
  brandWeight?: number;
  inputs?: Array<[string, number]>;
  /** First year the product enters the market. Pre-1980 = always available at game start. */
  unlockYear?: number;
  /** Year the product becomes obsolete. */
  obsoleteYear?: number;
};

export const PRODUCT_RULES: Record<string, ProductRule> = {
  // ── Raw materials: fungible commodities, pure price competition ──
  Iron: { kind: 'raw', cost: 18, priceWeight: 80, qualityWeight: 20, brandWeight: 0 },
  Coal: { kind: 'raw', cost: 14, priceWeight: 85, qualityWeight: 15, brandWeight: 0 },
  Oil: { kind: 'raw', cost: 28, priceWeight: 80, qualityWeight: 20, brandWeight: 0 },
  Silica: { kind: 'raw', cost: 12, priceWeight: 80, qualityWeight: 20, brandWeight: 0 },
  Timber: { kind: 'raw', cost: 16, priceWeight: 75, qualityWeight: 25, brandWeight: 0 },
  Lithium: { kind: 'raw', cost: 42, unlockYear: 2005, priceWeight: 70, qualityWeight: 30, brandWeight: 0 },
  // ── Farm: quality responds to training, unlike raw materials ──
  Wheat: { kind: 'farm', cost: 8, priceWeight: 70, qualityWeight: 30, brandWeight: 0 },
  Corn: { kind: 'farm', cost: 9, priceWeight: 70, qualityWeight: 30, brandWeight: 0 },
  Livestock: { kind: 'farm', cost: 24, priceWeight: 55, qualityWeight: 45, brandWeight: 0 },
  Milk: { kind: 'farm', cost: 13, priceWeight: 60, qualityWeight: 40, brandWeight: 0 },
  Grapes: { kind: 'farm', cost: 15, priceWeight: 55, qualityWeight: 45, brandWeight: 0 },
  // ── Semi products ──
  Steel: { kind: 'semi', cost: 44, priceWeight: 65, qualityWeight: 35, brandWeight: 0, inputs: [['Iron', 1.3], ['Coal', 0.7]] },
  Glass: { kind: 'semi', cost: 30, priceWeight: 65, qualityWeight: 35, brandWeight: 0, inputs: [['Silica', 1.5], ['Coal', 0.4]] },
  Plastic: { kind: 'semi', cost: 36, priceWeight: 70, qualityWeight: 30, brandWeight: 0, inputs: [['Oil', 1.0]] },
  Flour: { kind: 'semi', cost: 18, priceWeight: 70, qualityWeight: 30, brandWeight: 0, inputs: [['Wheat', 2]] },
  Leather: { kind: 'semi', cost: 48, priceWeight: 45, qualityWeight: 55, brandWeight: 0, inputs: [['Livestock', 1.5]] },
  'Electronic Components': { kind: 'semi', cost: 70, priceWeight: 40, qualityWeight: 60, brandWeight: 0, inputs: [['Silica', 1.5], ['Plastic', 1.2]] },
  'Wheel and Tire': { kind: 'semi', cost: 68, priceWeight: 55, qualityWeight: 45, brandWeight: 0, inputs: [['Steel', 0.6], ['Oil', 0.8]] },
  'Car Body': { kind: 'semi', cost: 420, priceWeight: 45, qualityWeight: 55, brandWeight: 0, inputs: [['Steel', 5], ['Glass', 1], ['Plastic', 2]] },

  // ── Food: price-led staples ──
  Bread: { kind: 'consumer', cost: 1.15, priceWeight: 50, qualityWeight: 35, brandWeight: 15, inputs: [['Flour', 0.04], ['Milk', 0.01]] },
  'Canned Soup': { kind: 'consumer', cost: 2.20, priceWeight: 45, qualityWeight: 30, brandWeight: 25, inputs: [['Livestock', 0.05], ['Corn', 0.06]] },
  'Corn Flakes': { kind: 'consumer', cost: 2.40, priceWeight: 40, qualityWeight: 25, brandWeight: 35, inputs: [['Corn', 0.16], ['Milk', 0.02]] },
  Cakes: { kind: 'consumer', cost: 3.80, priceWeight: 40, qualityWeight: 40, brandWeight: 20, inputs: [['Flour', 0.12], ['Milk', 0.05]] },
  Pasta: { kind: 'consumer', cost: 1.80, priceWeight: 50, qualityWeight: 30, brandWeight: 20, inputs: [['Flour', 0.07]] },
  // ── Beverage: brand-heavy ──
  Cola: { kind: 'consumer', cost: 0.90, priceWeight: 30, qualityWeight: 15, brandWeight: 55, inputs: [['Corn', 0.07]] },
  'Bottled Milk': { kind: 'consumer', cost: 1.60, priceWeight: 55, qualityWeight: 35, brandWeight: 10, inputs: [['Milk', 1]] },
  'Bottled Water': { kind: 'consumer', cost: 0.50, priceWeight: 45, qualityWeight: 15, brandWeight: 40 },
  Wine: { kind: 'consumer', cost: 12.0, priceWeight: 25, qualityWeight: 40, brandWeight: 35, inputs: [['Grapes', 0.6]] },
  // ── Electronics: quality/tech-led ──
  Television: { kind: 'consumer', cost: 290, priceWeight: 35, qualityWeight: 45, brandWeight: 20, inputs: [['Electronic Components', 2], ['Glass', 2], ['Plastic', 1]] },
  'Hi-fi System': { kind: 'consumer', cost: 340, priceWeight: 30, qualityWeight: 45, brandWeight: 25, inputs: [['Electronic Components', 2.8], ['Plastic', 1.5]] },
  'Game Console': { kind: 'consumer', cost: 350, unlockYear: 1995, priceWeight: 35, qualityWeight: 40, brandWeight: 25, inputs: [['Electronic Components', 3], ['Plastic', 2]] },
  // ── Computers: heavily R&D driven ──
  'Desktop Computer': { kind: 'consumer', cost: 480, unlockYear: 1985, priceWeight: 40, qualityWeight: 45, brandWeight: 15, inputs: [['Electronic Components', 4], ['Steel', 1], ['Plastic', 1]] },
  'Notebook Computer': { kind: 'consumer', cost: 680, unlockYear: 1991, priceWeight: 30, qualityWeight: 50, brandWeight: 20, inputs: [['Electronic Components', 6], ['Plastic', 2], ['Glass', 1]] },
  'Tablet Computer': { kind: 'consumer', cost: 320, unlockYear: 2010, priceWeight: 30, qualityWeight: 45, brandWeight: 25, inputs: [['Electronic Components', 3], ['Glass', 1]] },
  Printer: { kind: 'consumer', cost: 160, unlockYear: 1988, priceWeight: 50, qualityWeight: 35, brandWeight: 15, inputs: [['Electronic Components', 1.2], ['Plastic', 1.5]] },
  // ── Automobile ──
  Car: { kind: 'consumer', cost: 18500, unlockYear: 1980, priceWeight: 30, qualityWeight: 45, brandWeight: 25, inputs: [['Car Body', 10], ['Wheel and Tire', 30], ['Electronic Components', 25], ['Steel', 40], ['Glass', 8], ['Plastic', 30]] },
  Motorcycle: { kind: 'consumer', cost: 6500, unlockYear: 1980, priceWeight: 35, qualityWeight: 40, brandWeight: 25, inputs: [['Steel', 30], ['Wheel and Tire', 12], ['Electronic Components', 12], ['Plastic', 20]] },
  Truck: { kind: 'consumer', cost: 35000, unlockYear: 1980, priceWeight: 40, qualityWeight: 45, brandWeight: 15, inputs: [['Car Body', 22], ['Wheel and Tire', 80], ['Steel', 70], ['Electronic Components', 35], ['Glass', 12], ['Plastic', 50]] },
  // ── Apparel: brand matters a lot ──
  Jeans: { kind: 'consumer', cost: 28, priceWeight: 35, qualityWeight: 25, brandWeight: 40, inputs: [['Corn', 1.8]] },
  Sweater: { kind: 'consumer', cost: 35, priceWeight: 40, qualityWeight: 30, brandWeight: 30, inputs: [['Livestock', 0.9]] },
  'T-Shirt': { kind: 'consumer', cost: 12, priceWeight: 45, qualityWeight: 20, brandWeight: 35, inputs: [['Corn', 0.8]] },
  'Leather Jacket': { kind: 'consumer', cost: 185, priceWeight: 20, qualityWeight: 35, brandWeight: 45, inputs: [['Leather', 2]] },
  // ── Furniture: quality/price ──
  Bed: { kind: 'consumer', cost: 380, priceWeight: 40, qualityWeight: 45, brandWeight: 15, inputs: [['Timber', 8], ['Steel', 2.5]] },
  Chair: { kind: 'consumer', cost: 120, priceWeight: 50, qualityWeight: 35, brandWeight: 15, inputs: [['Timber', 4.5]] },
  Sofa: { kind: 'consumer', cost: 650, priceWeight: 30, qualityWeight: 45, brandWeight: 25, inputs: [['Timber', 6], ['Leather', 6]] },
  Table: { kind: 'consumer', cost: 200, priceWeight: 45, qualityWeight: 40, brandWeight: 15, inputs: [['Timber', 7.5]] },
  // ── Drugs: trust-led, quality dominant ──
  'Headache Pills': { kind: 'consumer', cost: 4.50, priceWeight: 35, qualityWeight: 40, brandWeight: 25 },
  'Cold Pills': { kind: 'consumer', cost: 6.20, priceWeight: 35, qualityWeight: 40, brandWeight: 25 },
  'Cough Syrup': { kind: 'consumer', cost: 7.10, priceWeight: 35, qualityWeight: 40, brandWeight: 25 },
  Vitamins: { kind: 'consumer', cost: 8.80, priceWeight: 30, qualityWeight: 30, brandWeight: 40 },
  // ── Footwear ──
  'Sport Shoes': { kind: 'consumer', cost: 65, priceWeight: 25, qualityWeight: 30, brandWeight: 45, inputs: [['Plastic', 0.7], ['Leather', 0.5]] },
  Shoes: { kind: 'consumer', cost: 55, priceWeight: 40, qualityWeight: 35, brandWeight: 25, inputs: [['Leather', 1]] },
  Boots: { kind: 'consumer', cost: 95, priceWeight: 35, qualityWeight: 40, brandWeight: 25, inputs: [['Leather', 1.5], ['Plastic', 0.3]] },
  Sandals: { kind: 'consumer', cost: 25, priceWeight: 50, qualityWeight: 25, brandWeight: 25, inputs: [['Plastic', 0.6]] },
  // ── Communication: extremely R&D intensive ──
  'Mobile Phone': { kind: 'consumer', cost: 85, unlockYear: 1992, priceWeight: 35, qualityWeight: 40, brandWeight: 25, inputs: [['Electronic Components', 0.8], ['Plastic', 0.3], ['Glass', 0.3]] },
  'Smart Phone': { kind: 'consumer', cost: 420, unlockYear: 2007, priceWeight: 20, qualityWeight: 50, brandWeight: 30, inputs: [['Electronic Components', 3.5], ['Plastic', 1.2], ['Glass', 1.2]] },
  // ── Home appliances ──
  Refrigerator: { kind: 'consumer', cost: 480, priceWeight: 40, qualityWeight: 45, brandWeight: 15, inputs: [['Steel', 4], ['Electronic Components', 1.5], ['Plastic', 2]] },
  'Washing Machine': { kind: 'consumer', cost: 420, priceWeight: 40, qualityWeight: 45, brandWeight: 15, inputs: [['Steel', 3.5], ['Electronic Components', 1.5], ['Plastic', 1.5]] },
  'Coffee Machine': { kind: 'consumer', cost: 85, unlockYear: 1986, priceWeight: 40, qualityWeight: 35, brandWeight: 25, inputs: [['Plastic', 1], ['Electronic Components', 0.5]] },
  'Air Conditioner': { kind: 'consumer', cost: 520, unlockYear: 1988, priceWeight: 45, qualityWeight: 40, brandWeight: 15, inputs: [['Steel', 3], ['Electronic Components', 2], ['Plastic', 2]] },
  // ── Cosmetics: overwhelmingly brand ──
  Lipstick: { kind: 'consumer', cost: 9.50, priceWeight: 20, qualityWeight: 20, brandWeight: 60, inputs: [['Oil', 0.2]] },
  Perfume: { kind: 'consumer', cost: 42.0, priceWeight: 15, qualityWeight: 20, brandWeight: 65, inputs: [['Grapes', 1.7]] },
  Shampoo: { kind: 'consumer', cost: 5.20, priceWeight: 35, qualityWeight: 25, brandWeight: 40, inputs: [['Oil', 0.1]] },
  // ── Leather goods: status products ──
  'Leather Bag': { kind: 'consumer', cost: 210, priceWeight: 15, qualityWeight: 35, brandWeight: 50, inputs: [['Leather', 2.6]] },
  'Leather Belt': { kind: 'consumer', cost: 48, priceWeight: 30, qualityWeight: 30, brandWeight: 40, inputs: [['Leather', 0.7]] },
  'Leather Wallet': { kind: 'consumer', cost: 62, priceWeight: 25, qualityWeight: 30, brandWeight: 45, inputs: [['Leather', 0.8]] },
  // ── Toys: brand + family draw ──
  'Stuffed Toy': { kind: 'consumer', cost: 18, priceWeight: 35, qualityWeight: 25, brandWeight: 40 },
  'Toy Racing Car': { kind: 'consumer', cost: 26, priceWeight: 35, qualityWeight: 25, brandWeight: 40, inputs: [['Plastic', 0.4]] },
};

const LUXURY_NAMES = new Set(['Smart Phone', 'Sofa', 'Car', 'Notebook Computer', 'Leather Bag', 'Perfume', 'Wine', 'Leather Jacket']);
const PREMIUM_NAMES = new Set(['Tablet Computer', 'Television', 'Refrigerator', 'Boots', 'Hi-fi System', 'Air Conditioner', 'Motorcycle']);

export function segmentFor(name: string, category: string, cost: number): MarketSegment {
  if (LUXURY_NAMES.has(name)) return 'luxury';
  if (PREMIUM_NAMES.has(name)) return 'premium';
  if (category === 'Raw Materials' || category === 'Farm Products' || category === 'Semi Products') return 'value';
  if (cost > 400) return 'premium';
  if (cost < 30) return 'value';
  return 'mainstream';
}

// ============= RETAIL SPECIALISATION =============
/**
 * A store picks a category to specialise in. Specialty stores get a demand
 * bonus for products in their class and cannot stock unrelated goods —
 * an electronics store does not sell frozen meat.
 */
export const RETAIL_CATEGORIES = [
  'Food', 'Beverage', 'Electronics', 'Computers', 'Automobile', 'Apparel',
  'Furniture', 'Drugs', 'Footwear', 'Communication', 'Home Appliances',
  'Cosmetics', 'Leather Goods', 'Toys',
] as const;

/** Department stores may stock anything; specialty stores are restricted. */
export const DEPARTMENT_STORE = 'General Merchandise';

// ============= HOSPITALITY MENUS =============
// Real quick-service economics: combos carry the margin, drinks carry the
// gross profit (fountain soda costs cents), kids boxes buy family footfall.
export type MenuTemplate = Omit<MenuItem, 'id'>;

export const MENU_TEMPLATES: Record<string, MenuTemplate[]> = {
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

/**
 * Bulk ingredients a venue buys from the supply chain. These are the *only*
 * products a kitchen consumes — no vitamins, no televisions.
 */
export const VENUE_INGREDIENTS: Record<string, string[]> = {
  fast_food: ['Livestock', 'Flour', 'Corn', 'Milk'],
  restaurant: ['Livestock', 'Flour', 'Milk', 'Grapes', 'Corn'],
  cafe: ['Milk', 'Flour', 'Corn'],
  bar: ['Livestock', 'Wheat', 'Grapes', 'Flour'],
};

export function isHospitality(type: BuildingType): boolean {
  return type === 'restaurant' || type === 'fast_food' || type === 'cafe' || type === 'bar';
}

// ============= BUILDINGS =============
export const BUILDING_CONFIGS: Record<string, {
  name: string; cost: number; employees: number; capacity: number;
  w: number; h: number; color: string; icon: string; blurb: string;
}> = {
  retail_store: { name: 'Retail Store', cost: 500000, employees: 4, capacity: 120, w: 2, h: 2, color: '#3b82f6', icon: '🏪', blurb: 'Sells finished consumer goods. Pick a category to specialise in.' },
  factory: { name: 'Factory', cost: 2000000, employees: 10, capacity: 500, w: 3, h: 3, color: '#6b7280', icon: '🏭', blurb: 'Manufactures semi-products and finished goods from inputs.' },
  farm: { name: 'Farm', cost: 300000, employees: 3, capacity: 200, w: 4, h: 4, color: '#22c55e', icon: '🌾', blurb: 'Seasonal crop cycles, soil health, weather risk, storage.' },
  mine: { name: 'Mine', cost: 1500000, employees: 5, capacity: 300, w: 3, h: 3, color: '#a16207', icon: '⛏️', blurb: 'Extracts the deposit beneath it. Reserves deplete.' },
  warehouse: { name: 'Warehouse', cost: 400000, employees: 2, capacity: 800, w: 2, h: 3, color: '#f97316', icon: '📦', blurb: 'Buffers supply chains against seasonal swings.' },
  hq: { name: 'Headquarters', cost: 3000000, employees: 0, capacity: 20, w: 2, h: 2, color: '#8b5cf6', icon: '🏢', blurb: 'Hires executives who boost company-wide productivity. Empty on day one.' },
  rd_center: { name: 'R&D Center', cost: 2500000, employees: 0, capacity: 12, w: 2, h: 2, color: '#06b6d4', icon: '🔬', blurb: 'Hires researchers who run R&D projects. Empty on day one.' },
  apartment: { name: 'Apartment', cost: 1500000, employees: 0, capacity: 12, w: 2, h: 2, color: '#ec4899', icon: '🏠', blurb: 'Rental income. A mid-rise block of 12 units; upgrades add floors.' },
  commercial: { name: 'Commercial', cost: 2000000, employees: 0, capacity: 10, w: 2, h: 2, color: '#14b8a6', icon: '🏬', blurb: 'Office space let at a cap rate. Best near the CBD.' },
  restaurant: { name: 'Restaurant', cost: 850000, employees: 4, capacity: 320, w: 2, h: 2, color: '#ef4444', icon: '🍽️', blurb: 'Full-service dining. High ticket, high food cost.' },
  fast_food: { name: 'Fast Food', cost: 520000, employees: 4, capacity: 620, w: 2, h: 2, color: '#f59e0b', icon: '🍔', blurb: 'High volume, thin margin. Combos and kids boxes.' },
  cafe: { name: 'Cafe', cost: 310000, employees: 2, capacity: 380, w: 1, h: 1, color: '#78350f', icon: '☕', blurb: 'Coffee margins are the best in hospitality.' },
  bar: { name: 'Bar & Grill', cost: 640000, employees: 3, capacity: 260, w: 2, h: 2, color: '#7c3aed', icon: '🍺', blurb: 'Evening trade. Drinks carry the profit.' },
  seaport: { name: 'Seaport', cost: 0, employees: 20, capacity: 1000, w: 3, h: 2, color: '#0284c7', icon: '⚓', blurb: 'Imports goods. Buy inputs here instead of building the whole chain.' },
};

/** Types the player may actually construct. */
export const BUILDABLE_TYPES: BuildingType[] = [
  'factory', 'farm', 'mine', 'retail_store', 'restaurant', 'fast_food',
  'cafe', 'bar', 'apartment', 'commercial', 'warehouse', 'hq', 'rd_center',
];

export const CITY_NAMES = [
  'New York', 'Shanghai', 'London', 'Tokyo', 'Berlin', 'Sydney',
  'Singapore', 'São Paulo', 'Mumbai', 'Toronto', 'Paris', 'Dubai',
];

export const COMPANY_NAMES = [
  'Apex Corp', 'Titan Industries', 'Nova Group', 'Stellar Holdings',
  'Prime Ventures', 'Zenith Corp', 'Crown Ltd', 'Meridian Inc',
  'Atlas Global', 'Vanguard Co',
];

// ============= FARM DEPTH =============
// Livestock and crop varieties with real yield/quality/cost tradeoffs.
export interface LivestockBreed {
  id: string;
  name: string;
  producesProduct: 'Livestock' | 'Milk';
  /** Yield multiplier vs baseline. */
  yieldMul: number;
  /** Quality bonus added to product quality (0-100 scale). */
  qualityBonus: number;
  /** Cost multiplier for feed and vet upkeep. */
  costMul: number;
  /** Base sell-price premium (1.0 = spot). */
  priceMul: number;
  /** Upfront investment to introduce this breed. */
  investmentCost: number;
  description: string;
}

export const LIVESTOCK_BREEDS: LivestockBreed[] = [
  { id: 'commercial_beef', name: 'Commercial Beef Cattle', producesProduct: 'Livestock',
    yieldMul: 1.0, qualityBonus: 0, costMul: 1.0, priceMul: 1.0, investmentCost: 0,
    description: 'Standard feedlot beef. High volume, thin margins.' },
  { id: 'angus_beef', name: 'Angus Beef', producesProduct: 'Livestock',
    yieldMul: 0.85, qualityBonus: 15, costMul: 1.3, priceMul: 1.35, investmentCost: 120_000,
    description: 'Prime marbled beef. Lower volume, premium price at retail.' },
  { id: 'wagyu_beef', name: 'Wagyu Beef', producesProduct: 'Livestock',
    yieldMul: 0.55, qualityBonus: 30, costMul: 2.4, priceMul: 2.8, investmentCost: 850_000,
    description: 'Ultra-premium Japanese beef. Requires 3+ years to break even.' },
  { id: 'commercial_dairy', name: 'Commercial Dairy Herd', producesProduct: 'Milk',
    yieldMul: 1.0, qualityBonus: 0, costMul: 1.0, priceMul: 1.0, investmentCost: 0,
    description: 'Holstein herd. Volume producer for milk processors.' },
  { id: 'jersey_dairy', name: 'Jersey Dairy Herd', producesProduct: 'Milk',
    yieldMul: 0.75, qualityBonus: 20, costMul: 1.15, priceMul: 1.45, investmentCost: 180_000,
    description: 'Rich, high-butterfat milk favoured by artisan dairies.' },
  { id: 'organic_dairy', name: 'Organic Grass-Fed Dairy', producesProduct: 'Milk',
    yieldMul: 0.60, qualityBonus: 25, costMul: 1.5, priceMul: 1.9, investmentCost: 320_000,
    description: 'Certified organic. Lower yield but 90% higher retail price.' },
];

export const PRODUCT_TIERS: Array<{ id: 'standard' | 'premium' | 'organic'; label: string; qualityBonus: number; priceMul: number; costMul: number }> = [
  { id: 'standard', label: 'Standard', qualityBonus: 0, priceMul: 1.0, costMul: 1.0 },
  { id: 'premium',  label: 'Premium',  qualityBonus: 12, priceMul: 1.35, costMul: 1.15 },
  { id: 'organic',  label: 'Organic',  qualityBonus: 20, priceMul: 1.75, costMul: 1.40 },
];

export const COMPANY_COLORS = [
  // 24 visually distinct hues so every AI + player gets its own colour on the map.
  '#ef4444', '#f59e0b', '#eab308', '#84cc16', '#22c55e',
  '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6',
  '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
  '#f43f5e', '#78716c', '#f97316', '#dc2626', '#0284c7',
  '#7c3aed', '#059669', '#c026d3', '#0891b2',
  // Original short palette (kept for backwards compatibility)
  '#ef4444', '#3b82f6', '#f59e0b', '#a855f7', '#ec4899',
  '#14b8a6', '#f97316', '#6366f1', '#84cc16', '#06b6d4',
];

export const SKILL_LABEL: Record<string, string> = {
  novice: 'Novice', competent: 'Competent', shrewd: 'Shrewd', ruthless: 'Ruthless',
};
