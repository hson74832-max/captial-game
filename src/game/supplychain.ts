import type { Building, Company, CreditRating, GameState } from './types';
import { TICKS_PER_MONTH } from './constants';
import { uid } from './world';
import { notify, news, money } from './systems';

// ════════════════════════════════════════════════════════════════════
// BULLWHIP EFFECT
// ════════════════════════════════════════════════════════════════════
/**
 * Small demand changes amplify as orders travel upstream: retail → warehouse
 * → factory → mine. Each echelon forecasts, batches and buffers, so a 10%
 * wobble at the shelf becomes a 40% swing at the pit head.
 *
 * echelonDepth: 0 = retail (shelf), 1 = warehouse, 2 = factory, 3 = mine/farm.
 */
export function bullwhipOrderQuantity(
  building: Building, observedDemand: number, echelonDepth: number,
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
  return Math.min(building.inventoryCapacity * 0.8, Math.ceil(raw / batchSize) * batchSize);
}

/** Echelon depth of a building type in the supply chain. */
export function echelonOf(type: Building['type']): number {
  if (type === 'retail_store' || type === 'cafe' || type === 'fast_food'
    || type === 'restaurant' || type === 'bar') return 0;
  if (type === 'warehouse') return 1;
  if (type === 'factory') return 2;
  return 3;
}

// ════════════════════════════════════════════════════════════════════
// RUSHING PRODUCTION
// ════════════════════════════════════════════════════════════════════
/**
 * Running the line harder than nameplate. Output rises with intensity but
 * quality degrades — rushed batches slip through QA. Sustained rushing also
 * wears staff down.
 */
export function rushPenalty(building: Building): { output: number; quality: number; morale: number } {
  const intensity = building.productionIntensity;
  if (intensity <= 1) return { output: 0.75 + intensity * 0.25, quality: 1, morale: 1 };
  const over = intensity - 1;
  return {
    output: 1 + over * 0.8,                 // +40% at max intensity
    quality: Math.max(0.6, 1 - over * 0.45), // up to -18% quality at max
    morale: Math.max(0.8, 1 - over * 0.5),
  };
}

// ════════════════════════════════════════════════════════════════════
// TRAINING LAG
// ════════════════════════════════════════════════════════════════════
/**
 * Effective skill lags the funded training level: cash buys capability over
 * months, not instantly. Training a plant from level 3 to 9 takes roughly a
 * year of creeping improvement.
 */
export function updateEffectiveTraining(building: Building, ticksPerMonth = TICKS_PER_MONTH) {
  const gap = building.trainingLevel - building.effectiveTraining;
  const moraleBoost = building.morale > 60 ? 1.3 : 0.8;
  building.effectiveTraining += Math.max(0, gap) * 0.5 / ticksPerMonth * moraleBoost;
  building.effectiveTraining = Math.max(0, Math.min(9, building.effectiveTraining));
  // Realised skill never exceeds what the building can hold at its level.
  building.staffSkill = Math.max(building.staffSkill, building.effectiveTraining);
}

// ════════════════════════════════════════════════════════════════════
// SUPPLIER FAILURE
// ════════════════════════════════════════════════════════════════════
/**
 * A supplier goes bust mid-contract, stranding its customers. Buyers must find
 * a new source or run on inventory — a genuine supply shock.
 */
export function propagateSupplierFailure(state: GameState, failedBuildingId: string): number {
  let stranded = 0;
  for (const building of state.buildings) {
    if (building.id === failedBuildingId) continue;
    // Contract book lives in state.contracts keyed by buyer id.
    const list = state.contracts[building.id];
    if (!list?.some(c => c.supplierBuildingId === failedBuildingId)) continue;
    state.contracts[building.id] = list.filter(c => c.supplierBuildingId !== failedBuildingId);
    building.supplyDisrupted = true;
    stranded++;
    if (building.companyId === state.playerCompanyId) {
      notify(state, `Supply shock: ${building.name} lost its supplier and must re-source.`, 'danger');
    }
  }
  return stranded;
}

/** A live supplier that goes bust mid-contract: pick the victim each month. */
export function simulateSupplierFailures(state: GameState) {
  for (const building of state.buildings) {
    if (building.companyId === 'system' || !building.isOperating) continue;
    if (building.type !== 'factory' && building.type !== 'farm' && building.type !== 'mine') continue;

    const owner = state.companies.find(c => c.id === building.companyId);
    const distressed = (owner?.monthsInDistress ?? 0) > 0;
    const bleeding = building.monthsUnprofitable > 8;
    if (!distressed && !bleeding) continue;

    const failureChance = (distressed ? 0.06 : 0) + (bleeding ? 0.04 : 0);
    if (Math.random() > failureChance) continue;

    building.isOperating = false;
    const stranded = propagateSupplierFailure(state, building.id);
    news(state, `${building.name} halts production${stranded > 0 ? ` — ${stranded} customers scramble for supply` : ''}`, 'warning');
  }
}

// ════════════════════════════════════════════════════════════════════
// PATENTS & R&D
// ════════════════════════════════════════════════════════════════════
/**
 * Research is uncertain: 30% of projects fail outright. Successes grant a
 * patent whose monopoly premium decays to nothing at expiry —
 * commoditisation is guaranteed.
 */
export function resolveResearch(state: GameState, companyId: string, productId: string): boolean {
  if (Math.random() < 0.30) return false;
  const product = state.products.find(p => p.id === productId);
  if (product) product.quality = Math.min(100, product.quality + 1.5);

  state.patents = state.patents.filter(p => p.productId !== productId);
  state.patents.push({
    id: uid('pat'), productId, ownerId: companyId,
    grantedYear: state.year, expiresYear: state.year + 5,
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

/** Drop expired patents. */
export function simulatePatents(state: GameState) {
  state.patents = state.patents.filter(p => p.expiresYear > state.year);
}

// ════════════════════════════════════════════════════════════════════
// TRADE & TARIFFS
// ════════════════════════════════════════════════════════════════════
/**
 * Import prices move with partner exchange rates and tariffs. A strong domestic
 * currency cheapens imports; a weak one makes offshore supply painful.
 */
export function importCostMultiplier(state: GameState): number {
  if (state.tradePartners.length === 0) return 1;
  const avgRate = state.tradePartners.reduce((s, p) => s + p.exchangeRate / p.baseExchangeRate, 0)
    / state.tradePartners.length;
  const avgTariff = state.tradePartners.reduce((s, p) => s + p.tariffRate, 0) / state.tradePartners.length;
  return Math.max(0.5, Math.min(2.2, avgRate * (1 + avgTariff)));
}

export function simulateTrade(state: GameState) {
  for (const partner of state.tradePartners) {
    // Exchange-rate random walk with mean reversion.
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

// ════════════════════════════════════════════════════════════════════
// GOVERNMENT POLICY REVIEW
// ════════════════════════════════════════════════════════════════════
export function simulateGovernment(state: GameState) {
  const pol = state.politics;
  if (state.tick < pol.nextReviewTick) return;
  pol.nextReviewTick = state.tick + TICKS_PER_MONTH * 6; // twice a year

  // Carbon tax follows politics and the cycle: greens in booms, rollbacks in slumps.
  const trend = state.economy.cycle === 'boom' ? 0.15 : state.economy.cycle === 'recession' ? -0.2 : 0;
  const lobby = pol.greenLobby * 0.02 - pol.industryLobby * 0.015;
  state.economy.carbonTaxPerUnit = Math.max(0, Math.min(3,
    state.economy.carbonTaxPerUnit + trend + lobby + (Math.random() - 0.5) * 0.3));
  if (state.economy.carbonTaxPerUnit > 1.5 && Math.random() < 0.2) {
    news(state, `Government raises the carbon tax to $${state.economy.carbonTaxPerUnit.toFixed(2)}/unit — heavy industry pays`, 'warning');
  }
}

// ════════════════════════════════════════════════════════════════════
// CARTELS
// ════════════════════════════════════════════════════════════════════
/**
 * AI boards collude when a market is concentrated: few competitors, competent
 * boards, similar cost structures. The cartel sets a floor price; members hold
 * the line until someone defects for share. Regulators can break it up.
 */
export function simulateCartels(state: GameState) {
  for (const cartel of [...state.cartels]) {
    if (Math.random() < cartel.stability * 0.02) {
      state.cartels = state.cartels.filter(c => c.id !== cartel.id);
      for (const id of cartel.memberIds) {
        const co = state.companies.find(c => c.id === id);
        if (co) co.cartelId = null;
      }
      news(state, `A price-fixing arrangement collapses as a member defects`, 'info');
      continue;
    }
    if (Math.random() < 0.008) {
      cartel.exposed = true;
      news(state, 'Regulators expose a cartel fixing prices — members fined', 'breaking');
      for (const id of cartel.memberIds) {
        const co = state.companies.find(c => c.id === id);
        if (co) { co.cash -= co.cash * 0.02; co.cartelId = null; }
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
      .filter((c): c is Company => Boolean(c && !c.isPlayer && c.acumen > 0.6));
    if (owners.length < 2) continue;
    if (Math.random() > 0.015) continue;
    const productId = retailers[0].productId;
    if (!productId) continue;
    if (state.cartels.some(c => c.memberIds.some(id => owners.some(o => o.id === id)))) continue;

    const cartel = {
      id: uid('ct'), memberIds: owners.map(o => o.id), productId,
      agreedFloor: 1.15 + Math.random() * 0.15, formedTick: state.tick,
      stability: 0.5 + Math.random() * 0.4, exposed: false,
    };
    state.cartels.push(cartel);
    for (const owner of owners) owner.cartelId = cartel.id;
    news(state, `Competition watchdogs suspect collusion among retailers in ${city.name}`, 'warning');
  }

  // Enforce floors: cartel members never price below the agreed floor.
  for (const cartel of state.cartels) {
    for (const memberId of cartel.memberIds) {
      for (const b of state.buildings.filter(b => b.companyId === memberId && b.productId === cartel.productId)) {
        b.pricingMultiplier = Math.max(b.pricingMultiplier, cartel.agreedFloor);
      }
    }
  }
}

// ════════════════════════════════════════════════════════════════════
// PREDATORY PRICING
// ════════════════════════════════════════════════════════════════════
/**
 * An aggressive rival that loses share to the player prices below cost for
 * months to reclaim the market. Illegal in principle, hard to prove.
 */
export function simulatePredatoryPricing(state: GameState) {
  const player = state.companies.find(c => c.id === state.playerCompanyId);
  if (!player) return;

  for (const company of state.companies) {
    if (company.isPlayer || company.strategy !== 'aggressive' || company.acumen < 0.6) continue;

    for (const building of state.buildings.filter(b => b.companyId === company.id)) {
      if (building.type !== 'retail_store' && building.type !== 'restaurant'
        && building.type !== 'fast_food' && building.type !== 'cafe' && building.type !== 'bar') continue;

      const key = `${building.productId}|${building.cityId}`;
      // Observed player pressure: their utilisation against the player's nearby site.
      const playerRival = state.buildings.find(pb =>
        pb.companyId === player.id && pb.cityId === building.cityId
        && pb.type === building.type && pb.utilization > 70);
      const share = playerRival ? Math.round(playerRival.utilization) : 0;
      const previous = company.observedPlayerShare[key] ?? 0;
      company.observedPlayerShare[key] = share;

      if (share - previous > 12 && company.predatoryTicks === 0 && company.cash > 20_000_000) {
        company.predatoryTicks = TICKS_PER_MONTH * 4;
        news(state, `${company.name} slashes prices below cost — a possible predatory campaign`, 'breaking');
      }
      if (company.predatoryTicks > 0) {
        building.pricingMultiplier = Math.max(0.6, building.pricingMultiplier * 0.9);
      }
    }
    if (company.predatoryTicks > 0) company.predatoryTicks -= TICKS_PER_MONTH;
  }
}

// ════════════════════════════════════════════════════════════════════
// HERDING
// ════════════════════════════════════════════════════════════════════
/**
 * Boards get euphoric in booms and overexpand — the overexpansion bubble —
 * then freeze in busts. Sentiment gates AI expansion.
 */
export function simulateHerding(state: GameState) {
  const eco = state.economy;
  for (const company of state.companies) {
    if (company.isPlayer) continue;
    const target = 0.8 + eco.gdpGrowth * 0.12 + (eco.consumerConfidence - 50) * 0.006;
    company.sentiment += (Math.max(0.2, Math.min(2, target)) - company.sentiment) * 0.05;
  }
}

/** Insolvent firms get three months, then a messy liquidation with creditor fights. */
export function messyLiquidation(state: GameState, company: Company): number {
  const assets = state.buildings.filter(b => b.companyId === company.id);
  let recovered = 0;
  for (const building of assets) {
    // Fire sale: 20-70% of book, plus land, minus a chaotic haircut.
    recovered += building.constructionCost * (0.2 + Math.random() * 0.5) + building.landValue * 0.6;
    building.companyId = 'system';
    building.isOperating = false;
  }
  const creditorClaims = recovered * (0.2 + Math.random() * 0.3);
  return Math.max(0, recovered - creditorClaims);
}

// ════════════════════════════════════════════════════════════════════
// CREDIT RATINGS
// ════════════════════════════════════════════════════════════════════
const RATING_ORDER: CreditRating[] = ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC', 'CC', 'C', 'D'];

const downgradeCliff = (r: string, notches: number): CreditRating => {
  const idx = Math.max(0, RATING_ORDER.indexOf(r as CreditRating));
  return RATING_ORDER[Math.min(RATING_ORDER.length - 1, idx + notches)];
};
const upgradeOne = (r: string): CreditRating => {
  const idx = Math.max(0, RATING_ORDER.indexOf(r as CreditRating));
  return RATING_ORDER[Math.max(0, idx - 1)];
};

/**
 * Real downgrades are cliff-like: agencies hold ratings steady through gradual
 * deterioration, then cut several notches at once when a covenant trips.
 * Upgrades creep back one notch at a time.
 */
export function reviewCreditRatings(state: GameState) {
  for (const company of state.companies) {
    if (company.debt <= 0) {
      if (company.bondRating !== 'AAA' && Math.random() < 0.02) company.bondRating = upgradeOne(company.bondRating);
      continue;
    }
    const debtRatio = company.debt / Math.max(1, company.totalAssets);
    const before = company.bondRating;

    if (debtRatio > 0.7 || company.cash < 0) {
      if (Math.random() < 0.35) company.bondRating = downgradeCliff(company.bondRating, 3);
    } else if (debtRatio > 0.5) {
      if (Math.random() < 0.2) company.bondRating = downgradeCliff(company.bondRating, 2);
    } else if (debtRatio > 0.35) {
      if (Math.random() < 0.12) company.bondRating = downgradeCliff(company.bondRating, 1);
    } else if (Math.random() < 0.03) {
      company.bondRating = upgradeOne(company.bondRating);
    }

    if (company.bondRating !== before && company.isPlayer) {
      const worse = RATING_ORDER.indexOf(company.bondRating as CreditRating)
        > RATING_ORDER.indexOf(before as CreditRating);
      notify(state, `Rating agency moves ${company.name} from ${before} to ${company.bondRating}.`,
        worse ? 'danger' : 'success');
    }
  }
}

export { money };
