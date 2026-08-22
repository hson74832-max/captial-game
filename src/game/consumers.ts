import type { Building, City, GameState, IncomeTier, Product } from './types';

// ════════════════════════════════════════════════════════════════════
// HOUSEHOLD INCOME SEGMENTATION
// ════════════════════════════════════════════════════════════════════
/**
 * Each city's households are split into three income tiers. Every month each
 * tier gets a discretionary budget: what is left after rent, food and transport.
 * Necessities eat a huge share of low incomes; luxuries need affluent buyers.
 */
export function updateHouseholdBudgets(state: GameState) {
  for (const city of state.cities) {
    const monthlyGross = city.wageRate * 173; // full-time hours per month
    const unemployedPenalty = 1 - (city.unemploymentRate / 100) * 0.7;

    // Essentials share of income by tier (rent + food + transport).
    const essentials: Record<IncomeTier, number> = { low: 0.78, middle: 0.58, affluent: 0.40 };

    city.discretionary = {
      low: monthlyGross * unemployedPenalty * (1 - essentials.low),
      middle: monthlyGross * unemployedPenalty * (1 - essentials.middle),
      affluent: monthlyGross * unemployedPenalty * (1 - essentials.affluent),
    };

    // Income mix drifts with growth: booming cities mint new affluent households.
    const growthShift = Math.max(-0.01, Math.min(0.01, city.growthRate / 300));
    city.incomeMix = {
      low: Math.max(0.05, city.incomeMix.low - growthShift),
      middle: Math.max(0.1, city.incomeMix.middle),
      affluent: Math.min(0.6, city.incomeMix.affluent + growthShift),
    };
    const mixTotal = city.incomeMix.low + city.incomeMix.middle + city.incomeMix.affluent;
    city.incomeMix.low /= mixTotal;
    city.incomeMix.middle /= mixTotal;
    city.incomeMix.affluent /= mixTotal;
  }
}

/**
 * 0..1..2 — how well a product matches this city's income distribution.
 * Staples trade everywhere; premium and luxury goods need affluent, educated
 * buyers; deep-discount goods are eaten up by the low tier.
 */
export function incomeFit(city: City, product: Product): number {
  const necessity = product.demandIndex / 100;

  if (product.segment === 'luxury') {
    return (city.incomeMix.affluent * 1.6 + city.incomeMix.middle * 0.55)
      * (0.7 + city.educationIndex / 200);
  }
  if (product.segment === 'premium') {
    return (city.incomeMix.affluent * 1.15 + city.incomeMix.middle * 0.95 + city.incomeMix.low * 0.45)
      * (0.75 + city.educationIndex / 300);
  }
  if (necessity > 0.7) {
    // Staples: everyone buys, but the low tier is the volume.
    return 0.8 + city.incomeMix.low * 0.5 + city.incomeMix.middle * 0.3;
  }
  if (product.segment === 'value') {
    return 0.7 + city.incomeMix.low * 0.8 + city.incomeMix.middle * 0.4;
  }
  // Mainstream discretionary.
  return 0.6 + city.incomeMix.middle * 0.8 + city.incomeMix.affluent * 0.5;
}

/** Total city-wide spend available for a product's category each month, USD. */
export function categorySpendPool(city: City, product: Product): number {
  const households = city.population / 2.4;
  const tierWeight: Record<IncomeTier, number> = {
    low: product.segment === 'luxury' || product.segment === 'premium' ? 0.05 : 0.55,
    middle: 1,
    affluent: product.segment === 'luxury' || product.segment === 'premium' ? 1.8 : 0.8,
  };
  // Household balance sheets: savings buffer spending in early downturns,
  // credit extends it briefly, then deleveraging crushes it.
  const buffer = city.householdSavingsMonths > 0 ? 1 : 0.92;
  const credit = city.householdDebtRatio < 0.35
    ? 1 + city.householdDebtRatio * 0.25
    : 1 - (city.householdDebtRatio - 0.35) * 1.2;
  const balanceSheetFactor = Math.max(0.5, buffer * credit);
  return households * balanceSheetFactor * (
    city.incomeMix.low * city.discretionary.low * tierWeight.low
    + city.incomeMix.middle * city.discretionary.middle * tierWeight.middle
    + city.incomeMix.affluent * city.discretionary.affluent * tierWeight.affluent
  );
}

// ════════════════════════════════════════════════════════════════════
// BEHAVIOURAL ECONOMICS
// ════════════════════════════════════════════════════════════════════
/**
 * Non-linear price response — a logistic curve rather than a power law.
 * Small changes near the reference price barely register (consumers don't
 * notice ±3%), but crossing a threshold triggers a sharp reaction, and the
 * curve flattens again at extremes. Luxury goods keep a Veblen band: demand
 * peaks slightly ABOVE parity.
 */
export function priceResponseLogit(product: Product, priceMultiplier: number, confidence: number): number {
  const brandStrength = product.brand / 100;
  const baseSensitivity = product.demandIndex > 70 ? 3.2 : product.demandIndex > 40 ? 5.5 : 8.5;
  // Strong brands blunt price sensitivity.
  const sensitivity = baseSensitivity * (1 - brandStrength * 0.45);

  if (product.segment === 'luxury' && product.brand > 70) {
    // Veblen band: demand peaks around 1.3x then collapses past 1.6x.
    const distance = Math.abs(priceMultiplier - 1.3);
    const veblen = Math.max(0.25, 1.35 - distance * 1.1);
    return veblen * Math.pow(Math.max(0.05, confidence / 100), 2.2);
  }

  // Logistic drop centred on the reference price, steepness by sensitivity.
  const logit = 1 / (1 + Math.exp(sensitivity * (priceMultiplier - 1)));
  // Anchored at ~0.6 when at parity so other factors can push demand above 1.
  const normalized = logit / (1 / (1 + Math.exp(0)));
  const confidenceExponent = product.demandIndex > 70 ? 0.35 : product.segment === 'premium' ? 1.7 : 1.1;
  return Math.max(0.02, normalized * 0.9) * Math.pow(Math.max(0.05, confidence / 100), confidenceExponent);
}

/**
 * Anchoring + loss aversion. The first price seen sets the anchor; a rise above
 * it hurts ~2.25x more than an equivalent cut helps.
 */
export function anchoringMultiplier(shelfPrice: number, anchorPrice: number): number {
  if (anchorPrice <= 0) return 1;
  const ratio = shelfPrice / anchorPrice;
  if (ratio > 1.02) return Math.max(0.45, 1 - (ratio - 1) * 2.25);
  if (ratio < 0.98) return Math.min(1.18, 1 + (1 - ratio) * 1.0);
  return 1;
}

/**
 * Scarcity mentality: "only 3 left!". Thin stock raises conversion — a nearly
 * empty shelf signals the item is desirable. Empty shelf = lost sale entirely.
 */
export function scarcityMultiplier(stock: number, desired: number): number {
  if (stock <= 0) return 0;
  if (desired <= 0) return 1;
  const stockRatio = stock / Math.max(1, desired);
  if (stockRatio < 0.3) return 1.22; // "nearly gone" — urgency
  if (stockRatio < 0.6) return 1.10;
  return 1;
}

/**
 * Social proof: bestseller lists snowball. A line that outsells its baseline
 * accumulates proof, which feeds back into demand. Slower to build than to lose.
 */
export function updateSocialProof(building: Building, sold: number, expected: number) {
  const ratio = expected > 0 ? sold / expected : 1;
  const target = Math.max(0, Math.min(1, (ratio - 0.6) * 1.4));
  building.socialProof += (target - building.socialProof) * 0.015;
}

export const socialProofMultiplier = (proof: number) => 1 + proof * 0.55;

/**
 * Impulse purchases: cheap, small items fly off the shelf with foot traffic.
 * Nobody "plans" a chewing gum purchase — they just see it at the register.
 */
export function impulseMultiplier(product: Product, priceMultiplier: number, traffic: number): number {
  const shelfPrice = product.currentPrice * priceMultiplier;
  if (shelfPrice > 15) return 1;
  if (shelfPrice <= 5) return 1 + (traffic / 100) * 0.45;
  return 1 + (traffic / 100) * 0.22;
}

/**
 * Bulk buying: when staples get cheap, households stock up. This flattens the
 * demand curve at deep discounts — a 50% off sale on bread sells 30% more, not
 * 100% more, because pantries fill up.
 */
export function bulkBuyingMultiplier(product: Product, priceMultiplier: number): number {
  if (product.demandIndex < 60) return 1;
  if (priceMultiplier >= 1) return 1;
  return 1 + Math.log1p((1 - priceMultiplier) * 4) * 0.8;
}

/**
 * Brand switching costs. A store's habitual base migrates slowly — at most
 * ~15% of customers switch per month even when a rival is clearly better.
 */
export function switchingCostMultiplier(building: Building, competitiveAppeal: number): number {
  const loyaltyFloor = building.loyalCustomerBase * 0.55;
  const stickiness = loyaltyFloor + (1 - loyaltyFloor) * competitiveAppeal;
  const expected = Math.max(0.3, competitiveAppeal);
  return Math.max(0.3, stickiness / expected);
}

/** The Capitalism rating model: price / quality / brand blended by weight. */
/**
 * Brand equity decays without advertising maintenance. A brand is a memory,
 * and memories fade: the share of voice a company stops paying for is gradually
 * forgotten. Decay is INVERSELY proportional to ad spend — heavy spend not only
 * adds equity, it slows the forgetting, so continuous presence compounds while
 * bursty campaigns fade fast.
 */
export function brandDecayRate(adSpendMonthly: number, category: string): number {
  // Fast-moving consumer categories forget faster than durable industrial ones.
  const base = category === 'Apparel' || category === 'Cosmetics' ? 0.055 : 0.03;
  // Ad support protects the memory, with diminishing returns.
  const protection = Math.min(0.85, Math.log10(1 + adSpendMonthly / 1000) * 0.32);
  return Math.max(0.004, base * (1 - protection));
}

export function updateBrandEquity(
  building: Building, adSpendMonthly: number, category: string, categoryRevenue: number,
) {
  // Earned equity from spend, scaled by how well the site is actually trading.
  const traction = Math.min(2, categoryRevenue / 40_000 + 0.4);
  const gain = Math.log10(1 + adSpendMonthly / 800) * 0.055 * traction;
  const decay = brandDecayRate(adSpendMonthly, category);
  building.brandEquity = Math.max(0, Math.min(100,
    building.brandEquity * (1 - decay) + gain));
  // Loyalty follows equity, not the other way round.
  building.loyalCustomerBase = Math.max(0.02, Math.min(0.6,
    building.loyalCustomerBase * (1 - decay * 0.4) + (building.brandEquity / 100) * 0.012));
}

/**
 * Bounded rationality: shoppers do not evaluate every option. They form a
 * CONSIDERATION SET of the top-N brands they are even aware of, then compare
 * only within it. Being outside the set is worse than being expensive inside
 * it — an unknown product cannot be chosen regardless of value.
 */
export function considerationSet(
  state: GameState, city: City, product: Product, size = 5,
): Array<{ building: Building; share: number }> {
  const carrying = state.buildings.filter(b =>
    b.cityId === city.id && b.isOperating && b.products.includes(product.id));
  if (carrying.length === 0) return [];

  // Awareness is driven by advertising presence and tenure, not just quality.
  const scored = carrying.map(b => ({
    building: b,
    awareness: b.brandEquity * 0.7 + b.socialProof * 25 + b.adBudget / 2000,
  })).sort((a, b) => b.awareness - a.awareness);

  const top = scored.slice(0, size);
  const totalAwareness = top.reduce((s, x) => s + x.awareness, 0) || 1;
  return top.map(x => ({ building: x.building, share: x.awareness / totalAwareness }));
}

/**
 * Active searchers. A fraction of shoppers visit several stores a month and
 * compare prices directly; the rest are passive and buy where they always buy.
 * Active search is what transmits price competition between stores — without
 * it, a rival's price cut is invisible until customers happen to wander past.
 */
export function searchIntensity(city: City, product: Product): number {
  // Search rises with ticket size: nobody drives across town to save 2%.
  const ticket = Math.log10(Math.max(1, product.currentPrice)) * 0.09;
  // Educated, connected populations search more.
  const sophistication = city.educationIndex / 100 * 0.16;
  // Staples are bought on habit, durables are researched.
  const habit = product.demandIndex > 70 ? -0.06 : 0.05;
  return Math.max(0.05, Math.min(0.55, 0.18 + ticket + sophistication + habit));
}

/** Competitive effect of active search: how much of your price edge leaks away. */
export function searchCompetition(
  state: GameState, city: City, product: Product, building: Building,
): number {
  const intensity = searchIntensity(city, product);
  const rivals = state.buildings.filter(b =>
    b.cityId === city.id && b.id !== building.id && b.isOperating
    && b.products.includes(product.id));
  if (rivals.length === 0) return 1;

  // Cheapest rival in the market — that is what searchers will find.
  const cheapest = rivals.reduce((min, r) =>
    r.pricingMultiplier < min.pricingMultiplier ? r : min, rivals[0]);
  const gap = building.pricingMultiplier - cheapest.pricingMultiplier;
  if (gap <= 0) return 1 + intensity * 0.15; // being cheapest rewards you
  // Lose share to the cheaper rival in proportion to search intensity.
  return Math.max(0.45, 1 - gap * intensity * 1.8);
}

/**
 * Metcalfe-style network effects, generalised beyond electronics. Retail
 * networks, marketplaces and platform businesses all get more valuable as more
 * people use them — that is what makes scale a moat rather than just cost
 * spreading. Returns a multiplier on demand.
 */
export function networkEffectMultiplier(product: Product, chainScale: number): number {
  const category = product.category;
  // How strongly this category exhibits network/scale effects.
  const strength =
    category === 'Communication' || category === 'Computers' ? 1.0 :
    category === 'Electronics' ? 0.7 :
    category === 'Auto' ? 0.45 :       // dealer & service networks
    category === 'Apparel' || category === 'Cosmetics' ? 0.35 : // brand community
    category === 'Home' ? 0.25 :
    category === 'Grocery' || category === 'Beverage' ? 0.2 :   // store density
    category === 'Health' ? 0.3 : 0.1;
  // Metcalfe value grows with the square of users; we use log to keep it tame.
  const n = Math.max(1, chainScale);
  return 1 + strength * Math.min(0.4, Math.log10(1 + n) * 0.16);
}

export function productRating(product: Product, priceMultiplier: number): number {
  const priceScore = Math.max(0, 100 - Math.max(0, priceMultiplier - 0.6) * 90);
  return (
    priceScore * product.priceWeight
    + product.perceivedQuality * product.qualityWeight
    + product.brand * product.brandWeight
  ) / 100;
}

/**
 * Full demand stack for one retail line. Returns desired units/hr before stock
 * constraints.
 */
export function retailDemand(
  city: City, product: Product, building: Building, traffic: number,
  confidence: number, isDaytime: boolean, outletsInCity: number, outletsCarrying: number,
): number {
  const shelfPrice = product.retailPrice * building.pricingMultiplier;
  const necessity = product.demandIndex / 100;
  const wageRatio = city.wageRate / 22;
  const incomeElasticity = necessity > 0.7 ? 0.25 : necessity > 0.4 ? 0.9 : 1.6;
  const incomeTerm = Math.pow(Math.max(0.4, wageRatio), incomeElasticity);

  const priceTerm = priceResponseLogit(product, building.pricingMultiplier, confidence);
  const anchor = anchoringMultiplier(shelfPrice, building.anchorPrice || shelfPrice);
  const proof = socialProofMultiplier(building.socialProof);
  // Category network effects: communication/computing goods gain value as the
  // installed base grows (Metcalfe-like, capped).
  const networkEffect = (product.category === 'Communication' || product.category === 'Computers')
    ? 1 + Math.min(0.35, Math.log10(1 + product.marketDemand) * 0.16) : 1;
  const impulse = impulseMultiplier(product, building.pricingMultiplier, traffic);
  const bulk = bulkBuyingMultiplier(product, building.pricingMultiplier);
  const fit = incomeFit(city, product);

  // Budget ceiling from the city's segmented household spend.
  const spendPool = categorySpendPool(city, product);
  const budgetCeiling = (spendPool / Math.max(0.5, shelfPrice)) / 30 / 14;

  const shareOfMarket = 1 / Math.max(1, outletsCarrying * 0.6);

  const confidenceExp = necessity > 0.7 ? 0.35 : 1.2;
  const confidenceTerm = Math.pow(Math.max(0.05, confidence / 100), confidenceExp);

  // Rating (price/quality/brand blend) converts the rest into sales.
  const rating = productRating(product, building.pricingMultiplier);
  const ratingTerm = Math.max(0.05, Math.pow(rating / 45, 1.35));

  // Search-cost friction: households do not observe every price instantly.
  // Strong brands, convenience and habitual loyalty reduce comparison shopping;
  // expensive discretionary goods trigger more search.
  const searchFriction = Math.max(0.5, Math.min(1.25,
    0.68 + product.brand / 250 + traffic / 500 + building.loyalCustomerBase * 0.25
      - Math.log10(Math.max(1, shelfPrice)) * 0.08));
  const switching = switchingCostMultiplier(building, Math.max(0.25, rating / 70));

  const raw = (building.capacity / 14 * 8 / Math.max(1, outletsInCity))
    * (0.4 + (traffic / 100) * 0.95)
    * priceTerm * confidenceTerm * incomeTerm * fit
    * anchor * proof * impulse * bulk * ratingTerm * searchFriction * switching * networkEffect
    * (isDaytime ? 1 : 0.3);

  return Math.min(raw, budgetCeiling * shareOfMarket * 2.5);
}
