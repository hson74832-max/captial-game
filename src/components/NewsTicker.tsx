'use client';

import { useState, useEffect } from 'react';
import type { NewsTickerItem } from '../game/types';

interface NewsTickerProps {
  items: NewsTickerItem[];
}

export default function NewsTicker({ items }: NewsTickerProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (items.length <= 1) return;
    const interval = setInterval(() => {
      setIndex(i => (i + 1) % items.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [items.length]);

  if (items.length === 0) return null;
  const current = items[index];

  const colorClass = {
    info: 'text-blue-300 border-blue-500/50',
    warning: 'text-yellow-300 border-yellow-500/50',
    success: 'text-green-300 border-green-500/50',
    danger: 'text-red-300 border-red-500/50',
    breaking: 'text-purple-300 border-purple-500/50',
  }[current.type];

  const icon = {
    info: '📰',
    warning: '⚠️',
    success: '✅',
    danger: '🚨',
    breaking: '⚡',
  }[current.type];

  return (
    <div className={`absolute bottom-4 left-1/2 -translate-x-1/2 max-w-2xl w-[90%] md:w-auto pointer-events-auto z-10`}>
      <div className={`bg-black/80 backdrop-blur-sm border ${colorClass} rounded-full px-4 py-1.5 flex items-center gap-2 shadow-xl transition-all`}>
        <span className="text-sm flex-shrink-0">{icon}</span>
        <div className="text-xs font-medium text-white truncate flex-1 min-w-0">
          {current.text}
        </div>
        {items.length > 1 && (
          <div className="flex gap-1 flex-shrink-0">
            {items.slice(Math.max(0, index - 1), index + 2).map((_, i) => (
              <div key={i} className={`w-1 h-1 rounded-full ${i === Math.min(1, index) ? 'bg-white' : 'bg-white/30'}`} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
