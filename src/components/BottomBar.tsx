'use client';

import type { GameState } from '../game/types';
import { formatMoney } from '../utils/format';

interface BottomBarProps {
  gameState: GameState;
  onPanelToggle: (panel: string) => void;
  onShowNotifications: () => void;
  notificationCount: number;
}

export default function BottomBar({ gameState, onPanelToggle, onShowNotifications, notificationCount }: BottomBarProps) {
  const company = gameState.companies.find(c => c.isPlayer);
  const playerBuildings = gameState.buildings.filter(b => b.companyId === company?.id);

  return (
    <div className="flex items-center justify-between bg-gradient-to-r from-gray-950 via-gray-900 to-gray-950 text-white px-3 py-1 border-t border-gray-800 z-40">
      {/* Left - World stats */}
      <div className="flex items-center gap-3 text-[11px]">
        <button onClick={() => onPanelToggle('city')} className="hover:text-cyan-400 transition-colors flex items-center gap-1">
          <span>🏙️</span>
          <span className="text-gray-300">{gameState.cities.length} Cities</span>
        </button>
        <button onClick={() => onPanelToggle('company')} className="hover:text-orange-400 transition-colors flex items-center gap-1">
          <span>🏢</span>
          <span className="text-gray-300">{gameState.companies.length} Cos</span>
        </button>
        <button onClick={() => onPanelToggle('supply_chain')} className="hover:text-blue-400 transition-colors flex items-center gap-1">
          <span>🏗️</span>
          <span className="text-emerald-400 font-semibold">{playerBuildings.length} Your Bldgs</span>
        </button>
        <button onClick={onShowNotifications} className="hover:text-yellow-400 transition-colors flex items-center gap-1 relative">
          <span>🔔</span>
          <span className="text-gray-300">{notificationCount}</span>
        </button>
      </div>

      {/* Center - Player info */}
      <div className="flex items-center gap-3 text-[10px] text-gray-400">
        <span>👤 {gameState.player.name}</span>
        <span>Salary: <span className="text-green-400 font-mono">{formatMoney(gameState.player.salary)}/yr</span></span>
        <span>Knowledge: <span className="text-cyan-400 font-mono">{Math.floor(gameState.player.knowledgePoints)}</span></span>
      </div>

      {/* Right - Economy */}
      <div className="flex items-center gap-3 text-[11px] font-mono">
        <Indicator label="GDP" value={`${gameState.economy.gdpGrowth.toFixed(1)}%`} color={gameState.economy.gdpGrowth > 0 ? 'text-green-400' : 'text-red-400'} />
        <Indicator label="Inf" value={`${gameState.economy.inflation.toFixed(1)}%`} color="text-yellow-400" />
        {/* CPI is the headline gauge: 100 = game start. Rising CPI means the
            cash in your treasury buys less each year. */}
        <span title={`Consumer Price Index — 100 at game start. Your cash has lost ${Math.max(0, 100 - 100 / (gameState.economy.cpi / 100)).toFixed(1)}% of its purchasing power.`}>
          <Indicator
            label="CPI"
            value={gameState.economy.cpi.toFixed(1)}
            color={gameState.economy.cpi > 130 ? 'text-red-400' : gameState.economy.cpi > 110 ? 'text-amber-400' : 'text-cyan-400'}
          />
        </span>
        <Indicator label="Rate" value={`${gameState.economy.interestRate.toFixed(1)}%`} color="text-blue-400" />
        <span title={`Central bank guidance: ${gameState.economy.forwardGuidance}`}>
          <Indicator
            label="Fed"
            value={gameState.economy.forwardGuidance === 'hawkish' ? '↑' : gameState.economy.forwardGuidance === 'dovish' ? '↓' : '→'}
            color={gameState.economy.forwardGuidance === 'hawkish' ? 'text-red-400' : gameState.economy.forwardGuidance === 'dovish' ? 'text-emerald-400' : 'text-gray-400'}
          />
        </span>
        <Indicator label="Conf" value={gameState.economy.consumerConfidence.toFixed(0)} color="text-purple-400" />
        <button onClick={() => onPanelToggle('settings')} className="text-gray-500 hover:text-white">⚙️</button>
      </div>
    </div>
  );
}

function Indicator({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <span className="text-gray-500">{label}: </span>
      <span className={`font-bold ${color}`}>{value}</span>
    </div>
  );
}
