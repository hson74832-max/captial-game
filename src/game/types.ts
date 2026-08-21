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
/** Household income bands — each shops differently. */
export type IncomeTier = 'low' | 'middle' | 'affluent';

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
  /** Persistent B2B contract id. */
  contractId: string;
  productId: string;
  supplierBuildingId: string;
  /** Agreed wholesale price before freight. Locked until expiry. */
  pricePerUnit: number;
  freightPerUnit: number;
  quality: number;
  /** Contract start and expiry ticks (default 12 months). */
  startedTick: number;
  expiresTick: number;
  /** Reliability and punctuality track supplier performance, 0..100. */
  reliability: number;
  punctuality: number;
  deliveries: number;
  onTimeDeliveries: number;
  /** Relationship discount baked into the agreed price, 0..0.15. */
  loyaltyDiscount: number;
  /** Minimum order quantity and early-termination notice. */
  minimumOrder: number;
  noticeMonths: number;
  active: boolean;
  /** 'internal' for vertical integration (cost basis), 'forward_contract' for fixed-price 6-12m B2B, 'spot' for spot market. */
  contractType: 'spot' | 'internal' | 'forward_contract';
  /** Early-cancellation or delivery-failure penalty fee. */
  penaltyFee: number;
  /** Promised monthly volume. */
  volumeCommitment: number;
  /** Quality specification rejection rate (e.g. 0.05 = 5% rejected for sub-spec quality). */
  rejectionRate: number;
}

/** In-transit pipeline order with processing delay and cold-chain/spoilage risk. */
export interface PipelineOrder {
  id: string;
  contractId: string;
  fromBuildingId: string;
  toBuildingId: string;
  productId: string;
  amount: number;
  processingHoursRemaining: number;
  transitHoursRemaining: number;
  totalHours: number;
  isPerishable: boolean;
  spoilageRate: number;
  unitCost: number;
  freightCost: number;
  isInternalTransfer: boolean;
}


export interface SupplyContractOffer {
  productId: string;
  supplierBuildingId: string;
  supplierName: string;
  supplierCompanyName: string;
  pricePerUnit: number;
  freightPerUnit: number;
  landedCost: number;
  quality: number;
  reliability: number;
  availableStock: number;
  loyaltyDiscount: number;
}

/** A legally owned land tile with zoning and development rights. */
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
  /** A parcel may be held speculatively or consumed by a development. */
  developedBuildingId: string | null;
  /** Annual tax rate applied to current value. */
  propertyTaxRate: number;
}

/** Physical cargo sailing toward a port. Inventory appears only on arrival. */
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

export interface ResourceNode {
  type: 'iron' | 'coal' | 'oil' | 'timber' | 'gold' | 'lithium' | 'silica' | 'wheat' | 'fish';
  amount: number;
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
  incomeMix: Record<IncomeTier, number>;
  /** Discretionary spend per household per month, by tier (USD). */
  discretionaryBudget: Record<IncomeTier, number>;
  /** Residents' resistance to new development, 0..100. */
  nimbyLevel: number;
  /** Private/owner-occupied housing not represented as corporate map assets. */
  backgroundHousingUnits: number;
  /** Jobs in small businesses and public services outside the corporate map. */
  backgroundJobs: number;
  /** Industrial/smog stock (0-150); hurts health, land values, migration. */
  pollution: number;
  /** Household balance sheet: months of savings and debt/income ratio. */
  householdSavingsMonths: number;
  householdDebtRatio: number;
}

/** Endogenous political layer: elections and lobbies move policy. */
export interface Politics {
  rulingParty: 'progressive' | 'centrist' | 'libertarian';
  approval: number;
  nextElectionYear: number;
  industryLobbyPower: number;
  environmentalLobbyPower: number;
}

/** Global commodity price with elastic supply/demand feedback loops. */
export interface GlobalMarket {
  /** productId → world spot price */
  price: Record<string, number>;
  /** productId → running 30-day net export volume (positive = we export) */
  netExport: Record<string, number>;
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
  assetHoldings: Record<string, number>;
  assetCostBasis: Record<string, number>;
  observedPlayerShare: Record<string, number>;
  /** Forward earnings the market is pricing in. */
  expectedEarnings: number;
  /** Categories where player has purchased market research */
  researchedCategories: string[];
  /** Ticks remaining of a predatory pricing campaign. */
  predatoryTicks: number;
  /** Cartel this firm belongs to, if any. */
  cartelId: string | null;
  /** Board optimism 0..2 — herding drives overexpansion bubbles. */
  sentiment: number;
  /** Visible board character and long-run strategic focus. */
  personality: string;
  sectorFocus: 'retail' | 'industrial' | 'real_estate' | 'hospitality' | 'diversified';
  riskTolerance: number;
  planningHorizonMonths: number;
  /** Player-paid intelligence report level and expiry. */
  playerIntelLevel: 0 | 1 | 2;
  intelExpiresTick: number;
  /** Successful espionage reveals cost floors until this tick. */
  espionageCostIntelUntilTick: number;
  // ── Taxation ──
  /** Unused capital losses carried forward against future gains (positive). */
  lossCarryforward: number;
  /** All tax paid this fiscal year — corporate, dividend, property, CGT. */
  taxesPaidYTD: number;
  /** Accumulated pre-tax operating profit this fiscal year. */
  pretaxProfitYTD: number;
  /** Last full-year tax bill, for the UI. */
  taxesPaidLastYear: number;
  /** Equity stakes held in other companies: companyId → share count. */
  equityHoldings: Record<string, number>;
  /** Cost basis for equity stakes (companyId → total paid). */
  equityCostBasis: Record<string, number>;
  /** Shares of THIS company held by the player (player company only). */
  founderShares: number;
  /** Annual secondary-offering cap tracking. */
  shareIssuanceYear: number;
  sharesIssuedThisYear: number;
  // ── Daily snapshot: UI-visible financials, refreshed at hour 0 ──
  dailyCash: number;
  dailyMarketCap: number;
  dailySharePrice: number;
  dailyRevenue: number;   // per day, UI × 30
  dailyProfit: number;    // per day, UI × 30
  dailyExpenses: number;
  dailyNetWorth: number;  // player only
  // ── Per-tick accumulators (reset at hour 0) ──
  revenueAccum: number;
  profitAccum: number;
  expensesAccum: number;
  /** Daily historical market prices, capped for chart performance. */
  sharePriceHistory: number[];
  /** Financial-statement cash-flow buckets for the current year. */
  operatingCashFlow: number;
  investingCashFlow: number;
  financingCashFlow: number;
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
  productionCost: number;
  /** Rating weights, summing to 100 — the Capitalism rating model. */
  priceWeight: number;
  qualityWeight: number;
  brandWeight: number;
  /** Technology level, raised by R&D. Drives achievable quality. */
  techLevel: number;
  /** Year the product enters the market. Cannot be produced before then. */
  unlockYear: number;
  /** Year the product becomes obsolete (or Infinity if it doesn't). */
  obsoleteYear?: number;
  marketDemand: number;
  playerMarketShare: number;
  segment: MarketSegment;
  inputs: Array<{ productId: string; productName: string; quantity: number }>;
}


export interface BuildingCostBreakdown {
  rentMortgage: number;
  utilities: number;
  inventoryStock: number;
  staffWages: number;
  payrollTaxesBenefits: number;
  marketingAdvertising: number;
  equipment: number;
  insurance: number;
  licensesPermits: number;
  maintenanceRepairs: number;
  cardProcessing: number;
  packagingBags: number;
  accountingLegal: number;
  propertyTax: number;
  municipalFees: number;
  reserveContribution: number;
  freight: number;
  other: number;
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
  /** Current hourly cost ledger. Inventory is COGS and listed separately. */
  costBreakdown: BuildingCostBreakdown;
  revenue: number;
  profit: number;
  cogs: number;
  employees: number;
  /** Required headcount at current capacity. Zero staff means no output. */
  targetEmployees: number;
  /** Average annual salary paid to current staff. */
  averageAnnualSalary: number;
  /** Average skill level of the staff (0-9). Hiring and training drive this. */
  staffSkill: number;
  /** Hiring rate per hour. Recruiting from the talent pool is slow. */
  recruitingRate: number;
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
  /** Tenants currently occupying units (integer count, 0..capacity). */
  tenants: number;
  /** Tick when rent was last adjusted. Rent can only change once per year. */
  rentLastAdjustedTick: number;
  /** Tick when the last tenant who was told to leave actually departs (3 months). */
  leaseExpiryTick: number;
  /** Money set aside for major repairs (roof, facade, heating), USD. */
  maintenanceReserve: number;
  /** Reserved share for the maintenance reserve, e.g. 0.01 = 1% of building value/yr. */
  reserveRate: number;
  /** Sell-price multiplier for farm/factory open-market sales (1 = spot). */
  sellPriceMultiplier: number;
  /** Farm output tier: standard / premium / organic (affects price & quality). */
  productTier: 'standard' | 'premium' | 'organic';
  /** Livestock breed choice (dairy_cow, angus_beef, free_range_hen…). */
  livestockBreed: string | null;
  /** Feed quality 0-1 — better feed = higher output quality & yield. */
  feedQuality: number;
  /** Veterinary/agronomy program level 0-3. Reduces disease/pest losses. */
  vetProgram: number;
  /** Whether the farm/producer sells surplus on the open market. */
  openMarketSales: boolean;
  /** Units sold on the open market last tick (for the UI). */
  marketUnitsSold: number;
  /** Financing: monthly mortgage/lease payment if bought/rented on credit. */
  financingPayment: number;
  financingMonthsLeft: number;
  /** True if this building is leased (rented), not owned. */
  isLeased: boolean;
  /** Farm operating metrics (ignored by non-farms). */
  farmSizeHectares: number;
  soilHealth: number;
  weatherFactor: number;
  growthStage: 'planting' | 'growing' | 'harvest' | 'dormant';
  irrigationLevel: number;
  /** Better agronomy/genetics: raises yield and quality, developed by investment. */
  farmTechniqueLevel: number;
  /** Tractors, milking systems, cold storage: raises efficiency and quality. */
  farmEquipmentLevel: number;
  /** Internal transfer pricing mode for intra-company supply transfers. */
  transferPricingMode: 'cost_basis' | 'custom' | 'market_spot';
  /** Custom transfer price multiplier when transferPricingMode === 'custom' (e.g. 1.10 = cost+10%). */
  transferPriceMultiplier: number;
  /** Disease outbreak ticks remaining on farm. While > 0, yield drops 80% and quality drops. */
  diseaseTicksRemaining: number;
  /** Spoilage losses YTD for accounting reporting. */
  spoilageLossYTD: number;
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
  /** B2B Relationship / Loyalty with suppliers (supplierId -> 0 to 100). Grants discounts. */
  supplierRelationships: Record<string, number>;
  /** Auto picks best supplier; manual preserves user-selected contracts. */
  supplyMode: 'auto' | 'manual';
  /** The cached fair market value, updated only on the 1st of the month. */
  monthlyFairValue: number;
  /** Property market listing state. */
  forSale: boolean;
  askingPrice: number;
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
  // ── Behavioural retail ──
  /** Reference price customers have anchored on. */
  anchorPrice: number;
  /** Bestseller momentum from social proof, 0..1. */
  socialProof: number;
  /** Sticky share of customers who habitually shop here, 0..1. */
  loyalCustomerBase: number;
  // ── Labour ──
  /** Effective skill 0..9 that lags the funded training level. */
  effectiveTraining: number;
  // ── Supply chain ──
  /** Smoothed demand estimate used for ordering — the bullwhip driver. */
  demandForecast: number;
  /** Safety-stock policy: 0 = pure JIT, 1 = heavy buffer. */
  safetyStockPolicy: number;
  /** Production intensity 0.6..1.4; rushing degrades quality. */
  productionIntensity: number;
  /** True when a supplier failed and this site is stranded. */
  supplyDisrupted: boolean;
  /** Tick when construction finishes; the site cannot operate before then. */
  constructionEndsTick: number;
  /** Accumulated advertising goodwill (0-100); decays without ad support. */
  brandEquity: number;
  /** Workforce is unionised — wages less flexible, strike risk. */
  unionized: boolean;
  unionWagePremium: number;
  /** Remaining strike hours; production is halted while > 0. */
  strikeTicks: number;
  /** What the current owner paid for this building (flip-tax basis). */
  purchasePrice: number;
  /** Tick the current owner acquired it — decides short vs long-term gains. */
  acquiredAtTick: number;
  // ── Per-tick accumulators (reset every hour = 0) ──
  revenueAccum: number;
  cogsAccum: number;
  opexAccum: number;
  profitAccum: number;
  utilizationAccum: number;
  soldUnitsAccum: number;
  producedUnitsAccum: number;
  // ── Daily snapshot: values shown to the UI, refreshed at hour 0 ──
  /** Revenue per day (USD). UI shows × 30 for /mo. */
  dailyRevenue: number;
  dailyCogs: number;
  dailyOpex: number;
  dailyProfit: number;
  dailyUtilization: number;
  dailySold: number;
  dailyProduced: number;
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
  /** Carbon tax per unit of industrial output, USD. */
  carbonTaxPerUnit: number;
  /** Tax withheld on dividends received. */
  dividendTaxRate: number;
  /** Bank credit outstanding — the lending channel that creates M2. */
  bankCredit: number;
  /** Nominal GDP, computed from actual production and trade. */
  nominalGdp: number;
  /** Central bank balance sheet: total assets (QE/QT). */
  centralBankAssets: number;
  /** Base money in circulation. */
  baseMoney: number;
  /** Broad money M2. */
  broadMoney: number;
  /** Government deficit (tax receipts - spending). */
  governmentDeficit: number;
  /** Government total debt outstanding. */
  governmentDebt: number;
  /** Average 10-year government bond yield. */
  tenYearYield: number;
  /** Average 2-year government bond yield. */
  twoYearYield: number;
  /** 3-month government yield. */
  threeMonthYield: number;
  /** CPI broken into categories (food, housing, energy, services, goods). */
  cpiByCategory: Record<string, number>;
  /** Household savings rate (affects consumption). */
  householdSavingsRate: number;
  /** Average unit labor cost growth (wage spiral component). */
  unitLaborCostGrowth: number;
  /** Productivity growth (drives real wage potential). */
  productivityGrowth: number;
  /** Strategic petroleum reserve, days of consumption. */
  strategicReserveDays: number;
  /** Atmospheric CO2 (ppm). Rises with industrial emissions. */
  co2Stock: number;
  /** Banking sector health: capital adequacy, provisions, credit tightness. */
  bankCapitalAdequacy: number;
  loanLossProvisions: number;
  creditTightness: number;
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
  holderId: string | null;
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
  /** FIFO tax lots — the basis for correct short vs long-term gains. */
  taxLots: TaxLot[];
  // ── Physical supply ──
  /** Total existing stock in the world, in the asset's own unit. */
  worldSupply: number;
  /** Fraction of world supply that is actually tradeable. */
  floatShare: number;
  /** New units entering the world each year (mining, drilling, harvest). */
  annualNewSupply: number;
  /** Units consumed/destroyed each year. */
  annualConsumption: number;
  /** Units currently available to trade. Buying drains it. */
  circulating: number;
  /** In-world index funds track these company ids; null for commodities. */
  trackedCompanyIds: string[] | null;
  /** Year the asset becomes tradeable (BTC 2008, ETFs when fund launches). */
  unlockYear: number;
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

// ── Institutions ──
/** Government policy state, which moves with the cycle. */
export interface Government {
  corporateTaxRate: number;
  /** Annual property tax on assessed building + land value. */
  propertyTaxRate: number;
  carbonTaxPerUnit: number;
  minimumWage: number;
  /** Antitrust threshold: share above which regulators intervene. */
  antitrustThreshold: number;
  /** Ticks until the next policy review. */
  nextReviewTick: number;
  /** Active investigations into the player. */
  antitrustWarnings: number;
}

/** A sovereign trading partner with its own currency and trade policy. */
export interface TradePartner {
  id: string;
  name: string;
  /** Units of foreign currency per 1 USD. Drifts over time. */
  exchangeRate: number;
  baseExchangeRate: number;
  /** Import duty applied to goods arriving from this partner, 0..1. */
  tariffRate: number;
  /** Average wage index vs domestic (0.2 = very cheap labour). */
  wageIndex: number;
  /** Quality penalty applied to offshored production, 0..1. */
  qualityPenalty: number;
  /** -100 hostile .. 100 allied. */
  relationship: number;
}

/** Patent granting a temporary monopoly before commoditisation. */
export interface Patent {
  id: string;
  productId: string;
  ownerId: string;
  grantedYear: number;
  expiresYear: number;
}

/** A live R&D programme that can genuinely fail. */
export interface ResearchProject {
  id: string;
  productId: string;
  companyId: string;
  targetTech: number;
  progress: number;
  active: boolean;
  completed: boolean;
  failed: boolean;
}

/** A price-fixing arrangement between AI boards. Regulators may break it up. */
export interface Cartel {
  id: string;
  memberIds: string[];
  productId: string;
  /** Agreed floor price multiplier. */
  agreedFloor: number;
  formedTick: number;
  /** Chance per month a member defects for short-term share. */
  stability: number;
  exposed: boolean;
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
  government: Government;
  tradePartners: TradePartner[];
  patents: Patent[];
  cartels: Cartel[];
  researchProjects: ResearchProject[];
  bonds: Bond[];
  /** Purchasable land titles and development rights. */
  landHoldings: LandHolding[];
  /** External cargo physically traveling toward state seaports. */
  portShipments: PortShipment[];
  /** B2B Supply chain processing and cold-chain transit pipeline. */
  pipelineOrders: PipelineOrder[];
  /** Dynamic world market for ports and export/import feedback. */
  globalMarket: GlobalMarket;
  /** Voters, lobbies and elections make policy endogenous. */
  politics: Politics;
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
