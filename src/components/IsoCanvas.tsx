import { useEffect, useRef } from 'react';
import type { Building, GameState, Tile } from '../game/types';
import { BUILDING_CONFIGS, CITY_PAD_ELEVATION, isHospitality } from '../game/constants';
import { canPlace } from '../game/world';
import { landPrice } from '../game/systems';

const TILE_W = 34;
const TILE_H = 17;
const ELEV = 46;

interface Props {
  getState: () => GameState;
  onSelectBuilding: (id: string | null) => void;
  onPlace: (x: number, y: number) => void;
  onHoverInfo: (info: { x: number; y: number; text: string; ok: boolean } | null) => void;
  focusRef: { current: { x: number; y: number } | null };
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.max(0, Math.min(255, Math.round(r * amt)));
  g = Math.max(0, Math.min(255, Math.round(g * amt)));
  b = Math.max(0, Math.min(255, Math.round(b * amt)));
  return `rgb(${r},${g},${b})`;
}

function terrainColor(t: Tile, season: string): string {
  const v = (t.variant - 3.5) * 0.012;
  let base: string;
  switch (t.type) {
    case 'water': base = '#1b4a6b'; break;
    case 'beach': base = '#cfba86'; break;
    case 'grass': base = season === 'winter' ? '#7f8f86' : season === 'autumn' ? '#7d7a3f' : '#4d7f42'; break;
    case 'forest': base = season === 'winter' ? '#3c5245' : season === 'autumn' ? '#6b5527' : '#2f6136'; break;
    case 'hills': base = season === 'winter' ? '#7e8778' : '#5f7c46'; break;
    case 'mountain': base = '#6d7178'; break;
    case 'desert': base = '#bfa165'; break;
    default: base = '#4d7f42';
  }
  return shade(base, 1 + v);
}

export default function IsoCanvas({ getState, onSelectBuilding, onPlace, onHoverInfo, focusRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const camRef = useRef({ x: 0, y: 0, zoom: 1, init: false });
  const dragRef = useRef({ active: false, moved: false, sx: 0, sy: 0, cx: 0, cy: 0 });
  const hoverRef = useRef<{ x: number; y: number } | null>(null);
  const rafRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d', { alpha: false })!;
    let width = 0, height = 0;

    const resize = () => {
      const dpr = Math.min(1.6, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      width = rect.width; height = rect.height;
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const state0 = getState();
    if (!camRef.current.init) {
      const c = state0.cities[0];
      camRef.current = { x: c.x, y: c.y, zoom: 1.05, init: true };
    }

    // ---------- transforms ----------
    const originOf = (cam: { x: number; y: number; zoom: number }) => ({
      ox: width / 2 - (cam.x - cam.y) * (TILE_W / 2) * cam.zoom,
      oy: height / 2 - (cam.x + cam.y) * (TILE_H / 2) * cam.zoom,
    });
    const toScreen = (wx: number, wy: number, elev: number, cam: typeof camRef.current) => {
      const { ox, oy } = originOf(cam);
      return {
        sx: (wx - wy) * (TILE_W / 2) * cam.zoom + ox,
        sy: (wx + wy) * (TILE_H / 2) * cam.zoom - elev * ELEV * cam.zoom + oy,
      };
    };
    /**
     * Inverse projection, elevation-aware.
     *
     * `toScreen` lifts every tile by `elev * ELEV * zoom` pixels. A naive
     * inverse that ignores that lift lands on a tile *below* the one the
     * cursor is actually over — the higher the ground, the bigger the miss.
     * That was the mouse/tile mismatch.
     *
     * Elevation depends on which tile we hit, and which tile we hit depends
     * on elevation, so we solve it by fixed-point iteration: guess flat
     * ground, sample the elevation there, re-solve with that lift added
     * back, repeat. It converges in two or three passes because neighbouring
     * tiles differ only slightly in height.
     */
    const toWorld = (px: number, py: number) => {
      const cam = camRef.current;
      const { ox, oy } = originOf(cam);
      const s = getState();
      const halfW = (TILE_W / 2) * cam.zoom;
      const halfH = (TILE_H / 2) * cam.zoom;
      const dx = (px - ox) / halfW;

      let elev = CITY_PAD_ELEVATION;
      let wx = 0, wy = 0;
      for (let pass = 0; pass < 4; pass++) {
        const dy = (py - oy + elev * ELEV * cam.zoom) / halfH;
        wx = (dy + dx) / 2;
        wy = (dy - dx) / 2;
        const t = s.tiles[Math.round(wy)]?.[Math.round(wx)];
        // Must mirror exactly what the tile renderer uses for its height.
        const sampled = t ? (t.type === 'water' ? 0.29 : t.elevation) : CITY_PAD_ELEVATION;
        if (Math.abs(sampled - elev) < 0.0005) break;
        elev = sampled;
      }
      return { wx, wy };
    };

    // ---------- interaction ----------
    const onDown = (e: PointerEvent) => {
      dragRef.current = { active: true, moved: false, sx: e.clientX, sy: e.clientY, cx: camRef.current.x, cy: camRef.current.y };
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left, py = e.clientY - rect.top;
      const d = dragRef.current;
      if (d.active) {
        const ddx = e.clientX - d.sx, ddy = e.clientY - d.sy;
        if (Math.abs(ddx) + Math.abs(ddy) > 4) d.moved = true;
        const cam = camRef.current;
        const wdx = (ddy / ((TILE_H / 2) * cam.zoom) + ddx / ((TILE_W / 2) * cam.zoom)) / 2;
        const wdy = (ddy / ((TILE_H / 2) * cam.zoom) - ddx / ((TILE_W / 2) * cam.zoom)) / 2;
        const s = getState();
        cam.x = Math.max(0, Math.min(s.mapSize, d.cx - wdx));
        cam.y = Math.max(0, Math.min(s.mapSize, d.cy - wdy));
      }
      const { wx, wy } = toWorld(px, py);
      const tx = Math.round(wx), ty = Math.round(wy);
      hoverRef.current = { x: tx, y: ty };
      const s = getState();
      const t = s.tiles[ty]?.[tx];
      if (s.landMode) {
        const owner = s.landHoldings.find(h => h.x === tx && h.y === ty);
        const price = landPrice(s, tx, ty);
        onHoverInfo(owner
          ? { x: tx, y: ty, ok: false, text: owner.ownerId === s.playerCompanyId ? 'You already hold this title.' : 'Title held by another party.' }
          : price > 0
            ? { x: tx, y: ty, ok: true, text: `${t?.zone ?? 'rural'} parcel — asking $${Math.round(price).toLocaleString()}` }
            : { x: tx, y: ty, ok: false, text: 'This tile cannot be titled.' });
      } else if (s.buildMode) {
        const chk = canPlace(s, s.buildMode, tx, ty);
        onHoverInfo({ x: tx, y: ty, text: chk.reason, ok: chk.ok });
      } else {
        onHoverInfo(t ? { x: tx, y: ty, text: `${t.type}${t.resource ? ` · ${t.resource.type} deposit` : ''} · ${t.zone} zone`, ok: true } : null);
      }
    };
    const onUp = (e: PointerEvent) => {
      const d = dragRef.current;
      d.active = false;
      if (d.moved) return;
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left, py = e.clientY - rect.top;
      const { wx, wy } = toWorld(px, py);
      const tx = Math.round(wx), ty = Math.round(wy);
      const s = getState();
      if (s.buildMode || s.landMode) { onPlace(tx, ty); return; }

      // ── Screen-space building picking ──
      // Matching by tile alone is wrong: a tall tower is drawn far above the
      // tile it stands on, so clicking its roof used to select whatever tile
      // happened to be behind it (or nothing at all). Instead we test the
      // click against each building's actual drawn silhouette and keep the
      // front-most hit, which is exactly what the player sees.
      const cam = camRef.current;
      const z = cam.zoom;
      const halfW = (TILE_W / 2) * z;
      const halfH = (TILE_H / 2) * z;
      let hit: Building | null = null;
      let hitDepth = -Infinity;
      for (const b of s.buildings) {
        const tile = s.tiles[b.y]?.[b.x];
        const elev = tile ? (tile.type === 'water' ? 0.29 : tile.elevation) : CITY_PAD_ELEVATION;
        const { sx, sy } = toScreen(b.x, b.y, elev, cam);
        const cfg = BUILDING_CONFIGS[b.type];
        const h = cfg.height * (1 + (b.level - 1) * 0.16) * 30 * z;
        // The drawn body spans one tile wide and rises `h` above the tile top.
        const inside = px >= sx - halfW && px <= sx + halfW
          && py >= sy - h - halfH && py <= sy + halfH;
        if (!inside) continue;
        const depth = b.x + b.y; // larger = nearer the camera
        if (depth > hitDepth) { hitDepth = depth; hit = b; }
      }
      onSelectBuilding(hit ? hit.id : null);
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const cam = camRef.current;
      cam.zoom = Math.max(0.42, Math.min(2.6, cam.zoom * (e.deltaY > 0 ? 0.9 : 1.1)));
    };
    const onLeave = () => { hoverRef.current = null; onHoverInfo(null); };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    // ---------- drawing ----------
    const drawDiamond = (sx: number, sy: number, z: number, fill: string, stroke?: string) => {
      const hw = (TILE_W / 2) * z, hh = (TILE_H / 2) * z;
      ctx.beginPath();
      ctx.moveTo(sx, sy - hh);
      ctx.lineTo(sx + hw, sy);
      ctx.lineTo(sx, sy + hh);
      ctx.lineTo(sx - hw, sy);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
    };

    const drawBox = (
      sx: number, sy: number, z: number, h: number, top: string, left: string, right: string,
      inset = 0.78,
    ) => {
      const hw = (TILE_W / 2) * z * inset, hh = (TILE_H / 2) * z * inset;
      // left face
      ctx.beginPath();
      ctx.moveTo(sx - hw, sy);
      ctx.lineTo(sx, sy + hh);
      ctx.lineTo(sx, sy + hh - h);
      ctx.lineTo(sx - hw, sy - h);
      ctx.closePath();
      ctx.fillStyle = left; ctx.fill();
      // right face
      ctx.beginPath();
      ctx.moveTo(sx + hw, sy);
      ctx.lineTo(sx, sy + hh);
      ctx.lineTo(sx, sy + hh - h);
      ctx.lineTo(sx + hw, sy - h);
      ctx.closePath();
      ctx.fillStyle = right; ctx.fill();
      // top
      ctx.beginPath();
      ctx.moveTo(sx, sy - hh - h);
      ctx.lineTo(sx + hw, sy - h);
      ctx.lineTo(sx, sy + hh - h);
      ctx.lineTo(sx - hw, sy - h);
      ctx.closePath();
      ctx.fillStyle = top; ctx.fill();
    };

    const render = () => {
      rafRef.current = requestAnimationFrame(render);
      const s = getState();
      const cam = camRef.current;
      if (focusRef.current) {
        cam.x += (focusRef.current.x - cam.x) * 0.18;
        cam.y += (focusRef.current.y - cam.y) * 0.18;
        if (Math.hypot(focusRef.current.x - cam.x, focusRef.current.y - cam.y) < 0.4) focusRef.current = null;
      }
      const z = cam.zoom;
      const t = performance.now() / 1000;

      // sky / background gradient by time of day
      const tod = s.timeOfDay;
      const night = tod < 0.24 || tod > 0.85;
      const dusk = (tod >= 0.72 && tod <= 0.85) || (tod >= 0.24 && tod <= 0.32);
      const bg = night ? '#080d19' : dusk ? '#2a2036' : '#0d1524';
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      // visible tile bounds
      const corners = [toWorld(0, 0), toWorld(width, 0), toWorld(0, height), toWorld(width, height)];
      const minX = Math.max(0, Math.floor(Math.min(...corners.map(c => c.wx)) - 2));
      const maxX = Math.min(s.mapSize - 1, Math.ceil(Math.max(...corners.map(c => c.wx)) + 3));
      const minY = Math.max(0, Math.floor(Math.min(...corners.map(c => c.wy)) - 2));
      const maxY = Math.min(s.mapSize - 1, Math.ceil(Math.max(...corners.map(c => c.wy)) + 14));

      const buildingAt = new Map<string, Building>();
      for (const b of s.buildings) {
        if (b.x >= minX - 2 && b.x <= maxX + 2 && b.y >= minY - 2 && b.y <= maxY + 2) buildingAt.set(`${b.x},${b.y}`, b);
      }
      const hover = hoverRef.current;
      const playerId = s.playerCompanyId;
      const landIndex = new Map<string, 'me' | 'other'>();
      if (s.landMode || s.overlay === 'land') {
        for (const h of s.landHoldings) {
          if (h.x < minX - 1 || h.x > maxX + 1 || h.y < minY - 1 || h.y > maxY + 1) continue;
          landIndex.set(`${h.x},${h.y}`, h.ownerId === playerId ? 'me' : 'other');
        }
      }

      const light = night ? 0.52 : dusk ? 0.76 : 1;

      // iterate in painter order
      for (let sum = minX + minY; sum <= maxX + maxY; sum++) {
        for (let x = minX; x <= maxX; x++) {
          const y = sum - x;
          if (y < minY || y > maxY) continue;
          const tile = s.tiles[y]?.[x];
          if (!tile) continue;
          const elev = tile.type === 'water' ? 0.29 : tile.elevation;
          const { sx, sy } = toScreen(x, y, elev, cam);
          if (sx < -60 || sx > width + 60 || sy < -180 || sy > height + 120) continue;

          let fill = terrainColor(tile, s.season);
          if (tile.type === 'water') {
            const shimmer = 1 + Math.sin(t * 1.4 + (x + y) * 0.6) * 0.09;
            fill = shade('#1b4a6b', shimmer);
          }
          // overlays
          if (s.overlay === 'land') {
            const v = Math.min(1, tile.landValue / 130);
            fill = `rgb(${Math.round(40 + v * 200)},${Math.round(160 - v * 120)},${Math.round(90 - v * 40)})`;
          } else if (s.overlay === 'zone' && tile.cityId) {
            fill = tile.zone === 'commercial' ? '#2c6fa8' : tile.zone === 'residential' ? '#2f8f5c'
              : tile.zone === 'mixed' ? '#a88b2c' : '#a04d3c';
          } else if (s.overlay === 'traffic' && tile.cityId) {
            const c = s.cities.find(cc => cc.id === tile.cityId)!;
            const v = Math.min(1, c.trafficLevel / 100);
            fill = `rgb(${Math.round(60 + v * 190)},${Math.round(150 - v * 120)},60)`;
          } else if (s.overlay === 'pollution' && tile.cityId) {
            const c = s.cities.find(cc => cc.id === tile.cityId)!;
            const v = Math.min(1, c.pollution / 90);
            fill = `rgb(${Math.round(90 + v * 120)},${Math.round(130 - v * 90)},${Math.round(110 - v * 70)})`;
          }

          fill = shade(fill.startsWith('#') ? fill : rgbToHex(fill), light);

          // ground block sides for elevation depth
          const sideH = Math.max(2, elev * ELEV * z * 0.55);
          const hw = (TILE_W / 2) * z, hh = (TILE_H / 2) * z;
          ctx.beginPath();
          ctx.moveTo(sx - hw, sy);
          ctx.lineTo(sx, sy + hh);
          ctx.lineTo(sx, sy + hh + sideH);
          ctx.lineTo(sx - hw, sy + sideH);
          ctx.closePath();
          ctx.fillStyle = shade(rgbToHex(fill), 0.62); ctx.fill();
          ctx.beginPath();
          ctx.moveTo(sx + hw, sy);
          ctx.lineTo(sx, sy + hh);
          ctx.lineTo(sx, sy + hh + sideH);
          ctx.lineTo(sx + hw, sy + sideH);
          ctx.closePath();
          ctx.fillStyle = shade(rgbToHex(fill), 0.46); ctx.fill();

          drawDiamond(sx, sy, z, fill);

          // roads
          if (tile.road || tile.highway) {
            drawDiamond(sx, sy, z * 0.99, shade(tile.highway ? '#2a2c31' : '#33363c', light));
            if (tile.highway && z > 0.7) {
              ctx.strokeStyle = `rgba(220,190,70,${0.5 * light})`;
              ctx.lineWidth = Math.max(1, z);
              ctx.beginPath();
              ctx.moveTo(sx - hw * 0.7, sy - hh * 0.35);
              ctx.lineTo(sx + hw * 0.7, sy + hh * 0.35);
              ctx.stroke();
            }
          }

          // trees & rocks
          if (!tile.road && !tile.highway && z > 0.55) {
            if (tile.type === 'forest' && tile.variant % 3 === 0) {
              const th = 12 * z;
              ctx.fillStyle = shade('#20361f', light);
              ctx.beginPath();
              ctx.moveTo(sx, sy - th);
              ctx.lineTo(sx + 5 * z, sy + 2 * z);
              ctx.lineTo(sx - 5 * z, sy + 2 * z);
              ctx.closePath(); ctx.fill();
            } else if (tile.type === 'mountain' && tile.elevation > 0.79) {
              ctx.fillStyle = shade('#dfe6ee', light);
              drawDiamond(sx, sy - 1, z * 0.55, shade('#dfe6ee', light));
            }
            if (tile.resource && z > 0.75) {
              ctx.fillStyle = `rgba(255,215,120,${0.9 * light})`;
              ctx.beginPath();
              ctx.arc(sx, sy - 4 * z, 2.2 * z, 0, Math.PI * 2);
              ctx.fill();
            }
          }

          // building on this tile
          const b = buildingAt.get(`${x},${y}`);
          if (b) drawBuilding(b);

          // owned land titles
          if ((s.landMode || s.overlay === 'land') && !b) {
            const title = landIndex.get(`${x},${y}`);
            if (title) {
              const own = title === 'me';
              drawDiamond(sx, sy, z * 0.9, own ? 'rgba(52,211,153,0.28)' : 'rgba(148,163,184,0.2)',
                own ? 'rgba(52,211,153,0.8)' : 'rgba(148,163,184,0.5)');
            }
          }

          // hover / build cursor
          if (hover && hover.x === x && hover.y === y) {
            const ok = s.buildMode ? canPlace(s, s.buildMode, x, y).ok : true;
            const landOk = s.landMode && !landIndex.has(`${x},${y}`) && tile.type !== 'water' && !tile.road && !tile.highway;
            drawDiamond(sx, sy, z,
              s.landMode ? (landOk ? 'rgba(250,204,21,0.35)' : 'rgba(230,70,70,0.3)')
                : s.buildMode ? (ok ? 'rgba(70,220,160,0.35)' : 'rgba(230,70,70,0.35)') : 'rgba(255,255,255,0.12)',
              s.landMode ? (landOk ? '#facc15' : '#e04a4a')
                : s.buildMode ? (ok ? '#3ee0a5' : '#e04a4a') : 'rgba(255,255,255,0.5)');
          }
        }
      }

      function drawBuilding(b: Building) {
        const tile = s.tiles[b.y]?.[b.x];
        const elev = tile ? tile.elevation : 0.4;
        const { sx, sy } = toScreen(b.x, b.y, elev, cam);
        const cfg = BUILDING_CONFIGS[b.type];
        const underConstruction = b.constructionEndsTick > s.tick;
        const owner = s.companies.find(c => c.id === b.companyId);
        const isPlayer = b.companyId === playerId;
        const h = cfg.height * (1 + (b.level - 1) * 0.16) * 30 * z;

        if (underConstruction) {
          // scaffold
          const done = 1 - (b.constructionEndsTick - s.tick) / 72;
          drawBox(sx, sy, z, Math.max(4, h * done), shade('#6b6151', light), shade('#4a4338', light), shade('#38322a', light));
          ctx.strokeStyle = `rgba(240,200,80,${light})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(sx - 10 * z, sy - h - 4 * z);
          ctx.lineTo(sx + 10 * z, sy - h - 4 * z);
          ctx.stroke();
          if (z > 0.6) {
            ctx.fillStyle = '#fde68a';
            ctx.font = `${Math.round(8 * z)}px ui-sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText('🏗', sx, sy - h - 8 * z);
          }
          return;
        }

        let top = cfg.roof, side = cfg.color;
        if (s.overlay === 'owners' && owner) { top = owner.color; side = shade(owner.color, 0.7); }
        const dim = b.isOperating ? 1 : 0.55;
        drawBox(sx, sy, z, h,
          shade(top, light * dim), shade(side, light * 0.72 * dim), shade(side, light * 0.55 * dim));

        // windows lit at night
        if (z > 0.6 && (night || dusk) && b.isOperating) {
          const rows = Math.max(1, Math.floor(h / (7 * z)));
          const lit = b.type === 'apartment' ? 0.75 : isHospitality(b.type) ? 0.85 : b.type === 'office' ? 0.4 : 0.5;
          for (let r = 0; r < rows; r++) {
            for (let cix = -1; cix <= 1; cix += 2) {
              if (((b.x * 7 + b.y * 13 + r * 3 + cix) % 10) / 10 > lit) continue;
              ctx.fillStyle = 'rgba(255,214,130,0.85)';
              const wy2 = sy - r * 7 * z - 5 * z;
              ctx.fillRect(sx + cix * 5 * z - 1.5 * z, wy2 + (cix > 0 ? 2 : 2) * z, 2.4 * z, 2.4 * z);
            }
          }
        }

        // icon + owner flag
        if (z > 0.72) {
          ctx.font = `${Math.round(11 * z)}px ui-sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText(cfg.icon, sx, sy - h - 4 * z);
        }
        if (isPlayer) {
          ctx.fillStyle = owner?.color ?? '#22d3a7';
          ctx.beginPath();
          ctx.arc(sx, sy - h - 14 * z, 2.6 * z, 0, Math.PI * 2);
          ctx.fill();
        }
        if (b.forSale && z > 0.6) {
          ctx.fillStyle = 'rgba(250,204,21,0.95)';
          ctx.fillRect(sx + 6 * z, sy - h - 12 * z, 12 * z, 6 * z);
          ctx.fillStyle = '#1c1917';
          ctx.font = `${Math.round(4.4 * z)}px ui-sans-serif`;
          ctx.fillText('SALE', sx + 12 * z, sy - h - 7.6 * z);
        }
        if (b.id === s.selectedBuildingId) {
          ctx.strokeStyle = '#f8fafc';
          ctx.lineWidth = 2;
          const hw2 = (TILE_W / 2) * z * 0.8, hh2 = (TILE_H / 2) * z * 0.8;
          ctx.beginPath();
          ctx.moveTo(sx, sy - hh2); ctx.lineTo(sx + hw2, sy);
          ctx.lineTo(sx, sy + hh2); ctx.lineTo(sx - hw2, sy);
          ctx.closePath(); ctx.stroke();
          // vertical beacon
          ctx.strokeStyle = 'rgba(248,250,252,0.35)';
          ctx.beginPath(); ctx.moveTo(sx, sy - h - 6 * z); ctx.lineTo(sx, sy - h - 30 * z); ctx.stroke();
        }
        // utilisation bar for player assets
        if (isPlayer && z > 0.8 && !isProperty2(b.type)) {
          const w = 16 * z;
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.fillRect(sx - w / 2, sy - h - 20 * z, w, 3 * z);
          ctx.fillStyle = b.profit >= 0 ? '#34d399' : '#f87171';
          ctx.fillRect(sx - w / 2, sy - h - 20 * z, w * Math.min(1, b.utilization / 100), 3 * z);
        }
      }

      // ---- vehicles ----
      for (const a of s.agents) {
        if (a.x < minX || a.x > maxX || a.y < minY || a.y > maxY) continue;
        const tile = s.tiles[Math.round(a.y)]?.[Math.round(a.x)];
        const { sx, sy } = toScreen(a.x, a.y, tile ? tile.elevation : 0.36, cam);
        if (a.kind === 'car') {
          ctx.fillStyle = shade(a.color, light);
          ctx.fillRect(sx - 3 * z, sy - 3.4 * z, 6 * z, 3.4 * z);
          if (night) {
            ctx.fillStyle = 'rgba(255,240,180,0.8)';
            ctx.fillRect(sx + 2.5 * z, sy - 3 * z, 1.6 * z, 1.2 * z);
          }
        } else {
          ctx.fillStyle = shade('#e8c9a0', light);
          ctx.fillRect(sx - 1.1 * z, sy - 4 * z, 2.2 * z, 4 * z);
        }
      }

      // ---- contracted pipeline convoys (processing then cold-chain transit) ----
      for (const o of s.pipeline) {
        if (o.processingHoursLeft > 0) continue;
        const transitTotal = Math.max(2, Math.ceil(Math.hypot(o.fromX - o.toX, o.fromY - o.toY) * 1.1));
        const t2 = Math.max(0, Math.min(1, 1 - o.transitHoursLeft / transitTotal));
        const wx = o.fromX + (o.toX - o.fromX) * t2;
        const wy = o.fromY + (o.toY - o.fromY) * t2;
        if (wx < minX - 2 || wx > maxX + 2 || wy < minY - 2 || wy > maxY + 2) continue;
        const tile = s.tiles[Math.round(wy)]?.[Math.round(wx)];
        const { sx, sy } = toScreen(wx, wy, tile ? tile.elevation : 0.36, cam);
        ctx.fillStyle = shade(o.companyColor, light * 0.92);
        ctx.fillRect(sx - 5.5 * z, sy - 6 * z, 11 * z, 5 * z);
        ctx.fillStyle = shade(o.perishable ? '#7dd3fc' : '#cbd5e1', light);
        ctx.fillRect(sx + 3 * z, sy - 6.5 * z, 3.5 * z, 3.5 * z);
      }

      // ---- freight trucks ----
      for (const f of s.freight) {
        const wx = f.fromX + (f.toX - f.fromX) * f.progress;
        const wy = f.fromY + (f.toY - f.fromY) * f.progress;
        if (wx < minX - 2 || wx > maxX + 2 || wy < minY - 2 || wy > maxY + 2) continue;
        const tile = s.tiles[Math.round(wy)]?.[Math.round(wx)];
        const { sx, sy } = toScreen(wx, wy, tile ? tile.elevation : 0.36, cam);
        ctx.fillStyle = shade(f.companyColor, light * 0.9);
        ctx.fillRect(sx - 5 * z, sy - 6 * z, 10 * z, 5 * z);
        ctx.fillStyle = shade('#cbd5e1', light);
        ctx.fillRect(sx + 3 * z, sy - 6.5 * z, 3.5 * z, 3.5 * z);
      }

      // ---- city labels ----
      if (z > 0.55) {
        for (const c of s.cities) {
          if (c.x < minX - 8 || c.x > maxX + 8 || c.y < minY - 8 || c.y > maxY + 8) continue;
          const tile = s.tiles[c.y]?.[c.x];
          const { sx, sy } = toScreen(c.x, c.y, tile ? tile.elevation : 0.35, cam);
          ctx.font = `600 ${Math.round(11 * Math.min(1.4, z))}px ui-sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillStyle = 'rgba(0,0,0,0.55)';
          const label = `${c.name} · ${(c.population / 1000).toFixed(0)}k`;
          const w = ctx.measureText(label).width + 10;
          ctx.fillRect(sx - w / 2, sy - 62 * z, w, 15);
          ctx.fillStyle = '#e2e8f0';
          ctx.fillText(label, sx, sy - 51 * z);
        }
      }

      // night vignette
      if (night || dusk) {
        const g = ctx.createRadialGradient(width / 2, height / 2, height * 0.2, width / 2, height / 2, height * 0.95);
        g.addColorStop(0, 'rgba(6,10,22,0)');
        g.addColorStop(1, night ? 'rgba(4,7,18,0.55)' : 'rgba(30,16,40,0.35)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, width, height);
      }
    };

    rafRef.current = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, [getState, onSelectBuilding, onPlace, onHoverInfo]);

  return <canvas ref={canvasRef} className="h-full w-full touch-none select-none" />;
}

function isProperty2(t: string) { return t === 'apartment' || t === 'office'; }

function rgbToHex(rgb: string): string {
  if (rgb.startsWith('#')) return rgb;
  const m = rgb.match(/\d+/g);
  if (!m) return '#000000';
  return `#${m.slice(0, 3).map(v => Number(v).toString(16).padStart(2, '0')).join('')}`;
}
