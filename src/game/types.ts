// ============= CORE GAME TYPES =============

export type BiomeType = 'grass' | 'forest' | 'mountain' | 'desert' | 'water' | 'beach' | 'snow' | 'hills';

export type BuildingType =
  | 'retail_store'
  | 'factory'
  | 'farm'
  | 'mine'
  | 'warehouse'
  | 'hq'
  | 'rd_center'
  | 'apartment'
  | 'commercial'
  | 'media_tv'
  | 'media_radio'
  | 'media_newspaper'
  | 'seaport'
  | 'media_tower'
  | 'civic_school'
  | 'civic_hospital'
  | 'civic_stadium'
  | 'civic_museum'
  | 'civic_park'
  | 'internet_search'
  | 'internet_social'
  | 'internet_ecommerce'
  | 'software_company'
  | 'telecom';

export type EconomyCycle = 'boom' | 'growth' | 'recession' | 'recovery';
export type AIStrategy = 'aggressive' | 'balanced' | 'conservative';
export type Sentiment = 'bullish' | 'neutral' | 'bearish';
export type EntityKind = 'car' | 'truck' | 'person' | 'bus' | 'freight_truck';
export type OverlayMode = 'none' | 'land_value' | 'wage' | 'traffic' | 'demand' | 'pollution' | 'biome' | 'freight' | 'real_estate';
export type CreditRating = 'AAA' | 'AA' | 'A' | 'BBB' | 'BB' | 'B' | 'CCC' | 'CC' | 'C' | 'D';
export type ProductKind = 'raw' | 'farm' | 'semi' | 'consumer' | 'digital';
export type SoftwareClass =
  | 'Operating System'
  | 'Office Software'
  | 'Computer Security'
  | 'Graphic Design Software'
  | 'Video Software'
  | 'Utility Software'
  | 'Audio Software';
export type TalentRole = 'lead_researcher' | 'lead_programmer';
export type EcommerceChannel = 'retail' | 'packaged_ecommerce' | 'digital_download';
export type CompanySector = 'consumer' | 'industrial' | 'technology' | 'real_estate' | 'media' | 'investment' | 'diversified';

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

/** Public facility tracked per city. */
export interface PublicFacility {
  id: string;
  type: 'city_hall' | 'police_station' | 'fire_department' | 'public_school' | 'public_hospital' | 'public_park' | 'library';
  name: string;
  cityId: string;
  x: number;
  y: number;
  funding: number;       // 0..1 budget slider
  trainingLevel: number; // staff quality 0..100
  equipmentLevel: number;
  serviceReach: number;  // radius of effect in tiles
  operatingCost: number;
}

export interface Player {
  name: string;
  companyId: string;
  cash: number;
  salary: number;
  netWorth: number;
  knowledgePoints: number;
  expertise: Record<string, number>;
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
  hasSeaport: boolean;
  color: string;
  tier: 'small' | 'medium' | 'large' | 'metropolis';
  housingDemand: number;
  officeDemand: number;
  qualityOfLife: number;
  trafficLevel: number;
  gdpPerCapita: number;
  wageHistory: number[];
  populationHistory: number[];
  /** Digital Age: people online in this city. Grows only with telecom bandwidth. */
  internetUsers: number;
  /** Total bandwidth capacity offered by all telecoms serving the city. */
  bandwidthCapacity: number;
  /** Share of retail that happens online, 0..1. Rises slowly over the decades. */
  ecommerceAdoption: number;
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
  sharesOwned: number;
  marketCap: number;
  brandValue: number;
  color: string;
  aiStrategy: AIStrategy;
  buildings: string[];
  bondRating: CreditRating;
  sector: CompanySector;
  dividendPayout: number;
  intangibleTechnology: number;
  autoAdjustPrices: boolean;
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
  employees: number;
  trainingLevel: number;
  products: string[];
  inventory: Record<string, number>;
  capacity: number;
  utilization: number;
  customerTraffic: number;
  landValue: number;
  constructionCost: number;
  condition: number;
  isOperating: boolean;
  sprite: number; // index into the per-type sprite library
  constructedTick: number;
  smokeAccum: number;
  glowPhase: number;
  productId: string | null;
  pricingMultiplier: number;
  internalSale: boolean;
  supply: number;
  demand: number;
  freightCost: number;
  inputCost: number;
  inventoryCapacity: number;
  supplierLinks: SupplierLink[];
  trainingBudget: number;
  occupancy: number;
  rentMultiplier: number;
  amenityCommunity: number;
  amenitySports: number;
  amenityShopping: number;
  contentBudget: number;
  advertisingPrice: number;
  mediaRating: number;
  researchProjectId: string | null;
  researchProgress: number;
  portKind: 'industrial' | 'commercial' | null;
  resourceType: ResourceNode['type'] | null;
  resourceRemaining: number;
  resourceMax: number;
  lastUnitsSold: number;
  lastUnitsProduced: number;
  spoilageLoss: number;
  expiredUnits: number;
  /** Digital Age: telecom infrastructure state, only for `telecom` buildings. */
  telecom: TelecomStats | null;
  /** Digital Age: e-commerce catalogue, only for `internet_ecommerce` buildings. */
  ecommerceListings: EcommerceListing[];
  /** Wholesale firms opt in to selling through the group's e-commerce arm. */
  ecommerceEnabled: boolean;
  /** Software product this factory packages, or a software firm's active title. */
  softwareProductId: string | null;
  /** Website quality inputs (internet firms). */
  featuresQuality: number;
  technologyQuality: number;
  monthlyVisitors: number;
  costPerClick: number;
  /** Lead researcher / lead programmer ids assigned to this firm. */
  talentIds: string[];
  /** Real estate: monthly rent charged per unit (bedroom / office suite). */
  rentPerUnit: number;
  /** Acquisition registry: per-buyer standing offer made for this building. */
  standingOffer: number | null;
  standingOfferBy: string | null;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  basePrice: number;
  currentPrice: number;
  quality: number;
  brand: number;
  techLevel: number;
  demandIndex: number;
  inputs: ProductInput[];
  icon: string;
  kind: ProductKind;
  productionCost: number;
  priceWeight: number;
  qualityWeight: number;
  brandWeight: number;
  unlockYear: number;
  replacementName: string | null;
  maxDemandShift: number;
  demandShift: number;
  obsolete: boolean;
  marketDemand: number;
  playerMarketShare: number;
}

export interface ProductInput {
  productId: string;
  productName: string;
  quantity: number;
}

export interface SupplierLink {
  productId: string;
  supplierBuildingId: string;
  pricePerUnit: number;
  freightPerUnit: number;
  quality: number;
}

export interface StockMarket {
  index: number;
  indexHistory: number[];
  sentiment: Sentiment;
  interestRate: number;
  inflationRate: number;
  volume: number;
  ticker: NewsTickerItem[];
}

export interface NewsTickerItem {
  id: string;
  text: string;
  type: 'info' | 'warning' | 'success' | 'danger' | 'breaking';
  tick: number;
}

export interface Economy {
  gdpGrowth: number;
  inflation: number;
  interestRate: number;
  consumerConfidence: number;
  businessConfidence: number;
  cycle: EconomyCycle;
  cycleMonth: number;
  taxRate: number;
  unemployment: number;
  purchasingPowerIndex: number;
  realEstateBubble: number;
  moneySupply: number;
}

export interface Notification {
  id: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'danger';
  tick: number;
}

export interface IsometricTile {
  x: number;
  y: number;
  type: BiomeType;
  elevation: number;
  landValue: number;
  cityId: string | null;
  resource: ResourceNode | null;
  variant: number; // for visual variety
}

export interface ResourceNode {
  type: 'iron' | 'coal' | 'oil' | 'timber' | 'gold' | 'lithium' | 'silica' | 'wheat' | 'fish';
  amount: number; // remaining
  maxAmount: number;
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
  cargo?: { kind: 'raw' | 'finished'; category: string };
}

export interface Goal {
  id: string;
  name: string;
  description: string;
  target: number;
  current: number;
  reward: number;
  completed: boolean;
  category: 'wealth' | 'expansion' | 'dominance' | 'innovation';
  knowledgeReward: number;
  deadlineYear: number | null;
}

export interface Bond {
  id: string;
  issuerId: string;
  faceValue: number;
  quantity: number;
  termYears: 5 | 10 | 15 | 20;
  issueYear: number;
  maturityYear: number;
  couponRate: number;
  rating: CreditRating;
  marketPrice: number;
  holderId: string | null;
  defaulted: boolean;
}

export interface BankOffer {
  id: string;
  bankName: string;
  companyId: string | null;
  interestRate: number;
  creditLimit: number;
  currentLoan: number;
  maxTermYears: number;
}

export interface Executive {
  id: string;
  role: 'COO' | 'CTO' | 'CMO';
  name: string;
  salary: number;
  expertise: Record<string, number>;
  hired: boolean;
  automation: boolean;
}

export interface ResearchProject {
  id: string;
  productId: string;
  companyId: string;
  targetTech: number;
  progress: number;
  durationMonths: number;
  active: boolean;
  completed: boolean;
}

export interface LandHolding {
  id: string;
  companyId: string;
  cityId: string;
  x: number;
  y: number;
  size: number;
  purchasePrice: number;
  currentValue: number;
  purchaseYear: number;
}

// ============= DIGITAL AGE =============

/** A researchable software technology (mirrors Tech.DBF / Tech_Classes.DBF). */
export interface Technology {
  id: string;
  code: string;
  name: string;
  techClass: string;
  /** Per-company tech level, keyed by company id. */
  levels: Record<string, number>;
  /** Highest level held by any company on the market. */
  topLevel: number;
  topHolderId: string | null;
}

/** Prerequisite entry linking a technology to a software product. */
export interface TechRequirement {
  technologyId: string;
  requiredLevel: number;
  /** Importance weight toward the finished product's overall tech level (sums to 100). */
  weight: number;
}

export interface SoftwareProduct {
  id: string;
  name: string;
  softwareClass: SoftwareClass;
  requirements: TechRequirement[];
  /** Company that has completed development, or null when unreleased. */
  ownerId: string | null;
  version: number;
  /** Overall tech level derived from weighted prerequisite technologies. */
  techLevel: number;
  quality: number;
  brand: number;
  price: number;
  /** Operating system this title targets; null for an OS product itself. */
  targetOsId: string | null;
  releasedYear: number;
  lastReleaseYear: number;
  autoNewVersion: boolean;
  unitsSoldDigital: number;
  unitsSoldPackaged: number;
  /** Only meaningful for Operating System products. */
  installedBase: number;
  appsAvailability: number;
}

export interface SoftwareProject {
  id: string;
  companyId: string;
  buildingId: string;
  softwareProductId: string;
  kind: 'technology' | 'product' | 'new_version';
  technologyId: string | null;
  progress: number;
  durationMonths: number;
  completed: boolean;
}

/** An individually recruited lead researcher or lead programmer. */
export interface Talent {
  id: string;
  name: string;
  role: TalentRole;
  /** Area of specialisation: a technology class or product class. */
  specialization: string;
  skill: number;
  salary: number;
  loyalty: number;
  cityId: string;
  employerId: string | null;
  buildingId: string | null;
  /** Automatically raise salary to hold the target loyalty. */
  autoLoyalty: boolean;
  targetLoyalty: number;
}

export interface TelecomStats {
  infrastructureCapacity: number;
  utilizedCapacity: number;
  monthlyPrice: number;
  nextMonthPrice: number;
  upgradeBudget: number;
  subscribers: number;
}

export interface EcommerceListing {
  productId: string;
  sourceBuildingId: string;
  /** Single national price: e-commerce cannot price per city. */
  price: number;
  freightPerUnit: number;
  unitsSold: number;
}

export interface ReplayPoint {
  year: number;
  month: number;
  cash: number;
  netWorth: number;
  revenue: number;
  profit: number;
  gdpGrowth: number;
  inflation: number;
}

export interface GameState {
  id: string;
  tick: number;
  speed: number;
  year: number;
  month: number;
  day: number;
  hour: number;
  timeOfDay: number; // 0-1
  season: 'spring' | 'summer' | 'autumn' | 'winter';
  dayOfYear: number;
  player: Player;
  cities: City[];
  companies: Company[];
  buildings: Building[];
  products: Product[];
  stockMarket: StockMarket;
  economy: Economy;
  notifications: Notification[];
  selectedBuilding: string | null;
  selectedCity: string | null;
  camera: Camera;
  mapSize: number;
  seed: number;
  goals: Goal[];
  overlay: OverlayMode;
  paused: boolean;
  freight: FreightRoute[];
  bonds: Bond[];
  bankOffers: BankOffer[];
  executives: Executive[];
  researchProjects: ResearchProject[];
  landHoldings: LandHolding[];
  replayHistory: ReplayPoint[];
  technologies: Technology[];
  softwareProducts: SoftwareProduct[];
  softwareProjects: SoftwareProject[];
  talents: Talent[];
  publicFacilities: PublicFacility[];
  /** Result of the latest acquisition attempt (for the seller's AI decision dialog). */
  lastOffer: {
    buildingId: string;
    status: 'accepted' | 'rejected' | 'counter';
    offerAmount: number;
    counterAmount: number;
    message: string;
    sellerName: string;
  } | null;
  /** Digital Age difficulty knobs. */
  digitalAge: {
    enabled: boolean;
    softwareRevenueIndex: number;
    internetRevenueIndex: number;
    talentSystem: 'full' | 'simplified' | 'greatly_simplified';
    disruptionToTraditionalMedia: boolean;
    maxEcommerceShare: number;
  };
  tutorialStep: number;
  scoutingComplete: boolean;
  technologyDisruption: boolean;
  inverseInflation: boolean;
  scenario: string;
}

export interface FreightRoute {
  id: string;
  fromBuildingId: string;
  toBuildingId: string;
  good: string;
  amount: number;
  progress: number;
  truckId: string;
  distance: number;
  freightCost: number;
  status: 'loading' | 'in_transit' | 'delivered';
}

// ============= UI STATE =============

export type UIPanel =
  | 'none'
  | 'company'
  | 'city'
  | 'building'
  | 'build'
  | 'stock_market'
  | 'finances'
  | 'supply_chain'
  | 'products'
  | 'goals'
  | 'settings'
  | 'research'
  | 'executives'
  | 'land'
  | 'scouting'
  | 'classroom'
  | 'news'
  | 'scenarios'
  | 'digital'
  | 'talent';

export interface UIState {
  activePanel: UIPanel;
  showMinimap: boolean;
  showHUD: boolean;
  showOverlays: boolean;
}
