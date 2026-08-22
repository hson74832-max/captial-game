import type { GameState } from './types';
import { notify, news, money } from './systems';
import { uid } from './world';

// ════════════════════════════════════════════════════════════════════
// COMPETITION MODES: COURNOT vs BERTRAND
// ════════════════════════════════════════════════════════════════════
/**
 * Industries compete on quantity or on price, and the difference is not
 * cosmetic — it changes what a rival does when you take share.
 *
 *  · BERTRAND (price competition): firms undercut each other. Equilibrium
 *    drives price toward marginal cost and margins collapse. Typical where
 *    products are homogeneous and capacity is flexible (retail, commodities).
 *  · COURNOT (quantity competition): firms set output and let price clear.
 *    Restricting output raises price, so incumbents are disciplined and
 *    margins hold. Typical where capacity is lumpy and slow to add
 *    (heavy industry, mining, autos).
 *
 * The player can switch an industry's mode; AI boards respond accordingly.
 */
export function competitionMode(state: GameState, category: string): 'cournot' | 'bertrand' {
  return state.competitionModes[category] ?? 'bertrand';
}

export function setCompetitionMode(state: GameState, category: string, mode: 'cournot' | 'bertrand') {
  state.competitionModes[category] = mode;
  notify(state, `${category} now competes on ${mode === 'cournot' ? 'volume (Cournot)' : 'price (Bertrand)'}.`,
    'info');
}

/** Herfindahl–Hirschman index of a category by built capacity. */
export function industryHHI(state: GameState, category: string): number {
  const products = state.products.filter(p => p.category === category).map(p => p.id);
  const byOwner = new Map<string, number>();
  let total = 0;
  for (const b of state.buildings) {
    if (b.companyId === 'system') continue;
    const relevant = b.products.some(p => products.includes(p));
    if (!relevant) continue;
    byOwner.set(b.companyId, (byOwner.get(b.companyId) ?? 0) + b.capacity);
    total += b.capacity;
  }
  if (total <= 0) return 0;
  let hhi = 0;
  for (const cap of byOwner.values()) hhi += Math.pow((cap / total) * 100, 2);
  return hhi;
}

/**
 * Contestable markets: even a monopolist behaves when entry is cheap. If an
 * industry needs little capital to enter, incumbents price defensively
 * regardless of their measured share — the *threat* disciplines them.
 */
export function entryThreat(state: GameState, category: string): number {
  const products = state.products.filter(p => p.category === category);
  const avgCost = products.length
    ? products.reduce((s, p) => s + p.productionCost, 0) / products.length : 100;
  // Cheap-to-enter industries are always contestable.
  const costFactor = Math.max(0.05, 1 - Math.log10(1 + avgCost) / 5.5);
  // Incumbent scale raises the barrier a challenger must clear.
  let incumbentCap = 0;
  for (const b of state.buildings) {
    if (b.companyId === 'system') continue;
    if (b.products.some(p => products.some(pr => pr.id === p))) incumbentCap += b.capacity;
  }
  const scaleBarrier = Math.min(0.5, incumbentCap / 40_000);
  return Math.max(0.03, costFactor - scaleBarrier);
}

/**
 * Market-power margin uplift. Concentrated, contestable-protected industries
 * earn more; the effect is stronger under Cournot because output discipline
 * sustains price.
 */
export function marketPowerMargin(state: GameState, companyId: string, category: string): number {
  const mode = competitionMode(state, category);
  const hhi = industryHHI(state, category);
  const threat = entryThreat(state, category);
  const concentration = Math.min(1, hhi / 4000);
  const contestability = 1 - threat;
  const cournotBoost = mode === 'cournot' ? 1.35 : 1.0;
  const owns = state.buildings.some(b => b.companyId === companyId
    && b.products.some(p => state.products.find(x => x.id === p)?.category === category));
  if (!owns) return 1;
  return 1 + concentration * contestability * 0.30 * cournotBoost;
}

// ════════════════════════════════════════════════════════════════════
// AI CAPABILITY: intel, R&D, training, buybacks, executives, lobbying
// ════════════════════════════════════════════════════════════════════
/**
 * Information symmetry. AI boards do not see the player's books, but they DO
 * see aggregated market data — the same public tape the player reads. Each
 * board refreshes its view on its own cadence, so sharper firms react faster
 * and dull ones lag, but none of them is blind.
 */
export function refreshAIIntel(state: GameState) {
  for (const co of state.companies) {
    if (co.isPlayer) continue;
    // Sharper boards refresh more often, but never instantly.
    const cadence = Math.round(24 * 30 * (1.6 - co.acumen));
    if (state.tick - co.marketIntelTick < cadence) continue;
    co.marketIntelTick = state.tick;

    // Aggregate the public tape: national prices and observed player share.
    for (const product of state.products) {
      const playerSites = state.buildings.filter(b =>
        b.companyId === state.playerCompanyId && b.products.includes(product.id));
      const share = playerSites.reduce((s, b) => s + b.utilization, 0) / Math.max(1, playerSites.length * 100);
      co.observedPlayerShare[product.id] = Math.round(share * 100);
    }
  }
}

/**
 * Bluff detection. A rival that persistently prices below its own costs is
 * either predatory or bluffing; boards that notice stop chasing the price and
 * instead defend share through service and capacity. This stops the player
 * from permanently buying loyalty with below-cost pricing.
 */
export function detectBluffs(state: GameState) {
  const playerId = state.playerCompanyId;
  for (const co of state.companies) {
    if (co.isPlayer) continue;
    for (const b of state.buildings.filter(x => x.companyId === co.id)) {
      if (b.pricingMultiplier >= 0.92) continue;
      // A player site nearby undercutting us hard.
      const rival = state.buildings.find(pb =>
        pb.companyId === playerId && pb.cityId === b.cityId && pb.type === b.type
        && pb.pricingMultiplier < 0.9);
      if (!rival) { co.suspectedPredation = Math.max(0, co.suspectedPredation - 0.5); continue; }

      co.suspectedPredation += 0.35;
      if (co.suspectedPredation > 6 && Math.random() < 0.25) {
        // Stop the price war; compete on quality/service instead.
        b.pricingMultiplier = Math.min(1.25, b.pricingMultiplier + 0.04);
        b.trainingLevel = Math.min(9, b.trainingLevel + 0.5);
        b.adBudget = Math.min(200_000, b.adBudget * 1.12);
        if (co.suspectedPredation > 6 && co.suspectedPredation < 6.6) {
          news(state, `${co.name} refuses to be drawn into a price war — investing in service instead`, 'info');
        }
      }
    }
  }
}

/** Cournot/Bertrand-driven AI response to the player taking share. */
export function applyCompetitionDoctrine(state: GameState) {
  for (const co of state.companies) {
    if (co.isPlayer) continue;
    for (const b of state.buildings.filter(x => x.companyId === co.id)) {
      const product = state.products.find(p => p.id === (b.productId ?? b.products[0]));
      if (!product) continue;
      const mode = competitionMode(state, product.category);

      if (mode === 'cournot') {
        // Quantity setter: hold price, manage output. Tight markets let us
        // lift price; gluts make us cut runs rather than slash price.
        const util = b.utilization / 100;
        if (util > 0.9) b.pricingMultiplier = Math.min(1.5, b.pricingMultiplier + 0.012);
        else if (util < 0.5) b.productionIntensity = Math.max(0.7, b.productionIntensity - 0.02);
      } else {
        // Price setter: shade price toward the cheapest credible rival.
        const rival = state.buildings
          .filter(r => r.companyId !== co.id && r.cityId === b.cityId && r.type === b.type)
          .sort((x, y) => x.pricingMultiplier - y.pricingMultiplier)[0];
        if (rival && b.pricingMultiplier > rival.pricingMultiplier) {
          b.pricingMultiplier = Math.max(0.82,
            b.pricingMultiplier - (b.pricingMultiplier - rival.pricingMultiplier) * 0.08 * co.acumen);
        }
      }
    }
  }
}

/**
 * AI research scales with market share. Previously the player could out-tech
 * every rival indefinitely; now a dominant AI funds R&D in proportion to the
 * share it is defending, so leadership in a high-tech category attracts real
 * challengers.
 */
export function simulateAIRnD(state: GameState) {
  for (const co of state.companies) {
    if (co.isPlayer) continue;
    const mine = state.buildings.filter(b => b.companyId === co.id);
    if (mine.length === 0) continue;
    const total = Math.max(1, state.buildings.filter(b => b.companyId !== 'system').length);
    const share = mine.length / total;

    // Budget scales with share and board quality — leaders invest hardest.
    co.rndBudgetMonthly = Math.max(0, co.monthlyRevenue * (0.04 + share * 0.16) * co.acumen);
    if (co.cash < co.rndBudgetMonthly * 3) continue;
    co.cash -= co.rndBudgetMonthly;

    // Target the most valuable product line the company actually touches.
    const candidates = state.products.filter(p =>
      (p.category === 'Electronics' || p.category === 'Computers'
        || p.category === 'Communication' || p.category === 'Health'
        || p.category === 'Auto')
      && mine.some(b => b.products.includes(p.id) || b.productId === p.id));
    if (candidates.length === 0) continue;
    const target = candidates[Math.floor(Math.random() * candidates.length)];

    // Diminishing returns: catching up is easier than extending a lead.
    const gain = (0.35 + share * 1.6) * co.acumen;
    target.quality = Math.min(100, target.quality + gain * 0.1);
    target.techLevel += gain * 0.02;

    if (target.techLevel > 8 && Math.random() < 0.01) {
      news(state, `${co.name} announces a technology advance in ${target.name}`, 'breaking');
    }
  }
}

/** AI boards also train their people and buy back their own stock. */
export function simulateAIDevelopment(state: GameState) {
  for (const co of state.companies) {
    if (co.isPlayer) continue;

    // ── Intensive training ──
    if (Math.random() > 0.08 + co.acumen * 0.12) continue;
    const weak = state.buildings
      .filter(b => b.companyId === co.id && b.trainingLevel < 9 && b.employees > 0)
      .sort((a, b) => a.trainingLevel - b.trainingLevel)[0];
    if (!weak) continue;
    const cost = weak.employees * 2400;
    if (co.cash > cost * 6) {
      co.cash -= cost;
      weak.trainingLevel = Math.min(9, weak.trainingLevel + 0.6);
      weak.trainingBudget = Math.min(1, weak.trainingBudget + 0.08);
    }

    // ── Automation investment ──
    if (co.acumen > 0.6 && Math.random() < 0.05) {
      const site = state.buildings.find(b => b.companyId === co.id && b.automationLevel < 5
        && (b.type === 'factory' || b.type === 'warehouse' || b.type === 'mine'));
      if (site) {
        const cost = site.constructionCost * 0.16 * (site.automationLevel + 1);
        if (co.cash > cost * 2.5) {
          co.cash -= cost;
          site.automationLevel += 1;
          site.targetEmployees = Math.max(2, Math.round(site.targetEmployees * 0.86));
          site.capacity = Math.round(site.capacity * 1.09);
        }
      }
    }

    // ── Share buybacks ──
    if (co.buybackYear !== state.year) { co.buybackYear = state.year; co.sharesBoughtBackThisYear = 0; }
    const float = Math.max(0, co.sharesOutstanding - co.founderShares);
    const cap = co.sharesOutstanding * 0.05;
    if (co.cash > 25_000_000 && co.acumen > 0.5
      && co.sharesBoughtBackThisYear < cap && Math.random() < 0.06) {
      const spend = Math.min(co.cash * 0.06, co.monthlyRevenue * 2.5, 40_000_000);
      const buy = Math.min(float * 0.5, Math.floor(spend / Math.max(0.5, co.sharePrice)));
      const cost = buy * co.sharePrice;
      if (buy > 0 && co.cash > cost * 1.5) {
        co.cash -= cost;
        co.treasuryShares += buy;
        co.sharesOutstanding = Math.max(1, co.sharesOutstanding - buy);
        co.sharesBoughtBackThisYear += buy;
        // Retiring stock lifts earnings per share.
        co.sharePrice *= 1 + (buy / Math.max(1, co.sharesOutstanding)) * 0.4;
        co.marketCap = co.sharePrice * co.sharesOutstanding;
        if (Math.random() < 0.25) {
          news(state, `${co.name} repurchases ${buy.toLocaleString()} shares`, 'info');
        }
      }
    }
  }
}

/**
 * Executive labour is auctioned, not priced. Companies bid for a fixed pool of
 * C-suite talent; the premium clears at what the most desperate bidder will
 * pay. The player can no longer monopolise executive talent cheaply — hiring
 * a star means outbidding boards that are now also bidding.
 */
export function simulateExecutiveMarket(state: GameState) {
  const player = state.companies.find(c => c.id === state.playerCompanyId);
  const sites = state.buildings.filter(b => b.type === 'hq' || b.type === 'lab');
  if (sites.length === 0) return;

  // Demand: every unfilled executive seat across the economy.
  let seatsWanted = 0;
  for (const s of sites) seatsWanted += Math.max(0, Math.round(s.capacity * 0.25) - s.employees);
  const supplyOfTalent = Math.max(1, Math.round(sites.length * 1.4));

  // Scarcity premium: more seats than talent means the price clears high.
  const scarcity = Math.max(0.6, seatsWanted / supplyOfTalent);
  const clearingPremium = 0.15 + scarcity * 0.55;

  for (const co of state.companies) {
    // Boards bid their own urgency: richer, more ambitious firms pay more.
    const urgency = 0.7 + co.acumen * 0.5 + (co.strategy === 'aggressive' ? 0.3 : 0);
    const target = clearingPremium * urgency;
    co.execSalaryPremium += (target - co.execSalaryPremium) * 0.2;
  }

  // Executive seats cost real money; skim it off as payroll overhead.
  for (const s of sites) {
    const co = state.companies.find(c => c.id === s.companyId);
    if (!co || s.employees <= 0) continue;
    const avgWage = state.cities.find(c => c.id === s.cityId)?.wageRate ?? 25;
    const premiumBill = s.employees * avgWage * co.execSalaryPremium * 800 / 720;
    co.cash -= premiumBill;
    co.expenses += premiumBill;
  }

  if (player) {
    player.execSalaryPremium += (clearingPremium - player.execSalaryPremium) * 0.2;
  }
}

/**
 * Counter-lobbying. Industry lobby strength now scales with AI market share,
 * so a player that corners an industry faces an organised opposing bloc
 * rather than an empty field.
 */
export function simulateCounterLobby(state: GameState) {
  const total = Math.max(1, state.buildings.filter(b => b.companyId !== 'system').length);
  let aiShare = 0;
  for (const co of state.companies) {
    if (co.isPlayer) continue;
    const owned = state.buildings.filter(b => b.companyId === co.id).length;
    aiShare += owned / total;
  }

  // Base strength from industrial footprint, plus organised AI opposition.
  const industrials = state.buildings.filter(b => b.type === 'factory' || b.type === 'mine').length;
  const footprint = industrials / Math.max(1, state.buildings.length);
  const organised = footprint * 0.55 + aiShare * 0.45;

  state.politics.industryLobby += (Math.min(1, organised) - state.politics.industryLobby) * 0.08;

  // Well-funded blocs bend policy between elections.
  if (Math.random() < 0.02 && state.politics.industryLobby > 0.55) {
    state.economy.carbonTaxPerUnit = Math.max(0, state.economy.carbonTaxPerUnit - 0.05);
    state.politics.antitrustThreshold = Math.min(60, state.politics.antitrustThreshold + 0.4);
  }
}

/** Grant an AI a patent when its R&D produces something defensible. */
export function maybeGrantAIPatent(state: GameState) {
  for (const co of state.companies) {
    if (co.isPlayer || co.rndBudgetMonthly <= 0) continue;
    if (Math.random() > 0.004) continue;
    const mine = state.buildings.filter(b => b.companyId === co.id);
    const candidates = state.products.filter(p =>
      mine.some(b => b.products.includes(p.id) || b.productId === p.id));
    if (candidates.length === 0) continue;
    const target = candidates[Math.floor(Math.random() * candidates.length)];
    state.patents = state.patents.filter(p => p.productId !== target.id);
    state.patents.push({
      id: uid('pat'), productId: target.id, ownerId: co.id,
      grantedYear: state.year, expiresYear: state.year + 5,
    });
    news(state, `${co.name} patents a new ${target.name} process — five years of exclusivity`, 'breaking');
  }
}

export { money };
