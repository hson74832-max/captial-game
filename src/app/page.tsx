'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { GameState, IsometricTile, BuildingType, OverlayMode, TradedAsset, Building, MovingEntity } from '@/game/types';
import {
  createNewGame, simulateTick, generateMap, placeBuilding, setBuildingProduct,
  upgradeBuilding, sellBuilding, formatMoney, formatPopulation,
  setBuildingPrice, setAdBudget, takeLoan, repayLoan,
  buyAsset, sellAsset, getAskingPrice, makePurchaseOffer,
  acceptIncomingOffer, rejectIncomingOffer, clearLastOffer,
  checkBuildable, generateEntities, updateEntities,
  eligibleProductsFor, addRetailLine, removeRetailLine, setRetailSpecialisation,
  setMenuItemPrice, toggleMenuItem, toggleInternalSale, productRating,
} from '@/game/engine';
import {
  BUILDING_CONFIGS, SKILL_LABEL, BUILDABLE_TYPES, RETAIL_CATEGORIES,
  isHospitality, KIDS_TOY_COST,
} from '@/game/constants';

// ============= ISOMETRIC RENDERER =============
const TILE_W = 32;
const TILE_H = 16;

function toIso(x: number, y: number): [number, number] {
  return [(x - y) * TILE_W / 2, (x + y) * TILE_H / 2];
}

function fromIso(sx: number, sy: number): [number, number] {
  const x = (sx / (TILE_W / 2) + sy / (TILE_H / 2)) / 2;
  const y = (sy / (TILE_H / 2) - sx / (TILE_W / 2)) / 2;
  return [Math.floor(x), Math.floor(y)];
}

const TERRAIN_COLORS: Record<string, string> = {
  grass: '#4ade80', water: '#3b82f6', forest: '#166534', hills: '#86efac',
  mountain: '#9ca3af', desert: '#fbbf24', beach: '#fde68a', snow: '#e2e8f0',
};

// ============= MAP CANVAS =============
function GameMap({ state, tiles, entities, onTileClick, onBuildingClick, placementMode, camera, onCameraChange }: {
  state: GameState;
  tiles: IsometricTile[][];
  entities: React.RefObject<MovingEntity[]>;
  onTileClick: (x: number, y: number) => void;
  onBuildingClick: (id: string) => void;
  placementMode: BuildingType | null;
  camera: { x: number; y: number; zoom: number };
  onCameraChange: (cam: { x: number; y: number; zoom: number }) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const hoverRef = useRef<[number, number] | null>(null);
  const stateRef = useRef(state);
  const camRef = useRef(camera);
  const modeRef = useRef(placementMode);
  useEffect(() => {
    stateRef.current = state;
    camRef.current = camera;
    modeRef.current = placementMode;
  });

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const st = stateRef.current;
    const cam = camRef.current;
    const mode = modeRef.current;
    const hover = hoverRef.current;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Sky gradient reflecting time of day
    const daylight = Math.sin(st.timeOfDay * Math.PI);
    const night = Math.max(0, 1 - daylight * 1.6);
    ctx.fillStyle = night > 0.6 ? '#0b1120' : night > 0.3 ? '#1e293b' : '#0f172a';
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const zoom = cam.zoom;
    const viewportSize = Math.ceil(30 / zoom);

    const minX = Math.max(0, Math.floor(cam.x - viewportSize));
    const maxX = Math.min(st.mapSize - 1, Math.ceil(cam.x + viewportSize));
    const minY = Math.max(0, Math.floor(cam.y - viewportSize));
    const maxY = Math.min(st.mapSize - 1, Math.ceil(cam.y + viewportSize));

    const project = (wx: number, wy: number, elev = 0) => {
      const isoX = (wx - cam.x - (wy - cam.y)) * TILE_W / 2;
      const isoY = (wx - cam.x + (wy - cam.y)) * TILE_H / 2;
      return [cx + isoX * zoom, cy + isoY * zoom - elev * 8 * zoom] as [number, number];
    };

    // ── Terrain ──
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const tile = tiles[y]?.[x];
        if (!tile) continue;
        const [sx, sy] = project(x, y, tile.elevation);
        const tw = TILE_W * zoom;
        const th = TILE_H * zoom;

        ctx.beginPath();
        ctx.moveTo(sx, sy - th / 2);
        ctx.lineTo(sx + tw / 2, sy);
        ctx.lineTo(sx, sy + th / 2);
        ctx.lineTo(sx - tw / 2, sy);
        ctx.closePath();

        let color = TERRAIN_COLORS[tile.type] || '#4ade80';

        // City ground by zone
        if (tile.cityId) {
          color = tile.zone === 'commercial' ? '#cbd5e1'
            : tile.zone === 'residential' ? '#dcfce7'
            : tile.zone === 'mixed' ? '#e5e7eb' : '#e7e5e4';
        }
        // Roads and highways paint over ground
        if (tile.highway) color = '#3f3f46';
        else if (tile.road) color = '#71717a';

        if (st.overlay === 'land_value') {
          const t = Math.min(1, tile.landValue / 120);
          color = `rgb(${Math.floor(30 + t * 225)},${Math.floor(200 - t * 150)},${Math.floor(90 - t * 60)})`;
        } else if (st.overlay === 'zoning' && tile.cityId) {
          color = tile.zone === 'commercial' ? '#60a5fa'
            : tile.zone === 'residential' ? '#4ade80'
            : tile.zone === 'industrial' ? '#f59e0b' : '#a78bfa';
        } else if (st.overlay === 'traffic' && tile.cityId) {
          const city = st.cities.find(c => c.id === tile.cityId);
          const t = city ? city.trafficLevel / 100 : 0;
          color = `rgb(${Math.floor(60 + t * 195)},${Math.floor(200 - t * 160)},60)`;
        }

        ctx.fillStyle = color;
        ctx.fill();

        // Night dimming outside overlays
        if (night > 0.15 && st.overlay === 'none') {
          ctx.fillStyle = `rgba(10,16,40,${night * 0.45})`;
          ctx.fill();
        }

        ctx.strokeStyle = tile.highway ? 'rgba(250,204,21,0.25)' : 'rgba(0,0,0,0.07)';
        ctx.lineWidth = tile.highway ? 1 : 0.5;
        ctx.stroke();

        if (tile.resource && zoom > 0.75) {
          ctx.font = `${Math.floor(9 * zoom)}px sans-serif`;
          ctx.textAlign = 'center';
          const icons: Record<string, string> = {
            iron: '⛏️', coal: '⬛', oil: '🛢️', timber: '🌲',
            gold: '💎', silica: '🔷', lithium: '⚡', fish: '🐟', wheat: '🌾',
          };
          ctx.fillText(icons[tile.resource.type] || '●', sx, sy + 3);
        }

        // Placement preview
        if (mode && hover && hover[0] === x && hover[1] === y) {
          const verdict = checkBuildable(tiles, st, mode, x, y);
          ctx.fillStyle = verdict.ok ? 'rgba(16,185,129,0.55)' : 'rgba(239,68,68,0.55)';
          ctx.fill();
        }
      }
    }

    // ── Highway centreline dashes ──
    ctx.strokeStyle = 'rgba(250,204,21,0.55)';
    ctx.lineWidth = Math.max(0.6, 1.1 * zoom);
    ctx.setLineDash([3 * zoom, 3 * zoom]);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const tile = tiles[y]?.[x];
        if (!tile?.highway) continue;
        const right = tiles[y]?.[x + 1];
        const down = tiles[y + 1]?.[x];
        const [sx, sy] = project(x, y, tile.elevation);
        if (right?.highway) {
          const [ex, ey] = project(x + 1, y, right.elevation);
          ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
        }
        if (down?.highway) {
          const [ex, ey] = project(x, y + 1, down.elevation);
          ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
        }
      }
    }
    ctx.setLineDash([]);

    // ── Buildings, entities and city labels, depth-sorted by (x+y) ──
    type Drawable = { depth: number; render: () => void };
    const drawables: Drawable[] = [];

    for (const building of st.buildings) {
      if (building.x < minX - 4 || building.x > maxX + 4 || building.y < minY - 4 || building.y > maxY + 4) continue;
      drawables.push({
        depth: building.x + building.y,
        render: () => {
          const tile = tiles[Math.round(building.y)]?.[Math.round(building.x)];
          const [sx, sy] = project(building.x, building.y, tile?.elevation ?? 0);
          const cfg = BUILDING_CONFIGS[building.type];
          const bw = (cfg?.w || 2) * TILE_W * zoom * 0.34;
          const bh = ((cfg?.h || 2) * TILE_H * 1.15 + building.level * 3) * zoom;
          const company = st.companies.find(c => c.id === building.companyId);
          const base = company?.color || cfg?.color || '#6b7280';
          const isSelected = st.selectedBuilding === building.id;

          // Shadow
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.beginPath();
          ctx.ellipse(sx, sy + 2, bw * 0.55, bw * 0.22, 0, 0, Math.PI * 2);
          ctx.fill();

          // Left/right faces for a solid isometric block
          ctx.fillStyle = base;
          ctx.fillRect(sx - bw / 2, sy - bh, bw, bh);
          ctx.fillStyle = 'rgba(0,0,0,0.22)';
          ctx.fillRect(sx, sy - bh, bw / 2, bh);
          // Roof highlight
          ctx.fillStyle = 'rgba(255,255,255,0.28)';
          ctx.fillRect(sx - bw / 2, sy - bh, bw, Math.max(1.5, bh * 0.12));

          // Lit windows at night
          if (night > 0.35 && building.isOperating && zoom > 0.55) {
            ctx.fillStyle = 'rgba(253,224,71,0.85)';
            const rows = Math.max(1, Math.floor(bh / (5 * zoom)));
            const cols = Math.max(1, Math.floor(bw / (5 * zoom)));
            for (let r = 0; r < rows; r++) {
              for (let c = 0; c < cols; c++) {
                if ((building.x * 7 + building.y * 13 + r * 3 + c) % 3 !== 0) continue;
                ctx.fillRect(sx - bw / 2 + 1.5 + c * 5 * zoom, sy - bh + 3 * zoom + r * 5 * zoom,
                  1.8 * zoom, 1.8 * zoom);
              }
            }
          }

          if (isSelected) {
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = 2;
            ctx.strokeRect(sx - bw / 2 - 2, sy - bh - 2, bw + 4, bh + 4);
          }

          if (zoom > 0.75 && cfg) {
            ctx.font = `${Math.floor(11 * zoom)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText(cfg.icon, sx, sy - bh / 2 + 4 * zoom);
          }

          // Health dot
          if (building.isOperating) {
            ctx.fillStyle = building.profit > 0 ? '#22c55e' : '#ef4444';
            ctx.beginPath();
            ctx.arc(sx + bw / 2 - 1.5, sy - bh + 3, Math.max(1.2, 2 * zoom), 0, Math.PI * 2);
            ctx.fill();
          }

          // Factory smoke
          if (building.type === 'factory' && building.utilization > 25 && zoom > 0.6) {
            const t = (st.tick * 0.35 + building.x * 3) % 12;
            ctx.fillStyle = `rgba(200,200,210,${Math.max(0, 0.32 - t * 0.026)})`;
            ctx.beginPath();
            ctx.arc(sx - bw * 0.2, sy - bh - t * 1.6 * zoom, (1.5 + t * 0.35) * zoom, 0, Math.PI * 2);
            ctx.fill();
          }
        },
      });
    }

    // Moving entities
    const ents = entities.current ?? [];
    for (const e of ents) {
      if (e.x < minX - 2 || e.x > maxX + 2 || e.y < minY - 2 || e.y > maxY + 2) continue;
      drawables.push({
        depth: e.x + e.y + 0.4,
        render: () => {
          const [sx, sy] = project(e.x, e.y, 0);
          if (e.type === 'person') {
            ctx.fillStyle = e.color;
            ctx.beginPath();
            ctx.arc(sx, sy - 2 * zoom, Math.max(0.7, 1.1 * zoom), 0, Math.PI * 2);
            ctx.fill();
          } else {
            const len = (e.type === 'freight_truck' ? 5.5 : e.type === 'truck' ? 4.5 : 3.4) * zoom;
            const wid = 2.4 * zoom;
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.fillRect(sx - len / 2 + 0.5, sy - wid / 2 + 1, len, wid);
            ctx.fillStyle = e.color;
            ctx.fillRect(sx - len / 2, sy - wid / 2 - 1.5 * zoom, len, wid);
            // Headlights at night
            if (night > 0.4 && zoom > 0.7) {
              ctx.fillStyle = 'rgba(255,244,180,0.9)';
              const dir = e.direction === 1 ? 1 : e.direction === 3 ? -1 : 0;
              ctx.fillRect(sx + dir * len / 2, sy - wid / 2 - 1.5 * zoom, 1.2 * zoom, wid * 0.5);
            }
          }
        },
      });
    }

    drawables.sort((a, b) => a.depth - b.depth);
    for (const d of drawables) d.render();

    // ── City labels on top ──
    for (const city of st.cities) {
      if (city.x < minX - 6 || city.x > maxX + 6 || city.y < minY - 6 || city.y > maxY + 6) continue;
      const [sx, sy] = project(city.x, city.y, 0);
      ctx.textAlign = 'center';
      ctx.font = `bold ${Math.max(9, Math.floor(12 * zoom))}px system-ui`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.strokeText(city.name, sx, sy - 30 * zoom);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(city.name, sx, sy - 30 * zoom);
      ctx.font = `${Math.max(8, Math.floor(9 * zoom))}px system-ui`;
      ctx.strokeText(formatPopulation(city.population), sx, sy - 19 * zoom);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillText(formatPopulation(city.population), sx, sy - 19 * zoom);
    }
  }, [tiles, entities]);

  // Animation loop — redraws continuously so vehicles move smoothly.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      const st = stateRef.current;
      if (entities.current && !st.paused) {
        updateEntities(entities.current, st, (dt / 16.6) * Math.min(3, st.speed));
      }
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [draw, entities]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
      draw();
    });
    ro.observe(canvas);
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    return () => ro.disconnect();
  }, [draw]);

  const screenToWorld = (clientX: number, clientY: number): [number, number] => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const mx = (clientX - rect.left - canvas.width / 2) / camera.zoom;
    const my = (clientY - rect.top - canvas.height / 2) / camera.zoom;
    const wx = (mx / (TILE_W / 2) + my / (TILE_H / 2)) / 2;
    const wy = (my / (TILE_H / 2) - mx / (TILE_W / 2)) / 2;
    return [Math.round(wx + camera.x), Math.round(wy + camera.y)];
  };

  return (
    <canvas
      ref={canvasRef}
      className={`w-full h-full ${placementMode ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`}
      onMouseDown={(e) => { setIsDragging(true); setDragStart({ x: e.clientX, y: e.clientY }); }}
      onMouseMove={(e) => {
        if (isDragging) {
          const dx = (e.clientX - dragStart.x) / (TILE_W * camera.zoom);
          const dy = (e.clientY - dragStart.y) / (TILE_H * camera.zoom);
          onCameraChange({ ...camera, x: camera.x - (dx + dy) * 0.5, y: camera.y - (dy - dx) * 0.5 });
          setDragStart({ x: e.clientX, y: e.clientY });
        }
        hoverRef.current = screenToWorld(e.clientX, e.clientY);
      }}
      onMouseUp={() => setIsDragging(false)}
      onMouseLeave={() => { setIsDragging(false); hoverRef.current = null; }}
      onClick={(e) => {
        const [wx, wy] = screenToWorld(e.clientX, e.clientY);
        const clicked = state.buildings.find(b =>
          Math.abs(b.x - wx) < (b.width / 2 + 0.6) && Math.abs(b.y - wy) < (b.height / 2 + 0.6));
        if (clicked && !placementMode) { onBuildingClick(clicked.id); return; }
        onTileClick(wx, wy);
      }}
      onWheel={(e) => {
        onCameraChange({ ...camera, zoom: Math.max(0.3, Math.min(3.5, camera.zoom - e.deltaY * 0.0012)) });
      }}
    />
  );
}

// ============= MINI CHART =============
function MiniChart({ data, color = '#10b981', height = 40, width = 150 }: { data: number[]; color?: string; height?: number; width?: number }) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * (height - 4)}`).join(' ');
  return (
    <svg width={width} height={height} className="opacity-90">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

// ============= MAIN GAME =============
type PanelType = 'dashboard' | 'build' | 'products' | 'companies' | 'economy' | 'market' | 'assets' | 'loans';

export default function GamePage() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [tiles, setTiles] = useState<IsometricTile[][] | null>(null);
  const [placementMode, setPlacementMode] = useState<BuildingType | null>(null);
  const [activePanel, setActivePanel] = useState<PanelType | null>('dashboard');
  const [showStartScreen, setShowStartScreen] = useState(true);
  const [playerName, setPlayerName] = useState('Your Corporation');
  const [gameSeed, setGameSeed] = useState(1337);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const entitiesRef = useRef<MovingEntity[]>([]);

  const startGame = useCallback(() => {
    const state = createNewGame(gameSeed, playerName);
    const map = generateMap(state);
    entitiesRef.current = generateEntities(state);
    setGameState(state);
    setTiles(map);
    setShowStartScreen(false);
  }, [gameSeed, playerName]);

  useEffect(() => {
    if (!gameState || gameState.paused) {
      if (tickRef.current) clearInterval(tickRef.current);
      return;
    }
    const interval = Math.max(16, 200 / gameState.speed);
    tickRef.current = setInterval(() => {
      setGameState(prev => prev ? simulateTick(prev) : null);
    }, interval);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
    // Only the pause flag and speed should restart the loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState?.paused, gameState?.speed, gameState === null]);

  const handleTileClick = useCallback((x: number, y: number) => {
    if (!gameState || !placementMode || !tiles) return;
    setGameState(placeBuilding(gameState, placementMode, x, y, tiles));
    setPlacementMode(null);
  }, [gameState, placementMode, tiles]);

  const handleBuildingClick = useCallback((id: string) => {
    setGameState(prev => prev ? { ...prev, selectedBuilding: prev.selectedBuilding === id ? null : id } : null);
  }, []);

  const handleCameraChange = useCallback((cam: { x: number; y: number; zoom: number }) => {
    setGameState(prev => prev ? { ...prev, camera: cam } : null);
  }, []);

  if (showStartScreen) {
    return <StartScreen playerName={playerName} setPlayerName={setPlayerName} seed={gameSeed} setSeed={setGameSeed} onStart={startGame} />;
  }

  if (!gameState || !tiles) return <div className="flex items-center justify-center h-screen bg-gray-900 text-white text-xl">Loading...</div>;

  const player = gameState.companies.find(c => c.isPlayer);
  const selectedBuilding = gameState.selectedBuilding ? gameState.buildings.find(b => b.id === gameState.selectedBuilding) : null;

  return (
    <div className="h-screen w-screen flex flex-col bg-gray-900 text-white overflow-hidden select-none">
      {/* Top Bar */}
      <div className="h-10 bg-gray-800 border-b border-gray-700 flex items-center px-3 gap-4 shrink-0 text-xs">
        <span className="font-bold text-emerald-400 text-sm">{player?.name}</span>
        <div className="flex gap-3 items-center">
          <span>💰 ${formatMoney(player?.cash || 0)}</span>
          <span className={`${(player?.profit || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            P/L: ${formatMoney((player?.profit || 0) * 24 * 30)}/mo
          </span>
          <span>📈 ${formatMoney(player?.marketCap || 0)}</span>
          <span>🏦 Net: ${formatMoney(gameState.player.netWorth)}</span>
          {(player?.debt || 0) > 0 && <span className="text-orange-400">📉 Debt: ${formatMoney(player?.debt || 0)}</span>}
        </div>
        <div className="ml-auto flex gap-3 items-center">
          <span>{gameState.season.charAt(0).toUpperCase() + gameState.season.slice(1)}</span>
          <span className="font-mono">{gameState.year}/{String(gameState.month).padStart(2, '0')}/{String(gameState.day).padStart(2, '0')}</span>
          <span className="text-gray-400">{String(gameState.hour).padStart(2, '0')}:00</span>
          <div className="flex gap-1">
            <button onClick={() => setGameState(prev => prev ? { ...prev, paused: !prev.paused } : null)}
              className={`px-2 py-0.5 rounded text-xs ${gameState.paused ? 'bg-red-600' : 'bg-gray-600'}`}>
              {gameState.paused ? '⏸' : '▶'}
            </button>
            {[1, 2, 4, 8].map(s => (
              <button key={s} onClick={() => setGameState(prev => prev ? { ...prev, speed: s } : null)}
                className={`px-2 py-0.5 rounded text-xs ${gameState.speed === s ? 'bg-emerald-600' : 'bg-gray-600'}`}>
                {s}x
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Nav */}
        <div className="w-10 bg-gray-800 border-r border-gray-700 flex flex-col items-center py-2 gap-1 shrink-0">
          {([
            ['dashboard', '📊'], ['build', '🏗️'], ['products', '📦'],
            ['companies', '🏢'], ['economy', '📉'], ['market', '💹'],
            ['assets', '🪙'], ['loans', '🏦'],
          ] as const).map(([key, icon]) => (
            <button key={key}
              onClick={() => setActivePanel(activePanel === key ? null : key)}
              className={`w-8 h-8 rounded flex items-center justify-center text-sm relative
                ${activePanel === key ? 'bg-emerald-700' : 'bg-gray-700 hover:bg-gray-600'}`}
              title={key.charAt(0).toUpperCase() + key.slice(1)}>
              {icon}
              {key === 'dashboard' && gameState.incomingOffers.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-[9px] rounded-full w-3 h-3 flex items-center justify-center">
                  {gameState.incomingOffers.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Side Panel */}
        {activePanel && (
          <div className="w-80 bg-gray-800/95 border-r border-gray-700 overflow-y-auto shrink-0">
            {activePanel === 'dashboard' && <DashboardPanel state={gameState} setState={setGameState} />}
            {activePanel === 'build' && <BuildPanel onSelectType={(t) => { setPlacementMode(t); setActivePanel(null); }} playerCash={player?.cash || 0} />}
            {activePanel === 'products' && <ProductsPanel state={gameState} />}
            {activePanel === 'companies' && <CompaniesPanel state={gameState} />}
            {activePanel === 'economy' && <EconomyPanel state={gameState} />}
            {activePanel === 'market' && <MarketPanel state={gameState} />}
            {activePanel === 'assets' && <AssetsPanel state={gameState} setState={setGameState} />}
            {activePanel === 'loans' && <LoansPanel state={gameState} setState={setGameState} />}
          </div>
        )}

        {/* Map */}
        <div className="flex-1 relative">
          <GameMap state={gameState} tiles={tiles} entities={entitiesRef}
            onTileClick={handleTileClick} onBuildingClick={handleBuildingClick}
            placementMode={placementMode} camera={gameState.camera} onCameraChange={handleCameraChange} />

          <div className="absolute top-2 right-2 flex gap-1">
            {([['none', '🗺️', 'Normal'], ['land_value', '💰', 'Land Value'],
               ['traffic', '🚗', 'Traffic'], ['zoning', '🏗️', 'Zoning']] as const).map(([mode, icon, label]) => (
              <button key={mode} title={label}
                onClick={() => setGameState(prev => prev ? { ...prev, overlay: mode as OverlayMode } : null)}
                className={`px-2 py-1 text-xs rounded ${gameState.overlay === mode ? 'bg-emerald-600' : 'bg-gray-700/80'}`}>
                {icon}
              </button>
            ))}
          </div>

          {placementMode && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-gray-800/95 border border-emerald-600 px-4 py-2 rounded-lg text-sm shadow-xl">
              <div className="flex gap-3 items-center">
                <span className="text-base">{BUILDING_CONFIGS[placementMode]?.icon}</span>
                <span>Placing <b>{BUILDING_CONFIGS[placementMode]?.name}</b></span>
                <button onClick={() => setPlacementMode(null)} className="bg-red-600 px-2 py-0.5 rounded text-xs">Cancel</button>
              </div>
              <div className="text-[10px] text-gray-400 mt-1 flex gap-3">
                <span className="text-emerald-400">■ valid</span>
                <span className="text-red-400">■ blocked</span>
                <span>Streets, highways & wrong zoning are off-limits</span>
              </div>
            </div>
          )}

          {gameState.lastOffer && (
            <div className="absolute top-14 left-1/2 -translate-x-1/2 bg-gray-800/95 border border-gray-600 px-4 py-3 rounded-lg max-w-md shadow-xl">
              <div className={`text-sm font-bold mb-1 ${gameState.lastOffer.status === 'accepted' ? 'text-green-400' : gameState.lastOffer.status === 'counter' ? 'text-amber-400' : 'text-red-400'}`}>
                {gameState.lastOffer.status === 'accepted' ? '✓ Offer Accepted' : gameState.lastOffer.status === 'counter' ? '↔ Counter Offer' : '✕ Offer Rejected'}
              </div>
              <div className="text-xs text-gray-300 mb-2">{gameState.lastOffer.message}</div>
              <button onClick={() => setGameState(prev => prev ? clearLastOffer(prev) : null)} className="text-xs bg-gray-600 px-3 py-1 rounded">Dismiss</button>
            </div>
          )}

          {gameState.overlay === 'zoning' && (
            <div className="absolute top-12 right-2 bg-gray-800/90 rounded-lg p-2 text-[10px] space-y-1">
              <div className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{background:'#60a5fa'}} /> Commercial core</div>
              <div className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{background:'#4ade80'}} /> Residential</div>
              <div className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{background:'#a78bfa'}} /> Mixed use</div>
              <div className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{background:'#f59e0b'}} /> Industrial</div>
            </div>
          )}

          <div className="absolute bottom-2 left-2 flex gap-1 flex-wrap max-w-md">
            {gameState.cities.map(city => (
              <button key={city.id}
                onClick={() => handleCameraChange({ ...gameState.camera, x: city.x, y: city.y })}
                className="px-2 py-0.5 bg-gray-700/80 hover:bg-gray-600 rounded text-xs">
                {city.name}
              </button>
            ))}
          </div>
        </div>

        {/* Building Detail */}
        {selectedBuilding && (
          <BuildingDetailPanel
            state={gameState} building={selectedBuilding}
            onClose={() => setGameState(prev => prev ? { ...prev, selectedBuilding: null } : null)}
            setState={setGameState}
          />
        )}
      </div>

      {/* News Ticker */}
      <div className="h-7 bg-gray-800 border-t border-gray-700 flex items-center px-3 overflow-hidden shrink-0">
        <span className="text-red-400 font-bold text-xs mr-2 shrink-0">NEWS</span>
        <div className="overflow-hidden whitespace-nowrap flex-1">
          <div className="inline-block animate-marquee text-xs text-gray-300">
            {gameState.stockMarket.ticker.slice(0, 5).map(t => t.text).join('  •  ')}
          </div>
        </div>
        <div className="ml-auto flex gap-3 text-xs text-gray-400 shrink-0">
          <span>SPX: {gameState.stockMarket.index.toFixed(0)}</span>
          <span>⛽ ${gameState.economy.dieselPrice.toFixed(2)}</span>
          <span className={gameState.stockMarket.sentiment === 'bullish' ? 'text-green-400' : gameState.stockMarket.sentiment === 'bearish' ? 'text-red-400' : ''}>
            {gameState.stockMarket.sentiment.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Toast Notifications */}
      <div className="fixed bottom-10 right-4 flex flex-col gap-1 pointer-events-none z-50 max-w-sm">
        {gameState.notifications.slice(0, 4).map(n => (
          <div key={n.id} className={`px-3 py-1.5 rounded text-xs shadow-lg pointer-events-auto
            ${n.type === 'success' ? 'bg-emerald-800' : n.type === 'warning' ? 'bg-amber-800' : n.type === 'danger' ? 'bg-red-800' : 'bg-gray-700'}`}>
            {n.message}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============= START SCREEN =============
function StartScreen({ playerName, setPlayerName, seed, setSeed, onStart }: {
  playerName: string; setPlayerName: (s: string) => void;
  seed: number; setSeed: (n: number) => void; onStart: () => void;
}) {
  return (
    <div className="h-screen w-screen bg-gradient-to-br from-gray-900 via-gray-800 to-emerald-950 flex items-center justify-center">
      <div className="bg-gray-800/90 border border-gray-600 rounded-2xl p-8 max-w-md w-full shadow-2xl">
        <h1 className="text-3xl font-bold text-center text-emerald-400 mb-1">Capital Empire</h1>
        <p className="text-center text-gray-400 mb-6 text-sm">Build your business empire. Dominate the market.</p>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-300 mb-1">Corporation Name</label>
            <input type="text" value={playerName} onChange={e => setPlayerName(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm text-gray-300 mb-1">World Seed</label>
            <input type="number" value={seed} onChange={e => setSeed(parseInt(e.target.value) || 0)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none" />
          </div>
          <div className="grid grid-cols-4 gap-2 mt-4">
            <FeatureCard icon="🏙️" label="8-12 Cities" />
            <FeatureCard icon="🏢" label="Rivals" />
            <FeatureCard icon="📦" label="Products" />
            <FeatureCard icon="🪙" label="Assets" />
          </div>
          <div className="text-xs text-gray-400 space-y-1 mt-4 bg-gray-900/50 rounded-lg p-3">
            <div><b>How to play:</b></div>
            <div>• Use the Build panel to place factories, stores, and rentals</div>
            <div>• Buildings must be placed near a city (within 18 tiles)</div>
            <div>• Set products on your factories/stores, then let supply chains form</div>
            <div>• Trade commodities and crypto in the Assets panel</div>
            <div>• Take loans to expand faster (with interest, of course)</div>
            <div>• Compete with 8+ AI rivals for market share</div>
          </div>
          <button onClick={onStart} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-lg transition-colors mt-4 text-lg">
            🚀 Start Game
          </button>
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="bg-gray-700/50 rounded-lg p-2 text-center">
      <div className="text-lg">{icon}</div>
      <div className="text-[10px] text-gray-400">{label}</div>
    </div>
  );
}

// ============= PANELS =============
function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-gray-700/50 rounded-lg px-2 py-1.5">
      <div className="text-[10px] text-gray-400">{label}</div>
      <div className={`text-sm font-bold ${color || 'text-white'}`}>{value}</div>
    </div>
  );
}

function DashboardPanel({ state, setState }: { state: GameState; setState: React.Dispatch<React.SetStateAction<GameState | null>> }) {
  const player = state.companies.find(c => c.isPlayer);
  if (!player) return null;
  const pb = state.buildings.filter(b => b.companyId === player.id);
  const totalRev = player.revenue * 24 * 30;
  const totalProfit = player.profit * 24 * 30;

  return (
    <div className="p-3 space-y-3">
      <h2 className="text-sm font-bold text-emerald-400 border-b border-gray-700 pb-1">📊 Dashboard</h2>

      <div className="grid grid-cols-2 gap-2">
        <StatCard label="Cash" value={`$${formatMoney(player.cash)}`} />
        <StatCard label="Net Worth" value={`$${formatMoney(state.player.netWorth)}`} />
        <StatCard label="Revenue/mo" value={`$${formatMoney(totalRev)}`} color={totalRev > 0 ? 'text-green-400' : ''} />
        <StatCard label="Profit/mo" value={`$${formatMoney(totalProfit)}`} color={totalProfit > 0 ? 'text-green-400' : 'text-red-400'} />
        <StatCard label="Buildings" value={String(pb.length)} />
        <StatCard label="Market Cap" value={`$${formatMoney(player.marketCap)}`} />
        <StatCard label="Share Price" value={`$${player.sharePrice.toFixed(2)}`} />
        <StatCard label="Bond Rating" value={player.bondRating} />
      </div>

      {/* Incoming Offers */}
      {state.incomingOffers.length > 0 && (
        <div className="bg-amber-900/30 border border-amber-700/50 rounded-lg p-2">
          <div className="text-xs font-bold text-amber-400 mb-1">💼 Buyout Offers ({state.incomingOffers.length})</div>
          <div className="space-y-2">
            {state.incomingOffers.map(offer => (
              <div key={offer.id} className="bg-gray-800/60 rounded p-2 text-xs">
                <div className="font-bold text-white">{offer.buildingName}</div>
                <div className="text-gray-400">{offer.buyerName} offers <b className="text-green-400">${formatMoney(offer.amount)}</b> (fair value ${formatMoney(offer.fairValue)})</div>
                <div className="text-[10px] text-gray-500 italic mt-1">{offer.rationale}</div>
                <div className="flex gap-1 mt-2">
                  <button onClick={() => setState(prev => prev ? acceptIncomingOffer(prev, offer.id) : null)}
                    className="flex-1 bg-emerald-700 hover:bg-emerald-600 py-1 rounded text-[10px]">Accept</button>
                  <button onClick={() => setState(prev => prev ? rejectIncomingOffer(prev, offer.id) : null)}
                    className="flex-1 bg-red-700 hover:bg-red-600 py-1 rounded text-[10px]">Reject</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {state.replayHistory.length > 1 && (
        <div className="bg-gray-700/50 rounded-lg p-2">
          <div className="text-xs text-gray-400 mb-1">Net Worth History</div>
          <MiniChart data={state.replayHistory.map(r => r.netWorth)} height={50} width={280} />
        </div>
      )}

      <div className="bg-gray-700/50 rounded-lg p-2">
        <div className="text-xs text-gray-400 mb-1">Your Buildings ({pb.length})</div>
        {pb.length === 0 ? (
          <p className="text-xs text-gray-500">No buildings yet. Use the Build panel!</p>
        ) : (
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {pb.map(b => {
              const cfg = BUILDING_CONFIGS[b.type];
              const city = state.cities.find(c => c.id === b.cityId);
              return (
                <button key={b.id}
                  onClick={() => setState(prev => prev ? { ...prev, selectedBuilding: b.id } : null)}
                  className="w-full flex items-center gap-2 text-xs bg-gray-700/50 hover:bg-gray-700 px-2 py-1 rounded text-left">
                  <span>{cfg?.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{b.name}</div>
                    <div className="text-[9px] text-gray-500">{city?.name} • Util {b.utilization.toFixed(0)}%</div>
                  </div>
                  <span className={b.profit > 0 ? 'text-green-400' : 'text-red-400'}>
                    ${formatMoney(b.profit * 24 * 30)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function BuildPanel({ onSelectType, playerCash }: { onSelectType: (t: BuildingType) => void; playerCash: number }) {
  const categories: Array<{ label: string; types: BuildingType[] }> = [
    { label: '🏭 Production', types: ['factory', 'farm', 'mine'] },
    { label: '🛍️ Retail', types: ['retail_store'] },
    { label: '🍽️ Hospitality', types: ['restaurant', 'fast_food', 'cafe', 'bar'] },
    { label: '🏢 Real Estate', types: ['apartment', 'commercial'] },
    { label: '📦 Logistics', types: ['warehouse'] },
    { label: '🏛️ Corporate', types: ['hq', 'rd_center'] },
  ];

  return (
    <div className="p-3 space-y-3">
      <h2 className="text-sm font-bold text-emerald-400 border-b border-gray-700 pb-1">🏗️ Build</h2>
      <p className="text-xs text-gray-400">
        Pick a building, then click a valid plot. Zoning matters: heavy industry
        is banned from residential and commercial districts.
      </p>

      {categories.map(cat => (
        <div key={cat.label}>
          <div className="text-xs font-bold text-gray-400 mb-1">{cat.label}</div>
          <div className="space-y-1">
            {cat.types.filter(t => BUILDABLE_TYPES.includes(t)).map(type => {
              const cfg = BUILDING_CONFIGS[type];
              if (!cfg) return null;
              const affordable = playerCash >= cfg.cost;
              return (
                <button key={type} onClick={() => affordable && onSelectType(type)} disabled={!affordable}
                  className={`w-full text-left px-2 py-1.5 rounded text-xs flex items-start gap-2 transition
                    ${affordable ? 'bg-gray-700 hover:bg-emerald-700/50' : 'bg-gray-800 opacity-50 cursor-not-allowed'}`}>
                  <span className="text-base mt-0.5">{cfg.icon}</span>
                  <div className="flex-1">
                    <div className="font-medium">{cfg.name}</div>
                    <div className="text-gray-400">from ${formatMoney(cfg.cost)} · {cfg.employees} staff</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">{cfg.blurb}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function ProductsPanel({ state }: { state: GameState }) {
  const categories = [...new Set(state.products.map(p => p.category))];
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <div className="p-3 space-y-2">
      <h2 className="text-sm font-bold text-emerald-400 border-b border-gray-700 pb-1">📦 Manufacturer&apos;s Guide</h2>
      <p className="text-[10px] text-gray-500">
        P/Q/B are the rating weights. A high B means brand carries the sale — advertise.
        A high Q means invest in R&D and better inputs. High necessity holds up in a recession.
      </p>
      {categories.map(cat => {
        const prods = state.products.filter(p => p.category === cat);
        const necessity = prods[0]?.demandIndex ?? 0;
        return (
          <div key={cat}>
            <button onClick={() => setExpanded(expanded === cat ? null : cat)}
              className="w-full text-left px-2 py-1 bg-gray-700/50 rounded text-xs font-medium flex justify-between items-center">
              <span>{prods[0]?.icon} {cat} ({prods.length})</span>
              <span className="flex gap-2 items-center">
                <span className={`text-[9px] ${necessity > 70 ? 'text-green-400' : necessity > 40 ? 'text-yellow-400' : 'text-red-400'}`}>
                  N{necessity}
                </span>
                <span>{expanded === cat ? '▼' : '▶'}</span>
              </span>
            </button>
            {expanded === cat && (
              <div className="space-y-1 mt-1 ml-2">
                {prods.map(p => (
                  <div key={p.id} className="bg-gray-700/30 rounded px-2 py-1 text-xs">
                    <div className="flex justify-between">
                      <span className="font-medium">{p.name}</span>
                      <span className="text-emerald-400">${p.currentPrice.toFixed(2)}</span>
                    </div>
                    <div className="flex gap-2 text-gray-400 text-[10px]">
                      <span>Q {p.quality.toFixed(0)}</span>
                      <span>Brand {p.brand.toFixed(0)}</span>
                      <span>★{p.reviewScore.toFixed(1)}</span>
                      <span className="px-1 rounded bg-gray-600">{p.segment}</span>
                    </div>
                    <div className="flex gap-1 mt-1 h-1.5 rounded overflow-hidden">
                      <div className="bg-blue-500" style={{ width: `${p.priceWeight}%` }} title={`Price ${p.priceWeight}%`} />
                      <div className="bg-emerald-500" style={{ width: `${p.qualityWeight}%` }} title={`Quality ${p.qualityWeight}%`} />
                      <div className="bg-purple-500" style={{ width: `${p.brandWeight}%` }} title={`Brand ${p.brandWeight}%`} />
                    </div>
                    <div className="text-[9px] text-gray-500">
                      Price {p.priceWeight} · Quality {p.qualityWeight} · Brand {p.brandWeight}
                    </div>
                    {p.inputs.length > 0 && (
                      <div className="text-[10px] text-gray-500 mt-0.5">
                        Inputs: {p.inputs.map(i => `${i.productName}×${i.quantity}`).join(', ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CompaniesPanel({ state }: { state: GameState }) {
  const sorted = [...state.companies].sort((a, b) => b.marketCap - a.marketCap);
  return (
    <div className="p-3 space-y-2">
      <h2 className="text-sm font-bold text-emerald-400 border-b border-gray-700 pb-1">🏢 Companies</h2>
      {sorted.map(c => (
        <div key={c.id} className="bg-gray-700/50 rounded-lg p-2 text-xs border-l-2" style={{ borderColor: c.color }}>
          <div className="flex justify-between items-center">
            <span className="font-bold">{c.name} {c.isPlayer ? '⭐' : ''}</span>
            <span className={`text-[10px] px-1 rounded ${c.isPlayer ? 'bg-emerald-700' : 'bg-gray-600'}`}>
              {c.isPlayer ? 'YOU' : SKILL_LABEL[c.skill] || c.skill}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-3 mt-1 text-gray-400">
            <span>Cash: ${formatMoney(c.cash)}</span>
            <span>MCap: ${formatMoney(c.marketCap)}</span>
            <span>Share: ${c.sharePrice.toFixed(2)}</span>
            <span>Rating: {c.bondRating}</span>
            <span>Buildings: {c.buildings.length}</span>
            <span>Strategy: {c.aiStrategy}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function EcoStat({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div className="bg-gray-700/30 px-2 py-1 rounded">
      <div className="text-[10px] text-gray-400">{label}</div>
      <div className={`font-bold ${good ? 'text-green-400' : 'text-red-400'}`}>{value}</div>
    </div>
  );
}

function EconomyPanel({ state }: { state: GameState }) {
  const eco = state.economy;
  const cycleColors: Record<string, string> = {
    boom: 'text-green-400', growth: 'text-emerald-400',
    recession: 'text-red-400', recovery: 'text-yellow-400',
  };
  return (
    <div className="p-3 space-y-3">
      <h2 className="text-sm font-bold text-emerald-400 border-b border-gray-700 pb-1">📉 Economy</h2>

      <div className="bg-gray-700/50 rounded-lg p-2">
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs font-bold">Business Cycle</span>
          <span className={`text-xs font-bold ${cycleColors[eco.cycle]}`}>{eco.cycle.toUpperCase()}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <EcoStat label="GDP Growth" value={`${eco.gdpGrowth.toFixed(2)}%`} good={eco.gdpGrowth > 0} />
          <EcoStat label="Inflation" value={`${eco.inflation.toFixed(2)}%`} good={eco.inflation < 4 && eco.inflation > 0} />
          <EcoStat label="Interest Rate" value={`${eco.interestRate.toFixed(2)}%`} good={eco.interestRate < 6} />
          <EcoStat label="Unemployment" value={`${eco.unemployment.toFixed(1)}%`} good={eco.unemployment < 6} />
          <EcoStat label="Consumer Conf" value={`${eco.consumerConfidence.toFixed(0)}`} good={eco.consumerConfidence > 55} />
          <EcoStat label="Business Conf" value={`${eco.businessConfidence.toFixed(0)}`} good={eco.businessConfidence > 55} />
          <EcoStat label="CPI" value={eco.cpi.toFixed(1)} good={true} />
          <EcoStat label="CB Credibility" value={`${(eco.cbCredibility * 100).toFixed(0)}%`} good={eco.cbCredibility > 0.6} />
        </div>
        <div className="mt-2 text-[10px] text-gray-400">
          Fed guidance: <span className={eco.forwardGuidance === 'hawkish' ? 'text-red-400' : eco.forwardGuidance === 'dovish' ? 'text-blue-400' : ''}>{eco.forwardGuidance}</span>
          {' • '}Diesel: <span className={eco.dieselPrice > 4.5 ? 'text-red-400' : 'text-white'}>${eco.dieselPrice.toFixed(2)}/gal</span>
          {eco.fuelShockMonths > 0 && <span className="text-red-400"> • ⚠️ Fuel crisis {eco.fuelShockMonths}mo left</span>}
        </div>
      </div>

      <div className="bg-gray-700/50 rounded-lg p-2">
        <div className="text-xs font-bold mb-1">Stock Market Index</div>
        <div className="text-lg font-bold text-emerald-400">{state.stockMarket.index.toFixed(0)}</div>
        <MiniChart data={state.stockMarket.indexHistory} color="#10b981" height={60} width={280} />
      </div>

      <div className="bg-gray-700/50 rounded-lg p-2">
        <div className="text-xs font-bold mb-1">Cities Overview</div>
        <div className="space-y-1 max-h-56 overflow-y-auto">
          {state.cities.map(city => (
            <div key={city.id} className="text-xs bg-gray-700/30 px-2 py-1 rounded">
              <div className="flex justify-between">
                <span className="font-medium">{city.name}</span>
                <span className="text-gray-400">{formatPopulation(city.population)}</span>
              </div>
              <div className="flex gap-2 text-[10px] text-gray-500 mt-0.5">
                <span>Wage ${city.wageRate.toFixed(1)}/hr</span>
                <span>Unemp {city.unemploymentRate.toFixed(1)}%</span>
                <span>QoL {city.qualityOfLife.toFixed(0)}</span>
                <span className={city.growthRate > 0 ? 'text-green-400' : 'text-red-400'}>Δ{city.growthRate.toFixed(1)}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MarketPanel({ state }: { state: GameState }) {
  return (
    <div className="p-3 space-y-3">
      <h2 className="text-sm font-bold text-emerald-400 border-b border-gray-700 pb-1">💹 Stock Market</h2>
      <div className="bg-gray-700/50 rounded-lg p-2">
        <div className="flex justify-between mb-1">
          <span className="text-xs">Market Index</span>
          <span className={`text-xs font-bold ${state.stockMarket.sentiment === 'bullish' ? 'text-green-400' : state.stockMarket.sentiment === 'bearish' ? 'text-red-400' : 'text-gray-300'}`}>
            {state.stockMarket.sentiment.toUpperCase()}
          </span>
        </div>
        <div className="text-2xl font-bold text-white">{state.stockMarket.index.toFixed(0)}</div>
        <MiniChart data={state.stockMarket.indexHistory} color="#10b981" height={80} width={280} />
      </div>
      <div className="text-xs font-bold text-gray-400">Share Prices</div>
      <div className="space-y-1">
        {[...state.companies].sort((a, b) => b.marketCap - a.marketCap).map(c => (
          <div key={c.id} className="flex items-center gap-2 bg-gray-700/30 px-2 py-1 rounded text-xs">
            <div className="w-2 h-2 rounded-full" style={{ background: c.color }} />
            <span className="flex-1 truncate">{c.name}{c.isPlayer ? ' ⭐' : ''}</span>
            <span className="font-mono">${c.sharePrice.toFixed(2)}</span>
            <span className="text-gray-400 w-16 text-right">${formatMoney(c.marketCap)}</span>
          </div>
        ))}
      </div>
      <div className="text-xs font-bold text-gray-400 mt-2">Recent News</div>
      <div className="space-y-1 max-h-40 overflow-y-auto">
        {state.stockMarket.ticker.slice(0, 12).map(n => (
          <div key={n.id} className={`text-xs px-2 py-1 rounded ${n.type === 'danger' || n.type === 'breaking' ? 'bg-red-900/30' : n.type === 'warning' ? 'bg-amber-900/30' : 'bg-gray-700/30'}`}>
            {n.text}
          </div>
        ))}
      </div>
    </div>
  );
}

function AssetsPanel({ state, setState }: { state: GameState; setState: React.Dispatch<React.SetStateAction<GameState | null>> }) {
  const [tradeModal, setTradeModal] = useState<{ asset: TradedAsset; mode: 'buy' | 'sell' } | null>(null);
  const [tradeAmount, setTradeAmount] = useState(1);
  const classes = ['commodity', 'metal', 'crypto', 'etf'] as const;
  const player = state.companies.find(c => c.isPlayer);
  const portfolioValue = state.tradedAssets.reduce((s, a) => s + a.price * a.playerHolding, 0);

  return (
    <div className="p-3 space-y-3">
      <h2 className="text-sm font-bold text-emerald-400 border-b border-gray-700 pb-1">🪙 Asset Market</h2>

      <div className="bg-gray-700/50 rounded-lg p-2 flex justify-between text-xs">
        <div><span className="text-gray-400">Cash: </span>${formatMoney(player?.cash || 0)}</div>
        <div><span className="text-gray-400">Portfolio: </span>${formatMoney(portfolioValue)}</div>
      </div>

      {classes.map(cls => {
        const assets = state.tradedAssets.filter(a => a.assetClass === cls);
        return (
          <div key={cls}>
            <div className="text-xs font-bold text-gray-400 mb-1 uppercase">{cls === 'etf' ? 'ETFs' : cls === 'crypto' ? 'Crypto' : cls === 'metal' ? 'Precious Metals' : 'Commodities'}</div>
            <div className="space-y-1">
              {assets.map(a => {
                const change = a.history.length > 1 ? (a.price / a.history[a.history.length - 2] - 1) * 100 : 0;
                return (
                  <div key={a.id} className="bg-gray-700/50 rounded p-2 text-xs">
                    <div className="flex justify-between items-center mb-1">
                      <div>
                        <span className="font-bold">{a.symbol}</span>
                        <span className="text-gray-400 ml-1">{a.name}</span>
                      </div>
                      <div className="text-right">
                        <div className="font-mono">${a.price >= 100 ? a.price.toFixed(0) : a.price.toFixed(2)}</div>
                        <div className={`text-[9px] ${change >= 0 ? 'text-green-400' : 'text-red-400'}`}>{change >= 0 ? '+' : ''}{change.toFixed(2)}%</div>
                      </div>
                    </div>
                    <MiniChart data={a.history} color={change >= 0 ? '#10b981' : '#ef4444'} height={24} width={280} />
                    {a.playerHolding > 0 && (
                      <div className="text-[10px] text-emerald-400 mt-1">
                        You own: {a.playerHolding.toFixed(4)} {a.unit} (basis ${a.playerCostBasis.toFixed(2)}) — worth ${formatMoney(a.price * a.playerHolding)}
                      </div>
                    )}
                    <div className="flex gap-1 mt-1">
                      <button onClick={() => { setTradeModal({ asset: a, mode: 'buy' }); setTradeAmount(1); }}
                        className="flex-1 bg-emerald-700 hover:bg-emerald-600 py-0.5 rounded text-[10px]">Buy</button>
                      <button onClick={() => { setTradeModal({ asset: a, mode: 'sell' }); setTradeAmount(a.playerHolding); }}
                        disabled={a.playerHolding <= 0}
                        className="flex-1 bg-red-700 hover:bg-red-600 disabled:opacity-40 py-0.5 rounded text-[10px]">Sell</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {tradeModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setTradeModal(null)}>
          <div className="bg-gray-800 border border-gray-600 rounded-xl p-5 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-1">{tradeModal.mode === 'buy' ? 'Buy' : 'Sell'} {tradeModal.asset.name}</h3>
            <div className="text-xs text-gray-400 mb-3">Price: ${tradeModal.asset.price.toFixed(2)} / {tradeModal.asset.unit}</div>
            <label className="block text-xs text-gray-300 mb-1">Amount ({tradeModal.asset.unit})</label>
            <input type="number" min={0} step="0.01" value={tradeAmount}
              onChange={e => setTradeAmount(parseFloat(e.target.value) || 0)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white outline-none" />
            <div className="text-sm mt-2 text-emerald-400">Total: ${formatMoney(tradeAmount * tradeModal.asset.price)}</div>
            {tradeModal.mode === 'sell' && <div className="text-xs text-gray-400 mt-1">You own: {tradeModal.asset.playerHolding.toFixed(4)}</div>}
            <div className="flex gap-2 mt-4">
              <button onClick={() => {
                setState(prev => prev ? (tradeModal.mode === 'buy'
                  ? buyAsset(prev, tradeModal.asset.id, tradeAmount)
                  : sellAsset(prev, tradeModal.asset.id, tradeAmount)) : null);
                setTradeModal(null);
              }} className={`flex-1 py-2 rounded font-bold ${tradeModal.mode === 'buy' ? 'bg-emerald-600' : 'bg-red-600'}`}>
                {tradeModal.mode === 'buy' ? 'Confirm Buy' : 'Confirm Sell'}
              </button>
              <button onClick={() => setTradeModal(null)} className="px-4 py-2 bg-gray-600 rounded">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LoansPanel({ state, setState }: { state: GameState; setState: React.Dispatch<React.SetStateAction<GameState | null>> }) {
  const [amount, setAmount] = useState(1_000_000);
  const [term, setTerm] = useState(60);
  const player = state.companies.find(c => c.isPlayer);
  if (!player) return null;
  const rate = state.economy.interestRate + 2.5;
  const monthlyRate = rate / 100 / 12;
  const payment = amount * monthlyRate / (1 - Math.pow(1 + monthlyRate, -term));

  return (
    <div className="p-3 space-y-3">
      <h2 className="text-sm font-bold text-emerald-400 border-b border-gray-700 pb-1">🏦 Financing</h2>

      <div className="bg-gray-700/50 rounded-lg p-3">
        <div className="grid grid-cols-2 gap-2 text-xs mb-3">
          <StatCard label="Total Debt" value={`$${formatMoney(player.debt)}`} color={player.debt > 0 ? 'text-orange-400' : 'text-green-400'} />
          <StatCard label="Cash" value={`$${formatMoney(player.cash)}`} />
          <StatCard label="Total Assets" value={`$${formatMoney(player.totalAssets)}`} />
          <StatCard label="Debt/Assets" value={`${player.totalAssets > 0 ? ((player.debt / player.totalAssets) * 100).toFixed(1) : '0'}%`} />
        </div>

        <div className="border-t border-gray-600 pt-3">
          <div className="text-xs font-bold mb-2">Take New Loan</div>
          <label className="block text-[10px] text-gray-400 mb-0.5">Amount: ${formatMoney(amount)}</label>
          <input type="range" min={100000} max={50000000} step={100000} value={amount}
            onChange={e => setAmount(parseInt(e.target.value))} className="w-full" />
          <label className="block text-[10px] text-gray-400 mt-2 mb-0.5">Term: {term} months ({(term / 12).toFixed(1)} years)</label>
          <input type="range" min={12} max={240} step={12} value={term}
            onChange={e => setTerm(parseInt(e.target.value))} className="w-full" />
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
            <div className="bg-gray-800 rounded px-2 py-1">
              <div className="text-[10px] text-gray-400">Interest Rate</div>
              <div className="font-bold text-white">{rate.toFixed(2)}%</div>
            </div>
            <div className="bg-gray-800 rounded px-2 py-1">
              <div className="text-[10px] text-gray-400">Monthly Payment</div>
              <div className="font-bold text-white">${formatMoney(payment)}</div>
            </div>
          </div>
          <button onClick={() => setState(prev => prev ? takeLoan(prev, amount, term) : null)}
            className="w-full mt-3 bg-emerald-600 hover:bg-emerald-500 py-2 rounded text-sm font-bold">
            Borrow ${formatMoney(amount)}
          </button>
        </div>
      </div>

      <div className="bg-gray-700/50 rounded-lg p-3">
        <div className="text-xs font-bold mb-2">Active Loans ({state.loans.length})</div>
        {state.loans.length === 0 ? (
          <p className="text-xs text-gray-500">No active loans.</p>
        ) : (
          <div className="space-y-2">
            {state.loans.map(l => (
              <div key={l.id} className="bg-gray-800 rounded p-2 text-xs">
                <div className="flex justify-between">
                  <span>Balance: <b>${formatMoney(l.amount)}</b></span>
                  <span className="text-gray-400">{l.monthsRemaining}mo left</span>
                </div>
                <div className="text-[10px] text-gray-500">
                  {l.interestRate.toFixed(2)}% APR • ${formatMoney(l.monthlyPayment)}/mo
                </div>
                <button onClick={() => setState(prev => prev ? repayLoan(prev, l.id) : null)}
                  className="w-full mt-1 bg-gray-600 hover:bg-gray-500 py-0.5 rounded text-[10px]">
                  Pay off ${formatMoney(l.amount)}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BuildingDetailPanel({ state, building, onClose, setState }: {
  state: GameState;
  building: Building;
  onClose: () => void;
  setState: React.Dispatch<React.SetStateAction<GameState | null>>;
}) {
  const [offerOverride, setOfferOverride] = useState<number | null>(null);
  const [tab, setTab] = useState<'overview' | 'products' | 'supply'>('overview');
  const company = state.companies.find(c => c.id === building.companyId);
  const isOwned = company?.isPlayer;
  const cfg = BUILDING_CONFIGS[building.type];
  const city = state.cities.find(c => c.id === building.cityId);
  const askingPrice = !isOwned && building.companyId !== 'system'
    ? getAskingPrice(state, building.id) : null;
  const eligible = eligibleProductsFor(building, state.products);
  const venue = isHospitality(building.type);
  const isRetail = building.type === 'retail_store';
  const isProducer = ['factory', 'farm', 'mine'].includes(building.type);

  // Default the bid to 90% of fair value; the slider overrides it.
  const offerAmount = offerOverride ?? Math.round((askingPrice ?? 0) * 0.9);

  const stocked = building.products
    .map(id => state.products.find(p => p.id === id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  return (
    <div className="w-80 bg-gray-800/95 border-l border-gray-700 overflow-y-auto shrink-0">
      <div className="p-3 space-y-3">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-sm font-bold flex items-center gap-1">
              <span>{cfg?.icon}</span>{building.name}
            </h2>
            <div className="text-xs text-gray-400">
              Lv {building.level}/{building.maxLevel} · {city?.name}
              {building.specialisation && <span className="text-emerald-400"> · {building.specialisation}</span>}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
        </div>

        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ background: company?.color ?? '#0284c7' }} />
          <span className="text-xs">{company?.name ?? 'Public Infrastructure'}</span>
          {isOwned && <span className="text-[10px] bg-emerald-700 px-1 rounded">YOURS</span>}
          {building.type === 'seaport' && (
            <span className="text-[10px] bg-sky-700 px-1 rounded">
              {building.portKind === 'industrial' ? 'INDUSTRIAL' : 'COMMERCIAL'}
            </span>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 text-[10px]">
          {(['overview', 'products', 'supply'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-1 rounded capitalize ${tab === t ? 'bg-emerald-700' : 'bg-gray-700'}`}>
              {t === 'products' ? (venue ? 'menu' : 'products') : t}
            </button>
          ))}
        </div>

        {tab === 'overview' && (
          <>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <StatCard label="Revenue/mo" value={`$${formatMoney(building.revenue * 24 * 30)}`} color={building.revenue > 0 ? 'text-green-400' : ''} />
              <StatCard label="COGS/mo" value={`$${formatMoney(building.cogs * 24 * 30)}`} color="text-orange-400" />
              <StatCard label="Opex/mo" value={`$${formatMoney(building.operatingCost * 24 * 30)}`} color="text-red-400" />
              <StatCard label="Profit/mo" value={`$${formatMoney(building.profit * 24 * 30)}`} color={building.profit > 0 ? 'text-green-400' : 'text-red-400'} />
              <StatCard label="Utilization" value={`${building.utilization.toFixed(0)}%`} />
              <StatCard label="Employees" value={String(building.employees)} />
              <StatCard label="Training" value={`Lv ${building.trainingLevel}/9`} />
              <StatCard label="Morale" value={`${building.employeeSatisfaction.toFixed(0)}%`} />
              {(isRetail || venue) && <StatCard label="Traffic" value={`${building.customerTraffic.toFixed(0)}`} />}
              {isRetail && <StatCard label="Chain Bonus" value={'★'.repeat(Math.min(5, Math.round(building.chainBonus * 2.2)))} color="text-amber-400" />}
              {(building.type === 'apartment' || building.type === 'commercial') && (
                <>
                  <StatCard label="Occupancy" value={`${building.occupancy.toFixed(0)}%`} />
                  <StatCard label="Rent/unit" value={`$${building.rentPerUnit.toFixed(0)}`} />
                </>
              )}
              {building.type === 'mine' && building.resourceMax > 0 && (
                <StatCard label="Reserve"
                  value={`${((building.resourceRemaining / building.resourceMax) * 100).toFixed(0)}%`}
                  color={building.resourceRemaining / building.resourceMax < 0.2 ? 'text-red-400' : ''} />
              )}
            </div>

            {/* Supply vs demand bar — the right-sizing indicator */}
            {(building.supply > 0 || building.demand > 0) && (
              <div className="bg-gray-700/50 rounded-lg p-2">
                <div className="text-[10px] text-gray-400 mb-1">Supply vs Demand</div>
                {(() => {
                  const max = Math.max(building.supply, building.demand, 1);
                  return (
                    <>
                      <div className="flex items-center gap-1 mb-0.5">
                        <span className="text-[9px] w-12 text-yellow-400">Supply</span>
                        <div className="flex-1 h-2 bg-gray-800 rounded">
                          <div className="h-2 bg-yellow-500 rounded" style={{ width: `${(building.supply / max) * 100}%` }} />
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] w-12 text-orange-400">Demand</span>
                        <div className="flex-1 h-2 bg-gray-800 rounded">
                          <div className="h-2 bg-orange-500 rounded" style={{ width: `${(building.demand / max) * 100}%` }} />
                        </div>
                      </div>
                      <div className="text-[9px] text-gray-500 mt-1">
                        {building.supply > building.demand * 1.6
                          ? 'Oversupplied — this site or its suppliers may be too large.'
                          : building.demand > building.supply * 1.6
                            ? 'Undersupplied — sales are being lost to empty shelves.'
                            : 'Balanced.'}
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            {isOwned && (
              <div className="space-y-2">
                {(isRetail || venue) && (
                  <div>
                    <div className="text-xs font-bold text-gray-400 mb-1">
                      Price Level: {(building.pricingMultiplier * 100).toFixed(0)}%
                    </div>
                    <input type="range" min={0.55} max={1.8} step={0.01} value={building.pricingMultiplier}
                      onChange={e => setState(prev => prev ? setBuildingPrice(prev, building.id, parseFloat(e.target.value)) : null)}
                      className="w-full" />
                  </div>
                )}
                {(isRetail || venue) && (
                  <div>
                    <div className="text-xs font-bold text-gray-400 mb-1">Ad Budget: ${formatMoney(building.adBudget)}/mo</div>
                    <input type="range" min={0} max={150000} step={1000} value={building.adBudget}
                      onChange={e => setState(prev => prev ? setAdBudget(prev, building.id, parseInt(e.target.value)) : null)}
                      className="w-full" />
                  </div>
                )}
                {isProducer && (
                  <button onClick={() => setState(prev => prev ? toggleInternalSale(prev, building.id) : null)}
                    className={`w-full py-1.5 rounded text-xs ${building.internalSale ? 'bg-amber-700' : 'bg-gray-700'}`}>
                    {building.internalSale ? '🔒 Internal Sale ON — rivals cut off' : '🔓 Selling on open market'}
                  </button>
                )}
                <div className="flex gap-2">
                  <button onClick={() => setState(prev => prev ? upgradeBuilding(prev, building.id) : null)}
                    disabled={building.level >= building.maxLevel}
                    className="flex-1 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 px-2 py-1.5 rounded text-xs">
                    ⬆ Upgrade ${formatMoney(building.constructionCost * 0.3 * building.level)}
                  </button>
                  <button onClick={() => setState(prev => prev ? sellBuilding(prev, building.id) : null)}
                    className="flex-1 bg-red-700 hover:bg-red-600 px-2 py-1.5 rounded text-xs">💰 Sell</button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── PRODUCTS / MENU TAB ── */}
        {tab === 'products' && (
          <>
            {venue && (
              <div className="space-y-2">
                <div className="text-xs text-gray-400">
                  Menu board — {building.menu.filter(m => m.enabled).length} of {building.menu.length} lines live.
                  Covers split across enabled lines by popularity.
                </div>
                {building.menu.map(item => {
                  const cost = item.foodCost + (item.includesToy ? KIDS_TOY_COST : 0);
                  const price = item.price * building.pricingMultiplier;
                  const margin = ((price - cost) / Math.max(0.01, price)) * 100;
                  return (
                    <div key={item.id} className={`rounded p-2 text-xs ${item.enabled ? 'bg-gray-700/60' : 'bg-gray-800/60 opacity-60'}`}>
                      <div className="flex justify-between items-center">
                        <span className="font-medium">
                          {item.name}
                          {item.includesToy && <span title="Includes licensed toy"> 🧸</span>}
                        </span>
                        <button onClick={() => setState(prev => prev ? toggleMenuItem(prev, building.id, item.id) : null)}
                          className={`text-[9px] px-1.5 py-0.5 rounded ${item.enabled ? 'bg-emerald-700' : 'bg-gray-600'}`}>
                          {item.enabled ? 'ON' : 'OFF'}
                        </button>
                      </div>
                      <div className="flex gap-2 text-[10px] text-gray-400 mt-0.5">
                        <span className="capitalize bg-gray-600 px-1 rounded">{item.category}</span>
                        <span>cost ${cost.toFixed(2)}</span>
                        <span className={margin > 60 ? 'text-green-400' : margin > 35 ? 'text-yellow-400' : 'text-red-400'}>
                          {margin.toFixed(0)}% GM
                        </span>
                        <span>{(item.popularity * 100).toFixed(0)}% mix</span>
                      </div>
                      {isOwned && (
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-gray-400">${item.price.toFixed(2)}</span>
                          <input type="range" min={0.5} max={item.foodCost * 8 + 10} step={0.25} value={item.price}
                            onChange={e => setState(prev => prev ? setMenuItemPrice(prev, building.id, item.id, parseFloat(e.target.value)) : null)}
                            className="flex-1" />
                        </div>
                      )}
                    </div>
                  );
                })}
                <div className="bg-gray-700/40 rounded p-2 text-[10px] text-gray-400">
                  This kitchen consumes bulk ingredients only
                  ({stocked.map(p => p.name).join(', ') || 'none sourced yet'}).
                  It cannot stock retail goods.
                </div>
              </div>
            )}

            {isRetail && (
              <div className="space-y-2">
                {isOwned && (
                  <div>
                    <div className="text-xs font-bold text-gray-400 mb-1">Store Specialisation</div>
                    <select value={building.specialisation ?? ''}
                      onChange={e => setState(prev => prev ? setRetailSpecialisation(prev, building.id, e.target.value || null) : null)}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white">
                      <option value="">General Merchandise (no bonus)</option>
                      {RETAIL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <div className="text-[10px] text-gray-500 mt-1">
                      Specialty stores earn an 18% demand bonus but may only stock their own category.
                    </div>
                  </div>
                )}
                <div className="text-xs font-bold text-gray-400">
                  Shelf ({building.products.length}/{building.productSlots} slots)
                </div>
                {stocked.map(p => {
                  const rating = productRating(p, building.pricingMultiplier);
                  return (
                    <div key={p.id} className="bg-gray-700/60 rounded p-2 text-xs">
                      <div className="flex justify-between items-center">
                        <span>{p.icon} {p.name}</span>
                        {isOwned && (
                          <button onClick={() => setState(prev => prev ? removeRetailLine(prev, building.id, p.id) : null)}
                            className="text-[9px] bg-red-800 px-1.5 py-0.5 rounded">Remove</button>
                        )}
                      </div>
                      <div className="flex gap-2 text-[10px] text-gray-400 mt-0.5">
                        <span>${(p.currentPrice * building.pricingMultiplier).toFixed(2)}</span>
                        <span>stock {(building.inventory[p.id] || 0).toFixed(0)}</span>
                        <span className={rating > 55 ? 'text-green-400' : rating > 35 ? 'text-yellow-400' : 'text-red-400'}>
                          rating {rating.toFixed(0)}
                        </span>
                      </div>
                      <div className="flex gap-1 text-[9px] text-gray-500 mt-0.5">
                        <span>P{p.priceWeight}</span><span>Q{p.qualityWeight}</span><span>B{p.brandWeight}</span>
                        <span className="ml-auto">★{p.reviewScore.toFixed(1)}</span>
                      </div>
                    </div>
                  );
                })}
                {isOwned && building.products.length < building.productSlots && (
                  <select value="" onChange={e => e.target.value && setState(prev => prev ? addRetailLine(prev, building.id, e.target.value) : null)}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white">
                    <option value="">+ Add product line…</option>
                    {eligible.filter(p => !building.products.includes(p.id)).map(p => (
                      <option key={p.id} value={p.id}>{p.icon} {p.name} — ${p.currentPrice.toFixed(2)}</option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {(isProducer || building.type === 'warehouse') && (
              <div className="space-y-2">
                <div className="text-xs font-bold text-gray-400">Output</div>
                {isOwned ? (
                  <select value={building.productId ?? ''}
                    onChange={e => setState(prev => prev ? setBuildingProduct(prev, building.id, e.target.value) : null)}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white">
                    <option value="">— Select —</option>
                    {eligible.map(p => <option key={p.id} value={p.id}>{p.icon} {p.name}</option>)}
                  </select>
                ) : (
                  <div className="text-xs">{stocked.map(p => `${p.icon} ${p.name}`).join(', ') || '—'}</div>
                )}
                {building.type === 'mine' && (
                  <div className="text-[10px] text-gray-500">
                    A mine can only extract the deposit beneath it
                    {building.resourceType ? ` (${building.resourceType})` : ''}. Quality is fixed by geology.
                  </div>
                )}
                {building.type === 'farm' && (
                  <div className="text-[10px] text-gray-500">
                    Farm quality rises with training — currently capped at
                    {' '}{(30 + building.trainingLevel * 7.8).toFixed(0)}/100.
                  </div>
                )}
                {building.productId && (() => {
                  const p = state.products.find(x => x.id === building.productId);
                  if (!p || p.inputs.length === 0) return null;
                  return (
                    <div className="bg-gray-700/40 rounded p-2">
                      <div className="text-[10px] text-gray-400 mb-1">Inputs required per unit</div>
                      {p.inputs.map(i => {
                        const held = building.inventory[i.productId] || 0;
                        return (
                          <div key={i.productId} className="flex justify-between text-[10px]">
                            <span>{i.productName} ×{i.quantity}</span>
                            <span className={held > 5 ? 'text-green-400' : 'text-red-400'}>{held.toFixed(0)} on hand</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}

            {building.type === 'seaport' && (
              <div className="space-y-1">
                <div className="text-[10px] text-gray-400">
                  Imports available here. Buying from a port saves you building the whole upstream chain.
                </div>
                {stocked.map(p => (
                  <div key={p.id} className="flex justify-between bg-gray-700/50 rounded px-2 py-1 text-xs">
                    <span>{p.icon} {p.name}</span>
                    <span className="text-emerald-400">${(p.productionCost * 1.28).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── SUPPLY TAB ── */}
        {tab === 'supply' && (
          <div className="space-y-2">
            <div className="text-xs font-bold text-gray-400">Landed Cost Breakdown</div>
            {building.supplierLinks.length === 0 ? (
              <p className="text-xs text-gray-500">
                No active supply contracts. Sourcing runs monthly and picks the lowest landed cost.
              </p>
            ) : building.supplierLinks.map(link => {
              const p = state.products.find(x => x.id === link.productId);
              const sup = state.buildings.find(b => b.id === link.supplierBuildingId);
              const supCity = state.cities.find(c => c.id === sup?.cityId);
              const supCo = state.companies.find(c => c.id === sup?.companyId);
              return (
                <div key={link.productId} className="bg-gray-700/60 rounded p-2 text-xs">
                  <div className="font-medium">{p?.icon} {p?.name}</div>
                  <div className="text-[10px] text-gray-400">
                    from {sup?.name} · {supCity?.name} · {supCo?.name ?? 'Seaport'}
                  </div>
                  <div className="grid grid-cols-3 gap-1 mt-1 text-[10px]">
                    <div className="bg-gray-800 rounded px-1 py-0.5">
                      <div className="text-gray-500">Purchase</div>
                      <div>${link.pricePerUnit.toFixed(2)}</div>
                    </div>
                    <div className="bg-gray-800 rounded px-1 py-0.5">
                      <div className="text-gray-500">Freight</div>
                      <div className={link.freightPerUnit > link.pricePerUnit * 0.25 ? 'text-red-400' : ''}>
                        ${link.freightPerUnit.toFixed(2)}
                      </div>
                    </div>
                    <div className="bg-gray-800 rounded px-1 py-0.5">
                      <div className="text-gray-500">Quality</div>
                      <div>{link.quality.toFixed(0)}</div>
                    </div>
                  </div>
                  <div className="text-[10px] text-gray-400 mt-1">
                    Landed: <b className="text-white">${(link.pricePerUnit + link.freightPerUnit).toFixed(2)}</b>/unit
                  </div>
                </div>
              );
            })}
            {building.freightCost > 0 && (
              <div className="text-[10px] text-gray-500">
                Total freight ${building.freightCost.toFixed(2)}/unit. Cluster plants and sit near a
                seaport to cut this — distance and diesel are the whole cost.
              </div>
            )}
            {Object.values(building.inventory).some(v => v > 0) && (
              <>
                <div className="text-xs font-bold text-gray-400 mt-2">Inventory</div>
                <div className="space-y-0.5 max-h-40 overflow-y-auto">
                  {Object.entries(building.inventory).filter(([, q]) => q > 0).map(([pid, qty]) => {
                    const prod = state.products.find(p => p.id === pid);
                    return (
                      <div key={pid} className="flex justify-between text-xs bg-gray-700/40 px-2 py-0.5 rounded">
                        <span>{prod?.name ?? '?'}</span>
                        <span className="text-gray-400">{qty.toFixed(0)}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* Acquisition */}
        {!isOwned && askingPrice !== null && (
          <div className="bg-amber-900/20 border border-amber-700/40 rounded-lg p-2 space-y-2">
            <div className="text-xs font-bold text-amber-400">🤝 Make an Offer</div>
            <div className="text-xs text-gray-300">Estimated fair value: <b>${formatMoney(askingPrice)}</b></div>
            <label className="block text-[10px] text-gray-400">Your offer: ${formatMoney(offerAmount)}</label>
            <input type="range" min={Math.round(askingPrice * 0.4)} max={Math.round(askingPrice * 1.3)} step={50000}
              value={offerAmount} onChange={e => setOfferOverride(parseInt(e.target.value))} className="w-full" />
            <div className="text-[10px] text-gray-500">
              {offerAmount < askingPrice * 0.55 ? '⚠ Below 55% ends talks for 3 months'
                : offerAmount < askingPrice ? '↔ Likely to be countered' : '✓ Likely to be accepted'}
            </div>
            <button onClick={() => setState(prev => prev ? makePurchaseOffer(prev, building.id, offerAmount) : null)}
              className="w-full bg-emerald-600 hover:bg-emerald-500 py-1.5 rounded text-xs font-bold">
              Submit Offer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
