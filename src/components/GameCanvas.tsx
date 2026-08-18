'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import type { GameState, IsometricTile, MovingEntity, Camera, BuildingType } from '../game/types';
import { renderGame, renderMinimap, screenToWorld } from '../game/renderer';
import { isBuildableTile, isFootprintBuildable, getBuildingConfig } from '../game/engine';

interface GameCanvasProps {
  gameState: GameState;
  tiles: IsometricTile[][];
  entities: MovingEntity[];
  onCameraChange: (camera: Camera) => void;
  onTileClick: (x: number, y: number) => void;
  onBuildingClick: (buildingId: string) => void;
  onCityClick: (cityId: string) => void;
  buildMode: BuildingType | null;
}

export default function GameCanvas({
  gameState, tiles, entities, onCameraChange, onTileClick, onBuildingClick, onCityClick, buildMode,
}: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const dragged = useRef(false);
  const hoveredTile = useRef<[number, number] | null>(null);
  const animRef = useRef<number>(0);
  const [hoveredInfo, setHoveredInfo] = useState<{ x: number; y: number } | null>(null);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    if (canvas.width !== canvas.clientWidth) canvas.width = canvas.clientWidth;
    if (canvas.height !== canvas.clientHeight) canvas.height = canvas.clientHeight;
    renderGame(ctx, canvas, tiles, entities, gameState, hoveredTile.current, buildMode);
    const minimap = minimapRef.current;
    const mctx = minimap?.getContext('2d');
    if (minimap && mctx) {
      renderMinimap(mctx, gameState, minimap.width, minimap.height);
    }
    animRef.current = requestAnimationFrame(render);
  }, [tiles, entities, gameState, buildMode]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animRef.current);
  }, [render]);

  // Q/E zoom shortcuts
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === 'q') onCameraChange({ ...gameState.camera, zoom: Math.max(0.4, gameState.camera.zoom - 0.15) });
      else if (key === 'e') onCameraChange({ ...gameState.camera, zoom: Math.min(2.8, gameState.camera.zoom + 0.15) });
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [gameState.camera, onCameraChange]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    dragged.current = false;
    lastMouse.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (isDragging.current) {
      const dx = e.clientX - lastMouse.current.x;
      const dy = e.clientY - lastMouse.current.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) dragged.current = true;
      const cam = gameState.camera;
      const speed = 0.04 / cam.zoom;
      onCameraChange({
        ...cam,
        x: cam.x - (dx + dy) * speed * Math.SQRT2,
        y: cam.y - (dy - dx) * speed * Math.SQRT2,
      });
      lastMouse.current = { x: e.clientX, y: e.clientY };
    }
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const [wx, wy] = screenToWorld(mx, my, gameState.camera, canvas.width, canvas.height);
    hoveredTile.current = [Math.round(wx), Math.round(wy)];
    setHoveredInfo({ x: Math.round(wx), y: Math.round(wy) });
  }, [gameState.camera, onCameraChange]);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (dragged.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const [wx, wy] = screenToWorld(mx, my, gameState.camera, canvas.width, canvas.height);
    const tileX = Math.round(wx);
    const tileY = Math.round(wy);

    // Check buildings (with hit area)
    let foundBuilding: string | null = null;
    let bestDist = Infinity;
    for (const b of gameState.buildings) {
      const d = Math.hypot(b.x - tileX, b.y - tileY);
      if (d < b.width / 2 + 0.5 && d < bestDist) {
        bestDist = d;
        foundBuilding = b.id;
      }
    }
    if (foundBuilding && !buildMode) {
      onBuildingClick(foundBuilding);
      return;
    }
    // Check cities
    for (const city of gameState.cities) {
      if (Math.hypot(city.x - tileX, city.y - tileY) < 6) {
        onCityClick(city.id);
        return;
      }
    }
    onTileClick(tileX, tileY);
  }, [gameState, onTileClick, onBuildingClick, onCityClick, buildMode]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    const cam = gameState.camera;
    const zoomDelta = e.deltaY > 0 ? -0.12 : 0.12;
    const newZoom = Math.max(0.4, Math.min(2.8, cam.zoom + zoomDelta));
    onCameraChange({ ...cam, zoom: newZoom });
  }, [gameState.camera, onCameraChange]);

  const hoveredMapTile = hoveredInfo ? tiles[hoveredInfo.y]?.[hoveredInfo.x] : null;
  const hoveredCity = hoveredMapTile?.cityId ? gameState.cities.find(city => city.id === hoveredMapTile.cityId) : null;
  // Placement must satisfy the FULL footprint — a 3x3 factory needs nine clean tiles.
  const buildability = buildMode
    ? isFootprintBuildable(tiles, gameState, buildMode, hoveredInfo?.x ?? 0, hoveredInfo?.y ?? 0)
    : null;
  const buildCfg = buildMode ? getBuildingConfig(buildMode) : null;

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ cursor: buildMode ? 'crosshair' : isDragging.current ? 'grabbing' : 'grab' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleClick}
        onWheel={handleWheel}
        onContextMenu={e => e.preventDefault()}
      />
      {/* Minimap */}
      <div className="absolute bottom-4 right-4 border-2 border-gray-700 rounded-xl overflow-hidden shadow-2xl backdrop-blur-sm" style={{ background: 'rgba(10, 21, 48, 0.85)' }}>
        <canvas ref={minimapRef} width={200} height={140} />
      </div>
      {/* Time of day badge */}
      <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-sm text-white px-3 py-1.5 rounded-lg text-xs font-mono flex items-center gap-2 z-20">
        <span className="text-base">{gameState.timeOfDay > 0.25 && gameState.timeOfDay < 0.75 ? '☀️' : gameState.timeOfDay > 0.2 && gameState.timeOfDay < 0.85 ? '🌅' : '🌙'}</span>
        <span>{String(gameState.hour).padStart(2, '0')}:00</span>
        <span className="text-gray-400">|</span>
        <span>{gameState.season}</span>
      </div>
      {hoveredMapTile && (
        <div className="pointer-events-none absolute bottom-4 left-4 min-w-56 rounded-lg border border-slate-700 bg-slate-950/88 px-3 py-2 text-[10px] text-slate-300 shadow-xl backdrop-blur-sm">
          <div className="flex items-center justify-between gap-4"><span className="font-bold uppercase tracking-widest text-white">Plot {hoveredMapTile.x}, {hoveredMapTile.y}</span><span className="capitalize text-emerald-400">{hoveredMapTile.type}</span></div>
          <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5">
            <span className="text-slate-500">Land value</span><span className="text-right font-mono">${(hoveredMapTile.landValue * 2200).toFixed(0)}/tile</span>
            <span className="text-slate-500">City</span><span className="text-right">{hoveredCity?.name || 'Rural zone'}</span>
            <span className="text-slate-500">Wage rate</span><span className="text-right font-mono">{hoveredCity ? `$${hoveredCity.wageRate.toFixed(0)}` : '-'}</span>
            <span className="text-slate-500">Resource</span><span className="text-right capitalize text-amber-400">{hoveredMapTile.resource?.type || 'none'}</span>
          </div>
          {buildMode && buildCfg && <div className="mt-1 border-t border-slate-800 pt-1 text-slate-400">{buildCfg.name} footprint: <span className="font-mono text-white">{buildCfg.w}×{buildCfg.h} tiles</span></div>}
          {buildMode && <div className={buildability?.ok ? 'text-emerald-300' : 'text-red-300'}>{buildability?.reason || 'Select a plot.'}</div>}
        </div>
      )}
    </div>
  );
}
