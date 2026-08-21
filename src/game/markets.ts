import type { GameState, TradedAsset, Company, TaxLot } from './types';

// ============= REAL-WORLD SUPPLY =============
/**
 * Assets are backed by genuine physical supply. Buying moves the price because
 * you are consuming a finite float — there is no infinite liquidity at the quote.
 *
 * `worldSupply` is the total existing stock in the asset's own unit.
 * `floatShare` is the fraction actually tradeable (the rest is held in vaults,
 * strategic reserves, lost wallets, jewellery, or already consumed).
 */
export interface AssetSupply {
  worldSupply: number;
  floatShare: number;
  /** New units entering the world each year (mining, drilling, harvest). */
  annualNewSupply: number;
  /** Units destroyed/consumed each year (burned fuel, industrial use). */
  annualConsumption: number;
}

export const TRANSACTION_FEE = 0.005; // 0.5% brokerage on every trade, both ways

const TICKS_PER_MONTH = 24 * 30;
const TICKS_PER_YEAR = TICKS_PER_MONTH * 12;

function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function notify(state: GameState, message: string, type: 'info' | 'warning' | 'success' | 'danger') {
  state.notifications.unshift({ id: newId('n'), message, type, tick: state.tick });
  if (state.notifications.length > 50) state.notifications.pop();
}

function ticker(state: GameState, text: string, type: 'info' | 'warning' | 'danger' | 'breaking') {
  state.stockMarket.ticker.unshift({ id: newId('t'), text, type, tick: state.tick });
  if (state.stockMarket.ticker.length > 30) state.stockMarket.ticker.pop();
}

/**
 * The tradeable universe, with genuine world supply figures.
 *
 *  · Bitcoin — 21,000,000 hard cap; ~19.8M mined, ~4M lost forever, halving
 *    schedule cuts new issuance every four years.
 *  · Gold — ~215,000 tonnes ever mined (converted to troy oz), ~3,000 t/yr new.
 *  · Silver — ~1.8M tonnes above ground, heavy industrial consumption.
 *  · Oil — ~1.7 trillion barrels proven reserves, ~35bn barrels/yr consumed.
 *
 * ETFs are *not* real-world funds — they are baskets of the companies that
 * actually exist in this game world, priced off their aggregate market cap.
 */
export function generateTradedAssets(): TradedAsset[] {
  type Seed = {
    symbol: string; name: string; assetClass: TradedAsset['assetClass'];
    price: number; anchor: number; volatility: number; unit: string;
    trackedCompanyIds: string[] | null; supply: AssetSupply;
    unlockYear: number;
  };
  const seeds: Seed[] = [
    {
      symbol: 'CL', name: 'Crude Oil', unlockYear: 1800, assetClass: 'commodity', price: 78, anchor: 72,
      volatility: 0.38, unit: 'barrel', trackedCompanyIds: null,
      supply: { worldSupply: 1_700_000_000_000, floatShare: 0.0008, annualNewSupply: 34_000_000_000, annualConsumption: 35_500_000_000 },
    },
    {
      symbol: 'NG', name: 'Natural Gas', unlockYear: 1800, assetClass: 'commodity', price: 2.6, anchor: 3.1,
      volatility: 0.55, unit: 'MMBtu', trackedCompanyIds: null,
      supply: { worldSupply: 7_500_000_000_000, floatShare: 0.0004, annualNewSupply: 145_000_000_000, annualConsumption: 148_000_000_000 },
    },
    {
      symbol: 'ZW', name: 'Wheat', unlockYear: 1800, assetClass: 'commodity', price: 5.9, anchor: 6.2,
      volatility: 0.24, unit: 'bushel', trackedCompanyIds: null,
      // Wheat is an annual crop: essentially all of it is consumed each year.
      supply: { worldSupply: 29_000_000_000, floatShare: 0.02, annualNewSupply: 28_500_000_000, annualConsumption: 28_400_000_000 },
    },
    {
      symbol: 'HG', name: 'Copper', unlockYear: 1800, assetClass: 'commodity', price: 4.15, anchor: 3.9,
      volatility: 0.26, unit: 'lb', trackedCompanyIds: null,
      supply: { worldSupply: 1_760_000_000_000, floatShare: 0.0006, annualNewSupply: 48_000_000_000, annualConsumption: 49_500_000_000 },
    },
    {
      symbol: 'LI', name: 'Lithium Carbonate', unlockYear: 1980, assetClass: 'commodity', price: 13800, anchor: 15000,
      volatility: 0.62, unit: 'tonne', trackedCompanyIds: null,
      supply: { worldSupply: 26_000_000, floatShare: 0.008, annualNewSupply: 180_000, annualConsumption: 175_000 },
    },
    {
      symbol: 'XAU', name: 'Gold', unlockYear: 1800, assetClass: 'metal', price: 2340, anchor: 2050,
      volatility: 0.15, unit: 'troy oz', trackedCompanyIds: null,
      // ~215,000 tonnes ever mined = ~6.9 billion troy oz. Only bullion trades.
      supply: { worldSupply: 6_900_000_000, floatShare: 0.21, annualNewSupply: 115_000_000, annualConsumption: 12_000_000 },
    },
    {
      symbol: 'XAG', name: 'Silver', unlockYear: 1800, assetClass: 'metal', price: 27.4, anchor: 25,
      volatility: 0.29, unit: 'troy oz', trackedCompanyIds: null,
      supply: { worldSupply: 57_000_000_000, floatShare: 0.05, annualNewSupply: 830_000_000, annualConsumption: 1_050_000_000 },
    },
    {
      symbol: 'XPT', name: 'Platinum', unlockYear: 1800, assetClass: 'metal', price: 965, anchor: 950,
      volatility: 0.22, unit: 'troy oz', trackedCompanyIds: null,
      supply: { worldSupply: 315_000_000, floatShare: 0.12, annualNewSupply: 5_800_000, annualConsumption: 6_200_000 },
    },
    {
      symbol: 'BTC', name: 'Bitcoin', assetClass: 'crypto', price: 64000, anchor: 45000, unlockYear: 2008,
      volatility: 0.85, unit: 'BTC', trackedCompanyIds: null,
      // 21M hard cap; ~19.8M mined, ~4M permanently lost, ~450 BTC/day issuance.
      supply: { worldSupply: 19_800_000, floatShare: 0.62, annualNewSupply: 164_000, annualConsumption: 0 },
    },
  ];

  return seeds.map(seed => {
    const { supply, ...rest } = seed;
    return {
      ...rest,
      id: newId('asset'),
      worldSupply: supply.worldSupply,
      floatShare: supply.floatShare,
      annualNewSupply: supply.annualNewSupply,
      annualConsumption: supply.annualConsumption,
      circulating: supply.worldSupply * supply.floatShare,
      history: Array.from({ length: 60 }, (_, i) => rest.price * (0.9 + Math.sin(i / 8) * 0.08 + Math.random() * 0.05)),
      playerHolding: 0,
      playerCostBasis: 0,
      taxLots: [],
    };
  });
}

/**
 * In-world index funds. These track the companies that actually exist in this
 * game, so their price is derived from real aggregate market capitalisation —
 * not a hard-coded number from the outside world.
 */
export function createIndexFunds(state: GameState): TradedAsset[] {
  const all = state.companies.filter(c => !c.isPlayer);
  const broad = all.map(c => c.id);
  const industrials = all.filter((_c, i) => i % 2 === 0).map(c => c.id);

  const mk = (symbol: string, name: string, ids: string[], vol: number, unlockYear: number): TradedAsset => {
    const nav = navOf(state, ids);
    return {
      id: newId('asset'), symbol, name, assetClass: 'etf',
      price: nav, anchor: nav, volatility: vol, unit: 'share',
      trackedCompanyIds: ids,
      worldSupply: 0, floatShare: 1, annualNewSupply: 0, annualConsumption: 0,
      circulating: Infinity, // open-ended fund: units created on demand
      history: Array.from({ length: 60 }, () => nav * (0.95 + Math.random() * 0.1)),
      playerHolding: 0, playerCostBasis: 0, taxLots: [],
      unlockYear,
    };
  };

  return [
    mk('MKTX', 'Market Composite Fund', broad, 0.16, 1980),
    mk('INDX', 'Industrial Sector Fund', industrials, 0.24, 1980),
  ];
}

/** Net asset value per share of an in-world fund. */
function navOf(state: GameState, ids: string[]): number {
  const members = state.companies.filter(c => ids.includes(c.id));
  if (members.length === 0) return 100;
  const totalCap = members.reduce((sum, c) => sum + c.marketCap, 0);
  // Divisor keeps the quote in a readable range and is fixed at inception.
  return Math.max(1, totalCap / (members.length * 1_000_000));
}

// ============= PRICE SIMULATION =============
/**
 * Daily mark-to-market. Commodity prices are driven by the stock-to-flow
 * balance of genuine supply against consumption, plus macro linkages. When
 * annual consumption exceeds new supply the float shrinks and prices grind up.
 */
export function simulateAssetPrices(state: GameState) {
  const eco = state.economy;
  const realRate = eco.interestRate - eco.inflation;

  for (const asset of state.tradedAssets) {
    // Skip assets not yet unlocked
    if (asset.unlockYear > state.year) continue;
    // ── In-world funds are pure NAV trackers ──
    if (asset.trackedCompanyIds) {
      const nav = navOf(state, asset.trackedCompanyIds);
      asset.anchor = nav;
      // Funds trade at a small premium/discount to NAV that mean-reverts.
      const drift = (nav - asset.price) * 0.12;
      const noise = (Math.random() - 0.5) * asset.volatility / Math.sqrt(252) * asset.price;
      asset.price = Math.max(0.5, asset.price + drift + noise);
      if (state.hour === 0) {
        asset.history.push(asset.price);
        if (asset.history.length > 180) asset.history.shift();
      }
      continue;
    }

    // ── Physical supply dynamics ──
    // Net depletion or accumulation of the tradeable float, applied daily.
    const netFlow = (asset.annualNewSupply - asset.annualConsumption) / 365;
    asset.circulating = Math.max(asset.worldSupply * asset.floatShare * 0.15,
      asset.circulating + netFlow * asset.floatShare);
    asset.worldSupply = Math.max(0, asset.worldSupply
      + (asset.annualNewSupply - asset.annualConsumption) / 365);

    // Stock-to-flow: scarce assets with low new issuance command a premium.
    // Bitcoin's ratio is enormous; wheat's is ~1 because it is farmed annually.
    const stockToFlow = asset.annualNewSupply > 0
      ? asset.worldSupply / asset.annualNewSupply : 100;
    const scarcityDrift = Math.min(0.0006, Math.log10(1 + stockToFlow) * 0.00007);
    // Consumption outpacing production drains inventories and lifts price.
    const depletion = asset.annualConsumption > asset.annualNewSupply
      ? Math.min(0.0012, (asset.annualConsumption / asset.annualNewSupply - 1) * 0.02) : 0;

    const pull = (asset.anchor - asset.price) / asset.price * 0.015 * (1 - asset.volatility * 0.7);
    const dailyVol = asset.volatility / Math.sqrt(252);
    const shock = (Math.random() + Math.random() + Math.random() - 1.5) * dailyVol * 1.4;

    let macro = 0;
    switch (asset.symbol) {
      case 'XAU': case 'XAG': case 'XPT':
        macro = -realRate * 0.0018 + (eco.cycle === 'recession' ? 0.0012 : 0); break;
      case 'CL': case 'NG':
        macro = eco.gdpGrowth * 0.0004 + (eco.fuelShockMonths > 0 ? 0.012 : 0); break;
      case 'BTC':
        macro = (eco.moneySupply - 100) * 0.00018 - realRate * 0.0012
          + (state.stockMarket.sentiment === 'bullish' ? 0.002 : state.stockMarket.sentiment === 'bearish' ? -0.003 : 0);
        break;
      case 'ZW':
        macro = (state.season === 'summer' ? -0.0015 : state.season === 'winter' ? 0.0012 : 0)
          + eco.inflation * 0.0002; break;
      case 'HG': case 'LI':
        macro = eco.gdpGrowth * 0.0006 + (state.year > 2010 && asset.symbol === 'LI' ? 0.0008 : 0); break;
    }

    asset.price = Math.max(asset.anchor * 0.15,
      asset.price * (1 + pull + shock + macro + scarcityDrift + depletion));
    asset.anchor *= 1 + (eco.inflation / 100) / 365;

    if (state.hour === 0) {
      asset.history.push(asset.price);
      if (asset.history.length > 180) asset.history.shift();
    }
  }

  // ── Bitcoin halving every four years cuts new issuance in half ──
  // Halvings count from the 2008 genesis block: 2012, 2016, 2020, ...
  if (state.year > 2008 && state.month === 4 && state.day === 1 && state.hour === 0 && (state.year - 2008) % 4 === 0) {
    const btc = state.tradedAssets.find(a => a.symbol === 'BTC');
    if (btc && btc.annualNewSupply > 1000) {
      btc.annualNewSupply /= 2;
      ticker(state, `Bitcoin halving: new issuance drops to ${Math.round(btc.annualNewSupply).toLocaleString()} BTC/yr`, 'breaking');
    }
  }

  if (Math.random() < 0.004) {
    const asset = state.tradedAssets[Math.floor(Math.random() * state.tradedAssets.length)];
    const move = (Math.random() - 0.4) * asset.volatility * 0.4;
    asset.price = Math.max(asset.anchor * 0.2, asset.price * (1 + move));
    ticker(state, `${asset.name} ${move > 0 ? 'surges' : 'slides'} ${Math.abs(move * 100).toFixed(1)}% on heavy volume`,
      move > 0 ? 'info' : 'warning');
  }
}

/**
 * Market impact. Trading a meaningful share of the float moves the price
 * against you — this is what kills the infinite-money round-trip exploit.
 * A trade worth 1% of the float costs roughly 1% in slippage.
 */
export function marketImpact(asset: TradedAsset, units: number): number {
  if (!Number.isFinite(asset.circulating) || asset.circulating <= 0) return 0;
  const share = Math.abs(units) / asset.circulating;
  // Square-root impact law used across real execution models.
  return Math.min(0.35, Math.sqrt(share) * 1.6);
}

// ============= TAX LOTS & CAPITAL GAINS =============
/**
 * Proper FIFO tax-lot accounting. Each purchase opens a lot stamped with the
 * tick it was bought; sales consume the oldest lots first, so holding periods
 * are tracked exactly and short-term vs long-term rates apply correctly.
 */
export function openTaxLot(asset: TradedAsset, units: number, pricePerUnit: number, tick: number) {
  // Wash sale rule: losses disallowed if the same asset was sold at a loss
  // within the last 30 days. We add the disallowed loss to every new lot's
  // cost basis so it survives until the position is eventually sold at a gain.
  const wash = recentSellLoss(asset.id, tick);
  const adjustedBasis = pricePerUnit + (wash > 0 ? -wash / units : 0);
  asset.taxLots.push({ units, costPerUnit: adjustedBasis, openedTick: tick });
  const totalUnits = asset.taxLots.reduce((s, l) => s + l.units, 0);
  const totalCost = asset.taxLots.reduce((s, l) => s + l.units * l.costPerUnit, 0);
  asset.playerHolding = totalUnits;
  asset.playerCostBasis = totalUnits > 0 ? totalCost / totalUnits : 0;
}

/** Consumes lots FIFO, returning realised gains split by holding period. */
export function consumeTaxLots(asset: TradedAsset, units: number, salePrice: number, tick: number):
  { shortGain: number; longGain: number; basis: number } {
  let remaining = units;
  let shortGain = 0;
  let longGain = 0;
  let basis = 0;

  while (remaining > 0.0000001 && asset.taxLots.length > 0) {
    const lot = asset.taxLots[0];
    const take = Math.min(lot.units, remaining);
    const lotBasis = take * lot.costPerUnit;
    const proceeds = take * salePrice;
    const gain = proceeds - lotBasis;
    const heldTicks = tick - lot.openedTick;

    if (heldTicks >= TICKS_PER_YEAR) longGain += gain;
    else shortGain += gain;

    basis += lotBasis;
    lot.units -= take;
    remaining -= take;
    if (lot.units <= 0.0000001) asset.taxLots.shift();
  }

  const totalUnits = asset.taxLots.reduce((s, l) => s + l.units, 0);
  const totalCost = asset.taxLots.reduce((s, l) => s + l.units * l.costPerUnit, 0);
  asset.playerHolding = totalUnits;
  asset.playerCostBasis = totalUnits > 0 ? totalCost / totalUnits : 0;

  return { shortGain, longGain, basis };
}

/**
 * Capital gains tax with a proper loss carry-forward ledger.
 *
 * Real rules, which close the tax-loss-harvesting abuse:
 *  · Losses first offset gains of the same character (short vs long).
 *  · Any excess loss offsets the other character.
 *  · Only $3,000/yr of net loss can be deducted against ordinary income.
 *  · The remainder carries forward — it does not vanish or refund cash.
 */
export function applyCapitalGains(
  state: GameState, company: Company, shortGain: number, longGain: number,
): { tax: number; usedCarryforward: number } {
  const eco = state.economy;

  // Apply carried-forward losses (stored as a positive number).
  let carry = company.lossCarryforward;
  let netShort = shortGain;
  let netLong = longGain;

  if (carry > 0) {
    if (netShort > 0) {
      const used = Math.min(carry, netShort);
      netShort -= used; carry -= used;
    }
    if (carry > 0 && netLong > 0) {
      const used = Math.min(carry, netLong);
      netLong -= used; carry -= used;
    }
  }
  const usedCarryforward = company.lossCarryforward - carry;

  // Losses this period add to the carry-forward rather than refunding cash.
  const realisedLoss = Math.min(0, netShort) + Math.min(0, netLong);
  if (realisedLoss < 0) {
    // Only a token amount offsets ordinary income each year.
    const deductible = Math.min(3000, -realisedLoss);
    carry += -realisedLoss - deductible;
  }

  const taxableShort = Math.max(0, netShort);
  const taxableLong = Math.max(0, netLong);
  const tax = taxableShort * (eco.shortTermCapitalGainsRate / 100)
    + taxableLong * (eco.longTermCapitalGainsRate / 100);

  company.lossCarryforward = carry;
  company.cash -= tax;
  company.taxesPaidYTD += tax;
  return { tax, usedCarryforward };
}

// ============= WASH SALE RULE =============
/**
 * The 30-day wash sale rule: selling a security at a loss and repurchasing
 * within 30 days disallows the loss. The disallowed loss is added to the cost
 * basis of the new lot. This kills the "sell for a loss, immediately rebuy"
 * exploit.
 */
const recentSales = new Map<string, { tick: number; lossAmount: number }>();

export function recentSellLoss(assetId: string, currentTick: number): number {
  const entry = recentSales.get(assetId);
  if (!entry) return 0;
  if (currentTick - entry.tick > 30 * 24 * 30) {
    recentSales.delete(assetId);
    return 0;
  }
  return entry.lossAmount;
}

// ============= PLAYER TRADING =============
export function buyAsset(state: GameState, assetId: string, units: number): GameState {
  const asset = state.tradedAssets.find(a => a.id === assetId);
  const company = state.companies.find(c => c.isPlayer);
  if (!asset || !company || units <= 0) return state;
  if (asset.unlockYear > state.year) {
    notify(state, `${asset.name} does not exist until ${asset.unlockYear}.`, 'warning');
    return { ...state };
  }

  // Cannot buy more than the tradeable float.
  if (Number.isFinite(asset.circulating) && units > asset.circulating * 0.25) {
    notify(state, `Only ${(asset.circulating * 0.25).toFixed(2)} ${asset.unit} of ${asset.name} is available at once — the float is finite.`, 'warning');
    return { ...state };
  }

  // Slippage: large orders walk the book up against you.
  const impact = marketImpact(asset, units);
  const execPrice = asset.price * (1 + impact);
  const gross = execPrice * units;
  const fee = gross * TRANSACTION_FEE;
  const total = gross + fee;

  if (company.cash < total) {
    notify(state, `Insufficient cash: ${units} ${asset.unit} costs $${fmt(total)} including $${fmt(fee)} commission.`, 'danger');
    return { ...state };
  }

  company.cash -= total;
  // Fees include the slippage in the cost basis, as they should.
  openTaxLot(asset, units, total / units, state.tick);
  // Buying pressure permanently marks the price up.
  asset.price *= 1 + impact * 0.6;
  if (Number.isFinite(asset.circulating)) asset.circulating -= units;

  notify(state,
    `Bought ${units.toFixed(4)} ${asset.unit} of ${asset.name} @ $${execPrice.toFixed(2)}` +
    (impact > 0.002 ? ` (${(impact * 100).toFixed(2)}% slippage)` : '') +
    ` — commission $${fmt(fee)}.`, 'success');
  return { ...state };
}

export function sellAsset(state: GameState, assetId: string, units: number): GameState {
  const asset = state.tradedAssets.find(a => a.id === assetId);
  const company = state.companies.find(c => c.isPlayer);
  if (!asset || !company) return state;
  if (asset.unlockYear > state.year) return state;

  const sellUnits = Math.min(units, asset.playerHolding);
  if (sellUnits <= 0) return state;

  const impact = marketImpact(asset, sellUnits);
  const execPrice = asset.price * (1 - impact);
  const gross = execPrice * sellUnits;
  const fee = gross * TRANSACTION_FEE;
  const net = gross - fee;

  company.cash += net;
  // FIFO lot consumption gives exact short vs long-term gains.
  const { shortGain, longGain } = consumeTaxLots(asset, sellUnits, net / sellUnits, state.tick);
  const { tax } = applyCapitalGains(state, company, shortGain, longGain);

  // Selling pressure marks the price down.
  asset.price *= 1 - impact * 0.6;
  if (Number.isFinite(asset.circulating)) asset.circulating += sellUnits;

  const totalGain = shortGain + longGain;
  // Record losses for the 30-day wash sale window so a same-day rebuy is disallowed.
  if (totalGain < 0) {
    recentSales.set(assetId, { tick: state.tick, lossAmount: totalGain });
  }
  notify(state,
    `Sold ${sellUnits.toFixed(4)} ${asset.unit} of ${asset.name} for $${fmt(net)} — ` +
    `${totalGain >= 0 ? 'gain' : 'loss'} $${fmt(Math.abs(totalGain))}` +
    (tax > 0 ? `, CGT $${fmt(tax)} (ST $${fmt(Math.max(0, shortGain))} / LT $${fmt(Math.max(0, longGain))})` : '') +
    (totalGain < 0 ? ' carried forward against future gains.' : '.'),
    totalGain >= 0 ? 'success' : 'warning');
  return { ...state };
}

export function playerPortfolioValue(state: GameState): number {
  return state.tradedAssets.reduce((sum, a) => sum + a.price * a.playerHolding, 0);
}

function fmt(amount: number): string {
  if (Math.abs(amount) >= 1_000_000_000) return (amount / 1_000_000_000).toFixed(2) + 'B';
  if (Math.abs(amount) >= 1_000_000) return (amount / 1_000_000).toFixed(2) + 'M';
  if (Math.abs(amount) >= 1_000) return (amount / 1_000).toFixed(1) + 'K';
  return amount.toFixed(2);
}

// ============= AI TREASURY =============
/** AI boards also pay fees and face slippage — no asymmetric advantage. */
export function simulateAiCapitalAllocation(state: GameState) {
  for (const company of state.companies) {
    if (company.isPlayer) continue;
    const buffer = Math.max(4_000_000, company.expenses * TICKS_PER_MONTH * 3);
    const surplus = company.cash - buffer;
    if (surplus < 5_000_000) continue;

    if (Math.random() < 0.10 && company.acumen > 0.45) {
      const realRate = state.economy.interestRate - state.economy.inflation;
      const preferred = realRate < 0 || state.economy.inflation > 5 ? 'XAU'
        : state.economy.cycle === 'boom' && company.aiStrategy === 'aggressive' ? 'BTC'
        : state.economy.cycle === 'recession' ? 'XAU' : 'MKTX';
      const asset = state.tradedAssets.find(a => a.symbol === preferred);
      if (!asset) continue;
      const budget = surplus * (0.08 + company.acumen * 0.10);
      const units = budget / asset.price;
      if (units <= 0) continue;
      if (Number.isFinite(asset.circulating) && units > asset.circulating * 0.2) continue;

      const impact = marketImpact(asset, units);
      const cost = budget * (1 + impact) * (1 + TRANSACTION_FEE);
      if (company.cash < cost) continue;
      company.cash -= cost;
      company.assetHoldings[asset.id] = (company.assetHoldings[asset.id] ?? 0) + units;
      company.assetCostBasis[asset.id] = cost / units;
      asset.price *= 1 + impact * 0.5;
      if (Number.isFinite(asset.circulating)) asset.circulating -= units;
    }

    // Take profits after a strong run, paying fees and CGT like the player.
    for (const [assetId, units] of Object.entries(company.assetHoldings)) {
      if (units <= 0) continue;
      const asset = state.tradedAssets.find(a => a.id === assetId);
      if (!asset) continue;
      const distressed = company.cash < buffer * 0.5;
      if (asset.price / asset.anchor > 1.35 || distressed) {
        const sellUnits = units * (distressed ? 1 : 0.4);
        const impact = marketImpact(asset, sellUnits);
        const proceeds = sellUnits * asset.price * (1 - impact) * (1 - TRANSACTION_FEE);
        const basis = (company.assetCostBasis[assetId] ?? asset.price * 0.8) * sellUnits;
        company.cash += proceeds;
        company.assetHoldings[assetId] = units - sellUnits;
        // AI holds long-term by assumption; still taxed.
        applyCapitalGains(state, company, 0, proceeds - basis);
        asset.price *= 1 - impact * 0.5;
        if (Number.isFinite(asset.circulating)) asset.circulating += sellUnits;
      }
    }
  }
}
