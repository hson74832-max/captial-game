import type { Building, City, GameState } from './types';

// ════════════════════════════════════════════════════════════════════
// ROAD NETWORK
// ════════════════════════════════════════════════════════════════════
// Streets are a uniform grid clipped to the city's own radius.
// Vehicles may ONLY occupy street centrelines and interstate right-of-way.

/**
 * Street spacing. This MUST match `isCityRoad` in world.ts, which is what
 * stamps `tile.road` during map generation and therefore what the renderer
 * actually draws. When these two drifted apart, vehicles drove along a
 * lattice that was never painted — the "cars driving off-road" bug.
 */
export const STREET_SPACING = 4;
export const PARKING_OFFSET = 1.0;

/** Kept for callers that want a default extent; real extent is city.radius. */
export const CITY_ROAD_RADIUS = 13;

export interface RoadNode {
  id: number;
  x: number;
  y: number;
  neighbors: number[];
}

export interface ParkingSlot {
  x: number;
  y: number;
  nodeId: number;
  buildingId: string;
}

export interface RoadNetwork {
  cityId: string;
  nodes: RoadNode[];
  lookup: Map<string, number>;
  parking: ParkingSlot[];
}

/**
 * Per-city street frame. Spacing, per-axis mix and grid origin offsets vary
 * deterministically by city position, so no two cities share a street pattern.
 */
export interface RoadFrame {
  originX: number;
  originY: number;
  spacingX: number;
  spacingY: number;
}

/**
 * The street frame is anchored on the city centre with a uniform 4-tile
 * spacing — identical to `isCityRoad` in world.ts. Do not "improve" this with
 * per-city variation unless world.ts is changed in the same commit, or the
 * painted roads and the driving graph will diverge again.
 */
export function cityRoadFrame(city: City): RoadFrame {
  return {
    originX: city.x,
    originY: city.y,
    spacingX: STREET_SPACING,
    spacingY: STREET_SPACING,
  };
}

/** True when the integer tile lies on a street centreline of its city. */
export function tileIsRoad(tileX: number, tileY: number, city: City): boolean {
  const dx = tileX - city.x;
  const dy = tileY - city.y;
  if (Math.hypot(dx, dy) > city.radius) return false;
  // Mirrors world.ts isCityRoad exactly.
  return ((dx % STREET_SPACING) + STREET_SPACING) % STREET_SPACING === 0
    || ((dy % STREET_SPACING) + STREET_SPACING) % STREET_SPACING === 0;
}

/** Any-city road test. */
export function isRoadTile(cities: City[], x: number, y: number): boolean {
  for (const city of cities) {
    if (tileIsRoad(x, y, city)) return true;
  }
  return false;
}

/**
 * The street intersection a highway ties into when heading toward (x, y). Walks
 * the city grid outward and returns the last node inside the built radius, so the
 * interstate terminates on a real street node rather than empty ground.
 */
export function nearestIntersection(city: City, x: number, y: number): { x: number; y: number } {
  const frame = cityRoadFrame(city);
  const centreX = frame.originX + Math.round((city.x - frame.originX) / frame.spacingX) * frame.spacingX;
  const centreY = frame.originY + Math.round((city.y - frame.originY) / frame.spacingY) * frame.spacingY;
  const dirX = Math.sign(x - city.x);
  const dirY = Math.sign(y - city.y);

  let bestX = centreX;
  let bestY = centreY;
  for (let step = 1; step <= 12; step++) {
    const candX = centreX + dirX * step * frame.spacingX;
    const candY = centreY + dirY * step * frame.spacingY;
    if (Math.hypot(candX - city.x, candY - city.y) > city.radius - 1) break;
    bestX = candX;
    bestY = candY;
  }
  return { x: bestX, y: bestY };
}

/**
 * Every tile the interstate occupies between two endpoints. The route is an
 * L-shape: along one axis, one turn, then the other — an unbroken chain.
 */
export function highwayTiles(
  from: { x: number; y: number }, to: { x: number; y: number },
): Array<[number, number]> {
  const startX = Math.round(from.x);
  const startY = Math.round(from.y);
  const endX = Math.round(to.x);
  const endY = Math.round(to.y);

  const tiles: Array<[number, number]> = [];
  const push = (x: number, y: number) => {
    const last = tiles[tiles.length - 1];
    if (!last || last[0] !== x || last[1] !== y) tiles.push([x, y]);
  };

  const horizontalFirst = Math.abs(endX - startX) >= Math.abs(endY - startY);
  const cornerX = horizontalFirst ? endX : startX;
  const cornerY = horizontalFirst ? startY : endY;

  const stepX1 = Math.sign(cornerX - startX);
  if (stepX1 !== 0) for (let x = startX; x !== cornerX; x += stepX1) push(x, startY);
  const stepY1 = Math.sign(cornerY - startY);
  if (stepY1 !== 0) for (let y = startY; y !== cornerY; y += stepY1) push(cornerX === startX ? startX : cornerX, y);

  push(cornerX, cornerY);

  const stepX2 = Math.sign(endX - cornerX);
  if (stepX2 !== 0) for (let x = cornerX; x !== endX; x += stepX2) push(x, cornerY);
  const stepY2 = Math.sign(endY - cornerY);
  if (stepY2 !== 0) for (let y = cornerY; y !== endY; y += stepY2) push(endX, y);

  push(endX, endY);
  return tiles;
}

/** The city-pair mesh: every city links to its two nearest neighbours. */
export function highwayEdges(cities: City[]): Array<[City, City]> {
  const seen = new Set<string>();
  const edges: Array<[City, City]> = [];
  for (const city of cities) {
    const nearest = cities
      .filter(other => other.id !== city.id)
      .sort((a, b) => Math.hypot(a.x - city.x, a.y - city.y) - Math.hypot(b.x - city.x, b.y - city.y))
      .slice(0, 2);
    for (const other of nearest) {
      const key = city.id < other.id ? `${city.id}|${other.id}` : `${other.id}|${city.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push([city, other]);
    }
  }
  return edges;
}

/**
 * The interstate between two cities, tile for tile.
 *
 * This reproduces `highwayTiles` in world.ts EXACTLY — run east/west along the
 * origin city's row, then north/south along the destination city's column.
 * world.ts is what sets `tile.highway`, i.e. what actually gets painted, so
 * any other route here would send freight across unpainted ground.
 */
export function cityHighway(fromCity: City, toCity: City): Array<[number, number]> {
  const path: Array<[number, number]> = [];
  const stepX = Math.sign(toCity.x - fromCity.x);
  if (stepX !== 0) {
    for (let x = fromCity.x; x !== toCity.x; x += stepX) path.push([x, fromCity.y]);
  }
  const stepY = Math.sign(toCity.y - fromCity.y);
  if (stepY !== 0) {
    for (let y = fromCity.y; y !== toCity.y; y += stepY) path.push([toCity.x, y]);
  }
  path.push([toCity.x, toCity.y]);
  return path;
}

/** Cached highway tile set for the whole map. */
let highwayTileCache: { signature: string; tiles: Set<string> } | null = null;

export function allHighwayTiles(cities: City[]): Set<string> {
  const signature = cities.map(c => `${c.x},${c.y}`).join('|');
  if (highwayTileCache && highwayTileCache.signature === signature) return highwayTileCache.tiles;
  const tiles = new Set<string>();
  for (const [a, b] of highwayEdges(cities)) {
    for (const [x, y] of cityHighway(a, b)) tiles.add(`${x},${y}`);
  }
  highwayTileCache = { signature, tiles };
  return tiles;
}

/** True when a point sits on interstate right-of-way. */
export function isOnHighway(cities: City[], x: number, y: number): boolean {
  return allHighwayTiles(cities).has(`${Math.round(x)},${Math.round(y)}`);
}

/** 0..1 proximity to the interstate mesh. */
export function highwayProximity(cities: City[], x: number, y: number): number {
  const tiles = allHighwayTiles(cities);
  let best = 0;
  for (let r = 0; r <= 6; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (tiles.has(`${Math.round(x) + dx},${Math.round(y) + dy}`)) {
          best = Math.max(best, 1 - r / 6);
          if (best >= 1) return 1;
        }
      }
    }
    if (best > 0) break;
  }
  return best;
}



/** Spiral search for an off-road tile. */
export function snapOffRoad(cities: City[], city: City, x: number, y: number): [number, number] {
  const nx = Math.round(x);
  const ny = Math.round(y);
  if (!tileIsRoad(nx, ny, city) && !isOnHighway(cities, nx, ny)) return [nx, ny];
  const offsets: Array<[number, number]> = [
    [1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1],
  ];
  for (let radius = 1; radius <= 4; radius++) {
    for (const [dx, dy] of offsets) {
      const cx = nx + dx * radius;
      const cy = ny + dy * radius;
      if (!tileIsRoad(cx, cy, city) && !isOnHighway(cities, cx, cy)) return [cx, cy];
    }
  }
  return [nx + 2, ny + 2];
}

// ════════════════════════════════════════════════════════════════════
// NETWORK GRAPH
// ════════════════════════════════════════════════════════════════════
const networkCache = new Map<string, { signature: string; network: RoadNetwork }>();

const networkSignature = (city: City, buildingCount: number) =>
  `${city.x.toFixed(2)}:${city.y.toFixed(2)}:${buildingCount}`;

export function getRoadNetwork(state: GameState, city: City): RoadNetwork {
  const cityBuildings = state.buildings.filter(b => b.cityId === city.id);
  const signature = networkSignature(city, cityBuildings.length);
  const cached = networkCache.get(city.id);
  if (cached && cached.signature === signature) return cached.network;

  const frame = cityRoadFrame(city);
  const steps = Math.ceil(city.radius / STREET_SPACING);
  const nodes: RoadNode[] = [];
  const lookup = new Map<string, number>();

  for (let i = -steps; i <= steps; i++) {
    for (let j = -steps; j <= steps; j++) {
      const x = frame.originX + i * frame.spacingX;
      const y = frame.originY + j * frame.spacingY;
      // Only keep intersections that are genuinely painted as road, so the
      // graph is a strict subset of the visible street network.
      if (!tileIsRoad(x, y, city)) continue;
      lookup.set(`${x},${y}`, nodes.length);
      nodes.push({ id: nodes.length, x, y, neighbors: [] });
    }
  }

  for (const node of nodes) {
    const candidates = [
      `${node.x + frame.spacingX},${node.y}`,
      `${node.x - frame.spacingX},${node.y}`,
      `${node.x},${node.y + frame.spacingY}`,
      `${node.x},${node.y - frame.spacingY}`,
    ];
    for (const key of candidates) {
      const neighborId = lookup.get(key);
      if (neighborId !== undefined) node.neighbors.push(neighborId);
    }
  }

  // Parking spurs: one short stub off the nearest node toward each building.
  const parking: ParkingSlot[] = [];
  const stub: RoadNetwork = { cityId: city.id, nodes, lookup, parking: [] };
  for (const building of cityBuildings) {
    const node = nearestNode(stub, building.x, building.y);
    if (!node) continue;
    const dx = building.x - node.x;
    const dy = building.y - node.y;
    if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) continue;
    const useX = Math.abs(dx) >= Math.abs(dy);
    parking.push({
      x: node.x + (useX ? Math.sign(dx) * PARKING_OFFSET : 0),
      y: node.y + (useX ? 0 : Math.sign(dy) * PARKING_OFFSET),
      nodeId: node.id,
      buildingId: building.id,
    });
  }

  const network: RoadNetwork = { cityId: city.id, nodes, lookup, parking };
  networkCache.set(city.id, { signature, network });
  return network;
}

export function nearestNode(network: RoadNetwork, x: number, y: number): RoadNode | null {
  let best: RoadNode | null = null;
  let bestDistance = Infinity;
  for (const node of network.nodes) {
    const distance = Math.hypot(node.x - x, node.y - y);
    if (distance < bestDistance) { bestDistance = distance; best = node; }
  }
  return best;
}

/** BFS across street segments. Returns waypoints inclusive of both ends. */
export function findRoadPath(network: RoadNetwork, fromId: number, toId: number): Array<[number, number]> {
  if (fromId === toId) {
    const node = network.nodes[fromId];
    return node ? [[node.x, node.y]] : [];
  }
  const previous = new Map<number, number>();
  const visited = new Set<number>([fromId]);
  const queue: number[] = [fromId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === toId) break;
    for (const neighbor of network.nodes[current].neighbors) {
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);
      previous.set(neighbor, current);
      queue.push(neighbor);
    }
  }

  if (!visited.has(toId)) return [];
  const waypoints: Array<[number, number]> = [];
  let cursor: number | undefined = toId;
  while (cursor !== undefined) {
    const node = network.nodes[cursor];
    waypoints.push([node.x, node.y]);
    cursor = previous.get(cursor);
  }
  return waypoints.reverse();
}

/** Picks a random reachable destination and returns the street path to it. */
export function randomRoadRoute(
  network: RoadNetwork, fromX: number, fromY: number, rand: () => number = Math.random,
): Array<[number, number]> {
  if (network.nodes.length === 0) return [];
  const start = nearestNode(network, fromX, fromY);
  if (!start) return [];
  const destination = network.nodes[Math.floor(rand() * network.nodes.length)];
  const path = findRoadPath(network, start.id, destination.id);
  // Every waypoint returned here is a street intersection, and consecutive
  // intersections are orthogonally adjacent, so interpolating between them
  // can never leave the road surface. Kerbside parking bays are deliberately
  // NOT appended: a bay sits one tile off the centreline, which would put the
  // vehicle on a non-road tile at the end of its trip.
  return path;
}

/** Full freight polyline: origin streets → highway leg → destination streets. */
export function buildFreightPolyline(state: GameState, supplier: Building, buyer: Building): Array<[number, number]> {
  const fromCity = state.cities.find(c => c.id === supplier.cityId);
  const toCity = state.cities.find(c => c.id === buyer.cityId);
  if (!fromCity || !toCity) return [[supplier.x, supplier.y], [buyer.x, buyer.y]];

  const fromNetwork = getRoadNetwork(state, fromCity);

  if (fromCity.id === toCity.id) {
    const start = nearestNode(fromNetwork, supplier.x, supplier.y);
    const end = nearestNode(fromNetwork, buyer.x, buyer.y);
    if (!start || !end) return [[supplier.x, supplier.y], [buyer.x, buyer.y]];
    const path = findRoadPath(fromNetwork, start.id, end.id);
    return path.length > 0
      ? [[supplier.x, supplier.y], ...path, [buyer.x, buyer.y]]
      : [[supplier.x, supplier.y], [buyer.x, buyer.y]];
  }

  const toNetwork = getRoadNetwork(state, toCity);
  const originStart = nearestNode(fromNetwork, supplier.x, supplier.y);
  const originExit = nearestNode(fromNetwork, toCity.x, toCity.y);
  const destEntry = nearestNode(toNetwork, fromCity.x, fromCity.y);
  const destEnd = nearestNode(toNetwork, buyer.x, buyer.y);
  if (!originStart || !originExit || !destEntry || !destEnd) {
    return [[supplier.x, supplier.y], [buyer.x, buyer.y]];
  }

  const localOut = findRoadPath(fromNetwork, originStart.id, originExit.id);
  const highway = cityHighway(fromCity, toCity);
  const localIn = findRoadPath(toNetwork, destEntry.id, destEnd.id);

  return [
    [supplier.x, supplier.y],
    ...localOut,
    ...highway.slice(1),
    ...localIn.slice(1),
    [buyer.x, buyer.y],
  ];
}

/** Samples a position along a polyline at 0..1 progress. */
export function samplePolyline(points: Array<[number, number]>, progress: number): { x: number; y: number } {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return { x: points[0][0], y: points[0][1] };

  let total = 0;
  const lengths: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const length = Math.max(0.0001, Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
    lengths.push(length);
    total += length;
  }

  let remaining = total * Math.max(0, Math.min(1, progress));
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i]) {
      const t = remaining / lengths[i];
      return {
        x: points[i][0] + (points[i + 1][0] - points[i][0]) * t,
        y: points[i][1] + (points[i + 1][1] - points[i][1]) * t,
      };
    }
    remaining -= lengths[i];
  }
  const last = points[points.length - 1];
  return { x: last[0], y: last[1] };
}

export function invalidateRoadCache(cityId?: string) {
  if (cityId) networkCache.delete(cityId);
  else networkCache.clear();
  highwayTileCache = null;
}
