import type {
  Building, BuildingType, GameState, LandHolding, SupplyQuote,
} from './types';
import {
  BUILDING_CONFIGS, LIVESTOCK_BREEDS, PRODUCT_TIERS, VENUE_INGREDIENTS,
  isHospitality, isProducer, isProperty,
} from './constants';
import { uid } from './world';
import { bullwhipOrderQuantity, echelonOf, importCostMultiplier } from './supplychain';
import { snapOffRoad } from './roads';

// Injected by engine.ts to avoid a circular import.
export let notify: (s: GameState, m: string, t?: 'info' | 'warning' | 'danger' | 'success') => void = () => {};
export let news: (s: GameState, m: string, t?: 'info' | 'warning' | 'breaking' | 'success') => void = () => {};
export let fmt: (n: number) => string = n => String(n);
export function wireHelpers(n: typeof notify, w: typeof news, f: typeof fmt) { notify = n; news = w; fmt = f; }

export const money = (n: number) => `${n < 0 ? '-' : ''}$${fmt(Math.abs(n))}`;

// ════════════════════════════════════════════════════════════════════
// LAND MARKET
// ════════════════════════════════════════════════════════════════════
/** Hedonic land price: base value × wages × population × zoning × CBD × development. */
export function landPrice(state: GameState, x: number, y: number): number {
  const tile = state.tiles[y]?.[x];
  if (!tile || tile.type === 'water' || tile.road || tile.highway) return 0;
  let nearest: { c: (typeof state.cities)[number] | null; d: number } = { c: null, d: Infinity };
  for (const c of state.cities) {
    const d = Math.hypot(c.x - x, c.y - y);
    if (d < nearest.d) nearest = { c, d };
  }
  const city = nearest.c;
  const wageF = city ? 0.7 + city.wageRate / 34 : 0.7;
  const popF = city ? 0.75 + Math.min(1.5, city.population / 60_000) : 0.75;
  const trafficF = city ? 0.82 + city.trafficLevel / 180 : 0.85;
  const zoneF = tile.zone === 'commercial' ? 1.6 : tile.zone === 'residential' ? 1.28
    : tile.zone === 'mixed' ? 1.1 : tile.zone === 'industrial' ? 0.85 : 0.5;
  const cbdF = city ? 1 + Math.max(0, 16 - nearest.d) / 16 * 1.25 : 1;
  const nearby = state.buildings.filter(b => Math.abs(b.x - x) < 6 && Math.abs(b.y - y) < 6).length;
  const devF = 1 + Math.min(0.85, nearby * 0.05);
  const resF = tile.resource ? 1.8 + Math.min(2.2, tile.resource.amount / 4000) : 1;
  const polF = city ? Math.max(0.55, 1 - Math.max(0, city.pollution - 25) * 0.006) : 1;
  return Math.max(12_000, tile.landValue * 2_600 * wageF * popF * trafficF * zoneF * cbdF * devF * resF * polF);
}

export function landOwnerAt(state: GameState, x: number, y: number): LandHolding | undefined {
  return state.landHoldings.find(h => h.x === x && h.y === y);
}

export function buyLand(state: GameState, x: number, y: number): boolean {
  const p = state.companies.find(c => c.id === state.playerCompanyId)!;
  const tile = state.tiles[y]?.[x];
  if (!tile) return false;
  if (landOwnerAt(state, x, y)) { notify(state, 'That parcel already has a registered title.', 'warning'); return false; }
  if (state.buildings.some(b => b.x === x && b.y === y)) {
    notify(state, 'That parcel is developed. Acquire the building, not the underlying title.', 'warning');
    return false;
  }
  const price = landPrice(state, x, y);
  if (price <= 0) { notify(state, 'This tile cannot be titled.', 'warning'); return false; }
  if (p.cash < price) { notify(state, `Land costs ${money(price)}.`, 'danger'); return false; }
  p.cash -= price;
  state.landHoldings.push({
    id: uid('land'), ownerId: p.id, cityId: tile.cityId, x, y, zone: tile.zone,
    purchasePrice: price, currentValue: price, purchaseTick: state.tick, developedBuildingId: null,
  });
  notify(state, `Acquired ${tile.zone} land for ${money(price)}. Development rights secured.`, 'success');
  return true;
}

export function sellLand(state: GameState, holdingId: string) {
  const p = state.companies.find(c => c.id === state.playerCompanyId)!;
  const h = state.landHoldings.find(x => x.id === holdingId);
  if (!h || h.ownerId !== p.id || h.developedBuildingId) return;
  const proceeds = h.currentValue * 0.97;
  const gain = proceeds - h.purchasePrice;
  p.cash += proceeds;
  if (gain > 0) { const tax = gain * state.economy.capitalGainsRate / 100; p.cash -= tax; p.taxesPaidYTD += tax; }
  else p.lossCarryforward += -gain;
  state.landHoldings = state.landHoldings.filter(x => x.id !== holdingId);
  notify(state, `Sold parcel for ${money(proceeds)} (${gain >= 0 ? 'gain' : 'loss'} ${money(Math.abs(gain))}).`, 'success');
}

/** Monthly appreciation plus AI land banking. */
export function simulateLandMarket(state: GameState) {
  for (const h of state.landHoldings) {
    const city = state.cities.find(c => c.id === h.cityId);
    const nearby = state.buildings.filter(b => Math.abs(b.x - h.x) < 6 && Math.abs(b.y - h.y) < 6).length;
    const growth = (state.economy.inflation + (city ? (city.birthRate - city.deathRate + city.netMigrationRate) / 12 : 0)) / 100 / 12
      + nearby * 0.0009;
    h.currentValue = Math.max(6_000, h.currentValue * (1 + Math.max(-0.025, Math.min(0.035, growth))));
  }
  for (const co of state.companies) {
    if (co.isPlayer) continue;
    const owned = state.landHoldings.filter(h => h.ownerId === co.id);
    const cap = co.sectorFocus === 'real_estate' ? 8 : co.sectorFocus === 'industrial' ? 5 : 2;
    if (owned.length >= cap || co.cash < 2_000_000) continue;
    if (Math.random() > 0.05 + co.acumen * 0.13) continue;
    const city = state.cities[Math.floor(Math.random() * state.cities.length)];
    const ang = Math.random() * Math.PI * 2;
    const rad = 3 + Math.random() * (city.radius - 2);
    const x = Math.round(city.x + Math.cos(ang) * rad);
    const y = Math.round(city.y + Math.sin(ang) * rad);
    // Never bank a parcel that sits on a street or the interstate.
    const [px, py] = snapOffRoad(state.cities, city, x, y);
    if (landOwnerAt(state, px, py) || state.buildings.some(b => b.x === px && b.y === py)) continue;
    const price = landPrice(state, px, py);
    if (price <= 0 || co.cash < price * 1.6) continue;
    const tile = state.tiles[py][px];
    co.cash -= price;
    state.landHoldings.push({
      id: uid('land'), ownerId: co.id, cityId: tile.cityId, x: px, y: py, zone: tile.zone,
      purchasePrice: price, currentValue: price, purchaseTick: state.tick, developedBuildingId: null,
    });
  }
}

// ════════════════════════════════════════════════════════════════════
// NIMBY
// ════════════════════════════════════════════════════════════════════
export function nimbyCheck(state: GameState, x: number, y: number, type: BuildingType):
  { blocked: boolean; surcharge: number; note: string } {
  const city = state.cities.find(c => Math.hypot(c.x - x, c.y - y) <= c.radius + 2);
  if (!city) return { blocked: false, surcharge: 0, note: '' };
  const nuisance = type === 'factory' ? 1 : type === 'warehouse' || type === 'bar' ? 0.6
    : type === 'fast_food' ? 0.35 : type === 'apartment' ? 0.22 : 0.08;
  if (nuisance < 0.2) return { blocked: false, surcharge: 0, note: '' };
  const homes = state.buildings.filter(b => b.type === 'apartment' && Math.hypot(b.x - x, b.y - y) < 8).length;
  const civic = (100 - city.qualityOfLife) / 100;
  const pressure = nuisance * Math.min(1, homes / 4) * (0.55 + civic * 0.6);
  if (pressure > 0.62) return { blocked: true, surcharge: 0, note: `Residents' association has blocked this application in ${city.name}.` };
  if (pressure > 0.2) return { blocked: false, surcharge: pressure * 0.4, note: `Planning objections add ${(pressure * 40).toFixed(0)}% in community concessions.` };
  return { blocked: false, surcharge: 0, note: '' };
}

// ════════════════════════════════════════════════════════════════════
// SUPPLY CONTRACTS — landed-cost sourcing with real pipelines
// ════════════════════════════════════════════════════════════════════
export function neededProducts(state: GameState, b: Building): string[] {
  if (b.type === 'factory') {
    const p = state.products.find(x => x.id === b.productId);
    return p ? p.inputs.map(i => i.productId) : [];
  }
  if (isHospitality(b.type)) {
    return (VENUE_INGREDIENTS[b.type] ?? [])
      .map(n => state.products.find(p => p.name === n)?.id)
      .filter((x): x is string => Boolean(x));
  }
  if (b.type === 'retail_store' || b.type === 'warehouse') return b.products;
  return [];
}

/** Quote every willing supplier on landed cost: price + freight − quality credit. */
export function getQuotes(state: GameState, buyer: Building, productId: string): SupplyQuote[] {
  const product = state.products.find(p => p.id === productId);
  if (!product) return [];
  const sameFormat = state.buildings.filter(b => b.companyId === buyer.companyId && b.type === buyer.type).length;
  const chainLeverage = sameFormat >= 10 ? 0.9 : sameFormat >= 5 ? 0.96 : 1;

  return state.buildings
    .filter(s => s.id !== buyer.id && s.isOperating && s.constructionEndsTick <= state.tick)
    .filter(s => isProducer(s.type) || s.type === 'warehouse' || s.type === 'seaport')
    .filter(s => s.products.includes(productId) || s.type === 'seaport')
    .filter(s => !s.internalSale || s.companyId === buyer.companyId)
    .map(s => {
      const dist = Math.max(1, Math.hypot(s.x - buyer.x, s.y - buyer.y));
      const fuel = dist * 0.05 * state.economy.dieselPrice;
      const wage = state.cities.find(c => c.id === s.cityId)?.wageRate ?? 15;
      const crossCity = s.cityId === buyer.cityId ? 1 : 1.28;
      const freightPerUnit = (fuel + (dist / 50) * wage) * crossCity / 42;
      const rel = buyer.supplierRelationships[s.id] ?? 0;
      const loyaltyDiscount = Math.min(0.15, rel / 100 * 0.15);
      const internal = s.companyId === buyer.companyId;

      let list: number;
      if (internal) {
        list = s.transferPricingMode === 'cost_basis' ? product.productionCost * 1.02
          : s.transferPricingMode === 'custom' ? product.productionCost * s.transferPriceMultiplier
          : product.currentPrice;
      } else if (s.type === 'seaport') {
        // Imports price off the world market plus FX and tariff pressure.
        list = product.currentPrice * 1.14 * importCostMultiplier(state);
      } else {
        list = product.currentPrice * (0.97 + s.staffSkill * 0.006) * s.sellPriceMultiplier;
      }
      const pricePerUnit = list * (internal ? 1 : (1 - loyaltyDiscount) * chainLeverage);
      const quality = s.type === 'mine' ? product.quality
        : Math.min(100, product.quality + s.staffSkill * 2 + (PRODUCT_TIERS.find(t => t.id === s.productTier)?.qualityBonus ?? 0));
      const prior = (state.contracts[buyer.id] ?? []).find(c => c.productId === productId && c.supplierBuildingId === s.id);
      return {
        supplierBuildingId: s.id, supplierName: s.name,
        supplierCompany: state.companies.find(c => c.id === s.companyId)?.name ?? 'State Terminal',
        productId, pricePerUnit, freightPerUnit,
        landedCost: pricePerUnit + freightPerUnit,
        quality, reliability: prior?.reliability ?? 75,
        availableStock: s.inventory[productId] ?? 0,
        distance: dist, internal, loyaltyDiscount,
      };
    })
    .sort((a, b) => (a.landedCost - a.quality * 0.06 - a.reliability * 0.01)
      - (b.landedCost - b.quality * 0.06 - b.reliability * 0.01));
}

export function signContract(state: GameState, buyerId: string, productId: string, supplierId: string) {
  const buyer = state.buildings.find(b => b.id === buyerId);
  if (!buyer) return;
  const q = getQuotes(state, buyer, productId).find(x => x.supplierBuildingId === supplierId);
  if (!q) return;
  const list = (state.contracts[buyerId] ?? []).filter(c => c.productId !== productId);
  list.push({
    id: uid('ct'), productId, supplierBuildingId: supplierId, supplierName: q.supplierName,
    pricePerUnit: q.pricePerUnit, freightPerUnit: q.freightPerUnit, quality: q.quality,
    reliability: q.reliability, deliveries: 0, onTime: 0,
    minimumOrder: Math.max(20, Math.round(buyer.inventoryCapacity * 0.08)),
    expiresTick: state.tick + 24 * 360, internal: q.internal,
  });
  state.contracts[buyerId] = list;
  buyer.supplyMode = 'manual';
  notify(state, `Signed a 12-month contract with ${q.supplierName} at ${money(q.landedCost)} landed per unit.`, 'success');
}

export function cancelContract(state: GameState, buyerId: string, contractId: string) {
  const buyer = state.buildings.find(b => b.id === buyerId);
  const co = state.companies.find(c => c.id === buyer?.companyId);
  const list = state.contracts[buyerId] ?? [];
  const ct = list.find(c => c.id === contractId);
  if (!buyer || !co || !ct) return;
  const fee = ct.minimumOrder * ct.pricePerUnit * 3;
  if (co.cash < fee) { notify(state, `Early termination fee is ${money(fee)}.`, 'warning'); return; }
  co.cash -= fee;
  state.contracts[buyerId] = list.filter(c => c.id !== contractId);
  notify(state, `Contract terminated for a ${money(fee)} break fee.`, 'info');
}

/** Places replenishment orders into the processing → transit pipeline. */
export function runProcurement(state: GameState, b: Building) {
  const owner = state.companies.find(c => c.id === b.companyId);
  const needs = neededProducts(state, b);
  if (!needs.length) return;
  const contracts = state.contracts[b.id] ?? [];

  for (const pid of needs) {
    const product = state.products.find(p => p.id === pid);
    if (!product) continue;
    // Orders are sized by the bullwhip model: each echelon forecasts, batches
    // and buffers, so upstream swings are larger than the shelf wobble.
    const echelon = echelonOf(b.type);
    const observed = b.type === 'factory'
      ? Math.max(1, b.capacity * 0.55)
      : Math.max(1, b.customerTraffic / 14 * 24);
    const target = bullwhipOrderQuantity(b, observed, echelon) / Math.max(1, needs.length);
    const perLine = Math.min(b.inventoryCapacity, Math.max(b.inventoryCapacity * 0.25, target));
    const have = b.inventory[pid] ?? 0;
    if (have > perLine * 0.38) continue;
    if (state.pipeline.some(o => o.toBuildingId === b.id && o.productId === pid)) continue;

    let ct = contracts.find(c => c.productId === pid);
    if (ct && ct.expiresTick < state.tick) { ct = undefined; }
    if (!ct) {
      if (b.supplyMode === 'manual') { b.supplyDisrupted = true; continue; }
      const best = getQuotes(state, b, pid).find(q => q.availableStock > 20);
      if (!best) { b.supplyDisrupted = true; continue; }
      ct = {
        id: uid('ct'), productId: pid, supplierBuildingId: best.supplierBuildingId,
        supplierName: best.supplierName, pricePerUnit: best.pricePerUnit,
        freightPerUnit: best.freightPerUnit, quality: best.quality, reliability: 75,
        deliveries: 0, onTime: 0, minimumOrder: Math.max(20, Math.round(b.inventoryCapacity * 0.08)),
        expiresTick: state.tick + 24 * 360, internal: best.internal,
      };
      state.contracts[b.id] = [...(state.contracts[b.id] ?? []).filter(c => c.productId !== pid), ct];
    }

    const src = state.buildings.find(x => x.id === ct!.supplierBuildingId);
    if (!src) { b.supplyDisrupted = true; continue; }
    const want = Math.round(perLine * 0.6 - have);
    const qty = Math.min(want, src.inventory[pid] ?? 0);
    if (qty < ct.minimumOrder * 0.4) {
      ct.reliability = Math.max(0, ct.reliability - 4);
      b.supplyDisrupted = true;
      continue;
    }
    const goods = qty * ct.pricePerUnit;
    const freight = qty * ct.freightPerUnit;
    if (owner && !ct.internal && owner.cash < 0) continue;

    src.inventory[pid] = Math.max(0, (src.inventory[pid] ?? 0) - qty);
    b.supplierRelationships[src.id] = Math.min(100, (b.supplierRelationships[src.id] ?? 0) + 4);
    if (owner && !ct.internal) {
      owner.cash -= freight;
      if (src.type !== 'seaport') {
        const seller = state.companies.find(c => c.id === src.companyId);
        if (seller && seller.id !== owner.id) { seller.cash += goods; seller.revenueAccum += goods; }
      }
    }
    ct.deliveries++;
    b.supplyDisrupted = false;

    const perishable = product.kind === 'farm';
    const processing = perishable ? 30 : product.kind === 'semi' ? 16 : 8;
    const transit = Math.max(2, Math.ceil(ct.freightPerUnit > 0 ? Math.hypot(src.x - b.x, src.y - b.y) * 1.1 : 4));
    state.pipeline.push({
      id: uid('po'), fromBuildingId: src.id, toBuildingId: b.id, productId: pid, amount: qty,
      processingHoursLeft: processing, transitHoursLeft: transit, totalHours: processing + transit,
      perishable, unitCost: ct.pricePerUnit + ct.freightPerUnit, freightCost: freight,
      internal: ct.internal, fromX: src.x, fromY: src.y, toX: b.x, toY: b.y,
      companyColor: owner?.color ?? '#94a3b8',
    });
    break;
  }
}

/** Advances processing, then cold-chain transit; applies QA rejection and spoilage. */
export function simulatePipeline(state: GameState) {
  const done = new Set<string>();
  for (const o of state.pipeline) {
    if (o.processingHoursLeft > 0) { o.processingHoursLeft--; continue; }
    if (o.transitHoursLeft > 0) { o.transitHoursLeft--; continue; }
    done.add(o.id);
    const buyer = state.buildings.find(b => b.id === o.toBuildingId);
    if (!buyer) continue;
    const ct = (state.contracts[buyer.id] ?? []).find(c => c.productId === o.productId);

    let rejected = 0;
    if (ct && ct.quality < 55 && Math.random() < (55 - ct.quality) * 0.006) {
      rejected = Math.round(o.amount * (0.08 + Math.random() * 0.14));
      ct.reliability = Math.max(0, ct.reliability - 7);
    }
    let spoiled = 0;
    if (o.perishable && o.totalHours > 84) {
      const rate = Math.min(0.45, 0.08 + (o.totalHours - 84) * 0.004);
      spoiled = Math.round((o.amount - rejected) * rate);
      buyer.spoilageYTD += spoiled * o.unitCost;
    }
    const accepted = Math.max(0, o.amount - rejected - spoiled);
    buyer.inventory[o.productId] = Math.min(buyer.inventoryCapacity, (buyer.inventory[o.productId] ?? 0) + accepted);
    if (ct) { ct.onTime++; ct.reliability = Math.min(100, ct.reliability + 1.5); }

    if ((rejected > 0 || spoiled > 0) && buyer.companyId === state.playerCompanyId) {
      const p = state.products.find(x => x.id === o.productId);
      notify(state, `${buyer.name}: ${accepted.toLocaleString()} ${p?.name ?? 'units'} accepted`
        + (rejected ? `, ${rejected} rejected on spec` : '')
        + (spoiled ? `, ${spoiled} spoiled in ${o.totalHours}h transit` : '') + '.', 'warning');
    }
  }
  if (done.size) state.pipeline = state.pipeline.filter(o => !done.has(o.id));
  if (state.pipeline.length > 300) state.pipeline.splice(0, state.pipeline.length - 300);
}

// ════════════════════════════════════════════════════════════════════
// AI BEHAVIOURS: counter-intelligence, tiering, relationship decay
// ════════════════════════════════════════════════════════════════════
/**
 * Prices are public information. A sharp rival watches what you charge and
 * reciprocates when you are running hot — this removes the one-way undercut
 * exploit where the player could always win on price with no response.
 */
export function simulateAIBehaviours(state: GameState) {
  for (const co of state.companies) {
    if (co.isPlayer) continue;
    const mine = state.buildings.filter(b => b.companyId === co.id);

    for (const b of mine) {
      // Margin-focused boards move farms up the value chain.
      if (b.type === 'farm' && co.acumen >= 0.6 && b.productTier === 'standard'
        && co.cash > 600_000 && Math.random() < 0.15) {
        const tier = co.acumen >= 0.85 ? 'organic' : 'premium';
        const def = PRODUCT_TIERS.find(t => t.id === tier)!;
        if (co.cash > def.cert * 2) { co.cash -= def.cert; b.productTier = tier; }
      }

      // Counter-intelligence: undercut a player store that is running hot.
      if (co.acumen < 0.55) continue;
      if (b.type !== 'retail_store' && !isHospitality(b.type)) continue;
      const rival = state.buildings.find(pb =>
        pb.companyId === state.playerCompanyId && pb.cityId === b.cityId
        && pb.type === b.type && pb.utilization > 78);
      if (rival && b.pricingMultiplier > rival.pricingMultiplier * 1.02) {
        b.pricingMultiplier = Math.max(0.72, rival.pricingMultiplier * (1 - co.acumen * 0.06));
      }
    }
  }

  // B2B goodwill is not permanent: relationships fade without repeat orders.
  for (const b of state.buildings) {
    for (const id of Object.keys(b.supplierRelationships)) {
      b.supplierRelationships[id] = Math.max(0, b.supplierRelationships[id] - 2);
      if (b.supplierRelationships[id] === 0) delete b.supplierRelationships[id];
    }
  }
}

/** Re-source a stranded site: drop contracts and re-tender at lowest landed cost. */
export function autoSource(state: GameState, buildingId: string) {
  const b = state.buildings.find(x => x.id === buildingId);
  if (!b) return;
  b.supplyDisrupted = false;
  state.contracts[b.id] = [];
  const prevMode = b.supplyMode;
  b.supplyMode = 'auto';
  runProcurement(state, b);
  b.supplyMode = prevMode;
  const signed = (state.contracts[b.id] ?? []).length;
  notify(state, signed > 0
    ? `${b.name} re-sourced to the lowest landed-cost suppliers (${signed} contract${signed > 1 ? 's' : ''}).`
    : `${b.name} could not be re-sourced — no supplier in the country has stock.`,
    signed > 0 ? 'success' : 'warning');
}

// ════════════════════════════════════════════════════════════════════
// POLITICAL ECONOMY
// ════════════════════════════════════════════════════════════════════
export function simulatePolitics(state: GameState) {
  const pol = state.politics, eco = state.economy;
  const total = Math.max(1, state.buildings.length);
  const industrial = state.buildings.filter(b => b.type === 'factory' || b.type === 'mine').length;
  pol.industryLobby = Math.max(0, Math.min(1, pol.industryLobby * 0.94 + (industrial / total) * 0.5));
  pol.greenLobby = Math.max(0, Math.min(1, pol.greenLobby * 0.94 + Math.max(0, eco.co2Stock - 370) / 700));

  pol.approval = Math.max(5, Math.min(95, pol.approval
    + (eco.gdpGrowth - 1.5) * 0.4 - (eco.inflation - 2.5) * 0.85 - (eco.unemployment - 5) * 0.6
    + (Math.random() - 0.5) * 1.5));

  eco.carbonTaxPerUnit = Math.max(0, eco.carbonTaxPerUnit
    + pol.greenLobby * 0.012 - pol.industryLobby * 0.009);

  if (state.year >= pol.nextElectionYear && state.month === 11) {
    pol.nextElectionYear += 4;
    const roll = Math.random() * 100;
    pol.rulingParty = roll < pol.approval * 0.55 ? 'centrist' : roll < pol.approval * 0.55 + 32 ? 'progressive' : 'libertarian';
    if (pol.rulingParty === 'progressive') {
      eco.corporateTaxRate = Math.min(38, eco.corporateTaxRate + 3);
      eco.carbonTaxPerUnit += 0.3;
      eco.minimumWage = Math.min(24, eco.minimumWage * 1.18);
      pol.antitrustThreshold = Math.max(30, pol.antitrustThreshold - 5);
    } else if (pol.rulingParty === 'libertarian') {
      eco.corporateTaxRate = Math.max(12, eco.corporateTaxRate - 3);
      eco.carbonTaxPerUnit = Math.max(0, eco.carbonTaxPerUnit - 0.3);
      eco.propertyTaxRate = Math.max(0.005, eco.propertyTaxRate - 0.002);
      pol.antitrustThreshold = Math.min(62, pol.antitrustThreshold + 6);
    }
    news(state, `ELECTION: ${pol.rulingParty.toUpperCase()} government wins on ${pol.approval.toFixed(0)}% approval — corporate tax now ${eco.corporateTaxRate.toFixed(0)}%`, 'breaking');
    notify(state, `A ${pol.rulingParty} government takes office. Tax and regulatory settings have shifted.`, 'warning');
  }
}

// ════════════════════════════════════════════════════════════════════
// BANKING & MINSKY DYNAMICS
// ════════════════════════════════════════════════════════════════════
export function simulateBanking(state: GameState) {
  const eco = state.economy;
  const totalDebt = state.companies.reduce((s, c) => s + c.debt, 0);
  const debtGdp = totalDebt / Math.max(1, eco.nominalGdp);
  const defaults = state.companies.filter(c => c.monthsInDistress > 2).reduce((s, c) => s + c.debt * 0.02, 0);
  eco.loanLossProvisions = eco.loanLossProvisions * 0.9 + defaults;
  eco.bankCapitalAdequacy = Math.max(0.02, Math.min(0.2,
    eco.bankCapitalAdequacy + (0.12 - eco.bankCapitalAdequacy) * 0.05 - defaults / Math.max(1, eco.nominalGdp) * 3));

  if (debtGdp > 1.4 && eco.bankCapitalAdequacy < 0.085 && eco.creditTightness < 0.4 && Math.random() < 0.07) {
    eco.creditTightness = 0.85;
    news(state, `MINSKY MOMENT: debt at ${debtGdp.toFixed(1)}× GDP with thin bank capital — credit markets freeze`, 'breaking');
    notify(state, 'Credit crunch: banks have stopped lending and asset values are falling.', 'danger');
  }
  eco.creditTightness = Math.max(0, eco.creditTightness - 0.045);
}

export function simulateHouseholds(state: GameState) {
  const recession = state.economy.cycle === 'recession';
  for (const c of state.cities) {
    if (recession) {
      c.qualityOfLife = Math.max(12, c.qualityOfLife - 0.15);
      c.discretionary.low *= 0.985;
      c.discretionary.middle *= 0.99;
      c.discretionary.affluent *= 0.995;
    }
  }
}

export function simulateEnvironment(state: GameState) {
  const eco = state.economy;
  let emissions = 0;
  for (const b of state.buildings) {
    if (!b.isOperating || !isProducer(b.type)) continue;
    emissions += b.dailyProduced * (b.type === 'mine' ? 1.4 : b.type === 'factory' ? 1.1 : 0.35);
  }
  eco.co2Stock = Math.min(1000, eco.co2Stock + emissions * 0.0000025 - 0.02);
  if (eco.co2Stock > 425) eco.gdpGrowth = Math.max(-6, eco.gdpGrowth - (eco.co2Stock - 425) * 0.00006);
}

// ════════════════════════════════════════════════════════════════════
// LABOUR RELATIONS
// ════════════════════════════════════════════════════════════════════
export function simulateLabour(state: GameState) {
  for (const b of state.buildings) {
    if (b.companyId === 'system' || b.constructionEndsTick > state.tick) continue;
    const city = state.cities.find(c => c.id === b.cityId);
    if (!city) continue;
    const belowMarket = b.wagePerEmployee < city.wageRate * 2080 * 0.95;

    if (!b.unionized && b.employees > 18 && (isProducer(b.type) || b.type === 'warehouse')) {
      const prob = 0.02 * (1 + (b.morale < 45 ? 1.5 : 0)) * (belowMarket ? 1.8 : 1);
      if (Math.random() < prob) {
        b.unionized = true;
        b.unionWagePremium = 0.08 + Math.random() * 0.08;
        b.wagePerEmployee *= 1 + b.unionWagePremium;
        if (b.companyId === state.playerCompanyId) {
          notify(state, `Workers at ${b.name} have unionised. Wages up ${(b.unionWagePremium * 100).toFixed(0)}%.`, 'warning');
        }
        news(state, `Workforce at ${b.name} votes to unionise`, 'info');
      }
    }
    if (b.unionized && b.morale < 34 && b.strikeTicks <= 0 && Math.random() < 0.16) {
      b.strikeTicks = 24 * (4 + Math.floor(Math.random() * 6));
      if (b.companyId === state.playerCompanyId) {
        notify(state, `STRIKE at ${b.name}. Output halted until conditions improve.`, 'danger');
      }
      news(state, `Strike halts production at ${b.name}`, 'warning');
    }
  }
}

// ════════════════════════════════════════════════════════════════════
// EQUITY & CORPORATE CONTROL
// ════════════════════════════════════════════════════════════════════
export function buyShares(state: GameState, companyId: string, shares: number) {
  const p = state.companies.find(c => c.id === state.playerCompanyId)!;
  const t = state.companies.find(c => c.id === companyId);
  if (!t || t.isPlayer || shares <= 0) return;
  // Impact is charged on the execution price, never applied only afterwards —
  // otherwise buying a block and immediately selling it would return more
  // than it cost, which is a risk-free money printer.
  const impact = Math.min(0.25, (shares / Math.max(1, t.sharesOutstanding)) * 0.5);
  const execPrice = t.sharePrice * (1 + impact);
  const cost = shares * execPrice * 1.005;
  if (p.cash < cost) { notify(state, `Need ${money(cost)} for that block.`, 'danger'); return; }
  const held = p.equityHoldings[companyId] ?? 0;
  const float = Math.max(0, t.sharesOutstanding - t.founderShares);
  if (held + shares > float) { notify(state, `Only ${(float - held).toLocaleString()} shares are in public float.`, 'warning'); return; }
  p.cash -= cost;
  p.equityHoldings[companyId] = held + shares;
  p.equityCostBasis[companyId] = (p.equityCostBasis[companyId] ?? 0) + cost;
  t.sharePrice *= 1 + impact * 0.6;
  t.marketCap = t.sharePrice * t.sharesOutstanding;

  const stake = (p.equityHoldings[companyId] / t.sharesOutstanding) * 100;
  if (stake > 50) {
    for (const b of state.buildings.filter(x => x.companyId === t.id)) {
      b.companyId = p.id; p.buildings.push(b.id);
      const title = state.landHoldings.find(h => h.developedBuildingId === b.id);
      if (title) title.ownerId = p.id;
    }
    p.cash += t.cash * 0.9;
    t.buildings = []; t.cash *= 0.1;
    news(state, `${p.name} seizes majority control of ${t.name} in a hostile takeover`, 'breaking');
    notify(state, `You now control ${t.name} at ${stake.toFixed(0)}% — its assets are consolidated into your group.`, 'success');
    state.companies = state.companies.filter(c => c.id !== t.id);
    delete p.equityHoldings[companyId];
    delete p.equityCostBasis[companyId];
  } else {
    notify(state, `Bought ${shares.toLocaleString()} shares of ${t.name} — ${stake.toFixed(1)}% stake.`, 'success');
  }
}

export function sellShares(state: GameState, companyId: string, shares: number) {
  const p = state.companies.find(c => c.id === state.playerCompanyId)!;
  const t = state.companies.find(c => c.id === companyId);
  if (!t) return;
  const held = p.equityHoldings[companyId] ?? 0;
  const n = Math.min(shares, held);
  if (n <= 0) return;
  const impact = Math.min(0.25, (n / Math.max(1, t.sharesOutstanding)) * 0.5);
  const proceeds = n * t.sharePrice * (1 - impact) * 0.995;
  const basis = (p.equityCostBasis[companyId] ?? 0) * (n / held);
  const gain = proceeds - basis;
  p.cash += proceeds;
  p.equityHoldings[companyId] = held - n;
  p.equityCostBasis[companyId] = (p.equityCostBasis[companyId] ?? 0) - basis;
  if (p.equityHoldings[companyId] <= 0) { delete p.equityHoldings[companyId]; delete p.equityCostBasis[companyId]; }
  if (gain > 0) { const tax = gain * state.economy.capitalGainsRate / 100; p.cash -= tax; p.taxesPaidYTD += tax; }
  else p.lossCarryforward += -gain;
  t.sharePrice *= 1 - impact * 0.6;
  t.marketCap = t.sharePrice * t.sharesOutstanding;
  notify(state, `Sold ${n.toLocaleString()} shares for ${money(proceeds)} (${gain >= 0 ? 'gain' : 'loss'} ${money(Math.abs(gain))}).`, 'info');
}

export function issueShares(state: GameState, shares: number) {
  const p = state.companies.find(c => c.id === state.playerCompanyId)!;
  if (shares <= 0) return;
  if (p.shareIssuanceYear !== state.year) { p.shareIssuanceYear = state.year; p.sharesIssuedThisYear = 0; }
  const cap = Math.floor(p.sharesOutstanding * 0.2);
  const remaining = Math.max(0, cap - p.sharesIssuedThisYear);
  if (shares > remaining) {
    notify(state, `Annual dilution cap: you may issue ${remaining.toLocaleString()} more shares this year.`, 'warning');
    return;
  }
  const proceeds = shares * p.sharePrice * 0.96;
  const newCap = p.marketCap + proceeds;
  p.sharesOutstanding += shares;
  p.sharePrice = newCap / p.sharesOutstanding;
  p.marketCap = newCap;
  p.cash += proceeds;
  p.sharesIssuedThisYear += shares;
  notify(state, `Issued ${shares.toLocaleString()} shares raising ${money(proceeds)}. Price now $${p.sharePrice.toFixed(2)}.`, 'success');
  news(state, `${p.name} completes a secondary offering raising ${money(proceeds)}`, 'info');
}

// ════════════════════════════════════════════════════════════════════
// INTELLIGENCE
// ════════════════════════════════════════════════════════════════════
export function runEspionage(state: GameState, targetId: string) {
  const p = state.companies.find(c => c.id === state.playerCompanyId)!;
  const t = state.companies.find(c => c.id === targetId);
  if (!t || t.isPlayer) return;
  const cost = 150_000;
  if (p.cash < cost) { notify(state, `Industrial intelligence costs ${money(cost)}.`, 'danger'); return; }
  p.cash -= cost;
  if (Math.random() < 0.6) {
    t.costIntelUntilTick = state.tick + 24 * 180;
    notify(state, `Operation successful — ${t.name}'s books are open to you for six months.`, 'success');
  } else {
    const fine = Math.max(200_000, p.cash * 0.02);
    p.cash -= fine;
    news(state, `${p.name} caught running industrial espionage against ${t.name} — fined ${money(fine)}`, 'breaking');
    notify(state, `Operation blown. Regulators fined you ${money(fine)}.`, 'danger');
  }
}

export function buyMarketResearch(state: GameState, category: string) {
  const p = state.companies.find(c => c.id === state.playerCompanyId)!;
  const cost = 250_000;
  if (p.researchedCategories.includes(category)) return;
  if (p.cash < cost) { notify(state, `Market research costs ${money(cost)}.`, 'danger'); return; }
  p.cash -= cost;
  p.researchedCategories.push(category);
  notify(state, `${category} market research acquired — demand and rival pricing are now visible.`, 'success');
}

// ════════════════════════════════════════════════════════════════════
// FARM MANAGEMENT
// ════════════════════════════════════════════════════════════════════
export function setBreed(state: GameState, buildingId: string, breedId: string) {
  const f = state.buildings.find(b => b.id === buildingId);
  const p = state.companies.find(c => c.id === state.playerCompanyId)!;
  const breed = LIVESTOCK_BREEDS.find(b => b.id === breedId);
  if (!f || !breed || f.type !== 'farm' || f.companyId !== p.id) return;
  if (p.cash < breed.investment) { notify(state, `Introducing ${breed.name} needs ${money(breed.investment)}.`, 'danger'); return; }
  p.cash -= breed.investment;
  f.livestockBreed = breedId;
  const prod = state.products.find(x => x.name === breed.produces);
  if (prod) { f.productId = prod.id; f.products = [prod.id]; }
  notify(state, `${f.name} converted to ${breed.name}: yield ×${breed.yieldMul.toFixed(2)}, price ×${breed.priceMul.toFixed(2)}.`, 'success');
}

export function setTier(state: GameState, buildingId: string, tier: 'standard' | 'premium' | 'organic') {
  const f = state.buildings.find(b => b.id === buildingId);
  const p = state.companies.find(c => c.id === state.playerCompanyId)!;
  const def = PRODUCT_TIERS.find(t => t.id === tier);
  if (!f || !def || f.companyId !== p.id) return;
  if (p.cash < def.cert) { notify(state, `${def.label} certification costs ${money(def.cert)}.`, 'danger'); return; }
  p.cash -= def.cert;
  f.productTier = tier;
  notify(state, `${f.name} certified ${def.label}: +${def.qualityBonus} quality, ${((def.priceMul - 1) * 100).toFixed(0)}% price premium.`, 'success');
}

export function investFarm(state: GameState, buildingId: string, kind: 'technique' | 'equipment') {
  const f = state.buildings.find(b => b.id === buildingId);
  const p = state.companies.find(c => c.id === state.playerCompanyId)!;
  if (!f || f.type !== 'farm' || f.companyId !== p.id) return;
  const lvl = kind === 'technique' ? f.farmTechniqueLevel : f.farmEquipmentLevel;
  if (lvl >= 5) return;
  const cost = (kind === 'technique' ? 180_000 : 260_000) * Math.pow(lvl + 1, 1.5);
  if (p.cash < cost) { notify(state, `That investment needs ${money(cost)}.`, 'danger'); return; }
  p.cash -= cost;
  if (kind === 'technique') f.farmTechniqueLevel++; else f.farmEquipmentLevel++;
  notify(state, `${kind === 'technique' ? 'Agronomy' : 'Equipment'} upgraded to level ${lvl + 1} at ${f.name}.`, 'success');
}

/** Composite farm multipliers from breed, feed, vet, tier and capital investment. */
export function farmModifiers(b: Building, productName: string) {
  let yieldMul = 1, priceMul = 1, quality = 0, costMul = 1;
  const breed = LIVESTOCK_BREEDS.find(x => x.id === b.livestockBreed);
  if (breed && breed.produces === productName) {
    yieldMul *= breed.yieldMul; priceMul *= breed.priceMul;
    quality += breed.qualityBonus; costMul *= breed.costMul;
  }
  yieldMul *= 0.86 + b.feedQuality * 0.32;
  quality += b.feedQuality * 9;
  yieldMul *= 1 + b.vetProgram * 0.045;
  yieldMul *= 1 + b.farmTechniqueLevel * 0.08 + b.farmEquipmentLevel * 0.1;
  quality += b.farmTechniqueLevel * 4 + b.farmEquipmentLevel * 2.5;
  const tier = PRODUCT_TIERS.find(t => t.id === b.productTier);
  if (tier) { priceMul *= tier.priceMul; costMul *= tier.costMul; quality += tier.qualityBonus; yieldMul *= 2 - tier.costMul * 0.55; }
  return { yieldMul: Math.max(0.2, yieldMul), priceMul, quality, costMul };
}

// ════════════════════════════════════════════════════════════════════
// TENURE: LEASE & MORTGAGE
// ════════════════════════════════════════════════════════════════════
export function acquireBuilding(state: GameState, buildingId: string, financePct: number, termMonths = 120) {
  const b = state.buildings.find(x => x.id === buildingId);
  const p = state.companies.find(c => c.id === state.playerCompanyId)!;
  if (!b) return;
  if (b.type === 'seaport') { notify(state, 'Ports are state infrastructure — not for private sale.', 'warning'); return; }
  if (!b.forSale && b.companyId !== 'system') return;
  const price = b.askingPrice > 0 ? b.askingPrice : Math.round(b.fairValue);
  const fin = Math.max(0, Math.min(0.75, financePct));
  const down = price * (1 - fin);
  const financed = price * fin;
  if (p.cash < down) { notify(state, `Need ${money(down)} down (${((1 - fin) * 100).toFixed(0)}%) for ${b.name}.`, 'danger'); return; }
  if (financed > 0 && state.economy.creditTightness > 0.6) { notify(state, 'Credit crunch: no mortgage financing available right now.', 'danger'); return; }

  p.cash -= down;
  const seller = state.companies.find(c => c.id === b.companyId);
  if (seller && !seller.isPlayer) { seller.cash += price; seller.buildings = seller.buildings.filter(i => i !== b.id); }
  if (financed > 0) {
    const rate = state.economy.interestRate + 3;
    const mr = rate / 100 / 12;
    b.financingPayment = financed * mr / (1 - Math.pow(1 + mr, -termMonths));
    b.financingMonthsLeft = termMonths;
    p.debt += financed;
  }
  b.companyId = p.id; b.forSale = false; b.askingPrice = 0; b.isLeased = false;
  b.purchasePrice = price; b.employees = 0; b.supplyMode = 'manual';
  p.buildings.push(b.id);
  const title = state.landHoldings.find(h => h.developedBuildingId === b.id);
  if (title) title.ownerId = p.id;
  notify(state, financed > 0
    ? `Acquired ${b.name} for ${money(price)} — ${money(down)} down, ${money(b.financingPayment)}/mo mortgage.`
    : `Acquired ${b.name} for ${money(price)}.`, 'success');
}

export function leaseBuilding(state: GameState, buildingId: string) {
  const b = state.buildings.find(x => x.id === buildingId);
  const p = state.companies.find(c => c.id === state.playerCompanyId)!;
  if (!b || b.companyId !== 'system') return;
  if (!(b.type === 'retail_store' || b.type === 'office' || isHospitality(b.type))) {
    notify(state, 'Only retail, office and hospitality space can be leased.', 'warning');
    return;
  }
  const rent = b.fairValue * 0.009;
  const deposit = rent * 3;
  if (p.cash < deposit) { notify(state, `Lease requires a ${money(deposit)} deposit.`, 'danger'); return; }
  p.cash -= deposit;
  b.companyId = p.id; b.isLeased = true; b.financingPayment = rent; b.financingMonthsLeft = 60;
  b.forSale = false; b.employees = 0; b.supplyMode = 'manual';
  p.buildings.push(b.id);
  notify(state, `Leased ${b.name} at ${money(rent)}/mo on a five-year term. No resale value.`, 'success');
}

/** Monthly mortgage/lease servicing; expiry reverts leased space to the landlord. */
export function serviceTenure(state: GameState) {
  for (const b of state.buildings) {
    if (b.financingPayment <= 0 || b.financingMonthsLeft <= 0) continue;
    const owner = state.companies.find(c => c.id === b.companyId);
    if (owner) {
      owner.cash -= b.financingPayment;
      if (!b.isLeased) owner.debt = Math.max(0, owner.debt - b.financingPayment * 0.55);
    }
    b.financingMonthsLeft--;
    if (b.financingMonthsLeft <= 0) {
      if (b.isLeased) {
        if (owner) owner.buildings = owner.buildings.filter(i => i !== b.id);
        b.companyId = 'system'; b.isLeased = false; b.financingPayment = 0;
        if (owner?.isPlayer) notify(state, `Your lease on ${b.name} expired and reverted to the landlord.`, 'warning');
      } else {
        b.financingPayment = 0;
        if (owner?.isPlayer) notify(state, `Mortgage on ${b.name} is fully repaid.`, 'success');
      }
    }
  }
}

// ════════════════════════════════════════════════════════════════════
// NEGOTIATION — buy assets that are NOT listed
// ════════════════════════════════════════════════════════════════════
export function makeOffer(state: GameState, buildingId: string, amount: number) {
  const b = state.buildings.find(x => x.id === buildingId);
  const p = state.companies.find(c => c.id === state.playerCompanyId)!;
  if (!b) return;
  const seller = state.companies.find(c => c.id === b.companyId);
  const sellerName = seller?.name ?? 'the institutional owner';
  if (b.companyId === p.id) return;

  if (state.tick < b.negotiationBlockedUntil) {
    const months = Math.ceil((b.negotiationBlockedUntil - state.tick) / 720);
    state.negotiation = { buildingId, status: 'rejected', offerAmount: amount, counterAmount: b.fairValue, sellerName,
      message: `${sellerName} broke off talks. Their board won't revisit for ${months} month(s).` };
    return;
  }
  const greed = seller ? (seller.strategy === 'aggressive' ? 1.22 : seller.strategy === 'conservative' ? 1.02 : 1.12) : 1.05;
  const liquidity = seller && seller.cash < 3_000_000 ? 0.88 : 1;
  const ask = Math.round(b.fairValue * greed * liquidity);

  if (p.cash < amount) {
    state.negotiation = { buildingId, status: 'rejected', offerAmount: amount, counterAmount: ask, sellerName,
      message: 'You do not have the cash to fund that offer.' };
    return;
  }
  if (amount < ask * 0.58) {
    b.negotiationBlockedUntil = state.tick + 720 * 3;
    b.offersMade = 0;
    state.negotiation = { buildingId, status: 'rejected', offerAmount: amount, counterAmount: ask, sellerName,
      message: `${sellerName} considers ${money(amount)} insulting for an asset they value at ${money(ask)}. Talks closed for three months.` };
    return;
  }
  if (amount >= ask) {
    p.cash -= amount;
    if (seller) { seller.cash += amount; seller.buildings = seller.buildings.filter(i => i !== b.id); }
    b.companyId = p.id; b.purchasePrice = amount; b.offersMade = 0; b.employees = 0; b.supplyMode = 'manual';
    p.buildings.push(b.id);
    const title = state.landHoldings.find(h => h.developedBuildingId === b.id);
    if (title) title.ownerId = p.id;
    state.negotiation = { buildingId, status: 'accepted', offerAmount: amount, counterAmount: 0, sellerName,
      message: `${sellerName} accepted ${money(amount)} for ${b.name}.` };
    news(state, `${p.name} acquires ${b.name} from ${sellerName}`, 'breaking');
    return;
  }
  b.offersMade++;
  if (b.offersMade >= 3) {
    b.negotiationBlockedUntil = state.tick + 720 * 3;
    b.offersMade = 0;
    state.negotiation = { buildingId, status: 'rejected', offerAmount: amount, counterAmount: ask, sellerName,
      message: `${sellerName} has ended negotiations. Talks resume in three months.` };
    return;
  }
  const counter = Math.round((ask + amount) / 2 + ask * 0.06);
  state.negotiation = { buildingId, status: 'counter', offerAmount: amount, counterAmount: counter, sellerName,
    message: `${sellerName} rejects ${money(amount)} but would consider ${money(counter)}. (${3 - b.offersMade} attempts left)` };
}

// ════════════════════════════════════════════════════════════════════
// ANTITRUST
// ════════════════════════════════════════════════════════════════════
export function simulateAntitrust(state: GameState) {
  const p = state.companies.find(c => c.id === state.playerCompanyId)!;
  const total = state.buildings.filter(b => b.companyId !== 'system').length;
  if (total < 20) return;
  const mine = state.buildings.filter(b => b.companyId === p.id).length;
  const share = (mine / total) * 100;
  if (share > state.politics.antitrustThreshold) {
    const fine = Math.max(1_000_000, p.marketCap * 0.02);
    p.cash -= fine;
    notify(state, `Antitrust penalty: you control ${share.toFixed(0)}% of the market. Fined ${money(fine)}.`, 'danger');
    news(state, `Regulators fine ${p.name} ${money(fine)} over market dominance`, 'breaking');
  }
}

export { isProperty, BUILDING_CONFIGS };
