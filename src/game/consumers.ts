import type { City, Product, Building, GameState, IncomeTier } from './types';

// ============= HOUSEHOLD INCOME SEGMENTATION =============
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

    city.discretionaryBudget = {
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
  return households * (
    city.incomeMix.low * city.discretionaryBudget.low * tierWeight.low +
    city.incomeMix.middle * city.discretionaryBudget.middle * tierWeight.middle +
    city.incomeMix.affluent * city.discretionaryBudget.affluent * tierWeight.affluent
  );
}

// ============= BEHAVIOURAL ECONOMICS =============

/**
 * Non-linear price response — a logistic curve rather than a power law.
 * Small changes near the reference price barely register (consumers don't
 * notice ±3%), but crossing a threshold triggers a sharp reaction, and the
 * curve flattens again at extremes (die-hards stay, cheapskates stay away).
 * Luxury goods keep a Veblen band: demand peaks slightly ABOVE parity.
 */
export function priceResponseLogit(product: Product, priceMultiplier: number, confidence: number): number {
  const brandStrength = product.brand / 100;
  const baseSensitivity = product.demandIndex > 70 ? 3.2 : product.demandIndex > 40 ? 5.5 : 8.5;
  // Strong brands blunt price sensitivity.
  const sensitivity = baseSensitivity * (1 - brandStrength * 0.45);

  if (product.segment === 'luxury' && product.brand > 70) {
    // Veblen band: demand peaks around 1.3x then collapses past 1.6x.
    const veblenPeak = 1.3;
    const distance = Math.abs(priceMultiplier - veblenPeak);
    const veblen = Math.max(0.25, 1.35 - distance * 1.1);
    const luxuryConfidence = Math.pow(Math.max(0.05, confidence / 100), 2.2);
    return veblen * luxuryConfidence;
  }

  // Logistic drop centred on the reference price, steepness by sensitivity.
  const logit = 1 / (1 + Math.exp(sensitivity * (priceMultiplier - 1)));
  // Anchored at ~0.6 when at parity so other factors can push demand above 1.
  const normalized = logit / (1 / (1 + Math.exp(0)));
  const confidenceExponent = product.demandIndex > 70 ? 0.35 : product.segment === 'premium' ? 1.7 : 1.1;
  const confidenceTerm = Math.pow(Math.max(0.05, confidence / 100), confidenceExponent);
  return Math.max(0.02, normalized * 0.9) * confidenceTerm;
}

/**
 * Anchoring + loss aversion. The first price seen sets the anchor; a rise
 * above it hurts ~2.25x more than an equivalent cut helps.
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
export function scarcityMultiplier(stock: number, capacity: number, desired: number): number {
  if (stock <= 0) return 0;
  if (desired <= 0) return 1;
  const stockRatio = stock / Math.max(1, desired);
  if (stockRatio < 0.3) return 1.22;  // "nearly gone" — urgency
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
  building.socialProof += (target - building.socialProof) * 0.04;
}

export function socialProofMultiplier(proof: number): number {
  return 1 + proof * 0.55;
}

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
 * Bulk buying: when staples get cheap, households stock up — buying 2-3x their
 * normal volume. This flattens the demand curve at deep discounts (a 50% off
 * sale on bread sells 30% more, not 100% more, because pantries fill up).
 */
export function bulkBuyingMultiplier(product: Product, priceMultiplier: number): number {
  if (product.demandIndex < 60) return 1;
  if (priceMultiplier >= 1) return 1;
  // Below parity, extra units taper off logarithmically.
  const discount = 1 - priceMultiplier;
  return 1 + Math.log1p(discount * 4) * 0.8;
}

/**
 * Brand switching costs. A store's habitual base migrates slowly — at most
 * ~15% of customers switch per month even when a rival is clearly better.
 */
export function switchingCostMultiplier(
  building: Building, competitiveAppeal: number,
): number {
  const loyaltyFloor = building.loyalCustomerBase * 0.55;
  const stickiness = loyaltyFloor + (1 - loyaltyFloor) * competitiveAppeal;
  const expected = Math.max(0.3, competitiveAppeal);
  return Math.max(0.3, stickiness / expected);
}

/**
 * Full demand stack for one retail line. Returns desired units/hr before
 * stock constraints.
 */
export function retailDemand(
  city: City, product: Product, building: Building, traffic: number,
  confidence: number, isDaytime: boolean, index: Map<string, Building[]>,
): number {
  const shelfPrice = product.currentPrice * building.pricingMultiplier;
  const necessity = product.demandIndex / 100;
  const wageRatio = city.wageRate / 22;
  const incomeElasticity = necessity > 0.7 ? 0.25 : necessity > 0.4 ? 0.9 : 1.6;
  const incomeTerm = Math.pow(Math.max(0.4, wageRatio), incomeElasticity);

  const priceTerm = priceResponseLogit(product, building.pricingMultiplier, confidence);
  const anchor = anchoringMultiplier(shelfPrice, building.anchorPrice || shelfPrice);
  const proof = socialProofMultiplier(building.socialProof);
  const impulse = impulseMultiplier(product, building.pricingMultiplier, traffic);
  const bulk = bulkBuyingMultiplier(product, building.pricingMultiplier);
  const fit = incomeFit(city, product);

  // Budget ceiling from the city's segmented household spend.
  const spendPool = categorySpendPool(city, product);
  const unitsPerMonth = spendPool / Math.max(0.5, shelfPrice);
  const budgetCeiling = unitsPerMonth / 30 / 14;

  const outletsHere = (index.get(city.id) ?? [])
    .filter(b => b.products.includes(product.id)).length;
  const shareOfMarket = 1 / Math.max(1, outletsHere * 0.6);

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
  const switching = switchingCostMultiplier(building,
    Math.max(0.25, rating / 70));
  const raw = (building.capacity / 14 * 8 / Math.max(1, (index.get(city.id) ?? []).length))
    * (0.4 + (traffic / 100) * 0.95)
    * priceTerm * confidenceTerm * incomeTerm * fit
    * anchor * proof * impulse * bulk * ratingTerm * searchFriction * switching
    * (isDaytime ? 1 : 0.3);

  return Math.min(raw, budgetCeiling * shareOfMarket * 2.5);
}

export function productRating(product: Product, priceMultiplier: number): number {
  const priceScore = Math.max(0, 100 - Math.max(0, priceMultiplier - 0.6) * 90);
  return (
    priceScore * product.priceWeight +
    product.perceivedQuality * product.qualityWeight +
    product.brand * product.brandWeight
  ) / 100;
}
