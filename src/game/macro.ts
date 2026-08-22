import type { GameState } from './types';
import { TICKS_PER_MONTH } from './constants';
import { news } from './systems';

// ════════════════════════════════════════════════════════════════════
// PERSONAL INCOME TAX
// ════════════════════════════════════════════════════════════════════
export interface TaxBracket {
  minIncome: number;
  maxIncome: number;
  rate: number;
}

export const TAX_BRACKETS_ANNUAL: TaxBracket[] = [
  { minIncome: 0, maxIncome: 50_000, rate: 10 },
  { minIncome: 50_000, maxIncome: 120_000, rate: 15 },
  { minIncome: 120_000, maxIncome: 250_000, rate: 22 },
  { minIncome: 250_000, maxIncome: 500_000, rate: 28 },
  { minIncome: 500_000, maxIncome: Infinity, rate: 35 },
];

/** Bracket the player's annual personal income (salary × 12). */
export function personalIncomeTax(annualIncome: number): number {
  let tax = 0;
  for (const b of TAX_BRACKETS_ANNUAL) {
    const slice = Math.max(0, Math.min(annualIncome, b.maxIncome) - b.minIncome);
    if (slice <= 0) break;
    tax += slice * (b.rate / 100);
  }
  return tax;
}

// ════════════════════════════════════════════════════════════════════
// FISCAL POLICY
// ════════════════════════════════════════════════════════════════════
/**
 * Monthly government budget, scaled to the actual game economy.
 *
 * Receipts are a share of nominal GDP (the tax base); spending covers
 * public-sector wages, infrastructure and unemployment transfers — the
 * automatic stabiliser. A deficit is financed by new government debt, which
 * itself carries an interest bill at the 10-year yield.
 */
export function runFiscalBudget(state: GameState) {
  const eco = state.economy;
  const gdp = Math.max(1_000_000, eco.nominalGdp);

  const corporateTake = state.companies.reduce(
    (sum, c) => sum + Math.max(0, c.pretaxYTD) * (eco.corporateTaxRate / 100), 0);
  const receipts = corporateTake + gdp * 0.11;

  // Spending: base public sector (~17% of GDP) plus transfers that widen
  // automatically in recessions (~1% of GDP per point of unemployment).
  const transfers = gdp * (0.03 + eco.unemployment * 0.01);
  const spending = gdp * 0.17 + transfers;

  const interest = eco.govDebt * (Math.max(0.5, eco.tenYearYield) / 100) / 12;
  const balance = receipts - spending - interest;
  eco.govDeficit = -balance; // positive = monthly deficit

  if (balance < 0) eco.govDebt += -balance;
  else eco.govDebt = Math.max(0, eco.govDebt - Math.min(balance, eco.govDebt * 0.02));
}

// ════════════════════════════════════════════════════════════════════
// CENTRAL BANK
// ════════════════════════════════════════════════════════════════════
/**
 * Central bank balance sheet, scaled to the actual game economy.
 *
 * The balance sheet sits near ~50% of nominal GDP in steady state and expands
 * during QE at ~2% of GDP per month (crisis), or contracts during QT. Base money
 * derives from the balance sheet; broad money (M2) is the base times a money
 * multiplier. Runs hourly, so monthly rates are divided by 720.
 */
export function runCentralBank(state: GameState) {
  const eco = state.economy;
  const PER_HOUR = 1 / TICKS_PER_MONTH;
  const gdp = Math.max(1_000_000, eco.nominalGdp);
  const steadyState = gdp * 0.5;

  if (eco.interestRate < 1.0 && eco.cycle === 'recession') {
    // QE: ~2% of GDP per month while the rate is pinned at zero.
    eco.centralBankAssets += gdp * 0.02 * PER_HOUR;
  } else if (eco.interestRate > 5.5 && eco.inflation > 4) {
    // QT: ~1.5% of GDP per month rolls off.
    eco.centralBankAssets = Math.max(steadyState * 0.4, eco.centralBankAssets - gdp * 0.015 * PER_HOUR);
  } else {
    eco.centralBankAssets += (steadyState - eco.centralBankAssets) * 0.001 * PER_HOUR;
  }

  eco.baseMoney = Math.max(20, Math.min(400, eco.centralBankAssets / 100_000_000));
  // Multiplier rises with the policy rate (banks lend more eagerly when it pays);
  // velocity completes the MV = PY linkage.
  const multiplier = (2.2 + Math.max(0, eco.interestRate) * 0.25) * eco.moneyVelocity;
  eco.broadMoney = Math.max(60, Math.min(800, eco.baseMoney * multiplier));
}

/**
 * Publish the yield curve from the policy rate and cycle expectations.
 * The bond market's own mark-to-market also derives a curve; this is the
 * macro layer's view, used when no bond issue is outstanding.
 */
export function updateYieldCurve(state: GameState) {
  const eco = state.economy;
  const expectRecession = eco.cycle === 'recession' ? 1 : 0;
  eco.threeMonthYield = Math.max(0, eco.interestRate * 0.6);
  eco.twoYearYield = Math.max(0, eco.interestRate * 0.95 - expectRecession * 0.5);
  eco.tenYearYield = Math.max(0, eco.interestRate + 1.2 - expectRecession * 0.8);
}

// ════════════════════════════════════════════════════════════════════
// WAGE–PRICE SPIRAL
// ════════════════════════════════════════════════════════════════════
/**
 * Real wages track productivity; nominal wages additionally index to inflation
 * through a Phillips-curve bargaining model. Higher productivity lets workers
 * demand more, and they get it especially when unemployment is low.
 */
export function updateWageSpiral(state: GameState) {
  const eco = state.economy;
  // Phillips: low unemployment → faster wage growth; high → stagnation.
  const unemploymentGap = Math.max(-2, 4.5 - eco.unemployment) / 2;
  const productivityGrowth = Math.max(-0.5, eco.gdpGrowth * 0.5 + 1.5);
  eco.productivityGrowth = productivityGrowth;

  const expectedInflation = eco.inflation * 0.7 + 2 * 0.3;
  const wageGrowth = productivityGrowth + expectedInflation + unemploymentGap;
  eco.unitLaborCostGrowth = wageGrowth - productivityGrowth;

  for (const city of state.cities) {
    const realWageGrowth = (wageGrowth - eco.inflation) / 100;
    city.wageRate *= 1 + realWageGrowth / 365;
  }
  // Households with stagnant wages save more, slowing demand.
  if (wageGrowth < eco.inflation + 0.5) {
    eco.householdSavingsRate = Math.min(20, eco.householdSavingsRate + 0.1);
  } else {
    eco.householdSavingsRate = Math.max(3, eco.householdSavingsRate - 0.05);
  }
}

// ════════════════════════════════════════════════════════════════════
// CPI DECOMPOSITION
// ════════════════════════════════════════════════════════════════════
/**
 * Decompose CPI by category. Each tracks its own index weighted by consumption
 * share, separating food/energy-driven "headline" spikes from the "core" trend.
 */
export function updateCpiBreakdown(state: GameState) {
  const eco = state.economy;
  const weights = { food: 15, housing: 33, energy: 7, services: 30, goods: 15 };
  const base = eco.inflation;
  const shock = eco.energyShockMonths > 0 ? 1.5 : 0;
  const categoryInflation: Record<string, number> = {
    food: base * 1.2 + shock,
    housing: base * 0.8,
    energy: base * 1.5 + shock * 2,
    services: base * 1.1,
    goods: base * 0.9,
  };

  // Runs hourly, so the monthly rate is divided across 720 ticks per month.
  for (const cat of ['food', 'housing', 'energy', 'services', 'goods']) {
    const ci = categoryInflation[cat] ?? base;
    const current = eco.cpiByCategory[cat] || 100;
    eco.cpiByCategory[cat] = current * (1 + ci / 100 / 12 / TICKS_PER_MONTH);
  }

  let weighted = 0;
  let totalWeight = 0;
  for (const cat of Object.keys(weights)) {
    weighted += (eco.cpiByCategory[cat] ?? 100) * weights[cat as keyof typeof weights];
    totalWeight += weights[cat as keyof typeof weights];
  }
  eco.cpi = weighted / Math.max(1, totalWeight);

  // Core CPI: headline ex food and energy.
  const coreWeight = weights.housing + weights.services + weights.goods;
  eco.cpiByCategory.core = coreWeight > 0
    ? ((eco.cpiByCategory.housing ?? 100) * weights.housing
      + (eco.cpiByCategory.services ?? 100) * weights.services
      + (eco.cpiByCategory.goods ?? 100) * weights.goods) / coreWeight
    : 100;
}

// ════════════════════════════════════════════════════════════════════
// ENERGY MARKET
// ════════════════════════════════════════════════════════════════════
/**
 * Energy market with OPEC-style events, strategic reserves and transition.
 * Runs hourly, so all rates are scaled by TICKS_PER_MONTH — treating monthly
 * probabilities as hourly fires OPEC events six times a month and drains the
 * strategic reserve in days.
 */
export function simulateEnergyMarket(state: GameState) {
  const eco = state.economy;
  const PER_HOUR = 1 / TICKS_PER_MONTH;

  // Base: long-run mean reversion at ~3%/month.
  const longRun = 3.4 * (1 + eco.inflation / 100);
  eco.dieselPrice += (longRun - eco.dieselPrice) * 0.03 * PER_HOUR
    + (Math.random() - 0.5) * 0.18 * PER_HOUR;

  if (eco.cycle === 'boom' && Math.random() < 0.008 * PER_HOUR) {
    eco.energyShockMonths = 3 + Math.floor(Math.random() * 4);
    eco.dieselPrice *= 1.25;
    news(state, 'OPEC+ cuts production — diesel jumps on supply concerns', 'breaking');
  } else if (eco.cycle === 'recession' && Math.random() < 0.012 * PER_HOUR) {
    eco.energyShockMonths = 2 + Math.floor(Math.random() * 2);
    eco.dieselPrice *= 0.9;
  }

  // Strategic reserves drain during a shock, replenish slowly in calm periods.
  if (eco.energyShockMonths > 0) {
    eco.strategicReserveDays = Math.max(30, eco.strategicReserveDays - 0.5 * PER_HOUR);
    eco.energyShockMonths -= PER_HOUR;
  } else {
    eco.strategicReserveDays = Math.min(180, eco.strategicReserveDays + 0.2 * PER_HOUR);
  }

  if (eco.dieselPrice > 5.0 && Math.random() < 0.02 * PER_HOUR) {
    news(state, 'High diesel prices accelerate investment in energy efficiency', 'info');
  }

  eco.dieselPrice = Math.max(1.4, Math.min(7.5, eco.dieselPrice));
}
