'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { GameState, IsometricTile, BuildingType, OverlayMode, TradedAsset, Building, MovingEntity } from '@/game/types';
import {
  createNewGame, simulateTick, generateMap, placeBuilding, setBuildingProduct,
  upgradeBuilding, listBuildingForSale, cancelBuildingSale, demolishBuilding, formatMoney, formatPopulation,
  setBuildingPrice, setAdBudget, takeLoan, repayLoan,
  buyAsset, sellAsset, getAskingPrice, makePurchaseOffer,
  acceptIncomingOffer, rejectIncomingOffer, clearLastOffer,
  checkBuildable, generateEntities, updateEntities,
  eligibleProductsFor, addRetailLine, removeRetailLine, setRetailSpecialisation,
  setMenuItemPrice, toggleMenuItem, toggleInternalSale, productRating,
  startResearch, setProductionIntensity, setSafetyStockPolicy, autoSourceBuilding,
  marketImpact, TRANSACTION_FEE, monthlyRunRate, setRentMultiplier,
  hireStaff, layOffStaff, hireBuildingEmployee, getSupplyContractOffers,
  signSupplyContract, terminateSupplyContract, setSupplyMode, setFarmIrrigation,
  setSellPrice, toggleOpenMarketSales, buyCompanyShares, sellCompanyShares,
  issueOwnShares, buyListedBuilding, leaseBuilding, repairBuilding,
  setLivestockBreed, setFeedQuality, setVetProgram, setProductTier,
  investFarmResearch, upgradeFarmEquipment,
  buyLandTile, sellLandHolding, getLandPurchasePrice, buyCompetitorIntel,
} from '@/game/engine';
import { LIVESTOCK_BREEDS, PRODUCT_TIERS } from '@/game/constants';
import {
  BUILDING_CONFIGS, SKILL_LABEL, BUILDABLE_TYPES, RETAIL_CATEGORIES,
  isHospitality, KIDS_TOY_COST,
} from '@/game/constants';
import {
  buyBond, sellBond, issueBond, computeYieldCurve, personalIncomeTax,
} from '@/game/engine';

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
    const playerId = st.companies.find(company => company.isPlayer)?.id;
    const playerLand = new Set(st.landHoldings
      .filter(holding => holding.ownerId === playerId)
      .map(holding => `${holding.x},${holding.y}`));

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

        ctx.strokeStyle = playerLand.has(`${x},${y}`)
          ? 'rgba(251,191,36,0.95)'
          : tile.highway ? 'rgba(250,204,21,0.25)' : 'rgba(0,0,0,0.07)';
        ctx.lineWidth = playerLand.has(`${x},${y}`) ? Math.max(1.5, 2 * zoom)
          : tile.highway ? 1 : 0.5;
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
        // ── Neighbour-select fix ──
        // For each building, project its world-centre to screen-space. The
        // user sees the BUILDING RECT, so the check must be in screen space:
        // click hits whichever rectangle is visually under the cursor.
        // Multiple hits (overlapping on-screen) → preferred: larger footprint,
        // then closest to the cursor. This stops 'clicks a bigger smokestack,
        // selects the tiny cafe next door' because centres are interleaved.
        const canvas = canvasRef.current!;
        const rect = canvas.getBoundingClientRect();
        const clickSx = e.clientX - rect.left;
        const clickSy = e.clientY - rect.top;
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const zoom = camera.zoom;
        const candidates: Array<{ b: typeof state.buildings[0], dist: number }> = [];
        for (const b of state.buildings) {
          // World→screen isometric projection (must mirror the draw call).
          const isoX = (b.x - camera.x - (b.y - camera.y)) * TILE_W / 2;
          const isoY = (b.x - camera.x + (b.y - camera.y)) * TILE_H / 2;
          const sx = cx + isoX * zoom;
          const sy = cy + isoY * zoom;
          const cfg = BUILDING_CONFIGS[b.type];
          const bw = (cfg?.w || 2) * TILE_W * zoom * 0.34;
          const bh = ((cfg?.h || 2) * TILE_H * 1.15 + b.level * 3) * zoom;
          // Screen-space rect for the building column.
          const inX = clickSx >= sx - bw / 2 && clickSx <= sx + bw / 2;
          const inY = clickSy >= sy - bh && clickSy <= sy;
          if (inX && inY) {
            candidates.push({ b, dist: Math.hypot(clickSx - sx, clickSy - sy) });
          }
        }
        candidates.sort((a, b) => b.b.width * b.b.height - a.b.width * a.b.height);
        candidates.sort((a, b) => a.dist - b.dist);
        const clicked = candidates[0]?.b;
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
type PanelType = 'dashboard' | 'build' | 'land' | 'products' | 'companies' | 'economy' | 'market' | 'assets' | 'loans' | 'bonds';

export default function GamePage() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [tiles, setTiles] = useState<IsometricTile[][] | null>(null);
  const [placementMode, setPlacementMode] = useState<BuildingType | null>(null);
  const [landPurchaseMode, setLandPurchaseMode] = useState(false);
  const [activePanel, setActivePanel] = useState<PanelType | null>('dashboard');
  const [showStartScreen, setShowStartScreen] = useState(true);
  const [playerName, setPlayerName] = useState('Your Corporation');
  const [playerColor, setPlayerColor] = useState('#10b981');
  const [gameSeed, setGameSeed] = useState(1337);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const entitiesRef = useRef<MovingEntity[]>([]);

  const startGame = useCallback(() => {
    const state = createNewGame(gameSeed, playerName, playerColor);
    const map = generateMap(state);
    entitiesRef.current = generateEntities(state);
    setGameState(state);
    setTiles(map);
    setShowStartScreen(false);
  }, [gameSeed, playerName, playerColor]);

  useEffect(() => {
    if (!gameState || gameState.paused) {
      if (tickRef.current) clearInterval(tickRef.current);
      return;
    }
    const interval = Math.max(16, 1000 / gameState.speed);
    tickRef.current = setInterval(() => {
      setGameState(prev => prev ? simulateTick(prev) : null);
    }, interval);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
    // Only the pause flag and speed should restart the loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState?.paused, gameState?.speed, gameState === null]);

  const handleTileClick = useCallback((x: number, y: number) => {
    if (!gameState || !tiles) return;
    if (landPurchaseMode) {
      setGameState(buyLandTile(gameState, tiles, x, y));
      setLandPurchaseMode(false);
      return;
    }
    if (!placementMode) return;
    setGameState(placeBuilding(gameState, placementMode, x, y, tiles));
    setPlacementMode(null);
  }, [gameState, placementMode, landPurchaseMode, tiles]);

  const handleBuildingClick = useCallback((id: string) => {
    setGameState(prev => prev ? { ...prev, selectedBuilding: prev.selectedBuilding === id ? null : id } : null);
  }, []);

  const handleCameraChange = useCallback((cam: { x: number; y: number; zoom: number }) => {
    setGameState(prev => prev ? { ...prev, camera: cam } : null);
  }, []);

  if (showStartScreen) {
    return <StartScreen playerName={playerName} setPlayerName={setPlayerName} playerColor={playerColor} setPlayerColor={setPlayerColor} seed={gameSeed} setSeed={setGameSeed} onStart={startGame} />;
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
          <span className={`${monthlyRunRate(player?.dailyProfit || 0, player?.profit || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            P/L: ${formatMoney(monthlyRunRate(player?.dailyProfit || 0, player?.profit || 0))}/mo
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
            ['dashboard', '📊'], ['build', '🏗️'], ['land', '🧭'], ['products', '📦'],
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
            {activePanel === 'build' && <BuildPanel onSelectType={(t) => { setPlacementMode(t); setLandPurchaseMode(false); setActivePanel(null); }} playerCash={player?.cash || 0} />}
            {activePanel === 'land' && <LandPanel state={gameState} setState={setGameState}
              onBuyMode={() => { setLandPurchaseMode(true); setPlacementMode(null); setActivePanel(null); }} />}
            {activePanel === 'products' && <ProductsPanel state={gameState} />}
            {activePanel === 'companies' && <CompaniesPanel state={gameState} />}
            {activePanel === 'economy' && <EconomyPanel state={gameState} />}
            {activePanel === 'market' && <MarketPanel state={gameState} setState={setGameState} />}
            {activePanel === 'assets' && <AssetsPanel state={gameState} setState={setGameState} />}
            {activePanel === 'loans' && <LoansPanel state={gameState} setState={setGameState} />}
            {activePanel === 'bonds' && <BondsPanel state={gameState} setState={setGameState} />}
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

          {landPurchaseMode && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-gray-800/95 border border-amber-500 px-4 py-2 rounded-lg text-sm shadow-xl">
              <div className="flex gap-3 items-center">
                <span>🧭 Click a non-road tile to buy its land and development rights</span>
                <button onClick={() => setLandPurchaseMode(false)} className="bg-red-600 px-2 py-0.5 rounded text-xs">Cancel</button>
              </div>
            </div>
          )}

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

      {/* Toast Notifications — auto-dismiss after 10 seconds */}
      <ToastStack notifications={gameState.notifications} />
    </div>
  );
}

// ============= TOAST STACK (auto-dismiss after 10s) =============
function Toast({ n }: { n: GameState['notifications'][number] }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const hide = setTimeout(() => setVisible(false), 9600); // begin fade
    const remove = setTimeout(() => setVisible(false), 10_000);
    return () => { clearTimeout(hide); clearTimeout(remove); };
  }, []);
  if (!visible) return null;
  return (
    <div
      style={{ transition: 'opacity 0.4s' }}
      className={`px-3 py-1.5 rounded text-xs shadow-lg pointer-events-auto
        ${n.type === 'success' ? 'bg-emerald-800' : n.type === 'warning' ? 'bg-amber-800' : n.type === 'danger' ? 'bg-red-800' : 'bg-gray-700'}`}>
      {n.message}
    </div>
  );
}

function ToastStack({ notifications }: { notifications: GameState['notifications'] }) {
  // Show only the 5 most recent; each Toast dismisses itself after 10 seconds.
  const recent = notifications.slice(0, 5);
  return (
    <div className="fixed bottom-10 right-4 flex flex-col gap-1 pointer-events-none z-50 max-w-sm">
      {recent.map(n => <Toast key={n.id} n={n} />)}
    </div>
  );
}

// ============= START SCREEN =============
function StartScreen({ playerName, setPlayerName, playerColor, setPlayerColor, seed, setSeed, onStart }: {
  playerName: string; setPlayerName: (s: string) => void;
  playerColor: string; setPlayerColor: (c: string) => void;
  seed: number; setSeed: (n: number) => void; onStart: () => void;
}) {
  const palette = [
    '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#f43f5e',
    '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#14b8a6',
    '#06b6d4', '#0ea5e9', '#6366f1', '#a855f7', '#d946ef',
    '#78716c',
  ];
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
            <label className="block text-sm text-gray-300 mb-1">Corporate Colour</label>
            <div className="flex flex-wrap gap-2">
              {palette.map(color => (
                <button key={color} type="button" onClick={() => setPlayerColor(color)}
                  className={`w-7 h-7 rounded transition ${playerColor === color ? 'ring-2 ring-white scale-110' : 'opacity-70 hover:opacity-100'}`}
                  style={{ background: color }} title={color} />
              ))}
            </div>
            <div className="text-[10px] text-gray-500 mt-1">Every AI gets a different colour — this is yours.</div>
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

function BondsPanel({ state, setState }: { state: GameState; setState: React.Dispatch<React.SetStateAction<GameState | null>> }) {
  const player = state.companies.find(c => c.isPlayer);
  const curve = computeYieldCurve(state);
  const tradeable = state.bonds.filter(b => !b.defaulted && b.maturityYear > state.year);
  return (
    <div className="p-3 space-y-3">
      <h2 className="text-sm font-bold text-emerald-400 border-b border-gray-700 pb-1">📜 Bond Market</h2>
      <div className="bg-gray-700/50 rounded-lg p-2">
        <div className="text-xs font-bold mb-1">Yield Curve</div>
        <div className="grid grid-cols-3 gap-1 text-[10px]">
          <div className="bg-gray-800 rounded px-2 py-1 text-center">
            <div className="text-gray-500">3M</div>
            <div className="font-bold text-amber-300">{state.economy.threeMonthYield.toFixed(2)}%</div>
          </div>
          <div className="bg-gray-800 rounded px-2 py-1 text-center">
            <div className="text-gray-500">2Y</div>
            <div className="font-bold text-amber-300">{state.economy.twoYearYield.toFixed(2)}%</div>
          </div>
          <div className="bg-gray-800 rounded px-2 py-1 text-center">
            <div className="text-gray-500">10Y</div>
            <div className="font-bold text-amber-300">{state.economy.tenYearYield.toFixed(2)}%</div>
          </div>
        </div>
        <div className="text-[9px] text-gray-500 mt-1">
          {curve[0].yield < curve[2].yield ? 'Normal upward-sloping curve' : '⚠ Inverted: recession expected'}
        </div>
      </div>

      <div className="bg-gray-700/50 rounded-lg p-2">
        <div className="flex justify-between text-[10px] text-gray-400 mb-1">
          <span>Gov. debt</span><span>${formatMoney(state.economy.governmentDebt)}</span>
        </div>
        <div className="flex justify-between text-[10px] text-gray-400 mb-1">
          <span>Deficit (month)</span>
          <span className={state.economy.governmentDeficit > 0 ? 'text-red-400' : 'text-green-400'}>
            ${formatMoney(state.economy.governmentDeficit)}
          </span>
        </div>
        <div className="flex justify-between text-[10px] text-gray-400 mb-1">
          <span>CB balance sheet</span><span>${formatMoney(state.economy.centralBankAssets)}</span>
        </div>
        <div className="flex justify-between text-[10px] text-gray-400">
          <span>M2 (broad money)</span><span>{state.economy.broadMoney.toFixed(1)}</span>
        </div>
      </div>

      <div className="space-y-1">
        <div className="text-xs font-bold text-gray-400">Available Bonds</div>
        {tradeable.length === 0 ? (
          <div className="text-xs text-gray-500">No bonds available right now.</div>
        ) : tradeable.map(b => {
          const issuer = state.companies.find(c => c.id === b.issuerId);
          const cost = b.faceValue * b.quantity * b.marketPrice / 100;
          const held = b.holderId === 'player';
          return (
            <div key={b.id} className="bg-gray-700/50 rounded p-2 text-xs">
              <div className="flex justify-between">
                <div>
                  <div className="font-bold">{issuer?.name ?? 'Unknown'}</div>
                  <div className="text-gray-400 text-[10px]">
                    {b.termYears}-yr · matures {b.maturityYear} · rating {b.rating}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono">${b.marketPrice.toFixed(2)}</div>
                  <div className="text-[9px] text-gray-400">coupon {b.couponRate.toFixed(2)}%</div>
                </div>
              </div>
              <div className="flex gap-1 mt-1">
                {!held && (
                  <button onClick={() => setState(prev => prev ? buyBond(prev, b.id) : null)}
                    disabled={(player?.cash ?? 0) < cost}
                    className="flex-1 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 py-0.5 rounded text-[10px]">
                    Buy for ${formatMoney(cost)}
                  </button>
                )}
                {held && (
                  <button onClick={() => setState(prev => prev ? sellBond(prev, b.id) : null)}
                    className="flex-1 bg-red-700 hover:bg-red-600 py-0.5 rounded text-[10px]">
                    Sell for ${formatMoney(cost)}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {player && (
        <div className="bg-gray-700/50 rounded-lg p-2">
          <div className="text-xs font-bold mb-1">Issue Your Own Bond</div>
          <IssueBondForm state={state} setState={setState} player={player} />
        </div>
      )}
    </div>
  );
}

function IssueBondForm({ state, setState, player }: { state: GameState; setState: React.Dispatch<React.SetStateAction<GameState | null>>; player: GameState['companies'][0] }) {
  const [amount, setAmount] = useState(5_000_000);
  const [term, setTerm] = useState<10 | 15>(10);
  return (
    <div className="space-y-1">
      <div className="flex gap-2 items-center">
        <input type="number" min={1_000_000} step={1_000_000} value={amount}
          onChange={e => setAmount(parseInt(e.target.value) || 0)}
          className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs" />
        <select value={term} onChange={e => setTerm(parseInt(e.target.value) as 10 | 15)}
          className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs">
          <option value={10}>10 yr</option>
          <option value={15}>15 yr</option>
        </select>
      </div>
      <button onClick={() => setState(prev => prev ? issueBond(prev, amount, term) : null)}
        className="w-full bg-emerald-700 hover:bg-emerald-600 py-1 rounded text-xs font-bold">
        Issue $${formatMoney(amount)} in bonds
      </button>
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
  const totalRev = monthlyRunRate(player.dailyRevenue, player.revenue);
  const totalProfit = monthlyRunRate(player.dailyProfit, player.profit);

  return (
    <div className="p-3 space-y-3">
      <h2 className="text-sm font-bold text-emerald-400 border-b border-gray-700 pb-1">📊 Dashboard</h2>

      <div className="grid grid-cols-2 gap-2">
        <StatCard label="Cash" value={`$${formatMoney(player.dailyCash)}`} />
        <StatCard label="Net Worth" value={`$${formatMoney(player.dailyNetWorth || state.player.netWorth)}`} />
        <StatCard label="Revenue/mo" value={`$${formatMoney(totalRev)}`} color={totalRev > 0 ? 'text-green-400' : ''} />
        <StatCard label="Profit/mo" value={`$${formatMoney(totalProfit)}`} color={totalProfit > 0 ? 'text-green-400' : 'text-red-400'} />
        <StatCard label="Buildings" value={String(pb.length)} />
        <StatCard label="Market Cap" value={`$${formatMoney(player.dailyMarketCap)}`} />
        <StatCard label="Share Price" value={`$${player.dailySharePrice.toFixed(2)}`} />
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

      <div className="bg-gray-700/50 rounded-lg p-2">
        <div className="text-xs font-bold text-gray-400 mb-1">🧾 Tax Position</div>
        <div className="grid grid-cols-2 gap-1 text-[10px]">
          <div className="bg-gray-800 rounded px-2 py-1">
            <div className="text-gray-500">Paid this year</div>
            <div className="text-red-400">${formatMoney(player.taxesPaidYTD)}</div>
          </div>
          <div className="bg-gray-800 rounded px-2 py-1">
            <div className="text-gray-500">Last full year</div>
            <div>${formatMoney(player.taxesPaidLastYear)}</div>
          </div>
          <div className="bg-gray-800 rounded px-2 py-1">
            <div className="text-gray-500">Pre-tax YTD</div>
            <div className={player.pretaxProfitYTD >= 0 ? 'text-green-400' : 'text-red-400'}>
              ${formatMoney(player.pretaxProfitYTD)}
            </div>
          </div>
          <div className="bg-gray-800 rounded px-2 py-1">
            <div className="text-gray-500">Loss carry-fwd</div>
            <div className="text-amber-400">${formatMoney(player.lossCarryforward)}</div>
          </div>
        </div>
        <div className="text-[9px] text-gray-500 mt-1">
          Corporate {state.government.corporateTaxRate}% · Dividend {state.economy.dividendTaxRate.toFixed(0)}% ·
          Property {(state.government.propertyTaxRate * 100).toFixed(2)}%/yr ·
          CGT {state.economy.shortTermCapitalGainsRate}/{state.economy.longTermCapitalGainsRate}%
        </div>
      </div>

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
                    <div className="text-[9px] text-gray-500">
                      {city?.name} • {b.type === 'apartment' || b.type === 'commercial'
                        ? `${b.occupancy.toFixed(0)}% let`
                        : `Util ${b.utilization.toFixed(0)}%`}
                    </div>
                  </div>
                  <span className={monthlyRunRate(b.dailyProfit, b.profit) > 0 ? 'text-green-400' : 'text-red-400'}>
                    ${formatMoney(monthlyRunRate(b.dailyProfit, b.profit))}
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

function LandPanel({ state, setState, onBuyMode }: {
  state: GameState;
  setState: React.Dispatch<React.SetStateAction<GameState | null>>;
  onBuyMode: () => void;
}) {
  const player = state.companies.find(company => company.isPlayer);
  const holdings = state.landHoldings.filter(holding => holding.ownerId === player?.id);
  const totalValue = holdings.reduce((sum, holding) => sum + holding.currentValue, 0);
  const totalBasis = holdings.reduce((sum, holding) => sum + holding.purchasePrice, 0);
  const annualTax = holdings
    .filter(holding => !holding.developedBuildingId)
    .reduce((sum, holding) => sum + holding.currentValue * holding.propertyTaxRate, 0);

  return (
    <div className="p-3 space-y-3">
      <h2 className="text-sm font-bold text-emerald-400 border-b border-gray-700 pb-1">🧭 Land & Development Rights</h2>
      <div className="grid grid-cols-2 gap-2">
        <StatCard label="Land value" value={`$${formatMoney(totalValue)}`} />
        <StatCard label="Cost basis" value={`$${formatMoney(totalBasis)}`} />
        <StatCard label="Unrealized P/L" value={`$${formatMoney(totalValue - totalBasis)}`}
          color={totalValue >= totalBasis ? 'text-green-400' : 'text-red-400'} />
        <StatCard label="Vacant-land tax/yr" value={`$${formatMoney(annualTax)}`} color="text-red-400" />
      </div>
      <button onClick={onBuyMode}
        className="w-full bg-emerald-700 hover:bg-emerald-600 py-2 rounded text-xs font-bold">
        Buy Land on Map
      </button>
      <div className="text-[10px] text-gray-500">
        Price includes zoning, city population, wages, traffic, CBD distance, nearby development and resources.
        Owned land grants development rights and avoids buying the parcel again when you build.
      </div>

      <div className="space-y-1">
        {holdings.length === 0 ? (
          <div className="text-xs text-gray-500">No land titles owned.</div>
        ) : holdings.map(holding => {
          const city = state.cities.find(item => item.id === holding.cityId);
          const gain = holding.currentValue - holding.purchasePrice;
          return (
            <div key={holding.id} className="bg-gray-700/50 rounded p-2 text-xs">
              <div className="flex justify-between">
                <span className="font-medium">{city?.name ?? 'Rural'} · {holding.zone}</span>
                <span className={gain >= 0 ? 'text-green-400' : 'text-red-400'}>
                  ${formatMoney(holding.currentValue)}
                </span>
              </div>
              <div className="text-[9px] text-gray-500">
                Tile {holding.x},{holding.y} · bought ${formatMoney(holding.purchasePrice)} ·
                tax ${formatMoney(holding.currentValue * holding.propertyTaxRate)}/yr
              </div>
              <div className="text-[9px] mt-0.5">
                {holding.developedBuildingId
                  ? <span className="text-blue-400">Developed — land value is included in the building</span>
                  : <span className="text-emerald-400">Vacant — development rights available</span>}
              </div>
              {!holding.developedBuildingId && (
                <button onClick={() => setState(prev => prev ? sellLandHolding(prev, holding.id) : null)}
                  className="w-full mt-1 bg-red-800 hover:bg-red-700 py-0.5 rounded text-[9px]">
                  Sell land (3% brokerage)
                </button>
              )}
            </div>
          );
        })}
      </div>
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
                {prods.map(p => {
                  const unlocked = p.unlockYear <= state.year;
                  return (
                  <div key={p.id} className={`bg-gray-700/30 rounded px-2 py-1 text-xs ${!unlocked ? 'opacity-60' : ''}`}>
                    <div className="flex justify-between">
                      <span className="font-medium">{p.name}</span>
                      <span className="text-emerald-400">${p.currentPrice.toFixed(2)}</span>
                    </div>
                    <div className="flex gap-2 text-gray-400 text-[10px]">
                      <span>Q {p.quality.toFixed(0)}</span>
                      <span>Brand {p.brand.toFixed(0)}</span>
                      <span>★{p.reviewScore.toFixed(1)}</span>
                      <span className="px-1 rounded bg-gray-600">{p.segment}</span>
                      <span className={unlocked ? 'text-green-400' : 'text-amber-400'}>
                        {unlocked ? '✓ Available' : `🔒 Unlocks: ${p.unlockYear}`}
                      </span>
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
                  );
                })}
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
          <div className="text-[9px] text-gray-300 mt-0.5">{c.personality} · {c.sectorFocus.replace('_', ' ')}</div>
          <div className="grid grid-cols-2 gap-x-3 mt-1 text-gray-400">
            <span>Cash: ${formatMoney(c.dailyCash)}</span>
            <span>MCap: ${formatMoney(c.dailyMarketCap)}</span>
            <span>Share: ${c.dailySharePrice.toFixed(2)}</span>
            <span>Rating: {c.bondRating}</span>
            <span>Buildings: {c.buildings.length}</span>
            <span>Strategy: {c.aiStrategy}</span>
            <span>Risk: {(c.riskTolerance * 100).toFixed(0)}%</span>
            <span>Horizon: {c.planningHorizonMonths} mo</span>
          </div>
          {c.cartelId && <div className="text-[9px] text-amber-400 mt-0.5">🔗 Suspected cartel member</div>}
          {c.predatoryTicks > 0 && <div className="text-[9px] text-red-400 mt-0.5">⚔ Predatory pricing campaign active</div>}
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
          <EcoStat label="M2 Broad" value={eco.broadMoney.toFixed(0)} good={eco.broadMoney < 200} />
          <EcoStat label="Base Money" value={eco.baseMoney.toFixed(0)} good={true} />
          <EcoStat label="Nominal GDP" value={`$${formatMoney(eco.nominalGdp)}`} good={eco.nominalGdp > 0} />
          <EcoStat label="Productivity" value={`${eco.productivityGrowth.toFixed(1)}%/yr`} good={eco.productivityGrowth > 0} />
        </div>
        <div className="mt-2 text-[10px] text-gray-400">
          Fed guidance: <span className={eco.forwardGuidance === 'hawkish' ? 'text-red-400' : eco.forwardGuidance === 'dovish' ? 'text-blue-400' : ''}>{eco.forwardGuidance}</span>
          {' • '}Diesel: <span className={eco.dieselPrice > 4.5 ? 'text-red-400' : 'text-white'}>${eco.dieselPrice.toFixed(2)}/gal</span>
          {eco.fuelShockMonths > 0 && <span className="text-red-400"> • ⚠️ Fuel crisis {eco.fuelShockMonths}mo left</span>}
        </div>
      </div>

      <div className="bg-gray-700/50 rounded-lg p-2">
        <div className="text-xs font-bold mb-1">📊 CPI Basket Breakdown</div>
        <div className="space-y-0.5 text-[10px]">
          {Object.entries(eco.cpiByCategory).filter(([k]) => k !== 'core').map(([cat, val]) => (
            <div key={cat} className="flex justify-between">
              <span className="capitalize text-gray-400">{cat}</span>
              <span>{val.toFixed(1)}</span>
            </div>
          ))}
        </div>
        <div className="text-[9px] text-gray-500 mt-1">
          Headline CPI: {eco.cpi.toFixed(1)} · Core (ex food/energy): {eco.cpiByCategory.core.toFixed(1)}
        </div>
        <div className="text-[9px] text-gray-500 mt-1">
          Unit labor cost growth: {eco.unitLaborCostGrowth.toFixed(1)}%/yr · Household savings: {eco.householdSavingsRate.toFixed(1)}%
        </div>
      </div>

      <div className="bg-gray-700/50 rounded-lg p-2">
        <div className="text-xs font-bold mb-1">💵 Income Tax Brackets</div>
        <div className="space-y-0.5 text-[10px]">
          <div className="flex justify-between"><span className="text-gray-400">$0–50K</span><span>10%</span></div>
          <div className="flex justify-between"><span className="text-gray-400">$50K–120K</span><span>15%</span></div>
          <div className="flex justify-between"><span className="text-gray-400">$120K–250K</span><span>22%</span></div>
          <div className="flex justify-between"><span className="text-gray-400">$250K–500K</span><span>28%</span></div>
          <div className="flex justify-between"><span className="text-gray-400">$500K+</span><span>35%</span></div>
        </div>
        <div className="text-[9px] text-gray-500 mt-1">
          Your salary $${formatMoney(state.player.salary)}/yr → tax $${formatMoney(personalIncomeTax(state.player.salary))}/yr
        </div>
      </div>

      <div className="bg-gray-700/50 rounded-lg p-2">
        <div className="text-xs font-bold mb-1">🏛️ Government & Trade</div>
        <div className="grid grid-cols-2 gap-1 text-[10px]">
          <div className="bg-gray-800 rounded px-2 py-1">
            <div className="text-gray-500">Corporate Tax</div>
            <div>{state.government.corporateTaxRate}%</div>
          </div>
          <div className="bg-gray-800 rounded px-2 py-1">
            <div className="text-gray-500">Property Tax</div>
            <div>{(state.government.propertyTaxRate * 100).toFixed(2)}%/yr</div>
          </div>
          <div className="bg-gray-800 rounded px-2 py-1">
            <div className="text-gray-500">Dividend Tax</div>
            <div>{state.economy.dividendTaxRate.toFixed(0)}%</div>
          </div>
          <div className="bg-gray-800 rounded px-2 py-1">
            <div className="text-gray-500">Carbon Tax</div>
            <div className={state.government.carbonTaxPerUnit > 1 ? 'text-red-400' : ''}>
              ${state.government.carbonTaxPerUnit.toFixed(2)}/unit
            </div>
          </div>
          <div className="bg-gray-800 rounded px-2 py-1">
            <div className="text-gray-500">Min Wage</div>
            <div>${state.government.minimumWage.toFixed(2)}</div>
          </div>
          <div className="bg-gray-800 rounded px-2 py-1">
            <div className="text-gray-500">Antitrust</div>
            <div className={state.government.antitrustWarnings >= 1 ? 'text-red-400 font-bold' : ''}>
              {state.government.antitrustWarnings >= 1
                ? `${state.government.antitrustWarnings.toFixed(0)} warning(s)` : 'Clear'}
            </div>
          </div>
        </div>
        {state.government.antitrustWarnings >= 1 && (
          <div className="text-[9px] text-red-400 mt-1">
            ⚠ Investigated for market dominance — divest or face forced sales.
          </div>
        )}
        {state.government.carbonTaxPerUnit > 0 && (
          <div className="text-[9px] text-gray-500 mt-1">
            Carbon tax hits factories ${state.government.carbonTaxPerUnit.toFixed(2)}/unit, mines ×0.8, farms ×0.3.
          </div>
        )}
        <div className="text-[10px] font-bold text-gray-400 mt-2 mb-1">Trade Partners</div>
        {state.tradePartners.map(tp => (
          <div key={tp.id} className="flex justify-between text-[10px] bg-gray-800/60 rounded px-2 py-0.5 mb-0.5">
            <span>{tp.name}</span>
            <span className={tp.relationship < 0 ? 'text-red-400' : 'text-gray-300'}>
              FX {tp.exchangeRate.toFixed(2)} · tariff {(tp.tariffRate * 100).toFixed(0)}% · rel {tp.relationship.toFixed(0)}
            </span>
          </div>
        ))}
        {state.patents.length > 0 && (
          <div className="text-[10px] font-bold text-gray-400 mt-2 mb-1">Active Patents</div>
        )}
        {state.patents.map(pt => {
          const p = state.products.find(x => x.id === pt.productId);
          const owner = state.companies.find(c => c.id === pt.ownerId);
          return (
            <div key={pt.id} className="flex justify-between text-[10px] bg-amber-900/30 rounded px-2 py-0.5 mb-0.5">
              <span>📜 {p?.name}</span>
              <span className="text-amber-300">{owner?.name} · until {pt.expiresYear}</span>
            </div>
          );
        })}
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
              <div className="text-[9px] text-gray-600 mt-0.5">
                Income: L{(city.incomeMix.low * 100).toFixed(0)}/M{(city.incomeMix.middle * 100).toFixed(0)}/A{(city.incomeMix.affluent * 100).toFixed(0)}%
                {' '}· NIMBY {city.nimbyLevel.toFixed(0)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MarketPanel({ state, setState }: { state: GameState; setState: React.Dispatch<React.SetStateAction<GameState | null>> }) {
  const player = state.companies.find(c => c.isPlayer);
  const [tradeQty, setTradeQty] = useState<Record<string, number>>({});
  const [issueQty, setIssueQty] = useState(50000);
  const [expandedCompanyId, setExpandedCompanyId] = useState<string | null>(null);
  const qtyFor = (id: string) => tradeQty[id] ?? 1000;

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

      {/* Your company: issue shares */}
      {player && (
        <div className="bg-emerald-900/20 border border-emerald-700/40 rounded-lg p-2 space-y-1">
          <div className="text-xs font-bold text-emerald-300">{player.name} (You)</div>
          <div className="grid grid-cols-2 gap-x-3 text-[10px] text-gray-300">
            <span>Share: ${player.sharePrice.toFixed(2)}</span>
            <span>Mkt Cap: ${formatMoney(player.marketCap)}</span>
            <span>Shares: {(player.sharesOutstanding / 1e6).toFixed(2)}M</span>
            <span>You own: {((player.founderShares / player.sharesOutstanding) * 100).toFixed(0)}%</span>
          </div>
          <div className="flex items-center gap-1 mt-1">
            <input type="number" min={1000} step={10000} value={issueQty}
              onChange={e => setIssueQty(parseInt(e.target.value) || 0)}
              className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-[10px]" />
            <button onClick={() => setState(prev => prev ? issueOwnShares(prev, issueQty) : null)}
              className="bg-emerald-700 hover:bg-emerald-600 px-2 py-1 rounded text-[10px]">
              Issue (raise ${formatMoney(issueQty * player.sharePrice * 0.96)})
            </button>
          </div>
          <div className="text-[9px] text-gray-500">Issuing new shares raises cash but dilutes your ownership.</div>
        </div>
      )}

      <div className="text-xs font-bold text-gray-400">Invest in Rivals</div>
      <div className="space-y-1">
        {[...state.companies].filter(c => !c.isPlayer).sort((a, b) => b.marketCap - a.marketCap).map(c => {
          const held = player?.equityHoldings[c.id] ?? 0;
          const stakePct = held > 0 ? (held / c.sharesOutstanding) * 100 : 0;
          const qty = qtyFor(c.id);
          return (
            <div key={c.id} className="bg-gray-700/30 px-2 py-1.5 rounded text-xs">
              <button onClick={() => setExpandedCompanyId(expandedCompanyId === c.id ? null : c.id)}
                className="w-full flex items-center gap-2 text-left">
                <div className="w-2 h-2 rounded-full" style={{ background: c.color }} />
                <span className="flex-1 truncate">{c.name}</span>
                <span className="font-mono">${c.sharePrice.toFixed(2)}</span>
                <span className="text-gray-500">{expandedCompanyId === c.id ? '▾' : '▸'}</span>
              </button>
              <div className="flex justify-between text-[9px] text-gray-400 mt-0.5">
                <span>{SKILL_LABEL[c.skill] ?? c.skill} · {c.sectorFocus}</span>
                <span>{held > 0 ? `You: ${stakePct.toFixed(1)}%` : `Cap ${formatMoney(c.marketCap)}`}</span>
              </div>
              <div className="flex items-center gap-1 mt-1">
                <input type="number" min={100} step={1000} value={qty}
                  onChange={e => setTradeQty({ ...tradeQty, [c.id]: parseInt(e.target.value) || 0 })}
                  className="w-16 bg-gray-800 border border-gray-600 rounded px-1 py-0.5 text-[10px]" />
                <button onClick={() => setState(prev => prev ? buyCompanyShares(prev, c.id, qty) : null)}
                  className="flex-1 bg-emerald-700 hover:bg-emerald-600 py-0.5 rounded text-[9px]">
                  Buy ${formatMoney(qty * c.sharePrice)}
                </button>
                <button onClick={() => setState(prev => prev ? sellCompanyShares(prev, c.id, qty) : null)}
                  disabled={held <= 0}
                  className="flex-1 bg-red-700 hover:bg-red-600 disabled:opacity-40 py-0.5 rounded text-[9px]">
                  Sell
                </button>
              </div>
              {expandedCompanyId === c.id && (() => {
                const buildings = state.buildings.filter(building => building.companyId === c.id);
                const fixedAssets = buildings.reduce((sum, building) =>
                  sum + building.constructionCost + building.landValue, 0);
                const land = state.landHoldings
                  .filter(holding => holding.ownerId === c.id)
                  .reduce((sum, holding) => sum + holding.currentValue, 0);
                const annualRevenue = monthlyRunRate(c.dailyRevenue, c.revenue) * 12;
                const annualExpenses = monthlyRunRate(c.dailyExpenses, c.expenses) * 12;
                const annualProfit = monthlyRunRate(c.dailyProfit, c.profit) * 12;
                const publicFloat = Math.max(0, c.sharesOutstanding - c.founderShares);
                const intelActive = c.intelExpiresTick > state.tick && c.playerIntelLevel > 0;
                return (
                  <div className="mt-2 border-t border-gray-600 pt-2 space-y-2">
                    <MiniChart data={c.sharePriceHistory} color={c.color} height={48} width={280} />
                    <div className="grid grid-cols-2 gap-x-3 text-[9px]">
                      <span>Shares outstanding</span><span className="text-right">{c.sharesOutstanding.toLocaleString()}</span>
                      <span>Founder/locked</span><span className="text-right">{c.founderShares.toLocaleString()}</span>
                      <span>Public float</span><span className="text-right">{publicFloat.toLocaleString()}</span>
                      <span>Your holding</span><span className="text-right">{held.toLocaleString()}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      <div className="bg-gray-800 rounded p-1 text-[8px]">
                        <div className="text-gray-400 font-bold">Balance Sheet</div>
                        <div>Cash ${formatMoney(c.cash)}</div>
                        <div>Buildings ${formatMoney(fixedAssets)}</div>
                        <div>Land ${formatMoney(land)}</div>
                        <div>Assets ${formatMoney(c.totalAssets)}</div>
                        <div>Debt ${formatMoney(c.debt)}</div>
                        <div>Equity ${formatMoney(c.totalAssets - c.debt)}</div>
                      </div>
                      <div className="bg-gray-800 rounded p-1 text-[8px]">
                        <div className="text-gray-400 font-bold">Income (annual)</div>
                        <div>Revenue ${formatMoney(annualRevenue)}</div>
                        <div>Expenses ${formatMoney(annualExpenses)}</div>
                        <div className={annualProfit >= 0 ? 'text-green-400' : 'text-red-400'}>
                          Net ${formatMoney(annualProfit)}
                        </div>
                        <div>Margin {annualRevenue > 0 ? (annualProfit / annualRevenue * 100).toFixed(1) : '0'}%</div>
                      </div>
                      <div className="bg-gray-800 rounded p-1 text-[8px]">
                        <div className="text-gray-400 font-bold">Cash Flow YTD</div>
                        <div>CFO ${formatMoney(c.operatingCashFlow)}</div>
                        <div>CFI ${formatMoney(c.investingCashFlow)}</div>
                        <div>CFF ${formatMoney(c.financingCashFlow)}</div>
                      </div>
                    </div>
                    {!intelActive ? (
                      <div className="space-y-1">
                        <div className="text-[8px] text-gray-500">Operational strategy is not public. Purchase intelligence for 12 months.</div>
                        <div className="flex gap-1">
                          <button onClick={() => setState(prev => prev ? buyCompetitorIntel(prev, c.id, 1) : null)}
                            className="flex-1 bg-gray-600 py-0.5 rounded text-[8px]">Basic $50K</button>
                          <button onClick={() => setState(prev => prev ? buyCompetitorIntel(prev, c.id, 2) : null)}
                            className="flex-1 bg-purple-700 py-0.5 rounded text-[8px]">Deep $250K</button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-[8px] text-purple-300">
                        Intel: {c.personality} · {c.aiStrategy} · risk {(c.riskTolerance * 100).toFixed(0)}% ·
                        horizon {c.planningHorizonMonths}mo · {buildings.length} operating assets
                      </div>
                    )}
                  </div>
                );
              })()}
              {stakePct > 40 && stakePct <= 50 && (
                <div className="text-[9px] text-amber-400 mt-0.5">⚠ Above 50% triggers a hostile takeover.</div>
              )}
            </div>
          );
        })}
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
  const costBasis = state.tradedAssets.reduce((s, a) => s + a.playerCostBasis * a.playerHolding, 0);
  const unrealised = portfolioValue - costBasis;

  const fmtSupply = (n: number) => {
    if (!Number.isFinite(n)) return '∞';
    if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T';
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return n.toFixed(0);
  };

  return (
    <div className="p-3 space-y-3">
      <h2 className="text-sm font-bold text-emerald-400 border-b border-gray-700 pb-1">🪙 Asset Market</h2>

      <div className="bg-gray-700/50 rounded-lg p-2 space-y-1 text-xs">
        <div className="flex justify-between"><span className="text-gray-400">Cash</span><span>${formatMoney(player?.cash ?? 0)}</span></div>
        <div className="flex justify-between"><span className="text-gray-400">Portfolio</span><span>${formatMoney(portfolioValue)}</span></div>
        <div className="flex justify-between">
          <span className="text-gray-400">Unrealised P/L</span>
          <span className={unrealised >= 0 ? 'text-green-400' : 'text-red-400'}>
            {unrealised >= 0 ? '+' : ''}${formatMoney(unrealised)}
          </span>
        </div>
        {(player?.lossCarryforward ?? 0) > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-400">Loss carry-forward</span>
            <span className="text-amber-400">${formatMoney(player!.lossCarryforward)}</span>
          </div>
        )}
        <div className="text-[9px] text-gray-500 border-t border-gray-600 pt-1">
          Commission {(TRANSACTION_FEE * 100).toFixed(1)}% each way · CGT {state.economy.shortTermCapitalGainsRate}% short-term,
          {' '}{state.economy.longTermCapitalGainsRate}% after 1 year (FIFO lots) · large orders move the price
        </div>
      </div>

      {classes.map(cls => {
        const assets = state.tradedAssets.filter(a => a.assetClass === cls);
        if (assets.length === 0) return null;
        const label = cls === 'etf' ? 'In-World Index Funds'
          : cls === 'crypto' ? 'Crypto' : cls === 'metal' ? 'Precious Metals' : 'Commodities';
        return (
          <div key={cls}>
            <div className="text-xs font-bold text-gray-400 mb-1">{label}</div>
            {cls === 'etf' && (
              <div className="text-[9px] text-gray-500 mb-1">
                These funds hold shares in the companies competing in this world — priced off their real market caps.
              </div>
            )}
            <div className="space-y-1">
              {assets.map(a => {
                const change = a.history.length > 1 ? (a.price / a.history[a.history.length - 2] - 1) * 100 : 0;
                const value = a.price * a.playerHolding;
                const gain = value - a.playerCostBasis * a.playerHolding;
                const scarcity = Number.isFinite(a.circulating) && a.worldSupply > 0
                  ? a.circulating / a.worldSupply : 1;
                const assetUnlocked = a.unlockYear <= state.year;
                return (
                  <div key={a.id} className={`bg-gray-700/50 rounded p-2 text-xs ${!assetUnlocked ? 'opacity-60' : ''}`}>
                    <div className="flex justify-between items-center mb-1">
                      <div>
                        <span className="font-bold">{a.symbol}</span>
                        <span className="text-gray-400 ml-1">{a.name}</span>
                        {!assetUnlocked && (
                          <span className="ml-2 text-[9px] text-amber-400 bg-amber-900/30 px-1 rounded">
                            🔒 Unlocks {a.unlockYear}
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="font-mono">${a.price >= 1000 ? formatMoney(a.price) : a.price.toFixed(2)}</div>
                        <div className={`text-[9px] ${change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                        </div>
                      </div>
                    </div>
                    <MiniChart data={a.history} color={change >= 0 ? '#10b981' : '#ef4444'} height={24} width={280} />

                    {!a.trackedCompanyIds && (
                      <div className="grid grid-cols-3 gap-1 mt-1 text-[9px]">
                        <div className="bg-gray-800 rounded px-1 py-0.5">
                          <div className="text-gray-500">World supply</div>
                          <div>{fmtSupply(a.worldSupply)}</div>
                        </div>
                        <div className="bg-gray-800 rounded px-1 py-0.5">
                          <div className="text-gray-500">Tradeable</div>
                          <div className={scarcity < 0.05 ? 'text-amber-400' : ''}>{fmtSupply(a.circulating)}</div>
                        </div>
                        <div className="bg-gray-800 rounded px-1 py-0.5">
                          <div className="text-gray-500">New/yr</div>
                          <div className={a.annualConsumption > a.annualNewSupply ? 'text-red-400' : 'text-green-400'}>
                            {fmtSupply(a.annualNewSupply)}
                          </div>
                        </div>
                      </div>
                    )}
                    {!a.trackedCompanyIds && a.annualConsumption > a.annualNewSupply && (
                      <div className="text-[9px] text-red-400 mt-0.5">
                        ⚠ Consumption {fmtSupply(a.annualConsumption)}/yr exceeds production — reserves depleting
                      </div>
                    )}
                    {a.symbol === 'BTC' && (
                      <div className="text-[9px] text-amber-400 mt-0.5">
                        Hard cap 21M · issuance halves every 4 years
                      </div>
                    )}

                    {a.playerHolding > 0 && (
                      <div className="text-[10px] mt-1 flex justify-between">
                        <span className="text-emerald-400">
                          {a.playerHolding.toFixed(4)} {a.unit} @ ${a.playerCostBasis.toFixed(2)}
                        </span>
                        <span className={gain >= 0 ? 'text-green-400' : 'text-red-400'}>
                          ${formatMoney(value)} ({gain >= 0 ? '+' : ''}${formatMoney(gain)})
                        </span>
                      </div>
                    )}
                    {a.taxLots.length > 0 && (
                      <div className="text-[9px] text-gray-500 mt-0.5">
                        {a.taxLots.length} tax lot{a.taxLots.length > 1 ? 's' : ''} ·{' '}
                        {a.taxLots.filter(l => state.tick - l.openedTick >= 24 * 30 * 12).length} long-term
                      </div>
                    )}

                    <div className="flex gap-1 mt-1">
                      <button onClick={() => { setTradeModal({ asset: a, mode: 'buy' }); setTradeAmount(1); }}
                        disabled={!assetUnlocked}
                        className="flex-1 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed py-0.5 rounded text-[10px]">
                        {assetUnlocked ? 'Buy' : `🔒 ${a.unlockYear}`}
                      </button>
                      <button onClick={() => { setTradeModal({ asset: a, mode: 'sell' }); setTradeAmount(a.playerHolding); }}
                        disabled={a.playerHolding <= 0 || !assetUnlocked}
                        className="flex-1 bg-red-700 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed py-0.5 rounded text-[10px]">Sell</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {tradeModal && (() => {
        const a = tradeModal.asset;
        const impact = marketImpact(a, tradeAmount);
        const execPrice = tradeModal.mode === 'buy' ? a.price * (1 + impact) : a.price * (1 - impact);
        const gross = execPrice * tradeAmount;
        const fee = gross * TRANSACTION_FEE;
        const total = tradeModal.mode === 'buy' ? gross + fee : gross - fee;
        const estGain = tradeModal.mode === 'sell' ? total - a.playerCostBasis * tradeAmount : 0;
        return (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setTradeModal(null)}>
            <div className="bg-gray-800 border border-gray-600 rounded-xl p-5 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-white mb-1">
                {tradeModal.mode === 'buy' ? 'Buy' : 'Sell'} {a.name}
              </h3>
              <div className="text-xs text-gray-400 mb-3">
                Quote ${a.price.toFixed(2)} / {a.unit}
                {Number.isFinite(a.circulating) && ` · ${fmtSupply(a.circulating)} available`}
              </div>
              <label className="block text-xs text-gray-300 mb-1">Amount ({a.unit})</label>
              <input type="number" min={0} step="0.0001" value={tradeAmount}
                onChange={e => setTradeAmount(parseFloat(e.target.value) || 0)}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white outline-none" />

              <div className="mt-3 space-y-1 text-xs bg-gray-900/60 rounded p-2">
                <div className="flex justify-between"><span className="text-gray-400">Execution price</span><span>${execPrice.toFixed(2)}</span></div>
                {impact > 0.0005 && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Market impact</span>
                    <span className="text-amber-400">{(impact * 100).toFixed(2)}% slippage</span>
                  </div>
                )}
                <div className="flex justify-between"><span className="text-gray-400">Gross</span><span>${formatMoney(gross)}</span></div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Commission ({(TRANSACTION_FEE * 100).toFixed(1)}%)</span>
                  <span className="text-red-400">−${formatMoney(fee)}</span>
                </div>
                <div className="flex justify-between font-bold border-t border-gray-700 pt-1">
                  <span>{tradeModal.mode === 'buy' ? 'Total cost' : 'Net proceeds'}</span>
                  <span className="text-emerald-400">${formatMoney(total)}</span>
                </div>
                {tradeModal.mode === 'sell' && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Est. gain (pre-tax)</span>
                    <span className={estGain >= 0 ? 'text-green-400' : 'text-red-400'}>
                      {estGain >= 0 ? '+' : ''}${formatMoney(estGain)}
                    </span>
                  </div>
                )}
              </div>
              {tradeModal.mode === 'sell' && (
                <div className="text-[10px] text-gray-500 mt-1">
                  Oldest lots sell first (FIFO). Gains held over a year are taxed at
                  {' '}{state.economy.longTermCapitalGainsRate}%, otherwise {state.economy.shortTermCapitalGainsRate}%.
                </div>
              )}

              <div className="flex gap-2 mt-4">
                <button onClick={() => {
                  setState(prev => prev ? (tradeModal.mode === 'buy'
                    ? buyAsset(prev, a.id, tradeAmount)
                    : sellAsset(prev, a.id, tradeAmount)) : null);
                  setTradeModal(null);
                }} className={`flex-1 py-2 rounded font-bold ${tradeModal.mode === 'buy' ? 'bg-emerald-600' : 'bg-red-600'}`}>
                  Confirm
                </button>
                <button onClick={() => setTradeModal(null)} className="px-4 py-2 bg-gray-600 rounded">Cancel</button>
              </div>
            </div>
          </div>
        );
      })()}
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

function playerIdOf(state: GameState): string | null {
  return state.companies.find(c => c.isPlayer)?.id ?? null;
}

function BuildingDetailPanel({ state, building, onClose, setState }: {
  state: GameState;
  building: Building;
  onClose: () => void;
  setState: React.Dispatch<React.SetStateAction<GameState | null>>;
}) {
  const [offerOverride, setOfferOverride] = useState<number | null>(null);
  const [listingModal, setListingModal] = useState<string | null>(null);
  const [listingPrice, setListingPrice] = useState<number>(0);
  const [contractProductId, setContractProductId] = useState<string>('');
  const [tab, setTab] = useState<'overview' | 'products' | 'supply'>('overview');
  const company = state.companies.find(c => c.id === building.companyId);
  const isOwned = company?.isPlayer;
  const cfg = BUILDING_CONFIGS[building.type];
  const city = state.cities.find(c => c.id === building.cityId);
  const askingPrice = !isOwned && building.companyId !== 'system'
    ? getAskingPrice(state, building.id) : null;
  const eligible = eligibleProductsFor(building, state.products, state.year);
  const venue = isHospitality(building.type);
  const isRetail = building.type === 'retail_store';
  const isProducer = ['factory', 'farm', 'mine'].includes(building.type);
  const isRealEstate = building.type === 'apartment' || building.type === 'commercial';
  const isHQ = building.type === 'hq';
  const isRD = building.type === 'rd_center';
  const monthlyRev = monthlyRunRate(building.dailyRevenue, building.revenue);
  const monthlyCogs = monthlyRunRate(building.dailyCogs, building.cogs);
  const monthlyOpex = monthlyRunRate(building.dailyOpex, building.operatingCost);
  const monthlyProfit = monthlyRunRate(building.dailyProfit, building.profit);
  const shownUtil = building.dailyUtilization > 0 ? building.dailyUtilization : building.utilization;
  const detailTabs = (isRealEstate || isHQ || isRD)
    ? (['overview'] as const)
    : (['overview', 'products', 'supply'] as const);

  // Default acquisition and listing prices from the frozen monthly valuation.
  const offerAmount = offerOverride ?? Math.round((askingPrice ?? 0) * 0.9);
  const effectiveListingPrice = listingPrice > 0
    ? listingPrice : Math.max(1, Math.round(building.monthlyFairValue * 1.1));

  const stocked = building.products
    .map(id => state.products.find(p => p.id === id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));
  const configuredProduct = building.productId
    ? state.products.find(product => product.id === building.productId) : undefined;
  const contractProductIds = building.type === 'factory'
    ? (configuredProduct?.inputs.map(input => input.productId) ?? [])
    : (building.type === 'retail_store' || building.type === 'warehouse' || venue)
      ? building.products : [];
  const selectedContractProduct = contractProductId || contractProductIds[0] || '';
  const contractOffers = selectedContractProduct
    ? getSupplyContractOffers(state, building.id, selectedContractProduct) : [];
  const clientContracts = state.buildings.flatMap(client =>
    client.supplierLinks
      .filter(contract => contract.supplierBuildingId === building.id && contract.active)
      .map(contract => ({ client, contract })));

  return (
    <div className="w-80 bg-gray-800/95 border-l border-gray-700 overflow-y-auto shrink-0">
      <div className="p-3 space-y-3">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-sm font-bold flex items-center gap-1">
              <span>{cfg?.icon}</span>{building.name}
              {building.forSale && <span className="ml-1 px-1.5 py-0.5 bg-amber-600 rounded text-[9px]">FOR SALE</span>}
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

        {building.supplyDisrupted && (
          <div className="bg-red-900/40 border border-red-600 rounded-lg p-2 text-xs">
            <div className="font-bold text-red-400 mb-1">⚠️ Supply Disrupted</div>
            <div className="text-[10px] text-red-200">
              A supplier went bust mid-contract. This site is running on inventory.
              Re-source to the lowest landed-cost supplier.
            </div>
            {isOwned && (
              <button onClick={() => setState(prev => prev ? autoSourceBuilding(prev, building.id) : null)}
                className="mt-1 w-full bg-red-700 hover:bg-red-600 py-1 rounded text-[10px] font-bold">
                ↻ Re-source Now
              </button>
            )}
          </div>
        )}

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
              <StatCard label="Revenue/mo" value={`$${formatMoney(monthlyRev)}`} color={monthlyRev > 0 ? 'text-green-400' : ''} />
              {!isRealEstate && <StatCard label="COGS/mo" value={`$${formatMoney(monthlyCogs)}`} color="text-orange-400" />}
              <StatCard label={isRealEstate ? 'Upkeep/mo' : 'Opex/mo'} value={`$${formatMoney(monthlyOpex)}`} color="text-red-400" />
              <StatCard label="Profit/mo" value={`$${formatMoney(monthlyProfit)}`} color={monthlyProfit > 0 ? 'text-green-400' : 'text-red-400'} />
              {!isRealEstate && <StatCard label="Utilization" value={`${shownUtil.toFixed(0)}%`} />}
              {!isRealEstate && <StatCard label="Employees" value={`${building.employees} / ${building.targetEmployees}`} />}
              {!isRealEstate && <StatCard label="Avg salary" value={building.employees > 0 ? `$${formatMoney(building.averageAnnualSalary)}/yr` : 'Not staffed'} />}
              {!isRealEstate && <StatCard label="Training" value={`Lv ${building.trainingLevel}/9`} />}
              {!isRealEstate && <StatCard label="Morale" value={`${building.employeeSatisfaction.toFixed(0)}%`} />}
              {(isRetail || venue) && <StatCard label="Traffic" value={`${building.customerTraffic.toFixed(0)}`} />}
              {isRetail && <StatCard label="Chain Bonus" value={'★'.repeat(Math.min(5, Math.round(building.chainBonus * 2.2)))} color="text-amber-400" />}
              {isRealEstate && (
                <>
                  <StatCard label="Tenants" value={`${building.tenants} / ${building.capacity}`} />
                  <StatCard label="Occupancy" value={`${building.occupancy.toFixed(0)}%`}
                    color={building.occupancy > 85 ? 'text-green-400' : building.occupancy > 50 ? 'text-yellow-400' : 'text-red-400'} />
                  <StatCard label={building.type === 'apartment' ? 'Rent / unit' : 'Rent / suite'} value={`$${building.rentPerUnit.toFixed(0)}/mo`} />
                  <StatCard label="Condition" value={`${building.condition.toFixed(0)}%`} />
                  <StatCard label="Reserve fund" value={`$${formatMoney(building.maintenanceReserve)}`} />
                  <StatCard label="Reserve rate" value={`${(building.reserveRate * 100).toFixed(1)}%/yr`} />
                  {isOwned && building.condition < 100 && (
                    <button onClick={() => setState(prev => prev ? repairBuilding(prev, building.id, 100) : null)}
                      className="col-span-2 bg-blue-700 hover:bg-blue-600 py-1 rounded text-[10px]">
                      🔧 Repair to 100% (reserve fund used first)
                    </button>
                  )}
                </>
              )}

              {isRealEstate && (
                <div className="bg-gray-700/40 rounded-lg p-2 text-[10px] space-y-1">
                  <div className="text-gray-400 font-bold">Monthly cost breakdown</div>
                  <div className="flex justify-between">
                    <span>Property tax</span>
                    <span className="text-red-400">{(state.government.propertyTaxRate * 100).toFixed(2)}%/yr</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Insurance</span>
                    <span>$${(building.constructionCost * 0.0035 / 12).toFixed(0)}/mo</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Utilities (per tenant)</span>
                    <span>${45}×{building.tenants} = ${(45 * building.tenants).toFixed(0)}/mo</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Maintenance reserve</span>
                    <span>${(building.constructionCost * building.reserveRate / 12).toFixed(0)}/mo</span>
                  </div>
                </div>
              )}
              {building.type === 'mine' && building.resourceMax > 0 && (
                <StatCard label="Reserve"
                  value={`${((building.resourceRemaining / building.resourceMax) * 100).toFixed(0)}%`}
                  color={building.resourceRemaining / building.resourceMax < 0.2 ? 'text-red-400' : ''} />
              )}
            </div>

            <div className="bg-gray-700/50 rounded-lg p-2 text-[10px] space-y-0.5">
              <div className="text-gray-300 font-bold mb-1">Detailed Monthly Costs</div>
              {([
                ['Rent / mortgage', building.costBreakdown.rentMortgage, 'Owned asset — company financing is shown at corporate level'],
                ['Utilities', building.costBreakdown.utilities, 'Electricity, water, gas, internet'],
                ['Inventory / stock', building.costBreakdown.inventoryStock, 'Wholesale inventory recognized as COGS'],
                ['Staff wages', building.costBreakdown.staffWages, 'Salaries'],
                ['Payroll tax & benefits', building.costBreakdown.payrollTaxesBenefits, 'Employer taxes and benefits'],
                ['Marketing / advertising', building.costBreakdown.marketingAdvertising, 'Local ad budget'],
                ['Equipment', building.costBreakdown.equipment, 'Fixtures and equipment reserve'],
                ['Insurance', building.costBreakdown.insurance, 'Property / liability insurance'],
                ['Licenses / permits', building.costBreakdown.licensesPermits, 'Municipal and operating permits'],
                ['Maintenance / repairs', building.costBreakdown.maintenanceRepairs, 'Routine repairs'],
                ['Card processing', building.costBreakdown.cardProcessing, '2.5% of customer-facing revenue'],
                ['Packaging / bags', building.costBreakdown.packagingBags, 'Per-unit packaging'],
                ['Accounting / legal', building.costBreakdown.accountingLegal, 'Compliance and professional fees'],
                ['Property tax', building.costBreakdown.propertyTax, 'Accrued to municipality'],
                ['Municipal fees', building.costBreakdown.municipalFees, 'Water, sewer, garbage, street service'],
                ['Capital reserve', building.costBreakdown.reserveContribution, 'Roof, facade, heating and major works'],
                ['Freight', building.costBreakdown.freight, 'Inbound freight recognized with sold inventory'],
                ['Other / carbon', building.costBreakdown.other, 'Other operating and environmental costs'],
              ] as const).map(([label, hourly, note]) => (
                <div key={label} className="flex justify-between gap-2" title={note}>
                  <span className="text-gray-400">{label}</span>
                  <span className={hourly > 0 ? 'text-red-300' : 'text-gray-600'}>
                    {hourly > 0 ? `$${formatMoney(hourly * 720)}` : '—'}
                  </span>
                </div>
              ))}
            </div>

            {/* Supply vs demand bar — the right-sizing indicator */}
            {!isRealEstate && (building.supply > 0 || building.demand > 0) && (
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

            {isOwned && !isRealEstate && !isHQ && !isRD && building.targetEmployees > 0 && (
              <div className="bg-gray-700/50 rounded-lg p-2 space-y-2">
                <div className="text-xs font-bold text-gray-300">Staffing & Payroll</div>
                <div className="text-[10px] text-gray-400">
                  {building.employees}/{building.targetEmployees} staffed · Avg skill {building.staffSkill.toFixed(1)}/9 ·
                  Avg salary {building.employees > 0 ? `$${formatMoney(building.averageAnnualSalary)}/yr` : '—'}
                </div>
                <div className="h-2 bg-gray-800 rounded overflow-hidden">
                  <div className="h-full bg-emerald-500"
                    style={{ width: `${building.targetEmployees > 0 ? building.employees / building.targetEmployees * 100 : 100}%` }} />
                </div>
                <div className="grid grid-cols-2 gap-1">
                  <button
                    onClick={() => setState(prev => prev
                      ? hireBuildingEmployee(prev, building.id, 1) : null)}
                    disabled={building.employees >= building.targetEmployees}
                    className="bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 py-1 rounded text-[9px]">
                    + Hire entry-level
                  </button>
                  <button
                    onClick={() => setState(prev => prev
                      ? hireBuildingEmployee(prev, building.id, 3) : null)}
                    disabled={building.employees >= building.targetEmployees}
                    className="bg-blue-700 hover:bg-blue-600 disabled:opacity-40 py-1 rounded text-[9px]">
                    + Hire skilled
                  </button>
                </div>
                {building.employees <= 0 && (
                  <div className="text-[9px] text-red-400">
                    No staff: this building cannot produce, serve customers, or operate.
                  </div>
                )}
              </div>
            )}

            {building.type === 'farm' && (
              <div className="bg-gray-700/50 rounded-lg p-2 space-y-2">
                <div className="text-xs font-bold text-gray-300">Farm Operations</div>
                <div className="grid grid-cols-2 gap-1 text-[10px]">
                  <div className="bg-gray-800 rounded px-2 py-1">
                    <div className="text-gray-500">Land</div>
                    <div>{building.farmSizeHectares.toFixed(0)} hectares</div>
                  </div>
                  <div className="bg-gray-800 rounded px-2 py-1">
                    <div className="text-gray-500">Cycle</div>
                    <div className="capitalize">{building.growthStage}</div>
                  </div>
                  <div className="bg-gray-800 rounded px-2 py-1">
                    <div className="text-gray-500">Soil health</div>
                    <div className={building.soilHealth > 70 ? 'text-emerald-400' : building.soilHealth > 50 ? 'text-yellow-400' : 'text-red-400'}>
                      {building.soilHealth.toFixed(0)}%
                    </div>
                  </div>
                  <div className="bg-gray-800 rounded px-2 py-1">
                    <div className="text-gray-500">Weather</div>
                    <div>{(building.weatherFactor * 100).toFixed(0)}%</div>
                  </div>
                </div>
                {isOwned && (
                  <div>
                    <div className="text-[10px] text-gray-400">
                      Irrigation {(building.irrigationLevel * 100).toFixed(0)}% ·
                      ${formatMoney(building.farmSizeHectares * building.irrigationLevel * 2)}/mo
                    </div>
                    <input type="range" min={0} max={1} step={0.05}
                      value={building.irrigationLevel}
                      onChange={event => setState(prev => prev
                        ? setFarmIrrigation(prev, building.id, parseFloat(event.target.value)) : null)}
                      className="w-full" />
                  </div>
                )}
                <div className="text-[9px] text-gray-500">
                  Crops produce mainly during autumn harvest. Livestock and dairy run year-round.
                  Winter/rest periods rebuild soil; irrigation cushions bad weather.
                </div>

                {/* Livestock breed selection */}
                {isOwned && (
                  <div className="border-t border-gray-600 pt-2 mt-2 space-y-2">
                    <div className="text-[10px] font-bold text-gray-400">Livestock / Herd Breed</div>
                    {LIVESTOCK_BREEDS.map(breed => (
                      <button key={breed.id}
                        onClick={() => setState(prev => prev ? setLivestockBreed(prev, building.id, breed.id) : null)}
                        className={`w-full text-left px-2 py-1 rounded text-[9px] ${building.livestockBreed === breed.id ? 'bg-emerald-800' : 'bg-gray-800 hover:bg-gray-700'}`}>
                        <div className="flex justify-between font-medium">
                          <span>{breed.name}</span>
                          <span>{breed.investmentCost > 0 ? `$${formatMoney(breed.investmentCost)}` : 'FREE'}</span>
                        </div>
                        <div className="text-gray-400">
                          Yield ×{breed.yieldMul.toFixed(2)} · Price ×{breed.priceMul.toFixed(2)} · Quality +{breed.qualityBonus}
                        </div>
                        <div className="text-[8px] text-gray-500">{breed.description}</div>
                      </button>
                    ))}

                    <div className="text-[10px] font-bold text-gray-400 mt-2">Feed Quality: {(building.feedQuality * 100).toFixed(0)}%</div>
                    <input type="range" min={0} max={1} step={0.05}
                      value={building.feedQuality}
                      onChange={e => setState(prev => prev ? setFeedQuality(prev, building.id, parseFloat(e.target.value)) : null)}
                      className="w-full" />
                    <div className="text-[9px] text-gray-500">Better feed lifts yield and quality — costs more per hectare.</div>

                    <div className="text-[10px] font-bold text-gray-400 mt-2">Veterinary Program: Level {building.vetProgram}/3</div>
                    <div className="flex gap-1">
                      {[0, 1, 2, 3].map(level => (
                        <button key={level}
                          onClick={() => setState(prev => prev ? setVetProgram(prev, building.id, level) : null)}
                          className={`flex-1 py-1 rounded text-[9px] ${building.vetProgram === level ? 'bg-emerald-700' : 'bg-gray-700'}`}>
                          {level === 0 ? 'None' : `Lv ${level}`}
                        </button>
                      ))}
                    </div>
                    <div className="text-[9px] text-gray-500">Higher level = +5% output per level, less disease loss.</div>

                    <div className="text-[10px] font-bold text-gray-400 mt-2">Product Tier</div>
                    <div className="flex gap-1">
                      {PRODUCT_TIERS.map(tier => (
                        <button key={tier.id}
                          onClick={() => setState(prev => prev ? setProductTier(prev, building.id, tier.id) : null)}
                          className={`flex-1 py-1 rounded text-[9px] ${building.productTier === tier.id ? 'bg-emerald-700' : 'bg-gray-700'}`}>
                          {tier.label}
                        </button>
                      ))}
                    </div>
                    <div className="text-[9px] text-gray-500">
                      {building.productTier === 'organic' ? '+75% price, +20 quality, +40% cost'
                        : building.productTier === 'premium' ? '+35% price, +12 quality, +15% cost'
                        : 'Standard tier — no premium, no bonus.'}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Producer market sales: farms, factories, mines */}
            {isProducer && (
              <div className="bg-gray-700/50 rounded-lg p-2 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-gray-300">Open-Market Sales</div>
                  {isOwned && (
                    <button onClick={() => setState(prev => prev ? toggleOpenMarketSales(prev, building.id) : null)}
                      className={`px-2 py-0.5 rounded text-[9px] ${building.openMarketSales ? 'bg-emerald-700' : 'bg-gray-600'}`}>
                      {building.openMarketSales ? 'SELLING' : 'HELD BACK'}
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-1 text-[10px]">
                  <div className="bg-gray-800 rounded px-2 py-1">
                    <div className="text-gray-500">In stock</div>
                    <div>{Math.round(building.supply).toLocaleString()} units</div>
                  </div>
                  <div className="bg-gray-800 rounded px-2 py-1">
                    <div className="text-gray-500">Sold to market</div>
                    <div>{Math.round(building.marketUnitsSold * 24).toLocaleString()}/day</div>
                  </div>
                  <div className="bg-gray-800 rounded px-2 py-1">
                    <div className="text-gray-500">Produced</div>
                    <div>{Math.round(building.dailyProduced).toLocaleString()}/day</div>
                  </div>
                  <div className="bg-gray-800 rounded px-2 py-1">
                    <div className="text-gray-500">Gate price</div>
                    <div>${(configuredProduct ? configuredProduct.currentPrice * 0.72 * building.sellPriceMultiplier : 0).toFixed(2)}</div>
                  </div>
                </div>
                {isOwned && (
                  <div>
                    <div className="text-[10px] text-gray-400">
                      Sell price: {(building.sellPriceMultiplier * 100).toFixed(0)}% of spot
                      {building.sellPriceMultiplier > 1.1 ? ' (premium — sells slower)'
                        : building.sellPriceMultiplier < 0.9 ? ' (discount — sells faster)' : ''}
                    </div>
                    <input type="range" min={0.4} max={2.0} step={0.05}
                      value={building.sellPriceMultiplier}
                      onChange={event => setState(prev => prev
                        ? setSellPrice(prev, building.id, parseFloat(event.target.value)) : null)}
                      className="w-full" />
                  </div>
                )}
                <div className="text-[9px] text-gray-500">
                  Surplus not consumed by your own factories is sold at the gate price.
                  B2B contracts (Supply tab) can lock in reliable buyers.
                </div>
              </div>
            )}

            {isOwned && (isHQ || isRD) && (
              <div className="bg-gray-700/50 rounded-lg p-2 space-y-2">
                <div className="text-xs font-bold text-gray-400">
                  {isHQ ? 'Executive Team' : 'Research Team'}
                </div>
                <div className="grid grid-cols-2 gap-1 text-[10px]">
                  <div className="bg-gray-800 rounded px-2 py-1">
                    <div className="text-gray-500">Staff</div>
                    <div>{building.employees} / {building.capacity}</div>
                  </div>
                  <div className="bg-gray-800 rounded px-2 py-1">
                    <div className="text-gray-500">Avg Skill</div>
                    <div className={building.staffSkill >= 6 ? 'text-emerald-400' : building.staffSkill >= 3 ? 'text-yellow-400' : 'text-gray-300'}>
                      {building.staffSkill.toFixed(1)}/9
                    </div>
                  </div>
                </div>
                {isHQ && building.employees > 0 && (
                  <div className="text-[9px] text-emerald-400">
                    ✦ Company productivity +{(building.employees * building.staffSkill * 0.4).toFixed(1)}%
                  </div>
                )}
                {isRD && building.employees > 0 && (
                  <div className="text-[9px] text-emerald-400">
                    ✦ Research speed +{(building.employees * building.staffSkill * 0.3).toFixed(1)}%
                  </div>
                )}
                {/* Hire buttons for different skill tiers */}
                <div className="space-y-1">
                  {[
                    { level: 2, label: 'Junior', costMul: 1.0 },
                    { level: 4, label: 'Mid-Level', costMul: 1.6 },
                    { level: 6, label: 'Senior', costMul: 2.5 },
                  ].map(tier => (
                    <button key={tier.level}
                      onClick={() => setState(prev => prev ? hireStaff(prev, building.id, tier.level) : null)}
                      className="w-full bg-emerald-700 hover:bg-emerald-600 py-1 rounded text-[10px]">
                      + Hire {tier.label} (Skill {tier.level})
                    </button>
                  ))}
                  {building.employees > 0 && (
                    <button onClick={() => setState(prev => prev ? layOffStaff(prev, building.id) : null)}
                      className="w-full bg-red-700 hover:bg-red-600 py-1 rounded text-[10px]">
                      — Lay off 1 employee
                    </button>
                  )}
                </div>
                <div className="text-[9px] text-gray-500">
                  {isHQ
                    ? 'Executives boost ALL your buildings&rsquo; output. Rent space, hire to 100%.'
                    : 'Researchers drive R&D project speed and product quality upgrades.'}
                </div>
              </div>
            )}

            {isOwned && (
              <div className="space-y-2">
                {isProducer && (
                  <>
                    <div>
                      <div className="flex justify-between text-xs font-bold text-gray-400 mb-1">
                        <span>Production Intensity: {(building.productionIntensity * 100).toFixed(0)}%</span>
                        {building.productionIntensity > 1.05 && (
                          <span className="text-amber-400">⚠ quality at risk</span>
                        )}
                      </div>
                      <input type="range" min={0.6} max={1.4} step={0.05} value={building.productionIntensity}
                        onChange={e => setState(prev => prev ? setProductionIntensity(prev, building.id, parseFloat(e.target.value)) : null)}
                        className="w-full" />
                      <div className="text-[9px] text-gray-500">
                        Above 100% lifts output up to +32% but degrades product quality and staff morale.
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs font-bold text-gray-400 mb-1">
                        <span>Safety Stock: {building.safetyStockPolicy === 0 ? 'Just-in-Time' : building.safetyStockPolicy > 0.75 ? 'Heavy Buffer' : 'Balanced'}</span>
                      </div>
                      <input type="range" min={0} max={1} step={0.05} value={building.safetyStockPolicy}
                        onChange={e => setState(prev => prev ? setSafetyStockPolicy(prev, building.id, parseFloat(e.target.value)) : null)}
                        className="w-full" />
                      <div className="text-[9px] text-gray-500">
                        JIT frees cash but stockouts lose sales; buffers ride out supplier failures.
                      </div>
                    </div>
                  </>
                )}
                {isRealEstate && (
                  <div>
                    <div className="text-xs font-bold text-gray-400 mb-1">
                      Asking rent: ${building.rentPerUnit.toFixed(0)}/{building.type === 'apartment' ? 'unit' : 'suite'}/mo
                      {' '}({(building.rentMultiplier * 100).toFixed(0)}% of market)
                    </div>
                    {(() => {
                      const YEAR_TICKS = 24 * 30 * 12;
                      const canAdjust = building.rentLastAdjustedTick === 0 ||
                        state.tick - building.rentLastAdjustedTick >= YEAR_TICKS;
                      const monthsUntil = canAdjust ? 0 :
                        Math.ceil((YEAR_TICKS - (state.tick - building.rentLastAdjustedTick)) / (24 * 30));
                      return (
                        <>
                          <input type="range" min={0.6} max={1.6} step={0.05}
                            value={building.rentMultiplier}
                            disabled={!canAdjust}
                            onChange={e => setState(prev => prev ? setRentMultiplier(prev, building.id, parseFloat(e.target.value)) : null)}
                            className={`w-full ${!canAdjust ? 'opacity-50' : ''}`} />
                          <div className="text-[9px] text-gray-500">
                            {canAdjust
                              ? 'Rent can be adjusted once per year. Existing leases run 3 months at the old rate.'
                              : `🔒 Next adjustment in ${monthsUntil} month(s). Tenants on existing leases.`}
                          </div>
                        </>
                      );
                    })()}
                    <div className="text-[10px] text-gray-400 mt-1 bg-gray-800/60 rounded p-1.5 space-y-0.5">
                      <div className="flex justify-between"><span>Tenants</span><span>{building.tenants} / {building.capacity} units</span></div>
                      <div className="flex justify-between"><span>Level</span><span>Lv {building.level} — upgrade adds {Math.floor(building.capacity * 0.25)} more units</span></div>
                      <div className="flex justify-between"><span>Condition</span><span>{building.condition.toFixed(0)}%</span></div>
                    </div>
                  </div>
                )}
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
                  {!building.forSale ? (
                    <button onClick={() => setListingModal(building.id)}
                      className="flex-1 bg-amber-700 hover:bg-amber-600 px-2 py-1.5 rounded text-xs">
                      🏷️ List for Sale
                    </button>
                  ) : (
                    <button onClick={() => setState(prev => prev ? cancelBuildingSale(prev, building.id) : null)}
                      className="flex-1 bg-gray-600 hover:bg-gray-500 px-2 py-1.5 rounded text-xs">
                      ✕ Cancel Listing
                    </button>
                  )}
                  <button onClick={() => setState(prev => prev ? demolishBuilding(prev, building.id) : null)}
                    className="flex-1 bg-red-700 hover:bg-red-600 px-2 py-1.5 rounded text-xs"
                    title="Demolish instantly for scrap value">
                    💥 Demolish
                  </button>
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
                <div className="bg-gray-700/40 rounded-lg p-2 text-[10px] text-gray-400 space-y-1">
                  <div className="font-bold text-gray-300">How supply works here</div>
                  <div>1. The system sources the cheapest landed-cost supplier for this building&apos;s products.</div>
                  <div>2. Goods ship by truck and appear in this building&apos;s inventory after delivery.</div>
                  <div>3. If you build factories, you can supply yourself instead of buying from rivals.</div>
                  <div>4. Seaport goods are imported at a 28% premium but never run out (great for inputs).</div>
                  <div className="text-gray-500">Stock runs low → order next morning. Empty shelves lose sales.</div>
                </div>
                <div className="text-[10px] text-gray-500">
                  Kitchen consumes bulk ingredients only ({stocked.map(p => p.name).join(', ') || 'none sourced yet'}).
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
                  Imports available here. Prices move with exchange rates and tariffs — watch the FX.
                </div>
                {stocked.map(p => (
                  <div key={p.id} className="flex justify-between bg-gray-700/50 rounded px-2 py-1 text-xs">
                    <span>{p.icon} {p.name}</span>
                    <span className="text-emerald-400">${(p.productionCost * 1.28).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}

            {building.type === 'rd_center' && isOwned && (
              <div className="space-y-2">
                <div className="text-xs font-bold text-gray-400">Research & Development</div>
                <div className="text-[10px] text-gray-500">
                  ~30% of projects fail. Success grants a 5-year patent with up to +15% price premium
                  until it expires and the tech commoditises.
                </div>
                <select value="" onChange={e => e.target.value && setState(prev => prev ? startResearch(prev, building.id, e.target.value) : null)}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white">
                  <option value="">+ Start R&D project…</option>
                  {state.products.filter(p => p.kind === 'consumer' || p.kind === 'semi').map(p => (
                    <option key={p.id} value={p.id}>{p.icon} {p.name} (tech {p.techLevel.toFixed(0)})</option>
                  ))}
                </select>
                {state.researchProjects.filter(p => p.active && p.companyId === playerIdOf(state)).map(proj => {
                  const p = state.products.find(x => x.id === proj.productId);
                  return (
                    <div key={proj.id} className="bg-gray-700/60 rounded p-2 text-xs">
                      <div className="font-medium">{p?.name} — target tech {proj.targetTech}</div>
                      <div className="h-2 bg-gray-800 rounded mt-1">
                        <div className="h-2 bg-cyan-500 rounded" style={{ width: `${Math.min(100, proj.progress)}%` }} />
                      </div>
                      <div className="text-[10px] text-gray-400 mt-0.5">{Math.min(100, proj.progress).toFixed(0)}% complete</div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── SUPPLY TAB ── */}
        {(!isRealEstate && !isHQ && !isRD) && tab === 'supply' && (
          <div className="space-y-2">
            <div className="bg-gray-700/50 rounded-lg p-2 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-gray-300">B2B Supply Contracts</div>
                {isOwned && contractProductIds.length > 0 && (
                  <button
                    onClick={() => setState(prev => prev
                      ? setSupplyMode(prev, building.id, building.supplyMode === 'auto' ? 'manual' : 'auto')
                      : null)}
                    className={`px-2 py-0.5 rounded text-[9px] ${building.supplyMode === 'auto' ? 'bg-emerald-700' : 'bg-amber-700'}`}>
                    {building.supplyMode === 'auto' ? 'AUTO SOURCING' : 'MANUAL CONTRACTS'}
                  </button>
                )}
              </div>
              <div className="text-[9px] text-gray-500">
                Twelve-month agreements lock wholesale price. Repeat orders build loyalty (up to 15% discount).
                Reliability and punctuality improve after successful deliveries; early termination costs three minimum orders.
              </div>

              {isOwned && contractProductIds.length > 0 && (
                <>
                  <select value={selectedContractProduct}
                    onChange={event => setContractProductId(event.target.value)}
                    className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-[10px] text-white">
                    {contractProductIds.map(productId => {
                      const product = state.products.find(item => item.id === productId);
                      return <option key={productId} value={productId}>{product?.name ?? productId}</option>;
                    })}
                  </select>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {contractOffers.slice(0, 6).map(offer => (
                      <div key={offer.supplierBuildingId} className="bg-gray-800/70 rounded p-1.5 text-[9px]">
                        <div className="flex justify-between gap-2">
                          <span className="font-medium">{offer.supplierName} · {offer.supplierCompanyName}</span>
                          <span className="text-emerald-400">${offer.landedCost.toFixed(2)} landed</span>
                        </div>
                        <div className="flex gap-2 text-gray-500">
                          <span>Quality {offer.quality.toFixed(0)}</span>
                          <span>Reliability {offer.reliability.toFixed(0)}%</span>
                          <span>Loyalty −{(offer.loyaltyDiscount * 100).toFixed(1)}%</span>
                        </div>
                        <button
                          onClick={() => setState(prev => prev
                            ? signSupplyContract(prev, building.id, offer.productId, offer.supplierBuildingId)
                            : null)}
                          className="mt-1 w-full bg-blue-700 hover:bg-blue-600 py-0.5 rounded text-[9px]">
                          Sign 12-month contract
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {clientContracts.length > 0 && (
              <div className="bg-gray-700/50 rounded-lg p-2">
                <div className="text-xs font-bold text-gray-300 mb-1">B2B Clients</div>
                {clientContracts.slice(0, 8).map(({ client, contract }) => {
                  const product = state.products.find(item => item.id === contract.productId);
                  const owner = state.companies.find(company => company.id === client.companyId);
                  return (
                    <div key={contract.contractId} className="text-[9px] flex justify-between py-0.5 border-b border-gray-700 last:border-0">
                      <span>{owner?.name ?? 'Private Market'} · {client.name}</span>
                      <span className="text-emerald-400">buys {product?.name}</span>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="text-xs font-bold text-gray-400">Active Contracts & Landed Cost</div>
            {building.supplierLinks.length === 0 ? (
              <p className="text-xs text-gray-500">
                No active contracts. Auto mode will request the lowest landed-cost eligible supplier; manual mode waits for you to sign one.
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
                      <div>
                        ${link.pricePerUnit.toFixed(2)}
                        {(building.supplierRelationships[link.supplierBuildingId] ?? 0) > 0 && (
                          <span className="text-emerald-400 ml-1 text-[8px]" title="B2B Loyalty Discount">
                            -{(Math.min(15, (building.supplierRelationships[link.supplierBuildingId] ?? 0) * 0.15)).toFixed(1)}%
                          </span>
                        )}
                      </div>
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
                  <div className="grid grid-cols-3 gap-1 mt-1 text-[9px] text-gray-500">
                    <span>Reliable {link.reliability.toFixed(0)}%</span>
                    <span>On-time {link.punctuality.toFixed(0)}%</span>
                    <span>Discount {(link.loyaltyDiscount * 100).toFixed(1)}%</span>
                  </div>
                  <div className="text-[9px] text-gray-500">
                    Expires {Math.max(0, Math.ceil((link.expiresTick - state.tick) / (24 * 30)))} months ·
                    MOQ {link.minimumOrder} · {link.noticeMonths}-month notice
                  </div>
                  {isOwned && (
                    <button
                      onClick={() => setState(prev => prev
                        ? terminateSupplyContract(prev, building.id, link.contractId) : null)}
                      className="mt-1 w-full bg-red-900/60 hover:bg-red-800 py-0.5 rounded text-[9px]">
                      Terminate contract early
                    </button>
                  )}
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

        {/* Buy or lease a listed / institutional building (bank/state/private) */}
        {!isOwned && (building.forSale || building.companyId === 'system') && (
          <div className="bg-blue-900/20 border border-blue-700/40 rounded-lg p-2 space-y-2">
            <div className="text-xs font-bold text-blue-300">🏦 On the Property Market</div>
            <div className="text-[10px] text-gray-300">
              {building.name}{' — '}
              {building.askingPrice > 0
                ? <>asking <b>${formatMoney(building.askingPrice)}</b></>
                : <>fair value <b>${formatMoney(building.monthlyFairValue)}</b></>}
            </div>
            <button onClick={() => setState(prev => prev ? buyListedBuilding(prev, building.id, 0) : null)}
              className="w-full bg-emerald-700 hover:bg-emerald-600 py-1.5 rounded text-xs font-bold">
              Buy Outright (${formatMoney(building.askingPrice > 0 ? building.askingPrice : building.monthlyFairValue)})
            </button>
            <button onClick={() => setState(prev => prev ? buyListedBuilding(prev, building.id, 0.75, 120) : null)}
              className="w-full bg-blue-700 hover:bg-blue-600 py-1.5 rounded text-xs">
              Buy with Mortgage (25% down, 10yr)
            </button>
            {(building.type === 'commercial' || building.type === 'retail_store' || isHospitality(building.type)) && (
              <button onClick={() => setState(prev => prev ? leaseBuilding(prev, building.id) : null)}
                className="w-full bg-gray-600 hover:bg-gray-500 py-1.5 rounded text-xs">
                Lease (5yr, ~0.9%/mo of value)
              </button>
            )}
            <div className="text-[9px] text-gray-500">
              Buying transfers ownership; you then hire staff and run it. Leasing lets you operate the
              space without buying, but you keep no resale value.
            </div>
          </div>
        )}

        {/* Acquisition — negotiate with a rival owner */}
        {!isOwned && askingPrice !== null && !building.forSale && building.companyId !== 'system' && (
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

        {listingModal === building.id && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setListingModal(null)}>
            <div className="bg-gray-800 border border-gray-600 rounded-xl p-5 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-white mb-1">List {building.name} for Sale</h3>
              <div className="text-xs text-gray-400 mb-3">
                Estimated fair value: <b className="text-emerald-400">${formatMoney(building.monthlyFairValue)}</b>
              </div>
              <label className="block text-xs text-gray-300 mb-1">Asking Price</label>
              <input type="number" min={1} step={10000} value={effectiveListingPrice}
                onChange={e => setListingPrice(parseInt(e.target.value) || 0)}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white outline-none" />
              <div className="text-[10px] text-gray-500 mt-2">
                The property will remain on the market until an AI buyer meets the asking price or you cancel the listing.
                Valuations are assessed on the first day of each month.
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={() => {
                  setState(prev => prev ? listBuildingForSale(prev, building.id, effectiveListingPrice) : null);
                  setListingModal(null);
                }} className="flex-1 bg-amber-600 hover:bg-amber-500 py-2 rounded font-bold">
                  List Property
                </button>
                <button onClick={() => setListingModal(null)} className="px-4 py-2 bg-gray-600 rounded">Cancel</button>
              </div>
            </div>
          </div>
        )}
          </div>
        )}
      </div>
    </div>
  );
}
