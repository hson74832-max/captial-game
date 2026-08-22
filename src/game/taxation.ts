import type { GameState } from './types';
import { TICKS_PER_MONTH } from './constants';
import { notify, news, money } from './systems';
import { uid } from './world';

// ════════════════════════════════════════════════════════════════════
// PROPERTY TAX
// ════════════════════════════════════════════════════════════════════
/**
 * Levied monthly on assessed value (construction cost + land) at 1/12 of the
 * annual rate. This is the ongoing cost of *holding* real estate, and it is what
 * makes idle land speculation genuinely expensive rather than free. Receipts fund
 * the city services that lift quality of life.
 */
export function collectPropertyTax(state: GameState) {
  const annualRate = state.economy.propertyTaxRate;
  const monthlyRate = annualRate / 12;
  const receiptsByCity = new Map<string, number>();

  for (const company of state.companies) {
    const owned = state.buildings.filter(b => b.companyId === company.id);
    let bill = 0;
    for (const b of owned) {
      const tax = (b.constructionCost + b.landValue) * monthlyRate;
      bill += tax;
      receiptsByCity.set(b.cityId, (receiptsByCity.get(b.cityId) ?? 0) + tax);
    }

    // Vacant land is taxed directly; developed land is already inside its
    // building's assessed value above.
    const vacantLand = state.landHoldings.filter(h => h.ownerId === company.id && !h.developedBuildingId);
    const landBill = vacantLand.reduce((sum, h) => sum + h.currentValue * annualRate / 12, 0);
    for (const h of vacantLand) {
      if (h.cityId) receiptsByCity.set(h.cityId, (receiptsByCity.get(h.cityId) ?? 0) + h.currentValue * annualRate / 12);
    }
    if (landBill > 0) company.cash -= landBill;
    bill += landBill;
    if (bill <= 0) continue;
    company.taxesPaidYTD += bill;

    if (company.isPlayer && state.month % 3 === 0) {
      notify(state, `Property tax: ${money(bill)} this month on ${owned.length} assets (${(annualRate * 100).toFixed(2)}% annual).`, 'info');
    }
  }

  // Receipts fund municipal services, which lift quality of life over time.
  for (const [cityId, receipts] of receiptsByCity) {
    const city = state.cities.find(c => c.id === cityId);
    if (!city) continue;
    const perCapita = receipts / Math.max(1, city.population);
    const target = 45 + Math.min(35, perCapita * 45_000);
    city.qualityOfLife += (target - city.qualityOfLife) * 0.02;
  }
}

// ════════════════════════════════════════════════════════════════════
// CORPORATE INCOME TAX
// ════════════════════════════════════════════════════════════════════
/**
 * Charged annually on pre-tax operating profit. Losses carry forward and shelter
 * future profit, exactly as real NOL rules work — but they never generate a refund.
 */
export function collectCorporateTax(state: GameState) {
  const rate = state.economy.corporateTaxRate / 100;

  for (const company of state.companies) {
    const pretax = company.pretaxYTD;

    if (pretax <= 0) {
      // A loss year adds to the carry-forward pool.
      company.lossCarryforward += -pretax;
      company.taxesPaidLastYear = company.taxesPaidYTD;
      company.taxesPaidYTD = 0;
      company.pretaxYTD = 0;
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
    company.pretaxYTD = 0;

    if (company.isPlayer) {
      notify(state,
        `Corporate tax assessed: ${money(bill)} on ${money(taxable)} taxable income at ${state.economy.corporateTaxRate}%`
        + (shelter > 0 ? ` (${money(shelter)} sheltered by carried-forward losses).` : '.'),
        bill > 0 ? 'warning' : 'info');
    }
  }
}

// ════════════════════════════════════════════════════════════════════
// DIVIDENDS
// ════════════════════════════════════════════════════════════════════
/**
 * Quarterly dividends with two mechanics that kill arbitrage:
 *  1. Dividend tax — recipients are taxed at the qualified-dividend rate.
 *  2. Ex-dividend price adjustment — the share price drops by the payout on the
 *     ex-date, so you cannot buy before the record date, collect, and sell flat.
 */
export function payDividends(state: GameState) {
  const divTaxRate = state.economy.dividendTaxRate / 100;
  const player = state.companies.find(c => c.id === state.playerCompanyId);

  for (const company of state.companies) {
    const annualProfit = company.profit * 24 * 365;
    if (annualProfit <= 0 || company.dividendPayout <= 0) continue;

    const totalDividend = (annualProfit * company.dividendPayout / 100) / 4;
    if (totalDividend <= 0 || company.cash < totalDividend) continue;

    company.cash -= totalDividend;
    const perShare = totalDividend / Math.max(1, company.sharesOutstanding);

    // The cash left the company, so the shares are worth that much less now.
    company.sharePrice = Math.max(0.5, company.sharePrice - perShare);
    company.marketCap = company.sharePrice * company.sharesOutstanding;

    if (!player) continue;
    const held = player.equityHoldings[company.id] ?? 0;
    if (held <= 0) continue;

    const gross = perShare * held;
    const tax = gross * divTaxRate;
    player.cash += gross - tax;
    player.taxesPaidYTD += tax;

    notify(state,
      `Dividend from ${company.name}: ${money(gross)} gross, ${money(tax)} withheld at ${state.economy.dividendTaxRate}% — `
      + `${money(gross - tax)} net. Shares went ex-dividend at −$${perShare.toFixed(2)}.`,
      'success');
  }
}

// ════════════════════════════════════════════════════════════════════
// MONEY SUPPLY
// ════════════════════════════════════════════════════════════════════
/**
 * M2 is governed by the central bank balance sheet (macro.runCentralBank). This
 * keeps the legacy moneySupply index — used by the crypto market's liquidity
 * linkage — in lockstep with broad money so the two series never diverge.
 */
export function updateMoneySupply(state: GameState) {
  state.economy.moneySupply = state.economy.broadMoney;
}

// ════════════════════════════════════════════════════════════════════
// TAX POLICY
// ════════════════════════════════════════════════════════════════════
/**
 * Tax rates move with the fiscal cycle. Deficits during recessions force rises
 * once recovery arrives; booms permit cuts.
 */
export function reviewTaxPolicy(state: GameState) {
  const eco = state.economy;
  const before = eco.corporateTaxRate;

  if (eco.cycle === 'recession') {
    // Stimulus: cut corporate tax to support investment.
    eco.corporateTaxRate = Math.max(12, eco.corporateTaxRate - 1);
  } else if (eco.cycle === 'boom' && eco.inflation > 4) {
    // Overheating: raise tax to cool demand and repair the balance sheet.
    eco.corporateTaxRate = Math.min(38, eco.corporateTaxRate + 1);
  } else if (Math.random() < 0.3) {
    eco.corporateTaxRate = Math.max(12, Math.min(38,
      eco.corporateTaxRate + (Math.random() < 0.5 ? -1 : 1)));
  }

  // Property tax follows municipal need: growing cities need more services.
  const avgGrowth = state.cities.reduce((s, c) => s + c.growthRate, 0) / Math.max(1, state.cities.length);
  eco.propertyTaxRate = Math.max(0.005, Math.min(0.03,
    eco.propertyTaxRate + (avgGrowth > 1.5 ? 0.0008 : -0.0004)));

  // Dividend tax tracks the political mood on capital.
  eco.dividendTaxRate = Math.max(10, Math.min(28,
    eco.dividendTaxRate + (eco.cycle === 'boom' ? 0.5 : -0.3)));

  if (eco.corporateTaxRate !== before) {
    news(state, `Legislature sets corporate tax at ${eco.corporateTaxRate.toFixed(0)}% (was ${before.toFixed(0)}%)`,
      eco.corporateTaxRate > before ? 'warning' : 'info');
  }
}

// ════════════════════════════════════════════════════════════════════
// SEAPORT REPLENISHMENT
// ════════════════════════════════════════════════════════════════════
/**
 * Ports are import terminals with finite throughput, not infinite money fountains.
 * Stock arrives on ships with real transit time, so a buying binge drains the
 * berth and you must wait for the next sailing. This closes the exploit of
 * buying unlimited cheap goods and reselling them into the same city.
 */
export function replenishSeaports(state: GameState) {
  const origins = ['Pacifica', 'Nordmark', 'Sudamera', 'Eastbridge', 'Atlantic Trade Zone'];
  for (const port of state.buildings) {
    if (port.type !== 'seaport') continue;

    for (const pid of port.products) {
      const product = state.products.find(p => p.id === pid);
      if (!product) continue;
      // Do not duplicate a shipment already at sea for this port/product.
      if (state.portShipments.some(s => s.portBuildingId === port.id && s.productId === pid)) continue;
      const current = port.inventory[pid] ?? 0;
      // Bulk materials travel in large lots; electronics in smaller containers.
      const target = product.kind === 'raw' || product.kind === 'farm' ? 30_000
        : product.kind === 'semi' ? 18_000
          : Math.max(2_000, 10_000 / Math.max(1, Math.log10(product.productionCost + 10)));
      if (current >= target * 0.7) continue;
      const amount = Math.round(Math.min(target - current, target * (0.35 + Math.random() * 0.35)));
      state.portShipments.push({
        id: uid('ship'), portBuildingId: port.id, productId: pid, amount, progress: 0,
        transitHours: Math.round(72 + Math.random() * 288), // 3–15 days
        unitCost: state.globalMarket.price[pid] ?? product.productionCost * 0.9,
        origin: origins[Math.floor(Math.random() * origins.length)],
      });
    }
  }
}

/** Cargo physically arrives: inventory only materialises when the ship berths. */
export function simulatePortShipments(state: GameState) {
  const arrived: string[] = [];
  for (const ship of state.portShipments) {
    ship.progress += 100 / Math.max(1, ship.transitHours);
    if (ship.progress < 100) continue;
    arrived.push(ship.id);
    const port = state.buildings.find(b => b.id === ship.portBuildingId);
    if (!port) continue;
    port.inventory[ship.productId] = Math.min(port.inventoryCapacity,
      (port.inventory[ship.productId] ?? 0) + ship.amount);
    if (state.globalMarket.price[ship.productId] === undefined) {
      const product = state.products.find(p => p.id === ship.productId);
      if (product) state.globalMarket.price[ship.productId] = product.productionCost * 0.9;
    }
  }
  if (arrived.length) state.portShipments = state.portShipments.filter(s => !arrived.includes(s.id));
}

/** Year-end roll: cap carry-forwards and reset YTD counters. */
export function rollFiscalYear(state: GameState) {
  for (const company of state.companies) {
    // Loss carry-forwards expire in most regimes; cap them against asset size.
    company.lossCarryforward = Math.min(company.lossCarryforward, Math.abs(company.totalAssets));
  }
}

export { TICKS_PER_MONTH };
