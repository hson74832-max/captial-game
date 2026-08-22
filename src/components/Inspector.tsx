import { useState } from 'react';
import type { Building, GameState, Product } from '../game/types';
import {
  BUILDING_CONFIGS, LIVESTOCK_BREEDS, PRODUCT_TIERS, isHospitality, isProducer, isProperty,
} from '../game/constants';
import { farmModifiers, getQuotes, neededProducts } from '../game/systems';
import { categorySpendPool, incomeFit, productRating, searchIntensity } from '../game/consumers';
import { eligibleFor, fmtMoney, fmtNum, fmtShort } from '../game/engine';
import { Bar, Btn, Panel, Row, Slider, Spark, Tabs, cx } from './ui';

interface Props {
  s: GameState;
  onAction: (fn: string, ...args: unknown[]) => void;
  onFocus: (x: number, y: number) => void;
  onSelectCity: (id: string) => void;
}

export default function Inspector({ s, onAction, onFocus, onSelectCity }: Props) {
  const b = s.buildings.find(x => x.id === s.selectedBuildingId);
  if (!b) return <CityBrowser s={s} onFocus={onFocus} onSelectCity={onSelectCity} />;
  return <BuildingInspector s={s} b={b} onAction={onAction} />;
}

function BuildingInspector({ s, b, onAction }: { s: GameState; b: Building; onAction: Props['onAction'] }) {
  const [tab, setTab] = useState('Overview');
  const cfg = BUILDING_CONFIGS[b.type];
  const owner = s.companies.find(c => c.id === b.companyId);
  const city = s.cities.find(c => c.id === b.cityId)!;
  const isMine = b.companyId === s.playerCompanyId;
  const constructing = b.constructionEndsTick > s.tick;
  const monthly = b.dailyProfit * 30;
  // Tab set depends on what the building is. Property never needs Supply,
  // marketing, product lines or staffing — its only concerns are rent, tenants
  // and maintenance. Hospitality and farms have their own tabs.
  const isPropertyAsset = isProperty(b.type);
  const baseTabs = ['Overview'];
  if (isMine) {
    // Property keeps Ops (it holds the rent/leasing controls) but loses
    // Supply, Staff, marketing and product lines entirely.
    baseTabs.push('Ops');
    if (!isPropertyAsset && b.type !== 'seaport') baseTabs.push('Staff');
    if (!isPropertyAsset) baseTabs.push('Supply');
    baseTabs.push('Finance');
    if (b.type === 'farm') baseTabs.push('Farm');
  }
  const tabs = baseTabs;

  return (
    <div className="flex h-full w-[340px] shrink-0 flex-col overflow-hidden border-l border-slate-700/70 bg-slate-950/85">
      <div className="border-b border-slate-700/70 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-lg">{cfg.icon}</span>
              <h2 className="truncate text-sm font-bold text-slate-100">{b.name}</h2>
            </div>
            <div className="mt-0.5 truncate text-[10px] text-slate-500">
              {cfg.name} · {city.name} · Level {b.level}/{b.maxLevel}
            </div>
          </div>
          <Btn variant="ghost" onClick={() => onAction('select', null)}>✕</Btn>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
            style={{ background: (owner?.color ?? '#475569') + '30', color: owner?.color ?? '#94a3b8' }}>
            {owner ? owner.name : 'Institutional / State'}
          </span>
          {constructing && <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] uppercase text-amber-300">
            Building · {Math.ceil((b.constructionEndsTick - s.tick) / 24)} days left
          </span>}
          {!b.isOperating && !constructing && <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[9px] uppercase text-rose-300">Closed</span>}
          {b.forSale && <span className="rounded bg-yellow-400/20 px-1.5 py-0.5 text-[9px] uppercase text-yellow-300">For sale · ${fmtShort(b.askingPrice)}</span>}
        </div>
      </div>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        {tab === 'Overview' && (
          <>
            <Panel title="Performance">
              <div className="grid grid-cols-2 gap-x-3">
                <Row k="Revenue / day" v={fmtMoney(b.dailyRevenue)} />
                <Row k="Profit / day" v={fmtMoney(b.dailyProfit)} tone={b.dailyProfit >= 0 ? 'good' : 'bad'} />
                <Row k="Profit / month" v={fmtMoney(monthly)} tone={monthly >= 0 ? 'good' : 'bad'} />
                <Row k="Margin" v={b.dailyRevenue > 0 ? `${((b.dailyProfit / b.dailyRevenue) * 100).toFixed(1)}%` : '—'} />
              </div>
              <div className="mt-2 space-y-1.5">
                <Bar label="Utilisation" value={b.utilization} tone={b.utilization > 75 ? 'emerald' : b.utilization > 35 ? 'amber' : 'rose'} />
                <Bar label="Condition" value={b.condition} tone={b.condition > 60 ? 'sky' : 'rose'} />
                {(b.type === 'retail_store' || isHospitality(b.type)) && <Bar label="Foot traffic" value={b.customerTraffic} tone="violet" />}
                {isProperty(b.type) && <Bar label="Occupancy" value={b.occupancy} tone="emerald" />}
              </div>
              <div className="mt-2">
                <div className="mb-0.5 text-[9px] uppercase tracking-widest text-slate-600">30-day profit</div>
                <Spark data={b.profitHistory} color={monthly >= 0 ? '#34d399' : '#fb7185'} height={38} />
              </div>
            </Panel>

            <Panel title="Asset">
              <Row k="Book value" v={fmtMoney(b.constructionCost + b.landValue)} />
              <Row k="Market value" v={fmtMoney(b.fairValue)} />
              <Row k="Land value" v={fmtMoney(b.landValue)} />
              <Row k="Capacity" v={fmtNum(b.capacity)} />
              {isProperty(b.type) && <>
                <Row k="Tenants" v={`${b.tenants} / ${b.capacity}`} />
                <Row k="Rent / unit / mo" v={fmtMoney(b.rentPerUnit)} />
              </>}
              {b.type === 'mine' && <Row k="Reserve remaining" v={`${fmtNum(b.resourceRemaining)} (${((b.resourceRemaining / Math.max(1, b.resourceMax)) * 100).toFixed(0)}%)`} />}
              {b.type === 'farm' && <>
                <Row k="Growth stage" v={b.growthStage} />
                <Row k="Soil health" v={`${b.soilHealth.toFixed(0)}%`} />
              </>}
            </Panel>

            {!isMine && b.type !== 'seaport' && <DealDesk s={s} b={b} onAction={onAction} />}
          </>
        )}

        {tab === 'Ops' && isMine && (
          <>
            {!isPropertyAsset && <Panel title="Pricing & Marketing">
              <Slider label="Price position" value={b.pricingMultiplier} min={0.6} max={1.6} step={0.05}
                format={v => `${(v * 100).toFixed(0)}% of market`}
                onChange={v => onAction('field', b.id, 'pricingMultiplier', v)} />
              <div className="mt-1 text-[10px] leading-relaxed text-slate-500">
                {b.pricingMultiplier < 0.95 ? 'Discounting: more volume, thinner margin.'
                  : b.pricingMultiplier > 1.15 ? 'Premium: fatter margin, fewer customers.' : 'Priced at prevailing market.'}
              </div>
              <div className="mt-3">
                <Slider label="Ad budget / month" value={b.adBudget} min={0} max={200_000} step={5_000}
                  format={v => fmtMoney(v)} onChange={v => onAction('field', b.id, 'adBudget', v)} />
                <div className="mt-1 text-[10px] text-slate-500">Brand equity {b.brandEquity.toFixed(1)} · loyalty {(b.loyalty * 100).toFixed(0)}%</div>
              </div>
              {b.type === 'farm' && (
                <div className="mt-3">
                  <Slider label="Irrigation" value={b.irrigation} min={0} max={1} step={0.05}
                    format={v => `${(v * 100).toFixed(0)}%`} onChange={v => onAction('field', b.id, 'irrigation', v)} />
                  <div className="mt-1 text-[10px] text-slate-500">Buffers weather shocks; adds running cost.</div>
                </div>
              )}
            </Panel>}

            {isProperty(b.type) && <Panel title="Leasing">
              <Slider label="Rent position" value={b.rentMultiplier} min={0.6} max={1.6} step={0.05}
                format={v => `${(v * 100).toFixed(0)}% of local market`}
                onChange={v => onAction('field', b.id, 'rentMultiplier', v)} />
              <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                Asking rent can only be changed once per month. Existing tenants stay for 90 days at the
                old rate; lease expiry handles the outflow.
              </p>
              <div className="mt-2 grid grid-cols-2 gap-x-3">
                <Row k="Tenants" v={`${b.tenants} / ${b.capacity}`} />
                <Row k="Occupancy" v={`${b.occupancy.toFixed(0)}%`}
                  tone={b.occupancy > 90 ? 'good' : b.occupancy > 60 ? undefined : 'bad'} />
                <Row k="Rent / unit · mo" v={fmtMoney(b.rentPerUnit)} tone="good" />
                <Row k="Annual NOI" v={fmtMoney(b.dailyProfit * 365)} />
              </div>
              <div className="mt-2"><Bar label="Occupancy" value={b.occupancy} tone="emerald" /></div>
            </Panel>}

            {!isPropertyAsset && !isHospitality(b.type) && <Panel title="Product Lines">
              <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
                {eligibleFor(s, b).map(p => {
                  const on = b.products.includes(p.id);
                  const stock = b.inventory[p.id] ?? 0;
                  return (
                    <button key={p.id} onClick={() => onAction('line', b.id, p.id)}
                      className={cx('w-full rounded border px-2 py-1 text-left',
                        on ? 'border-emerald-500/60 bg-emerald-500/10' : 'border-slate-800 bg-slate-900/60 hover:border-slate-600')}>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-slate-200">{p.icon} {p.name}</span>
                        <span className="font-mono text-[10px] text-slate-400">${p.currentPrice.toFixed(0)}</span>
                      </div>
                      <div className="flex justify-between text-[9px] text-slate-500">
                        <span>{p.category} · q{p.quality.toFixed(0)}</span>
                        <span>stock {fmtNum(stock)}</span>
                      </div>
                    </button>
                  );
                })}
                {eligibleFor(s, b).length === 0 && <p className="text-[11px] text-slate-500">This asset does not trade goods.</p>}
              </div>
            </Panel>}

            {isHospitality(b.type) && b.menu.length > 0 && <Panel title="Menu Board">
              <div className="space-y-1">
                {b.menu.map(item => {
                  const margin = item.price > 0 ? ((item.price - item.foodCost) / item.price * 100) : 0;
                  return (
                    <div key={item.id} className={cx('rounded border px-2 py-1.5',
                      item.enabled ? 'border-slate-700 bg-slate-900/50' : 'border-slate-800/50 bg-slate-950/50 opacity-50')}>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-slate-200">
                          {item.category === 'kids' ? '🧒 ' : item.category === 'combo' ? '📦 ' : ''}
                          {item.name}
                          {item.includesToy && <span className="ml-1 text-[9px] text-amber-400">+toy</span>}
                        </span>
                        <span className="font-mono text-[11px] text-emerald-300">${item.price.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-[9px] text-slate-500">
                        <span>
                          food cost ${item.foodCost.toFixed(2)} · margin {margin.toFixed(0)}%
                          · popularity {(item.popularity * 100).toFixed(0)}%
                        </span>
                        <span className="capitalize">{item.category}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">
                Revenue = covers × weighted-average ticket. Combos carry the margin, fountain drinks
                carry the gross profit, kids boxes buy family footfall. Ingredient availability gates
                how many covers the kitchen can actually serve.
              </p>
            </Panel>}

            {isProducer(b.type) && (
              <Panel title="Trade Policy">
                <Slider label="Wholesale price" value={b.sellPriceMultiplier} min={0.6} max={1.8} step={0.05}
                  format={v => `${(v * 100).toFixed(0)}% of spot`}
                  onChange={v => onAction('field', b.id, 'sellPriceMultiplier', v)} />
                <div className="mt-1 text-[10px] leading-relaxed text-slate-500">
                  Charging above spot thins the order book; discounting clears volume fast.
                </div>
                <Btn className="mt-2 w-full" variant={b.internalSale ? 'warn' : 'default'}
                  onClick={() => onAction('field', b.id, 'internalSale', !b.internalSale)}>
                  {b.internalSale ? '🔒 Group supply only — rivals cut off' : 'Open market: selling to all buyers'}
                </Btn>
                <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                  Withholding output starves competitors who depend on you, but forfeits every spot sale.
                </p>
                <div className="mt-2">
                  <div className="mb-1 text-[9px] uppercase tracking-widest text-slate-600">Internal transfer price</div>
                  <div className="grid grid-cols-3 gap-1">
                    {(['cost_basis', 'market_spot', 'custom'] as const).map(m => (
                      <Btn key={m} variant={b.transferPricingMode === m ? 'primary' : 'default'}
                        onClick={() => onAction('field', b.id, 'transferPricingMode', m)}>
                        {m === 'cost_basis' ? 'At cost' : m === 'market_spot' ? 'At market' : 'Custom'}
                      </Btn>
                    ))}
                  </div>
                  {b.transferPricingMode === 'custom' && (
                    <div className="mt-1.5">
                      <Slider label="Transfer markup" value={b.transferPriceMultiplier} min={0.5} max={2.5} step={0.05}
                        format={v => `${v.toFixed(2)}× unit cost`}
                        onChange={v => onAction('field', b.id, 'transferPriceMultiplier', v)} />
                    </div>
                  )}
                  <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                    Transfer pricing shifts profit between your own sites — useful for showing margin where you want it.
                  </p>
                </div>
              </Panel>
            )}

            {isProducer(b.type) && (
              <Panel title="Automation">
                <div className="grid grid-cols-2 gap-x-3">
                  <Row k="Automation level" v={`${b.automationLevel} / 5`} />
                  <Row k="Headcount modifier" v={`${(Math.pow(0.86, b.automationLevel) * 100).toFixed(0)}%`} />
                  <Row k="Throughput" v={`+${(b.automationLevel * 11)}%`} tone="good" />
                  <Row k="Upkeep drag" v={`${(b.automationLevel * 3.5).toFixed(1)}% of value/yr`} tone="bad" />
                </div>
                <Btn className="mt-2 w-full" disabled={b.automationLevel >= 5}
                  onClick={() => onAction('automate', b.id)}>
                  Install automation · {fmtMoney(b.constructionCost * 0.16 * (b.automationLevel + 1))}
                </Btn>
                <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                  Substituting capital for labour: +9% throughput and −14% headcount per level, with
                  higher ongoing upkeep and a morale cost. Immediately effective — unlike training.
                </p>
              </Panel>
            )}

            {isProducer(b.type) && (
              <Panel title="Operations">
                <Slider label="Line intensity" value={b.productionIntensity} min={0.6} max={1.4} step={0.05}
                  format={v => `${(v * 100).toFixed(0)}% of nameplate`}
                  onChange={v => onAction('field', b.id, 'productionIntensity', v)} />
                <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                  Pushing past 100% lifts output but rushed batches slip through QA and wear the crew down.
                </p>
                <div className="mt-2">
                  <Slider label="Safety-stock policy" value={b.safetyStockPolicy} min={0} max={1} step={0.05}
                    format={v => v < 0.25 ? 'Just-in-time' : v < 0.6 ? 'Balanced buffer' : 'Heavy buffer'}
                    onChange={v => onAction('field', b.id, 'safetyStockPolicy', v)} />
                  <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                    Lean frees cash but amplifies the bullwhip — a wobble at the shelf becomes a swing here.
                  </p>
                </div>
                <div className="mt-2">
                  <Slider label="Training budget" value={b.trainingBudget} min={0} max={1} step={0.05}
                    format={v => `${(v * 100).toFixed(0)}% of payroll`}
                    onChange={v => onAction('field', b.id, 'trainingBudget', v)} />
                  <div className="grid grid-cols-2 gap-x-3">
                    <Row k="Funded level" v={`${b.trainingLevel.toFixed(1)} / 9`} />
                    <Row k="Realised skill" v={`${b.effectiveTraining.toFixed(1)} / 9`}
                      tone={b.effectiveTraining < b.trainingLevel - 0.5 ? undefined : 'good'} />
                  </div>
                  <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                    Cash buys capability over months, not instantly — skill creeps toward the funded level.
                  </p>
                </div>
              </Panel>
            )}

            {b.type === 'retail_store' && <ConsumerDesk s={s} b={b} />}

            <Panel title="Controls">
              <div className="flex flex-wrap gap-1">
                <Btn onClick={() => onAction('field', b.id, 'isOperating', !b.isOperating)}>
                  {b.isOperating ? 'Suspend operations' : 'Resume operations'}
                </Btn>
                {!isPropertyAsset && <>
                  <Btn onClick={() => onAction('field', b.id, 'autoRestock', !b.autoRestock)}>
                    Auto-restock: {b.autoRestock ? 'ON' : 'OFF'}
                  </Btn>
                  <Btn onClick={() => onAction('restock', b.id)}>Emergency order</Btn>
                </>}
                {b.forSale
                  ? <Btn variant="warn" onClick={() => onAction('field', b.id, 'forSale', false)}>Withdraw listing</Btn>
                  : <Btn onClick={() => onAction('list', b.id)}>List for sale</Btn>}
              </div>
            </Panel>
          </>
        )}

        {tab === 'Staff' && isMine && !isPropertyAsset && (
          <>
            <Panel title="Headcount">
              <Row k="On payroll" v={`${b.employees} / ${b.targetEmployees}`} />
              <Row k="Average salary" v={`${fmtMoney(b.wagePerEmployee)} / yr`} />
              <Row k="Local market wage" v={`${fmtMoney(s.cities.find(c => c.id === b.cityId)!.wageRate * 2080)} / yr`} />
              <div className="mt-2 space-y-2">
                <Slider label="Target headcount" value={b.targetEmployees} min={0} max={Math.max(20, Math.round(BUILDING_CONFIGS[b.type].employees * 2.5))} step={1}
                  onChange={v => onAction('field', b.id, 'targetEmployees', v)} />
                <Slider label="Salary offer" value={b.wagePerEmployee} min={20_000} max={160_000} step={1_000}
                  format={v => fmtMoney(v)} onChange={v => onAction('field', b.id, 'wagePerEmployee', v)} />
                <Slider label="Training budget" value={b.trainingBudget} min={0} max={1} step={0.05}
                  format={v => `${(v * 100).toFixed(0)}% of payroll`} onChange={v => onAction('field', b.id, 'trainingBudget', v)} />
              </div>
            </Panel>
            <Panel title="Workforce Health">
              {b.strikeTicks > 0 && (
                <div className="mb-2 rounded border border-rose-500/50 bg-rose-950/50 px-2 py-1 text-[11px] text-rose-200">
                  ✊ ON STRIKE — {Math.ceil(b.strikeTicks / 24)} days remain. Output is zero. Raise pay and
                  training to prevent the next one.
                </div>
              )}
              {b.unionized && (
                <div className="mb-2 text-[10px] text-amber-300">
                  Unionised workforce · +{(b.unionWagePremium * 100).toFixed(0)}% wage floor. Strikes trigger below 34 morale.
                </div>
              )}
              <Bar label="Morale" value={b.morale} tone={b.morale > 60 ? 'emerald' : b.morale > 35 ? 'amber' : 'rose'} />
              <div className="mt-2"><Bar label="Skill" value={b.staffSkill * 10} tone="sky" /></div>
              <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
                Paying above the local wage lifts morale and retention. Training compounds skill, which raises output,
                service quality and yield. Understaffed sites cannot reach their capacity.
              </p>
            </Panel>
          </>
        )}

        {tab === 'Supply' && isMine && !isPropertyAsset && (
          <>
            <Panel title="Inventory">
              <div className="max-h-48 space-y-1 overflow-y-auto pr-1">
                {Object.entries(b.inventory).filter(([, v]) => v > 0.5).map(([pid, qty]) => {
                  const p = s.products.find(x => x.id === pid);
                  if (!p) return null;
                  return (
                    <div key={pid} className="flex items-center justify-between rounded bg-slate-900/60 px-2 py-1">
                      <span className="text-[11px] text-slate-300">{p.icon} {p.name}</span>
                      <span className="font-mono text-[10px] text-slate-400">{fmtNum(qty)} u · {fmtMoney(qty * p.currentPrice)}</span>
                    </div>
                  );
                })}
                {Object.values(b.inventory).every(v => v <= 0.5) && <p className="text-[11px] text-rose-300">Inventory empty — sales are being lost.</p>}
              </div>
              <div className="mt-2"><Bar label="Warehouse fill" value={Object.values(b.inventory).reduce((a, c) => a + c, 0)} max={b.inventoryCapacity} tone="sky" /></div>
            </Panel>
            <SupplyDesk s={s} b={b} onAction={onAction} />
          </>
        )}

        {tab === 'Farm' && isMine && <FarmDesk s={s} b={b} onAction={onAction} />}

        {tab === 'Finance' && isMine && (
          <>
            <Panel title="Monthly Cost Ledger">
              {([
                ['Staff wages', b.costs.wages], ['Payroll tax & benefits', b.costs.payrollTax],
                ['Utilities', b.costs.utilities], ['Marketing', b.costs.marketing],
                ['Insurance', b.costs.insurance],
                ['Property tax', b.costs.propertyTax], ['Freight', b.costs.freight],
                ['Licences & other', b.costs.other],
              ] as Array<[string, number]>).map(([k, v]) => (
                <Row key={k} k={k} v={fmtMoney(v * 720)} />
              ))}
              <Row k="Maintenance" v={fmtMoney(b.costs.maintenance * 720)}
                why="A small, unavoidable routine cost (cleaning, servicing, minor fixes) — always charged while the asset operates. 30% of it is also set aside into a maintenance reserve fund, capped at 20% of construction cost, which discounts your next Refurbish bill. It does NOT stop the slow wear that Refurbish fixes." />
              <div className="mt-1 border-t border-slate-700/60 pt-1">
                <Row k="Total operating cost" v={fmtMoney(b.operatingCost * 720)} tone="bad" />
                <Row k="Cost of goods" v={fmtMoney(b.cogs * 720)} tone="bad" />
                <Row k="Revenue" v={fmtMoney(b.revenue * 720)} tone="good" />
                <Row k="Net" v={fmtMoney(b.profit * 720)} tone={b.profit >= 0 ? 'good' : 'bad'} />
              </div>
              <div className="mt-2 border-t border-slate-700/60 pt-1">
                <Row k="Maintenance reserve" v={fmtMoney(b.maintenanceReserve)} tone="good"
                  why="Accumulated from 30% of every maintenance payment. Drawn down automatically the next time you Refurbish, so it reduces the cash you need to pay out of pocket." />
                <Row k="Condition" v={`${b.condition.toFixed(0)}%`}
                  tone={b.condition > 60 ? 'good' : 'bad'}
                  why="Wears down slowly from use regardless of maintenance spend. Refurbish is the only way to restore it to 100%; the reserve above discounts that bill." />
              </div>
            </Panel>
            <Panel title="Capital Actions">
              <div className="space-y-1">
                <Btn className="w-full" variant="primary" disabled={b.level >= b.maxLevel}
                  onClick={() => onAction('upgrade', b.id)}>
                  Upgrade to level {b.level + 1} · {fmtMoney(b.constructionCost * 0.42 * b.level)}
                </Btn>
                <Btn className="w-full" disabled={b.condition > 97}
                  onClick={() => onAction('repair', b.id)}>
                  Refurbish · {fmtMoney(Math.max(0, (100 - b.condition) / 100 * b.constructionCost * 0.55 - b.maintenanceReserve))}
                </Btn>
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
                There is no instant sale. To dispose of this asset, list it for sale from the Ops tab and
                wait for a buyer, or respond to an inbound offer from the Offers screen — accept, decline,
                or send back a counter.
              </p>
            </Panel>
          </>
        )}
      </div>
    </div>
  );
}

// ════════════════ CONSUMER DESK: behavioural demand breakdown ════════════════
function ConsumerDesk({ s, b }: { s: GameState; b: Building }) {
  const city = s.cities.find(c => c.id === b.cityId);
  if (!city) return null;
  const lines = b.products.map(id => s.products.find(p => p.id === id)).filter(Boolean) as Product[];

  return (
    <>
      <Panel title="Local Households">
        <div className="space-y-1.5">
          {(['low', 'middle', 'affluent'] as const).map(tier => (
            <div key={tier}>
              <div className="flex justify-between text-[10px]">
                <span className="capitalize text-slate-400">{tier} income</span>
                <span className="font-mono text-slate-300">
                  {(city.incomeMix[tier] * 100).toFixed(0)}% · ${fmtNum(Math.round(city.discretionary[tier]))}/mo free
                </span>
              </div>
              <Bar label="" value={city.incomeMix[tier] * 100} tone={tier === 'affluent' ? 'sky' : tier === 'middle' ? 'emerald' : 'amber'} />
            </div>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-x-3">
          <Row k="Savings buffer" v={`${city.householdSavingsMonths.toFixed(1)} mo`}
            tone={city.householdSavingsMonths < 1 ? 'bad' : 'good'} />
          <Row k="Debt / income" v={`${(city.householdDebtRatio * 100).toFixed(0)}%`}
            tone={city.householdDebtRatio > 0.35 ? 'bad' : undefined} />
        </div>
        <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">
          Savings cushion early downturns, credit extends spending briefly, then deleveraging crushes it.
        </p>
      </Panel>

      <Panel title="Shelf Behaviour">
        {lines.length === 0 && <p className="text-[11px] text-slate-500">No lines stocked.</p>}
        {lines.slice(0, 8).map(p => {
          const rating = productRating(p, b.pricingMultiplier);
          const fit = incomeFit(city, p);
          const pool = categorySpendPool(city, p);
          return (
            <div key={p.id} className="mb-1.5 rounded border border-slate-800 bg-slate-900/60 px-2 py-1.5">
              <div className="flex items-center justify-between">
                <span className="truncate text-[11px] text-slate-200">{p.icon} {p.name}</span>
                <span className={cx('font-mono text-[10px]',
                  rating > 55 ? 'text-emerald-400' : rating > 38 ? 'text-amber-400' : 'text-rose-400')}>
                  {rating.toFixed(0)}/100
                </span>
              </div>
              <div className="grid grid-cols-3 gap-x-2 text-[9px] text-slate-500">
                <span>segment <b className="text-slate-300">{p.segment}</b></span>
                <span>fit <b className="text-slate-300">{fit.toFixed(2)}</b></span>
                <span>pool <b className="text-slate-300">{fmtMoney(pool)}</b></span>
              </div>
              <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-slate-800">
                <div className="bg-sky-400" style={{ width: `${p.priceWeight}%` }} title="Price weight" />
                <div className="bg-emerald-400" style={{ width: `${p.qualityWeight}%` }} title="Quality weight" />
                <div className="bg-fuchsia-400" style={{ width: `${p.brandWeight}%` }} title="Brand weight" />
              </div>
              <div className="mt-0.5 flex justify-between text-[9px] text-slate-600">
                <span>price {p.priceWeight} · quality {p.qualityWeight} · brand {p.brandWeight}</span>
                <span>brand {p.brand.toFixed(0)}</span>
              </div>
            </div>
          );
        })}
        <div className="mt-1 grid grid-cols-2 gap-x-3">
          <Row k="Anchor price" v={b.anchorPrice > 0 ? fmtMoney(b.anchorPrice) : 'unset'}
            why={`The price shoppers first saw here (${b.anchorPrice > 0 ? fmtMoney(b.anchorPrice) : 'none yet'}) drifts ${'<'}0.1% per hour toward your current shelf price. Charging above it costs ~2.25x more demand than discounting below it gains.`} />
          <Row k="Loyal base" v={`${(b.loyalCustomerBase * 100).toFixed(1)}%`}
            why={`${(b.loyalCustomerBase * 100).toFixed(1)}% of your trade is habitual and migrates slowly. It decays with brand equity (ad spend ${fmtMoney(b.adBudget)}/mo) and grows with every completed sale. Rivals must beat you consistently to move these customers.`} tone="good" />
          <Row k="Social proof" v={`${(b.socialProof * 100).toFixed(0)}%`}
            why={`Bestseller momentum. Sells above ~0.6x of expected volume build it, below that erode it. Adds up to +55% demand at full strength. Builds slowly (1.5%/tick) and is lost faster than won.`}
            tone={b.socialProof > 0.4 ? 'good' : undefined} />
          <Row k="Brand equity" v={`${b.brandEquity.toFixed(0)}/100`}
            why={`Decays every month at a rate inversely proportional to your ad spend (${fmtMoney(b.adBudget)}/mo) — heavy spend both adds equity and slows the forgetting. Bursty campaigns fade fast; continuous presence compounds.`} />
          <Row k="Active search" v={`${(searchIntensity(city, lines[0] ?? lines[0]) * 100).toFixed(0)}% compare`}
            why={`This share of shoppers visits several stores and compares prices directly, so your price edge leaks to the cheapest rival in ${city.name}. Higher for expensive, researched goods and educated populations; staples are bought on habit.`} />
          <Row k="Chain scale" v={`${(s.buildings.filter(x => x.companyId === b.companyId).length)} sites`}
            why={`Network effects: your whole group's scale feeds demand here, capped at +40%. Strongest in Communication, Computers and Electronics; weak for staples.`} />
        </div>
        <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">
          Raising price above the anchor stings ~2.25× harder than an equal cut helps. Luxury lines keep a
          Veblen band — demand peaks slightly <em>above</em> parity, then collapses.
        </p>
      </Panel>
    </>
  );
}

// ════════════════ DEAL DESK: listings, mortgages, leases, negotiation ════════════════
function DealDesk({ s, b, onAction }: { s: GameState; b: Building; onAction: Props['onAction'] }) {
  const owner = s.companies.find(c => c.id === b.companyId);
  const [finance, setFinance] = useState(0);
  const [offer, setOffer] = useState(Math.round(b.fairValue));
  const neg = s.negotiation?.buildingId === b.id ? s.negotiation : null;
  const listed = b.forSale || b.companyId === 'system';
  const price = b.askingPrice > 0 ? b.askingPrice : Math.round(b.fairValue);
  const canLease = b.companyId === 'system'
    && (b.type === 'retail_store' || b.type === 'office' || isHospitality(b.type));
  const blocked = s.tick < b.negotiationBlockedUntil;

  return (
    <>
      <Panel title={listed ? 'Acquisition' : 'Approach the Owner'}>
        <p className="mb-2 text-[11px] leading-relaxed text-slate-400">
          {owner
            ? `${owner.name} — ${owner.personality}. Their board runs a ${owner.strategy} playbook.`
            : 'Held by an institutional landlord.'}
          {' '}Independent valuation: {fmtMoney(b.fairValue)}.
        </p>
        {listed ? (
          <>
            <Row k="Asking price" v={fmtMoney(price)} tone={price < b.fairValue ? 'good' : 'bad'} />
            <div className="mt-2">
              <Slider label="Mortgage financing" value={finance} min={0} max={0.75} step={0.05}
                format={v => `${(v * 100).toFixed(0)}% financed`} onChange={setFinance} />
              <Row k="Cash down" v={fmtMoney(price * (1 - finance))} />
              {finance > 0 && <Row k="Monthly payment" v={fmtMoney(
                (price * finance * ((s.economy.interestRate + 3) / 100 / 12))
                / (1 - Math.pow(1 + (s.economy.interestRate + 3) / 100 / 12, -120)))} tone="bad" />}
            </div>
            <Btn variant="primary" className="mt-2 w-full" onClick={() => onAction('acquire', b.id, finance)}>
              {finance > 0 ? `Buy with ${(finance * 100).toFixed(0)}% mortgage` : `Buy outright · ${fmtMoney(price)}`}
            </Btn>
            {canLease && (
              <Btn className="mt-1 w-full" onClick={() => onAction('lease', b.id)}>
                Lease instead · {fmtMoney(b.fairValue * 0.009)}/mo, 5 years
              </Btn>
            )}
          </>
        ) : blocked ? (
          <p className="text-[11px] text-rose-300">
            Talks are closed. {owner?.name ?? 'The owner'} will not revisit for
            {' '}{Math.ceil((b.negotiationBlockedUntil - s.tick) / 720)} more month(s).
          </p>
        ) : (
          <>
            <p className="mb-2 text-[11px] text-slate-500">
              Not for sale — but every asset has a price. Lowball offers end talks for three months.
            </p>
            <Slider label="Your offer" value={offer} min={Math.round(b.fairValue * 0.4)} max={Math.round(b.fairValue * 2)}
              step={Math.max(10_000, Math.round(b.fairValue / 100))} format={v => fmtMoney(v)} onChange={setOffer} />
            <Btn variant="warn" className="mt-2 w-full" onClick={() => onAction('negotiate', b.id, offer)}>
              Table an offer of {fmtMoney(offer)}
            </Btn>
          </>
        )}
        {neg && (
          <div className={cx('mt-2 rounded border px-2 py-1.5 text-[11px] leading-relaxed',
            neg.status === 'accepted' ? 'border-emerald-500/50 bg-emerald-950/50 text-emerald-200'
              : neg.status === 'counter' ? 'border-amber-500/50 bg-amber-950/50 text-amber-200'
                : 'border-rose-500/50 bg-rose-950/50 text-rose-200')}>
            {neg.message}
            {neg.status === 'counter' && (
              <Btn className="mt-1 w-full" variant="primary"
                onClick={() => { setOffer(neg.counterAmount); onAction('negotiate', b.id, neg.counterAmount); }}>
                Meet them at {fmtMoney(neg.counterAmount)}
              </Btn>
            )}
            <button className="mt-1 text-[9px] uppercase tracking-widest opacity-60"
              onClick={() => onAction('clearNegotiation')}>dismiss</button>
          </div>
        )}
      </Panel>
    </>
  );
}

// ════════════════ SUPPLY DESK: contracts, quotes, pipeline ════════════════
function SupplyDesk({ s, b, onAction }: { s: GameState; b: Building; onAction: Props['onAction'] }) {
  const needs = neededProducts(s, b);
  const contracts = s.contracts[b.id] ?? [];
  const [openFor, setOpenFor] = useState<string | null>(null);
  const inbound = s.pipeline.filter(o => o.toBuildingId === b.id);

  return (
    <>
      <Panel title="Sourcing Mode">
        <div className="flex gap-1">
          <Btn className="flex-1" variant={b.supplyMode === 'auto' ? 'primary' : 'default'}
            onClick={() => onAction('field', b.id, 'supplyMode', 'auto')}>Auto-source</Btn>
          <Btn className="flex-1" variant={b.supplyMode === 'manual' ? 'primary' : 'default'}
            onClick={() => onAction('field', b.id, 'supplyMode', 'manual')}>Manual contracts</Btn>
        </div>
        <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">
          {b.supplyMode === 'auto'
            ? 'The buying desk signs whichever supplier has the lowest landed cost. Convenient, rarely optimal.'
            : 'Only your signed contracts are used. Nothing arrives until you sign one for each input.'}
        </p>
        {b.supplyDisrupted && (
          <>
            <p className="mt-1 text-[11px] text-rose-300">⚠ Supply disrupted — no viable supplier for at least one input.</p>
            <Btn variant="warn" className="mt-1 w-full" onClick={() => onAction('autoSource', b.id)}>
              Emergency re-source to lowest landed cost
            </Btn>
          </>
        )}
      </Panel>

      <Panel title="Contracts">
        {needs.length === 0 && <p className="text-[11px] text-slate-500">This asset needs no inbound goods.</p>}
        {needs.map(pid => {
          const prod = s.products.find(p => p.id === pid);
          if (!prod) return null;
          const ct = contracts.find(c => c.productId === pid);
          const stock = b.inventory[pid] ?? 0;
          return (
            <div key={pid} className="mb-1.5 rounded border border-slate-800 bg-slate-900/60 p-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-200">{prod.icon} {prod.name}</span>
                <span className={cx('font-mono text-[10px]', stock > 1 ? 'text-slate-400' : 'text-rose-400')}>{fmtNum(stock)} u</span>
              </div>
              {ct ? (
                <>
                  <div className="mt-0.5 text-[10px] text-emerald-300">{ct.supplierName}{ct.internal && ' · internal transfer'}</div>
                  <div className="grid grid-cols-2 gap-x-2">
                    <Row k="Landed" v={fmtMoney(ct.pricePerUnit + ct.freightPerUnit)} />
                    <Row k="Reliability" v={`${ct.reliability.toFixed(0)}%`} tone={ct.reliability > 70 ? 'good' : 'bad'} />
                    <Row k="Deliveries" v={String(ct.deliveries)} />
                    <Row k="Quality" v={ct.quality.toFixed(0)} />
                  </div>
                  <div className="mt-1 flex gap-1">
                    <Btn className="flex-1" onClick={() => setOpenFor(openFor === pid ? null : pid)}>Re-tender</Btn>
                    <Btn variant="danger" onClick={() => onAction('cancelContract', b.id, ct.id)}>Break</Btn>
                  </div>
                </>
              ) : (
                <Btn className="mt-1 w-full" variant="warn" onClick={() => setOpenFor(openFor === pid ? null : pid)}>
                  No contract — request quotes
                </Btn>
              )}
              {openFor === pid && (
                <div className="mt-1.5 space-y-1 border-t border-slate-800 pt-1.5">
                  {getQuotes(s, b, pid).slice(0, 5).map(q => (
                    <button key={q.supplierBuildingId}
                      onClick={() => { onAction('signContract', b.id, pid, q.supplierBuildingId); setOpenFor(null); }}
                      className="w-full rounded border border-slate-700 bg-slate-950/70 px-1.5 py-1 text-left hover:border-emerald-500">
                      <div className="flex justify-between">
                        <span className="truncate text-[10px] text-slate-200">{q.supplierName}</span>
                        <span className="font-mono text-[10px] text-emerald-300">{fmtMoney(q.landedCost)}/u</span>
                      </div>
                      <div className="flex justify-between text-[9px] text-slate-500">
                        <span>{q.supplierCompany}{q.internal ? ' · internal' : ''} · {q.distance.toFixed(0)} km</span>
                        <span>q{q.quality.toFixed(0)} · stock {fmtNum(q.availableStock)}</span>
                      </div>
                      <div className="text-[9px] text-slate-600">
                        goods {fmtMoney(q.pricePerUnit)} + freight {fmtMoney(q.freightPerUnit)}
                        {q.loyaltyDiscount > 0 && ` · loyalty −${(q.loyaltyDiscount * 100).toFixed(0)}%`}
                      </div>
                    </button>
                  ))}
                  {getQuotes(s, b, pid).length === 0 && <p className="text-[10px] text-rose-300">No supplier in the country carries this input.</p>}
                </div>
              )}
            </div>
          );
        })}
      </Panel>

      <Panel title={`In Transit · ${inbound.length}`}>
        {inbound.length === 0 && <p className="text-[11px] text-slate-500">Nothing inbound.</p>}
        {inbound.map(o => {
          const prod = s.products.find(p => p.id === o.productId);
          const stage = o.processingHoursLeft > 0 ? `processing ${o.processingHoursLeft}h` : `transit ${o.transitHoursLeft}h`;
          return (
            <div key={o.id} className="flex items-center justify-between py-0.5 text-[10px]">
              <span className="truncate text-slate-300">{prod?.icon} {fmtNum(o.amount)} {prod?.name}</span>
              <span className={cx('font-mono', o.perishable && o.totalHours > 84 ? 'text-amber-400' : 'text-slate-500')}>{stage}</span>
            </div>
          );
        })}
        <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">
          Perishables spoil once total pipeline time passes 84 hours. Short supply lines are worth real money.
        </p>
        <div className="mt-1"><Row k="Spoilage & rejects YTD" v={fmtMoney(b.spoilageYTD)} tone="bad" /></div>
      </Panel>
    </>
  );
}

// ════════════════ FARM DESK: breeds, feed, vet, tier, capital ════════════════
function FarmDesk({ s, b, onAction }: { s: GameState; b: Building; onAction: Props['onAction'] }) {
  const prod = s.products.find(p => p.id === b.productId);
  const breeds = LIVESTOCK_BREEDS.filter(x => !prod || x.produces === prod.name || x.id === 'commodity_herd');
  const m = farmModifiers(b, prod?.name ?? '');
  return (
    <>
      <Panel title="Agronomy">
        <div className="grid grid-cols-2 gap-x-3">
          <Row k="Growth stage" v={b.growthStage} />
          <Row k="Soil health" v={`${b.soilHealth.toFixed(0)}%`} tone={b.soilHealth > 60 ? 'good' : 'bad'} />
          <Row k="Yield multiplier" v={`${m.yieldMul.toFixed(2)}×`} tone="good" />
          <Row k="Price multiplier" v={`${m.priceMul.toFixed(2)}×`} tone="good" />
        </div>
        {b.diseaseTicks > 0 && <p className="mt-1 text-[11px] text-rose-300">🦠 Disease outbreak — {Math.ceil(b.diseaseTicks / 24)} days of reduced yield remain.</p>}
        <div className="mt-2 space-y-2">
          <Slider label="Irrigation" value={b.irrigation} min={0} max={1} step={0.05}
            format={v => `${(v * 100).toFixed(0)}%`} onChange={v => onAction('field', b.id, 'irrigation', v)} />
          <Slider label="Feed quality" value={b.feedQuality} min={0} max={1} step={0.05}
            format={v => `${(v * 100).toFixed(0)}%`} onChange={v => onAction('field', b.id, 'feedQuality', v)} />
          <Slider label="Veterinary programme" value={b.vetProgram} min={0} max={3} step={1}
            format={v => ['None (outbreak risk)', 'Basic', 'Full herd health', 'Preventive research'][v]}
            onChange={v => onAction('field', b.id, 'vetProgram', v)} />
        </div>
      </Panel>

      <Panel title="Breed / Varietal">
        <div className="space-y-1">
          {breeds.map(br => (
            <button key={br.id} onClick={() => onAction('breed', b.id, br.id)}
              className={cx('w-full rounded border px-2 py-1 text-left',
                b.livestockBreed === br.id ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-800 bg-slate-900/60 hover:border-slate-600')}>
              <div className="flex justify-between">
                <span className="text-[11px] text-slate-200">{br.name}</span>
                <span className="font-mono text-[10px] text-slate-400">{br.investment ? fmtMoney(br.investment) : 'in place'}</span>
              </div>
              <div className="text-[9px] text-slate-500">{br.blurb}</div>
              <div className="text-[9px] text-emerald-400/80">
                yield ×{br.yieldMul.toFixed(2)} · price ×{br.priceMul.toFixed(2)} · quality {br.qualityBonus >= 0 ? '+' : ''}{br.qualityBonus}
              </div>
            </button>
          ))}
        </div>
      </Panel>

      <Panel title="Market Tier">
        <div className="grid grid-cols-3 gap-1">
          {PRODUCT_TIERS.map(t => (
            <button key={t.id} onClick={() => onAction('tier', b.id, t.id)}
              className={cx('rounded border px-1 py-1 text-center',
                b.productTier === t.id ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-800 bg-slate-900/60 hover:border-slate-600')}>
              <div className="text-[10px] text-slate-200">{t.label}</div>
              <div className="font-mono text-[9px] text-emerald-400">×{t.priceMul.toFixed(2)}</div>
              <div className="text-[9px] text-slate-600">{t.cert ? fmtMoney(t.cert) : 'free'}</div>
            </button>
          ))}
        </div>
        <p className="mt-1 text-[10px] text-slate-500">{PRODUCT_TIERS.find(t => t.id === b.productTier)?.blurb}</p>
      </Panel>

      <Panel title="Capital Programmes">
        <Row k="Agronomy level" v={`${b.farmTechniqueLevel} / 5`} />
        <Btn className="mb-1 w-full" disabled={b.farmTechniqueLevel >= 5}
          onClick={() => onAction('investFarm', b.id, 'technique')}>
          Fund agronomy · {fmtMoney(180_000 * Math.pow(b.farmTechniqueLevel + 1, 1.5))}
        </Btn>
        <Row k="Equipment level" v={`${b.farmEquipmentLevel} / 5`} />
        <Btn className="w-full" disabled={b.farmEquipmentLevel >= 5}
          onClick={() => onAction('investFarm', b.id, 'equipment')}>
          Upgrade machinery · {fmtMoney(260_000 * Math.pow(b.farmEquipmentLevel + 1, 1.5))}
        </Btn>
      </Panel>
    </>
  );
}

function CityBrowser({ s, onFocus, onSelectCity }: { s: GameState; onFocus: (x: number, y: number) => void; onSelectCity: (id: string) => void }) {
  const city = s.cities.find(c => c.id === s.selectedCityId) ?? s.cities[0];
  const bs = s.buildings.filter(b => b.cityId === city.id);
  return (
    <div className="flex h-full w-[340px] shrink-0 flex-col overflow-y-auto border-l border-slate-700/70 bg-slate-950/85 p-2">
      <Panel title="Cities">
        <div className="grid grid-cols-2 gap-1">
          {s.cities.map(c => (
            <button key={c.id} onClick={() => { onSelectCity(c.id); onFocus(c.x, c.y); }}
              className={cx('rounded border px-1.5 py-1 text-left',
                c.id === city.id ? 'border-sky-400 bg-sky-500/10' : 'border-slate-800 bg-slate-900/60 hover:border-slate-600')}>
              <div className="truncate text-[11px] text-slate-200">{c.name}</div>
              <div className="font-mono text-[9px] text-slate-500">{fmtNum(c.population)} · ${c.wageRate.toFixed(0)}/h</div>
            </button>
          ))}
        </div>
      </Panel>

      <div className="mt-2">
        <Panel title={`${city.name} · ${city.tier}`}>
          <div className="grid grid-cols-2 gap-x-3">
            <Row k="Population" v={fmtNum(city.population)} />
            <Row k="Growth" v={`${((city.birthRate - city.deathRate + city.netMigrationRate) / 10).toFixed(2)}%`}
              tone={city.netMigrationRate >= 0 ? 'good' : 'bad'} />
            <Row k="Median wage" v={`$${city.wageRate.toFixed(2)}/h`} />
            <Row k="GDP / capita" v={fmtMoney(city.gdpPerCapita)} />
            <Row k="Unemployment" v={`${city.unemploymentRate.toFixed(1)}%`} tone={city.unemploymentRate > 8 ? 'bad' : 'good'} />
            <Row k="Median age" v={city.medianAge.toFixed(0)} />
            <Row k="Education" v={`${city.educationIndex.toFixed(0)}/100`} />
            <Row k="Land cost" v={`${city.landCostMultiplier.toFixed(2)}x`} />
          </div>
          <div className="mt-2 space-y-1.5">
            <Bar label="Quality of life" value={city.qualityOfLife} tone="emerald" />
            <Bar label="Traffic" value={city.trafficLevel} tone="amber" />
            <Bar label="Pollution" value={city.pollution} max={120} tone="rose" />
            <Bar label={city.housingDemand < 0 ? 'Housing shortage' : 'Housing surplus'} value={Math.abs(city.housingDemand)} tone={city.housingDemand < 0 ? 'rose' : 'sky'} />
          </div>
          <div className="mt-2">
            <div className="text-[9px] uppercase tracking-widest text-slate-600">Population history</div>
            <Spark data={city.populationHistory} color="#38bdf8" height={40} />
          </div>
        </Panel>
      </div>

      <div className="mt-2">
        <Panel title="Household Budgets">
          <Row k="Low income share" v={`${(city.incomeMix.low * 100).toFixed(0)}% · ${fmtMoney(city.discretionary.low)}/mo`} />
          <Row k="Middle income share" v={`${(city.incomeMix.middle * 100).toFixed(0)}% · ${fmtMoney(city.discretionary.middle)}/mo`} />
          <Row k="Affluent share" v={`${(city.incomeMix.affluent * 100).toFixed(0)}% · ${fmtMoney(city.discretionary.affluent)}/mo`} />
          <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
            Discretionary income drives retail and hospitality demand. It shrinks when inflation outruns wages.
          </p>
        </Panel>
      </div>

      <div className="mt-2">
        <Panel title={`Local Market · ${bs.length} sites`}>
          {(['retail_store', 'apartment', 'office', 'cafe', 'restaurant', 'fast_food', 'bar', 'factory', 'farm', 'warehouse'] as const).map(t => {
            const n = bs.filter(x => x.type === t).length;
            if (!n) return null;
            const mine = bs.filter(x => x.type === t && x.companyId === s.playerCompanyId).length;
            return <Row key={t} k={BUILDING_CONFIGS[t].name} v={`${n} total · ${mine} yours`} tone={mine > 0 ? 'good' : 'muted'} />;
          })}
          <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
            Click any building on the map to inspect it. Yellow SALE tags mark assets you can acquire outright.
          </p>
        </Panel>
      </div>
    </div>
  );
}

export { isProducer };
