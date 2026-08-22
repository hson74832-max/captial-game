import type { Building, GameState, RegionQuote } from './types';

// ════════════════════════════════════════════════════════════════════
// REGIONAL SUPPLY / DEMAND BUFFERS
// ════════════════════════════════════════════════════════════════════
/**
 * The national price is no longer the price you trade at. Every city keeps a
 * buffer for every product it touches: local production accumulates, local
 * consumption drains it, and the imbalance pushes the local price away from
 * the national quote.
 *
 * The key mechanic is TRANSPORT FRICTION. Goods only flow between two cities
 * when the price spread exceeds the cost of moving them. A spread narrower
 * than freight is not worth arbitraging, so it PERSISTS — that is what
 * creates durable regional opportunities rather than an instantly-cleared
 * single market. Cheap diesel and good infrastructure narrow the no-arbitrage
 * band and pull regions together; expensive fuel or poor roads widen it and
 * let differentials survive for months.
 */

/** Fetch-or-create a regional buffer. */
export function quote(state: GameState, cityId: string, productId: string): RegionQuote {
  let byCity = state.regional[cityId];
  if (!byCity) { byCity = {}; state.regional[cityId] = byCity; }
  let q = byCity[productId];
  if (!q) {
    q = { supply: 0, demand: 0, stock: 0, priceMul: 1, pressure: 0 };
    byCity[productId] = q;
  }
  return q;
}

/** Local price actually paid/received in a city. */
export function regionalPrice(state: GameState, cityId: string | undefined, productId: string): number {
  const product = state.products.find(p => p.id === productId);
  if (!product) return 0;
  if (!cityId) return Math.max(product.productionCost * 0.15, product.currentPrice);
  const q = quote(state, cityId, productId);
  // Hard floor: prices never go negative, and never below 15% of cost.
  return Math.max(product.productionCost * 0.15, product.currentPrice * q.priceMul);
}

/** Record goods arriving at a local market. */
export function recordSupply(state: GameState, cityId: string, productId: string, units: number) {
  if (units <= 0 || !cityId) return;
  const q = quote(state, cityId, productId);
  q.supply += units;
  q.stock += units;
}

/** Record goods leaving a local market. */
export function recordDemand(state: GameState, cityId: string, productId: string, units: number) {
  if (units <= 0 || !cityId) return;
  const q = quote(state, cityId, productId);
  q.demand += units;
  q.stock = Math.max(0, q.stock - units);
}

/**
 * The no-arbitrage band. Moving goods costs freight, so a spread smaller than
 * this is simply left alone. Expressed as a fraction of price.
 */
export function arbitrageBand(state: GameState, fromCityId: string, toCityId: string): number {
  const a = state.cities.find(c => c.id === fromCityId);
  const b = state.cities.find(c => c.id === toCityId);
  if (!a || !b) return 0.25;
  const diesel = state.economy.dieselPrice;
  const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
  // Fuel dominates the cost of the trip; infrastructure quality discounts it.
  const infra = Math.max(0.4, (a.infrastructure + b.infrastructure) / 200);
  return Math.min(0.6, (diesel / 3.4) * 0.10 + (dist / 200) * 0.25 + (1 - infra) * 0.10);
}

/** Per-city efficiency at pulling its prices back toward parity. */
function transportEfficiency(state: GameState, cityId: string): number {
  const c = state.cities.find(x => x.id === cityId);
  if (!c) return 0.5;
  const fuelFactor = Math.max(0.25, 1 - (state.economy.dieselPrice - 2.5) / 6);
  const infraFactor = Math.max(0.3, c.infrastructure / 100);
  return fuelFactor * infraFactor;
}

/**
 * Daily settlement. Imbalance pushes local prices apart; arbitrage pulls them
 * back together, but ONLY when the spread clears the freight band — otherwise
 * the differential simply persists.
 */
export function simulateRegionalMarkets(state: GameState) {
  const productIds = state.products.map(p => p.id);

  for (const productId of productIds) {
    // National average multiplier, so we know what "parity" looks like.
    let sumMul = 0, n = 0;
    for (const city of state.cities) {
      const q = state.regional[city.id]?.[productId];
      if (q) { sumMul += q.priceMul; n++; }
    }
    const avgMul = n > 0 ? sumMul / n : 1;

    for (const city of state.cities) {
      const q = state.regional[city.id]?.[productId];
      if (!q) continue;

      const total = q.supply + q.demand;
      // -1 = pure shortage, +1 = pure glut.
      const imbalance = total > 0 ? (q.supply - q.demand) / total : 0;
      q.pressure = q.pressure * 0.82 + imbalance * 0.18;

      // Surplus depresses local price, shortage lifts it.
      const pricePush = -q.pressure * 0.10;
      q.priceMul += pricePush;
      // Buffered stock also weighs on price (holders want it gone).
      const stockDrag = Math.min(0.02, (q.stock / 5000) * 0.01);
      q.priceMul -= stockDrag;

      // ── Arbitrage: only converges when the spread beats freight ──
      const spread = Math.abs(q.priceMul - avgMul);
      const band = arbitrageBand(state, city.id, city.id) * 0.5 + 0.02;
      if (spread > band) {
        // Worth shipping: the spread decays toward parity at a rate set by
        // how good the transport links are.
        const rate = 0.10 * transportEfficiency(state, city.id);
        q.priceMul += (avgMul - q.priceMul) * rate;
      }
      // Inside the band, nothing moves — the differential persists. This is
      // the whole point: friction creates durable regional mispricing.

      q.priceMul = Math.max(0.55, Math.min(1.85, q.priceMul));

      // Decay the flow counters so they reflect recent activity, and let
      // buffered stock rot away slowly (carrying loss).
      q.supply *= 0.75;
      q.demand *= 0.75;
      q.stock *= 0.985;
      if (q.stock < 1) q.stock = 0;
    }
  }
}

/**
 * Inventory carrying cost. Capital tied up in stock, warehousing, insurance,
 * shrinkage and obsolescence. Without this, holding inventory was free and the
 * rational move was always to buy as much as possible — which flattened every
 * regional differential. Carrying cost is what makes lean operations a real
 * choice and lets regional scarcity survive.
 */
export function carryingCost(b: Building): number {
  let value = 0;
  for (const [pid, qty] of Object.entries(b.inventory)) {
    void pid;
    value += qty;
  }
  // Blended carrying rate: ~1.4% of book value per month, in hourly terms.
  const bookValue = b.cogs > 0 && b.lastUnitsSold > 0 ? (b.cogs / b.lastUnitsSold) * value : value * 40;
  return (bookValue * 0.014) / 720;
}

/** Best current spreads for the UI — where the arbitrage actually is. */
export function topSpreads(state: GameState, limit = 8): Array<{
  productId: string; productName: string; cheapCity: string; richCity: string;
  cheapMul: number; richMul: number; band: number; tradable: boolean;
}> {
  const out: Array<{
    productId: string; productName: string; cheapCity: string; richCity: string;
    cheapMul: number; richMul: number; band: number; tradable: boolean;
  }> = [];

  for (const product of state.products) {
    let cheap: { id: string; mul: number } | null = null;
    let rich: { id: string; mul: number } | null = null;
    for (const city of state.cities) {
      const q = state.regional[city.id]?.[product.id];
      if (!q) continue;
      if (!cheap || q.priceMul < cheap.mul) cheap = { id: city.id, mul: q.priceMul };
      if (!rich || q.priceMul > rich.mul) rich = { id: city.id, mul: q.priceMul };
    }
    if (!cheap || !rich || cheap.id === rich.id) continue;
    const spread = rich.mul - cheap.mul;
    if (spread <= 0.01) continue;
    const band = arbitrageBand(state, cheap.id, rich.id);
    out.push({
      productId: product.id, productName: product.name,
      cheapCity: state.cities.find(c => c.id === cheap!.id)?.name ?? '',
      richCity: state.cities.find(c => c.id === rich!.id)?.name ?? '',
      cheapMul: cheap.mul, richMul: rich.mul, band,
      tradable: spread > band,
    });
  }

  return out.sort((a, b) => (b.richMul - b.cheapMul) - (a.richMul - a.cheapMul)).slice(0, limit);
}
