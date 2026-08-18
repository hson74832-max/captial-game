import type { GameState, IsometricTile, MovingEntity, Building, City, Camera, BiomeType, BuildingType } from './types';
import { getBuildingConfig, isBuildableTile } from './engine';
import { cityRoadFrame, CITY_ROAD_RADIUS } from './roads';

const TILE_W = 64;
const TILE_H = 32;

// ============= POLYFILLS =============

if (typeof CanvasRenderingContext2D !== 'undefined' && !(CanvasRenderingContext2D.prototype as any).roundRect) {
  (CanvasRenderingContext2D.prototype as any).roundRect = function (x: number, y: number, w: number, h: number, r: number | number[]) {
    let arr: number[];
    if (typeof r === 'number') arr = [r, r, r, r];
    else arr = r as number[];
    this.beginPath();
    this.moveTo(x + arr[0], y);
    this.lineTo(x + w - arr[1], y);
    this.quadraticCurveTo(x + w, y, x + w, y + arr[1]);
    this.lineTo(x + w, y + h - arr[2]);
    this.quadraticCurveTo(x + w, y + h, x + w - arr[2], y + h);
    this.lineTo(x + arr[3], y + h);
    this.quadraticCurveTo(x, y + h, x, y + h - arr[3]);
    this.lineTo(x, y + arr[0]);
    this.quadraticCurveTo(x, y, x + arr[0], y);
    this.closePath();
    return this;
  };
}

// ============= COORDINATE TRANSFORMS =============

export function worldToScreen(wx: number, wy: number, camera: Camera, canvasW: number, canvasH: number): [number, number] {
  const dx = wx - camera.x;
  const dy = wy - camera.y;
  const sx = (dx - dy) * (TILE_W / 2) * camera.zoom + canvasW / 2;
  const sy = (dx + dy) * (TILE_H / 2) * camera.zoom + canvasH / 2;
  return [sx, sy];
}

export function screenToWorld(sx: number, sy: number, camera: Camera, canvasW: number, canvasH: number): [number, number] {
  const relX = (sx - canvasW / 2) / camera.zoom;
  const relY = (sy - canvasH / 2) / camera.zoom;
  const rx = (relX / (TILE_W / 2) + relY / (TILE_H / 2)) / 2;
  const ry = (relY / (TILE_H / 2) - relX / (TILE_W / 2)) / 2;
  return [rx + camera.x, ry + camera.y];
}

// ============= COLOR HELPERS =============

function hex(c: string): [number, number, number] {
  if (c.startsWith('hsl') || c.startsWith('rgb')) return [128, 128, 128];
  const r = parseInt(c.slice(1, 3), 16);
  const g = parseInt(c.slice(3, 5), 16);
  const b = parseInt(c.slice(5, 7), 16);
  return [r, g, b];
}

export function darken(hexStr: string, factor: number): string {
  const parts = hex(hexStr);
  const r = parts[0], g = parts[1], b = parts[2];
  return `rgb(${Math.floor(r * factor)},${Math.floor(g * factor)},${Math.floor(b * factor)})`;
}

export function lighten(hexStr: string, factor: number): string {
  const parts = hex(hexStr);
  const r = parts[0], g = parts[1], b = parts[2];
  return `rgb(${Math.min(255, r + Math.floor((255 - r) * factor))},${Math.min(255, g + Math.floor((255 - g) * factor))},${Math.min(255, b + Math.floor((255 - b) * factor))})`;
}

export function rgba(hexStr: string, alpha: number) {
  const parts = hex(hexStr);
  const r = parts[0], g = parts[1], b = parts[2];
  return `rgba(${r},${g},${b},${alpha})`;
}

// ============= BIOME PALETTE =============

function biomeColor(biome: BiomeType, variant: number): { base: string, side: string, top: string } {
  switch (biome) {
    case 'water':
      return { base: '#1e5d8a', side: '#1a4f73', top: '#2a72a3' };
    case 'beach':
      return { base: '#e8d4a0', side: '#c8b48a', top: '#f0e0b4' };
    case 'grass':
      return { base: '#4a8c5c', side: '#3a7a4a', top: variant % 3 === 0 ? '#5fa572' : variant % 3 === 1 ? '#4d9562' : '#529e63' };
    case 'forest':
      return { base: '#2d6e3a', side: '#225c2c', top: variant % 3 === 0 ? '#3b8a48' : variant % 3 === 1 ? '#327d40' : '#3a8545' };
    case 'mountain':
      return { base: '#8a8278', side: '#6e685e', top: '#a39a8e' };
    case 'hills':
      return { base: '#7a8a4a', side: '#5e6e3a', top: '#8e9d5a' };
    case 'desert':
      return { base: '#d8b97a', side: '#b89d65', top: '#e8c98a' };
    case 'snow':
      return { base: '#e8e8ee', side: '#c8c8d0', top: '#f4f4f8' };
    default:
      return { base: '#4a8c5c', side: '#3a7a4a', top: '#529e63' };
  }
}

// ============= SKY GRADIENT =============

function getSkyColors(state: GameState): { top: string, bottom: string, ambient: number } {
  const t = state.timeOfDay; // 0-1
  // Day: 0.25-0.75, night: 0.75-0.25 (next day)
  if (t < 0.2) {
    // Deep night
    return { top: '#0a1530', bottom: '#1a2848', ambient: 0.3 };
  } else if (t < 0.3) {
    // Dawn
    const f = (t - 0.2) / 0.1;
    return {
      top: mixColor('#0a1530', '#ff7e5f', f * 0.6),
      bottom: mixColor('#1a2848', '#feb47b', f * 0.8),
      ambient: 0.3 + f * 0.5,
    };
  } else if (t < 0.7) {
    // Day
    return { top: '#5fa9d8', bottom: '#a4cae8', ambient: 1 };
  } else if (t < 0.8) {
    // Dusk
    const f = (t - 0.7) / 0.1;
    return {
      top: mixColor('#5fa9d8', '#2a3a6a', f),
      bottom: mixColor('#a4cae8', '#ff8c69', f),
      ambient: 1 - f * 0.5,
    };
  } else {
    return { top: '#0a1530', bottom: '#1a2848', ambient: 0.3 };
  }
}

function mixColor(a: string, b: string, t: number) {
  const [r1, g1, b1] = hex(a);
  const [r2, g2, b2] = hex(b);
  return `rgb(${Math.floor(r1 + (r2 - r1) * t)},${Math.floor(g1 + (g2 - g1) * t)},${Math.floor(b1 + (b2 - b1) * t)})`;
}

// ============= MAIN RENDER =============

export function renderGame(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  tiles: IsometricTile[][],
  entities: MovingEntity[],
  state: GameState,
  hoveredTile: [number, number] | null,
  buildMode: BuildingType | null = null,
) {
  const w = canvas.width;
  const h = canvas.height;
  const cam = state.camera;
  const sky = getSkyColors(state);
  const time = Date.now() / 1000;

  // Sky background
  const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
  skyGrad.addColorStop(0, sky.top);
  skyGrad.addColorStop(1, sky.bottom);
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, w, h);

  // Sun/moon
  drawSunMoon(ctx, w, h, state.timeOfDay);

  // Determine visible range
  const viewRange = 30 + (3 - cam.zoom) * 25;
  const [tlX, tlY] = screenToWorld(0, 0, cam, w, h);
  const [brX, brY] = screenToWorld(w, h, cam, w, h);
  const minX = Math.max(0, Math.floor(Math.min(tlX, tlY, brX, brY) - viewRange));
  const maxX = Math.min(state.mapSize - 1, Math.ceil(Math.max(tlX, tlY, brX, brY) + viewRange));
  const minY = Math.max(0, Math.floor(Math.min(tlX, tlY, brX, brY) - viewRange));
  const maxY = Math.min(state.mapSize - 1, Math.ceil(Math.max(tlX, tlY, brX, brY) + viewRange));

  // Apply ambient lighting
  ctx.save();
  ctx.globalAlpha = sky.ambient;

  // Draw terrain
  drawTerrain(ctx, tiles, state, minX, maxX, minY, maxY, w, h, time);

  // Physical supply routes remain visible in freight mode and while trucks are in transit.
  drawFreightRoutes(ctx, state, w, h);

  // Draw buildings (depth-sorted)
  const sortedBuildings = [...state.buildings]
    .filter(b => b.x >= minX - 10 && b.x <= maxX + 10 && b.y >= minY - 10 && b.y <= maxY + 10)
    .sort((a, b) => (a.x + a.y) - (b.x + b.y));
  for (const building of sortedBuildings) {
    drawBuilding(ctx, building, state, w, h, time);
  }

  // Draw entities
  for (const entity of entities) {
    if (entity.x < minX - 5 || entity.x > maxX + 5 || entity.y < minY - 5 || entity.y > maxY + 5) continue;
    drawEntity(ctx, entity, state, w, h, time);
  }

  ctx.restore();

  // Draw public facilities as small labelled buildings
  for (const facility of state.publicFacilities) {
    if (facility.x < minX - 5 || facility.x > maxX + 5 || facility.y < minY - 5 || facility.y > maxY + 5) continue;
    const [fx, fy] = worldToScreen(facility.x, facility.y, cam, w, h);
    if (fx < -50 || fx > w + 50 || fy < -50 || fy > h + 50) continue;
    const fz = cam.zoom;
    const fh = 14 * fz;
    const fw = 10 * fz;
    // Building body
    const fColor = facility.type === 'city_hall' ? '#fbbf24' :
                    facility.type === 'police_station' ? '#3b82f6' :
                    facility.type === 'fire_department' ? '#ef4444' :
                    facility.type === 'public_hospital' ? '#f43f5e' :
                    facility.type === 'public_school' ? '#8b5cf6' :
                    facility.type === 'public_park' ? '#22c55e' : '#06b6d4';
    ctx.fillStyle = fColor;
    ctx.beginPath();
    ctx.moveTo(fx - fw, fy);
    ctx.lineTo(fx, fy + fw * 0.5);
    ctx.lineTo(fx, fy + fw * 0.5 - fh);
    ctx.lineTo(fx - fw, fy - fh);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = darken(fColor, 0.75);
    ctx.beginPath();
    ctx.moveTo(fx, fy + fw * 0.5);
    ctx.lineTo(fx + fw, fy);
    ctx.lineTo(fx + fw, fy - fh);
    ctx.lineTo(fx, fy + fw * 0.5 - fh);
    ctx.closePath();
    ctx.fill();
    // Roof
    ctx.fillStyle = lighten(fColor, 0.3);
    ctx.beginPath();
    ctx.moveTo(fx - fw, fy - fh);
    ctx.lineTo(fx, fy + fw * 0.5 - fh);
    ctx.lineTo(fx + fw, fy - fh);
    ctx.lineTo(fx, fy - fw * 0.5 - fh);
    ctx.closePath();
    ctx.fill();
    // Label
    if (fz > 0.6) {
      const label = facility.type === 'city_hall' ? '🏛' :
                    facility.type === 'police_station' ? '🚔' :
                    facility.type === 'fire_department' ? '🚒' :
                    facility.type === 'public_hospital' ? '🏥' :
                    facility.type === 'public_school' ? '🎓' :
                    facility.type === 'public_park' ? '🌳' : '📚';
      ctx.font = `${Math.max(8, 11 * fz)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(label, fx, fy - fh - 3 * fz);
    }
  }

  // Hover indicator (outside ambient dim)
  if (hoveredTile) {
    const [sx, sy] = worldToScreen(hoveredTile[0], hoveredTile[1], cam, w, h);
    drawTileHighlight(ctx, sx, sy, cam.zoom);
    if (buildMode) drawPlacementGuide(ctx, hoveredTile, buildMode, tiles, state, w, h);
  }

  // City labels (always visible, with shadow)
  for (const city of state.cities) {
    if (city.x < minX - 5 || city.x > maxX + 5 || city.y < minY - 5 || city.y > maxY + 5) continue;
    const [sx, sy] = worldToScreen(city.x, city.y, cam, w, h);
    if (sx > -150 && sx < w + 150 && sy > -100 && sy < h + 100) {
      drawCityLabel(ctx, city, sx, sy - 50 * cam.zoom, cam.zoom);
    }
  }

  // Night overlay
  if (sky.ambient < 0.9) {
    ctx.fillStyle = `rgba(10, 20, 50, ${(1 - sky.ambient) * 0.4})`;
    ctx.fillRect(0, 0, w, h);
  }
}

function drawSunMoon(ctx: CanvasRenderingContext2D, w: number, h: number, tod: number) {
  // Sun arc during day
  const sunX = w * 0.5 + Math.cos((tod - 0.5) * Math.PI) * w * 0.4;
  const sunY = h * 0.3 - Math.sin((tod - 0.5) * Math.PI) * h * 0.25;
  if (tod > 0.2 && tod < 0.8) {
    const grad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 60);
    grad.addColorStop(0, 'rgba(255, 240, 180, 0.9)');
    grad.addColorStop(0.5, 'rgba(255, 200, 100, 0.3)');
    grad.addColorStop(1, 'rgba(255, 200, 100, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(sunX - 60, sunY - 60, 120, 120);
    ctx.beginPath();
    ctx.arc(sunX, sunY, 25, 0, Math.PI * 2);
    ctx.fillStyle = '#ffe99a';
    ctx.fill();
  } else {
    // Moon
    const moonX = w * 0.5 + Math.cos((tod + 0.5) * Math.PI) * w * 0.4;
    const moonY = h * 0.3 - Math.sin((tod + 0.5) * Math.PI) * h * 0.25;
    ctx.beginPath();
    ctx.arc(moonX, moonY, 18, 0, Math.PI * 2);
    ctx.fillStyle = '#f0eedd';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(moonX - 5, moonY - 3, 16, 0, Math.PI * 2);
    ctx.fillStyle = tod > 0.8 ? '#0a1530' : '#1a2848';
    ctx.fill();
    // Stars
    const starSeed = 42;
    for (let i = 0; i < 50; i++) {
      const sx = ((i * 137 + starSeed) % w);
      const sy = ((i * 251 + starSeed) % (h * 0.4));
      const tw = 0.3 + Math.sin(Date.now() / 1000 + i) * 0.7;
      ctx.fillStyle = `rgba(255,255,255,${tw * 0.6})`;
      ctx.fillRect(sx, sy, 1, 1);
    }
  }
}

// ============= TERRAIN =============

function drawTerrain(ctx: CanvasRenderingContext2D, tiles: IsometricTile[][], state: GameState,
                    minX: number, maxX: number, minY: number, maxY: number, w: number, h: number, time: number) {
  const cam = state.camera;
  const z = cam.zoom;
  const tw = TILE_W * z;
  const th = TILE_H * z;

  for (let y = minY; y <= maxY; y++) {
    if (!tiles[y]) continue;
    for (let x = minX; x <= maxX; x++) {
      const tile = tiles[y][x];
      if (!tile) continue;
      const [sx, sy] = worldToScreen(x, y, cam, w, h);
      if (sx < -tw * 2 || sx > w + tw * 2 || sy < -th * 4 || sy > h + th * 4) continue;

      drawTile(ctx, sx, sy, tile, state, z, time, x === Math.floor(state.camera.x) && y === Math.floor(state.camera.y));
    }
  }
}

function drawTile(ctx: CanvasRenderingContext2D, sx: number, sy: number, tile: IsometricTile,
                  state: GameState, zoom: number, time: number, _isCenter: boolean) {
  const tw = TILE_W * zoom;
  const th = TILE_H * zoom;
  const colors = biomeColor(tile.type, tile.variant);

  // Determine displayed color based on overlay
  let fillTop = colors.top;
  let fillLeft = colors.base;
  let fillRight = colors.side;

  if (state.overlay === 'land_value' && tile.type !== 'water') {
    const lv = Math.min(100, tile.landValue);
    if (lv > 60) { fillTop = `rgb(${Math.floor(231 - (lv - 60) * 0.5)},${Math.floor(76 - (lv - 60) * 0.4)},60)`; }
    else if (lv > 30) { fillTop = `rgb(${Math.floor(241 - (lv - 30) * 0.3)},${Math.floor(196 - (lv - 30) * 0.5)},${Math.floor(15 + (lv - 30) * 1.5)})`; }
    else { fillTop = `rgb(${Math.floor(74 + (30 - lv) * 0.5)},${Math.floor(140 - lv * 0.5)},${Math.floor(92 - lv * 0.3)})`; }
  } else if (state.overlay === 'wage' && state.cities.length > 0) {
    const nearest = state.cities.reduce((best, city) => {
      const d = Math.hypot(city.x - tile.x, city.y - tile.y);
      return d < best.d ? { city, d } : best;
    }, { city: state.cities[0], d: Infinity });
    const norm = Math.min(100, nearest.city.wageRate);
    if (norm < 40) fillTop = `rgb(${Math.floor(34 + norm * 1.2)},${Math.floor(139 - norm * 0.5)},${Math.floor(34)})`;
    else fillTop = `rgb(${Math.floor(231)},${Math.floor(76 - (norm - 40) * 0.5)},${Math.floor(60 - (norm - 40) * 0.3)})`;
  } else if (state.overlay === 'traffic') {
    const nearest = state.cities.reduce((best, city) => {
      const distance = Math.hypot(city.x - tile.x, city.y - tile.y);
      return distance < best.distance ? { city, distance } : best;
    }, { city: state.cities[0], distance: Infinity });
    const density = state.buildings.filter(building => Math.hypot(building.x - tile.x, building.y - tile.y) < 5).length;
    const traffic = Math.min(100, nearest.city.trafficLevel * Math.exp(-nearest.distance / 12) + density * 7);
    fillTop = traffic > 70 ? '#ef442f' : traffic > 40 ? '#f59e0b' : traffic > 18 ? '#eab308' : colors.top;
  } else if (state.overlay === 'demand') {
    const nearest = state.cities.reduce((best, city) => {
      const distance = Math.hypot(city.x - tile.x, city.y - tile.y);
      return distance < best.distance ? { city, distance } : best;
    }, { city: state.cities[0], distance: Infinity });
    const demand = Math.max(0, -Math.min(nearest.city.housingDemand, nearest.city.officeDemand));
    fillTop = demand > 55 ? '#7c3aed' : demand > 25 ? '#3b82f6' : demand > 5 ? '#22d3ee' : colors.top;
  } else if (state.overlay === 'pollution') {
    if (tile.type !== 'water') {
      const pollution = state.buildings.reduce((sum, building) => {
        if (building.type !== 'factory' && building.type !== 'mine') return sum;
        return sum + Math.max(0, 22 - Math.hypot(building.x - tile.x, building.y - tile.y) * 4);
      }, 0);
      fillTop = pollution > 55 ? '#6b3f2d' : pollution > 25 ? '#8b6b3e' : colors.top;
    }
  } else if (state.overlay === 'real_estate') {
    const civic = state.buildings.filter(building => building.type.startsWith('civic_') && Math.hypot(building.x - tile.x, building.y - tile.y) < 9).length;
    const retail = state.buildings.filter(building => building.type === 'retail_store' && Math.hypot(building.x - tile.x, building.y - tile.y) < 7).length;
    const score = tile.landValue + civic * 18 + retail * 10;
    fillTop = score > 105 ? '#a855f7' : score > 70 ? '#6366f1' : score > 35 ? '#38bdf8' : colors.top;
  } else if (state.overlay === 'biome') {
    // Already using biome colors
  }

  // Draw isometric cube
  // Top face
  ctx.beginPath();
  ctx.moveTo(sx, sy - th / 2);
  ctx.lineTo(sx + tw / 2, sy);
  ctx.lineTo(sx, sy + th / 2);
  ctx.lineTo(sx - tw / 2, sy);
  ctx.closePath();
  ctx.fillStyle = fillTop;
  ctx.fill();

  // Right face (darker)
  if (tile.elevation > 0.32 || tile.type === 'mountain' || tile.type === 'hills' || tile.type === 'snow' || tile.type === 'beach') {
    const h = (tile.elevation - 0.3) * 12 * zoom;
    ctx.beginPath();
    ctx.moveTo(sx + tw / 2, sy);
    ctx.lineTo(sx + tw / 2, sy + h);
    ctx.lineTo(sx, sy + th / 2 + h);
    ctx.lineTo(sx, sy + th / 2);
    ctx.closePath();
    ctx.fillStyle = fillRight;
    ctx.fill();
  }

  // Left face
  if (tile.elevation > 0.32 || tile.type === 'mountain' || tile.type === 'hills' || tile.type === 'snow' || tile.type === 'beach') {
    const h = (tile.elevation - 0.3) * 12 * zoom;
    ctx.beginPath();
    ctx.moveTo(sx - tw / 2, sy);
    ctx.lineTo(sx - tw / 2, sy + h);
    ctx.lineTo(sx, sy + th / 2 + h);
    ctx.lineTo(sx, sy + th / 2);
    ctx.closePath();
    ctx.fillStyle = fillLeft;
    ctx.fill();
  }

  // Subtle top edge
  if (tile.type !== 'water' && zoom > 0.6) {
    ctx.strokeStyle = rgba(colors.top, 0.6);
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(sx, sy - th / 2);
    ctx.lineTo(sx + tw / 2, sy);
    ctx.lineTo(sx, sy + th / 2);
    ctx.lineTo(sx - tw / 2, sy);
    ctx.closePath();
    ctx.stroke();
  }

  // Water shimmer
  if (tile.type === 'water' && zoom > 0.5) {
    const shimmer = Math.sin(time * 1.5 + tile.x * 0.5 + tile.y * 0.3) * 0.3 + 0.5;
    ctx.fillStyle = `rgba(255,255,255,${shimmer * 0.15})`;
    ctx.beginPath();
    ctx.moveTo(sx - tw * 0.3, sy + Math.sin(time + tile.x) * 0.5);
    ctx.lineTo(sx - tw * 0.1, sy - th * 0.05 + Math.cos(time + tile.y) * 0.5);
    ctx.lineTo(sx + tw * 0.1, sy + th * 0.05 + Math.sin(time * 1.3 + tile.x) * 0.5);
    ctx.lineTo(sx + tw * 0.3, sy + Math.cos(time + tile.y) * 0.5);
    ctx.closePath();
    ctx.fill();
  }

  // Beach wave
  if (tile.type === 'beach' && zoom > 0.7) {
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx - tw * 0.3, sy + Math.sin(time * 2 + tile.x) * 1.5);
    ctx.quadraticCurveTo(sx, sy - th * 0.1 + Math.sin(time * 2 + tile.y) * 1.5, sx + tw * 0.3, sy + Math.cos(time * 2 + tile.x) * 1.5);
    ctx.stroke();
  }

  // Forest: trees
  if (tile.type === 'forest' && zoom > 0.5) {
    drawTree(ctx, sx, sy - th * 0.5, zoom, tile.variant, time);
  }

  // Mountain: snow cap or peak
  if (tile.type === 'mountain' && zoom > 0.5) {
    drawMountainPeak(ctx, sx, sy, zoom, tile.variant);
  }

  // Snow
  if (tile.type === 'snow' && zoom > 0.5) {
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(sx + (tile.variant + i) * 1.5 - 4, sy - th * 0.3 + i * 2, 1.5 * zoom, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Hills: small bumps
  if (tile.type === 'hills' && zoom > 0.5) {
    ctx.fillStyle = rgba(colors.top, 0.7);
    ctx.beginPath();
    ctx.arc(sx, sy - th * 0.2, 2 * zoom, 0, Math.PI * 2);
    ctx.fill();
  }

  // City roads (grid pattern — spacing varies per city)
  if (tile.cityId && tile.type !== 'water') {
    const city = state.cities.find(c => c.id === tile.cityId);
    if (city) {
      const distFromCenter = Math.hypot(tile.x - city.x, tile.y - city.y);
      if (distFromCenter < CITY_ROAD_RADIUS) {
        const frame = cityRoadFrame(city);
        const inGridX = (((tile.x - frame.originX) % frame.spacingX) + frame.spacingX) % frame.spacingX === 0;
        const inGridY = (((tile.y - frame.originY) % frame.spacingY) + frame.spacingY) % frame.spacingY === 0;
        if (inGridX || inGridY) {
          // Road tile
          ctx.fillStyle = '#3a3a3e';
          ctx.beginPath();
          ctx.moveTo(sx, sy - th / 2);
          ctx.lineTo(sx + tw / 2, sy);
          ctx.lineTo(sx, sy + th / 2);
          ctx.lineTo(sx - tw / 2, sy);
          ctx.closePath();
          ctx.fill();
          // Center line
          ctx.strokeStyle = '#f5d76e';
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(sx, sy - th / 4);
          ctx.lineTo(sx, sy + th / 4);
          ctx.stroke();
        } else if (distFromCenter < 6) {
          // Inner city concrete (CBD area)
          ctx.fillStyle = '#8a8a8a';
          ctx.beginPath();
          ctx.moveTo(sx, sy - th / 2);
          ctx.lineTo(sx + tw / 2, sy);
          ctx.lineTo(sx, sy + th / 2);
          ctx.lineTo(sx - tw / 2, sy);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  }

  // Resource nodes
  if (tile.resource && zoom > 0.6) {
    drawResourceNode(ctx, sx, sy - th * 0.5, zoom, tile.resource.type, time);
  }
}

function drawFreightRoutes(ctx: CanvasRenderingContext2D, state: GameState, canvasW: number, canvasH: number) {
  if (state.freight.length === 0) return;
  ctx.save();
  for (const route of state.freight) {
    const from = state.buildings.find(building => building.id === route.fromBuildingId);
    const to = state.buildings.find(building => building.id === route.toBuildingId);
    if (!from || !to) continue;
    const [fromX, fromY] = worldToScreen(from.x, from.y, state.camera, canvasW, canvasH);
    const [toX, toY] = worldToScreen(to.x, to.y, state.camera, canvasW, canvasH);
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.strokeStyle = state.overlay === 'freight' ? 'rgba(251,191,36,0.95)' : 'rgba(251,191,36,0.28)';
    ctx.lineWidth = state.overlay === 'freight' ? 2 : 1;
    ctx.setLineDash(state.overlay === 'freight' ? [7, 5] : [3, 7]);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();
}

function drawTree(ctx: CanvasRenderingContext2D, x: number, y: number, zoom: number, variant: number, time: number) {
  const s = zoom * 5;
  const sway = Math.sin(time * 0.8 + variant) * 0.5;
  // Trunk
  ctx.fillStyle = '#5a3a1f';
  ctx.fillRect(x - s * 0.12, y + s * 0.3, s * 0.24, s * 0.6);
  // Layered foliage - low poly
  ctx.fillStyle = '#1f5c2c';
  ctx.beginPath();
  ctx.moveTo(x + sway, y - s * 0.6);
  ctx.lineTo(x + s * 0.45 + sway, y + s * 0.3);
  ctx.lineTo(x - s * 0.45 + sway, y + s * 0.3);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#2a7240';
  ctx.beginPath();
  ctx.moveTo(x + sway, y - s * 0.3);
  ctx.lineTo(x + s * 0.35 + sway, y + s * 0.4);
  ctx.lineTo(x - s * 0.35 + sway, y + s * 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#3a8a4a';
  ctx.beginPath();
  ctx.moveTo(x + sway, y - s * 0.05);
  ctx.lineTo(x + s * 0.25 + sway, y + s * 0.45);
  ctx.lineTo(x - s * 0.25 + sway, y + s * 0.45);
  ctx.closePath();
  ctx.fill();
}

function drawMountainPeak(ctx: CanvasRenderingContext2D, x: number, y: number, zoom: number, variant: number) {
  const s = zoom * 8;
  // Triangle peak
  ctx.fillStyle = '#9a8a78';
  ctx.beginPath();
  ctx.moveTo(x, y - s * 0.6);
  ctx.lineTo(x + s * 0.5, y + s * 0.2);
  ctx.lineTo(x - s * 0.5, y + s * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#bda890';
  ctx.beginPath();
  ctx.moveTo(x, y - s * 0.4);
  ctx.lineTo(x + s * 0.3, y + s * 0.2);
  ctx.lineTo(x - s * 0.3, y + s * 0.2);
  ctx.closePath();
  ctx.fill();
  // Snow cap
  if (variant % 2 === 0) {
    ctx.fillStyle = '#f0f0f8';
    ctx.beginPath();
    ctx.moveTo(x, y - s * 0.6);
    ctx.lineTo(x + s * 0.15, y - s * 0.3);
    ctx.lineTo(x - s * 0.15, y - s * 0.3);
    ctx.closePath();
    ctx.fill();
  }
}

function drawResourceNode(ctx: CanvasRenderingContext2D, x: number, y: number, zoom: number, type: string, time: number) {
  const s = zoom * 3;
  const colors: Record<string, string> = {
    iron: '#7a5a4a', coal: '#1a1a1a', gold: '#fbbf24', lithium: '#a78bfa',
    silica: '#e5e7eb', timber: '#8b5a2b', oil: '#3a2a1a', wheat: '#facc15', fish: '#3b82f6',
  };
  const c = colors[type] || '#888';
  // Sparkle
  const pulse = Math.sin(time * 3 + x) * 0.3 + 0.7;
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.arc(x, y - s, s, 0, Math.PI * 2);
  ctx.fill();
  // Sparkle
  if (type === 'gold' || type === 'lithium') {
    ctx.fillStyle = `rgba(255,255,200,${pulse})`;
    ctx.beginPath();
    ctx.arc(x - s * 0.5, y - s * 1.5, s * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  if (type === 'oil') {
    ctx.fillStyle = `rgba(20,20,20,${pulse * 0.7})`;
    ctx.beginPath();
    ctx.ellipse(x, y - s * 0.5, s * 1.5, s * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawTileHighlight(ctx: CanvasRenderingContext2D, sx: number, sy: number, zoom: number) {
  const tw = TILE_W * zoom;
  const th = TILE_H * zoom;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(sx, sy - th / 2);
  ctx.lineTo(sx + tw / 2, sy);
  ctx.lineTo(sx, sy + th / 2);
  ctx.lineTo(sx - tw / 2, sy);
  ctx.closePath();
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.stroke();
  ctx.restore();
}

function drawPlacementGuide(
  ctx: CanvasRenderingContext2D,
  center: [number, number],
  buildMode: BuildingType,
  tiles: IsometricTile[][],
  state: GameState,
  canvasW: number,
  canvasH: number,
) {
  const zoom = state.camera.zoom;
  const tw = TILE_W * zoom;
  const th = TILE_H * zoom;
  // Preview matches the building's real footprint (e.g. a 1x1 kiosk highlights one
  // tile, a 4x4 farm highlights exactly sixteen), not a generic oversized area.
  const cfg = getBuildingConfig(buildMode);
  const halfW = Math.max(0, Math.floor(cfg.w / 2));
  const halfH = Math.max(0, Math.floor(cfg.h / 2));
  const minX = center[0] - halfW;
  const maxX = center[0] + (cfg.w % 2 === 0 ? halfW - 1 : halfW);
  const minY = center[1] - halfH;
  const maxY = center[1] + (cfg.h % 2 === 0 ? halfH - 1 : halfH);

  ctx.save();
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const tile = tiles[y]?.[x];
      if (!tile) continue;
      const valid = isBuildableTile(tile, state, buildMode).ok;
      const [sx, sy] = worldToScreen(x, y, state.camera, canvasW, canvasH);
      ctx.beginPath();
      ctx.moveTo(sx, sy - th / 2);
      ctx.lineTo(sx + tw / 2, sy);
      ctx.lineTo(sx, sy + th / 2);
      ctx.lineTo(sx - tw / 2, sy);
      ctx.closePath();
      ctx.fillStyle = valid ? 'rgba(16,185,129,0.45)' : 'rgba(239,68,68,0.45)';
      ctx.fill();
      ctx.strokeStyle = valid ? 'rgba(74,222,128,1)' : 'rgba(248,113,113,1)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }

  // Outer footprint boundary so the placement size is unmistakable.
  const corners: Array<[number, number]> = [
    [minX - 0.5, minY - 0.5],
    [maxX + 0.5, minY - 0.5],
    [maxX + 0.5, maxY + 0.5],
    [minX - 0.5, maxY + 0.5],
  ];
  ctx.beginPath();
  corners.forEach(([cx, cy], i) => {
    const [sx, sy] = worldToScreen(cx, cy, state.camera, canvasW, canvasH);
    if (i === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  });
  ctx.closePath();
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 4]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Ghost label is drawn above the footprint so the type & size are obvious.
  const [labelX, labelY] = worldToScreen(center[0], minY - 1.2, state.camera, canvasW, canvasH);
  ctx.font = `bold ${Math.max(9, 11 * zoom)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  const text = `${cfg.name}  ${cfg.w}×${cfg.h} tiles`;
  const metrics = ctx.measureText(text);
  ctx.beginPath();
  ctx.roundRect(labelX - metrics.width / 2 - 6, labelY - 11, metrics.width + 12, 16, 4);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillText(text, labelX, labelY);
  ctx.restore();
}

// ============= BUILDING RENDERING =============

const BUILDING_COLORS: Record<string, { wall: string, roof: string, accent: string }> = {
  retail_store: { wall: '#60a5fa', roof: '#3b82f6', accent: '#fbbf24' },
  factory: { wall: '#9ca3af', roof: '#6b7280', accent: '#374151' },
  farm: { wall: '#a16207', roof: '#854d0e', accent: '#65a30d' },
  mine: { wall: '#78716c', roof: '#57534e', accent: '#a8a29e' },
  warehouse: { wall: '#fbbf24', roof: '#d97706', accent: '#92400e' },
  hq: { wall: '#1e293b', roof: '#0f172a', accent: '#fbbf24' },
  rd_center: { wall: '#a78bfa', roof: '#7c3aed', accent: '#fde047' },
  apartment: { wall: '#e9d5ff', roof: '#c084fc', accent: '#7c3aed' },
  commercial: { wall: '#cbd5e1', roof: '#94a3b8', accent: '#475569' },
  media_tv: { wall: '#ef4444', roof: '#b91c1c', accent: '#fbbf24' },
  media_radio: { wall: '#f97316', roof: '#c2410c', accent: '#fde047' },
  media_newspaper: { wall: '#a16207', roof: '#854d0e', accent: '#fef3c7' },
  media_tower: { wall: '#94a3b8', roof: '#64748b', accent: '#ef4444' },
  civic_school: { wall: '#f1f5f9', roof: '#2563eb', accent: '#fbbf24' },
  civic_hospital: { wall: '#f8fafc', roof: '#dc2626', accent: '#ef4444' },
  civic_stadium: { wall: '#d1fae5', roof: '#059669', accent: '#f8fafc' },
  civic_museum: { wall: '#fde68a', roof: '#92400e', accent: '#fef3c7' },
  civic_park: { wall: '#86efac', roof: '#15803d', accent: '#fde047' },
  internet_search: { wall: '#67e8f9', roof: '#0891b2', accent: '#f8fafc' },
  internet_social: { wall: '#c4b5fd', roof: '#7c3aed', accent: '#f8fafc' },
  internet_ecommerce: { wall: '#fdba74', roof: '#ea580c', accent: '#fef3c7' },
  software_company: { wall: '#93c5fd', roof: '#1d4ed8', accent: '#22d3ee' },
  seaport: { wall: '#1e40af', roof: '#1e3a8a', accent: '#fbbf24' },
};

export function getBuildingPalette(type: BuildingType) {
  return BUILDING_COLORS[type] || BUILDING_COLORS.retail_store;
}

function drawBuilding(ctx: CanvasRenderingContext2D, building: Building, state: GameState, canvasW: number, canvasH: number, time: number) {
  const [sx, sy] = worldToScreen(building.x, building.y, state.camera, canvasW, canvasH);
  const zoom = state.camera.zoom;
  const palette = getBuildingPalette(building.type);
  const company = state.companies.find(c => c.id === building.companyId);
  const companyColor = company ? company.color : '#666';
  const isSelected = state.selectedBuilding === building.id;

  const cfg = getBuildingConfig(building.type);
  const baseW = (cfg.w * 0.5) * TILE_W * zoom;
  const baseH = (cfg.h * 0.5) * TILE_H * zoom;
  const height = (12 + building.level * 5) * zoom;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(sx + 2, sy + 2, baseW * 0.7, baseH * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Building base shadow/footprint
  ctx.beginPath();
  ctx.moveTo(sx, sy - baseH / 2);
  ctx.lineTo(sx + baseW / 2, sy);
  ctx.lineTo(sx, sy + baseH / 2);
  ctx.lineTo(sx - baseW / 2, sy);
  ctx.closePath();
  ctx.fillStyle = darken(palette.wall, 0.6);
  ctx.fill();

  // Front (left) face
  ctx.beginPath();
  ctx.moveTo(sx - baseW / 2, sy);
  ctx.lineTo(sx, sy + baseH / 2);
  ctx.lineTo(sx, sy + baseH / 2 - height);
  ctx.lineTo(sx - baseW / 2, sy - height);
  ctx.closePath();
  ctx.fillStyle = palette.wall;
  ctx.fill();
  ctx.strokeStyle = darken(palette.wall, 0.7);
  ctx.lineWidth = 0.5;
  ctx.stroke();

  // Right face
  ctx.beginPath();
  ctx.moveTo(sx, sy + baseH / 2);
  ctx.lineTo(sx + baseW / 2, sy);
  ctx.lineTo(sx + baseW / 2, sy - height);
  ctx.lineTo(sx, sy + baseH / 2 - height);
  ctx.closePath();
  ctx.fillStyle = darken(palette.wall, 0.8);
  ctx.fill();
  ctx.strokeStyle = darken(palette.wall, 0.55);
  ctx.stroke();

  // Roof
  ctx.beginPath();
  ctx.moveTo(sx - baseW / 2, sy - height);
  ctx.lineTo(sx, sy + baseH / 2 - height);
  ctx.lineTo(sx + baseW / 2, sy - height);
  ctx.lineTo(sx, sy - baseH / 2 - height);
  ctx.closePath();
  ctx.fillStyle = palette.roof;
  ctx.fill();

  // Special shapes by building type
  switch (building.type) {
    case 'factory':
      drawFactoryDetails(ctx, sx, sy, baseW, baseH, height, zoom, palette, building, time, isSelected);
      break;
    case 'farm':
      drawFarmDetails(ctx, sx, sy, baseW, baseH, height, zoom, palette, building, time, state);
      break;
    case 'apartment':
      drawApartmentDetails(ctx, sx, sy, baseW, baseH, height, zoom, palette, building, time, state);
      break;
    case 'commercial':
    case 'hq':
    case 'civic_school':
    case 'civic_hospital':
    case 'civic_stadium':
    case 'civic_museum':
    case 'internet_search':
    case 'internet_social':
    case 'internet_ecommerce':
    case 'software_company':
      drawCommercialDetails(ctx, sx, sy, baseW, baseH, height, zoom, palette, building, time, state);
      break;
    case 'civic_park':
      drawTree(ctx, sx, sy - height - 2 * zoom, zoom * 1.4, building.sprite, time);
      break;
    case 'media_tv':
      drawTVStation(ctx, sx, sy, baseW, baseH, height, zoom, palette, building, time);
      break;
    case 'media_radio':
      drawRadioStation(ctx, sx, sy, baseW, baseH, height, zoom, palette, building, time);
      break;
    case 'media_newspaper':
      drawNewspaperBuilding(ctx, sx, sy, baseW, baseH, height, zoom, palette, building);
      break;
    case 'media_tower':
      drawTelecomTower(ctx, sx, sy, baseW, baseH, height, zoom, palette, building, time);
      break;
    case 'seaport':
      drawSeaport(ctx, sx, sy, baseW, baseH, height, zoom, palette, building, time);
      break;
    case 'mine':
      drawMine(ctx, sx, sy, baseW, baseH, height, zoom, palette, building, time);
      break;
    case 'warehouse':
      drawWarehouse(ctx, sx, sy, baseW, baseH, height, zoom, palette, building);
      break;
    case 'rd_center':
      drawRD(ctx, sx, sy, baseW, baseH, height, zoom, palette, building, time);
      break;
    case 'retail_store':
      drawRetail(ctx, sx, sy, baseW, baseH, height, zoom, palette, building, time);
      break;
  }

  // Company color strip
  ctx.fillStyle = companyColor;
  ctx.fillRect(sx - baseW / 2, sy - 1, baseW / 2, 1.5 * zoom);

  // Condition indicator
  if (building.condition < 50 && zoom > 0.7) {
    ctx.fillStyle = `rgba(239, 68, 68, ${0.4 + Math.sin(time * 3) * 0.2})`;
    ctx.beginPath();
    ctx.arc(sx + baseW / 2 - 2, sy - height + 4, 1.5 * zoom, 0, Math.PI * 2);
    ctx.fill();
  }

  // Selection highlight
  if (isSelected) {
    ctx.save();
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(sx - baseW / 2 - 3, sy + 3);
    ctx.lineTo(sx, sy + baseH / 2 + 3);
    ctx.lineTo(sx + baseW / 2 + 3, sy + 3);
    ctx.lineTo(sx + baseW / 2 + 3, sy - height - 3);
    ctx.lineTo(sx - baseW / 2 - 3, sy - height - 3);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  // Label when zoomed in
  if (zoom > 0.9) {
    const fontSize = Math.max(8, 9 * zoom);
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillText(building.name, sx + 1, sy - height - 4 * zoom + 1);
    ctx.fillStyle = '#fff';
    ctx.fillText(building.name, sx, sy - height - 4 * zoom);
    // Real-estate rent tag
    if ((building.type === 'apartment' || building.type === 'commercial') && building.rentPerUnit > 0) {
      ctx.font = `${Math.max(7, 8 * zoom)}px monospace`;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      const rentText = `$${building.rentPerUnit.toFixed(0)}/unit · ${building.occupancy.toFixed(0)}%`;
      const rentW = ctx.measureText(rentText).width;
      ctx.beginPath();
      ctx.roundRect(sx - rentW / 2 - 4, sy + bhRaw(building) * 0.5 * zoom + 6, rentW + 8, 11, 3);
      ctx.fill();
      ctx.fillStyle = building.occupancy > 70 ? '#4ade80' : '#fbbf24';
      ctx.fillText(rentText, sx, sy + bhRaw(building) * 0.5 * zoom + 14.5);
    }
  }
}

function bhRaw(building: Building) {
  return building.height * TILE_H * 0.5;
}

function drawFactoryDetails(ctx: CanvasRenderingContext2D, sx: number, sy: number, baseW: number, _baseH: number, height: number, zoom: number, palette: any, building: Building, time: number, _isSelected: boolean) {
  // Chimney
  const cx = sx + baseW * 0.15;
  const cy = sy - height;
  ctx.fillStyle = darken(palette.wall, 0.5);
  ctx.fillRect(cx, cy - 10 * zoom, 3 * zoom, 10 * zoom);
  // Stripe
  ctx.fillStyle = '#fef3c7';
  ctx.fillRect(cx, cy - 7 * zoom, 3 * zoom, 1 * zoom);
  // Smoke (only when operating)
  if (building.isOperating) {
    const t = time + building.smokeAccum;
    for (let i = 0; i < 3; i++) {
      const age = i * 0.5;
      const puff = (t - age) % 3;
      const px = cx + Math.sin(t * 0.8 - age) * 4 * zoom;
      const py = cy - 10 * zoom - puff * 6 * zoom;
      const size = (1.5 + puff * 0.5) * zoom;
      const alpha = Math.max(0, 0.5 - puff * 0.15);
      ctx.fillStyle = `rgba(220, 220, 220, ${alpha})`;
      ctx.beginPath();
      ctx.arc(px, py, size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Conveyor on side
  ctx.fillStyle = darken(palette.wall, 0.6);
  ctx.fillRect(sx - baseW * 0.4, sy - 3 * zoom, baseW * 0.4, 1.5 * zoom);
  // Roof vent
  ctx.fillStyle = palette.accent;
  ctx.fillRect(sx + baseW * 0.05, sy - height - 2 * zoom, 2 * zoom, 2 * zoom);
  // Windows
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 3; c++) {
      const wx = sx - baseW * 0.35 + c * 4 * zoom;
      const wy = sy - 6 * zoom - r * 6 * zoom;
      ctx.fillStyle = building.isOperating ? 'rgba(255,255,180,0.7)' : 'rgba(80,80,80,0.5)';
      ctx.fillRect(wx, wy, 2.5 * zoom, 2.5 * zoom);
    }
  }
}

function drawFarmDetails(ctx: CanvasRenderingContext2D, sx: number, sy: number, baseW: number, baseH: number, height: number, zoom: number, _palette: any, _building: Building, _time: number, state: GameState) {
  // Barn
  ctx.fillStyle = '#a16207';
  ctx.beginPath();
  ctx.moveTo(sx - baseW * 0.3, sy);
  ctx.lineTo(sx - baseW * 0.3, sy - height * 0.6);
  ctx.lineTo(sx - baseW * 0.1, sy - height);
  ctx.lineTo(sx + baseW * 0.1, sy - height * 0.6);
  ctx.lineTo(sx + baseW * 0.3, sy - height * 0.6);
  ctx.lineTo(sx + baseW * 0.3, sy);
  ctx.closePath();
  ctx.fill();
  // Barn door
  ctx.fillStyle = '#5a3a1f';
  ctx.fillRect(sx - 1.5 * zoom, sy - height * 0.4, 3 * zoom, height * 0.4);
  // Silo
  ctx.fillStyle = '#d4d4d4';
  ctx.beginPath();
  ctx.arc(sx + baseW * 0.25, sy - height * 0.7, 2.5 * zoom, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(sx + baseW * 0.25 - 2.5 * zoom, sy - height * 0.7, 5 * zoom, height * 0.7);
  // Crops - color changes by season
  const seasonColors: Record<string, string> = {
    spring: '#86efac', summer: '#22c55e', autumn: '#f59e0b', winter: '#d6d3d1',
  };
  const cropColor = seasonColors[state.season] || '#22c55e';
  ctx.fillStyle = cropColor;
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 2; j++) {
      const cx = sx - baseW * 0.4 + i * 3 * zoom;
      const cy = sy + baseH * 0.2 + j * 1.5 * zoom;
      ctx.beginPath();
      ctx.arc(cx, cy, 1.2 * zoom, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Rows
  ctx.strokeStyle = darken(cropColor, 0.7);
  ctx.lineWidth = 0.5;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(sx - baseW * 0.4, sy + i * 2 * zoom);
    ctx.lineTo(sx + baseW * 0.3, sy + baseH * 0.3 + i * 1.5 * zoom);
    ctx.stroke();
  }
}

function drawApartmentDetails(ctx: CanvasRenderingContext2D, sx: number, sy: number, baseW: number, _baseH: number, height: number, zoom: number, palette: any, building: Building, _time: number, state: GameState) {
  // Windows grid with light animation
  const isNight = state.timeOfDay < 0.25 || state.timeOfDay > 0.8;
  const winRows = Math.max(2, Math.floor(height / (6 * zoom)));
  const winCols = 3;
  for (let r = 0; r < winRows; r++) {
    for (let c = 0; c < winCols; c++) {
      const wx = sx - baseW * 0.35 + c * 5 * zoom;
      const wy = sy - 5 * zoom - r * 6 * zoom;
      const lit = (r + c + building.sprite) % 3 !== 0;
      if (isNight) {
        ctx.fillStyle = lit ? 'rgba(255, 220, 100, 0.95)' : 'rgba(20, 20, 30, 0.8)';
      } else {
        ctx.fillStyle = lit ? 'rgba(180, 220, 255, 0.6)' : 'rgba(100, 100, 110, 0.4)';
      }
      ctx.fillRect(wx, wy, 3 * zoom, 3.5 * zoom);
    }
  }
  // Balconies
  ctx.fillStyle = darken(palette.wall, 0.6);
  for (let r = 0; r < winRows; r += 2) {
    ctx.fillRect(sx - baseW * 0.45, sy - 4 * zoom - r * 6 * zoom, 1.5 * zoom, 0.8 * zoom);
  }
  // Rooftop antenna
  if (building.sprite % 2 === 0) {
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 0.5 * zoom;
    ctx.beginPath();
    ctx.moveTo(sx, sy - height);
    ctx.lineTo(sx, sy - height - 4 * zoom);
    ctx.stroke();
  }
}

function drawCommercialDetails(ctx: CanvasRenderingContext2D, sx: number, sy: number, baseW: number, baseH: number, height: number, zoom: number, palette: any, building: Building, time: number, state: GameState) {
  const isNight = state.timeOfDay < 0.25 || state.timeOfDay > 0.8;
  const isHQ = building.type === 'hq';
  // Tall windows
  const winRows = Math.max(3, Math.floor(height / (5 * zoom)));
  const winCols = isHQ ? 3 : 2;
  for (let r = 0; r < winRows; r++) {
    for (let c = 0; c < winCols; c++) {
      const wx = sx - baseW * 0.35 + c * 5 * zoom;
      const wy = sy - 4 * zoom - r * 5 * zoom;
      const lit = isHQ ? (r + c) % 2 === 0 : (r * 3 + c) % 4 !== 0;
      if (isNight) {
        ctx.fillStyle = lit ? 'rgba(255, 230, 140, 0.95)' : 'rgba(20, 20, 30, 0.85)';
      } else {
        ctx.fillStyle = 'rgba(140, 200, 240, 0.6)';
      }
      ctx.fillRect(wx, wy, 3 * zoom, 3.5 * zoom);
    }
  }
  if (isHQ) {
    // Antenna / spire
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 0.6 * zoom;
    ctx.beginPath();
    ctx.moveTo(sx, sy - height);
    ctx.lineTo(sx, sy - height - 8 * zoom);
    ctx.stroke();
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(sx, sy - height - 8 * zoom, 1 * zoom, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawTVStation(ctx: CanvasRenderingContext2D, sx: number, sy: number, baseW: number, baseH: number, height: number, zoom: number, palette: any, building: Building, time: number) {
  // Tower
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.5 * zoom;
  ctx.beginPath();
  ctx.moveTo(sx, sy - height);
  ctx.lineTo(sx, sy - height - 16 * zoom);
  ctx.stroke();
  // Cross beams
  for (let i = 0; i < 4; i++) {
    const y = sy - height - 2 * zoom - i * 3.5 * zoom;
    const w = (4 - i) * 0.3 * zoom;
    ctx.beginPath();
    ctx.moveTo(sx - w, y);
    ctx.lineTo(sx + w, y);
    ctx.stroke();
  }
  // Broadcast waves
  const wavePhase = (time * 2) % 1;
  for (let i = 0; i < 3; i++) {
    const r = (wavePhase * 12 + i * 4) * zoom;
    const alpha = Math.max(0, 0.4 - r * 0.02);
    ctx.strokeStyle = `rgba(239, 68, 68, ${alpha})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(sx, sy - height - 16 * zoom, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Blinking light
  const blink = Math.sin(time * 4) > 0;
  if (blink) {
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(sx, sy - height - 16 * zoom, 1.5 * zoom, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawRadioStation(ctx: CanvasRenderingContext2D, sx: number, sy: number, baseW: number, baseH: number, height: number, zoom: number, palette: any, building: Building, time: number) {
  // Short tower
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1.2 * zoom;
  ctx.beginPath();
  ctx.moveTo(sx, sy - height);
  ctx.lineTo(sx, sy - height - 8 * zoom);
  ctx.stroke();
  // Dish
  ctx.fillStyle = '#cbd5e1';
  ctx.beginPath();
  ctx.ellipse(sx + 3 * zoom, sy - height - 6 * zoom, 3 * zoom, 1.5 * zoom, Math.PI / 4, 0, Math.PI * 2);
  ctx.fill();
  // Waves
  const wavePhase = (time * 3) % 1;
  for (let i = 0; i < 2; i++) {
    const r = (wavePhase * 8 + i * 4) * zoom;
    const alpha = Math.max(0, 0.35 - r * 0.04);
    ctx.strokeStyle = `rgba(249, 115, 22, ${alpha})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(sx, sy - height - 8 * zoom, r, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawNewspaperBuilding(ctx: CanvasRenderingContext2D, sx: number, sy: number, baseW: number, baseH: number, height: number, zoom: number, palette: any, building: Building) {
  // Press rollers on side
  ctx.fillStyle = '#475569';
  for (let i = 0; i < 2; i++) {
    ctx.beginPath();
    ctx.arc(sx - baseW * 0.4 + i * 4 * zoom, sy - height * 0.5, 1.5 * zoom, 0, Math.PI * 2);
    ctx.fill();
  }
  // Sign
  ctx.fillStyle = '#fef3c7';
  ctx.fillRect(sx - 4 * zoom, sy - height - 3 * zoom, 8 * zoom, 3 * zoom);
  ctx.fillStyle = '#5a3a1f';
  ctx.font = `${2 * zoom}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('NEWS', sx, sy - height - 1 * zoom);
}

function drawTelecomTower(ctx: CanvasRenderingContext2D, sx: number, sy: number, baseW: number, baseH: number, height: number, zoom: number, palette: any, building: Building, time: number) {
  // Tall lattice tower
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1 * zoom;
  // Triangular frame
  const top = sy - height - 20 * zoom;
  ctx.beginPath();
  ctx.moveTo(sx - 3 * zoom, sy);
  ctx.lineTo(sx, top);
  ctx.lineTo(sx + 3 * zoom, sy);
  ctx.stroke();
  // Cross beams
  for (let i = 0; i < 6; i++) {
    const y = sy - 2 * zoom - i * 3 * zoom;
    const w = (3 - i * 0.4) * zoom;
    ctx.beginPath();
    ctx.moveTo(sx - w, y);
    ctx.lineTo(sx + w, y);
    ctx.stroke();
  }
  // Blinking lights
  for (let i = 0; i < 3; i++) {
    const y = sy - 4 * zoom - i * 5 * zoom;
    const blink = Math.sin(time * 3 + i) > 0;
    if (blink) {
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(sx, y, 1 * zoom, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Top antenna
  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.arc(sx, top, 1.2 * zoom, 0, Math.PI * 2);
  ctx.fill();
}

function drawSeaport(ctx: CanvasRenderingContext2D, sx: number, sy: number, baseW: number, baseH: number, height: number, zoom: number, palette: any, building: Building, time: number) {
  // Cranes
  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 2 * zoom;
  for (let i = 0; i < 2; i++) {
    const cx = sx - baseW * 0.3 + i * baseW * 0.4;
    ctx.beginPath();
    ctx.moveTo(cx, sy - height);
    ctx.lineTo(cx, sy - height - 8 * zoom);
    ctx.lineTo(cx + 6 * zoom, sy - height - 8 * zoom);
    ctx.lineTo(cx + 6 * zoom, sy - height - 4 * zoom);
    ctx.stroke();
  }
  // Shipping containers
  const containerColors = ['#dc2626', '#2563eb', '#16a34a', '#facc15', '#7c3aed'];
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = containerColors[i % containerColors.length];
    ctx.fillRect(sx - baseW * 0.3 + i * 3 * zoom, sy - 3 * zoom, 2.5 * zoom, 2 * zoom);
  }
  // Water below
  const wave = Math.sin(time * 2) * 0.5;
  ctx.fillStyle = 'rgba(59, 130, 246, 0.4)';
  ctx.beginPath();
  ctx.moveTo(sx - baseW * 0.4, sy + baseH * 0.4);
  ctx.quadraticCurveTo(sx, sy + baseH * 0.4 + wave, sx + baseW * 0.4, sy + baseH * 0.4);
  ctx.lineTo(sx + baseW * 0.4, sy + baseH * 0.5);
  ctx.quadraticCurveTo(sx, sy + baseH * 0.5 + wave, sx - baseW * 0.4, sy + baseH * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#f8fafc';
  ctx.font = `bold ${Math.max(5, 6 * zoom)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(building.portKind === 'commercial' ? 'C' : 'I', sx, sy - height * 0.45);
}

function drawMine(ctx: CanvasRenderingContext2D, sx: number, sy: number, baseW: number, baseH: number, height: number, zoom: number, palette: any, building: Building, time: number) {
  // Headframe
  ctx.strokeStyle = '#1f2937';
  ctx.lineWidth = 1.5 * zoom;
  ctx.beginPath();
  ctx.moveTo(sx - 2 * zoom, sy);
  ctx.lineTo(sx - 3 * zoom, sy - height - 4 * zoom);
  ctx.lineTo(sx + 3 * zoom, sy - height - 4 * zoom);
  ctx.lineTo(sx + 2 * zoom, sy);
  ctx.stroke();
  // Pulley wheel
  ctx.fillStyle = '#fbbf24';
  ctx.beginPath();
  ctx.arc(sx, sy - height - 4 * zoom, 1.5 * zoom, 0, Math.PI * 2);
  ctx.fill();
  // Rope
  ctx.strokeStyle = '#5a3a1f';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(sx, sy - height - 4 * zoom);
  ctx.lineTo(sx, sy - height * 0.5);
  ctx.stroke();
  // Cart
  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(sx - 2 * zoom, sy - 4 * zoom, 4 * zoom, 2 * zoom);
  // Pile of ore
  ctx.fillStyle = '#78716c';
  ctx.beginPath();
  ctx.arc(sx + baseW * 0.3, sy - 1, 2 * zoom, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#a8a29e';
  ctx.beginPath();
  ctx.arc(sx + baseW * 0.3 + 1 * zoom, sy - 1.5, 1 * zoom, 0, Math.PI * 2);
  ctx.fill();
}

function drawWarehouse(ctx: CanvasRenderingContext2D, sx: number, sy: number, baseW: number, baseH: number, height: number, zoom: number, palette: any, building: Building) {
  // Loading bay doors
  for (let i = -1; i <= 1; i++) {
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(sx + i * 4 * zoom - 1.5 * zoom, sy - 5 * zoom, 3 * zoom, 5 * zoom);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(sx + i * 4 * zoom - 1.5 * zoom, sy - 5 * zoom, 3 * zoom, 5 * zoom);
  }
  // Sign
  ctx.fillStyle = '#fef3c7';
  ctx.fillRect(sx - 5 * zoom, sy - height - 2 * zoom, 10 * zoom, 2 * zoom);
}

function drawRD(ctx: CanvasRenderingContext2D, sx: number, sy: number, baseW: number, baseH: number, height: number, zoom: number, palette: any, building: Building, time: number) {
  // Lab equipment
  ctx.fillStyle = '#a78bfa';
  ctx.beginPath();
  ctx.arc(sx - baseW * 0.3, sy - 3 * zoom, 2 * zoom, 0, Math.PI * 2);
  ctx.fill();
  // Bubbling flask
  ctx.fillStyle = '#fde047';
  const bubble = Math.sin(time * 4) * 0.5;
  ctx.beginPath();
  ctx.arc(sx - baseW * 0.3 + bubble, sy - 3 * zoom - 1 * zoom, 0.8 * zoom, 0, Math.PI * 2);
  ctx.fill();
  // DNA helix suggestion
  ctx.strokeStyle = '#22d3ee';
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 5; i++) {
    const y = sy - height - i * 1.5 * zoom;
    const x1 = sx + 0.5 * zoom + Math.sin(time * 2 + i) * 1 * zoom;
    const x2 = sx - 0.5 * zoom - Math.sin(time * 2 + i) * 1 * zoom;
    ctx.beginPath();
    ctx.arc(x1, y, 0.5 * zoom, 0, Math.PI * 2);
    ctx.fillStyle = '#22d3ee';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x2, y, 0.5 * zoom, 0, Math.PI * 2);
    ctx.fill();
  }
  // Lab windows
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 3; c++) {
      ctx.fillStyle = 'rgba(167, 139, 250, 0.4)';
      ctx.fillRect(sx - baseW * 0.2 + c * 3 * zoom, sy - 4 * zoom - r * 5 * zoom, 2.5 * zoom, 3 * zoom);
    }
  }
}

function drawRetail(ctx: CanvasRenderingContext2D, sx: number, sy: number, baseW: number, baseH: number, height: number, zoom: number, palette: any, building: Building, time: number) {
  // Awning
  ctx.fillStyle = '#dc2626';
  ctx.beginPath();
  ctx.moveTo(sx - baseW * 0.45, sy - height + 3 * zoom);
  ctx.lineTo(sx + baseW * 0.45, sy - height + 3 * zoom);
  ctx.lineTo(sx + baseW * 0.4, sy - height + 1 * zoom);
  ctx.lineTo(sx - baseW * 0.4, sy - height + 1 * zoom);
  ctx.closePath();
  ctx.fill();
  // Stripes
  ctx.fillStyle = '#fef3c7';
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(sx - baseW * 0.45 + i * baseW * 0.225, sy - height + 3 * zoom, baseW * 0.08, 2 * zoom);
  }
  // Big window
  ctx.fillStyle = 'rgba(200, 230, 255, 0.6)';
  ctx.fillRect(sx - baseW * 0.35, sy - 5 * zoom, baseW * 0.7, 5 * zoom);
  // Door
  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(sx - 1.5 * zoom, sy - 4 * zoom, 3 * zoom, 4 * zoom);
  // Open sign
  const blink = Math.sin(time * 2) > 0;
  if (blink) {
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.arc(sx + baseW * 0.35, sy - 2 * zoom, 1 * zoom, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ============= ENTITY RENDERING =============

function drawEntity(ctx: CanvasRenderingContext2D, entity: MovingEntity, state: GameState, canvasW: number, canvasH: number, time: number) {
  const [sx, sy] = worldToScreen(entity.x, entity.y, state.camera, canvasW, canvasH);
  const zoom = state.camera.zoom;
  if (sx < -30 || sx > canvasW + 30 || sy < -30 || sy > canvasH + 30) return;
  switch (entity.type) {
    case 'car': drawCar(ctx, sx, sy, zoom, entity.color, entity.direction); break;
    case 'truck': drawTruck(ctx, sx, sy, zoom, entity.color, entity.direction, time); break;
    case 'person': drawPerson(ctx, sx, sy, zoom, entity.color); break;
    case 'bus': drawBus(ctx, sx, sy, zoom, entity.color, entity.direction); break;
    case 'freight_truck': drawTruck(ctx, sx, sy, zoom, '#dc2626', entity.direction, time); break;
  }
}

function drawCar(ctx: CanvasRenderingContext2D, x: number, y: number, zoom: number, color: string, dir: number) {
  const s = zoom * 4;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((dir * Math.PI) / 2);
  // Body
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(-s * 1.3, -s * 0.55, s * 2.6, s * 1.1, s * 0.2);
  ctx.fill();
  ctx.strokeStyle = darken(color, 0.6);
  ctx.lineWidth = 0.5;
  ctx.stroke();
  // Roof
  ctx.fillStyle = darken(color, 0.8);
  ctx.beginPath();
  ctx.roundRect(-s * 0.7, -s * 0.4, s * 1.4, s * 0.8, s * 0.1);
  ctx.fill();
  // Windows
  ctx.fillStyle = 'rgba(150, 200, 255, 0.7)';
  ctx.fillRect(-s * 0.55, -s * 0.3, s * 1.1, s * 0.6);
  // Headlights
  ctx.fillStyle = '#fde047';
  ctx.fillRect(s * 1.0, -s * 0.4, s * 0.3, s * 0.2);
  ctx.fillRect(s * 1.0, s * 0.2, s * 0.3, s * 0.2);
  // Wheels
  ctx.fillStyle = '#1f2937';
  ctx.fillRect(-s * 0.9, -s * 0.65, s * 0.4, s * 0.2);
  ctx.fillRect(s * 0.5, -s * 0.65, s * 0.4, s * 0.2);
  ctx.fillRect(-s * 0.9, s * 0.45, s * 0.4, s * 0.2);
  ctx.fillRect(s * 0.5, s * 0.45, s * 0.4, s * 0.2);
  ctx.restore();
}

function drawTruck(ctx: CanvasRenderingContext2D, x: number, y: number, zoom: number, color: string, dir: number, time: number) {
  const s = zoom * 5;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((dir * Math.PI) / 2);
  // Cargo container
  ctx.fillStyle = '#d4d4d4';
  ctx.beginPath();
  ctx.roundRect(-s * 1.6, -s * 0.6, s * 2.2, s * 1.2, s * 0.1);
  ctx.fill();
  ctx.strokeStyle = '#737373';
  ctx.lineWidth = 0.5;
  ctx.stroke();
  // Ribbed pattern
  ctx.strokeStyle = '#a3a3a3';
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(-s * 1.3 + i * s * 0.5, -s * 0.6);
    ctx.lineTo(-s * 1.3 + i * s * 0.5, s * 0.6);
    ctx.stroke();
  }
  // Cabin
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(s * 0.6, -s * 0.55, s * 0.8, s * 1.1, s * 0.1);
  ctx.fill();
  // Windshield
  ctx.fillStyle = 'rgba(150, 200, 255, 0.7)';
  ctx.fillRect(s * 0.95, -s * 0.4, s * 0.4, s * 0.8);
  // Wheels
  ctx.fillStyle = '#1f2937';
  ctx.fillRect(-s * 1.3, -s * 0.7, s * 0.4, s * 0.2);
  ctx.fillRect(-s * 0.3, -s * 0.7, s * 0.4, s * 0.2);
  ctx.fillRect(-s * 1.3, s * 0.5, s * 0.4, s * 0.2);
  ctx.fillRect(-s * 0.3, s * 0.5, s * 0.4, s * 0.2);
  ctx.fillRect(s * 0.7, s * 0.5, s * 0.4, s * 0.2);
  // Headlight
  ctx.fillStyle = '#fde047';
  ctx.fillRect(s * 1.3, -s * 0.3, s * 0.2, s * 0.2);
  // Exhaust
  if (Math.sin(time * 3) > 0) {
    ctx.fillStyle = 'rgba(200, 200, 200, 0.5)';
    ctx.beginPath();
    ctx.arc(-s * 1.6, -s * 0.2, s * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawPerson(ctx: CanvasRenderingContext2D, x: number, y: number, zoom: number, color: string) {
  const s = zoom * 2.5;
  // Body
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x - s * 0.35, y - s * 0.5, s * 0.7, s * 1.1, s * 0.2);
  ctx.fill();
  // Head
  ctx.fillStyle = '#fcd9b4';
  ctx.beginPath();
  ctx.arc(x, y - s * 0.8, s * 0.4, 0, Math.PI * 2);
  ctx.fill();
  // Hair color
  ctx.fillStyle = darken(color, 0.5);
  ctx.beginPath();
  ctx.arc(x, y - s * 0.95, s * 0.3, Math.PI, 0);
  ctx.fill();
  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(x, y + s * 0.6, s * 0.5, s * 0.15, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawBus(ctx: CanvasRenderingContext2D, x: number, y: number, zoom: number, color: string, dir: number) {
  const s = zoom * 6;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((dir * Math.PI) / 2);
  // Body
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(-s * 1.8, -s * 0.6, s * 3.6, s * 1.2, s * 0.1);
  ctx.fill();
  // Top stripe
  ctx.fillStyle = lighten(color, 0.3);
  ctx.fillRect(-s * 1.7, -s * 0.55, s * 3.4, s * 0.15);
  // Windows
  ctx.fillStyle = 'rgba(180, 220, 255, 0.75)';
  for (let i = -3; i <= 3; i++) {
    ctx.fillRect(i * s * 0.5 - s * 0.2, -s * 0.4, s * 0.35, s * 0.5);
  }
  // Wheels
  ctx.fillStyle = '#1f2937';
  ctx.fillRect(-s * 1.4, -s * 0.7, s * 0.5, s * 0.2);
  ctx.fillRect(s * 0.9, -s * 0.7, s * 0.5, s * 0.2);
  ctx.fillRect(-s * 1.4, s * 0.5, s * 0.5, s * 0.2);
  ctx.fillRect(s * 0.9, s * 0.5, s * 0.5, s * 0.2);
  // Headlight
  ctx.fillStyle = '#fde047';
  ctx.fillRect(s * 1.7, -s * 0.2, s * 0.2, s * 0.4);
  ctx.restore();
}

// ============= CITY LABEL =============

function drawCityLabel(ctx: CanvasRenderingContext2D, city: City, x: number, y: number, zoom: number) {
  const fontSize = Math.max(11, 13 * zoom);
  ctx.font = `bold ${fontSize}px sans-serif`;
  const text = city.name;
  const metrics = ctx.measureText(text);
  const padding = 5;

  // Background
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  const rx = x - metrics.width / 2 - padding;
  const ry = y - fontSize / 2 - padding;
  const rw = metrics.width + padding * 2;
  const rh = fontSize + padding * 2;
  ctx.beginPath();
  ctx.roundRect(rx, ry, rw, rh, 4);
  ctx.fill();
  ctx.strokeStyle = city.color;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Text
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);

  // Population
  ctx.font = `bold ${Math.max(9, 10 * zoom)}px sans-serif`;
  ctx.fillStyle = city.color;
  const popText = `Pop: ${formatPop(city.population)}`;
  ctx.fillText(popText, x, y + fontSize * 0.85);
}

function formatPop(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return `${n}`;
}

// ============= MINIMAP =============

export function renderMinimap(ctx: CanvasRenderingContext2D, state: GameState, width: number, height: number) {
  const sky = getSkyColors(state);
  ctx.fillStyle = '#0a1530';
  ctx.fillRect(0, 0, width, height);

  const scale = width / state.mapSize;

  // Draw simplified biomes
  for (let y = 0; y < state.mapSize; y += 2) {
    for (let x = 0; x < state.mapSize; x += 2) {
      // Approximate biome from center
      const seed = state.seed;
      const elevation = Math.sin(x / 20 + seed) * 0.3 + Math.cos(y / 15 + seed) * 0.2 + 0.5;
      const moisture = Math.sin(x / 15 + seed * 2) * 0.3 + Math.cos(y / 20 + seed) * 0.2 + 0.5;
      let c = '#4a8c5c';
      if (elevation < 0.32) c = '#1e5d8a';
      else if (elevation > 0.7) c = moisture > 0.55 ? '#e8e8ee' : '#8a8278';
      else if (moisture > 0.6) c = '#2d6e3a';
      ctx.fillStyle = c;
      ctx.fillRect(x * scale, y * scale, 2 * scale, 2 * scale);
    }
  }

  // Cities
  for (const city of state.cities) {
    ctx.fillStyle = city.color;
    ctx.beginPath();
    ctx.arc(city.x * scale, city.y * scale, city.tier === 'metropolis' ? 6 : city.tier === 'large' ? 5 : 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    if (city.hasSeaport) {
      const port = state.buildings.find(building => building.type === 'seaport' && building.cityId === city.id);
      const px = (port?.x || city.x + 5) * scale;
      const py = (port?.y || city.y + 3) * scale;
      ctx.fillStyle = port?.portKind === 'commercial' ? '#a855f7' : '#2563eb';
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 6px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(port?.portKind === 'commercial' ? 'C' : 'I', px, py + 0.5);
    }
  }

  // Buildings
  for (const building of state.buildings) {
    const company = state.companies.find(c => c.id === building.companyId);
    ctx.fillStyle = company ? company.color : '#666';
    ctx.fillRect(building.x * scale - 0.5, building.y * scale - 0.5, 1.5, 1.5);
  }

  // Camera viewport
  const viewRange = 30 + (3 - state.camera.zoom) * 25;
  const [tlX, tlY] = screenToWorld(0, 0, state.camera, width * 4, height * 4);
  const [brX, brY] = screenToWorld(width * 4, height * 4, state.camera, width * 4, height * 4);
  const minX = Math.max(0, Math.min(tlX, brX));
  const minY = Math.max(0, Math.min(tlY, brY));
  const vw = Math.min(state.mapSize, Math.abs(brX - tlX));
  const vh = Math.min(state.mapSize, Math.abs(brY - tlY));
  ctx.strokeStyle = '#fde047';
  ctx.lineWidth = 1;
  ctx.strokeRect(minX * scale, minY * scale, vw * scale, vh * scale);
}
