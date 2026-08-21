import type { GameState, Economy } from './types';
import { generateId } from './engine';

/**
 * Fiscal policy: the government runs a real budget with progressive tax
 * brackets, transfer payments (unemployment benefits, public-sector wages),
 * and deficit financing through bond issuance. Deficits are absolutely
 * normal in recessions and automatically stabilise the cycle.
 */
export interface TaxBracket {
  minIncome: number;
  maxIncome: number;
  rate: number;
}

export const TAX_BRACKETS_ANNUAL: TaxBracket[] = [
  { minIncome: 0,       maxIncome: 50_000,  rate: 10 },
  { minIncome: 50_000,  maxIncome: 120_000, rate: 15 },
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

/**
 * Annual government budget. Receipts come from corporate, property, payroll
 * and capital-gains taxes; spending covers transfer payments, public-sector
 * wages and the maintenance of public services. A negative number is a deficit
 * that is financed by issuing new 10-year bonds.
 */
/**
 * Monthly government budget, scaled to the actual game economy.
 *
 * Receipts are a share of nominal GDP (the tax base), spending covers
 * public-sector wages, infrastructure and unemployment transfers — the
 * automatic stabiliser. A deficit is financed by new government debt; the
 * debt itself carries an interest bill at the 10-year yield.
 *
 * Previously this ran HOURLY with fixed billion-dollar spending figures while
 * receipts were in game-economy millions — the debt exploded to quadrillions
 * within days. It now runs monthly and debt/GDP stays in a sane band.
 */
export function runFiscalBudget(state: GameState) {
  const eco = state.economy;
  const gdp = Math.max(1_000_000, eco.nominalGdp);

  // Tax receipts as a share of GDP: corporate taxes collected on profits
  // plus broad payroll/consumption taxes.
  const corporateTake = state.companies.reduce(
    (sum, c) => sum + Math.max(0, c.pretaxProfitYTD) * (state.government.corporateTaxRate / 100), 0);
  const receipts = corporateTake + gdp * 0.11;

  // Spending: base public sector (~17% of GDP) plus unemployment transfers
  // that widen automatically in recessions (~1% of GDP per point of UE).
  const transfers = gdp * (0.03 + eco.unemployment * 0.01);
  const spending = gdp * 0.17 + transfers;

  // Debt service at the long-end yield.
  const interest = eco.governmentDebt * (Math.max(0.5, eco.tenYearYield) / 100) / 12;

  const balance = receipts - spending - interest;
  eco.governmentDeficit = -balance; // positive number = monthly deficit

  if (balance < 0) eco.governmentDebt += -balance;
  else eco.governmentDebt = Math.max(0, eco.governmentDebt - Math.min(balance, eco.governmentDebt * 0.02));
}

/**
 * Central bank: separate base money from broad money. The balance sheet
 * expands and contracts through QE/QT operations on government bonds.
 * Broad money (M2) is created when banks lend against their reserves,
 * and the velocity of money amplifies nominal output.
 */
/**
 * Central bank balance sheet, scaled to the actual game economy.
 *
 * The balance sheet sits near ~50% of nominal GDP in steady state and
 * expands during QE at ~2% of GDP per month (crisis), or contracts during
 * QT. Base money is derived from the balance sheet; broad money (M2) is the
 * base times a money multiplier that rises as policy tightens demand for
 * lending. Runs hourly, so monthly rates are divided by 720.
 */
export function runCentralBank(state: GameState) {
  const eco = state.economy;
  const PER_HOUR = 1 / (24 * 30);
  const gdp = Math.max(1_000_000, eco.nominalGdp);
  const steadyState = gdp * 0.5;

  if (eco.interestRate < 1.0 && eco.cycle === 'recession') {
    // QE: ~2% of GDP per month while the rate is pinned at zero.
    eco.centralBankAssets += gdp * 0.02 * PER_HOUR;
  } else if (eco.interestRate > 5.5 && eco.inflation > 4) {
    // QT: ~1.5% of GDP per month rolls off.
    eco.centralBankAssets = Math.max(steadyState * 0.4, eco.centralBankAssets - gdp * 0.015 * PER_HOUR);
  } else {
    // Steady state: creep toward ~50% of GDP.
    eco.centralBankAssets += (steadyState - eco.centralBankAssets) * 0.001 * PER_HOUR;
  }

  // Base money = balance sheet / 100M (so $10B balance sheet reads 100).
  eco.baseMoney = Math.max(20, Math.min(400, eco.centralBankAssets / 100_000_000));
  // Broad money = base x multiplier; multiplier rises with the policy rate
  // (banks lend more eagerly when it pays) and with bank credit conditions.
  // Money velocity amplifies the multiplier: fast circulation = more nominal
  // spending per unit of base money. This completes the MV = PY linkage.
  const multiplier = (2.2 + Math.max(0, eco.interestRate) * 0.25) * eco.moneyVelocity;
  eco.broadMoney = Math.max(60, Math.min(800, eco.baseMoney * multiplier));
}

/**
 * Update the yield curve from the policy rate, expectations and rating mix.
 * Called after runCentralBank to publish the curve the bond market uses.
 */
export function updateYieldCurve(state: GameState) {
  const eco = state.economy;
  // Term premium: 10y > 2y > 3m in normal times. Inverted when recession expected.
  const normalPremium = 1.2;
  const expectRecession = eco.cycle === 'recession' ? 1 : 0;
  eco.threeMonthYield = Math.max(0, eco.interestRate * 0.6);
  eco.twoYearYield = Math.max(0, eco.interestRate * 0.95 - expectRecession * 0.5);
  eco.tenYearYield = Math.max(0, eco.interestRate + normalPremium - expectRecession * 0.8);
}

/**
 * Wage-price spiral mechanics. Real wages track productivity; nominal wages
 * additionally index to inflation through a Phillips-curve bargaining model.
 * Higher productivity means workers can demand more, and they get it
 * especially when unemployment is low.
 */
export function updateWageSpiral(state: GameState) {
  const eco = state.economy;
  // Phillips: low unemployment → faster wage growth; high unemployment → stagnation.
  const unemploymentGap = Math.max(-2, 4.5 - eco.unemployment) / 2;
  // Productivity grows in line with nominal GDP growth, not real growth.
  const productivityGrowth = Math.max(-0.5, eco.gdpGrowth * 0.5 + 1.5);
  eco.productivityGrowth = productivityGrowth;

  // Expected inflation from a learning Phillips curve.
  const expectedInflation = eco.inflation * 0.7 + 2 * 0.3;
  // Unit labor cost growth = wage growth − productivity growth.
  const wageGrowth = productivityGrowth + expectedInflation + unemploymentGap;
  eco.unitLaborCostGrowth = wageGrowth - productivityGrowth;

  // Apply: wageRate tracks wage growth in real terms (subtract inflation).
  // In real terms, wages grow with productivity.
  for (const city of state.cities) {
    const realWageGrowth = (wageGrowth - eco.inflation) / 100;
    city.wageRate *= 1 + realWageGrowth / 365;
  }
  // Households with stagnant wages increase their savings rate, slowing demand.
  if (wageGrowth < eco.inflation + 0.5) {
    eco.householdSavingsRate = Math.min(20, eco.householdSavingsRate + 0.1);
  } else {
    eco.householdSavingsRate = Math.max(3, eco.householdSavingsRate - 0.05);
  }
}

/**
 * Decompose CPI by category. Each category tracks its own price index, weighted
 * by consumption share. This distinguishes food/energy-driven spikes (the
 * "headline") from the "core" trend (excluding food and energy).
 */
export function updateCpiBreakdown(state: GameState) {
  const eco = state.economy;
  // Weights: food 15%, housing 33%, energy 7%, services 30%, goods 15%.
  const weights = { food: 15, housing: 33, energy: 7, services: 30, goods: 15 };
  // Each category has its own inflation: food and energy are most volatile.
  const baseInflation = eco.inflation;
  const foodShock = state.economy.fuelShockMonths > 0 ? 1.5 : 0;
  const categoryInflation: Record<string, number> = {
    food: baseInflation * 1.2 + foodShock,
    housing: baseInflation * 0.8,
    energy: baseInflation * 1.5 + foodShock * 2,
    services: baseInflation * 1.1,
    goods: baseInflation * 0.9,
  };
  const TICKS_PER_MONTH = 24 * 30;
  for (const cat of Object.keys(eco.cpiByCategory)) {
    const ci = categoryInflation[cat] ?? baseInflation;
    const current = eco.cpiByCategory[cat] || 100;
    // This runs hourly, so the monthly inflation rate is divided by 720
    // ticks per month. Previously it compounded the full monthly rate
    // every hour — an ~40x/year CPI explosion.
    eco.cpiByCategory[cat] = current * (1 + ci / 100 / 12 / TICKS_PER_MONTH);
  }
  // Headline CPI = weighted average of categories.
  let weighted = 0;
  let totalWeight = 0;
  for (const cat of Object.keys(eco.cpiByCategory)) {
    const w = weights[cat as keyof typeof weights] ?? 0;
    weighted += eco.cpiByCategory[cat] * w;
    totalWeight += w;
  }
  eco.cpi = weighted / Math.max(1, totalWeight);
  // Core CPI: headline ex food and energy.
  const coreWeight = weights.housing + weights.services + weights.goods;
  const coreValue = eco.cpiByCategory.housing * weights.housing
    + eco.cpiByCategory.services * weights.services
    + eco.cpiByCategory.goods * weights.goods;
  // Core is stored as 'core' in a separate place if needed; for now we surface
  // the breakdown in the UI.
  eco.cpiByCategory.core = totalWeight > 0 ? coreValue / coreWeight : 100;
}

/**
 * Energy market: OPEC-style cartel behavior, strategic reserves, and
 * transition. When reserves are low, the price jumps and the
 * transition to alternatives accelerates.
 */
/**
 * Energy market with OPEC-style events, strategic reserves and transition.
 *
 * Runs hourly, so all rates are scaled by TICKS_PER_MONTH (720): the old
 * version treated monthly probabilities and decrements as hourly, which
 * fired OPEC events ~6x/month, drained the strategic reserve in days and
 * ended shocks after a few hours instead of months.
 */
export function simulateEnergyMarket(state: GameState) {
  const eco = state.economy;
  const PER_HOUR = 1 / (24 * 30);

  // Base: long-run mean reversion at ~3%/month.
  const longRun = 3.4 * (1 + eco.inflation / 100);
  eco.dieselPrice += (longRun - eco.dieselPrice) * 0.03 * PER_HOUR
    + (Math.random() - 0.5) * 0.18 * PER_HOUR;

  // OPEC events: ~0.8% chance per MONTH in a boom (0.008 x PER_HOUR hourly),
  // glut in a recession.
  if (eco.cycle === 'boom' && Math.random() < 0.008 * PER_HOUR) {
    eco.fuelShockMonths = 3 + Math.floor(Math.random() * 4);
    eco.dieselPrice *= 1.25;
    pushTicker(state, 'OPEC+ cuts production — diesel jumps on supply concerns', 'breaking');
  } else if (eco.cycle === 'recession' && Math.random() < 0.012 * PER_HOUR) {
    eco.fuelShockMonths = 2 + Math.floor(Math.random() * 2);
    eco.dieselPrice *= 0.9;
  }

  // Strategic reserves: drawn down slowly during a shock (0.5 day per month),
  // replenished even more slowly in calm periods.
  if (eco.fuelShockMonths > 0) {
    eco.strategicReserveDays = Math.max(30, eco.strategicReserveDays - 0.5 * PER_HOUR);
    eco.fuelShockMonths -= PER_HOUR;
  } else {
    eco.strategicReserveDays = Math.min(180, eco.strategicReserveDays + 0.2 * PER_HOUR);
  }

  // Energy transition headline when diesel stays expensive for a sustained stretch.
  if (eco.dieselPrice > 5.0 && Math.random() < 0.02 * PER_HOUR) {
    pushTicker(state, 'High diesel prices accelerate investment in energy efficiency', 'info');
  }

  eco.dieselPrice = Math.max(1.4, Math.min(7.5, eco.dieselPrice));
}

function pushTicker(state: GameState, text: string, type: 'info' | 'breaking' | 'warning') {
  state.stockMarket.ticker.unshift({ id: generateId(), text, type, tick: state.tick });
  if (state.stockMarket.ticker.length > 30) state.stockMarket.ticker.pop();
}

