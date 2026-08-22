import { useState } from 'react';
import type { GameState } from '../game/types';
import { RESEARCH_MENU } from '../game/constants';
import { companyFinancials, fmtMoney, fmtNum, fmtShort } from '../game/engine';
import { topSpreads, arbitrageBand } from '../game/regional';
import { competitionMode, industryHHI, entryThreat } from '../game/competition';
import { structuralUnemployment } from '../game/labor';
import { Bar, Btn, Panel, Row, Spark, Tip, cx } from './ui';

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
          {modal === 'companies' && <CompaniesView s={s} onAction={onAction} />}
          {modal === 'regional' && <RegionalView s={s} />}
          {modal === 'policy' && <PolicyView s={s} onAction={onAction} />}
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

// ════════════════ COMPANIES: charts, income statement, balance sheet ════════════════
function CompaniesView({ s, onAction }: { s: GameState; onAction: Props['onAction'] }) {
  const [sel, setSel] = useState<string>(s.playerCompanyId);
  const co = s.companies.find(c => c.id === sel);
  const f = co ? companyFinancials(s, co.id) : null;
  const ranked = [...s.companies].sort((a, b) => b.marketCap - a.marketCap);

  if (!co || !f) return null;

  const issuanceRoom = Math.max(0, f.authorizedShares - f.sharesOutstanding);
  const owned = s.buildings.filter(b => b.companyId === co.id).length;
  const isPlayer = co.id === s.playerCompanyId;

  return (
    <div className="space-y-2">
      {/* ── Company selector strip with live charts ── */}
      <div className="grid grid-cols-4 gap-2">
        {ranked.map(c => {
          const active = c.id === sel;
          const cf = companyFinancials(s, c.id);
          return (
            <button key={c.id} onClick={() => setSel(c.id)}
              className={cx('rounded-lg border p-2 text-left transition-colors',
                active ? 'border-emerald-500 bg-emerald-500/10'
                  : 'border-slate-800 bg-slate-900/50 hover:border-slate-600')}>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.color }} />
                <span className="truncate text-[11px] font-semibold text-slate-100">{c.name}</span>
                {c.isPlayer && <span className="text-[8px] text-emerald-400">YOU</span>}
              </div>
              <Spark data={c.sharePriceHistory} color={c.color} height={26} />
              <div className="mt-0.5 flex justify-between text-[9px]">
                <span className="font-mono text-slate-300">${c.sharePrice.toFixed(2)}</span>
                <span className={cx('font-mono', cf.netIncome >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                  {cf.netIncome >= 0 ? '+' : ''}{fmtMoney(cf.netIncome)}/mo
                </span>
              </div>
              <div className="flex justify-between text-[9px] text-slate-600">
                <span>{fmtMoney(cf.totalAssets)} assets</span>
                <span>{fmtNum(cf.sharesOutstanding)} sh</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Performance charts ── */}
      <Panel title={`${co.name} — performance`}>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <div className="mb-0.5 text-[9px] uppercase tracking-widest text-slate-600">Share price</div>
            <Spark data={co.sharePriceHistory} color={co.color} height={46} />
          </div>
          <div>
            <div className="mb-0.5 text-[9px] uppercase tracking-widest text-slate-600">Profit history</div>
            <Spark data={co.profitHistory} color="#34d399" height={46} />
          </div>
          <div>
            <div className="mb-0.5 text-[9px] uppercase tracking-widest text-slate-600">Market cap</div>
            <div className="font-mono text-lg text-slate-100">{fmtMoney(co.marketCap)}</div>
            <div className="grid grid-cols-2 gap-x-2">
              <Row k="Rating" v={co.bondRating} tone={String(co.bondRating).startsWith('A') ? 'good' : undefined} />
              <Row k="Assets" v={String(owned)} />
              <Row k="Skill" v={co.skill} />
              <Row k="Strategy" v={co.strategy} />
            </div>
          </div>
        </div>
      </Panel>

      {/* ── Income statement & balance sheet ── */}
      <div className="grid grid-cols-2 gap-2">
        <Panel title="Income Statement · monthly">
          <Row k="Revenue" v={fmtMoney(f.revenue)} />
          <Row k="Cost of goods sold" v={`−${fmtMoney(f.cogs)}`} />
          <Row k="Gross profit" v={fmtMoney(f.grossProfit)}
            tone={f.grossProfit > 0 ? 'good' : 'bad'} />
          <Row k="Operating expense" v={`−${fmtMoney(f.opex)}`} />
          <Row k="EBITDA" v={fmtMoney(f.ebitda)} tone={f.ebitda > 0 ? 'good' : 'bad'} />
          <Row k="Depreciation" v={`−${fmtMoney(f.depreciation)}`} />
          <Row k="EBIT" v={fmtMoney(f.ebit)} tone={f.ebit > 0 ? 'good' : 'bad'} />
          <Row k="Interest expense" v={`−${fmtMoney(f.interest)}`} />
          <Row k="Pre-tax profit" v={fmtMoney(f.pretax)} tone={f.pretax > 0 ? 'good' : 'bad'} />
          <Row k={`Tax @ ${s.economy.corporateTaxRate.toFixed(0)}%`} v={`−${fmtMoney(f.tax)}`} />
          <div className="mt-1 border-t border-slate-700 pt-1">
            <Row k="NET INCOME" v={fmtMoney(f.netIncome)} tone={f.netIncome > 0 ? 'good' : 'bad'} />
            <Row k="Earnings per share" v={`$${f.eps.toFixed(3)}`} />
            <Row k="Gross margin" v={`${f.grossMargin.toFixed(1)}%`} />
            <Row k="Net margin" v={`${f.netMargin.toFixed(1)}%`} />
          </div>
        </Panel>

        <Panel title="Balance Sheet">
          <div className="mb-1 text-[9px] uppercase tracking-widest text-slate-600">Assets</div>
          <Row k="Cash & equivalents" v={fmtMoney(f.cash)} />
          <Row k="Inventory" v={fmtMoney(f.inventoryValue)} />
          <Row k="Property & equipment" v={fmtMoney(f.propertyValue)} />
          <Row k="Land holdings" v={fmtMoney(f.landValue)} />
          <Row k="Securities & stakes" v={fmtMoney(f.securities)} />
          <Row k="TOTAL ASSETS" v={fmtMoney(f.totalAssets)} tone="good" />
          <div className="mb-1 mt-2 text-[9px] uppercase tracking-widest text-slate-600">Liabilities</div>
          <Row k="Debt" v={fmtMoney(f.debt)} tone={f.debt > 0 ? 'bad' : undefined} />
          <Row k="Trade payables" v={fmtMoney(f.payables)} />
          <Row k="TOTAL LIABILITIES" v={fmtMoney(f.totalLiabilities)} tone="bad" />
          <div className="mt-2 border-t border-slate-700 pt-1">
            <Row k="SHAREHOLDERS' EQUITY" v={fmtMoney(f.equity)}
              tone={f.equity > 0 ? 'good' : 'bad'} />
            <Row k="Book value / share" v={`$${f.bookValuePerShare.toFixed(2)}`} />
          </div>
        </Panel>
      </div>

      {/* ── Share structure & ratios ── */}
      <div className="grid grid-cols-2 gap-2">
        <Panel title="Share Structure">
          <Row k="Shares outstanding" v={fmtNum(f.sharesOutstanding)} />
          <Row k="Authorized (maximum)" v={fmtNum(f.authorizedShares)} />
          <Row k="Unissued headroom" v={fmtNum(issuanceRoom)} tone={issuanceRoom > 0 ? 'good' : 'bad'} />
          <Row k="Founder / insider" v={`${fmtNum(f.founderShares)} (${((f.founderShares / f.sharesOutstanding) * 100).toFixed(0)}%)`} />
          <Row k="Treasury (bought back)" v={fmtNum(f.treasuryShares)} />
          <Row k="Public float" v={fmtNum(f.publicFloat)} />
          <div className="mt-1.5">
            <Bar label="Issued vs authorized"
              value={(f.sharesOutstanding / Math.max(1, f.authorizedShares)) * 100}
              tone={(f.sharesOutstanding / Math.max(1, f.authorizedShares)) > 0.8 ? 'amber' : 'emerald'} />
          </div>
          <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">
            Issuing new shares raises cash but dilutes every holder, including the founder stake.
            Buybacks retire stock and lift earnings per share.
          </p>
          {isPlayer && (
            <div className="mt-1.5 flex gap-1">
              <Btn className="flex-1"
                onClick={() => onAction('issueShares', Math.floor(f.sharesOutstanding * 0.05))}>
                Issue 5%
              </Btn>
              <Btn className="flex-1" variant="ghost"
                onClick={() => onAction('buyback', Math.floor(f.sharesOutstanding * 0.03))}>
                Buy back 3%
              </Btn>
            </div>
          )}
        </Panel>

        <Panel title="Key Ratios">
          <Row k="Return on equity" v={`${f.roe.toFixed(1)}%`} tone={f.roe > 0 ? 'good' : 'bad'} />
          <Row k="Return on assets" v={`${f.roa.toFixed(1)}%`} tone={f.roa > 0 ? 'good' : 'bad'} />
          <Row k="Leverage (debt/assets)" v={`${f.leverage.toFixed(1)}%`}
            tone={f.leverage > 60 ? 'bad' : 'good'} />
          <Row k="Current ratio" v={f.currentRatio > 50 ? '∞' : f.currentRatio.toFixed(2)}
            tone={f.currentRatio >= 1 ? 'good' : 'bad'} />
          <Row k="Price / book" v={f.equity > 0 ? (co.marketCap / f.equity).toFixed(2) : '—'} />
          <Row k="Interest cover" v={f.interest > 0 ? (f.ebit / f.interest).toFixed(1) + '×' : 'no debt'}
            tone={f.interest > 0 && f.ebit / f.interest < 2.5 ? 'bad' : 'good'} />
          <div className="mt-1.5 space-y-1">
            <Bar label="Leverage" value={f.leverage} tone={f.leverage > 60 ? 'rose' : 'emerald'} />
            <Bar label="Issued capital" value={(f.sharesOutstanding / Math.max(1, f.authorizedShares)) * 100}
              tone="sky" />
          </div>
        </Panel>
      </div>
    </div>
  );
}

// ════════════════ REGIONAL MARKETS: persistent arbitrage ════════════════
function RegionalView({ s }: { s: GameState }) {
  const [pid, setPid] = useState(s.products[0]?.id ?? '');
  const product = s.products.find(p => p.id === pid) ?? s.products[0];
  const spreads = topSpreads(s, 10);

  const rows = s.cities.map(c => {
    const q = s.regional[c.id]?.[product.id];
    const price = Math.max(product.productionCost * 0.15, product.currentPrice * (q?.priceMul ?? 1));
    return {
      city: c, q, price,
      mul: q?.priceMul ?? 1,
      stock: q?.stock ?? 0,
      pressure: q?.pressure ?? 0,
    };
  }).sort((a, b) => a.mul - b.mul);

  const national = product.currentPrice;
  const cheapest = rows[0];
  const dearest = rows[rows.length - 1];

  return (
    <div className="space-y-2">
      <Panel title="How regional pricing works">
        <p className="text-[11px] leading-relaxed text-slate-400">
          Every city holds its own buffer for every product. Goods only move between cities when the
          price spread exceeds the cost of freight — a narrower spread than that is not worth shipping,
          so the differential <em className="text-emerald-400">persists</em>. Cheap diesel and good
          infrastructure narrow the no-arbitrage band and pull cities together; expensive fuel or poor
          roads widen it and let gaps survive for months. Holding stock also costs money, which stops
          everyone simply over-buying into every surplus.
        </p>
      </Panel>

      <Panel title="Live opportunities — widest spreads">
        <div className="grid grid-cols-2 gap-1.5">
          {spreads.map(sp => (
            <button key={sp.productId} onClick={() => setPid(sp.productId)}
              className={cx('rounded border px-2 py-1.5 text-left',
                sp.productId === pid ? 'border-emerald-500 bg-emerald-500/10'
                  : 'border-slate-800 bg-slate-900/50 hover:border-slate-600')}>
              <div className="flex justify-between">
                <span className="truncate text-[11px] text-slate-200">{sp.productName}</span>
                <span className={cx('font-mono text-[10px]', sp.tradable ? 'text-emerald-400' : 'text-amber-400')}>
                  +{((sp.richMul - sp.cheapMul) * 100).toFixed(0)}%
                </span>
              </div>
              <div className="text-[9px] text-slate-500">
                Buy {sp.cheapCity} → sell {sp.richCity}
              </div>
              <div className="text-[9px] text-slate-600">
                {sp.tradable
                  ? `spread beats the ${(sp.band * 100).toFixed(0)}% freight band — worth moving`
                  : `spread below the ${(sp.band * 100).toFixed(0)}% freight band — not worth shipping`}
              </div>
            </button>
          ))}
          {spreads.length === 0 && (
            <p className="col-span-2 text-[11px] text-slate-500">
              No regional differentials yet — markets have not traded enough to separate.
            </p>
          )}
        </div>
      </Panel>

      <div className="grid grid-cols-3 gap-2">
        <Panel title="Product">
          <select value={pid} onChange={e => setPid(e.target.value)}
            className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-200">
            {s.products.map(p => <option key={p.id} value={p.id}>{p.icon} {p.name}</option>)}
          </select>
          <div className="mt-2">
            <Row k="National price" v={fmtMoney(national)} />
            <Row k="Cheapest city" v={`${cheapest.city.name} @ ${fmtMoney(cheapest.price)}`} tone="good" />
            <Row k="Dearest city" v={`${dearest.city.name} @ ${fmtMoney(dearest.price)}`} tone="bad" />
            <Row k="Working spread"
              v={`${(((dearest.mul - cheapest.mul) / cheapest.mul) * 100).toFixed(1)}%`} />
            <Row k="Freight band"
              v={`${(arbitrageBand(s, cheapest.city.id, dearest.city.id) * 100).toFixed(0)}%`} />
          </div>
          <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">
            Profit the gap by producing or buying in the cheap city and selling into the dear one —
            but your own volume moves the local price against you.
          </p>
        </Panel>

        <div className="col-span-2">
          <Panel title={`${product.name} by city`}>
            <table className="w-full text-[10px]">
              <thead>
                <tr className="text-left text-slate-600">
                  <th className="pb-1 font-medium">City</th>
                  <th className="pb-1 font-medium">Local price</th>
                  <th className="pb-1 font-medium">vs national</th>
                  <th className="pb-1 font-medium">Buffered stock</th>
                  <th className="pb-1 font-medium">Pressure</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.city.id} className="border-t border-slate-800/60">
                    <td className="py-1 text-slate-300">{r.city.name}</td>
                    <td className="py-1 font-mono text-slate-200">{fmtMoney(r.price)}</td>
                    <td className={cx('py-1 font-mono',
                      r.mul < 0.97 ? 'text-emerald-400' : r.mul > 1.03 ? 'text-rose-400' : 'text-slate-500')}>
                      {r.mul < 1 ? '−' : '+'}{Math.abs((r.mul - 1) * 100).toFixed(1)}%
                    </td>
                    <td className="py-1 font-mono text-slate-400">{fmtNum(Math.round(r.stock))}</td>
                    <td className="py-1">
                      <span className={cx('text-[9px]',
                        r.pressure > 0.05 ? 'text-rose-400' : r.pressure < -0.05 ? 'text-emerald-400' : 'text-slate-600')}>
                        {r.pressure > 0.05 ? 'glut' : r.pressure < -0.05 ? 'shortage' : 'balanced'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>
      </div>
    </div>
  );
}

// ════════════════ POLICY: competition modes, QE, ETS, cycles ════════════════
function PolicyView({ s, onAction }: { s: GameState; onAction: Props['onAction'] }) {
  const eco = s.economy;
  const categories = [...new Set(s.products.map(p => p.category))];
  const structural = structuralUnemployment(s);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <Panel title="Monetary Policy & Aggregates">
          <Row k="Policy rate" v={`${eco.interestRate.toFixed(2)}%`}
            tone={eco.interestRate <= 0.75 ? 'bad' : undefined} />
          <Row k="QE programme" v={eco.qeActive ? 'ACTIVE' : 'inactive'}
            tone={eco.qeActive ? 'good' : 'muted'} />
          {eco.qeActive && <>
            <Row k="Monthly pace" v={`${(eco.qeMonthlyPace * 100).toFixed(2)}% of GDP`} />
            <Row k="Purchases to date" v={fmtMoney(eco.qePurchasesToDate)} />
          </>}
          <Row k="Central bank assets" v={fmtMoney(eco.centralBankAssets)} />
          <Row k="Base money" v={eco.baseMoney.toFixed(0)} />
          <Row k="M1 (narrow)" v={eco.m1.toFixed(0)} />
          <Row k={
            <Tip label="M2 (broad money)"
              why="Base money times the money multiplier. Rises with QE and with bank lending. High M2 growth with flat output is future inflation.">
              M2 (broad)
            </Tip>
          } v={eco.m2.toFixed(0)} />
          <Row k="3m / 2y / 10y"
            v={`${eco.threeMonthYield.toFixed(1)} / ${eco.twoYearYield.toFixed(1)} / ${eco.tenYearYield.toFixed(1)}`}
            tone={eco.twoYearYield > eco.tenYearYield ? 'bad' : undefined} />
          <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">
            {eco.qeActive
              ? 'The bank is buying bonds because the policy rate has hit its floor. This compresses term premia and lifts asset prices.'
              : eco.interestRate <= 0.75
                ? 'The policy rate is at the effective lower bound. Further deterioration would force asset purchases.'
                : 'Conventional rate policy is doing the work. QE only becomes necessary once rates cannot fall further.'}
          </p>
        </Panel>

        <Panel title="Business Cycles & Supply">
          <Row k={
            <Tip label="Total factor productivity"
              why="Output per combined unit of capital and labour. A positive TFP shock raises growth AND eases inflation at once — something a demand boom cannot do.">
              TFP level
            </Tip>
          } v={eco.tfpLevel.toFixed(1)} tone={eco.tfpLevel > 100 ? 'good' : 'bad'} />
          <Row k="TFP growth" v={`${eco.tfpGrowth.toFixed(2)}%/yr`} tone={eco.tfpGrowth > 0 ? 'good' : 'bad'} />
          <Row k={
            <Tip label="Kitchin inventory cycle"
              why="Firms over-order in good times, get caught with stock when demand turns, then destock hard. Phase +1 = restocking (adds to output), −1 = destocking (deepens the downturn).">
              Inventory cycle
            </Tip>
          } v={eco.inventoryCycle.toFixed(2)}
            tone={eco.inventoryCycle > 0.1 ? 'good' : eco.inventoryCycle < -0.1 ? 'bad' : undefined} />
          <Row k="GDP growth" v={`${eco.gdpGrowth.toFixed(2)}%`} tone={eco.gdpGrowth > 0 ? 'good' : 'bad'} />
          <Row k="Terms of trade" v={eco.termsOfTrade.toFixed(1)}
            tone={eco.termsOfTrade > 100 ? 'good' : 'bad'} />
          <Row k={
            <Tip label="Commodity supercycle"
              why="A decade-long swing in extractive prices. High prices induce investment, investment creates gluts, gluts crush prices until capacity is retired.">
              Supercycle phase
            </Tip>
          } v={eco.commoditySuperCycle.toFixed(2)}
            tone={eco.commoditySuperCycle > 0 ? 'good' : 'bad'} />
          <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">
            Supply shocks and demand shocks look different: TFP raises output while easing prices,
            whereas a demand boom raises both.
          </p>
        </Panel>

        <Panel title="Emissions Trading Scheme">
          <Row k="Allowance price" v={`$${eco.etsAllowancePrice.toFixed(0)}/t`} />
          <Row k="Annual cap" v={fmtNum(Math.round(eco.etsCap)) + ' t'} />
          <Row k="Emissions this period" v={fmtNum(Math.round(s.ets.surrendered))} />
          <Row k="Cap utilisation"
            v={`${((s.ets.surrendered / Math.max(1, s.ets.cap)) * 100).toFixed(0)}%`}
            tone={s.ets.surrendered > s.ets.cap ? 'bad' : 'good'} />
          <Row k="Auction revenue" v={fmtMoney(s.ets.revenue)} />
          <div className="mt-1.5">
            <Bar label="Cap utilisation"
              value={Math.min(100, (s.ets.surrendered / Math.max(1, s.ets.cap)) * 100)}
              tone={s.ets.surrendered > s.ets.cap ? 'rose' : 'emerald'} />
          </div>
          <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">
            Unlike a carbon tax (which fixes price and lets emissions float), the ETS fixes quantity and
            lets the price move — the environmental outcome is guaranteed, the cost is not. The cap
            ratchets down every year and revenue funds infrastructure.
          </p>
        </Panel>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Panel title="Competition Doctrine by Industry">
          <p className="mb-2 text-[11px] leading-relaxed text-slate-400">
            Industries compete on price or on volume, and it changes how rivals respond. Under Bertrand
            firms undercut and margins collapse; under Cournot they set output, so discipline holds
            price and concentrated industries earn more.
          </p>
          <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
            {categories.map(cat => {
              const mode = competitionMode(s, cat);
              const hhi = industryHHI(s, cat);
              const threat = entryThreat(s, cat);
              return (
                <div key={cat} className="rounded border border-slate-800 bg-slate-900/50 px-2 py-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-200">{cat}</span>
                    <div className="flex gap-1">
                      <Btn variant={mode === 'cournot' ? 'primary' : 'default'}
                        onClick={() => onAction('compMode', cat, 'cournot')}>Volume</Btn>
                      <Btn variant={mode === 'bertrand' ? 'primary' : 'default'}
                        onClick={() => onAction('compMode', cat, 'bertrand')}>Price</Btn>
                    </div>
                  </div>
                  <div className="mt-0.5 grid grid-cols-3 gap-x-2 text-[9px] text-slate-500">
                    <span>HHI <b className="text-slate-300">{hhi.toFixed(0)}</b></span>
                    <span>{hhi > 2500 ? 'concentrated' : hhi > 1500 ? 'moderate' : 'fragmented'}</span>
                    <span>
                      <Tip label="Entry threat"
                        why="A contestable market disciplines incumbents even at high concentration — if entry is cheap, a monopolist still prices defensively.">
                        entry {(threat * 100).toFixed(0)}%
                      </Tip>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel title="Labour & Externalities">
          <div className="grid grid-cols-2 gap-x-3">
            <Row k="Structural unemployment" v={`${structural.toFixed(1)}%`}
              tone={structural > 3 ? 'bad' : 'good'} />
            <Row k="Avg skill gap" v={
              `${((s.cities.reduce((a, c) => a + c.skillGap, 0) / Math.max(1, s.cities.length)) * 100).toFixed(0)}%`} />
            <Row k="Exec salary premium" v={
              `${((s.companies.reduce((a, c) => a + c.execSalaryPremium, 0) / Math.max(1, s.companies.length)) * 100).toFixed(0)}%`} />
            <Row k="Avg PM2.5" v={
              `${(s.cities.reduce((a, c) => a + c.pm25, 0) / Math.max(1, s.cities.length)).toFixed(0)} µg`} />
          </div>
          <div className="mt-2 space-y-1">
            {s.cities.slice(0, 6).map(c => (
              <div key={c.id}>
                <div className="flex justify-between text-[10px]">
                  <span className="text-slate-300">{c.name}</span>
                  <span className="font-mono text-slate-500">
                    {fmtMoney(c.wageRate * 2080)}/yr · UE {c.unemploymentRate.toFixed(1)}%
                  </span>
                </div>
                <Bar label=""
                  value={c.infrastructure}
                  tone={c.infrastructure > 65 ? 'emerald' : c.infrastructure > 40 ? 'amber' : 'rose'} />
                <div className="text-[9px] text-slate-600">
                  infrastructure {c.infrastructure.toFixed(0)} · PM2.5 {c.pm25.toFixed(0)}
                  · skill gap {(c.skillGap * 100).toFixed(0)}%
                </div>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">
            Workers do not teleport to the highest wage — moving costs money and housing is scarce, so
            city wage gaps persist. Skill mismatch is structural: it never clears, however hot the cycle
            runs. Only education and infrastructure close it.
          </p>
        </Panel>
      </div>
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
  const [counters, setCounters] = useState<Record<string, number>>({});
  if (s.offers.length === 0) return <p className="text-[12px] text-slate-500">No inbound offers at the moment.</p>;
  return (
    <div className="grid grid-cols-2 gap-3">
      {s.offers.map(o => {
        const premium = ((o.amount / Math.max(1, o.fairValue)) - 1) * 100;
        const counterVal = counters[o.id] ?? Math.round(o.fairValue * 1.1);
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
            <div className="mt-2 border-t border-slate-700/60 pt-2">
              <div className="mb-1 text-[9px] uppercase tracking-widest text-slate-600">Or send a counter</div>
              <div className="flex gap-1">
                <input type="number" value={counterVal}
                  onChange={e => setCounters(c => ({ ...c, [o.id]: Number(e.target.value) }))}
                  className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-200" />
                <Btn onClick={() => onAction('counterOffer', o.id, counterVal)}>Send</Btn>
              </div>
              <p className="mt-1 text-[9px] leading-relaxed text-slate-600">
                {o.buyerName} may accept it outright, meet you partway with a revised offer, or walk away if it's
                too far from what the asset is worth to them.
              </p>
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
