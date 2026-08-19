'use client';

import type { GameState, OverlayMode } from '../game/types';
import { formatMoney } from '../utils/format';

interface TopBarProps {
  gameState: GameState;
  onSpeedChange: (speed: number) => void;
  onPauseToggle: () => void;
  onPanelToggle: (panel: string) => void;
  onOverlayChange: (overlay: OverlayMode) => void;
}

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const OVERLAYS: { id: OverlayMode; label: string; icon: string }[] = [
  { id: 'none', label: 'None', icon: '🗺️' },
  { id: 'land_value', label: 'Land', icon: '💎' },
  { id: 'wage', label: 'Wage', icon: '💵' },
  { id: 'traffic', label: 'Traffic', icon: '🚦' },
  { id: 'freight', label: 'Freight', icon: '↗' },
  { id: 'real_estate', label: 'Real estate', icon: 'RE' },
  { id: 'biome', label: 'Biome', icon: '🌲' },
];

export default function TopBar({ gameState, onSpeedChange, onPauseToggle, onPanelToggle, onOverlayChange }: TopBarProps) {
  const company = gameState.companies.find(c => c.isPlayer);

  return (
    <div className="flex items-center justify-between gap-3 overflow-x-auto bg-gradient-to-r from-gray-950 via-gray-900 to-gray-950 text-white px-3 py-1.5 border-b border-gray-800 shadow-2xl z-50 backdrop-blur">
      {/* Left - Company + stats */}
      <div className="flex shrink-0 items-center gap-3 min-w-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-blue-600 flex items-center justify-center font-black text-xs shadow-lg shadow-emerald-500/30">CG</div>
          <div className="min-w-0">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider leading-none">Capital Game</div>
            <div className="text-xs font-bold text-emerald-400 truncate">{company?.name}</div>
          </div>
        </div>
        <div className="h-7 w-px bg-gray-700" />
        <div className="hidden md:flex items-center gap-3 text-[11px] font-mono">
          <Stat label="Cash" value={formatMoney(company?.cash ?? 0)} color="text-green-400" />
          <Stat label="Revenue" value={formatMoney((company?.revenue ?? 0) * 24 * 30)} color="text-blue-400" />
          <Stat label="Profit" value={formatMoney((company?.profit ?? 0) * 24 * 30)} color={(company?.profit ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'} />
          <Stat label="Debt" value={formatMoney(company?.debt ?? 0)} color="text-orange-400" />
          <Stat label="NetWorth" value={formatMoney(gameState.player.netWorth)} color="text-purple-400" />
        </div>
      </div>

      {/* Center - Date + speed + overlays */}
      <div className="flex shrink-0 items-center gap-2">
        <div className="text-center">
          <div className="text-xs font-bold text-white">
            {months[gameState.month - 1]} {gameState.day}, {gameState.year}
          </div>
          <div className="text-[9px] text-gray-500 flex items-center justify-center gap-1">
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${
              gameState.economy.cycle === 'boom' ? 'bg-green-400' :
              gameState.economy.cycle === 'recession' ? 'bg-red-400' :
              gameState.economy.cycle === 'recovery' ? 'bg-yellow-400' : 'bg-blue-400'
            }`} />
            <span>{gameState.economy.cycle.toUpperCase()}</span>
          </div>
        </div>
        <div className="flex items-center gap-0.5 bg-gray-800/80 rounded-lg p-0.5">
          <button
            onClick={onPauseToggle}
            className="px-2 py-1 rounded text-xs font-bold bg-gray-700 hover:bg-gray-600 transition-colors"
            title={gameState.paused ? 'Resume' : 'Pause'}
          >
            {gameState.paused ? '▶' : '⏸'}
          </button>
          {[1, 2, 3].map(s => (
            <button
              key={s}
              onClick={() => onSpeedChange(s)}
              className={`px-2 py-1 rounded text-xs font-bold transition-colors ${
                gameState.speed === s ? 'bg-emerald-500 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              {s === 1 ? '▶' : s === 2 ? '▶▶' : '▶▶▶'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-0.5 bg-gray-800/80 rounded-lg p-0.5">
          {OVERLAYS.map(o => (
            <button
              key={o.id}
              onClick={() => onOverlayChange(o.id)}
              className={`px-1.5 py-1 rounded text-xs transition-colors ${
                gameState.overlay === o.id ? 'bg-amber-500 text-black' : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
              title={o.label}
            >
              {o.icon}
            </button>
          ))}

        </div>
      </div>

      {/* Right - Quick actions */}
      <div className="flex shrink-0 items-center gap-1">
        {[
          { id: 'build', icon: '🏗️', label: 'Build' },
          { id: 'finances', icon: '💰', label: 'Finance' },
          { id: 'stock_market', icon: '📈', label: 'Stocks' },
          { id: 'supply_chain', icon: '🔗', label: 'Supply' },
          { id: 'products', icon: '📦', label: 'Products' },
          { id: 'scouting', icon: 'SC', label: 'Scout' },
          { id: 'research', icon: 'RD', label: 'R&D' },
          { id: 'executives', icon: 'EX', label: 'Team' },
          { id: 'land', icon: 'LD', label: 'Land' },
          { id: 'assets', icon: '🪙', label: 'Assets' },
          { id: 'policy', icon: 'GOV', label: 'Policy' },
          { id: 'classroom', icon: 'ED', label: 'Learn' },
        ].map(btn => (
          <button
            key={btn.id}
            onClick={() => onPanelToggle(btn.id)}
            className="flex flex-col items-center px-1.5 py-0.5 rounded hover:bg-gray-800 transition-colors text-[9px]"
            title={btn.label}
          >
            <span className="text-sm leading-none">{btn.icon}</span>
            <span className="text-gray-500 mt-0.5">{btn.label}</span>
          </button>
        ))}
        <button
          onClick={() => onPanelToggle('offers')}
          className="relative flex flex-col items-center px-1.5 py-0.5 rounded hover:bg-gray-800 transition-colors text-[9px]"
          title="Inbound acquisition offers"
        >
          <span className="text-sm leading-none">📨</span>
          <span className="text-gray-500 mt-0.5">Offers</span>
          {gameState.incomingOffers.length > 0 && (
            <span className="absolute -top-0.5 right-0 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-amber-500 px-1 text-[8px] font-bold text-black">
              {gameState.incomingOffers.length}
            </span>
          )}
        </button>
        <div className="h-7 w-px bg-gray-700 mx-1" />
        <div className="text-right">
          <div className="text-[9px] text-gray-500">Index</div>
          <div className={`text-xs font-mono font-bold ${
            gameState.stockMarket.sentiment === 'bullish' ? 'text-green-400' :
            gameState.stockMarket.sentiment === 'bearish' ? 'text-red-400' : 'text-yellow-400'
          }`}>
            {gameState.stockMarket.index.toFixed(0)}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <span className="text-gray-500">{label}: </span>
      <span className={`font-semibold ${color}`}>{value}</span>
    </div>
  );
}
