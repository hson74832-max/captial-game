import type { GameState, BuildingType, Overlay } from '../game/types';
import { BUILDABLE, BUILDING_CONFIGS } from '../game/constants';
import { fmtMoney, fmtShort } from '../game/engine';
import { Btn, Panel, Spark, cx } from './ui';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function TopBar({ s, onSpeed, onOpen }: {
  s: GameState; onSpeed: (v: number) => void; onOpen: (m: string) => void;
}) {
  const p = s.companies.find(c => c.id === s.playerCompanyId)!;
  const monthlyProfit = p.monthlyProfit || p.profit * 24 * 30;
  const netWorth = p.totalAssets - p.debt;
  const eco = s.economy;
  const cycleTone = eco.cycle === 'recession' ? 'text-rose-400' : eco.cycle === 'boom' ? 'text-emerald-400' : 'text-sky-300';

  return (
    <div className="flex items-center gap-3 border-b border-slate-700/70 bg-slate-950/90 px-3 py-1.5 backdrop-blur">
      <div className="flex items-center gap-2">
        <div className="h-6 w-6 rounded" style={{ background: p.color }} />
        <div className="leading-tight">
          <div className="text-xs font-bold text-slate-100">{p.name}</div>
          <div className="text-[9px] uppercase tracking-widest text-slate-500">Isometric Business Sim</div>
        </div>
      </div>

      <div className="ml-2 rounded border border-slate-700/60 bg-slate-900 px-2 py-1 text-center">
        <div className="font-mono text-xs text-slate-200">{MONTHS[s.month - 1]} {s.day}, {s.year}</div>
        <div className="font-mono text-[9px] text-slate-500">{String(s.hour).padStart(2, '0')}:00 · {s.season}</div>
      </div>

      <div className="flex items-center gap-0.5 rounded border border-slate-700/60 bg-slate-900 p-0.5">
        {[
          { l: '❚❚', v: 0 }, { l: '▶', v: 1 }, { l: '▶▶', v: 3 }, { l: '▶▶▶', v: 8 }, { l: '⏩', v: 24 },
        ].map(o => (
          <button key={o.v} onClick={() => onSpeed(o.v)}
            className={cx('rounded px-2 py-1 text-[10px] font-mono',
              (o.v === 0 ? s.paused : !s.paused && s.speed === o.v)
                ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:bg-slate-800')}>
            {o.l}
          </button>
        ))}
      </div>

      <div className="flex flex-1 items-center gap-4 overflow-x-auto px-2">
        <Metric label="Cash" value={fmtMoney(p.cash)} tone={p.cash < 0 ? 'bad' : 'good'} />
        <Metric label="Net Worth" value={fmtMoney(netWorth)} />
        <Metric label="Profit / mo" value={fmtMoney(monthlyProfit)} tone={monthlyProfit >= 0 ? 'good' : 'bad'} />
        <Metric label="Debt" value={fmtMoney(p.debt)} tone={p.debt > 0 ? 'warn' : undefined} />
        <Metric label="Assets" value={String(s.buildings.filter(b => b.companyId === p.id).length)} />
        <div className="h-7 w-px bg-slate-700/70" />
        <Metric label="Cycle" value={eco.cycle} className={cycleTone} />
        <Metric label="GDP" value={`${eco.gdpGrowth.toFixed(1)}%`} tone={eco.gdpGrowth > 0 ? 'good' : 'bad'} />
        <Metric label="CPI" value={`${eco.inflation.toFixed(1)}%`} tone={eco.inflation > 5 ? 'bad' : undefined} />
        <Metric label="Rate" value={`${eco.interestRate.toFixed(2)}%`} />
        <Metric label="Unemp" value={`${eco.unemployment.toFixed(1)}%`} />
        <Metric label="Index" value={fmtShort(s.stockMarket.index)} tone={s.stockMarket.sentiment === 'bullish' ? 'good' : s.stockMarket.sentiment === 'bearish' ? 'bad' : undefined} />
      </div>

      <div className="flex items-center gap-1">
        {s.offers.length > 0 && (
          <Btn variant="warn" onClick={() => onOpen('offers')}>Offers · {s.offers.length}</Btn>
        )}
        <Btn onClick={() => onOpen('economy')}>Economy</Btn>
        <Btn onClick={() => onOpen('companies')}>Companies</Btn>
        <Btn onClick={() => onOpen('market')}>Markets</Btn>
        <Btn onClick={() => onOpen('regional')}>Regional</Btn>
        <Btn onClick={() => onOpen('policy')}>Policy</Btn>
        <Btn onClick={() => onOpen('treasury')}>Treasury</Btn>
        <Btn onClick={() => onOpen('finance')}>Finance</Btn>
        <Btn onClick={() => onOpen('rivals')}>Rivals</Btn>
        <Btn onClick={() => onOpen('rd')}>R&amp;D</Btn>
        <Btn onClick={() => onOpen('help')} variant="ghost">?</Btn>
      </div>
    </div>
  );
}

function Metric({ label, value, tone, className }: { label: string; value: string; tone?: 'good' | 'bad' | 'warn'; className?: string }) {
  const c = tone === 'good' ? 'text-emerald-400' : tone === 'bad' ? 'text-rose-400' : tone === 'warn' ? 'text-amber-400' : 'text-slate-100';
  return (
    <div className="shrink-0">
      <div className="text-[8px] uppercase tracking-widest text-slate-500">{label}</div>
      <div className={cx('font-mono text-xs font-semibold tabular-nums capitalize', c, className)}>{value}</div>
    </div>
  );
}

const OVERLAYS: Array<{ id: Overlay; label: string; icon: string }> = [
  { id: 'none', label: 'Default', icon: '🗺️' },
  { id: 'land', label: 'Land Value', icon: '💰' },
  { id: 'zone', label: 'Zoning', icon: '🏗️' },
  { id: 'traffic', label: 'Traffic', icon: '🚦' },
  { id: 'pollution', label: 'Pollution', icon: '🏭' },
  { id: 'owners', label: 'Ownership', icon: '🏴' },
];

export function LeftPanel({ s, onBuildMode, onOverlay, onSelect, onFocus, onLandMode, onAction }: {
  s: GameState;
  onBuildMode: (t: BuildingType | null) => void;
  onOverlay: (o: Overlay) => void;
  onSelect: (id: string) => void;
  onFocus: (x: number, y: number) => void;
  onLandMode: (v: boolean) => void;
  onAction: (fn: string, ...args: unknown[]) => void;
}) {
  const p = s.companies.find(c => c.id === s.playerCompanyId)!;
  const mine = s.buildings.filter(b => b.companyId === p.id);
  const groups: Array<[string, BuildingType[]]> = [
    ['Production', BUILDABLE.filter(t => BUILDING_CONFIGS[t].group === 'production')],
    ['Commerce', BUILDABLE.filter(t => BUILDING_CONFIGS[t].group === 'commerce')],
    ['Property', BUILDABLE.filter(t => BUILDING_CONFIGS[t].group === 'property')],
    ['Corporate', BUILDABLE.filter(t => BUILDING_CONFIGS[t].group === 'corporate')],
  ];

  return (
    <div className="flex h-full w-60 shrink-0 flex-col gap-2 overflow-y-auto border-r border-slate-700/70 bg-slate-950/80 p-2">
      <Panel title="Build" right={s.buildMode ? <Btn variant="ghost" onClick={() => onBuildMode(null)}>cancel</Btn> : null}>
        <div className="space-y-2">
          {groups.map(([g, types]) => (
            <div key={g}>
              <div className="mb-1 text-[9px] uppercase tracking-widest text-slate-600">{g}</div>
              <div className="grid grid-cols-2 gap-1">
                {types.map(t => {
                  const cfg = BUILDING_CONFIGS[t];
                  const affordable = p.cash >= cfg.cost;
                  return (
                    <button
                      key={t}
                      title={`${cfg.name} — ${cfg.blurb} (~3d build)`}
                      onClick={() => onBuildMode(s.buildMode === t ? null : t)}
                      className={cx('rounded border px-1.5 py-1 text-left transition-colors',
                        s.buildMode === t ? 'border-emerald-400 bg-emerald-500/15'
                          : affordable ? 'border-slate-700/70 bg-slate-900 hover:border-slate-500'
                            : 'border-slate-800 bg-slate-900/40 opacity-50')}
                    >
                      <div className="flex items-center gap-1 text-[10px] text-slate-200">
                        <span>{cfg.icon}</span><span className="truncate">{cfg.name}</span>
                      </div>
                      <div className="font-mono text-[9px] text-slate-500">${fmtShort(cfg.cost)}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Land Bank" right={s.landMode ? <Btn variant="ghost" onClick={() => onLandMode(false)}>cancel</Btn> : null}>
        <Btn variant={s.landMode ? 'warn' : 'default'} className="w-full"
          onClick={() => onLandMode(!s.landMode)}>
          {s.landMode ? 'Click a parcel to buy…' : '🗝️ Buy development land'}
        </Btn>
        <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
          Titles appreciate with the city and remove land cost from future builds.
        </p>
        {(() => {
          const held = s.landHoldings.filter(h => h.ownerId === p.id);
          const vacant = held.filter(h => !h.developedBuildingId);
          const value = held.reduce((sum, h) => sum + h.currentValue, 0);
          if (!held.length) return null;
          return (
            <div className="mt-2">
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>{held.length} titles · {vacant.length} vacant</span>
                <span className="font-mono text-emerald-400">{fmtShort(value)}</span>
              </div>
              <div className="mt-1 max-h-28 space-y-0.5 overflow-y-auto pr-1">
                {vacant.map(h => (
                  <div key={h.id} className="flex items-center gap-1 rounded bg-slate-900/60 px-1.5 py-0.5">
                    <button onClick={() => onFocus(h.x, h.y)} className="flex-1 truncate text-left text-[10px] text-slate-300">
                      {h.zone} ({h.x},{h.y})
                    </button>
                    <span className="font-mono text-[9px] text-slate-500">${fmtShort(h.currentValue)}</span>
                    <button onClick={() => onAction('sellLand', h.id)}
                      className="rounded bg-slate-800 px-1 text-[9px] text-rose-300 hover:bg-rose-900/60">sell</button>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </Panel>

      <Panel title="Map Overlay">
        <div className="grid grid-cols-2 gap-1">
          {OVERLAYS.map(o => (
            <button key={o.id} onClick={() => onOverlay(o.id)}
              className={cx('rounded border px-1.5 py-1 text-left text-[10px]',
                s.overlay === o.id ? 'border-sky-400 bg-sky-500/15 text-sky-200' : 'border-slate-700/70 bg-slate-900 text-slate-400 hover:border-slate-500')}>
              {o.icon} {o.label}
            </button>
          ))}
        </div>
      </Panel>

      <Panel title={`Portfolio · ${mine.length}`}>
        {mine.length === 0 && <p className="text-[11px] leading-relaxed text-slate-500">No assets yet. Choose a building type above, then click a valid plot on the map.</p>}
        <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
          {mine.map(b => {
            const cfg = BUILDING_CONFIGS[b.type];
            const building = b.constructionEndsTick > s.tick;
            return (
              <button key={b.id} onClick={() => { onSelect(b.id); onFocus(b.x, b.y); }}
                className={cx('w-full rounded border px-1.5 py-1 text-left',
                  s.selectedBuildingId === b.id ? 'border-emerald-400 bg-emerald-500/10' : 'border-slate-800 bg-slate-900/60 hover:border-slate-600')}>
                <div className="flex items-center justify-between gap-1">
                  <span className="truncate text-[10px] text-slate-200">{cfg.icon} {cfg.name}</span>
                  <span className={cx('font-mono text-[9px]', building ? 'text-amber-400' : b.dailyProfit >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                    {building ? `${Math.ceil((b.constructionEndsTick - s.tick) / 24)}d` : `${fmtMoney(b.dailyProfit * 30)}/mo`}
                  </span>
                </div>
                <div className="truncate text-[9px] text-slate-500">
                  {s.cities.find(c => c.id === b.cityId)?.name} · util {b.utilization.toFixed(0)}%
                </div>
              </button>
            );
          })}
        </div>
      </Panel>

      <Panel title="Net Worth">
        <Spark data={s.stats.netWorthHistory} color="#34d399" height={40} />
        <div className="mt-1 font-mono text-[10px] text-slate-400">{fmtMoney(p.totalAssets - p.debt)}</div>
      </Panel>
    </div>
  );
}

export function TickerBar({ s }: { s: GameState }) {
  const items = s.stockMarket.ticker.slice(0, 12);
  return (
    <div className="flex items-center gap-2 overflow-hidden border-t border-slate-700/70 bg-slate-950/95 px-2 py-1">
      <span className="shrink-0 rounded bg-rose-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-white">Wire</span>
      <div className="flex gap-8 overflow-hidden whitespace-nowrap">
        <div className="flex animate-[marquee_48s_linear_infinite] gap-8">
          {items.concat(items).map((n, i) => (
            <span key={n.id + i} className={cx('text-[11px]',
              n.type === 'breaking' ? 'text-rose-300' : n.type === 'warning' ? 'text-amber-300' : n.type === 'success' ? 'text-emerald-300' : 'text-slate-400')}>
              ▪ {n.text}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Notifications({ s, onDismiss }: { s: GameState; onDismiss: (id: string) => void }) {
  const items = s.notifications.slice(0, 5);
  return (
    <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 flex w-[520px] -translate-x-1/2 flex-col gap-1">
      {items.map(n => (
        <div key={n.id}
          onClick={() => onDismiss(n.id)}
          className={cx('pointer-events-auto cursor-pointer rounded border px-3 py-1.5 text-[11px] shadow-lg backdrop-blur',
            n.type === 'danger' ? 'border-rose-500/50 bg-rose-950/85 text-rose-100'
              : n.type === 'warning' ? 'border-amber-500/50 bg-amber-950/85 text-amber-100'
                : n.type === 'success' ? 'border-emerald-500/50 bg-emerald-950/85 text-emerald-100'
                  : 'border-slate-600/60 bg-slate-900/90 text-slate-200')}>
          {n.message}
        </div>
      ))}
    </div>
  );
}
