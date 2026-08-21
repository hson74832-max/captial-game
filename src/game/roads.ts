import type { City, GameState, Building } from './types';

// ============= ROAD NETWORK =============
// Streets are a grid of segments spaced per-city, clipped to CITY_ROAD_RADIUS.
// Vehicles may ONLY occupy road segments or parking spurs attached to a node.

export const CITY_ROAD_RADIUS = 13;
export const PARKING_OFFSET = 1.0;

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

export function cityRoadFrame(city: City): RoadFrame {
  const h1 = Math.abs(Math.sin(city.x * 127.1 + city.y * 311.7) * 43758.5453) % 1;
  const h2 = Math.abs(Math.sin(city.x * 269.5 + city.y * 183.3) * 24634.6345) % 1;
  const h3 = Math.abs(Math.sin(city.x * 419.2 + city.y * 97.2) * 15731.7492) % 1;
  const spacingX = [4, 5, 6][Math.floor(h1 * 3)];
  const spacingY = [5, 6, 4][Math.floor(h2 * 3)];
  const offsetX = Math.floor(h3 * spacingX);
  const offsetY = Math.floor(h1 * spacingY);
  return {
    originX: Math.floor(city.x / spacingX) * spacingX + offsetX,
    originY: Math.floor(city.y / spacingY) * spacingY + offsetY,
    spacingX,
    spacingY,
  };
}

/** True when the integer tile lies on a street centreline of its city. */
export function tileIsRoad(tileX: number, tileY: number, city: City): boolean {
  if (Math.hypot(tileX - city.x, tileY - city.y) >= CITY_ROAD_RADIUS) return false;
  const frame = cityRoadFrame(city);
  const onVertical = (((tileX - frame.originX) % frame.spacingX) + frame.spacingX) % frame.spacingX === 0;
  const onHorizontal = (((tileY - frame.originY) % frame.spacingY) + frame.spacingY) % frame.spacingY === 0;
  return onVertical || onHorizontal;
}

/** Any-city road test. */
export function isRoadTile(cities: City[], x: number, y: number): boolean {
  for (const city of cities) {
    if (Math.hypot(x - city.x, y - city.y) < CITY_ROAD_RADIUS && tileIsRoad(x, y, city)) return true;
  }
  return false;
}

/**
 * The street intersection a highway ties into when heading toward (x, y).
 * Walks the city grid outward and returns the last node inside the built radius,
 * so the interstate terminates on a real street node rather than empty ground.
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
    if (Math.hypot(candX - city.x, candY - city.y) > CITY_ROAD_RADIUS - 1) break;
    bestX = candX;
    bestY = candY;
  }
  return { x: bestX, y: bestY };
}

/**
 * Every tile the interstate occupies between two endpoints. The route is an
 * L-shape: along one axis, one turn, then the other — an unbroken chain with
 * no diagonal gaps.
 */
export function highwayTiles(
  from: { x: number; y: number },
  to: { x: number; y: number },
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

/** Cached highway tile set for the whole map. */
let highwayTileCache: { signature: string; tiles: Set<string> } | null = null;

export function allHighwayTiles(cities: City[]): Set<string> {
  const signature = cities.map(c => `${c.x},${c.y}`).join('|');
  if (highwayTileCache && highwayTileCache.signature === signature) return highwayTileCache.tiles;
  const tiles = new Set<string>();
  for (const [a, b] of highwayEdges(cities)) {
    const exit = nearestIntersection(a, b.x, b.y);
    const entry = nearestIntersection(b, a.x, a.y);
    for (const [x, y] of highwayTiles(exit, entry)) tiles.add(`${x},${y}`);
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

/** The interstate between two cities, as drawn. */
export function cityHighway(fromCity: City, toCity: City): Array<[number, number]> {
  const exit = nearestIntersection(fromCity, toCity.x, toCity.y);
  const entry = nearestIntersection(toCity, fromCity.x, fromCity.y);
  return highwayTiles(exit, entry);
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

// ============= NETWORK GRAPH =============
const networkCache = new Map<string, { signature: string; network: RoadNetwork }>();

function networkSignature(city: City, buildingCount: number): string {
  return `${city.x.toFixed(2)}:${city.y.toFixed(2)}:${buildingCount}`;
}

export function getRoadNetwork(state: GameState, city: City): RoadNetwork {
  const cityBuildings = state.buildings.filter(b => b.cityId === city.id);
  const signature = networkSignature(city, cityBuildings.length);
  const cached = networkCache.get(city.id);
  if (cached && cached.signature === signature) return cached.network;

  const frame = cityRoadFrame(city);
  const minSpacing = Math.min(frame.spacingX, frame.spacingY);
  const steps = Math.ceil(CITY_ROAD_RADIUS / minSpacing);
  const nodes: RoadNode[] = [];
  const lookup = new Map<string, number>();

  for (let i = -steps; i <= steps; i++) {
    for (let j = -steps; j <= steps; j++) {
      const x = frame.originX + i * frame.spacingX;
      const y = frame.originY + j * frame.spacingY;
      if (Math.hypot(x - city.x, y - city.y) > CITY_ROAD_RADIUS) continue;
      const id = nodes.length;
      lookup.set(`${x},${y}`, id);
      nodes.push({ id, x, y, neighbors: [] });
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
  if (path.length === 0) return [];
  if (rand() < 0.35) {
    const bays = network.parking.filter(slot => slot.nodeId === destination.id);
    if (bays.length > 0) {
      const bay = bays[Math.floor(rand() * bays.length)];
      path.push([bay.x, bay.y]);
    }
  }
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

  const segments: Array<[number, number]> = [
    [supplier.x, supplier.y],
    ...localOut,
    ...highway.slice(1),
    ...localIn.slice(1),
    [buyer.x, buyer.y],
  ];
  return segments;
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
