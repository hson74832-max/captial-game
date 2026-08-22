// ============================================================================
// CORE TYPE SYSTEM — Isometric Business Simulation
// ============================================================================

export type BuildingType =
  | 'farm' | 'mine' | 'factory' | 'warehouse' | 'retail_store'
  | 'cafe' | 'fast_food' | 'restaurant' | 'bar'
  | 'apartment' | 'office' | 'hq' | 'lab' | 'seaport';

export type ProductKind = 'raw' | 'farm' | 'semi' | 'consumer';
export type ZoneType = 'commercial' | 'residential' | 'mixed' | 'industrial' | 'rural';
export type TerrainType = 'water' | 'beach' | 'grass' | 'forest' | 'hills' | 'mountain' | 'desert';
export type EconomyCycle = 'boom' | 'growth' | 'recession' | 'recovery';
export type AISkill = 'novice' | 'competent' | 'shrewd' | 'ruthless';
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type Overlay = 'none' | 'land' | 'zone' | 'traffic' | 'pollution' | 'owners';

export interface Recipe { productId: string; quantity: number }

export interface Product {
  id: string;
  name: string;
  icon: string;
  category: string;
  kind: ProductKind;
  productionCost: number;   // marginal input+process cost per unit
  basePrice: number;
  currentPrice: number;     // prevailing wholesale/market price
  retailPrice: number;      // typical shelf price
  quality: number;          // 0..100
  demandIndex: number;      // 0..100 necessity
  marketDemand: number;     // dynamic 0..100
  inputs: Recipe[];
  worldSupply: number;
  worldDemand: number;
  priceHistory: number[];

  // ── Consumer model ──
  segment: MarketSegment;
  /** What shoppers actually believe the quality is, after marketing and reviews. */
  perceivedQuality: number;
  /** Brand strength 0..100 — blunts price sensitivity. */
  brand: number;
  /** Rating weights, summing to 100 — the Capitalism rating model. */
  priceWeight: number;
  qualityWeight: number;
  brandWeight: number;
  /** Technology level, raised by R&D. Drives achievable quality. */
  techLevel: number;
}

export type MarketSegment = 'value' | 'mainstream' | 'premium' | 'luxury';
export type IncomeTier = 'low' | 'middle' | 'affluent';

/** Cargo physically sailing toward a port. Inventory appears only on arrival. */
export interface PortShipment {
  id: string;
  portBuildingId: string;
  productId: string;
  amount: number;
  progress: number;
  transitHours: number;
  unitCost: number;
  origin: string;
}

/** World commodity price with elastic supply/demand feedback. */
export interface GlobalMarket {
  price: Record<string, number>;
  netExport: Record<string, number>;
}

export interface IncomeMix { low: number; middle: number; affluent: number }

export interface City {
  id: string;
  name: string;
  x: number;
  y: number;
  radius: number;
  population: number;
  color: string;
  tier: 'small' | 'medium' | 'large' | 'metropolis';
  wageRate: number;
  landCostMultiplier: number;
  unemploymentRate: number;
  gdpPerCapita: number;
  medianAge: number;
  educationIndex: number;
  familyShare: number;
  birthRate: number;
  deathRate: number;
  netMigrationRate: number;
  qualityOfLife: number;
  trafficLevel: number;
  pollution: number;
  housingDemand: number;    // -100 shortage .. +100 glut
  incomeMix: IncomeMix;
  discretionary: IncomeMix; // monthly discretionary $ per household
  backgroundHousing: number;
  backgroundJobs: number;
  populationHistory: number[];
  growthRate: number;
  /** Household balance sheet: months of savings and debt/income ratio. */
  householdSavingsMonths: number;
  householdDebtRatio: number;
  // ── Labour market structure ──
  /** Share of vacancies unfilled for want of the right skills, 0..1. */
  skillGap: number;
  /** Willingness/cost of workers relocating here, 0..1 (higher = stickier). */
  laborMobility: number;
  /** Local particulate loading, µg/m³. */
  pm25: number;
  waterStress: number;
  /** Quality of publicly provided infrastructure, 0..100. */
  infrastructure: number;
}

/** One product in one city. Regional buffers + transport friction make
 *  arbitrage real: a spread narrower than the freight cost is not worth
 *  moving, so it persists. */
export interface RegionQuote {
  supply: number;      // recent local production arriving at market
  demand: number;      // recent local uptake
  stock: number;       // buffered units held locally
  priceMul: number;    // local price vs national, 1 = at parity
  pressure: number;    // smoothed imbalance -1..1
}

/** Emissions trading: a declining cap with tradeable allowances. */
export interface EtsState {
  cap: number;
  price: number;
  allocated: Record<string, number>;
  surrendered: number;
  revenue: number;
}

export interface CostLedger {
  wages: number; payrollTax: number; utilities: number; marketing: number;
  maintenance: number; insurance: number; propertyTax: number; freight: number;
  interest: number; other: number;
}

export interface SupplyLink {
  id: string;
  productId: string;
  supplierBuildingId: string;
  supplierName: string;
  unitsPerOrder: number;
  pricePerUnit: number;
  freightPerUnit: number;
  reliability: number;
  deliveries: number;
  active: boolean;
}

export interface Building {
  id: string;
  type: BuildingType;
  name: string;
  companyId: string;
  cityId: string;
  x: number;
  y: number;
  level: number;
  maxLevel: number;
  capacity: number;
  employees: number;
  targetEmployees: number;
  wagePerEmployee: number;   // annual
  staffSkill: number;        // 0..10
  trainingBudget: number;    // 0..1
  morale: number;
  condition: number;
  isOperating: boolean;
  constructionEndsTick: number;
  constructionCost: number;
  landValue: number;
  purchasePrice: number;

  productId: string | null;
  products: string[];
  inventory: Record<string, number>;
  inventoryCapacity: number;
  supplierLinks: SupplyLink[];
  autoRestock: boolean;

  pricingMultiplier: number;
  adBudget: number;          // monthly
  brandEquity: number;
  loyalty: number;
  socialProof: number;

  utilization: number;
  customerTraffic: number;
  lastUnitsSold: number;
  lastUnitsProduced: number;
  revenue: number;           // per tick
  cogs: number;
  operatingCost: number;
  profit: number;
  costs: CostLedger;

  // real estate
  tenants: number;
  occupancy: number;
  rentPerUnit: number;
  rentMultiplier: number;

  // resources / agriculture
  resourceType: string | null;
  resourceRemaining: number;
  resourceMax: number;
  soilHealth: number;
  irrigation: number;
  growthStage: 'planting' | 'growing' | 'harvest' | 'dormant';

  // behavioural retail
  anchorPrice: number;          // the price shoppers anchored on
  loyalCustomerBase: number;    // habitual share, 0..1

  forSale: boolean;
  askingPrice: number;
  fairValue: number;
  monthsUnprofitable: number;
  spoilageYTD: number;

  // tenure & financing
  isLeased: boolean;
  financingPayment: number;
  financingMonthsLeft: number;

  // labour relations
  unionized: boolean;
  unionWagePremium: number;
  strikeTicks: number;

  // trade policy
  supplyMode: 'auto' | 'manual';
  supplierRelationships: Record<string, number>;
  internalSale: boolean;
  sellPriceMultiplier: number;
  transferPricingMode: 'cost_basis' | 'custom' | 'market_spot';
  transferPriceMultiplier: number;
  supplyDisrupted: boolean;

  // agriculture depth
  livestockBreed: string | null;
  feedQuality: number;
  vetProgram: number;
  productTier: 'standard' | 'premium' | 'organic';
  farmTechniqueLevel: number;
  farmEquipmentLevel: number;
  diseaseTicks: number;

  // negotiation
  offersMade: number;
  negotiationBlockedUntil: number;

  // supply-chain behaviour (bullwhip / operations)
  demandForecast: number;
  safetyStockPolicy: number;      // 0 = pure JIT, 1 = heavy buffer
  productionIntensity: number;    // 0.6..1.4 — rushing degrades quality
  trainingLevel: number;          // funded capability target, 0..9
  effectiveTraining: number;      // realised skill, lags the funded level
  /** Capital-for-labour substitution, 0..5. Raises output, cuts headcount. */
  automationLevel: number;
  openMarketSales: boolean;
  marketUnitsSold: number;
  maintenanceReserve: number;

  // retail format
  specialisation: string | null;
  productSlots: number;
  menu: MenuItem[];

  // rolling stats
  dailyRevenue: number; dailyProfit: number; dailyProduced: number; dailySold: number;
  revenueAccum: number; profitAccum: number; producedAccum: number; soldAccum: number;
  profitHistory: number[];
}

export interface Company {
  id: string;
  name: string;
  isPlayer: boolean;
  color: string;
  cash: number;
  debt: number;
  interestRate: number;
  revenue: number;
  expenses: number;
  profit: number;
  totalAssets: number;
  sharePrice: number;
  sharesOutstanding: number;
  marketCap: number;
  sharePriceHistory: number[];
  brandValue: number;
  bondRating: string;
  skill: AISkill;
  acumen: number;
  strategy: 'aggressive' | 'balanced' | 'conservative';
  sectorFocus: 'retail' | 'industrial' | 'real_estate' | 'hospitality' | 'diversified';
  personality: string;
  buildings: string[];
  equityHoldings: Record<string, number>;
  equityCostBasis: Record<string, number>;
  founderShares: number;
  sharesIssuedThisYear: number;
  shareIssuanceYear: number;
  costIntelUntilTick: number;
  researchedCategories: string[];
  lossCarryforward: number;
  monthsInDistress: number;
  dividendPayout: number;
  taxesPaidYTD: number;
  taxesPaidLastYear: number;
  pretaxYTD: number;
  monthlyRevenue: number;
  monthlyProfit: number;
  revenueAccum: number;
  profitAccum: number;
  profitHistory: number[];

  // ── Treasury, competition & board behaviour ──
  assetHoldings: Record<string, number>;
  assetCostBasis: Record<string, number>;
  observedPlayerShare: Record<string, number>;
  predatoryTicks: number;
  cartelId: string | null;
  sentiment: number;              // board optimism 0..2, drives overexpansion
  riskTolerance: number;
  planningHorizonMonths: number;

  // ── Capital structure ──
  /** Maximum shares the charter permits — the ceiling on issuance. */
  authorizedShares: number;
  /** Shares bought back and held in treasury (retired from float). */
  treasuryShares: number;
  buybackYear: number;
  sharesBoughtBackThisYear: number;

  // ── Capability & competition ──
  rndBudgetMonthly: number;
  automationLevel: number;      // 0..5 capital-for-labour substitution
  execSalaryPremium: number;    // auctioned premium paid for C-suite talent
  marketIntelTick: number;      // last refresh of aggregated market data
  lobbySpendMonthly: number;
  /** Months of observed player underpricing — bluff/predation detection. */
  suspectedPredation: number;
}

export interface Economy {
  cycle: EconomyCycle;
  cycleMonth: number;
  gdpGrowth: number;
  nominalGdp: number;
  inflation: number;
  cpi: number;
  interestRate: number;
  unemployment: number;
  consumerConfidence: number;
  businessConfidence: number;
  moneySupply: number;
  moneyVelocity: number;
  purchasingPower: number;
  dieselPrice: number;
  energyShockMonths: number;
  cbCredibility: number;
  guidance: 'hawkish' | 'neutral' | 'dovish';
  govDebt: number;
  govDeficit: number;
  corporateTaxRate: number;
  propertyTaxRate: number;
  minimumWage: number;
  tenYearYield: number;
  carbonTaxPerUnit: number;
  capitalGainsRate: number;
  shortTermCapitalGainsRate: number;
  longTermCapitalGainsRate: number;
  twoYearYield: number;
  threeMonthYield: number;
  dividendTaxRate: number;
  // ── Central bank & monetary aggregates ──
  centralBankAssets: number;
  baseMoney: number;
  broadMoney: number;
  // ── Labour & prices ──
  productivityGrowth: number;
  unitLaborCostGrowth: number;
  householdSavingsRate: number;
  cpiByCategory: Record<string, number>;
  strategicReserveDays: number;

  // ── Monetary aggregates & unconventional policy ──
  m1: number;
  m2: number;
  qeActive: boolean;
  qeMonthlyPace: number;        // % of GDP purchased per month
  qePurchasesToDate: number;
  // ── Supply side & business cycles ──
  tfpLevel: number;
  tfpGrowth: number;
  /** Kitchin inventory cycle phase, -1 destocking .. +1 restocking. */
  inventoryCycle: number;
  // ── Trade & external accounts ──
  termsOfTrade: number;
  commoditySuperCycle: number;
  // ── Carbon market ──
  etsAllowancePrice: number;
  etsCap: number;
  co2Stock: number;
  creditTightness: number;
  bankCapitalAdequacy: number;
  loanLossProvisions: number;
  history: { gdp: number[]; inflation: number[]; rate: number[]; unemployment: number[] };
}

export interface Politics {
  rulingParty: 'centrist' | 'progressive' | 'libertarian';
  approval: number;
  nextElectionYear: number;
  industryLobby: number;
  greenLobby: number;
  antitrustThreshold: number;
  nextReviewTick: number;
}

export interface LandHolding {
  id: string;
  ownerId: string;
  cityId: string | null;
  x: number;
  y: number;
  zone: ZoneType;
  purchasePrice: number;
  currentValue: number;
  purchaseTick: number;
  developedBuildingId: string | null;
}

export interface PipelineOrder {
  id: string;
  fromBuildingId: string;
  toBuildingId: string;
  productId: string;
  amount: number;
  processingHoursLeft: number;
  transitHoursLeft: number;
  totalHours: number;
  perishable: boolean;
  unitCost: number;
  freightCost: number;
  internal: boolean;
  fromX: number; fromY: number; toX: number; toY: number;
  companyColor: string;
}

export interface SupplyQuote {
  supplierBuildingId: string;
  supplierName: string;
  supplierCompany: string;
  productId: string;
  pricePerUnit: number;
  freightPerUnit: number;
  landedCost: number;
  quality: number;
  reliability: number;
  availableStock: number;
  distance: number;
  internal: boolean;
  loyaltyDiscount: number;
}

export interface SupplyContract {
  id: string;
  productId: string;
  supplierBuildingId: string;
  supplierName: string;
  pricePerUnit: number;
  freightPerUnit: number;
  quality: number;
  reliability: number;
  deliveries: number;
  onTime: number;
  minimumOrder: number;
  expiresTick: number;
  internal: boolean;
}

export interface Negotiation {
  buildingId: string;
  status: 'accepted' | 'counter' | 'rejected';
  offerAmount: number;
  counterAmount: number;
  message: string;
  sellerName: string;
}

// ───────────────────────── Capital markets & institutions ─────────────────────────

export type CreditRating = 'AAA' | 'AA' | 'A' | 'BBB' | 'BB' | 'B' | 'CCC' | 'CC' | 'C' | 'D';
export type AssetClass = 'commodity' | 'metal' | 'crypto' | 'etf';

/** A sovereign trading partner with its own currency and trade policy. */
export interface TradePartner {
  id: string;
  name: string;
  exchangeRate: number;      // units of foreign currency per 1 USD
  baseExchangeRate: number;
  tariffRate: number;        // 0..1 import duty
  wageIndex: number;
  qualityPenalty: number;
  relationship: number;      // -100 hostile .. 100 allied
}

/** Patent granting a temporary monopoly before commoditisation. */
export interface Patent {
  id: string;
  productId: string;
  ownerId: string;
  grantedYear: number;
  expiresYear: number;
}

/** A price-fixing arrangement between AI boards. Regulators may break it up. */
export interface Cartel {
  id: string;
  memberIds: string[];
  productId: string;
  agreedFloor: number;
  formedTick: number;
  stability: number;
  exposed: boolean;
}

/** A single purchase lot, stamped so holding periods are tracked exactly. */
export interface TaxLot {
  units: number;
  costPerUnit: number;
  openedTick: number;
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
  taxLots: TaxLot[];
  worldSupply: number;
  floatShare: number;
  annualNewSupply: number;
  annualConsumption: number;
  circulating: number;
  trackedCompanyIds: string[] | null;
  unlockYear: number;
}

export interface Bond {
  id: string;
  issuerId: string;
  faceValue: number;
  quantity: number;
  termYears: 5 | 10 | 15;
  issueYear: number;
  maturityYear: number;
  couponRate: number;
  rating: CreditRating;
  marketPrice: number;
  holderId: string | null;   // 'player' for the player's book
  defaulted: boolean;
}

export interface BondQuote {
  symbol: string;
  faceValue: number;
  marketPrice: number;
  couponRate: number;
  maturityYear: number;
  currentYear: number;
}

/** A menu line inside a hospitality venue. */
export interface MenuItem {
  id: string;
  name: string;
  category: 'main' | 'side' | 'drink' | 'dessert' | 'combo' | 'kids';
  price: number;
  foodCost: number;
  popularity: number;
  includesToy: boolean;
  enabled: boolean;
}

export interface StockMarket {
  index: number;
  indexHistory: number[];
  sentiment: 'bullish' | 'neutral' | 'bearish';
  ticker: NewsItem[];
}

export interface NewsItem {
  id: string;
  text: string;
  type: 'info' | 'warning' | 'breaking' | 'success';
  tick: number;
}

export interface Notification {
  id: string;
  message: string;
  type: 'info' | 'warning' | 'danger' | 'success';
  tick: number;
}

export interface Tile {
  type: TerrainType;
  elevation: number;
  landValue: number;
  cityId: string | null;
  zone: ZoneType;
  road: boolean;
  highway: boolean;
  variant: number;
  resource: { type: string; amount: number } | null;
}

export interface FreightTruck {
  id: string;
  fromX: number; fromY: number; toX: number; toY: number;
  progress: number; speed: number;
  productId: string; amount: number;
  companyColor: string;
  toBuildingId: string;
  unitCost: number;
}

export interface Agent {
  id: string;
  x: number; y: number;
  tx: number; ty: number;
  kind: 'car' | 'person';
  speed: number;
  color: string;
  cityId: string;
}

export interface Loan {
  id: string;
  principal: number;
  balance: number;
  rate: number;
  termMonths: number;
  monthsLeft: number;
  monthlyPayment: number;
  lender: string;
}

export interface AcquisitionOffer {
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

export interface ResearchProject {
  id: string;
  name: string;
  category: string;
  progress: number;
  cost: number;
  monthsLeft: number;
  effect: string;
}

export interface GameState {
  tick: number;
  seed: number;
  speed: number;
  paused: boolean;
  year: number; month: number; day: number; hour: number;
  dayOfYear: number;
  season: Season;
  timeOfDay: number;
  mapSize: number;
  tiles: Tile[][];
  cities: City[];
  companies: Company[];
  buildings: Building[];
  products: Product[];
  economy: Economy;
  stockMarket: StockMarket;
  notifications: Notification[];
  freight: FreightTruck[];
  agents: Agent[];
  loans: Loan[];
  offers: AcquisitionOffer[];
  research: ResearchProject[];
  politics: Politics;
  tradePartners: TradePartner[];
  patents: Patent[];
  cartels: Cartel[];
  globalMarket: GlobalMarket;
  portShipments: PortShipment[];
  /** cityId → productId → regional buffer. Sparse until a market trades. */
  regional: Record<string, Record<string, RegionQuote>>;
  ets: EtsState;
  /** Per-industry competition mode: quantity (Cournot) or price (Bertrand). */
  competitionModes: Record<string, 'cournot' | 'bertrand'>;
  bonds: Bond[];
  tradedAssets: TradedAsset[];
  landHoldings: LandHolding[];
  pipeline: PipelineOrder[];
  contracts: Record<string, SupplyContract[]>;
  negotiation: Negotiation | null;
  playerCompanyId: string;
  selectedBuildingId: string | null;
  selectedCityId: string | null;
  buildMode: BuildingType | null;
  landMode: boolean;
  overlay: Overlay;
  stats: { netWorthHistory: number[]; revenueHistory: number[] };
}
