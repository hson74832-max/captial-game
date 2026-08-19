import type { GameState, TradedAsset, Company } from './types';

const TICKS_PER_MONTH = 24 * 30;
const TICKS_PER_YEAR = TICKS_PER_MONTH * 12;

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
// ASSET UNIVERSE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Spot prices anchored to real 2024 levels. Volatility is annualised standard
 * deviation: wheat is placid, oil swings hard, bitcoin is in a class of its own.
 */
export function generateTradedAssets(): TradedAsset[] {
  const seeds: Array<Omit<TradedAsset, 'id' | 'history' | 'playerHolding' | 'playerCostBasis'>> = [
    { symbol: 'CL',   name: 'Crude Oil',        assetClass: 'commodity', price: 78,      anchor: 72,      volatility: 0.38, unit: 'barrel' },
    { symbol: 'NG',   name: 'Natural Gas',      assetClass: 'commodity', price: 2.6,     anchor: 3.1,     volatility: 0.55, unit: 'MMBtu' },
    { symbol: 'ZW',   name: 'Wheat',            assetClass: 'commodity', price: 5.9,     anchor: 6.2,     volatility: 0.24, unit: 'bushel' },
    { symbol: 'HG',   name: 'Copper',           assetClass: 'commodity', price: 4.15,    anchor: 3.9,     volatility: 0.26, unit: 'lb' },
    { symbol: 'LI',   name: 'Lithium Carbonate',assetClass: 'commodity', price: 13800,   anchor: 15000,   volatility: 0.62, unit: 'tonne' },
    { symbol: 'XAU',  name: 'Gold',             assetClass: 'metal',     price: 2340,    anchor: 2050,    volatility: 0.15, unit: 'oz' },
    { symbol: 'XAG',  name: 'Silver',           assetClass: 'metal',     price: 27.4,    anchor: 25,      volatility: 0.29, unit: 'oz' },
    { symbol: 'XPT',  name: 'Platinum',         assetClass: 'metal',     price: 965,     anchor: 950,     volatility: 0.22, unit: 'oz' },
    { symbol: 'BTC',  name: 'Bitcoin',          assetClass: 'crypto',    price: 64000,   anchor: 45000,   volatility: 0.85, unit: 'BTC' },
    { symbol: 'ETH',  name: 'Ethereum',         assetClass: 'crypto',    price: 3200,    anchor: 2400,    volatility: 0.95, unit: 'ETH' },
    { symbol: 'SPY',  name: 'Broad Market ETF', assetClass: 'etf',       price: 520,     anchor: 480,     volatility: 0.16, unit: 'share' },
    { symbol: 'GLDX', name: 'Gold Miners ETF',  assetClass: 'etf',       price: 34,      anchor: 32,      volatility: 0.31, unit: 'share' },
  ];

  return seeds.map(seed => ({
    ...seed,
    id: newId('asset'),
    history: Array.from({ length: 60 }, (_, i) => seed.price * (0.9 + Math.sin(i / 8) * 0.08 + Math.random() * 0.05)),
    playerHolding: 0,
    playerCostBasis: 0,
  }));
}

/**
 * Daily mark-to-market.
 *
 * Each asset follows geometric Brownian motion around its anchor, plus real
 * macro linkages: gold rallies when real rates fall, oil spikes on fuel shocks,
 * crypto tracks liquidity, and the broad ETF follows the equity index.
 */
export function simulateAssetPrices(state: GameState) {
  const eco = state.economy;
  const realRate = eco.interestRate - eco.inflation;

  for (const asset of state.tradedAssets) {
    // Mean reversion, scaled so volatile assets wander much further.
    const pull = (asset.anchor - asset.price) / asset.price * 0.015 * (1 - asset.volatility * 0.7);
    // Daily shock drawn from the asset's own volatility.
    const dailyVol = asset.volatility / Math.sqrt(252);
    const shock = (Math.random() + Math.random() + Math.random() - 1.5) * dailyVol * 1.4;

    let macro = 0;
    switch (asset.symbol) {
      case 'XAU': case 'XAG': case 'XPT':
        // Precious metals are a hedge: they rise when real rates go negative.
        macro = -realRate * 0.0018 + (eco.cycle === 'recession' ? 0.0012 : 0);
        break;
      case 'CL': case 'NG':
        // Energy tracks growth and spikes hard on supply disruption.
        macro = eco.gdpGrowth * 0.0004 + (eco.fuelShockMonths > 0 ? 0.012 : 0);
        break;
      case 'BTC': case 'ETH':
        // Crypto is a liquidity asset: loose money and risk appetite drive it.
        macro = (eco.moneySupply - 100) * 0.00018 - realRate * 0.0012
          + (state.stockMarket.sentiment === 'bullish' ? 0.002 : state.stockMarket.sentiment === 'bearish' ? -0.003 : 0);
        break;
      case 'SPY':
        macro = (state.stockMarket.index / 10000 - 1) * 0.004;
        break;
      case 'GLDX':
        macro = -realRate * 0.0022;
        break;
      case 'ZW':
        // Agricultural supply responds to season and inflation.
        macro = (state.season === 'summer' ? -0.0015 : state.season === 'winter' ? 0.0012 : 0) + eco.inflation * 0.0002;
        break;
      case 'HG': case 'LI':
        // Industrial metals follow the business cycle and EV build-out.
        macro = eco.gdpGrowth * 0.0006 + (state.year > 2010 && asset.symbol === 'LI' ? 0.0008 : 0);
        break;
    }

    asset.price = Math.max(asset.anchor * 0.15, asset.price * (1 + pull + shock + macro));
    // Anchors drift with inflation so real values stay meaningful over decades.
    asset.anchor *= 1 + (eco.inflation / 100) / 365;

    if (state.hour === 0) {
      asset.history.push(asset.price);
      if (asset.history.length > 180) asset.history.shift();
    }
  }

  // Occasional headline moves so the market feels alive.
  if (Math.random() < 0.004) {
    const asset = state.tradedAssets[Math.floor(Math.random() * state.tradedAssets.length)];
    const move = (Math.random() - 0.4) * asset.volatility * 0.4;
    asset.price = Math.max(asset.anchor * 0.2, asset.price * (1 + move));
    const dir = move > 0 ? 'surges' : 'slides';
    ticker(state, `${asset.name} ${dir} ${Math.abs(move * 100).toFixed(1)}% on heavy volume`, move > 0 ? 'info' : 'warning');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CAPITAL GAINS TAX
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Realised-gain tax. Short-term gains (position held under a year) are taxed
 * at the higher rate, long-term at the preferential rate — the standard
 * structure that makes churning stock expensive rather than free money.
 */
export function applyCapitalGainsTax(
  state: GameState,
  company: Company,
  gain: number,
  heldTicks: number,
): number {
  if (gain <= 0) {
    // Losses offset future gains rather than generating a refund.
    company.realisedGains += gain;
    return 0;
  }
  const longTerm = heldTicks >= TICKS_PER_YEAR;
  const rate = longTerm ? state.economy.longTermCapitalGainsRate : state.economy.shortTermCapitalGainsRate;
  // Carry-forward losses shelter gains before tax applies.
  const shelter = Math.min(gain, Math.max(0, -company.realisedGains));
  const taxable = gain - shelter;
  company.realisedGains = Math.max(0, company.realisedGains) + gain;
  const tax = taxable * (rate / 100);
  company.cash -= tax;
  return tax;
}

// ═══════════════════════════════════════════════════════════════════════════
// PLAYER ASSET TRADING
// ═══════════════════════════════════════════════════════════════════════════

export function buyAsset(state: GameState, assetId: string, units: number): GameState {
  const asset = state.tradedAssets.find(a => a.id === assetId);
  const company = state.companies.find(c => c.isPlayer);
  if (!asset || !company || units <= 0) return state;

  const cost = asset.price * units;
  if (company.cash < cost) {
    notify(state, `Insufficient cash: ${units} ${asset.unit} of ${asset.name} costs $${(cost / 1_000_000).toFixed(2)}M.`, 'danger');
    return state;
  }
  company.cash -= cost;
  // Weighted-average cost basis.
  const priorValue = asset.playerHolding * asset.playerCostBasis;
  asset.playerHolding += units;
  asset.playerCostBasis = (priorValue + cost) / asset.playerHolding;
  company.assetHoldings[assetId] = asset.playerHolding;
  notify(state, `Bought ${units} ${asset.unit} of ${asset.name} at $${asset.price.toFixed(2)}.`, 'success');
  return state;
}

export function sellAsset(state: GameState, assetId: string, units: number): GameState {
  const asset = state.tradedAssets.find(a => a.id === assetId);
  const company = state.companies.find(c => c.isPlayer);
  if (!asset || !company) return state;

  const sellUnits = Math.min(units, asset.playerHolding);
  if (sellUnits <= 0) return state;

  const proceeds = asset.price * sellUnits;
  const basis = asset.playerCostBasis * sellUnits;
  const gain = proceeds - basis;

  company.cash += proceeds;
  asset.playerHolding -= sellUnits;
  company.assetHoldings[assetId] = asset.playerHolding;

  // Assume the average lot is six months old for the player's convenience.
  const tax = applyCapitalGainsTax(state, company, gain, TICKS_PER_MONTH * 6);
  notify(state,
    `Sold ${sellUnits} ${asset.unit} of ${asset.name} for $${(proceeds / 1_000_000).toFixed(2)}M — ` +
    `${gain >= 0 ? 'gain' : 'loss'} $${(Math.abs(gain) / 1_000_000).toFixed(2)}M` +
    (tax > 0 ? `, capital gains tax $${(tax / 1_000_000).toFixed(2)}M.` : '.'),
    gain >= 0 ? 'success' : 'warning');
  return state;
}

// ═══════════════════════════════════════════════════════════════════════════
// AI CAPITAL ALLOCATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Every AI board runs a treasury. Surplus cash is deployed across four levers
 * that real boards actually use, weighted by competence and market conditions:
 *
 *  1. Buy back its own stock when the market undervalues it.
 *  2. Issue new stock when the market overvalues it.
 *  3. Take equity stakes in rivals it judges cheap.
 *  4. Hedge into gold, oil or crypto depending on the macro regime.
 */
export function simulateAiCapitalAllocation(state: GameState) {
  for (const company of state.companies) {
    if (company.isPlayer) continue;

    const bookValue = Math.max(1, company.totalAssets - company.debt);
    const priceToBook = company.marketCap / bookValue;
    // Cash beyond a prudent operating buffer is available to deploy.
    const operatingBuffer = Math.max(4_000_000, company.expenses * TICKS_PER_MONTH * 3);
    const surplus = company.cash - operatingBuffer;

    // ── 1. Share buybacks when undervalued ──
    // Sharper boards act on a smaller discount; all require real surplus cash.
    const buybackTrigger = 0.95 - company.acumen * 0.25;
    if (priceToBook < buybackTrigger && surplus > 2_000_000 && company.profit > 0) {
      const budget = Math.min(surplus * 0.35, company.marketCap * 0.06);
      const shares = Math.floor(budget / Math.max(0.5, company.sharePrice));
      if (shares > 0 && shares < company.sharesFloat * 0.5) {
        company.cash -= shares * company.sharePrice;
        company.treasuryShares += shares;
        company.sharesOutstanding = Math.max(1000, company.sharesOutstanding - shares);
        // Fewer shares on the same earnings lifts EPS and the price.
        company.sharePrice *= 1 + shares / Math.max(1, company.sharesOutstanding) * 0.35;
        if (Math.random() < 0.35) {
          ticker(state, `${company.name} announces a $${(budget / 1_000_000).toFixed(0)}M share buyback`, 'info');
        }
      }
    }

    // ── 2. Issue equity when richly valued ──
    const issueTrigger = 1.7 + (1 - company.acumen) * 0.6;
    if (priceToBook > issueTrigger && company.cash < operatingBuffer * 1.5) {
      const shares = Math.floor(company.sharesOutstanding * 0.04);
      if (shares > 0) {
        const raised = shares * company.sharePrice * 0.96; // underwriting discount
        company.cash += raised;
        company.sharesOutstanding += shares;
        company.sharePrice *= 0.975; // dilution
        if (Math.random() < 0.3) {
          ticker(state, `${company.name} raises $${(raised / 1_000_000).toFixed(0)}M in a secondary offering`, 'info');
        }
      }
    }

    // ── 3. Strategic equity stakes in cheap rivals ──
    if (surplus > 12_000_000 && company.acumen > 0.55 && Math.random() < 0.10) {
      const targets = state.companies.filter(other => {
        if (other.id === company.id) return false;
        const otherBook = Math.max(1, other.totalAssets - other.debt);
        return other.marketCap / otherBook < 0.85 && other.profit > 0;
      });
      if (targets.length > 0) {
        const target = targets[Math.floor(Math.random() * targets.length)];
        const budget = Math.min(surplus * 0.25, target.marketCap * 0.08);
        const shares = Math.floor(budget / Math.max(0.5, target.sharePrice));
        if (shares > 0) {
          company.cash -= shares * target.sharePrice;
          company.equityHoldings[target.id] = (company.equityHoldings[target.id] ?? 0) + shares;
          target.sharePrice *= 1.01; // buying pressure
          if (Math.random() < 0.4) {
            ticker(state, `${company.name} builds a stake in ${target.name}`, 'info');
          }
        }
      }
    }

    // ── 4. Treasury hedging into hard assets ──
    if (surplus > 8_000_000 && company.acumen > 0.45 && Math.random() < 0.12) {
      const realRate = state.economy.interestRate - state.economy.inflation;
      // Regime-aware selection, exactly as a real treasurer would reason.
      let preferred: string;
      if (realRate < 0 || state.economy.inflation > 5) preferred = 'XAU';          // inflation hedge
      else if (state.economy.cycle === 'boom' && company.aiStrategy === 'aggressive') preferred = 'BTC';
      else if (state.economy.cycle === 'recession') preferred = 'XAU';
      else preferred = 'SPY';                                                       // park in the index

      const asset = state.tradedAssets.find(a => a.symbol === preferred);
      if (asset) {
        const budget = surplus * (0.10 + company.acumen * 0.12);
        const units = budget / asset.price;
        if (units > 0) {
          company.cash -= budget;
          company.assetHoldings[asset.id] = (company.assetHoldings[asset.id] ?? 0) + units;
        }
      }
    }

    // ── 5. Take profits on hard assets after a strong run ──
    for (const [assetId, units] of Object.entries(company.assetHoldings)) {
      if (units <= 0) continue;
      const asset = state.tradedAssets.find(a => a.id === assetId);
      if (!asset) continue;
      const runUp = asset.price / asset.anchor;
      const distressed = company.cash < operatingBuffer * 0.5;
      // Sell into strength, or liquidate to cover an operating shortfall.
      if (runUp > 1.35 || distressed) {
        const sellUnits = units * (distressed ? 1 : 0.4);
        const proceeds = sellUnits * asset.price;
        company.cash += proceeds;
        company.assetHoldings[assetId] = units - sellUnits;
        // AI pays capital gains tax too — no asymmetric advantage over the player.
        applyCapitalGainsTax(state, company, proceeds * 0.25, TICKS_PER_YEAR * 2);
      }
    }
  }
}

/** Mark AI portfolios to market so their balance sheets stay honest. */
export function valuePortfolios(state: GameState) {
  for (const company of state.companies) {
    let portfolioValue = 0;
    for (const [assetId, units] of Object.entries(company.assetHoldings)) {
      const asset = state.tradedAssets.find(a => a.id === assetId);
      if (asset) portfolioValue += asset.price * units;
    }
    for (const [companyId, shares] of Object.entries(company.equityHoldings)) {
      const held = state.companies.find(c => c.id === companyId);
      if (held) portfolioValue += held.sharePrice * shares;
    }
    // Portfolio sits alongside operating assets on the balance sheet.
    company.totalAssets += portfolioValue;
  }
}

/** Player portfolio value for the net-worth calculation. */
export function playerPortfolioValue(state: GameState): number {
  return state.tradedAssets.reduce((sum, asset) => sum + asset.price * asset.playerHolding, 0);
}

// ═══════════════════════════════════════════════════════════════════════════
// CENTRAL BANK
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Forward guidance, target credibility and the CPI series.
 *
 * Credibility matters: when the public believes the 2% target, expectations
 * stay anchored and inflation shocks fade quickly. When the bank has spent its
 * credibility, expectations drift and inflation becomes self-sustaining.
 */
export function simulateCentralBank(state: GameState) {
  const eco = state.economy;

  // CPI compounds from realised inflation — the headline number players watch.
  eco.cpi *= 1 + (eco.inflation / 100) / 12;

  // Credibility erodes when inflation runs far from target, rebuilds when close.
  const miss = Math.abs(eco.inflation - 2);
  eco.cbCredibility += miss > 4 ? -0.012 : miss < 1 ? 0.008 : -0.002;
  eco.cbCredibility = Math.max(0.15, Math.min(1, eco.cbCredibility));

  // Forward guidance signals the next move and shapes market expectations.
  const previousGuidance = eco.forwardGuidance;
  eco.forwardGuidance = eco.inflation > 3.5 ? 'hawkish'
    : eco.inflation < 1 || eco.cycle === 'recession' ? 'dovish'
    : 'neutral';
  if (eco.forwardGuidance !== previousGuidance) {
    const message = eco.forwardGuidance === 'hawkish'
      ? 'Central bank signals further tightening ahead'
      : eco.forwardGuidance === 'dovish'
        ? 'Central bank signals rate cuts and asset purchases'
        : 'Central bank moves to a neutral stance';
    ticker(state, message, eco.forwardGuidance === 'hawkish' ? 'warning' : 'info');
  }

  // Velocity of money: spending accelerates in booms, collapses in slumps.
  const targetVelocity = 1.1 + (eco.consumerConfidence - 50) / 220 + eco.gdpGrowth / 45;
  eco.moneyVelocity += (targetVelocity - eco.moneyVelocity) * 0.05;

  // QE at the zero bound: the bank buys assets, expanding the balance sheet.
  if (eco.interestRate < 0.75 && eco.cycle === 'recession') {
    eco.moneySupply = Math.min(280, eco.moneySupply + 1.2);
    if (Math.random() < 0.08) {
      ticker(state, 'Central bank expands quantitative easing programme', 'info');
    }
  } else if (eco.interestRate > 5.5 && eco.inflation > 4) {
    // Quantitative tightening: the balance sheet runs off.
    eco.moneySupply = Math.max(45, eco.moneySupply - 0.9);
  }

  // Negative policy rates when deflation threatens (Japan/ECB style).
  if (eco.inflation < -0.5 && eco.interestRate <= 0.25) {
    eco.interestRate = Math.max(-0.75, eco.interestRate - 0.1);
    if (Math.random() < 0.1) {
      notify(state, `Policy rate is now negative (${eco.interestRate.toFixed(2)}%). Holding cash costs you money — deploy capital.`, 'warning');
    }
  }
}

/** Annual capital gains settlement and loss carry-forward reset. */
export function settleCapitalGains(state: GameState) {
  for (const company of state.companies) {
    // Losses carry forward one year; gains are already taxed at realisation.
    company.realisedGains = Math.min(0, company.realisedGains);
  }
}
