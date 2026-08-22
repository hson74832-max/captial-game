import { useCallback, useEffect, useRef, useState } from 'react';
import IsoCanvas from './components/IsoCanvas';
import Inspector from './components/Inspector';
import Modals from './components/Modals';
import { LeftPanel, Notifications, TickerBar, TopBar } from './components/Hud';
import { Btn } from './components/ui';
import type { BuildingType, GameState, Overlay } from './game/types';
import {
  buyListedBuilding, createGame, manualRestock, placeBuilding, repairBuilding, repayLoan,
  respondToOffer, counterOffer, setBuildingField, setProductLine, startResearch, takeLoan,
  tick as engineTick, tradeShares, upgradeBuilding,
} from './game/engine';
import { BUILDING_CONFIGS } from './game/constants';
import * as sys from './game/systems';
import * as mk from './game/markets';
import * as bd from './game/bonds';
import * as comp from './game/competition';
import * as lab from './game/labor';

const COLORS = ['#22d3a7', '#38bdf8', '#f472b6', '#fbbf24', '#a78bfa', '#f87171'];

export default function App() {
  const [started, setStarted] = useState(false);
  const [name, setName] = useState('Northwind Group');
  const [color, setColor] = useState(COLORS[0]);
  const gameRef = useRef<GameState | null>(null);
  const [, force] = useState(0);
  const [modal, setModal] = useState<string | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; text: string; ok: boolean } | null>(null);
  const focusRef = useRef<{ x: number; y: number } | null>(null);

  const getState = useCallback(() => gameRef.current!, []);

  // ---------------- game loop ----------------
  useEffect(() => {
    if (!started) return;
    if (!gameRef.current) gameRef.current = createGame(Date.now() % 100000, name, color);
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let uiAcc = 0;

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const s = gameRef.current!;
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      if (!s.paused) {
        const tps = s.speed * 2.2;
        acc += dt * tps;
        let budget = 0;
        while (acc >= 1 && budget < 40) { engineTick(s); acc -= 1; budget++; }
        if (acc > 8) acc = 0;
      } else {
        acc = 0;
      }
      uiAcc += dt;
      if (uiAcc > 0.22) { uiAcc = 0; force(v => v + 1); }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [started, name, color]);

  // ---------------- keyboard ----------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = gameRef.current;
      if (!s) return;
      if (e.key === ' ') { e.preventDefault(); s.paused = !s.paused; force(v => v + 1); }
      if (e.key === 'Escape') { s.buildMode = null; s.landMode = false; setModal(null); force(v => v + 1); }
      if (e.key >= '1' && e.key <= '4') {
        s.paused = false;
        s.speed = [1, 3, 8, 24][Number(e.key) - 1];
        force(v => v + 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const action = useCallback((fn: string, ...args: unknown[]) => {
    const s = gameRef.current;
    if (!s) return;
    switch (fn) {
      case 'select': s.selectedBuildingId = args[0] as string | null; break;
      case 'field': setBuildingField(s, args[0] as string, args[1] as never, args[2] as never); break;
      case 'line': setProductLine(s, args[0] as string, args[1] as string); break;
      case 'upgrade': upgradeBuilding(s, args[0] as string); break;
      case 'repair': repairBuilding(s, args[0] as string); break;
      case 'counterOffer': counterOffer(s, args[0] as string, args[1] as number); break;
      case 'buy': buyListedBuilding(s, args[0] as string); break;
      case 'restock': manualRestock(s, args[0] as string); break;
      case 'loan': takeLoan(s, args[0] as number, args[1] as number); break;
      case 'repay': repayLoan(s, args[0] as string); break;
      case 'trade': tradeShares(s, args[0] as string, args[1] as number); break;
      case 'offer': respondToOffer(s, args[0] as string, args[1] as boolean); break;
      case 'research': startResearch(s, args[0] as string); break;
      case 'sellLand': sys.sellLand(s, args[0] as string); break;
      case 'list': {
        // Listing is the patient channel: ask 98% of fair value and wait for
        // a matching buyer. The instant sale pays 88%, so the 10-point spread
        // is what you earn for accepting the risk that nobody bites.
        const b = s.buildings.find(x => x.id === args[0]);
        if (b) { b.forSale = true; b.askingPrice = Math.max(25_000, Math.round(b.fairValue * 0.98)); }
        break;
      }
      case 'signContract': sys.signContract(s, args[0] as string, args[1] as string, args[2] as string); break;
      case 'cancelContract': sys.cancelContract(s, args[0] as string, args[1] as string); break;
      case 'autoSource': sys.autoSource(s, args[0] as string); break;
      case 'buyAsset': mk.buyAsset(s, args[0] as string, args[1] as number); break;
      case 'sellAsset': mk.sellAsset(s, args[0] as string, args[1] as number); break;
      case 'buyBond': bd.buyBond(s, args[0] as string); break;
      case 'sellBond': bd.sellBond(s, args[0] as string); break;
      case 'issueBond': bd.issueBond(s, args[0] as number, args[1] as 5 | 10 | 15); break;
      case 'breed': sys.setBreed(s, args[0] as string, args[1] as string); break;
      case 'tier': sys.setTier(s, args[0] as string, args[1] as 'standard' | 'premium' | 'organic'); break;
      case 'investFarm': sys.investFarm(s, args[0] as string, args[1] as 'technique' | 'equipment'); break;
      case 'acquire': sys.acquireBuilding(s, args[0] as string, args[1] as number); break;
      case 'lease': sys.leaseBuilding(s, args[0] as string); break;
      case 'negotiate': sys.makeOffer(s, args[0] as string, args[1] as number); break;
      case 'clearNegotiation': s.negotiation = null; break;
      case 'buyShares': sys.buyShares(s, args[0] as string, args[1] as number); break;
      case 'sellShares': sys.sellShares(s, args[0] as string, args[1] as number); break;
      case 'issueShares': sys.issueShares(s, args[0] as number); break;
      case 'espionage': sys.runEspionage(s, args[0] as string); break;
      case 'marketResearch': sys.buyMarketResearch(s, args[0] as string); break;
      case 'compMode': comp.setCompetitionMode(s, args[0] as string, args[1] as 'cournot' | 'bertrand'); break;
      case 'automate': lab.automateBuilding(s, args[0] as string); break;
      case 'buyback': {
        const p = s.companies.find(c => c.id === s.playerCompanyId);
        const n = Math.min(args[0] as number, Math.max(0, (p?.sharesOutstanding ?? 0) - (p?.founderShares ?? 0)));
        if (p && n > 0) {
          const cost = n * p.sharePrice;
          if (p.cash >= cost) {
            p.cash -= cost;
            p.treasuryShares += n;
            p.sharesOutstanding = Math.max(1, p.sharesOutstanding - n);
            p.sharePrice *= 1 + (n / Math.max(1, p.sharesOutstanding)) * 0.4;
            p.marketCap = p.sharePrice * p.sharesOutstanding;
            if (p.buybackYear !== s.year) { p.buybackYear = s.year; p.sharesBoughtBackThisYear = 0; }
            p.sharesBoughtBackThisYear += n;
          }
        }
        break;
      }
    }
    force(v => v + 1);
  }, []);

  const handlePlace = useCallback((x: number, y: number) => {
    const s = gameRef.current;
    if (!s) return;
    if (s.landMode) sys.buyLand(s, x, y);
    else if (s.buildMode) placeBuilding(s, s.buildMode, x, y);
    force(v => v + 1);
  }, []);

  const handleSelect = useCallback((id: string | null) => {
    const s = gameRef.current;
    if (!s) return;
    s.selectedBuildingId = id;
    if (id) {
      const b = s.buildings.find(x => x.id === id);
      if (b) s.selectedCityId = b.cityId;
    }
    force(v => v + 1);
  }, []);

  const focus = useCallback((x: number, y: number) => { focusRef.current = { x, y }; }, []);

  if (!started) {
    return (
      <StartScreen
        name={name} setName={setName} color={color} setColor={setColor}
        onStart={() => {
          if (!gameRef.current) gameRef.current = createGame(Date.now() % 100000, name || 'Northwind Group', color);
          setStarted(true);
        }}
      />
    );
  }

  const s = gameRef.current;
  if (!s) return null;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-950 font-sans text-slate-200">
      <TopBar
        s={s}
        onSpeed={v => { const g = gameRef.current!; if (v === 0) g.paused = true; else { g.paused = false; g.speed = v; } force(x => x + 1); }}
        onOpen={m => setModal(m)}
      />

      <div className="relative flex min-h-0 flex-1">
        <LeftPanel
          s={s}
          onBuildMode={(t: BuildingType | null) => { s.buildMode = t; s.landMode = false; force(v => v + 1); }}
          onOverlay={(o: Overlay) => { s.overlay = o; force(v => v + 1); }}
          onSelect={handleSelect}
          onFocus={focus}
          onLandMode={v => { s.landMode = v; if (v) s.buildMode = null; force(x => x + 1); }}
          onAction={action}
        />

        <div className="relative min-w-0 flex-1">
          <IsoCanvas
            getState={getState}
            onSelectBuilding={handleSelect}
            onPlace={handlePlace}
            onHoverInfo={setHover}
            focusRef={focusRef}
          />

          {s.buildMode && (
            <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-lg border border-emerald-500/50 bg-slate-950/90 px-4 py-2 text-center shadow-xl">
              <div className="text-[12px] font-semibold text-emerald-300">
                {BUILDING_CONFIGS[s.buildMode].icon} Placing {BUILDING_CONFIGS[s.buildMode].name}
              </div>
              <div className="text-[10px] text-slate-400">{BUILDING_CONFIGS[s.buildMode].blurb}</div>
              {hover && (
                <div className={`mt-0.5 text-[10px] ${hover.ok ? 'text-emerald-400' : 'text-rose-400'}`}>
                  ({hover.x}, {hover.y}) — {hover.text}
                </div>
              )}
              <div className="text-[9px] uppercase tracking-widest text-slate-600">Esc to cancel</div>
            </div>
          )}

          {!s.buildMode && hover && (
            <div className="pointer-events-none absolute bottom-3 left-3 z-10 rounded border border-slate-700/60 bg-slate-950/85 px-2 py-1 font-mono text-[10px] text-slate-400">
              ({hover.x}, {hover.y}) {hover.text}
            </div>
          )}

          {s.landMode && (
            <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-lg border border-amber-500/50 bg-slate-950/90 px-4 py-2 text-center shadow-xl">
              <div className="text-[12px] font-semibold text-amber-300">🗝️ Land acquisition mode</div>
              <div className="text-[10px] text-slate-400">Click any untitled parcel to buy the development rights</div>
              {hover && (
                <div className={`mt-0.5 text-[10px] ${hover.ok ? 'text-emerald-400' : 'text-rose-400'}`}>
                  ({hover.x}, {hover.y}) — {hover.text}
                </div>
              )}
              <div className="text-[9px] uppercase tracking-widest text-slate-600">Esc to cancel</div>
            </div>
          )}

          <div className="pointer-events-none absolute right-3 top-3 z-10 rounded border border-slate-700/60 bg-slate-950/80 px-2 py-1 text-[10px] text-slate-400">
            <span className="mr-2">🚚 {s.pipeline.length + s.freight.length} shipments</span>
            <span className="mr-2">🗝️ {s.landHoldings.filter(h => h.ownerId === s.playerCompanyId).length} titles</span>
            <span>🏙️ {s.buildings.length} structures</span>
          </div>

          <Notifications s={s} onDismiss={id => { s.notifications = s.notifications.filter(n => n.id !== id); force(v => v + 1); }} />
        </div>

        <Inspector
          s={s}
          onAction={action}
          onFocus={focus}
          onSelectCity={id => { s.selectedCityId = id; s.selectedBuildingId = null; force(v => v + 1); }}
        />

        <Modals s={s} modal={modal} close={() => setModal(null)} onAction={action} />
      </div>

      <TickerBar s={s} />
    </div>
  );
}

function StartScreen({ name, setName, color, setColor, onStart }: {
  name: string; setName: (v: string) => void; color: string; setColor: (v: string) => void; onStart: () => void;
}) {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-700/70 bg-slate-950/80 p-8 shadow-2xl">
        <div className="mb-1 text-[10px] uppercase tracking-[0.4em] text-emerald-400">Isometric Business Simulation</div>
        <h1 className="text-3xl font-black tracking-tight text-slate-50">MERIDIAN<span className="text-emerald-400">.</span>SIM</h1>
        <p className="mt-3 max-w-xl text-[13px] leading-relaxed text-slate-400">
          A living world of seven cities with births, migration, wages, traffic and pollution — wrapped around a
          deep economy of supply chains, business cycles, a central bank following a Taylor rule, and twelve rival
          boards with their own money, personalities and ambitions. Build, price, staff, borrow and acquire.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-6">
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-widest text-slate-500">Company name</label>
            <input value={name} onChange={e => setName(e.target.value)}
              className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500" />
            <label className="mb-1 mt-4 block text-[10px] uppercase tracking-widest text-slate-500">Livery</label>
            <div className="flex gap-2">
              {COLORS.map(c => (
                <button key={c} onClick={() => setColor(c)}
                  className={`h-8 w-8 rounded-full border-2 transition-transform ${color === c ? 'scale-110 border-white' : 'border-transparent'}`}
                  style={{ background: c }} />
              ))}
            </div>
          </div>
          <div className="space-y-1.5 text-[11px] text-slate-400">
            <div className="text-[10px] uppercase tracking-widest text-slate-500">Starting position</div>
            <div className="flex justify-between border-b border-slate-800 py-1"><span>Capital</span><span className="font-mono text-emerald-400">$40,000,000</span></div>
            <div className="flex justify-between border-b border-slate-800 py-1"><span>Year</span><span className="font-mono">2000</span></div>
            <div className="flex justify-between border-b border-slate-800 py-1"><span>Rival boards</span><span className="font-mono">12</span></div>
            <div className="flex justify-between border-b border-slate-800 py-1"><span>Cities</span><span className="font-mono">7</span></div>
            <div className="flex justify-between py-1"><span>Tradable goods</span><span className="font-mono">26</span></div>
          </div>
        </div>

        <Btn variant="primary" className="mt-7 w-full !py-3 !text-sm" onClick={onStart}>Found the company →</Btn>
        <p className="mt-3 text-center text-[10px] text-slate-600">Drag to pan · scroll to zoom · space to pause · 1–4 to change speed</p>
      </div>
    </div>
  );
}
