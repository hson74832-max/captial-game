import type { GameState } from './types';
import { notify, news, money } from './systems';

// ════════════════════════════════════════════════════════════════════
// GEOGRAPHIC LABOUR MOBILITY
// ════════════════════════════════════════════════════════════════════
/**
 * Workers do not teleport to the highest wage. Moving costs money, leases bind,
 * schools and spouses matter, and a city with scarce housing cannot absorb an
 * influx. So wage gaps between cities are only arbitraged slowly, and a boom
 * town runs hot (wage spiral) while a rust belt stays cheap for years.
 *
 * This is what makes city choice a real strategic decision rather than a
 * lookup of the lowest number on a table.
 */
export function simulateLaborMobility(state: GameState) {
  const cities = state.cities;
  if (cities.length < 2) return;

  // Real wage after cost of living, which tracks quality of life and housing.
  const realWage = new Map<string, number>();
  for (const c of cities) {
    const col = 0.75 + (c.qualityOfLife / 100) * 0.5 + Math.max(0, -c.housingDemand) / 200;
    realWage.set(c.id, (c.wageRate * 2080) / col);
  }
  const avgReal = [...realWage.values()].reduce((a, b) => a + b, 0) / cities.length;

  for (const c of cities) {
    const gap = (realWage.get(c.id)! - avgReal) / Math.max(1, avgReal);

    // Stickier cities move less; housing shortage throttles inflow.
    const stickiness = 1 - c.laborMobility;
    const housingBrake = c.housingDemand < 0 ? 0.45 : 1; // shortage = can't house newcomers
    const flow = gap * 0.02 * (1 - stickiness * 0.7) * housingBrake;

    // Migration shifts population and feeds the wage spiral back.
    const migrants = c.population * Math.max(-0.004, Math.min(0.004, flow));
    c.population = Math.max(1_000, c.population + migrants);

    // In-migration eases the local labour market, out-migration tightens it.
    const labourSupplyShift = -migrants * 0.0004;
    c.unemploymentRate = Math.max(1.5, Math.min(22, c.unemploymentRate + labourSupplyShift * 100));

    // Employers must bid up when labour is scarce locally.
    if (flow > 0.001) c.wageRate *= 1 + flow * 0.15;
  }
}

/**
 * Structural (skill-mismatch) unemployment. Some vacancies cannot be filled at
 * any wage because the local workforce lacks the skills. It does not respond
 * to the cycle — only education and training infrastructure close it.
 */
export function simulateSkillMismatch(state: GameState) {
  for (const c of state.cities) {
    // What local industry demands vs what the workforce offers.
    const sites = state.buildings.filter(b => b.cityId === c.id && b.employees > 0);
    const demandedSkill = sites.length
      ? sites.reduce((s, b) => s + b.trainingLevel, 0) / sites.length : 3;
    const suppliedSkill = 1.5 + (c.educationIndex / 100) * 6;
    const mismatch = Math.max(0, demandedSkill - suppliedSkill) / 9;

    c.skillGap += (mismatch - c.skillGap) * 0.05;

    // Infrastructure and education investment slowly closes it.
    const closure = (c.infrastructure / 100) * 0.0004;
    c.skillGap = Math.max(0, c.skillGap - closure);
    c.educationIndex = Math.min(100, c.educationIndex + closure * 40);

    // Structural unemployment sits on top of the cyclical rate — it is the
    // floor that never clears, however hot the economy runs.
    const structural = c.skillGap * 9;
    c.unemploymentRate = Math.max(structural, c.unemploymentRate);
  }
}

/**
 * Automation: substituting capital for labour. Raises throughput and reduces
 * headcount, at the cost of capital and higher maintenance. Unlike training,
 * it is immediately effective — but it is expensive and angers the workforce.
 */
export function automationMultiplier(b: { automationLevel: number }):
  { output: number; headcount: number; upkeep: number } {
  const a = b.automationLevel;
  return {
    output: 1 + a * 0.11,
    headcount: Math.pow(0.86, a),
    upkeep: a * 0.035,
  };
}

export function automateBuilding(state: GameState, buildingId: string) {
  const playerId = state.playerCompanyId;
  const b = state.buildings.find(x => x.id === buildingId);
  const co = state.companies.find(c => c.id === playerId);
  if (!b || !co || b.companyId !== playerId) return;
  if (b.automationLevel >= 5) {
    notify(state, `${b.name} is already fully automated.`, 'warning');
    return;
  }
  const cost = b.constructionCost * 0.16 * (b.automationLevel + 1);
  if (co.cash < cost) {
    notify(state, `Automation needs ${money(cost)}.`, 'warning');
    return;
  }
  co.cash -= cost;
  b.automationLevel += 1;
  b.capacity = Math.round(b.capacity * 1.09);
  b.targetEmployees = Math.max(2, Math.round(b.targetEmployees * 0.86));
  b.morale = Math.max(10, b.morale - 4);
  notify(state,
    `${b.name} automated to level ${b.automationLevel}: +9% throughput, −14% headcount, `
    + `higher upkeep. Morale dipped 4 points.`, 'success');
  news(state, `${co.name} invests in automation at ${b.name}`, 'info');
}

/** Applies automation and structural effects to a building each tick. */
export function applyAutomation(state: GameState) {
  for (const b of state.buildings) {
    if (b.constructionEndsTick > state.tick) continue;
    if (b.automationLevel > 0) {
      const a = automationMultiplier(b);
      const upkeep = (b.constructionCost + b.landValue) * a.upkeep / (365 * 24);
      b.costs.other += upkeep;
    }
    void state;
  }
}

/**
 * Local pollution externalities. PM2.5 damages health, depresses quality of
 * life and drives out skilled workers; water stress caps industrial expansion.
 * These are genuine external costs the polluter does not pay directly — unless
 * the carbon price or the ETS makes them.
 */
export function simulateLocalExternalities(state: GameState) {
  for (const c of state.cities) {
    const sites = state.buildings.filter(b => b.cityId === c.id && b.isOperating);
    let pm = 0, water = 0;
    for (const b of sites) {
      const scale = b.capacity / 500;
      if (b.type === 'factory') { pm += 1.6 * scale; water += 0.06 * scale; }
      else if (b.type === 'mine') { pm += 2.1 * scale; water += 0.04 * scale; }
      else if (b.type === 'farm') { pm += 0.25 * scale; water += 0.16 * scale; }
      else if (b.type === 'warehouse') { pm += 0.35 * scale; }
    }
    // Dispersion: wind and rain clear the air, so it decays toward background.
    c.pm25 = Math.max(4, c.pm25 * 0.97 + pm * 0.03);
    c.waterStress = Math.max(0, Math.min(1, c.waterStress * 0.98 + water * 0.002));

    // Health and amenity damage.
    const pmDamage = Math.max(0, c.pm25 - 12) * 0.22;
    const waterDamage = c.waterStress * 14;
    c.qualityOfLife = Math.max(5, c.qualityOfLife - (pmDamage + waterDamage) * 0.004
      + (c.infrastructure / 100) * 0.02);

    // Dirty air and stressed water repel the mobile skilled workforce.
    if (c.pm25 > 35 || c.waterStress > 0.6) {
      c.educationIndex = Math.max(0, c.educationIndex - 0.004);
      c.laborMobility = Math.max(0.1, c.laborMobility - 0.0008);
    }
  }
}

/**
 * Public goods: infrastructure is financed out of the tax take and raises
 * productivity for everyone — including competitors. Under-providing it is the
 * classic free-rider problem, and here it genuinely costs you throughput.
 */
export function simulatePublicGoods(state: GameState) {
  const receipts = state.economy.govDebt > 0 ? 1 : 0.7;
  for (const c of state.cities) {
    // Spend per capita; crowd-out when the sovereign is over-indebted.
    const investment = (c.population / 1_000_000) * 0.06 * receipts;
    c.infrastructure = Math.max(10, Math.min(100, c.infrastructure + investment - 0.02));
    // Poor infrastructure is a tax on every firm in the city — here expressed
    // as a drag on wages it must pay to attract staff to an unpleasant posting.
    if (c.infrastructure < 45) c.wageRate *= 1 + (45 - c.infrastructure) * 0.000004;
  }
}

/** Aggregate structural unemployment across the economy for the UI. */
export function structuralUnemployment(state: GameState): number {
  const total = state.cities.reduce((s, c) => s + c.population, 0);
  if (total <= 0) return 0;
  return state.cities.reduce((s, c) => s + c.skillGap * 9 * c.population, 0) / total;
}
