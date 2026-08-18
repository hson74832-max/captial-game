import { useMemo, useState } from 'react';
import type { GameState, OverlayMode } from '../game/types';

interface ScoutingBriefProps {
  gameState: GameState;
  onOverlayChange: (overlay: OverlayMode) => void;
  onFocusCity: (cityId: string) => void;
  onComplete: () => void;
}

export default function ScoutingBrief({ gameState, onOverlayChange, onFocusCity, onComplete }: ScoutingBriefProps) {
  const [checked, setChecked] = useState([false, false, false]);
  const rankedCities = useMemo(() => [...gameState.cities].sort((a, b) => a.wageRate - b.wageRate), [gameState.cities]);
  const factoryCity = rankedCities[0];
  const retailCity = rankedCities[rankedCities.length - 1];
  const ports = gameState.buildings.filter(building => building.type === 'seaport');

  const inspect = (index: number, overlay: OverlayMode, cityId: string) => {
    onOverlayChange(overlay);
    onFocusCity(cityId);
    setChecked(current => current.map((value, itemIndex) => itemIndex === index ? true : value));
  };

  return (
    <div className="absolute inset-y-5 left-5 z-30 w-[370px] max-w-[calc(100%-2.5rem)] overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-950/94 text-white shadow-2xl backdrop-blur-xl">
      <div className="border-b border-slate-800 px-5 py-4">
        <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-emerald-400">Opening brief</div>
        <h2 className="mt-1 text-xl font-black tracking-tight">Scout before you spend</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">
          Wages, traffic, land and port inventory decide whether a supply chain starts with an advantage or a permanent cost problem.
        </p>
      </div>

      <div className="space-y-3 overflow-y-auto p-4" style={{ maxHeight: 'calc(100% - 152px)' }}>
        <ScoutStep
          index="01"
          title="Find a production base"
          text={`${factoryCity.name} has the lowest wage at $${factoryCity.wageRate.toFixed(0)}. Its outskirts reduce payroll, construction and land costs.`}
          action="Inspect wage map"
          checked={checked[0]}
          onClick={() => inspect(0, 'wage', factoryCity.id)}
        />
        <ScoutStep
          index="02"
          title="Find affluent customers"
          text={`${retailCity.name} has the highest wage at $${retailCity.wageRate.toFixed(0)}. Luxury demand is strongest in its high-traffic center.`}
          action="Inspect traffic"
          checked={checked[1]}
          onClick={() => inspect(1, 'traffic', retailCity.id)}
        />
        <ScoutStep
          index="03"
          title="Audit seaport inventory"
          text={`${ports.length} ports are active. Industrial ports carry inputs; commercial ports carry retail-ready goods. Their stock differs every seed.`}
          action="Open freight view"
          checked={checked[2]}
          onClick={() => inspect(2, 'freight', ports[0]?.cityId || factoryCity.id)}
        />

        <div className="border-t border-slate-800 pt-3">
          <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-widest text-slate-500">
            <span>City wage spread</span>
            <span>${factoryCity.wageRate.toFixed(0)} to ${retailCity.wageRate.toFixed(0)}</span>
          </div>
          <div className="space-y-1.5">
            {rankedCities.slice(0, 5).map(city => (
              <button key={city.id} onClick={() => onFocusCity(city.id)} className="flex w-full items-center gap-2 text-left text-[11px] text-slate-300 hover:text-white">
                <span className="w-20 truncate">{city.name}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                  <span className="block h-full bg-gradient-to-r from-emerald-500 to-amber-500" style={{ width: `${Math.min(100, city.wageRate)}%` }} />
                </span>
                <span className="w-9 text-right font-mono text-emerald-300">${city.wageRate.toFixed(0)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 border-t border-slate-800 bg-slate-950 px-4 py-3">
        <button
          onClick={onComplete}
          className="w-full rounded-lg bg-emerald-500 py-2 text-xs font-black uppercase tracking-widest text-slate-950 transition hover:bg-emerald-400"
        >
          Enter the market
        </button>
      </div>
    </div>
  );
}

function ScoutStep({ index, title, text, action, checked, onClick }: {
  index: string; title: string; text: string; action: string; checked: boolean; onClick: () => void;
}) {
  return (
    <section className="border-b border-slate-800 pb-3 last:border-0">
      <div className="flex gap-3">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-[10px] font-black ${checked ? 'border-emerald-400 bg-emerald-400 text-slate-950' : 'border-slate-700 text-slate-400'}`}>
          {checked ? 'OK' : index}
        </div>
        <div>
          <h3 className="text-sm font-bold">{title}</h3>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{text}</p>
          <button onClick={onClick} className="mt-2 text-[10px] font-bold uppercase tracking-widest text-emerald-400 hover:text-emerald-300">
            {action} &gt;
          </button>
        </div>
      </div>
    </section>
  );
}