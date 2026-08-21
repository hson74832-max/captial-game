import type { GameState, Company } from './types';
import type { StateIndex } from './indexing';

const TICKS_PER_MONTH = 24 * 30;

function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function notify(state: GameState, message: string, type: 'info' | 'warning' | 'success' | 'danger') {
  state.notifications.unshift({ id: newId('n'), message, type, tick: state.tick });
  if (state.notifications.length > 50) state.notifications.pop();
}

function ticker(state: GameState, text: string, type: 'info' | 'warning' | 'danger' | 'breaking' = 'info') {
  state.stockMarket.ticker.unshift({ id: newId('t'), text, type, tick: state.tick });
  if (state.stockMarket.ticker.length > 30) state.stockMarket.ticker.pop();
}

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + 'B';
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toFixed(0);
}

// ============= PROPERTY TAX =============
/**
 * Levied monthly on assessed value (construction cost + land) at 1/12 of the
 * annual rate. This is the ongoing cost of *holding* real estate, and it is
 * what makes idle land speculation genuinely expensive rather than free.
 * Receipts fund the city services that lift quality of life.
 */
export function collectPropertyTax(state: GameState, index: StateIndex) {
  const annualRate = state.government.propertyTaxRate;
  const monthlyRate = annualRate / 12;

  const receiptsByCity = new Map<string, number>();

  for (const company of state.companies) {
    const owned = index.buildingsByCompany.get(company.id) ?? [];
    let bill = 0;
    for (const b of owned) {
      if (b.companyId === 'system') continue;
      const assessed = b.constructionCost + b.landValue;
      const tax = assessed * monthlyRate;
      bill += tax;
      receiptsByCity.set(b.cityId, (receiptsByCity.get(b.cityId) ?? 0) + tax);
    }
    if (bill <= 0) continue;
    // Cash impact already accrues hourly through each building's cost ledger.
    company.taxesPaidYTD += bill;

    if (company.isPlayer && bill > 0 && state.month % 3 === 0) {
      notify(state, `Property tax: $${fmt(bill)} this month on ${owned.length} assets (${(annualRate * 100).toFixed(2)}% annual).`, 'info');
    }
  }

  // Receipts fund municipal services, which lift quality of life over time.
  for (const [cityId, receipts] of receiptsByCity) {
    const city = state.cities.find(c => c.id === cityId);
    if (!city) continue;
    const perCapita = receipts / Math.max(1, city.population);
    // A well-funded city improves; a starved one decays.
    const target = 45 + Math.min(35, perCapita * 45000);
    city.qualityOfLife += (target - city.qualityOfLife) * 0.02;
  }
}

// ============= CORPORATE INCOME TAX =============
/**
 * Charged annually on pre-tax operating profit. Losses carry forward and
 * shelter future profit, exactly as real NOL rules work — but they never
 * generate a refund.
 */
export function collectCorporateTax(state: GameState) {
  const rate = state.government.corporateTaxRate / 100;

  for (const company of state.companies) {
    const pretax = company.pretaxProfitYTD;

    if (pretax <= 0) {
      // A loss year adds to the carry-forward pool.
      company.lossCarryforward += -pretax;
      company.taxesPaidLastYear = company.taxesPaidYTD;
      company.taxesPaidYTD = 0;
      company.pretaxProfitYTD = 0;
      continue;
    }

    // Net operating losses shelter profit before tax applies.
    const shelter = Math.min(company.lossCarryforward, pretax);
    company.lossCarryforward -= shelter;
    const taxable = pretax - shelter;
    const bill = taxable * rate;

    company.cash -= bill;
    company.taxesPaidYTD += bill;
    company.taxesPaidLastYear = company.taxesPaidYTD;
    company.taxesPaidYTD = 0;
    company.pretaxProfitYTD = 0;

    if (company.isPlayer) {
      notify(state,
        `Corporate tax assessed: $${fmt(bill)} on $${fmt(taxable)} taxable income at ${state.government.corporateTaxRate}%` +
        (shelter > 0 ? ` (${fmt(shelter)} sheltered by carried-forward losses).` : '.'),
        bill > 0 ? 'warning' : 'info');
    }
  }
}

// ============= DIVIDENDS =============
/**
 * Quarterly dividends with two realistic mechanics the game was missing:
 *
 *  1. Dividend tax — recipients are taxed at the qualified-dividend rate.
 *  2. Ex-dividend price adjustment — the share price drops by the payout on
 *     the ex-date. This is what kills dividend arbitrage: you cannot buy
 *     before the record date, collect, and sell at the same price.
 */
export function payDividends(state: GameState) {
  const divTaxRate = state.economy.dividendTaxRate / 100;

  for (const company of state.companies) {
    const annualProfit = company.profit * 24 * 365;
    if (annualProfit <= 0 || company.dividendPayout <= 0) continue;

    const totalDividend = (annualProfit * company.dividendPayout / 100) / 4;
    if (totalDividend <= 0 || company.cash < totalDividend) continue;

    company.cash -= totalDividend;
    const perShare = totalDividend / Math.max(1, company.sharesOutstanding);

    // ── Ex-dividend adjustment: the cash leaves the company, so the shares
    // are worth exactly that much less the moment they go ex. ──
    company.sharePrice = Math.max(0.5, company.sharePrice - perShare);
    company.marketCap = company.sharePrice * company.sharesOutstanding;

    // The player receives dividends on shares they hold, net of tax.
    const player = state.companies.find(c => c.isPlayer);
    if (!player) continue;
    const held = player.equityHoldings[company.id] ?? 0;
    if (held <= 0) continue;

    const gross = perShare * held;
    const tax = gross * divTaxRate;
    player.cash += gross - tax;
    player.taxesPaidYTD += tax;

    notify(state,
      `Dividend from ${company.name}: $${fmt(gross)} gross, $${fmt(tax)} withheld at ${state.economy.dividendTaxRate}% — ` +
      `$${fmt(gross - tax)} net. Shares went ex-dividend at −$${perShare.toFixed(2)}.`,
      'success');
  }
}

// ============= MONEY SUPPLY =============
/**
 * M2 is governed by the central bank balance sheet (macro.runCentralBank),
 * which separates base money from broad money and drives them from QE/QT
 * plus bank credit. This keeps the legacy moneySupply index (used by the
 * crypto market's liquidity linkage) in lockstep with broad money so the
 * two series never diverge.
 */
export function updateMoneySupply(state: GameState) {
  state.economy.moneySupply = state.economy.broadMoney;
}

// ============= GOVERNMENT POLICY =============
/**
 * Tax rates are no longer static: they move with the fiscal cycle. Deficits
 * during recessions force rises once recovery arrives; booms permit cuts.
 */
export function reviewTaxPolicy(state: GameState) {
  const gov = state.government;
  const eco = state.economy;

  const before = gov.corporateTaxRate;

  if (eco.cycle === 'recession') {
    // Stimulus: cut corporate tax to support investment.
    gov.corporateTaxRate = Math.max(15, gov.corporateTaxRate - 1);
  } else if (eco.cycle === 'boom' && eco.inflation > 4) {
    // Overheating: raise tax to cool demand and repair the balance sheet.
    gov.corporateTaxRate = Math.min(35, gov.corporateTaxRate + 1);
  } else if (Math.random() < 0.3) {
    gov.corporateTaxRate = Math.max(15, Math.min(35,
      gov.corporateTaxRate + (Math.random() < 0.5 ? -1 : 1)));
  }

  // Property tax follows municipal need: growing cities need more services.
  const avgGrowth = state.cities.reduce((s, c) => s + c.growthRate, 0) / Math.max(1, state.cities.length);
  gov.propertyTaxRate = Math.max(0.005, Math.min(0.03,
    gov.propertyTaxRate + (avgGrowth > 1.5 ? 0.0008 : -0.0004)));

  // Dividend tax tracks the political mood on capital.
  state.economy.dividendTaxRate = Math.max(10, Math.min(28,
    state.economy.dividendTaxRate + (eco.cycle === 'boom' ? 0.5 : -0.3)));

  if (gov.corporateTaxRate !== before) {
    ticker(state, `Legislature sets corporate tax at ${gov.corporateTaxRate}% (was ${before}%)`,
      gov.corporateTaxRate > before ? 'warning' : 'info');
  }
}

// ============= SEAPORT ARBITRAGE LIMIT =============
/**
 * Ports are import terminals with finite throughput, not infinite money
 * fountains. Each port has a monthly quota per product; buying beyond it
 * drives the price up sharply and eventually exhausts the berth.
 *
 * This closes the exploit of buying unlimited cheap goods from a port and
 * reselling them into the same city at retail.
 */
export function replenishSeaports(state: GameState) {
  for (const port of state.buildings) {
    if (port.type !== 'seaport') continue;

    for (const pid of port.products) {
      const product = state.products.find(p => p.id === pid);
      if (!product) continue;
      // A berth lands a finite shipment each month.
      const quota = port.capacity * 2.5;
      port.inventory[pid] = Math.min(quota, (port.inventory[pid] ?? 0) + quota * 0.6);
    }
    // Heavily drawn-down ports charge scarcity premiums next month.
    const stocked = port.products.reduce((s, pid) => s + (port.inventory[pid] ?? 0), 0);
    const fullness = stocked / Math.max(1, port.products.length * port.capacity * 2.5);
    port.pricingMultiplier = Math.max(1, Math.min(2.2, 1 + (1 - fullness) * 1.2));
  }
}

/** Marks the year-end roll: reset YTD counters after taxes are assessed. */
export function rollFiscalYear(state: GameState) {
  for (const company of state.companies) {
    // Loss carry-forwards expire after 20 years in most regimes; we simply cap.
    company.lossCarryforward = Math.min(company.lossCarryforward, Math.abs(company.totalAssets));
  }
}
