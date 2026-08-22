import type { Bond, BondQuote, CreditRating, GameState } from './types';
import { notify, news, money } from './systems';
import { uid } from './world';

// ════════════════════════════════════════════════════════════════════
// TERM STRUCTURE
// ════════════════════════════════════════════════════════════════════
/**
 * The 3-month, 2-year and 10-year yields move together but not identically —
 * the slope and shape carry real information about the business cycle and the
 * central bank stance.
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

export function ratingSpread(rating: string): number {
  return RATING_SPREADS[rating as CreditRating] ?? 6;
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

export function computeYieldCurve(state: GameState): YieldCurvePoint[] {
  const policy = state.economy.interestRate;
  const exp = expectedPolicyPath(state);
  const tp10 = 1.2, tp2 = 0.3, tp3m = -0.15;
  const y3m = Math.max(0, policy * 0.6 + tp3m);
  const y2 = Math.max(0, exp.year2 + tp2);
  const y10 = Math.max(0, exp.year10 + tp10);
  // Keep the economy's published curve in sync so the UI and engine agree.
  state.economy.threeMonthYield = y3m;
  state.economy.twoYearYield = y2;
  state.economy.tenYearYield = y10;
  return [
    { tenorYears: 0.25, yield: y3m, termPremium: tp3m },
    { tenorYears: 2, yield: y2, termPremium: tp2 },
    { tenorYears: 10, yield: y10, termPremium: tp10 },
  ];
}

/**
 * Build the initial bond inventory. The player starts with none, but the AI has
 * issued a few and they become tradeable immediately.
 */
export function generateInitialBonds(state: GameState): Bond[] {
  const startYear = state.year;
  return state.companies.slice(1, 5).map((company, index) => {
    const termYears = ([5, 10, 15] as const)[index] ?? 5;
    return {
      id: uid('bond'),
      issuerId: company.id,
      faceValue: 1000,
      quantity: 4000 + index * 2000,
      termYears,
      issueYear: startYear - 1,
      maturityYear: startYear - 1 + termYears,
      couponRate: state.economy.interestRate + ratingSpread(company.bondRating) + termYears * 0.08,
      rating: company.bondRating as CreditRating,
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
    if (yearsLeft <= 0) { bond.marketPrice = bond.faceValue; continue; }
    const required = y10 + ratingSpread(bond.rating) + (bond.termYears - 10) * 0.05;
    // Inverse price-yield relationship: required yield drives price.
    bond.marketPrice = Math.max(35, Math.min(125, bond.faceValue * (bond.couponRate / required)));
  }
}

/** Quarterly coupons: holders collect face × coupon × quantity / 4. */
export function payCoupons(state: GameState) {
  if (state.month % 3 !== 0) return;
  const player = state.companies.find(c => c.id === state.playerCompanyId);
  for (const bond of state.bonds) {
    if (bond.defaulted) continue;
    const quarterly = bond.faceValue * bond.couponRate / 100 * bond.quantity / 4;
    const issuer = state.companies.find(c => c.id === bond.issuerId);
    if (!issuer) continue;
    if (issuer.cash < quarterly) {
      bond.defaulted = true;
      news(state, `${issuer.name} defaults on a bond coupon — market price collapses`, 'breaking');
      continue;
    }
    issuer.cash -= quarterly;
    issuer.expenses += quarterly;

    if (bond.holderId === 'player') {
      if (player) {
        player.cash += quarterly;
        notify(state, `Bond coupon: ${money(quarterly)} from ${issuer.name}.`, 'success');
      }
    } else if (bond.holderId) {
      const holder = state.companies.find(c => c.id === bond.holderId);
      if (holder) holder.cash += quarterly;
    }
  }
}

/** Buy a bond at the quoted market price. */
export function buyBond(state: GameState, bondId: string) {
  const bond = state.bonds.find(b => b.id === bondId);
  const player = state.companies.find(c => c.id === state.playerCompanyId);
  if (!bond || !player || bond.defaulted) return;
  if (bond.holderId && bond.holderId !== 'player') {
    notify(state, 'That issue is already held by another investor.', 'warning');
    return;
  }
  const cost = bond.faceValue * bond.quantity * bond.marketPrice / 100;
  if (player.cash < cost) {
    notify(state, `Need ${money(cost)} to buy that block.`, 'danger');
    return;
  }
  player.cash -= cost;
  bond.holderId = 'player';
  const issuer = state.companies.find(c => c.id === bond.issuerId);
  notify(state, `Bought ${money(cost)} of ${issuer?.name ?? ''} ${bond.maturityYear} bonds at ${bond.marketPrice.toFixed(1)}.`, 'success');
}

export function sellBond(state: GameState, bondId: string) {
  const bond = state.bonds.find(b => b.id === bondId);
  const player = state.companies.find(c => c.id === state.playerCompanyId);
  if (!bond || !player || bond.holderId !== 'player') return;
  const proceeds = bond.faceValue * bond.quantity * bond.marketPrice / 100;
  player.cash += proceeds;
  bond.holderId = null;
  notify(state, `Sold bonds for ${money(proceeds)} at ${bond.marketPrice.toFixed(1)} per 100 face.`, 'info');
}

export function issueBond(state: GameState, amount: number, termYears: 5 | 10 | 15) {
  const company = state.companies.find(c => c.id === state.playerCompanyId);
  if (!company) return;
  // Net-asset based capacity (60%), the same rule as bank loans — prevents the
  // issue-then-capacity-grows-then-issue-more pyramid.
  const capacity = Math.max(0, (company.totalAssets - company.debt) * 0.6);
  const issueAmount = Math.min(amount, capacity);
  if (issueAmount < 1_000_000) {
    notify(state, `Borrowing capacity exhausted — you can still issue ${money(Math.max(0, capacity))}.`, 'warning');
    return;
  }
  const faceValue = 1000;
  const quantity = Math.floor(issueAmount / faceValue);
  const couponRate = state.economy.interestRate + ratingSpread(company.bondRating) + termYears * 0.08;
  state.bonds.push({
    id: uid('bond'), issuerId: company.id, faceValue, quantity, termYears,
    issueYear: state.year, maturityYear: state.year + termYears, couponRate,
    rating: company.bondRating as CreditRating, marketPrice: 100, holderId: null, defaulted: false,
  });
  const raised = faceValue * quantity;
  company.cash += raised;
  company.debt += raised;
  notify(state, `Issued ${money(raised)} of ${termYears}-year bonds at ${couponRate.toFixed(2)}%.`, 'success');
  news(state, `${company.name} prices ${money(raised)} of ${termYears}-year debt at ${couponRate.toFixed(2)}%`, 'info');
}

/** Yearly: matured bonds either redeem or default. */
export function settleBonds(state: GameState) {
  const player = state.companies.find(c => c.id === state.playerCompanyId);
  for (const bond of state.bonds) {
    if (bond.defaulted) continue;
    if (bond.maturityYear > state.year) continue;
    const issuer = state.companies.find(c => c.id === bond.issuerId);
    if (!issuer) continue;
    const redemption = bond.faceValue * bond.quantity;
    if (issuer.cash < redemption) {
      bond.defaulted = true;
      news(state, `${issuer.name} defaults on maturing bonds — a ${money(redemption)} hole`, 'breaking');
      continue;
    }
    issuer.cash -= redemption;
    issuer.debt = Math.max(0, issuer.debt - redemption);
    if (bond.holderId === 'player') {
      if (player) {
        player.cash += redemption;
        notify(state, `Bond matured: ${money(redemption)} principal returned.`, 'success');
      }
    } else if (bond.holderId) {
      const holder = state.companies.find(c => c.id === bond.holderId);
      if (holder) holder.cash += redemption;
    }
    bond.marketPrice = 0;
  }
  state.bonds = state.bonds.filter(b => !(b.defaulted && b.marketPrice === 0 && b.holderId === null));
}
