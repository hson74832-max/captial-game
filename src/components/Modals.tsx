import { useState } from 'react';
import type { GameState } from '../game/types';
import { RESEARCH_MENU } from '../game/constants';
import { fmtMoney, fmtNum, fmtShort } from '../game/engine';
import { Bar, Btn, Panel, Row, Spark, cx } from './ui';

interface Props {
  s: GameState;
  modal: string | null;
  close: () => void;
  onAction: (fn: string, ...args: unknown[]) => void;
}

export default function Modals({ s, modal, close, onAction }: Props) {
  if (!modal) return null;
  const title = {
    economy: 'Macroeconomic Dashboard', market: 'Capital Markets', finance: 'Corporate Finance',
    rivals: 'Competitive Landscape', rd: 'Research & Development', offers: 'Inbound Offers', help: 'How To Play',
  }[modal] ?? '';

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm" onClick={close}>
      <div className="max-h-full w-full max-w-5xl overflow-hidden rounded-xl border border-slate-700 bg-slate-950 shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-700 px-4 py-2">
          <h2 className="text-sm font-bold uppercase tracking-widest text-slate-200">{title}</h2>
          <Btn variant="ghost" onClick={close}>✕ close</Btn>
        </div>
        <div className="max-h-[76vh] overflow-y-auto p-4">
          {modal === 'economy' && <EconomyView s={s} />}
          {modal === 'market' && <MarketView s={s} onAction={onAction} />}
          {modal === 'finance' && <FinanceView s={s} onAction={onAction} />}
          {modal === 'rivals' && <RivalsView s={s} onAction={onAction} />}
          {modal === 'rd' && <ResearchView s={s} onAction={onAction} />}
          {modal === 'treasury' && <TreasuryView s={s} onAction={onAction} />}
          {modal === 'offers' && <OffersView s={s} onAction={onAction} />}
          {modal === 'help' && <HelpView />}
        </div>
      </div>
    </div>
  );
}

function EconomyView({ s }: { s: GameState }) {
  const e = s.economy;
  const cards: Array<[string, number[], string, string]> = [
    ['GDP growth %', e.history.gdp, '#34d399', `${e.gdpGrowth.toFixed(2)}%`],
    ['Inflation (CPI) %', e.history.inflation, '#fbbf24', `${e.inflation.toFixed(2)}%`],
    ['Policy rate %', e.history.rate, '#38bdf8', `${e.interestRate.toFixed(2)}%`],
    ['Unemployment %', e.history.unemployment, '#f87171', `${e.unemployment.toFixed(2)}%`],
  ];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-3">
        {cards.map(([label, data, color, value]) => (
          <Panel key={label} title={label}>
            <div className="font-mono text-lg font-bold" style={{ color }}>{value}</div>
            <Spark data={data} color={color} height={46} />
          </Panel>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Panel title="Business Cycle">
          <div className="mb-2 text-xl font-bold capitalize text-slate-100">{e.cycle}</div>
          <Row k="Months in phase" v={String(e.cycleMonth)} />
          <Row k="Consumer confidence" v={e.consumerConfidence.toFixed(0)} tone={e.consumerConfidence > 60 ? 'good' : 'bad'} />
          <Row k="Business confidence" v={e.businessConfidence.toFixed(0)} />
          <Row k="Nominal GDP" v={fmtMoney(e.nominalGdp)} />
          <div className="mt-2 space-y-1.5">
            <Bar label="Consumer confidence" value={e.consumerConfidence} tone="emerald" />
            <Bar label="Business confidence" value={e.businessConfidence} tone="sky" />
          </div>
        </Panel>
        <Panel title="Central Bank">
          <Row k="Policy rate" v={`${e.interestRate.toFixed(2)}%`} />
          <Row k="10-year yield" v={`${e.tenYearYield.toFixed(2)}%`} />
          <Row k="Forward guidance" v={e.guidance} tone={e.guidance === 'hawkish' ? 'bad' : e.guidance === 'dovish' ? 'good' : undefined} />
          <Row k="Credibility" v={`${(e.cbCredibility * 100).toFixed(0)}%`} />
          <Row k="Money supply index" v={e.moneySupply.toFixed(1)} />
          <Row k="Purchasing power" v={e.purchasingPower.toFixed(1)} />
          <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
            The bank follows a Taylor rule: rates rise with inflation and growth. High rates compress asset
            valuations, raise your borrowing cost and slow consumer demand.
          </p>
        </Panel>
        <Panel title="Prices & Fiscal">
          <Row k="CPI index" v={e.cpi.toFixed(1)} />
          <Row k="Diesel" v={`$${e.dieselPrice.toFixed(2)}/gal`} tone={e.energyShockMonths > 0 ? 'bad' : undefined} />
          <Row k="Energy shock" v={e.energyShockMonths > 0 ? `${e.energyShockMonths} months left` : 'none'} />
          <Row k="Corporate tax" v={`${e.corporateTaxRate.toFixed(1)}%`} />
          <Row k="Property tax" v={`${(e.propertyTaxRate * 100).toFixed(2)}% / yr`} />
          <Row k="Capital gains" v={`${e.capitalGainsRate.toFixed(0)}%`} />
          <Row k="Carbon levy" v={`$${e.carbonTaxPerUnit.toFixed(2)} / unit`} tone={e.carbonTaxPerUnit > 0.4 ? 'bad' : undefined} />
          <Row k="Minimum wage" v={`$${e.minimumWage.toFixed(2)}/h`} />
        </Panel>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Panel title="Price Index by Category">
          {Object.entries(s.economy.cpiByCategory)
            .filter(([k]) => k !== 'core')
            .sort((a, b) => b[1] - a[1])
            .map(([cat, v]) => (
              <div key={cat}>
                <div className="flex justify-between text-[10px]">
                  <span className="capitalize text-slate-400">{cat}</span>
                  <span className="font-mono text-slate-200">{v.toFixed(1)}</span>
                </div>
                <Bar label="" value={Math.max(0, (v - 92))} max={26}
                  tone={v > 108 ? 'rose' : v > 103 ? 'amber' : 'emerald'} />
              </div>
            ))}
          <Row k="Core CPI (ex food & energy)" v={(s.economy.cpiByCategory.core ?? 100).toFixed(1)}
            tone={(s.economy.cpiByCategory.core ?? 100) > 106 ? 'bad' : 'good'} />
          <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">
            Headline spikes on food and energy; core is what the central bank actually targets.
          </p>
        </Panel>
        <Panel title="Fiscal &amp; Monetary">
          <Row k="Government debt" v={fmtMoney(s.economy.govDebt)} />
          <Row k="Debt / GDP" v={`${(s.economy.govDebt / Math.max(1, s.economy.nominalGdp)).toFixed(2)}×`}
            tone={s.economy.govDebt / Math.max(1, s.economy.nominalGdp) > 1.2 ? 'bad' : undefined} />
          <Row k="Monthly deficit" v={fmtMoney(s.economy.govDeficit)} tone={s.economy.govDeficit > 0 ? 'bad' : 'good'} />
          <Row k="Central bank balance sheet" v={fmtMoney(s.economy.centralBankAssets)} />
          <Row k="Base money" v={s.economy.baseMoney.toFixed(0)} />
          <Row k="Broad money M2" v={s.economy.broadMoney.toFixed(0)} />
          <Row k="Dividend tax" v={`${s.economy.dividendTaxRate.toFixed(0)}%`} />
          <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">
            QE expands the balance sheet while the rate is pinned; QT rolls it off.
            Deficits in recessions are the automatic stabiliser working.
          </p>
        </Panel>
        <Panel title="Labour &amp; Energy">
          <Row k="Productivity growth" v={`${s.economy.productivityGrowth.toFixed(2)}%/yr`} tone="good" />
          <Row k="Unit labour cost" v={`${s.economy.unitLaborCostGrowth.toFixed(2)}%/yr`}
            tone={s.economy.unitLaborCostGrowth > 3 ? 'bad' : undefined} />
          <Row k="Household savings rate" v={`${s.economy.householdSavingsRate.toFixed(1)}%`} />
          <Row k="Strategic petroleum reserve" v={`${s.economy.strategicReserveDays.toFixed(0)} days`}
            tone={s.economy.strategicReserveDays < 60 ? 'bad' : undefined} />
          <Row k="Energy shock" v={s.economy.energyShockMonths > 0
            ? `${s.economy.energyShockMonths.toFixed(1)} months left` : 'none'}
            tone={s.economy.energyShockMonths > 0 ? 'bad' : 'good'} />
          <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">
            Real wages track productivity; nominal wages index to expected inflation through
            Phillips-curve bargaining. Tight labour markets accelerate the spiral.
          </p>
        </Panel>
        <Panel title="Government">
          <div className="mb-1 text-lg font-bold capitalize text-slate-100">{s.politics.rulingParty}</div>
          <Row k="Approval" v={`${s.politics.approval.toFixed(0)}%`} tone={s.politics.approval > 50 ? 'good' : 'bad'} />
          <Row k="Next election" v={String(s.politics.nextElectionYear)} />
          <Row k="Antitrust threshold" v={`${s.politics.antitrustThreshold.toFixed(0)}% share`} />
          <div className="mt-2 space-y-1.5">
            <Bar label="Industry lobby" value={s.politics.industryLobby * 100} tone="amber" />
            <Bar label="Environmental lobby" value={s.politics.greenLobby * 100} tone="emerald" />
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
            Elections every four years. Progressives raise corporate, carbon and wage floors; libertarians cut
            them and loosen antitrust. Approval tracks growth, prices and jobs.
          </p>
        </Panel>
        <Panel title="Banking System">
          <Row k="Capital adequacy" v={`${(e.bankCapitalAdequacy * 100).toFixed(1)}%`} tone={e.bankCapitalAdequacy < 0.09 ? 'bad' : 'good'} />
          <Row k="Loan-loss provisions" v={fmtMoney(e.loanLossProvisions)} />
          <Row k="Credit conditions" v={e.creditTightness > 0.6 ? 'FROZEN' : e.creditTightness > 0.25 ? 'tightening' : 'normal'}
            tone={e.creditTightness > 0.6 ? 'bad' : e.creditTightness > 0.25 ? undefined : 'good'} />
          <Row k="Aggregate corporate debt" v={fmtMoney(s.companies.reduce((a, c) => a + c.debt, 0))} />
          <div className="mt-2"><Bar label="Credit tightness" value={e.creditTightness * 100} tone="rose" /></div>
          <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
            When leverage passes 1.4× GDP and bank capital thins, a Minsky moment freezes lending. Borrow before
            you need to, not after.
          </p>
        </Panel>
        <Panel title="Import Terminals">
          {(() => {
            const ports = s.buildings.filter(x => x.type === 'seaport');
            if (ports.length === 0) return <p className="text-[11px] text-slate-500">No seaports on this map.</p>;
            return (
              <div className="space-y-1">
                {ports.slice(0, 5).map(port => {
                  const inbound = s.portShipments.filter(x => x.portBuildingId === port.id);
                  const atSea = inbound.reduce((sum, x) => sum + x.amount, 0);
                  const stocked = Object.values(port.inventory).reduce((a, c) => a + c, 0);
                  return (
                    <div key={port.id}>
                      <div className="flex justify-between text-[10px]">
                        <span className="truncate text-slate-300">{port.name}</span>
                        <span className="font-mono text-slate-500">{fmtNum(Math.round(stocked))} on dock</span>
                      </div>
                      <Bar label="" value={Math.min(100, (stocked / Math.max(1, port.inventoryCapacity)) * 100)}
                        tone={stocked < port.inventoryCapacity * 0.2 ? 'rose' : 'sky'} />
                      <div className="text-[9px] text-slate-600">
                        {inbound.length} sailing{inbound.length === 1 ? '' : 's'} · {fmtNum(Math.round(atSea))} units inbound
                        {inbound[0] && ` · next berth in ${Math.ceil((100 - inbound[0].progress) / 100 * inbound[0].transitHours)}h from ${inbound[0].origin}`}
                      </div>
                    </div>
                  );
                })}
                <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">
                  Ports have finite throughput. Stock arrives on ships with real transit time, so a buying
                  binge drains the berth and you wait for the next sailing.
                </p>
              </div>
            );
          })()}
        </Panel>
        <Panel title="Environment">
          <Row k="Atmospheric CO₂" v={`${e.co2Stock.toFixed(1)} ppm`} tone={e.co2Stock > 425 ? 'bad' : undefined} />
          <Row k="Climate drag on GDP" v={e.co2Stock > 425 ? `−${((e.co2Stock - 425) * 0.00006 * 12).toFixed(2)}%/yr` : 'none'}
            tone={e.co2Stock > 425 ? 'bad' : 'good'} />
          <div className="mt-1 space-y-1">
            {s.cities.slice(0, 5).map(c => (
              <Bar key={c.id} label={`${c.name} pollution`} value={c.pollution} max={120}
                tone={c.pollution > 60 ? 'rose' : 'amber'} />
            ))}
          </div>
        </Panel>
      </div>
      <Panel title="Commodity & Goods Prices">
        <div className="grid grid-cols-4 gap-2">
          {s.products.map(p => (
            <div key={p.id} className="rounded border border-slate-800 bg-slate-900/60 p-2">
              <div className="flex items-center justify-between">
                <span className="truncate text-[11px] text-slate-300">{p.icon} {p.name}</span>
                <span className="font-mono text-[11px] text-slate-100">${p.currentPrice.toFixed(1)}</span>
              </div>
              <Spark data={p.priceHistory} color={p.kind === 'consumer' ? '#a78bfa' : p.kind === 'semi' ? '#38bdf8' : '#fbbf24'} height={22} />
              <div className="flex justify-between text-[9px] text-slate-500">
                <span>{p.kind}</span><span>demand {p.marketDemand.toFixed(0)}</span>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function MarketView({ s, onAction }: { s: GameState; onAction: Props['onAction'] }) {
  const p = s.companies.find(c => c.id === s.playerCompanyId)!;
  const [qty, setQty] = useState(1000);
  const holdings = Object.entries(p.equityHoldings).filter(([, v]) => v > 0);
  const portfolioValue = holdings.reduce((sum, [id, sh]) => {
    const c = s.companies.find(x => x.id === id);
    return sum + (c ? c.sharePrice * sh : 0);
  }, 0);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <Panel title="Market Index">
          <div className="font-mono text-xl font-bold text-slate-100">{fmtNum(s.stockMarket.index)}</div>
          <div className={cx('text-[11px] uppercase', s.stockMarket.sentiment === 'bullish' ? 'text-emerald-400'
            : s.stockMarket.sentiment === 'bearish' ? 'text-rose-400' : 'text-slate-400')}>{s.stockMarket.sentiment}</div>
          <Spark data={s.stockMarket.indexHistory} color="#38bdf8" height={54} />
        </Panel>
        <Panel title="Your Equity Portfolio">
          <Row k="Market value" v={fmtMoney(portfolioValue)} />
          <Row k="Cash available" v={fmtMoney(p.cash)} />
          <Row k="Your share price" v={`$${p.sharePrice.toFixed(2)}`} />
          <Row k="Your market cap" v={fmtMoney(p.marketCap)} />
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[10px] text-slate-500">Trade size</span>
            <input type="number" value={qty} min={100} step={100}
              onChange={e => setQty(Math.max(100, Number(e.target.value)))}
              className="w-24 rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-[11px] text-slate-200" />
            <span className="text-[10px] text-slate-500">shares</span>
          </div>
        </Panel>
        <Panel title="Your Share Price">
          <Spark data={p.sharePriceHistory} color="#34d399" height={44} />
          <Row k="Shares outstanding" v={fmtNum(p.sharesOutstanding)} />
          <Row k="Founder stake" v={`${((p.founderShares / p.sharesOutstanding) * 100).toFixed(1)}%`} />
          <Row k="Issued this year" v={`${fmtNum(p.sharesIssuedThisYear)} / ${fmtNum(Math.floor(p.sharesOutstanding * 0.2))}`} />
          <div className="mt-1.5 flex gap-1">
            <Btn className="flex-1" variant="primary"
              onClick={() => onAction('issueShares', Math.floor(p.sharesOutstanding * 0.05))}>
              Issue 5% equity (+{fmtMoney(p.sharesOutstanding * 0.05 * p.sharePrice * 0.96)})
            </Btn>
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
            Secondary offerings raise cash at a 4% discount and dilute every holder, including you. Capped at 20% a year.
          </p>
        </Panel>
      </div>
      <Panel title="Listed Companies">
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="text-[9px] uppercase tracking-wider text-slate-500">
              <tr className="border-b border-slate-800">
                <th className="py-1 text-left">Company</th><th className="text-left">Profile</th>
                <th className="text-right">Price</th><th className="text-right">Mkt cap</th>
                <th className="text-right">Cash</th><th className="text-right">Profit/mo</th>
                <th className="text-right">Sites</th><th className="text-right">You hold</th><th></th>
              </tr>
            </thead>
            <tbody>
              {s.companies.map(c => {
                const held = p.equityHoldings[c.id] ?? 0;
                return (
                  <tr key={c.id} className="border-b border-slate-900 hover:bg-slate-900/50">
                    <td className="py-1">
                      <span className="inline-block h-2 w-2 rounded-full" style={{ background: c.color }} />
                      <span className={cx('ml-1.5', c.isPlayer ? 'font-bold text-emerald-300' : 'text-slate-200')}>{c.name}</span>
                    </td>
                    <td className="text-slate-500">{c.personality} · {c.sectorFocus.replace('_', ' ')}</td>
                    <td className="text-right font-mono text-slate-200">${c.sharePrice.toFixed(2)}</td>
                    <td className="text-right font-mono text-slate-400">{fmtShort(c.marketCap)}</td>
                    <td className="text-right font-mono text-slate-400">{fmtShort(c.cash)}</td>
                    <td className={cx('text-right font-mono', c.monthlyProfit >= 0 ? 'text-emerald-400' : 'text-rose-400')}>{fmtShort(c.monthlyProfit)}</td>
                    <td className="text-right font-mono text-slate-400">{s.buildings.filter(b => b.companyId === c.id).length}</td>
                    <td className="text-right font-mono text-slate-300">{held ? fmtNum(held) : '—'}</td>
                    <td className="py-1 text-right">
                      {!c.isPlayer && (
                        <div className="flex justify-end gap-1">
                          <Btn onClick={() => onAction('buyShares', c.id, qty)}
                            title={`${((qty / c.sharesOutstanding) * 100).toFixed(2)}% of ${c.name}. Cross 50% for a hostile takeover.`}>Buy</Btn>
                          <Btn variant="ghost" disabled={held <= 0} onClick={() => onAction('sellShares', c.id, qty)}>Sell</Btn>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function FinanceView({ s, onAction }: { s: GameState; onAction: Props['onAction'] }) {
  const p = s.companies.find(c => c.id === s.playerCompanyId)!;
  const [amount, setAmount] = useState(5_000_000);
  const [term, setTerm] = useState(60);
  const rate = s.economy.interestRate + 2.4 + (p.debt / Math.max(1, p.totalAssets)) * 6;
  const r = rate / 100 / 12;
  const payment = amount * r / (1 - Math.pow(1 + r, -term));
  const mine = s.buildings.filter(b => b.companyId === p.id);
  const book = mine.reduce((sum, b) => sum + b.constructionCost + b.landValue, 0);

  return (
    <div className="grid grid-cols-3 gap-3">
      <Panel title="Balance Sheet">
        <Row k="Cash" v={fmtMoney(p.cash)} tone={p.cash < 0 ? 'bad' : 'good'} />
        <Row k="Property at book" v={fmtMoney(book)} />
        <Row k="Equity investments" v={fmtMoney(Object.entries(p.equityHoldings).reduce((a, [id, sh]) => {
          const c = s.companies.find(x => x.id === id); return a + (c ? c.sharePrice * sh : 0);
        }, 0))} />
        <Row k="Total assets" v={fmtMoney(p.totalAssets)} />
        <div className="my-1 border-t border-slate-800" />
        <Row k="Debt outstanding" v={fmtMoney(p.debt)} tone={p.debt > 0 ? 'bad' : undefined} />
        <Row k="Net worth" v={fmtMoney(p.totalAssets - p.debt)} tone="good" />
        <Row k="Leverage" v={`${((p.debt / Math.max(1, p.totalAssets)) * 100).toFixed(1)}%`} tone={p.debt / Math.max(1, p.totalAssets) > 0.5 ? 'bad' : undefined} />
        <Row k="Credit rating" v={p.bondRating} />
      </Panel>

      <Panel title="Income Statement (monthly)">
        <Row k="Revenue" v={fmtMoney(p.monthlyRevenue)} tone="good" />
        <Row k="Operating profit" v={fmtMoney(p.monthlyProfit)} tone={p.monthlyProfit >= 0 ? 'good' : 'bad'} />
        <Row k="Interest cost" v={fmtMoney(p.debt * p.interestRate / 100 / 12)} tone="bad" />
        <Row k="Corporate tax rate" v={`${s.economy.corporateTaxRate.toFixed(1)}%`} />
        <Row k="Tax accrued YTD" v={fmtMoney(Math.max(0, p.pretaxYTD) * s.economy.corporateTaxRate / 100)} />
        <div className="mt-2">
          <div className="text-[9px] uppercase tracking-widest text-slate-600">Profit history (monthly)</div>
          <Spark data={p.profitHistory} color="#34d399" height={44} />
        </div>
      </Panel>

      <Panel title="Debt Facility">
        <div className="space-y-2">
          <div>
            <div className="mb-1 flex justify-between text-[10px] text-slate-400"><span>Amount</span><span className="font-mono text-slate-200">{fmtMoney(amount)}</span></div>
            <input type="range" min={500_000} max={80_000_000} step={500_000} value={amount}
              onChange={e => setAmount(Number(e.target.value))} className="h-1 w-full accent-emerald-500" />
          </div>
          <div>
            <div className="mb-1 flex justify-between text-[10px] text-slate-400"><span>Term</span><span className="font-mono text-slate-200">{term} months</span></div>
            <input type="range" min={12} max={240} step={12} value={term}
              onChange={e => setTerm(Number(e.target.value))} className="h-1 w-full accent-emerald-500" />
          </div>
          <Row k="Offered rate" v={`${rate.toFixed(2)}%`} />
          <Row k="Monthly payment" v={fmtMoney(payment)} />
          <Row k="Total interest" v={fmtMoney(payment * term - amount)} tone="bad" />
          <Btn variant="primary" className="w-full" onClick={() => onAction('loan', amount, term)}>Draw down facility</Btn>
        </div>
        <div className="mt-3 space-y-1">
          <div className="text-[9px] uppercase tracking-widest text-slate-600">Outstanding loans</div>
          {s.loans.length === 0 && <p className="text-[11px] text-slate-500">No debt outstanding.</p>}
          {s.loans.map(l => (
            <div key={l.id} className="rounded border border-slate-800 bg-slate-900/60 p-2">
              <div className="flex justify-between text-[11px] text-slate-300">
                <span>{l.lender}</span><span className="font-mono">{fmtMoney(l.balance)}</span>
              </div>
              <div className="flex justify-between text-[9px] text-slate-500">
                <span>{l.rate.toFixed(2)}% · {l.monthsLeft} mo left</span>
                <span>{fmtMoney(l.monthlyPayment)}/mo</span>
              </div>
              <Btn className="mt-1 w-full" onClick={() => onAction('repay', l.id)}>Repay in full</Btn>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

// ════════════════ TREASURY: physical-supply assets & the bond market ════════════════
function TreasuryView({ s, onAction }: { s: GameState; onAction: Props['onAction'] }) {
  const p = s.companies.find(c => c.id === s.playerCompanyId)!;
  const [issueAmount, setIssueAmount] = useState(5_000_000);
  const [term, setTerm] = useState<5 | 10 | 15>(10);
  const curve = [
    { t: '3-month', y: s.economy.threeMonthYield },
    { t: '2-year', y: s.economy.twoYearYield },
    { t: '10-year', y: s.economy.tenYearYield },
  ];
  const unlocked = s.tradedAssets.filter(a => a.unlockYear <= s.year);
  const held = unlocked.filter(a => a.playerHolding > 0);
  const portfolio = held.reduce((sum, a) => sum + a.price * a.playerHolding, 0);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-3">
        <Panel title="Yield Curve">
          {curve.map(c => (
            <Row key={c.t} k={c.t} v={`${c.y.toFixed(2)}%`}
              tone={c.y < s.economy.interestRate ? 'bad' : undefined} />
          ))}
          <div className="mt-1.5"><Bar label="Policy rate" value={s.economy.interestRate} max={14} tone="sky" /></div>
          <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">
            {s.economy.twoYearYield > s.economy.tenYearYield
              ? 'Curve inverted — the market is pricing a slowdown.'
              : 'Curve steep — long money is demanding a term premium.'}
          </p>
        </Panel>
        <Panel title="Your Positions">
          <Row k="Marketable securities" v={fmtMoney(portfolio)} tone="good" />
          <Row k="Carry-forward losses" v={fmtMoney(p.lossCarryforward)} />
          <Row k="Tax paid YTD" v={fmtMoney(p.taxesPaidYTD)} />
          <Row k="Bonds held" v={String(s.bonds.filter(b => b.holderId === 'player').length)} />
          <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">
            Sales consume lots FIFO. Under a year is taxed at {s.economy.shortTermCapitalGainsRate}%,
            over a year at {s.economy.longTermCapitalGainsRate}%. Losses carry forward.
          </p>
        </Panel>
        <Panel title="Trade Partners">
          {s.tradePartners.map(t => (
            <Row key={t.id} k={t.name}
              v={`FX ${t.exchangeRate.toFixed(2)} · duty ${(t.tariffRate * 100).toFixed(0)}%`}
              tone={t.relationship < 0 ? 'bad' : undefined} />
          ))}
          <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">
            A strong currency and low duties cheapen every import you buy at the port.
          </p>
        </Panel>
        <Panel title="Patents Held">
          {s.patents.filter(pt => pt.ownerId === p.id).length === 0 && (
            <p className="text-[11px] text-slate-500">No live patents. Complete an R&amp;D programme — 30% fail.</p>
          )}
          {s.patents.filter(pt => pt.ownerId === p.id).map(pt => {
            const prod = s.products.find(pr => pr.id === pt.productId);
            return (
              <Row key={pt.id} k={prod?.name ?? 'Unknown'}
                v={`+${((pt.expiresYear - s.year) * 3).toFixed(0)}% · exp ${pt.expiresYear}`} tone="good" />
            );
          })}
        </Panel>
      </div>

      <Panel title="Commodities, Metals & Crypto">
        <div className="grid grid-cols-3 gap-2">
          {unlocked.map(a => {
            const pct = a.history.length > 1
              ? ((a.price - a.history[0]) / a.history[0]) * 100 : 0;
            const floatPct = Number.isFinite(a.circulating)
              ? ((a.playerHolding / a.circulating) * 100) : 0;
            const qty = a.price > 1000 ? 0.5 : a.price > 50 ? 10 : 1000;
            return (
              <div key={a.id} className="rounded-lg border border-slate-800 bg-slate-900/50 p-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-[12px] font-semibold text-slate-100">{a.symbol}</span>
                  <span className={cx('font-mono text-[11px]', pct >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                    {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
                  </span>
                </div>
                <div className="text-[10px] text-slate-500">{a.name}</div>
                <Spark data={a.history} color={pct >= 0 ? '#34d399' : '#fb7185'} height={38} />
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-[13px] text-slate-100">
                    ${a.price >= 1000 ? a.price.toLocaleString(undefined, { maximumFractionDigits: 0 }) : a.price.toFixed(2)}
                  </span>
                  <span className="text-[9px] text-slate-600">/ {a.unit}</span>
                </div>
                {a.playerHolding > 0 && (
                  <div className="mt-0.5 text-[10px] text-emerald-300">
                    {a.playerHolding.toFixed(4)} held
                    {floatPct > 0.001 && ` · ${floatPct.toFixed(3)}% of float`}
                  </div>
                )}
                <div className="mt-1.5 flex gap-1">
                  <Btn className="flex-1" onClick={() => onAction('buyAsset', a.id, qty)}>Buy {qty}</Btn>
                  <Btn className="flex-1" variant="ghost" disabled={a.playerHolding <= 0}
                    onClick={() => onAction('sellAsset', a.id, Math.min(qty, a.playerHolding))}>Sell</Btn>
                </div>
                <p className="mt-1 text-[9px] leading-relaxed text-slate-600">
                  {a.assetClass === 'etf'
                    ? `Tracks ${a.trackedCompanyIds?.length ?? 0} companies in this world at NAV.`
                    : `Float ${Number.isFinite(a.circulating) ? fmtNum(a.circulating) : 'open'} ${a.unit}. Large orders slip.`}
                </p>
              </div>
            );
          })}
        </div>
      </Panel>

      <div className="grid grid-cols-3 gap-3">
        <Panel title="Bond Market">
          <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
            {s.bonds.map(b => {
              const issuer = s.companies.find(c => c.id === b.issuerId);
              const yearsLeft = b.maturityYear - s.year;
              const ytm = yearsLeft > 0
                ? ((b.faceValue * b.couponRate / 100 + (b.faceValue - b.marketPrice) / yearsLeft)
                  / ((b.faceValue + b.marketPrice) / 2)) * 100 : 0;
              const notional = b.faceValue * b.quantity * b.marketPrice / 100;
              const mine = b.holderId === 'player';
              return (
                <div key={b.id} className={cx('rounded border px-2 py-1.5',
                  b.defaulted ? 'border-rose-900 bg-rose-950/40' : 'border-slate-800 bg-slate-900/50')}>
                  <div className="flex justify-between">
                    <span className="text-[11px] text-slate-200">{issuer?.name ?? 'Unknown'}</span>
                    <span className="font-mono text-[10px] text-amber-300">{b.rating}</span>
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>{b.maturityYear} · coupon {b.couponRate.toFixed(2)}%</span>
                    <span>YTM {ytm.toFixed(2)}%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={cx('font-mono text-[10px]', b.marketPrice >= 100 ? 'text-emerald-400' : 'text-rose-400')}>
                      {b.defaulted ? 'DEFAULTED' : b.marketPrice.toFixed(1)}
                    </span>
                    <span className="text-[10px] text-slate-500">{fmtMoney(notional)}</span>
                  </div>
                  {!b.defaulted && (
                    mine
                      ? <Btn className="mt-1 w-full" variant="ghost" onClick={() => onAction('sellBond', b.id)}>Sell position</Btn>
                      : b.holderId === null && (
                        <Btn className="mt-1 w-full" onClick={() => onAction('buyBond', b.id)}>Buy issue</Btn>
                      )
                  )}
                </div>
              );
            })}
            {s.bonds.length === 0 && <p className="text-[11px] text-slate-500">No bonds outstanding.</p>}
          </div>
        </Panel>
        <Panel title="Issue Your Own Debt">
          <p className="mb-2 text-[11px] leading-relaxed text-slate-400">
            Bonds price off your rating and the curve. Capacity is 60% of net assets —
            the same covenant the banks apply.
          </p>
          <div className="mb-1 text-[9px] uppercase tracking-widest text-slate-600">Size</div>
          <div className="grid grid-cols-4 gap-1">
            {[2_000_000, 5_000_000, 15_000_000, 40_000_000].map(v => (
              <Btn key={v} variant={issueAmount === v ? 'primary' : 'default'} onClick={() => setIssueAmount(v)}>
                {fmtMoney(v)}
              </Btn>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1">
            {([5, 10, 15] as const).map(t => (
              <Btn key={t} variant={term === t ? 'primary' : 'default'} onClick={() => setTerm(t)}>
                {t}yr
              </Btn>
            ))}
          </div>
          <Row k="Your rating" v={p.bondRating} tone={p.bondRating <= 'BB' ? 'bad' : 'good'} />
          <Btn variant="primary" className="mt-2 w-full" onClick={() => onAction('issueBond', issueAmount, term)}>
            Issue {fmtMoney(issueAmount)} of {term}-year bonds
          </Btn>
        </Panel>
        <Panel title="Ratings Ladder">
          {(['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC', 'CC', 'C', 'D'] as const).map(r => (
            <Row key={r} k={r}
              v={`${({ AAA: 0.4, AA: 0.7, A: 1.1, BBB: 1.8, BB: 3.1, B: 4.8, CCC: 7.2, CC: 9.2, C: 12, D: 18 }[r]).toFixed(1)}% spread`}
              tone={p.bondRating === r ? 'good' : undefined} />
          ))}
          <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">
            Agencies hold ratings steady, then cut several notches at once when leverage trips.
          </p>
        </Panel>
      </div>
    </div>
  );
}

function RivalsView({ s, onAction }: { s: GameState; onAction: Props['onAction'] }) {
  const ranked = [...s.companies].sort((a, b) => (b.totalAssets - b.debt) - (a.totalAssets - a.debt));
  const p = s.companies.find(c => c.id === s.playerCompanyId)!;
  const total = Math.max(1, s.buildings.filter(b => b.companyId !== 'system').length);
  const myShare = (s.buildings.filter(b => b.companyId === p.id).length / total) * 100;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Panel title="Corporate Intelligence">
          <p className="mb-2 text-[11px] leading-relaxed text-slate-400">
            $150K per operation. 60% success reveals a rival's cost floors and cash position for six months;
            failure means a regulatory fine and a public scandal.
          </p>
          <div className="grid grid-cols-2 gap-1">
            {s.companies.filter(c => !c.isPlayer).slice(0, 8).map(c => {
              const active = c.costIntelUntilTick > s.tick;
              return (
                <Btn key={c.id} variant={active ? 'primary' : 'default'} disabled={active}
                  onClick={() => onAction('espionage', c.id)}>
                  {active ? `✓ ${c.name.split(' ')[0]}` : c.name.split(' ')[0]}
                </Btn>
              );
            })}
          </div>
        </Panel>
        <Panel title="Antitrust Exposure">
          <Row k="Your share of built assets" v={`${myShare.toFixed(1)}%`} tone={myShare > s.politics.antitrustThreshold ? 'bad' : 'good'} />
          <Row k="Regulatory threshold" v={`${s.politics.antitrustThreshold.toFixed(0)}%`} />
          <Row k="Government" v={s.politics.rulingParty} />
          <div className="mt-2"><Bar label="Market concentration" value={myShare} max={Math.max(60, s.politics.antitrustThreshold * 1.4)}
            tone={myShare > s.politics.antitrustThreshold ? 'rose' : 'emerald'} /></div>
          <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
            Cross the threshold and regulators fine you 2% of market cap every six months. Progressive
            governments lower the bar.
          </p>
        </Panel>
      </div>
      <Panel title="League Table by Net Worth">
        <table className="w-full text-[11px]">
          <thead className="text-[9px] uppercase tracking-wider text-slate-500">
            <tr className="border-b border-slate-800">
              <th className="py-1 text-left">#</th><th className="text-left">Company</th><th className="text-left">Board profile</th>
              <th className="text-right">Net worth</th><th className="text-right">Cash</th><th className="text-right">Debt</th>
              <th className="text-right">Sites</th><th className="text-right">Skill</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((c, i) => (
              <tr key={c.id} className={cx('border-b border-slate-900', c.isPlayer && 'bg-emerald-500/5')}>
                <td className="py-1 text-slate-500">{i + 1}</td>
                <td>
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: c.color }} />
                  <span className={cx('ml-1.5', c.isPlayer ? 'font-bold text-emerald-300' : 'text-slate-200')}>{c.name}</span>
                </td>
                <td className="text-slate-500">{c.personality}</td>
                <td className="text-right font-mono text-slate-100">{fmtMoney(c.totalAssets - c.debt)}</td>
                <td className="text-right font-mono text-slate-400">{fmtShort(c.cash)}</td>
                <td className="text-right font-mono text-rose-400/80">{fmtShort(c.debt)}</td>
                <td className="text-right font-mono text-slate-400">{s.buildings.filter(b => b.companyId === c.id).length}</td>
                <td className={cx('text-right uppercase', c.skill === 'ruthless' ? 'text-rose-400' : c.skill === 'shrewd' ? 'text-amber-400' : 'text-slate-500')}>{c.skill}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <Panel title="Assets Listed For Sale">
        <div className="grid grid-cols-3 gap-2">
          {s.buildings.filter(b => b.forSale).slice(0, 24).map(b => (
            <div key={b.id} className="rounded border border-yellow-600/40 bg-yellow-500/5 p-2">
              <div className="truncate text-[11px] text-slate-200">{b.name}</div>
              <div className="text-[9px] text-slate-500">{s.cities.find(c => c.id === b.cityId)?.name} · fair value {fmtMoney(b.fairValue)}</div>
              <div className="font-mono text-[11px] text-yellow-300">Asking {fmtMoney(b.askingPrice)}</div>
            </div>
          ))}
          {s.buildings.filter(b => b.forSale).length === 0 && <p className="text-[11px] text-slate-500">Nothing on the market right now.</p>}
        </div>
      </Panel>
    </div>
  );
}

function ResearchView({ s, onAction }: { s: GameState; onAction: Props['onAction'] }) {
  const labs = s.buildings.filter(b => b.companyId === s.playerCompanyId && b.type === 'lab');
  return (
    <div className="space-y-3">
      <Panel title="Programmes">
        <div className="grid grid-cols-3 gap-2">
          {RESEARCH_MENU.map(r => {
            const active = s.research.find(x => x.name === r.name);
            return (
              <div key={r.name} className="rounded border border-slate-800 bg-slate-900/60 p-3">
                <div className="text-[12px] font-semibold text-slate-200">{r.name}</div>
                <div className="text-[10px] text-slate-500">{r.category} · {r.months} months</div>
                <div className="mt-1 text-[11px] text-emerald-300">{r.effect}</div>
                <div className="mt-2 font-mono text-[11px] text-slate-300">{fmtMoney(r.cost)}</div>
                {active ? (
                  <div className="mt-2">
                    <Bar label={active.monthsLeft > 0 ? `${active.monthsLeft} months left` : 'Complete'} value={active.progress} tone="sky" />
                  </div>
                ) : (
                  <Btn className="mt-2 w-full" variant="primary" onClick={() => onAction('research', r.name)}>Fund programme</Btn>
                )}
              </div>
            );
          })}
        </div>
      </Panel>
      <Panel title="Laboratories">
        {labs.length === 0
          ? <p className="text-[11px] text-slate-500">You have no R&amp;D labs. Building one and staffing it accelerates every programme.</p>
          : labs.map(l => (
            <Row key={l.id} k={l.name} v={`${l.employees} researchers · skill ${l.staffSkill.toFixed(1)}`} tone="good" />
          ))}
      </Panel>
    </div>
  );
}

function OffersView({ s, onAction }: { s: GameState; onAction: Props['onAction'] }) {
  if (s.offers.length === 0) return <p className="text-[12px] text-slate-500">No inbound offers at the moment.</p>;
  return (
    <div className="grid grid-cols-2 gap-3">
      {s.offers.map(o => {
        const premium = ((o.amount / Math.max(1, o.fairValue)) - 1) * 100;
        return (
          <Panel key={o.id} title={o.buildingName}>
            <p className="mb-2 text-[11px] leading-relaxed text-slate-400">{o.rationale}</p>
            <Row k="Bidder" v={o.buyerName} />
            <Row k="Offer" v={fmtMoney(o.amount)} tone="good" />
            <Row k="Fair value" v={fmtMoney(o.fairValue)} />
            <Row k="Premium" v={`${premium >= 0 ? '+' : ''}${premium.toFixed(1)}%`} tone={premium >= 0 ? 'good' : 'bad'} />
            <Row k="Expires in" v={`${Math.ceil((o.expiresTick - s.tick) / 24)} days`} />
            <div className="mt-2 flex gap-1">
              <Btn variant="primary" className="flex-1" onClick={() => onAction('offer', o.id, true)}>Accept</Btn>
              <Btn variant="danger" className="flex-1" onClick={() => onAction('offer', o.id, false)}>Decline</Btn>
            </div>
          </Panel>
        );
      })}
    </div>
  );
}

function HelpView() {
  return (
    <div className="grid grid-cols-2 gap-4 text-[12px] leading-relaxed text-slate-300">
      <div className="space-y-3">
        <section>
          <h3 className="mb-1 text-[11px] font-bold uppercase tracking-widest text-emerald-400">Getting started</h3>
          <p>You run a holding company with $40M. Pick a building from the left panel, then click a legal plot on
            the map. Construction takes real time — nothing earns until it opens and hires staff.</p>
        </section>
        <section>
          <h3 className="mb-1 text-[11px] font-bold uppercase tracking-widest text-emerald-400">Fast money, slow money</h3>
          <p>Cafés and fast food pay back quickly but are exposed to wages and footfall. Apartments and offices fill
            slowly and yield steadily. Factories and mines are cyclical and capital-hungry, but own the value chain.</p>
        </section>
        <section>
          <h3 className="mb-1 text-[11px] font-bold uppercase tracking-widest text-emerald-400">Supply chains</h3>
          <p>Every buyer signs contracts. Switch a site to <em>manual</em> and tender each input yourself: quotes
            show goods price, freight, quality and reliability. Orders then run through processing and cold-chain
            transit — perishables spoil past 84 hours, so short supply lines pay.</p>
        </section>
        <section>
          <h3 className="mb-1 text-[11px] font-bold uppercase tracking-widest text-emerald-400">Land &amp; tenure</h3>
          <p>Buy titles ahead of growth: banked land appreciates and removes land cost from later builds. Listed
            buildings can be bought outright, mortgaged up to 75%, or leased. Unlisted assets require negotiation —
            lowball and the board closes talks for three months.</p>
        </section>
      </div>
      <div className="space-y-3">
        <section>
          <h3 className="mb-1 text-[11px] font-bold uppercase tracking-widest text-sky-400">The living economy</h3>
          <p>Cities have births, deaths and migration. Wages, unemployment, housing shortages and pollution all
            respond to what gets built. Rich cities buy premium goods; poor cities are price-sensitive.</p>
        </section>
        <section>
          <h3 className="mb-1 text-[11px] font-bold uppercase tracking-widest text-sky-400">Macro matters</h3>
          <p>The central bank follows a Taylor rule. Booms lift confidence and rents; recessions crush discretionary
            spending and asset values. Borrow cheaply in the trough, not at the peak.</p>
        </section>
        <section>
          <h3 className="mb-1 text-[11px] font-bold uppercase tracking-widest text-sky-400">Politics &amp; risk</h3>
          <p>Elections every four years reset corporate, carbon and wage policy. Unions form in big plants and
            strike below 34 morale. Cross the antitrust threshold and you are fined. Let national leverage pass
            1.4× GDP and a Minsky moment freezes all lending.</p>
        </section>
        <section>
          <h3 className="mb-1 text-[11px] font-bold uppercase tracking-widest text-sky-400">Control &amp; intelligence</h3>
          <p>Buy a rival past 50% of its float for a hostile takeover that consolidates its assets into yours.
            Issue your own equity to fund expansion (dilutive, capped at 20%/yr), or run industrial espionage.</p>
        </section>
        <section>
          <h3 className="mb-1 text-[11px] font-bold uppercase tracking-widest text-sky-400">How shoppers decide</h3>
          <p>Demand is not a price power-law. Each city splits into low, middle and affluent households with
            their own discretionary budgets, and every product carries price / quality / brand weights that
            decide its rating. Price response is logistic — ±3% barely registers, then a threshold tips — while
            luxury lines keep a Veblen band where demand peaks <em>above</em> parity. Shoppers anchor on the first
            price they saw, a near-empty shelf signals urgency, bestsellers snowball through social proof, cheap
            items sell on impulse, and staples see bulk buying that flattens deep discounts.</p>
        </section>
        <section>
          <h3 className="mb-1 text-[11px] font-bold uppercase tracking-widest text-sky-400">Tax &amp; the state</h3>
          <p>Property tax bills you monthly on assessed value including vacant land — holding idle parcels is
            expensive, and receipts fund the services that lift a city's quality of life. Corporate tax is
            annual with net operating losses sheltering income. Dividends are quarterly, taxed, and the share
            price drops by the payout on the ex-date so there is no dividend arbitrage. The fiscal budget runs
            monthly with unemployment transfers as the automatic stabiliser.</p>
        </section>
        <section>
          <h3 className="mb-1 text-[11px] font-bold uppercase tracking-widest text-sky-400">Capital markets</h3>
          <p>The Treasury desk trades assets backed by genuine physical supply — oil, gold, wheat, copper,
            lithium, silver, platinum and Bitcoin with its real 21M cap and four-year halving. The float is
            finite, so big orders slip against you. In-world index funds track the AI companies that actually
            exist here, priced off their aggregate market cap. Sales consume FIFO tax lots, short and long-term
            gains are taxed separately, losses carry forward, and a 30-day wash sale disallows a harvested loss.</p>
        </section>
        <section>
          <h3 className="mb-1 text-[11px] font-bold uppercase tracking-widest text-sky-400">Debt &amp; ratings</h3>
          <p>Bonds price off a live yield curve plus your rating spread. Agencies hold ratings steady, then cut
            several notches at once when leverage trips. Rivals also collude in cartels, launch predatory
            campaigns below cost, and can go bust mid-contract — stranding your supply line.</p>
        </section>
        <section>
          <h3 className="mb-1 text-[11px] font-bold uppercase tracking-widest text-sky-400">Controls</h3>
          <p>Drag to pan · scroll to zoom · click a building to inspect · overlays reveal land value, zoning,
            traffic, pollution and ownership. Speed buttons run the clock from paused to 24× hours per frame.</p>
        </section>
      </div>
    </div>
  );
}
