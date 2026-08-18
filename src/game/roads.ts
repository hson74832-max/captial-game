import type { City, GameState, Building } from './types';

// ============= ROAD NETWORK =============
// Streets are generated as a grid of segments spaced GRID_SPACING apart,
// aligned to each city's grid origin, clipped to CITY_ROAD_RADIUS.
// Vehicles may ONLY occupy: road segments, or parking spurs attached to a road node.

/** Base grid spacing — actual spacing varies ±1 per city based on seed. */
export const GRID_SPACING = 5;
export const CITY_ROAD_RADIUS = 16; // Increased for doubled map size
/** How far a parking spur extends perpendicular off the street centreline. */
export const PARKING_OFFSET = 1.25;

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
  /** "x,y" -> node id */
  lookup: Map<string, number>;
  parking: ParkingSlot[];
}

/**
 * Per-city street frame. Spacing, per-axis mix and grid origin offsets all vary
 * deterministically by city position, so no two cities share the same street pattern:
 * some have tight 4x6 avenues, others wide 6x6 blocks, and the grid never aligns
 * identically onto the cardinal directions.
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

/** Back-compat helper: returns the frame-shaped origin used by legacy callers. */
export function roadGridOrigin(city: City) {
  const frame = cityRoadFrame(city);
  return { gridX: frame.originX, gridY: frame.originY, spacing: frame.spacingX };
}

/** True when the integer tile lies on a street centreline of its city. */
export function tileIsRoad(tileX: number, tileY: number, city: City): boolean {
  if (Math.hypot(tileX - city.x, tileY - city.y) >= CITY_ROAD_RADIUS) return false;
  const frame = cityRoadFrame(city);
  const onVertical = (((tileX - frame.originX) % frame.spacingX) + frame.spacingX) % frame.spacingX === 0;
  const onHorizontal = (((tileY - frame.originY) % frame.spacingY) + frame.spacingY) % frame.spacingY === 0;
  return onVertical || onHorizontal;
}

const networkCache = new Map<string, { signature: string; network: RoadNetwork }>();

function networkSignature(city: City, buildings: Building[]): string {
  // Parking spurs depend on which buildings exist in the city.
  return `${city.x.toFixed(2)}:${city.y.toFixed(2)}:${buildings.length}`;
}

/** Builds (and caches) the drivable graph for a city. */
export function getRoadNetwork(state: GameState, city: City): RoadNetwork {
  const cityBuildings = state.buildings.filter(b => b.cityId === city.id);
  const signature = networkSignature(city, cityBuildings);
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

  // Connect orthogonally adjacent intersections; these edges lie exactly on streets.
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

  // Parking spurs: one short stub off the nearest road node toward each building.
  const parking: ParkingSlot[] = [];
  for (const building of cityBuildings) {
    const node = nearestNode({ cityId: city.id, nodes, lookup, parking: [] }, building.x, building.y);
    if (!node) continue;
    const dx = building.x - node.x;
    const dy = building.y - node.y;
    if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) continue;
    // Snap the spur to the dominant axis so it reads as a kerbside bay.
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
    if (distance < bestDistance) {
      bestDistance = distance;
      best = node;
    }
  }
  return best;
}

/** Breadth-first search across street segments. Returns waypoints inclusive of both ends. */
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

/** Picks a random reachable destination node and returns the street path to it. */
export function randomRoadRoute(
  network: RoadNetwork,
  fromX: number,
  fromY: number,
  rand: () => number = Math.random,
): Array<[number, number]> {
  if (network.nodes.length === 0) return [];
  const start = nearestNode(network, fromX, fromY);
  if (!start) return [];
  const destination = network.nodes[Math.floor(rand() * network.nodes.length)];
  const path = findRoadPath(network, start.id, destination.id);
  if (path.length === 0) return [];
  // Occasionally finish at a kerbside parking bay attached to the final node.
  if (rand() < 0.35) {
    const bays = network.parking.filter(slot => slot.nodeId === destination.id);
    if (bays.length > 0) {
      const bay = bays[Math.floor(rand() * bays.length)];
      path.push([bay.x, bay.y]);
    }
  }
  return path;
}

/**
 * Full freight polyline: street path inside the origin city, an inter-city
 * highway leg when required, then the street path inside the destination city.
 */
export function buildFreightPolyline(
  state: GameState,
  supplier: Building,
  buyer: Building,
): Array<[number, number]> {
  const fromCity = state.cities.find(city => city.id === supplier.cityId);
  const toCity = state.cities.find(city => city.id === buyer.cityId);
  if (!fromCity || !toCity) return [[supplier.x, supplier.y], [buyer.x, buyer.y]];

  const fromNetwork = getRoadNetwork(state, fromCity);

  if (fromCity.id === toCity.id) {
    const start = nearestNode(fromNetwork, supplier.x, supplier.y);
    const end = nearestNode(fromNetwork, buyer.x, buyer.y);
    if (!start || !end) return [[supplier.x, supplier.y], [buyer.x, buyer.y]];
    const path = findRoadPath(fromNetwork, start.id, end.id);
    return path.length > 0 ? path : [[supplier.x, supplier.y], [buyer.x, buyer.y]];
  }

  const toNetwork = getRoadNetwork(state, toCity);
  const originStart = nearestNode(fromNetwork, supplier.x, supplier.y);
  // Leave via the intersection closest to the destination, enter via the closest to the origin.
  const originExit = nearestNode(fromNetwork, toCity.x, toCity.y);
  const destEntry = nearestNode(toNetwork, fromCity.x, fromCity.y);
  const destEnd = nearestNode(toNetwork, buyer.x, buyer.y);
  if (!originStart || !originExit || !destEntry || !destEnd) {
    return [[supplier.x, supplier.y], [buyer.x, buyer.y]];
  }

  return [
    ...findRoadPath(fromNetwork, originStart.id, originExit.id),
    ...findRoadPath(toNetwork, destEntry.id, destEnd.id),
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
}
