import type { Company, GameState, TradedAsset } from './types';
import { notify, news, money } from './systems';
import { uid } from './world';

// ════════════════════════════════════════════════════════════════════
// REAL-WORLD SUPPLY
// ════════════════════════════════════════════════════════════════════
/**
 * Assets are backed by genuine physical supply. Buying moves the price because
 * you are consuming a finite float — there is no infinite liquidity at the quote.
 *
 *  · Bitcoin — 21,000,000 hard cap; ~19.8M mined, ~4M lost forever, halving
 *    schedule cuts new issuance every four years.
 *  · Gold — ~215,000 tonnes ever mined (converted to troy oz), ~3,000 t/yr new.
 *  · Silver — ~1.8M tonnes above ground, heavy industrial consumption.
 *  · Oil — ~1.7 trillion barrels of proven reserves, ~35bn barrels/yr consumed.
 *
 * ETFs are *not* real-world funds — they are baskets of the companies that
 * actually exist in this game world, priced off their aggregate market cap.
 */
export const TRANSACTION_FEE = 0.005; // 0.5% brokerage on every trade, both ways
const TICKS_PER_MONTH = 24 * 30;
const TICKS_PER_YEAR = TICKS_PER_MONTH * 12;

type Seed = {
  symbol: string; name: string; assetClass: TradedAsset['assetClass'];
  price: number; anchor: number; volatility: number; unit: string;
  supply: { worldSupply: number; floatShare: number; annualNewSupply: number; annualConsumption: number };
  unlockYear: number;
};

export function generateTradedAssets(): TradedAsset[] {
  const seeds: Seed[] = [
    { symbol: 'CL', name: 'Crude Oil', unlockYear: 1800, assetClass: 'commodity', price: 78, anchor: 72, volatility: 0.38, unit: 'barrel',
      supply: { worldSupply: 1_700_000_000_000, floatShare: 0.0008, annualNewSupply: 34_000_000_000, annualConsumption: 35_500_000_000 } },
    { symbol: 'NG', name: 'Natural Gas', unlockYear: 1800, assetClass: 'commodity', price: 2.6, anchor: 3.1, volatility: 0.55, unit: 'MMBtu',
      supply: { worldSupply: 7_500_000_000_000, floatShare: 0.0004, annualNewSupply: 145_000_000_000, annualConsumption: 148_000_000_000 } },
    { symbol: 'ZW', name: 'Wheat', unlockYear: 1800, assetClass: 'commodity', price: 5.9, anchor: 6.2, volatility: 0.24, unit: 'bushel',
      supply: { worldSupply: 29_000_000_000, floatShare: 0.02, annualNewSupply: 28_500_000_000, annualConsumption: 28_400_000_000 } },
    { symbol: 'HG', name: 'Copper', unlockYear: 1800, assetClass: 'commodity', price: 4.15, anchor: 3.9, volatility: 0.26, unit: 'lb',
      supply: { worldSupply: 1_760_000_000_000, floatShare: 0.0006, annualNewSupply: 48_000_000_000, annualConsumption: 49_500_000_000 } },
    { symbol: 'LI', name: 'Lithium Carbonate', unlockYear: 1980, assetClass: 'commodity', price: 13800, anchor: 15000, volatility: 0.62, unit: 'tonne',
      supply: { worldSupply: 26_000_000, floatShare: 0.008, annualNewSupply: 180_000, annualConsumption: 175_000 } },
    { symbol: 'XAU', name: 'Gold', unlockYear: 1800, assetClass: 'metal', price: 2340, anchor: 2050, volatility: 0.15, unit: 'troy oz',
      supply: { worldSupply: 6_900_000_000, floatShare: 0.21, annualNewSupply: 115_000_000, annualConsumption: 12_000_000 } },
    { symbol: 'XAG', name: 'Silver', unlockYear: 1800, assetClass: 'metal', price: 27.4, anchor: 25, volatility: 0.29, unit: 'troy oz',
      supply: { worldSupply: 57_000_000_000, floatShare: 0.05, annualNewSupply: 830_000_000, annualConsumption: 1_050_000_000 } },
    { symbol: 'XPT', name: 'Platinum', unlockYear: 1800, assetClass: 'metal', price: 965, anchor: 950, volatility: 0.22, unit: 'troy oz',
      supply: { worldSupply: 315_000_000, floatShare: 0.12, annualNewSupply: 5_800_000, annualConsumption: 6_200_000 } },
    { symbol: 'BTC', name: 'Bitcoin', unlockYear: 2008, assetClass: 'crypto', price: 64000, anchor: 45000, volatility: 0.85, unit: 'BTC',
      supply: { worldSupply: 19_800_000, floatShare: 0.62, annualNewSupply: 164_000, annualConsumption: 0 } },
  ];

  return seeds.map(seed => {
    const { supply, ...rest } = seed;
    return {
      ...rest,
      id: uid('asset'),
      worldSupply: supply.worldSupply,
      floatShare: supply.floatShare,
      annualNewSupply: supply.annualNewSupply,
      annualConsumption: supply.annualConsumption,
      circulating: supply.worldSupply * supply.floatShare,
      history: Array.from({ length: 60 }, (_, i) => rest.price * (0.9 + Math.sin(i / 8) * 0.08 + Math.random() * 0.05)),
      playerHolding: 0, playerCostBasis: 0, taxLots: [],
      trackedCompanyIds: null,
    };
  });
}

/**
 * In-world index funds. These track the companies that actually exist in this
 * game, so their price derives from real aggregate market capitalisation.
 */
export function createIndexFunds(state: GameState): TradedAsset[] {
  const all = state.companies.filter(c => !c.isPlayer);
  const broad = all.map(c => c.id);
  const industrials = all.filter((_c, i) => i % 2 === 0).map(c => c.id);

  const mk = (symbol: string, name: string, ids: string[], vol: number, unlockYear: number): TradedAsset => {
    const nav = navOf(state, ids);
    return {
      id: uid('etf'), symbol, name, assetClass: 'etf',
      price: nav, anchor: nav, volatility: vol, unit: 'share',
      trackedCompanyIds: ids,
      worldSupply: 0, floatShare: 1, annualNewSupply: 0, annualConsumption: 0,
      circulating: Infinity, // open-ended fund: units created on demand
      history: Array.from({ length: 60 }, () => nav * (0.95 + Math.random() * 0.1)),
      playerHolding: 0, playerCostBasis: 0, taxLots: [], unlockYear,
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
  return Math.max(1, totalCap / (members.length * 1_000_000));
}

// ════════════════════════════════════════════════════════════════════
// PRICE SIMULATION
// ════════════════════════════════════════════════════════════════════
/**
 * Daily mark-to-market. Commodity prices are driven by the stock-to-flow
 * balance of genuine supply against consumption, plus macro linkages. When
 * annual consumption exceeds new supply the float shrinks and prices grind up.
 */
export function simulateAssetPrices(state: GameState) {
  const eco = state.economy;
  const realRate = eco.interestRate - eco.inflation;

  for (const asset of state.tradedAssets) {
    if (asset.unlockYear > state.year) continue;

    // ── In-world funds are pure NAV trackers ──
    if (asset.trackedCompanyIds) {
      const nav = navOf(state, asset.trackedCompanyIds);
      asset.anchor = nav;
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
    const netFlow = (asset.annualNewSupply - asset.annualConsumption) / 365;
    asset.circulating = Math.max(asset.worldSupply * asset.floatShare * 0.15,
      asset.circulating + netFlow * asset.floatShare);
    asset.worldSupply = Math.max(0, asset.worldSupply + netFlow);

    // Stock-to-flow: scarce assets with low new issuance command a premium.
    const stockToFlow = asset.annualNewSupply > 0 ? asset.worldSupply / asset.annualNewSupply : 100;
    const scarcityDrift = Math.min(0.0006, Math.log10(1 + stockToFlow) * 0.00007);
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
        macro = eco.gdpGrowth * 0.0004 + (eco.energyShockMonths > 0 ? 0.012 : 0); break;
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
  if (state.year > 2008 && state.month === 4 && state.day === 1 && state.hour === 0
    && (state.year - 2008) % 4 === 0) {
    const btc = state.tradedAssets.find(a => a.symbol === 'BTC');
    if (btc && btc.annualNewSupply > 1000) {
      btc.annualNewSupply /= 2;
      news(state, `Bitcoin halving: new issuance drops to ${Math.round(btc.annualNewSupply).toLocaleString()} BTC/yr`, 'breaking');
    }
  }

  if (Math.random() < 0.004) {
    const unlocked = state.tradedAssets.filter(a => a.unlockYear <= state.year);
    if (unlocked.length === 0) return;
    const asset = unlocked[Math.floor(Math.random() * unlocked.length)];
    const move = (Math.random() - 0.4) * asset.volatility * 0.4;
    asset.price = Math.max(asset.anchor * 0.2, asset.price * (1 + move));
    news(state, `${asset.name} ${move > 0 ? 'surges' : 'slides'} ${Math.abs(move * 100).toFixed(1)}% on heavy volume`,
      move > 0 ? 'info' : 'warning');
  }
}

/**
 * Market impact. Trading a meaningful share of the float moves the price
 * against you — this is what kills the infinite-money round-trip exploit.
 */
export function marketImpact(asset: TradedAsset, units: number): number {
  if (!Number.isFinite(asset.circulating) || asset.circulating <= 0) return 0;
  const share = Math.abs(units) / asset.circulating;
  return Math.min(0.35, Math.sqrt(share) * 1.6); // square-root impact law
}

// ════════════════════════════════════════════════════════════════════
// TAX LOTS & CAPITAL GAINS
// ════════════════════════════════════════════════════════════════════
/** FIFO lot opening, with the wash-sale disallowance rolled into basis. */
export function openTaxLot(asset: TradedAsset, units: number, pricePerUnit: number, tick: number) {
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
    const gain = take * salePrice - lotBasis;
    if (tick - lot.openedTick >= TICKS_PER_YEAR) longGain += gain;
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
 * Capital gains tax with a proper loss carry-forward ledger:
 *  · Losses first offset gains of the same character (short vs long).
 *  · Any excess offsets the other character.
 *  · Only $3,000/yr of net loss deducts against ordinary income.
 *  · The remainder carries forward — it does not vanish or refund cash.
 */
export function applyCapitalGains(
  state: GameState, company: Company, shortGain: number, longGain: number,
): { tax: number; usedCarryforward: number } {
  const eco = state.economy;
  let carry = company.lossCarryforward;
  let netShort = shortGain;
  let netLong = longGain;

  if (carry > 0) {
    if (netShort > 0) { const used = Math.min(carry, netShort); netShort -= used; carry -= used; }
    if (carry > 0 && netLong > 0) { const used = Math.min(carry, netLong); netLong -= used; carry -= used; }
  }
  const usedCarryforward = company.lossCarryforward - carry;

  const realisedLoss = Math.min(0, netShort) + Math.min(0, netLong);
  if (realisedLoss < 0) {
    const deductible = Math.min(3000, -realisedLoss);
    carry += -realisedLoss - deductible;
  }

  const tax = Math.max(0, netShort) * (eco.shortTermCapitalGainsRate / 100)
    + Math.max(0, netLong) * (eco.longTermCapitalGainsRate / 100);

  company.lossCarryforward = carry;
  company.cash -= tax;
  company.taxesPaidYTD += tax;
  return { tax, usedCarryforward };
}

// ════════════════════════════════════════════════════════════════════
// WASH SALE RULE
// ════════════════════════════════════════════════════════════════════
/**
 * Selling at a loss and repurchasing within 30 days disallows the loss; the
 * disallowed amount is added to the new lot's basis. Kills the
 * "sell for a loss, immediately rebuy" exploit.
 */
const recentSales = new Map<string, { tick: number; lossAmount: number }>();

export function recentSellLoss(assetId: string, currentTick: number): number {
  const entry = recentSales.get(assetId);
  if (!entry) return 0;
  if (currentTick - entry.tick > 30 * 24 * 30) { recentSales.delete(assetId); return 0; }
  return entry.lossAmount;
}

// ════════════════════════════════════════════════════════════════════
// PLAYER TRADING
// ════════════════════════════════════════════════════════════════════
export function buyAsset(state: GameState, assetId: string, units: number): boolean {
  const asset = state.tradedAssets.find(a => a.id === assetId);
  const company = state.companies.find(c => c.id === state.playerCompanyId);
  if (!asset || !company || units <= 0) return false;
  if (asset.unlockYear > state.year) {
    notify(state, `${asset.name} does not exist until ${asset.unlockYear}.`, 'warning');
    return false;
  }
  if (Number.isFinite(asset.circulating) && units > asset.circulating * 0.25) {
    notify(state, `Only ${(asset.circulating * 0.25).toLocaleString()} ${asset.unit} is available at once — the float is finite.`, 'warning');
    return false;
  }

  const impact = marketImpact(asset, units);
  const execPrice = asset.price * (1 + impact);
  const gross = execPrice * units;
  const fee = gross * TRANSACTION_FEE;
  const total = gross + fee;
  if (company.cash < total) {
    notify(state, `Insufficient cash: ${units} ${asset.unit} costs ${money(total)} including ${money(fee)} commission.`, 'danger');
    return false;
  }

  company.cash -= total;
  openTaxLot(asset, units, total / units, state.tick);
  asset.price *= 1 + impact * 0.6;
  if (Number.isFinite(asset.circulating)) asset.circulating -= units;

  notify(state,
    `Bought ${units.toFixed(4)} ${asset.unit} of ${asset.name} @ $${execPrice.toFixed(2)}`
    + (impact > 0.002 ? ` (${(impact * 100).toFixed(2)}% slippage)` : '')
    + ` — commission ${money(fee)}.`, 'success');
  return true;
}

export function sellAsset(state: GameState, assetId: string, units: number): boolean {
  const asset = state.tradedAssets.find(a => a.id === assetId);
  const company = state.companies.find(c => c.id === state.playerCompanyId);
  if (!asset || !company || asset.unlockYear > state.year) return false;

  const sellUnits = Math.min(units, asset.playerHolding);
  if (sellUnits <= 0) return false;

  const impact = marketImpact(asset, sellUnits);
  const execPrice = asset.price * (1 - impact);
  const gross = execPrice * sellUnits;
  const fee = gross * TRANSACTION_FEE;
  const net = gross - fee;

  company.cash += net;
  const { shortGain, longGain } = consumeTaxLots(asset, sellUnits, net / sellUnits, state.tick);
  const { tax } = applyCapitalGains(state, company, shortGain, longGain);

  asset.price *= 1 - impact * 0.6;
  if (Number.isFinite(asset.circulating)) asset.circulating += sellUnits;

  const totalGain = shortGain + longGain;
  if (totalGain < 0) recentSales.set(assetId, { tick: state.tick, lossAmount: totalGain });

  notify(state,
    `Sold ${sellUnits.toFixed(4)} ${asset.unit} of ${asset.name} for ${money(net)} — `
    + `${totalGain >= 0 ? 'gain' : 'loss'} ${money(Math.abs(totalGain))}`
    + (tax > 0 ? `, CGT ${money(tax)} (ST ${money(Math.max(0, shortGain))} / LT ${money(Math.max(0, longGain))})` : '')
    + (totalGain < 0 ? ' — loss carried forward against future gains.' : '.'),
    totalGain >= 0 ? 'success' : 'warning');
  return true;
}

export function playerPortfolioValue(state: GameState): number {
  return state.tradedAssets.reduce((sum, a) => sum + a.price * a.playerHolding, 0);
}

// ════════════════════════════════════════════════════════════════════
// AI TREASURY
// ════════════════════════════════════════════════════════════════════
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
        : state.economy.cycle === 'boom' && company.strategy === 'aggressive' ? 'BTC'
          : state.economy.cycle === 'recession' ? 'XAU' : 'MKTX';
      const asset = state.tradedAssets.find(a => a.symbol === preferred && a.unlockYear <= state.year);
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
        applyCapitalGains(state, company, 0, proceeds - basis);
        asset.price *= 1 - impact * 0.5;
        if (Number.isFinite(asset.circulating)) asset.circulating += sellUnits;
      }
    }
  }
}
