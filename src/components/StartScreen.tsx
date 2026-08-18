'use client';

import { useState } from 'react';

interface StartScreenProps {
  onStart: (playerName: string, scenario: string, seed: number) => void;
}

const SCENARIOS = [
  { id: 'standard', name: 'Standard CEO', desc: 'Start from scratch in 2000, build your empire.', icon: '🚀' },
  { id: 'shanghai1990', name: '1990 Shanghai', desc: 'Pioneer in a fast-growing emerging market.', icon: '🌆' },
  { id: 'recession', name: 'Recession Play', desc: 'Buy low during a downturn. For strategists.', icon: '📉' },
  { id: 'techboom', name: 'Tech Boom', desc: 'High starting capital, R&D focused.', icon: '💡' },
];

export default function StartScreen({ onStart }: StartScreenProps) {
  const [name, setName] = useState('Player');
  const [scenario, setScenario] = useState('standard');
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 99999));

  return (
    <div className="h-screen w-screen bg-gradient-to-br from-gray-950 via-slate-900 to-gray-950 flex items-center justify-center overflow-auto py-8">
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0" style={{
          backgroundImage: `
            radial-gradient(circle at 15% 30%, rgba(16, 185, 129, 0.12) 0%, transparent 40%),
            radial-gradient(circle at 80% 20%, rgba(59, 130, 246, 0.12) 0%, transparent 40%),
            radial-gradient(circle at 50% 90%, rgba(139, 92, 246, 0.12) 0%, transparent 40%)
          `,
        }} />
        <div className="absolute inset-0" style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        }} />
        {/* Isometric lines */}
        <svg className="absolute inset-0 w-full h-full opacity-20" viewBox="0 0 100 100" preserveAspectRatio="none">
          {Array.from({ length: 30 }, (_, i) => (
            <line key={`h${i}`} x1="0" y1={i * 5} x2="200" y2={i * 5 + 50} stroke="#10b981" strokeWidth="0.05" />
          ))}
          {Array.from({ length: 30 }, (_, i) => (
            <line key={`v${i}`} x1={i * 5} y1="50" x2={i * 5 + 100} y2="0" stroke="#3b82f6" strokeWidth="0.05" />
          ))}
        </svg>
      </div>

      <div className="relative z-10 w-full max-w-3xl mx-auto px-6">
        {/* Logo */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-3 bg-gray-900/60 px-5 py-3 rounded-2xl border border-gray-700/50 backdrop-blur-md">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 via-blue-500 to-purple-600 flex items-center justify-center text-2xl font-black text-white shadow-lg shadow-emerald-500/30">
              CG
            </div>
            <div className="text-left">
              <div className="text-2xl font-black text-white tracking-tight">Capital Game</div>
              <div className="text-[10px] text-gray-400 uppercase tracking-widest">Business Empire Simulator</div>
            </div>
          </div>
        </div>

        {/* Hero */}
        <div className="text-center mb-6">
          <h1 className="text-4xl md:text-5xl font-black mb-2 bg-gradient-to-r from-emerald-400 via-blue-400 to-purple-400 text-transparent bg-clip-text leading-tight">
            Build Your Empire
          </h1>
          <p className="text-sm text-gray-400 max-w-xl mx-auto">
            Step into the role of CEO. Manage supply chains, dominate markets, and outperform AI rivals across multiple cities in a living, breathing economy.
          </p>
        </div>

        {/* Features grid */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-6">
          {[
            { icon: '🏭', title: 'Manufacture', desc: 'Factories' },
            { icon: '🏪', title: 'Retail', desc: 'Stores' },
            { icon: '📈', title: 'Trade', desc: 'Stocks' },
            { icon: '🏠', title: 'Real Estate', desc: 'Properties' },
            { icon: '📺', title: 'Media', desc: 'TV & News' },
            { icon: '🌍', title: 'Multi-City', desc: 'Global map' },
          ].map(f => (
            <div key={f.title} className="bg-gray-900/60 backdrop-blur-sm rounded-xl p-2.5 border border-gray-700/50 text-center">
              <div className="text-xl mb-0.5">{f.icon}</div>
              <div className="text-[10px] font-bold text-gray-200">{f.title}</div>
              <div className="text-[9px] text-gray-500">{f.desc}</div>
            </div>
          ))}
        </div>

        {/* Form */}
        <div className="bg-gray-900/70 backdrop-blur-sm rounded-2xl border border-gray-700/50 p-5 shadow-2xl">
          <div className="grid md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">CEO Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors"
                placeholder="Enter your name"
                maxLength={20}
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Map Seed</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={seed}
                  onChange={e => setSeed(parseInt(e.target.value) || 0)}
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors"
                />
                <button
                  onClick={() => setSeed(Math.floor(Math.random() * 99999))}
                  className="px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-sm"
                  title="Random seed"
                >
                  🎲
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Scenario</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {SCENARIOS.map(s => (
                <button
                  key={s.id}
                  onClick={() => setScenario(s.id)}
                  className={`text-left p-2.5 rounded-lg border transition-all ${
                    scenario === s.id
                      ? 'bg-emerald-500/20 border-emerald-500 ring-2 ring-emerald-500/50'
                      : 'bg-gray-800 border-gray-700 hover:border-gray-600'
                  }`}
                >
                  <div className="text-lg mb-0.5">{s.icon}</div>
                  <div className="text-[11px] font-bold text-white">{s.name}</div>
                  <div className="text-[9px] text-gray-400 leading-tight">{s.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => onStart(name, scenario, seed)}
            className="w-full mt-5 py-3 bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-500 hover:to-blue-500 text-white font-black text-base rounded-xl shadow-lg shadow-emerald-500/25 transition-all hover:scale-[1.02] active:scale-100"
          >
            🎮 Begin Your Empire
          </button>
        </div>

        <div className="mt-4 flex items-center justify-center gap-4 text-[10px] text-gray-500">
          <span>Isometric View</span>
          <span>•</span>
          <span>Day/Night Cycle</span>
          <span>•</span>
          <span>Multi-City Economy</span>
          <span>•</span>
          <span>For Education & Training</span>
        </div>
      </div>
    </div>
  );
}
