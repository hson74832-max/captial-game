// ============= CORE GAME TYPES =============

export type BuildingType =
  | 'retail_store' | 'factory' | 'farm' | 'mine' | 'warehouse'
  | 'hq' | 'rd_center' | 'apartment' | 'commercial'
  | 'restaurant' | 'fast_food' | 'cafe' | 'bar' | 'seaport';

export type TerrainType = 'grass' | 'water' | 'forest' | 'hills' | 'mountain'
  | 'desert' | 'beach' | 'snow';

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type EconomyCycle = 'boom' | 'growth' | 'recession' | 'recovery';
export type MarketSegment = 'value' | 'mainstream' | 'premium' | 'luxury';
export type ProductKind = 'raw' | 'farm' | 'semi' | 'consumer' | 'digital';
export type CreditRating = 'AAA' | 'AA' | 'A' | 'BBB' | 'BB' | 'B' | 'CCC' | 'CC' | 'C' | 'D';
export type AISkill = 'novice' | 'competent' | 'shrewd' | 'ruthless';
export type OverlayMode = 'none' | 'land_value' | 'traffic' | 'demand' | 'zoning';
export type AssetClass = 'commodity' | 'metal' | 'crypto' | 'etf';
export type ForwardGuidance = 'hawkish' | 'dovish' | 'neutral';
export type ZoneType = 'residential' | 'commercial' | 'industrial' | 'mixed';
export type EntityKind = 'car' | 'truck' | 'person' | 'bus' | 'freight_truck';

/** A menu line inside a hospitality venue (combos, kids boxes, drinks). */
export interface MenuItem {
  id: string;
  name: string;
  category: 'main' | 'side' | 'drink' | 'dessert' | 'combo' | 'kids';
  price: number;
  foodCost: number;
  /** 0..1 share of covers that pick this line. Re-normalised at runtime. */
  popularity: number;
  /** Kids boxes ship a licensed toy — a real cost and a real traffic driver. */
  includesToy: boolean;
  enabled: boolean;
}

/** A live supply contract from a supplier building to a buyer. */
export interface SupplierLink {
  productId: string;
  supplierBuildingId: string;
  pricePerUnit: number;
  freightPerUnit: number;
  quality: number;
}

export interface IsometricTile {
  x: number;
  y: number;
  type: TerrainType;
  elevation: number;
  landValue: number;
  cityId: string | null;
  /** Land-use designation governing what may be built here. */
  zone: ZoneType;
  /** True when this tile is a city street centreline. */
  road: boolean;
  /** Interstate highway tile — connects city pairs, never buildable. */
  highway: boolean;
  resource: ResourceNode | null;
  variant: number;
}

export interface MovingEntity {
  id: string;
  type: EntityKind;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  speed: number;
  color: string;
  direction: number;
  pathIndex: number;
  path: Array<[number, number]>;
  fromBuildingId?: string;
  toBuildingId?: string;
}

export interface ResourceNode {
  type: 'iron' | 'coal' | 'oil' | 'timber' | 'gold' | 'lithium' | 'silica' | 'wheat' | 'fish';
  amount: number;
  maxAmount: number;
}

export interface City {
  id: string;
  name: string;
  x: number;
  y: number;
  population: number;
  wageRate: number;
  landCostMultiplier: number;
  demandMultiplier: number;
  unemploymentRate: number;
  growthRate: number;
  color: string;
  tier: 'small' | 'medium' | 'large' | 'metropolis';
  gdpPerCapita: number;
  populationHistory: number[];
  // Demographics
  medianAge: number;
  educationIndex: number;
  familyShare: number;
  birthRate: number;
  deathRate: number;
  netMigrationRate: number;
  naturalIncrease: number;
  housingDemand: number;
  qualityOfLife: number;
  trafficLevel: number;
  incomeMix: { low: number; middle: number; affluent: number };
}

export interface Company {
  id: string;
  name: string;
  isPlayer: boolean;
  cash: number;
  revenue: number;
  profit: number;
  expenses: number;
  totalAssets: number;
  debt: number;
  interestRate: number;
  sharePrice: number;
  sharesOutstanding: number;
  marketCap: number;
  brandValue: number;
  color: string;
  aiStrategy: 'aggressive' | 'balanced' | 'conservative';
  buildings: string[];
  bondRating: CreditRating;
  skill: AISkill;
  acumen: number;
  dividendPayout: number;
  monthsInDistress: number;
  brandAwareness: number;
  assetHoldings: Record<string, number>; // assetId -> units
  assetCostBasis: Record<string, number>; // assetId -> avg cost/unit
  observedPlayerShare: Record<string, number>;
  realisedGains: number;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  basePrice: number;
  currentPrice: number;
  quality: number;
  perceivedQuality: number;
  reviewScore: number;
  brand: number;
  demandIndex: number;
  icon: string;
  kind: ProductKind;
  /** Rating weights, summing to 100 — the Capitalism rating model. */
  priceWeight: number;
  qualityWeight: number;
  brandWeight: number;
  /** Technology level, raised by R&D. Drives achievable quality. */
  techLevel: number;
  productionCost: number;
  marketDemand: number;
  playerMarketShare: number;
  segment: MarketSegment;
  inputs: Array<{ productId: string; productName: string; quantity: number }>;
}

export interface Building {
  id: string;
  type: BuildingType;
  name: string;
  companyId: string;
  cityId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  level: number;
  maxLevel: number;
  operatingCost: number;
  revenue: number;
  profit: number;
  cogs: number;
  employees: number;
  trainingLevel: number;
  trainingBudget: number;
  capacity: number;
  utilization: number;
  customerTraffic: number;
  landValue: number;
  constructionCost: number;
  condition: number;
  isOperating: boolean;
  productId: string | null;
  products: string[];
  inventory: Record<string, number>;
  inventoryCapacity: number;
  pricingMultiplier: number;
  lastUnitsSold: number;
  lastUnitsProduced: number;
  supply: number;
  demand: number;
  resourceType: string | null;
  resourceRemaining: number;
  resourceMax: number;
  occupancy: number;
  rentMultiplier: number;
  rentPerUnit: number;
  employeeSatisfaction: number;
  monthsUnprofitable: number;
  adBudget: number;
  cachedAsk: number;
  offersMade: number;
  negotiationBlockedUntil: number;
  /** Highway adjacency 0..1 — matters for big-box retail and logistics. */
  highwayAccess: number;
  /** Parking capacity relative to footfall, 0..1. */
  parkingScore: number;
  /** Retail specialisation: a product category, or null for general merchandise. */
  specialisation: string | null;
  /** How many product lines this retailer may stock. */
  productSlots: number;
  /** Hospitality menu board. */
  menu: MenuItem[];
  /** Live supply contracts with landed cost breakdown. */
  supplierLinks: SupplierLink[];
  /** Landed freight cost per unit across all inputs. */
  freightCost: number;
  /** Purchase cost per unit across all inputs. */
  inputCost: number;
  /** Withhold output from rivals — costs spot revenue, denies them supply. */
  internalSale: boolean;
  /** Seaport flavour: industrial sells inputs, commercial sells finished goods. */
  portKind: 'industrial' | 'commercial' | null;
  /** Retail chain recognition multiplier, shown as stars in the UI. */
  chainBonus: number;
}

export interface Economy {
  gdpGrowth: number;
  inflation: number;
  interestRate: number;
  consumerConfidence: number;
  businessConfidence: number;
  cycle: EconomyCycle;
  cycleMonth: number;
  unemployment: number;
  purchasingPowerIndex: number;
  moneySupply: number;
  cpi: number;
  dieselPrice: number;
  fuelShockMonths: number;
  cbCredibility: number;
  forwardGuidance: ForwardGuidance;
  moneyVelocity: number;
  shortTermCapitalGainsRate: number;
  longTermCapitalGainsRate: number;
}

export interface FreightRoute {
  id: string;
  fromBuildingId: string;
  toBuildingId: string;
  good: string;
  amount: number;
  progress: number;
  distance: number;
  freightCost: number;
  status: 'loading' | 'in_transit' | 'delivered';
}

export interface Notification {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'danger';
  tick: number;
}

export interface NewsTickerItem {
  id: string;
  text: string;
  type: 'info' | 'breaking' | 'warning' | 'danger';
  tick: number;
}

export interface StockMarket {
  index: number;
  indexHistory: number[];
  sentiment: 'bullish' | 'neutral' | 'bearish';
  interestRate: number;
  inflationRate: number;
  ticker: NewsTickerItem[];
}

export interface TradedAsset {
  id: string;
  symbol: string;
  name: string;
  assetClass: AssetClass;
  price: number;
  anchor: number;
  volatility: number;
  unit: string;
  history: number[];
  playerHolding: number;
  playerCostBasis: number;
}

export interface IncomingOffer {
  id: string;
  buildingId: string;
  buildingName: string;
  buyerId: string;
  buyerName: string;
  amount: number;
  fairValue: number;
  expiresTick: number;
  rationale: string;
}

export interface OfferResult {
  buildingId: string;
  status: 'accepted' | 'counter' | 'rejected';
  offerAmount: number;
  counterAmount: number;
  message: string;
  sellerName: string;
}

export interface Loan {
  id: string;
  amount: number;
  interestRate: number;
  monthsRemaining: number;
  monthlyPayment: number;
}

export interface GameState {
  id: string;
  tick: number;
  speed: number;
  year: number;
  month: number;
  day: number;
  hour: number;
  timeOfDay: number;
  season: Season;
  dayOfYear: number;
  player: {
    name: string;
    companyId: string;
    cash: number;
    salary: number;
    netWorth: number;
  };
  cities: City[];
  companies: Company[];
  buildings: Building[];
  products: Product[];
  stockMarket: StockMarket;
  economy: Economy;
  tradedAssets: TradedAsset[];
  notifications: Notification[];
  selectedBuilding: string | null;
  selectedCity: string | null;
  camera: { x: number; y: number; zoom: number };
  mapSize: number;
  seed: number;
  overlay: OverlayMode;
  paused: boolean;
  freight: FreightRoute[];
  incomingOffers: IncomingOffer[];
  lastOffer: OfferResult | null;
  loans: Loan[];
  replayHistory: Array<{
    year: number;
    month: number;
    cash: number;
    netWorth: number;
    revenue: number;
    profit: number;
    gdpGrowth: number;
    inflation: number;
  }>;
}
