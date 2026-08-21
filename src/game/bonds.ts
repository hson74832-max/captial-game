import type { GameState, Bond, CreditRating, Company, BondQuote } from './types';
import { generateId } from './engine';

const TICKS_PER_MONTH = 24 * 30;
const TICKS_PER_YEAR = TICKS_PER_MONTH * 12;

/**
 * Term structure of interest rates. The 3-month, 2-year and 10-year yields
 * move together but not identically — the slope and shape carry real
 * information about the business cycle and the central bank stance.
 */
export interface YieldCurvePoint {
  tenorYears: 0.25 | 2 | 10;
  yield: number;
  termPremium: number;
}

const RATING_SPREADS: Record<CreditRating, number> = {
  AAA: 0.4, AA: 0.7, A: 1.1, BBB: 1.8, BB: 3.1, B: 4.8,
  CCC: 7.2, CC: 9.2, C: 12, D: 18,
};

export function ratingSpread(rating: CreditRating): number {
  return RATING_SPREADS[rating] ?? 6;
}

/** Compute a synthetic yield curve from the policy rate, expectations and rating mix. */
export function computeYieldCurve(state: GameState): YieldCurvePoint[] {
  const policy = state.economy.interestRate;
  const exp = expectedPolicyPath(state);
  const termPremium10y = 1.2;
  const termPremium2y = 0.3;
  const termPremium3m = -0.15;
  return [
    { tenorYears: 0.25, yield: Math.max(0, policy * 0.6 + termPremium3m), termPremium: termPremium3m },
    { tenorYears: 2,    yield: Math.max(0, exp.year2 + termPremium2y), termPremium: termPremium2y },
    { tenorYears: 10,   yield: Math.max(0, exp.year10 + termPremium10y), termPremium: termPremium10y },
  ];
}

function expectedPolicyPath(state: GameState): { year2: number; year10: number } {
  // Markets price an expected path: 2y near the current rate, 10y mean-reverting to neutral.
  const r = state.economy.interestRate;
  const neutral = 2.5;
  const inertia = 0.4;
  return {
    year2: r * (1 - inertia * 0.4) + neutral * inertia * 0.4,
    year10: r * 0.2 + neutral * 0.8,
  };
}

/**
 * Build the initial bond inventory. The player does not start with bonds but
 * the AI has issued a few and they become tradeable immediately.
 */
export function generateInitialBonds(state: GameState): Bond[] {
  const startYear = state.year;
  return state.companies.slice(1, 5).map((company, index) => {
    const termYears = ([5, 10, 15] as const)[index] ?? 5;
    return {
      id: generateId(),
      issuerId: company.id,
      faceValue: 1000,
      quantity: 4000 + index * 2000,
      termYears,
      issueYear: startYear - 1,
      maturityYear: startYear - 1 + termYears,
      couponRate: state.economy.interestRate + ratingSpread(company.bondRating) + termYears * 0.08,
      rating: company.bondRating,
      marketPrice: 96 + index * 2.5,
      holderId: null,
      defaulted: false,
    };
  });
}

/** Yield to maturity for a bond at a given market price. */
export function yieldToMaturity(quote: BondQuote): number {
  const yearsLeft = quote.maturityYear - quote.currentYear;
  if (yearsLeft <= 0) return 0;
  const annualCoupon = quote.faceValue * (quote.couponRate / 100);
  // Approximate YTM for a bond trading below face value.
  const gain = (quote.faceValue - quote.marketPrice) / yearsLeft;
  return ((annualCoupon + gain) / ((quote.faceValue + quote.marketPrice) / 2)) * 100;
}

/** Mark every bond to market against the current yield curve. */
export function markToMarket(state: GameState) {
  const curve = computeYieldCurve(state);
  const y10 = curve.find(p => p.tenorYears === 10)!.yield;
  for (const bond of state.bonds) {
    if (bond.defaulted) { bond.marketPrice = 5; continue; }
    const yearsLeft = bond.maturityYear - state.year;
    if (yearsLeft <= 0) {
      bond.marketPrice = bond.faceValue;
      continue;
    }
    const required = y10 + ratingSpread(bond.rating) + (bond.termYears - 10) * 0.05;
    // Inverse price-yield relationship: required yield drives price.
    const impliedPrice = Math.max(35, Math.min(125, bond.faceValue * (bond.couponRate / required)));
    bond.marketPrice = impliedPrice;
  }
}

/** Quarterly coupon payments: bond holders collect face × coupon × quantity / 4. */
export function payCoupons(state: GameState) {
  if (state.month % 3 !== 0) return;
  for (const bond of state.bonds) {
    if (bond.defaulted) continue;
    const quarterly = bond.faceValue * bond.couponRate / 100 * bond.quantity / 4;
    // The issuer pays.
    const issuer = state.companies.find(c => c.id === bond.issuerId);
    if (!issuer) continue;
    if (issuer.cash < quarterly) {
      bond.defaulted = true;
      addNewsTicker(state, `${issuer.name} defaults on bond coupon — market price collapses`, 'danger');
      continue;
    }
    issuer.cash -= quarterly;
    issuer.expenses += quarterly;
    // The player collects if they hold it.
    if (bond.holderId === 'player') {
      const player = state.companies.find(c => c.isPlayer);
      if (player) {
        player.cash += quarterly;
        addNewsTicker(state, `Bond coupon: $${fmt(quarterly)} from ${issuer.name}`, 'info');
      }
    } else if (bond.holderId) {
      const holder = state.companies.find(c => c.id === bond.holderId);
      if (holder) holder.cash += quarterly;
    }
  }
}

function addNewsTicker(state: GameState, text: string, type: 'info' | 'warning' | 'danger' | 'breaking' = 'info') {
  state.stockMarket.ticker.unshift({ id: generateId(), text, type, tick: state.tick });
  if (state.stockMarket.ticker.length > 30) state.stockMarket.ticker.pop();
}

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + 'B';
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toFixed(0);
}

/** Buy a bond with the player's cash. Trades are at quoted market price. */
export function buyBond(state: GameState, bondId: string): GameState {
  const bond = state.bonds.find(b => b.id === bondId);
  const player = state.companies.find(c => c.isPlayer);
  if (!bond || !player) return state;
  if (bond.defaulted) return state;
  if (bond.holderId && bond.holderId !== 'player') return state;

  const cost = bond.faceValue * bond.quantity * bond.marketPrice / 100;
  if (player.cash < cost) {
    addNewsTicker(state, `Insufficient cash to buy $${fmt(cost)} of ${state.companies.find(c => c.id === bond.issuerId)?.name ?? ''} bonds`, 'warning');
    return state;
  }
  player.cash -= cost;
  bond.holderId = 'player';
  return { ...state };
}

export function sellBond(state: GameState, bondId: string): GameState {
  const bond = state.bonds.find(b => b.id === bondId);
  const player = state.companies.find(c => c.isPlayer);
  if (!bond || !player) return state;
  if (bond.holderId !== 'player') return state;
  const proceeds = bond.faceValue * bond.quantity * bond.marketPrice / 100;
  player.cash += proceeds;
  bond.holderId = null;
  return { ...state };
}

export function issueBond(state: GameState, amount: number, termYears: 5 | 10 | 15): GameState {
  const company = state.companies.find(c => c.isPlayer);
  if (!company || amount < 1_000_000) return state;
  // Net-asset based capacity (60%), same rule as bank loans — prevents the
  // issue-then-capacity-grows-then-issue-more pyramid.
  const capacity = Math.max(0, (company.totalAssets - company.debt) * 0.6);
  const issueAmount = Math.min(amount, capacity);
  if (issueAmount <= 0) return state;
  const faceValue = 1000;
  const quantity = Math.floor(issueAmount / faceValue);
  const couponRate = state.economy.interestRate + ratingSpread(company.bondRating) + termYears * 0.08;
  const bond: Bond = {
    id: generateId(),
    issuerId: company.id,
    faceValue,
    quantity,
    termYears,
    issueYear: state.year,
    maturityYear: state.year + termYears,
    couponRate,
    rating: company.bondRating,
    marketPrice: 100,
    holderId: null,
    defaulted: false,
  };
  state.bonds.push(bond);
  company.cash += faceValue * quantity;
  company.debt += faceValue * quantity;
  return { ...state };
}

/** Yearly: matured bonds either redeem or default. */
export function settleBonds(state: GameState) {
  for (const bond of state.bonds) {
    if (bond.defaulted) continue;
    if (bond.maturityYear > state.year) continue;
    const issuer = state.companies.find(c => c.id === bond.issuerId);
    if (!issuer) continue;
    const redemption = bond.faceValue * bond.quantity;
    if (issuer.cash < redemption) {
      bond.defaulted = true;
      addNewsTicker(state, `${issuer.name} defaults on maturing bonds — a $${fmt(redemption)} hole`, 'breaking');
      continue;
    }
    issuer.cash -= redemption;
    if (bond.holderId === 'player') {
      const player = state.companies.find(c => c.isPlayer);
      if (player) {
        player.cash += redemption;
        addNewsTicker(state, `Bond matured: principal $${fmt(redemption)} returned`, 'info');
      }
    }
    bond.marketPrice = 0;
  }
}
