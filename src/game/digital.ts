import type {
  GameState, Technology, SoftwareProduct, SoftwareProject, Talent, City,
  Building, SoftwareClass, TalentRole, Company,
} from './types';
import type { StateIndex } from './indexing';
import { buildingsOfType } from './indexing';

// ============= TECHNOLOGY CATALOGUE =============
// Mirrors the Tech_Classes.DBF / Tech.DBF structure: a class code, a technology
// code, and per-product prerequisite weights summing to 100.

interface TechSeed { code: string; name: string; techClass: string }

const TECH_SEEDS: TechSeed[] = [
  { code: 'OS_CORE', name: 'Computer OS Core', techClass: 'Operating System' },
  { code: 'OS_DISPLAY', name: 'Computer OS Display', techClass: 'Operating System' },
  { code: 'OS_INPUT', name: 'Computer OS Input', techClass: 'Operating System' },
  { code: 'DOC_ENGINE', name: 'Document Engine', techClass: 'Office' },
  { code: 'SPREADSHEET', name: 'Spreadsheet Engine', techClass: 'Office' },
  { code: 'VIRUS_DB', name: 'Virus Signature DB', techClass: 'Security' },
  { code: 'HEURISTIC', name: 'Heuristic Analysis', techClass: 'Security' },
  { code: 'MODEL_3D', name: '3D Modelling Engine', techClass: 'Graphics' },
  { code: 'GFX_3D', name: '3D Graphics', techClass: 'Graphics' },
  { code: 'RASTER', name: 'Raster Imaging', techClass: 'Graphics' },
  { code: 'VIDEO_CODEC', name: 'Video Codec', techClass: 'Video' },
  { code: 'TIMELINE', name: 'Timeline Editing', techClass: 'Video' },
  { code: 'AUDIO_DSP', name: 'Audio DSP', techClass: 'Audio' },
  { code: 'DISK_MGMT', name: 'Disk Management', techClass: 'Utility' },
  { code: 'CORE_SEARCH', name: 'Core Search Tech', techClass: 'Internet' },
  { code: 'SOCIAL_GRAPH', name: 'Social Graph', techClass: 'Internet' },
  { code: 'RECOMMENDER', name: 'Recommendation Engine', techClass: 'Internet' },
];

interface SoftwareSeed {
  name: string;
  softwareClass: SoftwareClass;
  requirements: Array<{ code: string; requiredLevel: number; weight: number }>;
  price: number;
}

const SOFTWARE_SEEDS: SoftwareSeed[] = [
  {
    name: 'Computer OS', softwareClass: 'Operating System', price: 180,
    requirements: [
      { code: 'OS_CORE', requiredLevel: 30, weight: 50 },
      { code: 'OS_DISPLAY', requiredLevel: 20, weight: 30 },
      { code: 'OS_INPUT', requiredLevel: 10, weight: 20 },
    ],
  },
  {
    name: 'Word Processor', softwareClass: 'Office Software', price: 120,
    requirements: [
      { code: 'DOC_ENGINE', requiredLevel: 25, weight: 70 },
      { code: 'OS_DISPLAY', requiredLevel: 10, weight: 30 },
    ],
  },
  {
    name: 'Spreadsheet Suite', softwareClass: 'Office Software', price: 150,
    requirements: [
      { code: 'SPREADSHEET', requiredLevel: 30, weight: 65 },
      { code: 'DOC_ENGINE', requiredLevel: 15, weight: 35 },
    ],
  },
  {
    name: 'Anti-Virus Software', softwareClass: 'Computer Security', price: 90,
    requirements: [
      { code: 'VIRUS_DB', requiredLevel: 25, weight: 55 },
      { code: 'HEURISTIC', requiredLevel: 20, weight: 45 },
    ],
  },
  {
    name: '3D Modelling Software', softwareClass: 'Graphic Design Software', price: 640,
    requirements: [
      { code: 'MODEL_3D', requiredLevel: 20, weight: 60 },
      { code: 'GFX_3D', requiredLevel: 10, weight: 40 },
    ],
  },
  {
    name: 'Photo Editor', softwareClass: 'Graphic Design Software', price: 320,
    requirements: [
      { code: 'RASTER', requiredLevel: 25, weight: 70 },
      { code: 'GFX_3D', requiredLevel: 10, weight: 30 },
    ],
  },
  {
    name: 'Video Editor', softwareClass: 'Video Software', price: 480,
    requirements: [
      { code: 'VIDEO_CODEC', requiredLevel: 25, weight: 55 },
      { code: 'TIMELINE', requiredLevel: 20, weight: 45 },
    ],
  },
  {
    name: 'Audio Workstation', softwareClass: 'Audio Software', price: 380,
    requirements: [
      { code: 'AUDIO_DSP', requiredLevel: 30, weight: 100 },
    ],
  },
  {
    name: 'Disk Utility', softwareClass: 'Utility Software', price: 60,
    requirements: [
      { code: 'DISK_MGMT', requiredLevel: 20, weight: 100 },
    ],
  },
];

const FIRST_NAMES = ['Ada', 'Grace', 'Linus', 'Alan', 'Kai', 'Mira', 'Ravi', 'Nina', 'Tomas', 'Yuki', 'Omar', 'Lena', 'Diego', 'Sofia', 'Jonas'];
const LAST_NAMES = ['Chen', 'Novak', 'Okafor', 'Silva', 'Tanaka', 'Muller', 'Rossi', 'Haddad', 'Kowalski', 'Andersen', 'Reyes', 'Fischer'];

let digitalIdCounter = 0;
function nextId(prefix: string) {
  digitalIdCounter += 1;
  return `${prefix}_${digitalIdCounter}`;
}

// ============= GENERATION =============

export function generateTechnologies(): Technology[] {
  return TECH_SEEDS.map(seed => ({
    id: nextId('tech'),
    code: seed.code,
    name: seed.name,
    techClass: seed.techClass,
    levels: {},
    topLevel: 0,
    topHolderId: null,
  }));
}

export function generateSoftwareProducts(technologies: Technology[]): SoftwareProduct[] {
  const byCode = new Map(technologies.map(tech => [tech.code, tech]));
  return SOFTWARE_SEEDS.map(seed => ({
    id: nextId('soft'),
    name: seed.name,
    softwareClass: seed.softwareClass,
    requirements: seed.requirements
      .map(req => {
        const tech = byCode.get(req.code);
        return tech ? { technologyId: tech.id, requiredLevel: req.requiredLevel, weight: req.weight } : null;
      })
      .filter((req): req is NonNullable<typeof req> => req !== null),
    ownerId: null,
    version: 0,
    techLevel: 0,
    quality: 0,
    brand: 0,
    price: seed.price,
    targetOsId: null,
    releasedYear: 0,
    lastReleaseYear: 0,
    autoNewVersion: false,
    unitsSoldDigital: 0,
    unitsSoldPackaged: 0,
    installedBase: 0,
    appsAvailability: 0,
  }));
}

/** Each city holds a finite pool of specialists, so hiring early matters. */
export function generateTalentPool(
  cities: City[],
  technologies: Technology[],
  rand: () => number,
  mode: GameState['digitalAge']['talentSystem'],
): Talent[] {
  const talents: Talent[] = [];
  const specializations = Array.from(new Set(technologies.map(tech => tech.techClass)));

  for (const city of cities) {
    const poolSize = Math.max(2, Math.round(city.population / 2_200_000) + 2);
    for (let i = 0; i < poolSize; i++) {
      const role: TalentRole = rand() > 0.5 ? 'lead_researcher' : 'lead_programmer';
      const skill = mode === 'full' ? Math.round(25 + rand() * 70) : 50;
      talents.push({
        id: nextId('talent'),
        name: `${FIRST_NAMES[Math.floor(rand() * FIRST_NAMES.length)]} ${LAST_NAMES[Math.floor(rand() * LAST_NAMES.length)]}`,
        role,
        specialization: specializations[Math.floor(rand() * specializations.length)],
        skill,
        salary: Math.round((28000 + skill * 1450) / 500) * 500,
        loyalty: 50 + Math.round(rand() * 20),
        cityId: city.id,
        employerId: null,
        buildingId: null,
        autoLoyalty: false,
        targetLoyalty: 70,
      });
    }
  }
  return talents;
}

// ============= TECHNOLOGY RESEARCH =============

export function technologyLevel(technology: Technology, companyId: string): number {
  return technology.levels[companyId] ?? 0;
}

/**
 * Catch-up mechanic from the design brief:
 *   Additional Gain = Baseline x (Highest - Yours) / Highest
 * applied only when the market leader is above level 100.
 */
export function computeTechGain(technology: Technology, companyId: string, baselineGain: number): number {
  const own = technologyLevel(technology, companyId);
  const highest = technology.topLevel;
  if (highest <= 100 || own >= highest) return baselineGain;
  return baselineGain + baselineGain * ((highest - own) / highest);
}

export function applyTechGain(technology: Technology, companyId: string, gain: number) {
  const next = technologyLevel(technology, companyId) + gain;
  technology.levels[companyId] = next;
  if (next > technology.topLevel) {
    technology.topLevel = next;
    technology.topHolderId = companyId;
  }
}

/** Weighted overall tech level for a software title, per the importance weights. */
export function softwareTechLevel(state: GameState, software: SoftwareProduct, companyId: string): number {
  if (software.requirements.length === 0) return 0;
  let weighted = 0;
  for (const requirement of software.requirements) {
    const technology = state.technologies.find(tech => tech.id === requirement.technologyId);
    if (!technology) continue;
    weighted += technologyLevel(technology, companyId) * (requirement.weight / 100);
  }
  return weighted;
}

export function meetsRequirements(state: GameState, software: SoftwareProduct, companyId: string): boolean {
  return software.requirements.every(requirement => {
    const technology = state.technologies.find(tech => tech.id === requirement.technologyId);
    return technology ? technologyLevel(technology, companyId) >= requirement.requiredLevel : false;
  });
}

// ============= TALENT =============

/** The lead's skill is the ceiling on a unit's output. */
export function firmLeadSkill(state: GameState, building: Building): number {
  const leads = state.talents.filter(talent => talent.buildingId === building.id);
  if (leads.length === 0) return 20;
  return leads.reduce((best, talent) => Math.max(best, talent.skill), 0);
}

export function headhuntCost(talent: Talent): { salary: number; signingBonus: number; total: number } {
  const loyaltyPremium = 1 + talent.loyalty / 100;
  const salary = Math.round(talent.salary * loyaltyPremium * 1.15);
  return { salary, signingBonus: salary, total: salary + salary };
}

function updateTalentLoyalty(state: GameState, talent: Talent, inflation: number) {
  if (!talent.employerId) return;
  const building = state.buildings.find(item => item.id === talent.buildingId);
  const trainingBudget = building?.trainingBudget ?? 0;
  // Skill growth raises salary expectations; inflation erodes real pay.
  const expectedSalary = (28000 + talent.skill * 1450) * (1 + inflation / 100);
  const payGap = (talent.salary - expectedSalary) / Math.max(1, expectedSalary);

  if (talent.autoLoyalty && talent.loyalty < talent.targetLoyalty) {
    talent.salary = Math.round(talent.salary * 1.02);
  }

  talent.loyalty = Math.max(0, Math.min(100, talent.loyalty + payGap * 6 + trainingBudget * 1.5 - 0.35));
  talent.skill = Math.min(100, talent.skill + trainingBudget * 0.08);

  if (talent.loyalty < 20 && Math.random() < 0.04) {
    talent.employerId = null;
    talent.buildingId = null;
    talent.loyalty = 45;
  }
}

// ============= TELECOM & INTERNET POPULATION =============

function simulateTelecom(state: GameState, index: StateIndex) {
  const telecoms = buildingsOfType(index, 'telecom');
  for (const city of state.cities) city.bandwidthCapacity = 0;

  for (const building of telecoms) {
    if (!building.telecom) continue;
    const city = index.citiesById.get(building.cityId);
    if (!city) continue;
    const stats = building.telecom;

    // Infrastructure rolls out gradually — towers and backhaul take months to build,
    // so capacity creeps toward the funded target instead of arriving instantly.
    const fundedTarget = stats.infrastructureCapacity + stats.upgradeBudget * 240;
    stats.infrastructureCapacity += (fundedTarget - stats.infrastructureCapacity) * 0.06;
    city.bandwidthCapacity += stats.infrastructureCapacity;

    // Cheaper plans win subscribers; capacity caps how many can be served.
    const competing = telecoms.filter(item => item.cityId === city.id);
    const averagePrice = competing.reduce((sum, item) => sum + (item.telecom?.monthlyPrice ?? 30), 0) / Math.max(1, competing.length);
    const priceAdvantage = Math.max(0.2, Math.min(2.2, averagePrice / Math.max(1, stats.monthlyPrice)));
    // Marketing spend accelerates acquisition; without it growth is word-of-mouth slow.
    const marketingBoost = 0.6 + stats.upgradeBudget * 1.6;
    const addressable = city.population * 0.42 * priceAdvantage * marketingBoost / Math.max(1, competing.length);

    // Monthly churn of ~2.5% (switching, relocation, dissatisfaction) plus a
    // congestion penalty when utilisation runs hot.
    const congestion = stats.utilizedCapacity / Math.max(1, stats.infrastructureCapacity);
    const churnRate = 0.025 + Math.max(0, congestion - 0.8) * 0.15;
    const target = Math.min(addressable, stats.infrastructureCapacity);
    stats.subscribers = Math.max(0, stats.subscribers * (1 - churnRate) + (target - stats.subscribers) * 0.02 * marketingBoost);
    stats.utilizedCapacity = stats.subscribers;

    building.revenue = stats.subscribers * stats.monthlyPrice / (30 * 24);
    building.operatingCost = (city.wageRate * building.employees) / (30 * 24) + stats.upgradeBudget * 9000 / (30 * 24);
    building.utilization = Math.min(100, stats.subscribers / Math.max(1, stats.infrastructureCapacity) * 100);
  }

  for (const city of state.cities) {
    // Internet population can never exceed the bandwidth the market provides.
    const ceiling = Math.min(city.population * 0.85, city.bandwidthCapacity);
    city.internetUsers += (ceiling - city.internetUsers) * 0.015;
    city.internetUsers = Math.max(0, city.internetUsers);
  }
}

/** Applies next month's telecom pricing. */
export function commitTelecomPricing(state: GameState) {
  for (const building of state.buildings) {
    if (building.telecom) building.telecom.monthlyPrice = building.telecom.nextMonthPrice;
  }
}

// ============= E-COMMERCE =============

/**
 * Freight as a share of price decides what sells online. Shoppers tolerate ~10%,
 * start abandoning carts past 20%, and essentially nobody completes checkout once
 * shipping exceeds ~40% of the item price. Heavy, cheap goods are simply unviable.
 */
export function ecommerceFreightPenalty(price: number, freight: number): number {
  if (price <= 0) return 0;
  const share = freight / price;
  if (share <= 0.10) return 1;
  if (share >= 0.40) return 0.02;
  // Steep abandonment curve between 10% and 40%.
  return Math.max(0.02, 1 - Math.pow((share - 0.10) / 0.30, 1.6) * 0.98);
}

function simulateEcommerce(state: GameState, index: StateIndex) {
  const shops = buildingsOfType(index, 'internet_ecommerce');
  const nationalUsers = state.cities.reduce((sum, city) => sum + city.internetUsers, 0);
  const totalPopulation = state.cities.reduce((sum, city) => sum + city.population, 0);
  const onlineShare = Math.min(state.digitalAge.maxEcommerceShare, nationalUsers / Math.max(1, totalPopulation));

  for (const shop of shops) {
    const city = index.citiesById.get(shop.cityId);
    if (!city) continue;

    // Catalogue: every wholesale firm in the group that opted into e-commerce.
    const suppliers = (index.buildingsByCompany.get(shop.companyId) ?? []).filter(
      building => building.ecommerceEnabled && ['factory', 'farm', 'warehouse'].includes(building.type),
    );

    shop.ecommerceListings = suppliers
      .map(supplier => {
        const product = supplier.productId ? index.productsById.get(supplier.productId) : undefined;
        if (!product || product.kind !== 'consumer') return null;
        const existing = shop.ecommerceListings.find(listing => listing.productId === product.id);
        return {
          productId: product.id,
          sourceBuildingId: supplier.id,
          price: existing?.price ?? product.currentPrice,
          freightPerUnit: supplier.freightCost || product.productionCost * 0.1,
          unitsSold: 0,
        };
      })
      .filter((listing): listing is NonNullable<typeof listing> => listing !== null);

    let revenue = 0;
    for (const listing of shop.ecommerceListings) {
      const product = index.productsById.get(listing.productId);
      if (!product) continue;
      const penalty = ecommerceFreightPenalty(listing.price, listing.freightPerUnit);
      const reach = nationalUsers * onlineShare * 0.000002;
      listing.unitsSold = reach * penalty * (product.demandIndex / 100) * state.digitalAge.internetRevenueIndex / 100;
      revenue += listing.unitsSold * listing.price;
    }

    // Digital download titles: revenue splits 70% software firm / 30% storefront.
    const groupSoftware = state.softwareProducts.filter(software => software.ownerId === shop.companyId);
    for (const software of groupSoftware) {
      const osBase = software.targetOsId
        ? state.softwareProducts.find(item => item.id === software.targetOsId)?.installedBase ?? 0
        : nationalUsers * 0.25;
      const downloads = Math.max(0, osBase * 0.0000015 * (software.quality / 100) * onlineShare);
      software.unitsSoldDigital += downloads;
      revenue += downloads * software.price * 0.30;
    }

    shop.revenue = revenue;
    shop.operatingCost = (city.wageRate * shop.employees) / (30 * 24);
    shop.utilization = Math.min(100, shop.ecommerceListings.length * 12 + onlineShare * 100);
  }

  for (const city of state.cities) {
    city.ecommerceAdoption = Math.min(state.digitalAge.maxEcommerceShare, city.internetUsers / Math.max(1, city.population));
  }
}

// ============= SOFTWARE PRODUCTS =============

function simulateSoftware(state: GameState, index: StateIndex) {
  const operatingSystems = state.softwareProducts.filter(software => software.softwareClass === 'Operating System' && software.version > 0);

  for (const software of state.softwareProducts) {
    if (!software.ownerId || software.version === 0) continue;

    // Titles that stop shipping new versions decay in the market.
    const yearsSinceRelease = state.year - software.lastReleaseYear;
    const freshness = Math.max(0.25, 1 - yearsSinceRelease * 0.12);
    software.quality = Math.max(0, Math.min(100, software.techLevel * 0.6 * freshness + software.version * 2));

    if (software.softwareClass === 'Operating System') {
      // An OS wins on the software written for it, not on raw specs.
      const apps = state.softwareProducts.filter(item => item.targetOsId === software.id && item.version > 0);
      software.appsAvailability = Math.min(100, apps.length * 12 + apps.reduce((sum, app) => sum + app.quality, 0) / Math.max(1, apps.length) * 0.4);
      const nationalUsers = state.cities.reduce((sum, city) => sum + city.internetUsers, 0);
      const appeal = software.quality * 0.5 + software.appsAvailability * 0.5;
      const target = nationalUsers * (appeal / Math.max(1, operatingSystems.reduce((sum, os) => sum + os.quality * 0.5 + os.appsAvailability * 0.5, 1)));
      software.installedBase += (target - software.installedBase) * 0.01;
    }

    // Packaged retail: factories assigned to this title produce boxed copies.
    const factories = (index.buildingsByCompany.get(software.ownerId) ?? []).filter(
      building => building.type === 'factory' && building.softwareProductId === software.id,
    );
    for (const factory of factories) {
      const osBase = software.targetOsId
        ? state.softwareProducts.find(item => item.id === software.targetOsId)?.installedBase ?? 0
        : 1_000_000;
      const output = factory.capacity / 720 * (factory.trainingLevel / 9);
      const sellable = Math.min(output, osBase * 0.0000025 * (software.quality / 100));
      software.unitsSoldPackaged += sellable;
      factory.lastUnitsProduced = output;
      factory.revenue = sellable * software.price * state.digitalAge.softwareRevenueIndex / 100;
    }
  }
}

function simulateSoftwareProjects(state: GameState) {
  for (const project of state.softwareProjects) {
    if (project.completed) continue;
    const building = state.buildings.find(item => item.id === project.buildingId);
    if (!building) continue;

    const leadSkill = firmLeadSkill(state, building);
    const monthlyProgress = 100 / Math.max(1, project.durationMonths) * (0.45 + leadSkill / 100);
    project.progress = Math.min(100, project.progress + monthlyProgress);
    if (project.progress < 100) continue;

    project.completed = true;

    if (project.kind === 'technology' && project.technologyId) {
      const technology = state.technologies.find(tech => tech.id === project.technologyId);
      if (technology) {
        const baseline = project.durationMonths * (0.6 + leadSkill / 90);
        applyTechGain(technology, project.companyId, computeTechGain(technology, project.companyId, baseline));
      }
    } else {
      const software = state.softwareProducts.find(item => item.id === project.softwareProductId);
      if (software) {
        software.ownerId = project.companyId;
        software.version += 1;
        software.techLevel = softwareTechLevel(state, software, project.companyId);
        software.lastReleaseYear = state.year;
        if (software.releasedYear === 0) software.releasedYear = state.year;
      }
    }
  }

  state.softwareProjects = state.softwareProjects.filter(project => !project.completed);
}

/** Automatically queue a new version when better tech is available. */
function autoReleaseVersions(state: GameState) {
  for (const software of state.softwareProducts) {
    if (!software.autoNewVersion || !software.ownerId || software.version === 0) continue;
    const currentTech = softwareTechLevel(state, software, software.ownerId);
    if (currentTech <= software.techLevel * 1.12) continue;
    const alreadyQueued = state.softwareProjects.some(project => project.softwareProductId === software.id && !project.completed);
    if (alreadyQueued) continue;
    const firm = state.buildings.find(
      building => building.companyId === software.ownerId && building.type === 'software_company',
    );
    if (!firm) continue;
    state.softwareProjects.push({
      id: nextId('proj'),
      companyId: software.ownerId,
      buildingId: firm.id,
      softwareProductId: software.id,
      kind: 'new_version',
      technologyId: null,
      progress: 0,
      durationMonths: 6,
      completed: false,
    });
  }
}

// ============= INTERNET FIRMS =============

function simulateInternetFirms(state: GameState, index: StateIndex) {
  const kinds = ['internet_search', 'internet_social'];
  for (const kind of kinds) {
    for (const building of buildingsOfType(index, kind)) {
      const city = index.citiesById.get(building.cityId);
      if (!city) continue;

      // Overall quality = features quality + technology.
      building.featuresQuality = Math.min(100, building.featuresQuality + building.contentBudget * 0.4 - 0.12);
      const overallQuality = building.featuresQuality * 0.55 + building.technologyQuality * 0.45;

      const nationalUsers = state.cities.reduce((sum, item) => sum + item.internetUsers, 0);
      const competitors = buildingsOfType(index, kind).length;
      const targetVisitors = nationalUsers * (overallQuality / 100) / Math.max(1, competitors * 0.7);
      building.monthlyVisitors += (targetVisitors - building.monthlyVisitors) * 0.02;

      // Advertisers leave when cost per click drifts above the market.
      const averageCpc = buildingsOfType(index, kind).reduce((sum, item) => sum + item.costPerClick, 0) / Math.max(1, competitors);
      const priceAppeal = Math.max(0.15, Math.min(2, averageCpc / Math.max(0.05, building.costPerClick)));

      building.revenue = building.monthlyVisitors * 0.012 * building.costPerClick * priceAppeal
        * state.digitalAge.internetRevenueIndex / 100 / (30 * 24);
      building.operatingCost = (city.wageRate * building.employees) / (30 * 24) + building.contentBudget * 12000 / (30 * 24);
      building.utilization = Math.min(100, overallQuality);
    }
  }
}

/** Traditional media loses audience as the population moves online. */
function applyMediaDisruption(state: GameState, index: StateIndex) {
  if (!state.digitalAge.disruptionToTraditionalMedia) return;
  const nationalUsers = state.cities.reduce((sum, city) => sum + city.internetUsers, 0);
  const totalPopulation = state.cities.reduce((sum, city) => sum + city.population, 0);
  const onlineShare = nationalUsers / Math.max(1, totalPopulation);

  for (const type of ['media_tv', 'media_radio', 'media_newspaper']) {
    for (const building of buildingsOfType(index, type)) {
      building.mediaRating = Math.max(0, building.mediaRating * (1 - onlineShare * 0.0009));
    }
  }
}

// ============= PUBLIC ENTRY POINTS =============

/** Hourly digital-economy tick. */
export function simulateDigitalHourly(state: GameState, index: StateIndex) {
  if (!state.digitalAge.enabled) return;
  simulateTelecom(state, index);
  simulateEcommerce(state, index);
  simulateSoftware(state, index);
  simulateInternetFirms(state, index);
  applyMediaDisruption(state, index);
}

/** Monthly digital-economy tick: projects, versions, salaries, loyalty. */
export function simulateDigitalMonthly(state: GameState) {
  if (!state.digitalAge.enabled) return;
  commitTelecomPricing(state);
  simulateSoftwareProjects(state);
  autoReleaseVersions(state);

  if (state.digitalAge.talentSystem !== 'greatly_simplified') {
    for (const talent of state.talents) updateTalentLoyalty(state, talent, state.economy.inflation);
  }

  // Payroll for hired talent.
  for (const talent of state.talents) {
    if (!talent.employerId) continue;
    const company = state.companies.find(item => item.id === talent.employerId);
    if (company) {
      company.cash -= talent.salary / 12;
      company.expenses += talent.salary / 12;
    }
  }
}

// ============= PLAYER ACTIONS =============

export function hireTalent(state: GameState, talentId: string, buildingId: string): GameState {
  const talent = state.talents.find(item => item.id === talentId);
  const building = state.buildings.find(item => item.id === buildingId);
  const company = state.companies.find(item => item.isPlayer);
  if (!talent || !building || !company || talent.employerId) return state;

  talent.employerId = company.id;
  talent.buildingId = building.id;
  talent.loyalty = 60;
  if (!building.talentIds.includes(talent.id)) building.talentIds.push(talent.id);
  return state;
}

export function headhuntTalent(state: GameState, talentId: string, buildingId: string): GameState {
  const talent = state.talents.find(item => item.id === talentId);
  const building = state.buildings.find(item => item.id === buildingId);
  const company = state.companies.find(item => item.isPlayer);
  if (!talent || !building || !company || talent.employerId === company.id) return state;

  const cost = headhuntCost(talent);
  if (company.cash < cost.signingBonus) return state;

  company.cash -= cost.signingBonus;
  const previous = state.buildings.find(item => item.id === talent.buildingId);
  if (previous) previous.talentIds = previous.talentIds.filter(id => id !== talent.id);

  talent.employerId = company.id;
  talent.buildingId = building.id;
  talent.salary = cost.salary;
  talent.loyalty = 55;
  if (!building.talentIds.includes(talent.id)) building.talentIds.push(talent.id);
  return state;
}

export function raiseTalentSalary(state: GameState, talentId: string, percent: number): GameState {
  const talent = state.talents.find(item => item.id === talentId);
  if (!talent) return state;
  talent.salary = Math.round(talent.salary * (1 + percent / 100));
  talent.loyalty = Math.min(100, talent.loyalty + percent * 1.4);
  return state;
}

export function toggleTalentAutoLoyalty(state: GameState, talentId: string): GameState {
  const talent = state.talents.find(item => item.id === talentId);
  if (talent) talent.autoLoyalty = !talent.autoLoyalty;
  return state;
}

export function startTechnologyProject(state: GameState, buildingId: string, technologyId: string, durationMonths: number): GameState {
  const building = state.buildings.find(item => item.id === buildingId);
  const company = state.companies.find(item => item.isPlayer);
  if (!building || !company) return state;
  if (state.softwareProjects.some(project => project.buildingId === buildingId && !project.completed)) return state;

  state.softwareProjects.push({
    id: nextId('proj'),
    companyId: company.id,
    buildingId,
    softwareProductId: '',
    kind: 'technology',
    technologyId,
    progress: 0,
    durationMonths,
    completed: false,
  });
  return state;
}

export function startSoftwareProject(state: GameState, buildingId: string, softwareProductId: string, targetOsId: string | null): GameState {
  const building = state.buildings.find(item => item.id === buildingId);
  const company = state.companies.find(item => item.isPlayer);
  const software = state.softwareProducts.find(item => item.id === softwareProductId);
  if (!building || !company || !software) return state;
  if (!meetsRequirements(state, software, company.id)) return state;
  if (state.softwareProjects.some(project => project.buildingId === buildingId && !project.completed)) return state;

  software.targetOsId = targetOsId;
  state.softwareProjects.push({
    id: nextId('proj'),
    companyId: company.id,
    buildingId,
    softwareProductId,
    kind: software.version === 0 ? 'product' : 'new_version',
    technologyId: null,
    progress: 0,
    durationMonths: 8,
    completed: false,
  });
  return state;
}

export function toggleAutoNewVersion(state: GameState, softwareProductId: string): GameState {
  const software = state.softwareProducts.find(item => item.id === softwareProductId);
  if (software) software.autoNewVersion = !software.autoNewVersion;
  return state;
}

export function assignSoftwareToFactory(state: GameState, buildingId: string, softwareProductId: string | null): GameState {
  const building = state.buildings.find(item => item.id === buildingId);
  if (building && building.type === 'factory') building.softwareProductId = softwareProductId;
  return state;
}

export function toggleEcommerceSales(state: GameState, buildingId: string): GameState {
  const building = state.buildings.find(item => item.id === buildingId);
  if (building) building.ecommerceEnabled = !building.ecommerceEnabled;
  return state;
}

export function setEcommercePrice(state: GameState, buildingId: string, productId: string, price: number): GameState {
  const building = state.buildings.find(item => item.id === buildingId);
  const listing = building?.ecommerceListings.find(item => item.productId === productId);
  if (listing) listing.price = Math.max(0.5, price);
  return state;
}

export function setTelecomPolicy(state: GameState, buildingId: string, nextMonthPrice: number, upgradeBudget: number): GameState {
  const building = state.buildings.find(item => item.id === buildingId);
  if (building?.telecom) {
    building.telecom.nextMonthPrice = Math.max(5, nextMonthPrice);
    building.telecom.upgradeBudget = Math.max(0, Math.min(1, upgradeBudget));
  }
  return state;
}

export function setWebsitePolicy(state: GameState, buildingId: string, contentBudget: number, costPerClick: number): GameState {
  const building = state.buildings.find(item => item.id === buildingId);
  if (!building) return state;
  building.contentBudget = Math.max(0, Math.min(1, contentBudget));
  building.costPerClick = Math.max(0.05, costPerClick);
  return state;
}

/** Applies researched technology to an internet firm's website quality. */
export function applyTechnologyToWebsite(state: GameState, buildingId: string, technologyId: string): GameState {
  const building = state.buildings.find(item => item.id === buildingId);
  const technology = state.technologies.find(item => item.id === technologyId);
  const company = state.companies.find(item => item.isPlayer);
  if (!building || !technology || !company) return state;
  building.technologyQuality = Math.min(100, technologyLevel(technology, company.id) * 0.6);
  return state;
}

export function acquirePrivateCompany(state: GameState, targetCompanyId: string): GameState {
  const buyer = state.companies.find(item => item.isPlayer);
  const target = state.companies.find(item => item.id === targetCompanyId);
  if (!buyer || !target || target.isPlayer) return state;

  const price = Math.max(target.totalAssets, target.marketCap) * 1.25;
  if (buyer.cash < price) return state;

  buyer.cash -= price;
  for (const building of state.buildings) {
    if (building.companyId === target.id) {
      building.companyId = buyer.id;
      buyer.buildings.push(building.id);
    }
  }
  for (const talent of state.talents) if (talent.employerId === target.id) talent.employerId = buyer.id;
  for (const software of state.softwareProducts) if (software.ownerId === target.id) software.ownerId = buyer.id;
  for (const technology of state.technologies) {
    const level = technology.levels[target.id];
    if (level) technology.levels[buyer.id] = Math.max(technology.levels[buyer.id] ?? 0, level);
  }
  state.companies = state.companies.filter(item => item.id !== target.id);
  return state;
}

export function defaultTelecomStats(): NonNullable<Building['telecom']> {
  return {
    infrastructureCapacity: 120_000,
    utilizedCapacity: 0,
    monthlyPrice: 35,
    nextMonthPrice: 35,
    upgradeBudget: 0.3,
    subscribers: 0,
  };
}

/** AI tech companies keep researching so the sector stays contested. */
export function simulateAiTechCompanies(state: GameState, companies: Company[]) {
  if (!state.digitalAge.enabled) return;
  for (const company of companies) {
    if (company.isPlayer || company.sector !== 'technology') continue;
    const technology = state.technologies[Math.floor(Math.random() * state.technologies.length)];
    if (!technology) continue;
    const baseline = 4 + Math.random() * 8;
    applyTechGain(technology, company.id, computeTechGain(technology, company.id, baseline));
    company.intangibleTechnology = state.technologies.reduce(
      (sum, tech) => sum + technologyLevel(tech, company.id) * 12000, 0,
    );
  }
}
