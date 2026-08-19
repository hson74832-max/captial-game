import type {
  GameState, Company, Building, City, Cartel, Patent, IncomeTier, Product,
} from './types';
import type { StateIndex } from './indexing';

const TICKS_PER_MONTH = 24 * 30;

function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function notify(state: GameState, message: string, type: 'info' | 'warning' | 'success' | 'danger') {
  state.notifications.push({ id: newId('n'), message, type, tick: state.tick });
  if (state.notifications.length > 30) state.notifications.shift();
}

function ticker(state: GameState, text: string, type: 'info' | 'warning' | 'success' | 'danger' | 'breaking') {
  state.stockMarket.ticker.push({ id: newId('t'), text, type, tick: state.tick });
  if (state.stockMarket.ticker.length > 30) state.stockMarket.ticker.shift();
}

// ═══════════════════════════════════════════════════════════════════════════
// HOUSEHOLD DEMAND
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Converts a city's wage and income mix into monthly discretionary budgets per
 * household tier. Low-income households spend nearly everything on essentials;
 * affluent households carry most of the discretionary pool.
 */
export function updateHouseholdBudgets(state: GameState) {
  for (const city of state.cities) {
    const monthlyIncome = city.wageRate * 173;
    const ppp = state.economy.purchasingPowerIndex / 100;
    // Essentials absorb a shrinking share as income rises (Engel's law).
    city.discretionaryBudget = {
      low: Math.max(40, monthlyIncome * 0.55 * 0.12 * ppp),
      middle: Math.max(120, monthlyIncome * 1.0 * 0.26 * ppp),
      affluent: Math.max(400, monthlyIncome * 2.6 * 0.42 * ppp),
    };
  }
}

/**
 * How much of a city's household spending power a given product can address.
 * Luxury lines can only reach affluent wallets; staples reach everyone.
 */
export function addressableSpend(city: City, product: Product): number {
  const tiers: IncomeTier[] = ['low', 'middle', 'affluent'];
  let total = 0;
  for (const tier of tiers) {
    const share = city.incomeMix[tier];
    const budget = city.discretionaryBudget[tier];
    // Reach by segment: value goods skew down-market, luxury skews up.
    const reach = product.segment === 'luxury'
      ? (tier === 'affluent' ? 1 : tier === 'middle' ? 0.12 : 0.01)
      : product.segment === 'premium'
        ? (tier === 'affluent' ? 1 : tier === 'middle' ? 0.55 : 0.08)
        : product.segment === 'value'
          ? (tier === 'low' ? 1 : tier === 'middle' ? 0.85 : 0.35)
          : 0.9;
    total += share * budget * reach;
  }
  return total;
}

// ═══════════════════════════════════════════════════════════════════════════
// BEHAVIOURAL ECONOMICS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Anchoring, scarcity and social proof.
 *
 * Anchoring: the first price a shopper sees becomes the reference point, so a
 * cut from a high anchor reads as a bargain while the same absolute price from
 * a low anchor reads as expensive.
 *
 * Scarcity: visibly thin stock accelerates purchase ("only 3 left").
 *
 * Social proof: bestsellers snowball — high recent volume attracts more volume.
 */
export function behaviouralMultiplier(building: Building, currentPrice: number): number {
  // Anchor updates slowly toward the price actually charged.
  if (building.anchorPrice <= 0) building.anchorPrice = currentPrice;
  building.anchorPrice += (currentPrice - building.anchorPrice) * 0.004;

  const anchorRatio = building.anchorPrice / Math.max(0.01, currentPrice);
  // A price below the anchor feels like a deal; above it feels like a rise.
  const anchoring = Math.max(0.75, Math.min(1.35, Math.pow(anchorRatio, 0.45)));

  // Scarcity: stock below ~12% of capacity creates urgency, but an empty shelf
  // obviously sells nothing — that is handled by the availability cap upstream.
  const stockRatio = building.inventoryCapacity > 0
    ? building.supply / building.inventoryCapacity
    : 1;
  const scarcity = stockRatio < 0.12 && stockRatio > 0.01 ? 1.18 : 1;

  const social = 1 + building.socialProof * 0.4;

  return anchoring * scarcity * social;
}

/** Bestseller momentum decays without sustained volume. */
export function updateSocialProof(building: Building, unitsSold: number, capacityPerHour: number) {
  const performance = Math.min(1, unitsSold / Math.max(0.001, capacityPerHour));
  building.socialProof += (performance - building.socialProof) * 0.01;
  building.socialProof = Math.max(0, Math.min(1, building.socialProof));
}

// ═══════════════════════════════════════════════════════════════════════════
// DELIVERY
// ═══════════════════════════════════════════════════════════════════════════

export interface DeliveryResult {
  orders: number;
  revenue: number;
  cost: number;
  commission: number;
}

/**
 * Delivery channel economics.
 *
 * Reach is the residential population inside the delivery radius. Platform mode
 * needs no fleet but surrenders ~30% commission; in-house keeps the revenue but
 * pays couriers, fuel and vehicle costs, and is capped by fleet throughput.
 * Long delivery times destroy repeat demand, which is what actually kills
 * over-extended radii in the real business.
 */
export function simulateDelivery(
  state: GameState,
  building: Building,
  city: City,
  index: StateIndex,
  averageOrderValue: number,
  isDaytime: boolean,
): DeliveryResult {
  const cfg = building.delivery;
  if (!cfg.enabled || averageOrderValue <= 0) {
    cfg.ordersLastTick = 0;
    return { orders: 0, revenue: 0, cost: 0, commission: 0 };
  }

  // Households reachable within the radius.
  const homesInRange = (index.buildingsByCity.get(city.id) ?? []).filter(b =>
    b.type === 'apartment' && Math.hypot(b.x - building.x, b.y - building.y) <= cfg.radius).length;
  const reachFactor = Math.min(1, homesInRange / 8) * (0.35 + city.internetUsers / Math.max(1, city.population));

  // Courier throughput: one courier completes ~2.2 drops/hour within 6 tiles,
  // degrading as the radius stretches.
  const dropsPerCourier = 2.2 * Math.min(1, 6 / Math.max(1, cfg.radius));
  const fleetCapacity = cfg.mode === 'in_house'
    ? cfg.couriers * dropsPerCourier
    : Number.POSITIVE_INFINITY; // platforms flex supply

  cfg.avgDeliveryMinutes = 14 + cfg.radius * 2.6 +
    (cfg.mode === 'in_house' ? Math.max(0, 12 - cfg.couriers * 2) : 6);

  // Service quality gate: past ~45 minutes customers stop reordering.
  const speedAppeal = cfg.avgDeliveryMinutes <= 30 ? 1
    : cfg.avgDeliveryMinutes >= 60 ? 0.25
    : 1 - (cfg.avgDeliveryMinutes - 30) / 40;

  // Fee sensitivity: a delivery fee above ~12% of basket value suppresses orders.
  const feeShare = cfg.customerFee / Math.max(1, averageOrderValue);
  const feeAppeal = Math.max(0.15, 1 - Math.max(0, feeShare - 0.08) * 4.5);

  const timeFactor = isDaytime ? 1 : 1.35; // evenings are the delivery peak
  const latentOrders = building.capacity / 14 * 0.45 * reachFactor * speedAppeal * feeAppeal * timeFactor;
  const orders = Math.max(0, Math.min(latentOrders, fleetCapacity));

  const grossRevenue = orders * (averageOrderValue + cfg.customerFee);
  const commission = cfg.mode === 'platform' ? grossRevenue * cfg.commissionRate : 0;

  // In-house cost: courier wages plus fuel over the average round trip.
  const courierWage = city.wageRate * 1.05;
  const fuelPerDrop = (cfg.radius * 2) * 0.05 * state.economy.dieselPrice;
  const fleetCost = cfg.mode === 'in_house'
    ? cfg.couriers * courierWage + orders * fuelPerDrop
    : 0;
  // Packaging is real and non-trivial in food delivery.
  const packaging = orders * 0.55;

  cfg.ordersLastTick = orders;
  return { orders, revenue: grossRevenue, cost: fleetCost + packaging, commission };
}

// ═══════════════════════════════════════════════════════════════════════════
// LABOUR MARKET
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Hiring ramps, training lag, skills mismatch and union pressure.
 *
 * Staff do not appear the moment a building opens: recruitment takes weeks, and
 * thin local labour markets take longer. Training raises effective skill slowly,
 * so investment pays off over months rather than instantly.
 */
export function simulateLabour(state: GameState, index: StateIndex) {
  for (const city of state.cities) {
    const union = state.unions.find(u => u.id === city.unionId);
    const cityBuildings = index.buildingsByCity.get(city.id) ?? [];

    // Local labour supply tightness drives both hiring speed and wage inflation.
    const demandedJobs = cityBuildings.reduce((sum, b) => sum + b.employees, 0);
    const labourForce = city.population * 0.48;
    const tightness = Math.min(2.5, demandedJobs / Math.max(1, labourForce * 0.12));

    for (const building of cityBuildings) {
      if (building.companyId === 'system') continue;

      // ── Hiring ramp ──
      const shortfall = building.employees - building.staffedEmployees;
      if (shortfall > 0.5) {
        // Specialised roles are harder to fill where education is low.
        const specialised = building.type === 'rd_center' || building.type === 'software_company'
          || building.type === 'internet_search' || building.type === 'internet_social';
        const skillsMatch = specialised
          ? Math.max(0.15, city.educationIndex / 100)
          : 1;
        const hireRate = (0.012 / Math.max(0.4, tightness)) * skillsMatch;
        building.staffedEmployees = Math.min(building.employees, building.staffedEmployees + building.employees * hireRate);
        building.vacancyTicks += 1;
      } else {
        building.vacancyTicks = Math.max(0, building.vacancyTicks - 2);
        building.staffedEmployees = building.employees;
      }

      // ── Training lag ──
      building.effectiveTraining += (building.trainingLevel - building.effectiveTraining) * 0.0025;

      // ── Union wage floor and strike risk ──
      if (union) {
        const underpaid = building.trainingBudget < 0.2 && building.employeeSatisfaction < 40;
        union.militancy += underpaid ? 0.02 : -0.01;
        union.militancy = Math.max(0, Math.min(100, union.militancy));
      }
    }

    // ── Wage inflation from tight labour markets and poaching wars ──
    const poachingPressure = Math.max(0, tightness - 1) * 0.0008;
    const unionPush = union ? (union.density / 100) * union.wagePremium * 0.0006 : 0;
    city.wageRate *= 1 + poachingPressure + unionPush;
    // Statutory floor.
    city.wageRate = Math.max(state.government.minimumWage, city.wageRate);
  }
}

/** Strikes: militant, poorly-treated workforces down tools. */
export function simulateStrikes(state: GameState, index: StateIndex) {
  for (const union of state.unions) {
    if (union.strikeTicks > 0) {
      union.strikeTicks -= 1;
      if (union.strikeTicks === 0) {
        const city = state.cities.find(c => c.id === union.cityId);
        union.militancy = Math.max(0, union.militancy - 30);
        union.wagePremium += 0.02;
        ticker(state, `Strike ends in ${city?.name ?? 'the city'} — settlement lifts local wages`, 'info');
      }
      continue;
    }
    if (union.militancy > 78 && union.density > 35 && Math.random() < 0.05) {
      union.strikeTicks = TICKS_PER_MONTH * (0.3 + Math.random() * 0.5);
      const city = state.cities.find(c => c.id === union.cityId);
      ticker(state, `Industrial action begins in ${city?.name ?? 'a major city'} — output disrupted`, 'warning');
      notify(state, `Workers in ${city?.name ?? 'a city'} have gone on strike. Raise training budgets and pay to settle disputes.`, 'warning');
    }
  }
}

/** Output penalty applied to sites in a striking or understaffed city. */
export function labourAvailability(state: GameState, building: Building, city: City): number {
  const union = state.unions.find(u => u.id === city.unionId);
  const striking = union && union.strikeTicks > 0 ? 1 - (union.density / 100) * 0.75 : 1;
  const staffing = building.employees > 0
    ? Math.max(0.25, building.staffedEmployees / building.employees)
    : 1;
  return striking * staffing;
}

// ═══════════════════════════════════════════════════════════════════════════
// SUPPLY CHAIN — BULLWHIP, DISRUPTION, QUALITY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The bullwhip effect.
 *
 * Each echelon forecasts from the orders it receives, adds safety stock, and
 * rounds up to a batch. Small swings in retail demand therefore amplify as they
 * travel upstream — the single most important dynamic in real supply chains.
 */
export function bullwhipOrderQuantity(building: Building, observedDemand: number, echelonDepth: number): number {
  // Exponential smoothing of observed demand.
  building.demandForecast += (observedDemand - building.demandForecast) * 0.25;

  // Safety stock scales with forecast volatility and the firm's policy setting.
  const volatility = Math.abs(observedDemand - building.demandForecast) / Math.max(1, building.demandForecast);
  const safetyMultiplier = 1 + building.safetyStockPolicy * (0.4 + volatility * 1.8);

  // Each echelon adds its own buffer — this is the amplification.
  const echelonAmplification = Math.pow(1.22, echelonDepth);

  return building.demandForecast * safetyMultiplier * echelonAmplification;
}

/**
 * Suppliers can fail mid-contract, stranding their customers. When a supplier
 * disappears, every buyer linked to it is flagged as disrupted until it
 * re-sources, which takes a monthly supply-network pass.
 */
export function propagateSupplierFailure(state: GameState, failedBuildingId: string) {
  let stranded = 0;
  for (const building of state.buildings) {
    if (!building.supplierLinks.some(l => l.supplierBuildingId === failedBuildingId)) continue;
    building.supplierLinks = building.supplierLinks.filter(l => l.supplierBuildingId !== failedBuildingId);
    building.supplyDisrupted = true;
    stranded += 1;
  }
  if (stranded > 0) {
    notify(state, `A supplier has failed — ${stranded} of your plants are stranded and must re-source inputs.`, 'danger');
  }
}

/**
 * Rushing production above nameplate capacity raises output but degrades
 * quality and burns out staff — the classic speed/quality trade-off.
 */
export function rushPenalty(building: Building): { output: number; quality: number } {
  const intensity = building.productionIntensity;
  if (intensity <= 1) return { output: intensity, quality: 1 };
  const over = intensity - 1;
  return {
    output: 1 + over * 0.85,          // diminishing returns on overtime
    quality: Math.max(0.55, 1 - over * 1.4), // defects climb steeply
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// GOVERNMENT & REGULATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Policy review. Governments raise taxes when deficits bite, cut them to
 * stimulate a recession, index the minimum wage, and price carbon once the
 * economy can bear it.
 */
export function simulateGovernment(state: GameState, index: StateIndex) {
  const gov = state.government;
  if (state.tick < gov.nextReviewTick) return;
  gov.nextReviewTick = state.tick + TICKS_PER_MONTH * 6;

  const eco = state.economy;
  const previousTax = gov.corporateTaxRate;

  // Counter-cyclical fiscal policy.
  if (eco.cycle === 'recession') gov.corporateTaxRate = Math.max(12, gov.corporateTaxRate - 2);
  else if (eco.cycle === 'boom') gov.corporateTaxRate = Math.min(42, gov.corporateTaxRate + 1.5);
  if (eco.inflation > 6) gov.corporateTaxRate = Math.min(45, gov.corporateTaxRate + 1);

  if (Math.abs(gov.corporateTaxRate - previousTax) >= 1) {
    ticker(state, `Legislature sets corporate tax at ${gov.corporateTaxRate.toFixed(1)}%`, gov.corporateTaxRate > previousTax ? 'warning' : 'success');
  }

  // Minimum wage indexation.
  const indexed = gov.minimumWage * (1 + eco.inflation / 100 / 2);
  if (indexed - gov.minimumWage > 0.15) {
    gov.minimumWage = Math.round(indexed * 100) / 100;
    ticker(state, `Minimum wage raised to $${gov.minimumWage.toFixed(2)}/hr`, 'info');
  }

  // Carbon pricing arrives once the economy is developed and stable.
  if (state.year >= 2008 && gov.carbonTaxPerUnit === 0 && eco.cycle !== 'recession') {
    gov.carbonTaxPerUnit = 12;
    ticker(state, 'Carbon levy introduced at $12/tonne — heavy industry costs rise', 'breaking');
    notify(state, 'A carbon levy now applies to factories and mines. Cleaner, higher-tech plants pay less.', 'warning');
  } else if (gov.carbonTaxPerUnit > 0) {
    gov.carbonTaxPerUnit = Math.min(85, gov.carbonTaxPerUnit * 1.08);
  }

  // Strategic subsidies rotate to whichever sector is weakest.
  const weakest = ['Semi Products', 'Computers', 'Automobile']
    .sort(() => Math.random() - 0.5)[0];
  gov.subsidisedCategories = eco.cycle === 'recession' ? [weakest] : [];
  if (gov.subsidisedCategories.length > 0) {
    ticker(state, `Government announces production subsidies for ${weakest}`, 'success');
  }
}

/**
 * Antitrust. Regulators watch national share per product; sustained dominance
 * draws warnings, then fines, then a forced divestiture.
 */
export function simulateAntitrust(state: GameState, index: StateIndex) {
  const gov = state.government;
  const player = state.companies.find(c => c.isPlayer);
  if (!player) return;

  for (const product of state.products) {
    if (product.playerMarketShare < gov.antitrustThreshold) continue;

    gov.antitrustWarnings += 1;

    if (gov.antitrustWarnings === 1) {
      notify(state, `Competition authority opens an inquiry into your ${product.name} market position (${product.playerMarketShare.toFixed(0)}% share).`, 'warning');
      ticker(state, `Regulators probe ${player.name} over ${product.name} dominance`, 'warning');
    } else if (gov.antitrustWarnings === 2) {
      const fine = player.totalAssets * 0.03;
      player.cash -= fine;
      notify(state, `Antitrust fine of $${(fine / 1_000_000).toFixed(1)}M levied over ${product.name}. Reduce your share or face divestiture.`, 'danger');
      ticker(state, `${player.name} fined $${(fine / 1_000_000).toFixed(0)}M for anti-competitive conduct`, 'breaking');
    } else if (gov.antitrustWarnings >= 3) {
      // Forced divestiture: the largest outlet selling this line is sold off.
      const holdings = state.buildings
        .filter(b => b.companyId === player.id && b.products.includes(product.id))
        .sort((a, b) => b.capacity - a.capacity);
      const target = holdings[0];
      if (target) {
        const buyer = state.companies.filter(c => !c.isPlayer).sort((a, b) => b.cash - a.cash)[0];
        const price = (target.constructionCost * 0.5 + target.landValue) * 0.8;
        if (buyer) {
          buyer.cash -= price;
          buyer.buildings.push(target.id);
          target.companyId = buyer.id;
        }
        player.cash += price;
        player.buildings = player.buildings.filter(id => id !== target.id);
        notify(state, `Regulators have forced the divestiture of ${target.name} to restore competition in ${product.name}.`, 'danger');
        ticker(state, `Court orders ${player.name} to divest ${target.name}`, 'breaking');
      }
      gov.antitrustWarnings = 0;
    }
    return; // one enforcement action per review
  }

  gov.antitrustWarnings = Math.max(0, gov.antitrustWarnings - 1);
}

/** Corporate tax, carbon levy and property tax collected each month. */
export function collectTaxes(state: GameState, index: StateIndex) {
  const gov = state.government;
  for (const company of state.companies) {
    const buildings = index.buildingsByCompany.get(company.id) ?? [];

    // Corporate tax on positive monthly profit.
    const monthlyProfit = company.profit * TICKS_PER_MONTH;
    if (monthlyProfit > 0) company.cash -= monthlyProfit * (gov.corporateTaxRate / 100);

    let carbon = 0;
    let propertyTax = 0;
    for (const building of buildings) {
      // Carbon: emissions scale with output and fall with process technology.
      if (building.type === 'factory' || building.type === 'mine') {
        const cleanliness = 1 - (building.effectiveTraining / 9) * 0.35;
        carbon += (building.capacity / 1000) * gov.carbonTaxPerUnit * cleanliness;
      }
      const city = index.citiesById.get(building.cityId);
      if (city) {
        propertyTax += (building.landValue + building.constructionCost * 0.4) * (city.propertyTaxRate / 12);
      }
    }
    company.cash -= carbon + propertyTax;
    company.expenses += carbon + propertyTax;

    // Subsidies flow to targeted categories.
    if (gov.subsidisedCategories.length > 0) {
      for (const building of buildings) {
        const product = building.productId ? index.productsById.get(building.productId) : undefined;
        if (product && gov.subsidisedCategories.includes(product.category)) {
          company.cash += building.capacity * 1.8;
        }
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// INTERNATIONAL TRADE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Currencies float, and trade politics moves tariffs. A weakening domestic
 * currency makes imports dearer and exports more competitive, exactly as it
 * should — and trade wars escalate in tit-for-tat rounds.
 */
export function simulateTrade(state: GameState) {
  for (const partner of state.tradePartners) {
    // Interest-rate differentials and inflation drive the drift.
    const drift = (state.economy.inflation - 2) * 0.0018 - (state.economy.interestRate - 4) * 0.0012;
    partner.exchangeRate *= 1 + drift + (Math.random() - 0.5) * 0.012;
    partner.exchangeRate = Math.max(partner.baseExchangeRate * 0.55, Math.min(partner.baseExchangeRate * 2.2, partner.exchangeRate));

    partner.relationship += (Math.random() - 0.48) * 2.2;
    partner.relationship = Math.max(-100, Math.min(100, partner.relationship));

    // Trade war escalation and détente.
    if (partner.relationship < -30 && Math.random() < 0.06) {
      partner.tariffRate = Math.min(0.45, partner.tariffRate + 0.06);
      partner.retaliatoryTariff = Math.min(0.45, partner.retaliatoryTariff + 0.07);
      ticker(state, `Trade dispute escalates with ${partner.name} — tariffs raised to ${(partner.tariffRate * 100).toFixed(0)}%`, 'warning');
    } else if (partner.relationship > 45 && partner.tariffRate > 0.02 && Math.random() < 0.05) {
      partner.tariffRate = Math.max(0.01, partner.tariffRate - 0.04);
      partner.retaliatoryTariff = Math.max(0.01, partner.retaliatoryTariff - 0.04);
      ticker(state, `Trade agreement signed with ${partner.name} — duties reduced`, 'success');
    }
  }
}

/** Landed cost multiplier applied to imports arriving through a seaport. */
export function importCostMultiplier(state: GameState): number {
  if (state.tradePartners.length === 0) return 1;
  // Weighted by relationship — we buy most from friendly, cheap partners.
  let weight = 0;
  let cost = 0;
  for (const partner of state.tradePartners) {
    const w = Math.max(0.1, (partner.relationship + 100) / 200) / Math.max(0.2, partner.wageIndex);
    const fx = partner.exchangeRate / partner.baseExchangeRate; // >1 = their currency weaker = cheaper
    cost += w * (1 + partner.tariffRate) / fx;
    weight += w;
  }
  return weight > 0 ? cost / weight : 1;
}

/**
 * Offshoring. Moving production abroad slashes labour cost but imports a
 * quality penalty, tariff exposure and reputational risk.
 */
export function offshoreProduction(state: GameState, buildingId: string, partnerId: string): GameState {
  const building = state.buildings.find(b => b.id === buildingId);
  const partner = state.tradePartners.find(p => p.id === partnerId);
  const company = state.companies.find(c => c.isPlayer);
  if (!building || !partner || !company || building.type !== 'factory') return state;

  const relocationCost = building.constructionCost * 0.18;
  if (company.cash < relocationCost) {
    notify(state, `Relocating production to ${partner.name} requires $${(relocationCost / 1_000_000).toFixed(1)}M in transition costs.`, 'danger');
    return state;
  }

  company.cash -= relocationCost;
  // Labour cost collapses; quality and brand take the hit.
  building.employees = Math.max(4, Math.round(building.employees * 0.35));
  building.staffedEmployees = building.employees;
  const product = state.products.find(p => p.id === building.productId);
  if (product) {
    product.quality = Math.max(5, product.quality * (1 - partner.qualityPenalty));
    product.brand = Math.max(0, product.brand - 6); // offshoring carries PR risk
  }
  company.brandAwareness = Math.max(0, company.brandAwareness - 4);

  notify(state, `Production moved to ${partner.name}. Labour costs fall sharply, but quality dropped ${(partner.qualityPenalty * 100).toFixed(0)}% and the move drew negative press.`, 'warning');
  ticker(state, `${company.name} offshores manufacturing to ${partner.name}`, 'warning');
  return state;
}

// ═══════════════════════════════════════════════════════════════════════════
// R&D, PATENTS AND STANDARDS WARS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * R&D is genuinely uncertain: roughly 30% of well-funded programmes fail.
 * Success grants a patent — a temporary monopoly that later commoditises as
 * knowledge spills over to rivals.
 */
export function resolveResearch(state: GameState, companyId: string, productId: string, investment: number): boolean {
  const product = state.products.find(p => p.id === productId);
  if (!product) return false;

  // Better funding improves odds but never guarantees success.
  const fundingQuality = Math.min(1, investment / Math.max(1, product.productionCost * 9000));
  const successChance = 0.45 + fundingQuality * 0.3; // 45%–75%
  const succeeded = Math.random() < successChance;

  if (!succeeded) {
    notify(state, `R&D programme for ${product.name} failed to reach a viable result. The spend is written off — this is the nature of research.`, 'warning');
    return false;
  }

  product.techLevel += 2 + fundingQuality * 3;
  product.quality = Math.min(100, product.quality + 5);

  state.patents.push({
    id: newId('pat'),
    productId,
    ownerId: companyId,
    grantedYear: state.year,
    expiresYear: state.year + 12,
  });
  const owner = state.companies.find(c => c.id === companyId);
  notify(state, `Patent granted on ${product.name}. You hold exclusive process rights until ${state.year + 12}.`, 'success');
  ticker(state, `${owner?.name ?? 'A firm'} secures a patent on ${product.name}`, 'info');
  return true;
}

/** Patent expiry and knowledge spillover to rivals. */
export function simulatePatents(state: GameState) {
  const expired = state.patents.filter(p => state.year >= p.expiresYear);
  for (const patent of expired) {
    const product = state.products.find(p => p.id === patent.productId);
    if (product) {
      // Commoditisation: rivals catch up, margins compress.
      product.productionCost *= 0.88;
      ticker(state, `Patent on ${product.name} expires — the technology commoditises`, 'info');
    }
  }
  state.patents = state.patents.filter(p => state.year < p.expiresYear);

  // Spillover: leaders leak know-how to laggards even while patents hold.
  for (const product of state.products) {
    if (product.techLevel > 3 && Math.random() < 0.02) {
      product.techLevel *= 0.995;
    }
  }
}

/** Patent-holder margin premium while exclusivity lasts. */
export function patentPremium(state: GameState, companyId: string, productId: string): number {
  return state.patents.some(p => p.productId === productId && p.ownerId === companyId) ? 1.22 : 1;
}

/**
 * Standards wars. When two incompatible platforms compete, the one that first
 * reaches critical mass takes the market — VHS/Betamax dynamics.
 */
export function simulateStandardsWar(state: GameState) {
  const platforms = state.softwareProducts.filter(s => s.softwareClass === 'Operating System' && s.version > 0);
  if (platforms.length < 2) return;

  const totalBase = platforms.reduce((sum, p) => sum + p.installedBase, 0);
  if (totalBase <= 0) return;

  const leader = platforms.reduce((best, p) => (p.installedBase > best.installedBase ? p : best));
  const leaderShare = leader.installedBase / totalBase;

  // Past ~55% share, network effects become self-reinforcing and the rest fade.
  if (leaderShare > 0.55) {
    for (const platform of platforms) {
      if (platform.id === leader.id) {
        platform.installedBase *= 1.012;
      } else {
        platform.installedBase *= 0.985;
      }
    }
    if (leaderShare > 0.75 && Math.random() < 0.03) {
      ticker(state, `${leader.name} consolidates as the industry standard`, 'breaking');
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// AI STRATEGY — HERDING, PREDATION, CARTELS, MESSY BANKRUPTCY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Herd behaviour and overexpansion bubbles. Boards read each other, not just
 * the fundamentals; a run of good results breeds collective optimism, which
 * funds overbuilding, which eventually produces a glut and a crash in sentiment.
 */
export function simulateHerding(state: GameState, index: StateIndex) {
  const ai = state.companies.filter(c => !c.isPlayer);
  if (ai.length === 0) return;

  const avgProfit = ai.reduce((sum, c) => sum + c.profit, 0) / ai.length;
  const marketMood = state.economy.businessConfidence / 60;

  for (const company of ai) {
    const peerSignal = avgProfit > 0 ? 0.03 : -0.05;
    const ownSignal = company.profit > 0 ? 0.02 : -0.04;
    company.sentiment += (peerSignal + ownSignal) * marketMood;
    company.sentiment = Math.max(0.25, Math.min(2.0, company.sentiment));
  }

  // Bubble detection: when everyone is euphoric and capacity has outrun demand,
  // the correction is sharp and collective.
  const euphoria = ai.filter(c => c.sentiment > 1.6).length / ai.length;
  const retailCount = (index.buildingsByType.get('retail_store') ?? []).length;
  const totalPop = state.cities.reduce((s, c) => s + c.population, 0);
  const saturation = retailCount / Math.max(1, totalPop / 400_000);

  if (euphoria > 0.6 && saturation > 1.35 && Math.random() < 0.08) {
    for (const company of ai) company.sentiment = Math.max(0.3, company.sentiment * 0.45);
    ticker(state, 'Overbuilding correction: boards slash expansion plans as capacity glut bites', 'breaking');
    notify(state, 'The market has overbuilt. Rivals are retrenching — expect price competition as they fight to fill capacity.', 'warning');
  }
}

/**
 * Predatory pricing. A cash-rich aggressor prices below cost to drive a weaker
 * rival out of a city, then recoups once the competitor exits.
 */
export function simulatePredatoryPricing(state: GameState, index: StateIndex) {
  for (const company of state.companies) {
    if (company.isPlayer) continue;

    if (company.predatoryTicks > 0) {
      company.predatoryTicks -= TICKS_PER_MONTH;
      continue;
    }
    // Predation needs both aggression and the competence to execute it: only
    // shrewd or ruthless boards can sustain a credible below-cost campaign.
    if (company.aiStrategy !== 'aggressive' || company.cash < 40_000_000) continue;
    if (company.acumen < 0.75) continue;
    if (Math.random() > 0.04 + company.acumen * 0.08) continue;

    // Find a city where a weak rival is vulnerable.
    for (const city of state.cities) {
      const mine = (index.buildingsByCity.get(city.id) ?? []).filter(b => b.companyId === company.id && b.type === 'retail_store');
      if (mine.length < 2) continue;
      const rivals = (index.buildingsByCity.get(city.id) ?? []).filter(b =>
        b.companyId !== company.id && b.companyId !== 'system' && b.type === 'retail_store');
      const weakRival = rivals.find(b => {
        const owner = index.companiesById.get(b.companyId);
        return owner && !owner.isPlayer && owner.cash < 8_000_000;
      });
      if (!weakRival) continue;

      for (const store of mine) store.pricingMultiplier = 0.62; // below cost
      company.predatoryTicks = TICKS_PER_MONTH * 4;
      ticker(state, `${company.name} launches aggressive discounting in ${city.name}`, 'warning');
      break;
    }
  }
}

/**
 * Cartels. Boards facing thin margins quietly agree a price floor. Cartels are
 * unstable — members defect for share — and regulators may expose them.
 */
export function simulateCartels(state: GameState, index: StateIndex) {
  // ── Formation ──
  if (state.cartels.length < 2 && Math.random() < 0.03) {
    // Collusion is a sophisticated play: novices neither propose nor sustain it.
    const candidates = state.companies.filter(c =>
      !c.isPlayer && c.profit < 0 && c.aiStrategy !== 'aggressive' && c.acumen > 0.5);
    if (candidates.length >= 2) {
      const product = state.products[Math.floor(Math.random() * state.products.length)];
      const members = candidates.slice(0, 3);
      const cartel: Cartel = {
        id: newId('cartel'),
        memberIds: members.map(m => m.id),
        productId: product.id,
        agreedFloor: 1.15,
        formedTick: state.tick,
        stability: 0.75,
        exposed: false,
      };
      state.cartels.push(cartel);
      for (const member of members) member.cartelId = cartel.id;
    }
  }

  // ── Enforcement, defection and exposure ──
  for (let i = state.cartels.length - 1; i >= 0; i--) {
    const cartel = state.cartels[i];

    // Members hold the floor.
    for (const memberId of cartel.memberIds) {
      for (const building of index.buildingsByCompany.get(memberId) ?? []) {
        if (building.products.includes(cartel.productId)) {
          building.pricingMultiplier = Math.max(building.pricingMultiplier, cartel.agreedFloor);
        }
      }
    }

    // Defection: someone always breaks ranks eventually.
    cartel.stability -= 0.03;
    if (Math.random() > cartel.stability) {
      const defectorId = cartel.memberIds[Math.floor(Math.random() * cartel.memberIds.length)];
      const defector = state.companies.find(c => c.id === defectorId);
      cartel.memberIds = cartel.memberIds.filter(id => id !== defectorId);
      if (defector) defector.cartelId = null;
      const product = state.products.find(p => p.id === cartel.productId);
      ticker(state, `${defector?.name ?? 'A member'} breaks ranks on ${product?.name ?? 'pricing'} — discounting resumes`, 'info');
    }

    // Regulators.
    if (!cartel.exposed && Math.random() < 0.04) {
      cartel.exposed = true;
      const product = state.products.find(p => p.id === cartel.productId);
      for (const memberId of cartel.memberIds) {
        const member = state.companies.find(c => c.id === memberId);
        if (member) member.cash -= member.totalAssets * 0.04;
      }
      ticker(state, `Regulators expose price-fixing in ${product?.name ?? 'a key market'} — heavy fines imposed`, 'breaking');
      notify(state, `A price-fixing cartel in ${product?.name ?? 'one of your markets'} has been broken up. Expect prices to fall.`, 'info');
    }

    if (cartel.memberIds.length < 2 || cartel.exposed) {
      for (const memberId of cartel.memberIds) {
        const member = state.companies.find(c => c.id === memberId);
        if (member) member.cartelId = null;
      }
      state.cartels.splice(i, 1);
    }
  }
}

/**
 * Disorderly liquidation. Real insolvencies are a scramble: secured creditors
 * seize the best assets, fire sales clear at deep discounts, and unsecured
 * claims are frequently written off entirely.
 */
export function messyLiquidation(state: GameState, company: Company, index: StateIndex): number {
  const assets = (index.buildingsByCompany.get(company.id) ?? []).slice()
    .sort((a, b) => (b.landValue + b.constructionCost) - (a.landValue + a.constructionCost));

  let recovered = 0;
  const secured = company.debt;

  for (const [rank, building] of assets.entries()) {
    // Fire-sale discount deepens as the estate empties and buyers sense distress.
    const distressDiscount = 0.55 - Math.min(0.3, rank * 0.05);
    const bookValue = building.landValue + building.constructionCost * 0.35;

    // Only bidders with liquidity can move fast enough to take part.
    const bidders = state.companies.filter(c => c.id !== company.id && c.cash > bookValue * 0.5);
    if (bidders.length === 0) {
      // No buyer: the asset is abandoned and written off entirely.
      state.buildings = state.buildings.filter(b => b.id !== building.id);
      continue;
    }
    // Competitive tension slightly improves the clearing price.
    const tension = Math.min(0.25, bidders.length * 0.05);
    const price = bookValue * (distressDiscount + tension);
    const winner = bidders.sort((a, b) => b.cash - a.cash)[0];

    winner.cash -= price;
    winner.buildings.push(building.id);
    building.companyId = winner.id;
    building.monthsUnprofitable = 0;
    recovered += price;
  }

  // Waterfall: secured lenders first, unsecured creditors take the shortfall.
  const toSecured = Math.min(recovered, secured);
  const residual = recovered - toSecured;
  const unsecuredLoss = Math.max(0, company.creditorClaims - residual);

  // Counterparties eat the loss on their receivables.
  if (unsecuredLoss > 0) {
    for (const other of state.companies) {
      const exposure = other.credit.filter(e => e.counterpartyId === company.id && e.kind === 'receivable');
      for (const entry of exposure) {
        other.cash -= entry.amount * 0.85; // ~15 cents on the dollar
      }
      other.credit = other.credit.filter(e => e.counterpartyId !== company.id);
    }
  }

  return recovered;
}

// ═══════════════════════════════════════════════════════════════════════════
// FINANCIAL MARKETS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Forward-looking valuation. Markets price expected earnings, not last month's
 * print, and they punish disappointment harder than they reward beats.
 */
export function updateForwardEarnings(state: GameState, index: StateIndex) {
  for (const company of state.companies) {
    const realised = company.profit * TICKS_PER_MONTH * 12;
    // Analysts extrapolate with a growth expectation tied to the cycle.
    const growthAssumption = state.economy.cycle === 'boom' ? 1.18
      : state.economy.cycle === 'growth' ? 1.08
      : state.economy.cycle === 'recovery' ? 1.04 : 0.92;
    const forward = realised * growthAssumption;
    company.expectedEarnings += (forward - company.expectedEarnings) * 0.12;
  }
}

/** Cliff-like credit rating changes — agencies move in notches, not smooth glides. */
export function reviewCreditRatings(state: GameState) {
  const ladder: Company['bondRating'][] = ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC', 'CC', 'C', 'D'];
  for (const company of state.companies) {
    const leverage = company.debt / Math.max(1, company.totalAssets);
    const coverage = company.profit * TICKS_PER_MONTH * 12 / Math.max(1, company.debt * company.interestRate / 100);

    let target: Company['bondRating'];
    if (leverage < 0.15 && coverage > 8) target = 'AAA';
    else if (leverage < 0.28 && coverage > 5) target = 'AA';
    else if (leverage < 0.4 && coverage > 3) target = 'A';
    else if (leverage < 0.55 && coverage > 2) target = 'BBB';
    else if (leverage < 0.68 && coverage > 1.2) target = 'BB';
    else if (leverage < 0.8 && coverage > 0.7) target = 'B';
    else if (leverage < 0.92) target = 'CCC';
    else if (company.cash > 0) target = 'CC';
    else target = 'C';

    const currentIdx = ladder.indexOf(company.bondRating);
    const targetIdx = ladder.indexOf(target);
    if (targetIdx === currentIdx) continue;

    // Downgrades are abrupt (often multi-notch); upgrades are grudging.
    const step = targetIdx > currentIdx
      ? Math.min(2, targetIdx - currentIdx)
      : -1;
    const nextIdx = Math.max(0, Math.min(ladder.length - 1, currentIdx + step));
    const previous = company.bondRating;
    company.bondRating = ladder[nextIdx];

    if (step > 0) {
      company.interestRate += 0.6 * step; // funding costs jump immediately
      if (company.isPlayer) {
        notify(state, `Credit downgrade: ${previous} → ${company.bondRating}. Borrowing costs have risen to ${company.interestRate.toFixed(1)}%.`, 'danger');
      }
      ticker(state, `${company.name} downgraded to ${company.bondRating}`, 'warning');
    } else if (company.isPlayer) {
      company.interestRate = Math.max(state.economy.interestRate + 0.5, company.interestRate - 0.4);
      notify(state, `Credit upgrade: ${previous} → ${company.bondRating}.`, 'success');
    }
  }
}

/**
 * Activist investors and hostile takeovers. Persistently undervalued firms
 * attract raiders who buy control and force change.
 */
export function simulateActivists(state: GameState) {
  const player = state.companies.find(c => c.isPlayer);
  if (!player) return;

  // Undervaluation: market cap well below book with weak earnings invites a bid.
  const discount = player.marketCap / Math.max(1, player.totalAssets);
  if (discount > 0.65 || player.profit >= 0) return;
  if (Math.random() > 0.02) return;

  const raider = state.companies
    .filter(c => !c.isPlayer && c.cash > player.marketCap * 0.4)
    .sort((a, b) => b.cash - a.cash)[0];
  if (!raider) return;

  notify(state,
    `${raider.name} has built a stake in your company, calling the ${(discount * 100).toFixed(0)}% discount to book value indefensible. ` +
    `Restore profitability or buy back stock before they secure control.`,
    'danger');
  ticker(state, `Activist investor ${raider.name} targets ${player.name}`, 'breaking');
  // Pressure lifts the share price but signals loss of control risk.
  player.sharePrice *= 1.06;
}

/** Commodity hedging: lock in input costs against volatility for a premium. */
export function hedgeCommodity(state: GameState, months: number): GameState {
  const company = state.companies.find(c => c.isPlayer);
  if (!company) return state;

  const exposure = state.buildings
    .filter(b => b.companyId === company.id)
    .reduce((sum, b) => sum + b.cogs, 0) * TICKS_PER_MONTH * months;
  const premium = exposure * 0.035;

  if (company.cash < premium) {
    notify(state, `Hedging ${months} months of input exposure costs $${(premium / 1_000_000).toFixed(2)}M in premium — insufficient cash.`, 'danger');
    return state;
  }
  company.cash -= premium;
  notify(state, `Hedged $${(exposure / 1_000_000).toFixed(1)}M of commodity exposure for ${months} months at a $${(premium / 1_000_000).toFixed(2)}M premium. Input costs are now locked.`, 'success');
  return state;
}
