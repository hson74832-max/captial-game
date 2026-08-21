import type { Building, GameState, Company, CreditRating } from './types';
import type { StateIndex } from './indexing';

// ============= BULLWHIP EFFECT =============
/**
 * Small demand changes amplify as orders travel upstream: retail → warehouse
 * → factory → mine. Each echelon forecasts, batches and buffers, so a 10%
 * wobble at the shelf becomes a 40% swing at the pit head.
 *
 * echelonDepth: 0 = retail (shelf), 1 = warehouse, 2 = factory, 3 = mine/farm.
 */
export function bullwhipOrderQuantity(
  building: Building,
  observedDemand: number,
  echelonDepth: number,
): number {
  const amplification = 1 + echelonDepth * 0.35 + echelonDepth * echelonDepth * 0.12;

  // Exponential smoothing of observed demand — the forecast itself lags.
  building.demandForecast = building.demandForecast * 0.7 + observedDemand * 0.3;
  const forecast = Math.max(1, building.demandForecast);

  // Safety stock policy: 0 = just-in-time (fragile), 1 = heavy buffer (expensive).
  const safetyFactor = 1 + building.safetyStockPolicy * 1.1 + echelonDepth * 0.15;

  // Batch rounding: orders snap to case/ton sizes, adding lumpiness.
  const batchSize = Math.max(10, building.inventoryCapacity * 0.06);
  const raw = forecast * amplification * safetyFactor;
  const batched = Math.ceil(raw / batchSize) * batchSize;

  // Panic hoarding in crises compounds the whip.
  return Math.min(building.inventoryCapacity * 0.8, batched);
}

// ============= RUSHING PRODUCTION =============
/**
 * Running the line harder than nameplate. Output rises with intensity but
 * quality degrades — rushed batches slip through QA. Sustained rushing
 * also wears staff down.
 */
export function rushPenalty(building: Building): { output: number; quality: number; morale: number } {
  const intensity = building.productionIntensity;
  if (intensity <= 1) {
    return { output: 0.75 + intensity * 0.25, quality: 1, morale: 1 };
  }
  const over = intensity - 1;
  return {
    output: 1 + over * 0.8,            // +40% at max intensity
    quality: Math.max(0.6, 1 - over * 0.45), // up to -18% quality at max
    morale: Math.max(0.8, 1 - over * 0.5),
  };
}

// ============= TRAINING LAG =============
/**
 * Effective skill lags the funded training level: cash buys capability over
 * months, not instantly. Training a plant from level 3 to 9 takes roughly a
 * year of creeping improvement.
 */
export function updateEffectiveTraining(building: Building, ticksPerMonth: number) {
  const gap = building.trainingLevel - building.effectiveTraining;
  // ~0.5 levels per month of convergence, faster when morale is good.
  const moraleBoost = building.employeeSatisfaction > 60 ? 1.3 : 0.8;
  building.effectiveTraining += Math.max(0, gap) * 0.5 / ticksPerMonth * moraleBoost;
  building.effectiveTraining = Math.max(0, Math.min(9, building.effectiveTraining));
}

// ============= SUPPLIER FAILURE =============
/**
 * A supplier goes bust mid-contract, stranding its customers. Buyers must
 * find a new source or run on inventory — a genuine supply shock.
 */
export function propagateSupplierFailure(state: GameState, failedBuildingId: string) {
  let stranded = 0;
  for (const building of state.buildings) {
    if (building.id === failedBuildingId) continue;
    const hadLink = building.supplierLinks.some(link => link.supplierBuildingId === failedBuildingId);
    if (!hadLink) continue;
    building.supplierLinks = building.supplierLinks.filter(link => link.supplierBuildingId !== failedBuildingId);
    building.supplyDisrupted = true;
    stranded++;
  }
  return stranded;
}

/** A live supplier that goes bust mid-contract: pick the victim each month. */
export function simulateSupplierFailures(state: GameState, index: StateIndex) {
  for (const building of state.buildings) {
    if (building.companyId === 'system' || !building.isOperating) continue;
    if (!['factory', 'farm', 'mine'].includes(building.type)) continue;

    const owner = index.companiesById.get(building.companyId);
    const distressed = (owner?.monthsInDistress ?? 0) > 0;
    const bleeding = building.monthsUnprofitable > 8;
    if (!distressed && !bleeding) continue;

    const failureChance = (distressed ? 0.06 : 0) + (bleeding ? 0.04 : 0);
    if (Math.random() > failureChance) continue;

    building.isOperating = false;
    const stranded = propagateSupplierFailure(state, building.id);
    addNewsTicker(state, `${building.name} halts production${stranded > 0 ? ` — ${stranded} customers scramble for supply` : ''}`, 'warning');
  }
}

// ============= PATENT & R&D =============
/**
 * Research is uncertain: 30% of projects fail outright, and even successes
 * can land below target. Patents grant a temporary monopoly premium that
 * decays to nothing at expiry — commoditisation is guaranteed.
 */
export function resolveResearch(state: GameState, companyId: string, productId: string, investment: number): boolean {
  if (Math.random() < 0.30) return false;
  const product = state.products.find(p => p.id === productId);
  if (!product) return true;
  product.techLevel += 2 + Math.random() * 4;
  product.quality = Math.min(100, product.quality + 1.5);

  // Patent: 5-year exclusivity on the technology.
  state.patents = state.patents.filter(p => p.productId !== productId);
  state.patents.push({
    id: generateId(),
    productId,
    ownerId: companyId,
    grantedYear: state.year,
    expiresYear: state.year + 5,
  });
  return true;
}

/** Live patents support a price premium that vanishes at expiry. */
export function patentPremium(state: GameState, companyId: string, productId: string): number {
  const patent = state.patents.find(p => p.productId === productId && p.ownerId === companyId);
  if (!patent) return 1;
  const yearsLeft = Math.max(0, patent.expiresYear - state.year);
  if (yearsLeft <= 0) return 1;
  return 1 + yearsLeft * 0.03; // up to +15% while exclusivity holds
}

// ============= TRADE & TARIFFS =============
/**
 * Import prices move with partner exchange rates and tariffs. A strong
 * domestic currency cheapens imports; a weak one makes offshore supply
 * painful. Trade partners drift apart when tariffs escalate.
 */
export function importCostMultiplier(state: GameState): number {
  if (state.tradePartners.length === 0) return 1;
  const avgRate = state.tradePartners.reduce((s, p) => s + p.exchangeRate / p.baseExchangeRate, 0)
    / state.tradePartners.length;
  const avgTariff = state.tradePartners.reduce((s, p) => s + p.tariffRate, 0) / state.tradePartners.length;
  // Stronger FX (lower number) cheapens imports; tariffs add on top.
  return Math.max(0.5, Math.min(2.2, avgRate * (1 + avgTariff)));
}

export function simulateTrade(state: GameState) {
  for (const partner of state.tradePartners) {
    // Exchange rate random walk with mean reversion.
    partner.exchangeRate += (partner.baseExchangeRate - partner.exchangeRate) * 0.02
      + (Math.random() - 0.5) * partner.baseExchangeRate * 0.03;
    // Tariffs drift with relationship: hostility raises duties.
    const hostility = (50 - partner.relationship) / 100;
    partner.tariffRate = Math.max(0, Math.min(0.5,
      partner.tariffRate + (Math.random() - 0.5) * 0.004 + hostility * 0.002));
    partner.relationship = Math.max(-100, Math.min(100,
      partner.relationship + (Math.random() - 0.5) * 1.2));
  }
}

// ============= GOVERNMENT =============
export function simulateGovernment(state: GameState) {
  const gov = state.government;
  if (state.tick < gov.nextReviewTick) return;
  gov.nextReviewTick = state.tick + 24 * 30 * 6; // review twice a year

  // Carbon tax follows politics and the cycle: greens in booms, rollbacks in slumps.
  const trend = state.economy.cycle === 'boom' ? 0.15 : state.economy.cycle === 'recession' ? -0.2 : 0;
  gov.carbonTaxPerUnit = Math.max(0, Math.min(3,
    gov.carbonTaxPerUnit + trend + (Math.random() - 0.5) * 0.3));
  if (gov.carbonTaxPerUnit > 1.5 && Math.random() < 0.2) {
    addNewsTicker(state, `Government raises the carbon tax to $${gov.carbonTaxPerUnit.toFixed(2)}/unit — heavy industry pays`, 'warning');
  }
}

/**
 * Antitrust: when the player's share of a product category crosses the
 * threshold, regulators investigate. Two warnings force a divestiture —
 * one building sold at a distressed 60% — or a fine if nothing can be sold.
 */
export function simulateAntitrust(state: GameState, index: StateIndex) {
  const gov = state.government;
  const player = state.companies.find(c => c.isPlayer);
  if (!player) return;

  const categories = new Set(state.products.map(p => p.category));
  for (const category of categories) {
    const products = state.products.filter(p => p.category === category);
    const playerPower = products.reduce((sum, p) => sum + p.playerMarketShare, 0);
    if (playerPower < gov.antitrustThreshold) continue;

    if (gov.antitrustWarnings < 2) {
      gov.antitrustWarnings += 1;
      addNewsTicker(state, `Regulators open an antitrust investigation: ${player.name} holds ${playerPower.toFixed(0)}% of ${category}`, 'danger');
      addNotification(state,
        `Antitrust warning ${gov.antitrustWarnings}/2: your ${category} share is ${playerPower.toFixed(0)}%. Divest or face action.`,
        'danger');
    } else {
      // Forced divestiture.
      const owned = state.buildings.filter(b => b.companyId === player.id && b.type !== 'hq');
      if (owned.length > 0) {
        const victim = owned[Math.floor(Math.random() * owned.length)];
        const proceeds = victim.constructionCost * 0.6;
        player.cash += proceeds;
        state.buildings = state.buildings.filter(b => b.id !== victim.id);
        player.buildings = player.buildings.filter(id => id !== victim.id);
        gov.antitrustWarnings = 0;
        addNewsTicker(state, `${player.name} forced to divest ${victim.name} after antitrust ruling`, 'breaking');
        addNotification(state,
          `Regulators forced the sale of your ${victim.name} for $${formatMoney(proceeds)}.`,
          'danger');
      }
    }
    break;
  }
  // Warnings decay slowly when share is healthy.
  if (gov.antitrustWarnings > 0) gov.antitrustWarnings -= 0.02;
}

// ============= CARTELS & PREDATION =============
/**
 * AI boards collude when a market is concentrated: few competitors, competent
 * boards, similar cost structures. The cartel sets a floor price; members hold
 * the line until someone defects for share. Regulators can break it up.
 */
export function simulateCartels(state: GameState, index: StateIndex) {
  // Existing cartels decay and can be exposed.
  for (const cartel of [...state.cartels]) {
    if (Math.random() < cartel.stability * 0.02) {
      state.cartels = state.cartels.filter(c => c.id !== cartel.id);
      addNewsTicker(state, `A price-fixing arrangement in ${cartel.productId} collapses as a member defects`, 'info');
      continue;
    }
    if (Math.random() < 0.008) {
      cartel.exposed = true;
      addNewsTicker(state, `Regulators expose a cartel fixing prices in ${cartel.productId} — members fined`, 'breaking');
      for (const memberId of cartel.memberIds) {
        const member = state.companies.find(c => c.id === memberId);
        if (member) {
          member.cash -= member.cash * 0.02;
          member.cartelId = null;
        }
      }
      state.cartels = state.cartels.filter(c => c.id !== cartel.id);
    }
  }
  if (state.cartels.length >= 3) return;

  // Formation: same city, same retail format, 2-3 competent AI operators.
  for (const city of state.cities) {
    const retailers = state.buildings.filter(b => b.cityId === city.id && b.type === 'retail_store');
    if (retailers.length < 2 || retailers.length > 5) continue;
    const owners = [...new Set(retailers.map(b => b.companyId))]
      .map(id => state.companies.find(c => c.id === id))
      .filter((c): c is NonNullable<typeof c> => Boolean(c && !c.isPlayer && c.acumen > 0.6));
    if (owners.length < 2) continue;
    if (Math.random() > 0.015) continue;

    const productId = retailers[0].productId;
    if (!productId) continue;
    if (state.cartels.some(c => c.memberIds.some(id => owners.some(o => o.id === id)))) continue;

    state.cartels.push({
      id: generateId(),
      memberIds: owners.map(o => o.id),
      productId,
      agreedFloor: 1.15 + Math.random() * 0.15,
      formedTick: state.tick,
      stability: 0.5 + Math.random() * 0.4,
      exposed: false,
    });
    for (const owner of owners) owner.cartelId = state.cartels[state.cartels.length - 1].id;
    addNewsTicker(state, `Competition watchdogs suspect collusion among retailers in ${city.name}`, 'warning');
  }

  // Enforce floors: members of a cartel never price below the floor.
  for (const cartel of state.cartels) {
    for (const memberId of cartel.memberIds) {
      for (const b of state.buildings.filter(b => b.companyId === memberId && b.productId === cartel.productId)) {
        b.pricingMultiplier = Math.max(b.pricingMultiplier, cartel.agreedFloor);
      }
    }
  }
}

/**
 * Predatory pricing: an aggressive rival that loses share to the player
 * prices below cost for months to reclaim the market. Illegal in principle,
 * hard to prove in practice.
 */
export function simulatePredatoryPricing(state: GameState, index: StateIndex) {
  const player = state.companies.find(c => c.isPlayer);
  if (!player) return;

  for (const company of state.companies) {
    if (company.isPlayer || company.aiStrategy !== 'aggressive' || company.acumen < 0.6) continue;

    for (const building of state.buildings.filter(b => b.companyId === company.id)) {
      if (building.type !== 'retail_store' && !['restaurant', 'fast_food', 'cafe', 'bar'].includes(building.type)) continue;
      const key = `${building.productId}|${building.cityId}`;
      const share = company.observedPlayerShare[key] ?? 0;
      const previous = company.observedPlayerShare[key] ?? share;
      company.observedPlayerShare[key] = share;

      if (share - previous > 12 && company.predatoryTicks === 0 && company.cash > 20_000_000) {
        company.predatoryTicks = 24 * 30 * 4; // four months below cost
        addNewsTicker(state, `${company.name} slashes prices below cost in ${building.cityId} — a possible predatory campaign`, 'danger');
      }
      if (company.predatoryTicks > 0) {
        building.pricingMultiplier = Math.max(0.6, building.pricingMultiplier * 0.9);
      }
    }
    if (company.predatoryTicks > 0) company.predatoryTicks -= 24 * 30;
  }
}

/**
 * Herd behaviour: boards get euphoric in booms and overexpand — the
 * overexpansion bubble — then freeze in busts. Sentiment gates AI expansion.
 */
export function simulateHerding(state: GameState) {
  for (const company of state.companies) {
    if (company.isPlayer) continue;
    const eco = state.economy;
    const target = 0.8 + eco.gdpGrowth * 0.12 + (eco.consumerConfidence - 50) * 0.006;
    company.sentiment += (Math.max(0.2, Math.min(2, target)) - company.sentiment) * 0.05;
  }
}

/** Insolvent firms get 3 months, then a messy liquidation with creditor fights. */
export function messyLiquidation(state: GameState, company: Company, index: StateIndex): number {
  const assets = state.buildings.filter(b => b.companyId === company.id);
  let recovered = 0;
  for (const building of assets) {
    // Fire sale: 20-70% of book, plus land, minus a chaotic haircut.
    const recovery = 0.2 + Math.random() * 0.5;
    recovered += building.constructionCost * recovery + building.landValue * 0.6;
    building.companyId = 'system';
    building.isOperating = false;
  }
  // Creditor claims fight over the scraps: banks grab a share of the proceeds.
  const creditorClaims = recovered * (0.2 + Math.random() * 0.3);
  return Math.max(0, recovered - creditorClaims);
}

// ============= BOND RATINGS =============
/**
 * Real downgrades are cliff-like: agencies hold ratings steady through
 * gradual deterioration, then cut several notches at once when a covenant
 * trips. Upgrades creep back one notch at a time.
 */
export function reviewCreditRatings(state: GameState) {
  for (const company of state.companies) {
    if (company.debt <= 0) {
      if (company.bondRating !== 'AAA' && Math.random() < 0.02) {
        company.bondRating = upgradeOne(company.bondRating);
      }
      continue;
    }
    const debtRatio = company.debt / Math.max(1, company.totalAssets);
    const cashNegative = company.cash < 0;

    if (debtRatio > 0.7 || cashNegative) {
      if (Math.random() < 0.35) company.bondRating = downgradeCliff(company.bondRating, 3);
    } else if (debtRatio > 0.5) {
      if (Math.random() < 0.2) company.bondRating = downgradeCliff(company.bondRating, 2);
    } else if (debtRatio > 0.35) {
      if (Math.random() < 0.12) company.bondRating = downgradeCliff(company.bondRating, 1);
    } else if (Math.random() < 0.03) {
      company.bondRating = upgradeOne(company.bondRating);
    }
  }
}

const RATING_ORDER: CreditRating[] = ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC', 'CC', 'C', 'D'];

function downgradeCliff(r: CreditRating, notches: number): CreditRating {
  const idx = RATING_ORDER.indexOf(r);
  return RATING_ORDER[Math.min(RATING_ORDER.length - 1, idx + notches)];
}

function upgradeOne(r: CreditRating): CreditRating {
  const idx = RATING_ORDER.indexOf(r);
  return RATING_ORDER[Math.max(0, idx - 1)];
}

// ============= LOCAL HELPERS =============
let _idc = 0;
function generateId(): string {
  _idc += 1;
  return `id_${_idc}_${Math.random().toString(36).slice(2, 8)}`;
}

function addNotification(state: GameState, message: string, type: 'info' | 'success' | 'warning' | 'danger') {
  state.notifications.unshift({ id: generateId(), message, type, tick: state.tick });
  if (state.notifications.length > 50) state.notifications.pop();
}

function addNewsTicker(state: GameState, text: string, type: 'info' | 'breaking' | 'warning' | 'danger' = 'info') {
  state.stockMarket.ticker.unshift({ id: generateId(), text, type, tick: state.tick });
  if (state.stockMarket.ticker.length > 30) state.stockMarket.ticker.pop();
}

function formatMoney(amount: number): string {
  if (Math.abs(amount) >= 1_000_000_000) return (amount / 1_000_000_000).toFixed(2) + 'B';
  if (Math.abs(amount) >= 1_000_000) return (amount / 1_000_000).toFixed(2) + 'M';
  if (Math.abs(amount) >= 1_000) return (amount / 1_000).toFixed(1) + 'K';
  return amount.toFixed(0);
}
