import type { GameState } from './types';
import { TICKS_PER_MONTH } from './constants';
import { news } from './systems';

// ════════════════════════════════════════════════════════════════════
// QUANTITATIVE EASING & MONETARY AGGREGATES
// ════════════════════════════════════════════════════════════════════
/**
 * The policy rate is the central bank's ordinary tool, but it stops working
 * once it reaches the zero lower bound. When that happens — and deflation, not
 * just slow growth, is the threat — the bank buys government bonds outright,
 * expanding its balance sheet and injecting reserves directly.
 *
 * QE is not free money. It lifts asset prices (which is most of the point, via
 * the portfolio-rebalancing channel below), flattens the curve, and builds a
 * balance sheet that eventually has to be normalised. Taper tantrums are real:
 * announcing an exit tightens conditions even before a single bond is sold.
 */
export function runQuantitativeEasing(state: GameState) {
  const eco = state.economy;
  const PER_HOUR = 1 / TICKS_PER_MONTH;
  const gdp = Math.max(1_000_000, eco.nominalGdp);
  const atZLB = eco.interestRate <= 0.75;
  const deflationRisk = eco.inflation < 1.2;
  const slack = eco.unemployment > 7.5;

  // ── Activate: rate can go no lower but the economy still needs support ──
  if (!eco.qeActive && atZLB && (deflationRisk || slack) && Math.random() < 0.02) {
    eco.qeActive = true;
    eco.qeMonthlyPace = 0.015 + Math.random() * 0.01; // 1.5–2.5% of GDP/mo
    news(state, 'Central bank launches large-scale asset purchases as policy rate hits its floor', 'breaking');
  }

  // ── Operate: buy bonds, expand reserves, compress term premia ──
  if (eco.qeActive) {
    const purchase = gdp * eco.qeMonthlyPace * PER_HOUR;
    eco.centralBankAssets += purchase;
    eco.qePurchasesToDate += purchase;
    // Buying the long end compresses the term premium — the whole mechanism.
    eco.tenYearYield = Math.max(0.2, eco.tenYearYield - 0.0022 * PER_HOUR * 30);
    eco.twoYearYield = Math.max(0.1, eco.twoYearYield - 0.0008 * PER_HOUR * 30);
  }

  // ── Exit: taper once inflation and jobs normalise ──
  if (eco.qeActive && eco.inflation > 2.4 && eco.unemployment < 6 && Math.random() < 0.012) {
    eco.qeActive = false;
    // Taper tantrum: long yields jump on the announcement alone.
    eco.tenYearYield += 0.55;
    eco.qeMonthlyPace = 0;
    news(state, 'Central bank tapers asset purchases — long yields jump on the announcement', 'warning');
  }

  // ── Monetary aggregates ──
  // M1 is the transactional core of broad money; M2 adds savings. QE raises
  // reserves immediately but only becomes broad money as banks lend it out.
  const monetised = eco.qeActive ? 1.06 : 0.995;
  eco.m1 = Math.max(20, eco.broadMoney * 0.78 * monetised);
  eco.m2 = eco.broadMoney;

  // Household portfolio rebalancing: when cash yields nothing, savers reach
  // for duration and risk. That flow is what actually bids up equities.
  const cashYield = eco.threeMonthYield;
  const reach = Math.max(0, 1 - cashYield / 5) * (eco.inflation > 2 ? 1.25 : 1);
  state.stockMarket.index *= 1 + (reach - 0.5) * 0.00012;
}

// ════════════════════════════════════════════════════════════════════
// TOTAL FACTOR PRODUCTIVITY SHOCKS
// ════════════════════════════════════════════════════════════════════
/**
 * Real business-cycle theory is right about one thing: supply-side technology
 * shocks are a distinct source of fluctuations from demand shocks, and they
 * look different — a good TFP shock raises output *and* eases inflation at the
 * same time, which a demand boom cannot do.
 */
export function simulateTFP(state: GameState) {
  const eco = state.economy;
  const PER_HOUR = 1 / TICKS_PER_MONTH;

  // Trend growth with occasional discrete jumps (general-purpose tech) and
  // smaller continuous diffusion.
  const trend = 1.4;
  const diffusion = 0.02;
  eco.tfpLevel *= 1 + ((trend / 100) / 12) * PER_HOUR + diffusion * PER_HOUR * 0.01;

  // Discrete breakthrough: rare, but shifts the whole production frontier.
  if (Math.random() < 0.0016) {
    const jump = 0.8 + Math.random() * 2.4;
    eco.tfpLevel *= 1 + jump / 100;
    news(state, `Productivity surge: a general-purpose technology lifts economy-wide TFP ${jump.toFixed(1)}%`, 'breaking');
  }
  // Adverse supply shock (pandemic, blockade, regulatory drag).
  if (Math.random() < 0.0008) {
    const drop = 0.5 + Math.random() * 1.5;
    eco.tfpLevel *= 1 - drop / 100;
    news(state, `Adverse supply shock knocks ${drop.toFixed(1)}% off productive capacity`, 'warning');
  }

  const growth = (eco.tfpLevel / 100 - 1) * 100;
  eco.tfpGrowth += (growth * 12 - eco.tfpGrowth) * 0.05;

  // A productive economy grows faster and inflates less — the supply-side
  // signature that distinguishes this from a demand boom.
  eco.gdpGrowth += eco.tfpGrowth * 0.004;
  eco.inflation = Math.max(-2, eco.inflation - eco.tfpGrowth * 0.0015);
}

// ════════════════════════════════════════════════════════════════════
// KITCHIN INVENTORY CYCLE
// ════════════════════════════════════════════════════════════════════
/**
 * The shortest real business cycle, 3–5 years, driven purely by inventories.
 * Firms over-order in good times, get caught with stock when demand turns,
 * destock hard — the destocking itself deepens the downturn — then restock
 * from a low base, which is what makes recoveries feel so springy.
 *
 * The accelerator matters because it is self-reinforcing: a change in final
 * demand produces a *larger* change in production, which is why mild slowdowns
 * turn into sharp recessions in inventory-heavy economies.
 */
export function simulateInventoryCycle(state: GameState) {
  const eco = state.economy;
  const PER_HOUR = 1 / TICKS_PER_MONTH;

  // Measure actual stock cover across the economy.
  let stock = 0, sales = 0;
  for (const b of state.buildings) {
    if (b.companyId === 'system') continue;
    let s = 0;
    for (const v of Object.values(b.inventory)) s += v;
    stock += s;
    sales += b.lastUnitsSold;
  }
  const cover = sales > 0 ? stock / sales : 12; // hours of cover
  const desiredCover = 14 - eco.gdpGrowth * 0.6 + eco.interestRate * 0.5;

  // Gap between desired and actual stock drives the phase.
  const gap = (desiredCover - cover) / Math.max(1, desiredCover);
  eco.inventoryCycle += (Math.max(-1, Math.min(1, gap * 1.6)) - eco.inventoryCycle) * 0.06;

  // Restocking adds to output on top of final demand; destocking subtracts.
  // This is the accelerator: production swings more than consumption.
  const accelerator = eco.inventoryCycle * 0.9;
  eco.gdpGrowth += accelerator * 0.5 * PER_HOUR * 30;

  // Forced destocking shows up as discounting, which is disinflationary.
  if (eco.inventoryCycle < -0.3) eco.inflation -= 0.004 * PER_HOUR * 30;
}

// ════════════════════════════════════════════════════════════════════
// TERMS OF TRADE & COMMODITY SUPERCYCLE
// ════════════════════════════════════════════════════════════════════
/**
 * Terms of trade (export prices / import prices) shift real national income
 * without anyone producing anything. Commodity supercycles are decade-long
 * swings driven by the slow-moving capital stock of extractive industry: high
 * prices induce investment, investment creates gluts, gluts crush prices for
 * years until capacity is retired. Infrastructure booms drive them.
 */
export function simulateTermsOfTrade(state: GameState) {
  const eco = state.economy;
  const PER_HOUR = 1 / TICKS_PER_MONTH;

  // Supercycle: a slow sine plus momentum, ~14-year period, with noise.
  const phase = (state.year - 2000) / 14;
  const structural = Math.sin(phase * Math.PI * 2) * 0.55;
  // Industrialising demand from trade partners amplifies the upswing.
  const partnerDemand = state.tradePartners.reduce((s, p) => s + (1 - p.wageIndex), 0)
    / Math.max(1, state.tradePartners.length);
  eco.commoditySuperCycle += (structural * (0.7 + partnerDemand * 0.6) - eco.commoditySuperCycle) * 0.0008;
  eco.commoditySuperCycle += (Math.random() - 0.5) * 0.004;
  eco.commoditySuperCycle = Math.max(-1, Math.min(1, eco.commoditySuperCycle));

  // Realised terms of trade from actual traded prices.
  let exportIdx = 0, importIdx = 0, n = 0;
  for (const p of state.products) {
    if (p.kind !== 'raw' && p.kind !== 'farm') continue;
    exportIdx += p.currentPrice / Math.max(0.01, p.basePrice);
    importIdx += (state.globalMarket.price[p.id] ?? p.currentPrice) / Math.max(0.01, p.basePrice);
    n++;
  }
  const tot = n > 0 ? (exportIdx / Math.max(0.01, importIdx)) * 100 : 100;
  eco.termsOfTrade += (tot - eco.termsOfTrade) * 0.05;

  // A terms-of-trade gain is a real income gain: it lifts demand without cost.
  const totShock = (eco.termsOfTrade - 100) / 100;
  eco.gdpGrowth += totShock * 0.35 * PER_HOUR * 30;

  // Commodity prices follow the supercycle with hefty beta.
  for (const p of state.products) {
    if (p.kind !== 'raw' && p.kind !== 'farm') continue;
    const beta = p.kind === 'raw' ? 1.0 : 0.55;
    p.basePrice *= 1 + eco.commoditySuperCycle * 0.00006 * beta;
    p.basePrice = Math.max(p.productionCost * 0.6, p.basePrice);
  }

  // Discrete shock: embargo, cartel decision, discovery, crop failure.
  if (Math.random() < 0.0006) {
    const shock = (Math.random() - 0.35) * 14;
    eco.termsOfTrade *= 1 + shock / 100;
    news(state, shock > 0
      ? `Export prices jump ${shock.toFixed(0)}% — a favourable terms-of-trade shock`
      : `Import costs spike ${Math.abs(shock).toFixed(0)}% — the terms of trade turn against us`,
      shock > 0 ? 'info' : 'warning');
  }
}

// ════════════════════════════════════════════════════════════════════
// EMISSIONS TRADING SCHEME
// ════════════════════════════════════════════════════════════════════
/**
 * A cap-and-trade alternative to the carbon tax. The two instruments reach the
 * same outcome by different routes: a tax fixes the *price* and lets emissions
 * float, while the ETS fixes the *quantity* and lets the price float.
 *
 * Quantity certainty is the advantage — the environmental outcome is
 * guaranteed. The disadvantage is price volatility, which is why the scheme
 * banks allowances and the government may auction rather than grandfather.
 */
export function simulateETS(state: GameState) {
  const ets = state.ets;
  const eco = state.economy;

  // The cap tightens every year — that ratchet is the entire policy.
  const annualTighten = 0.03 + state.politics.greenLobby * 0.04;
  ets.cap = Math.max(50_000, ets.cap * (1 - annualTighten / 12));

  // Measure emissions against allowances.
  let emissions = 0;
  const byCompany = new Map<string, number>();
  for (const b of state.buildings) {
    if (b.companyId === 'system' || !b.isOperating) continue;
    const e = b.dailyProduced * (b.type === 'mine' ? 1.5 : b.type === 'factory' ? 1.2 : 0.3);
    emissions += e;
    byCompany.set(b.companyId, (byCompany.get(b.companyId) ?? 0) + e);
  }

  // Allowance price clears where demand meets the cap: scarcity drives price.
  const utilisation = emissions / Math.max(1, ets.cap);
  const target = 18 * Math.pow(Math.max(0.2, utilisation), 2.1);
  ets.price += (target - ets.price) * 0.06;
  ets.price = Math.max(2, Math.min(400, ets.price));
  eco.etsAllowancePrice = ets.price;
  eco.etsCap = ets.cap;

  // Settle: firms must cover their emissions or buy allowances.
  for (const co of state.companies) {
    const emitted = byCompany.get(co.id) ?? 0;
    // Free allocation declines as the cap tightens; the rest must be bought.
    const freeShare = Math.max(0.25, 1 - annualTighten * 4);
    const free = emitted * freeShare;
    const mustBuy = Math.max(0, emitted - free);
    const cost = mustBuy * ets.price * 0.01;
    if (cost <= 0) continue;
    co.cash -= cost;
    co.taxesPaidYTD += cost;
    ets.revenue += cost;
    // Buying allowances is genuinely cheaper than over-emitting — so firms
    // abate when abatement is cheap, which is the point of the instrument.
  }
  ets.surrendered = emissions;

  // Auction revenue funds infrastructure — the double dividend.
  if (ets.revenue > 0) {
    const perCity = ets.revenue / Math.max(1, state.cities.length) / 40_000;
    for (const c of state.cities) {
      c.infrastructure = Math.min(100, c.infrastructure + perCity * 0.0008);
    }
  }

  // Price spikes are political events.
  if (ets.price > 180 && Math.random() < 0.002) {
    news(state, `Carbon permits spike to $${ets.price.toFixed(0)}/t as the cap tightens`, 'warning');
  }
}

export function setEtsCap(state: GameState, cap: number) {
  state.ets.cap = Math.max(20_000, cap);
}
