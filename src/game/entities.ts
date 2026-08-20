import type { GameState, City, MovingEntity } from './types';
import { getRoadNetwork, nearestNode, randomRoadRoute, buildFreightPolyline, samplePolyline } from './roads';

let entityIdCounter = 0;
function nextId() {
  entityIdCounter += 1;
  return `ent_${entityIdCounter}`;
}

const CAR_COLORS = ['#ef4444', '#3b82f6', '#fbbf24', '#10b981', '#f97316', '#a855f7', '#1abc9c', '#f5f5f5', '#475569', '#ec4899'];

/** Vehicles spawn directly onto a street intersection. */
function spawnOnRoad(state: GameState, city: City): { x: number; y: number } {
  const network = getRoadNetwork(state, city);
  if (network.nodes.length === 0) return { x: city.x, y: city.y };
  const node = network.nodes[Math.floor(Math.random() * network.nodes.length)];
  return { x: node.x, y: node.y };
}

/** Pedestrians walk the pavement — a narrow band beside a street. */
function spawnOnPavement(state: GameState, city: City): { x: number; y: number } {
  const point = spawnOnRoad(state, city);
  const alongX = Math.random() > 0.5;
  return {
    x: point.x + (alongX ? (Math.random() - 0.5) * 4 : (Math.random() > 0.5 ? 1 : -1) * 0.8),
    y: point.y + (alongX ? (Math.random() > 0.5 ? 1 : -1) * 0.8 : (Math.random() - 0.5) * 4),
  };
}

export function generateEntities(state: GameState): MovingEntity[] {
  const entities: MovingEntity[] = [];

  for (const city of state.cities) {
    const popFactor = city.population / 1_000_000;
    const numCars = Math.min(24, Math.max(3, Math.floor(popFactor * 5) + 4));
    const numPeople = Math.min(30, Math.max(4, Math.floor(popFactor * 6) + 6));
    const numTrucks = Math.min(8, Math.max(1, Math.floor(popFactor * 1.5) + 1));

    for (let i = 0; i < numCars; i++) {
      const start = spawnOnRoad(state, city);
      entities.push({
        id: nextId(), type: 'car', x: start.x, y: start.y,
        targetX: start.x, targetY: start.y,
        speed: 0.05 + Math.random() * 0.06,
        color: CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)],
        direction: Math.floor(Math.random() * 4), pathIndex: 0, path: [],
      });
    }
    for (let i = 0; i < numPeople; i++) {
      const start = spawnOnPavement(state, city);
      entities.push({
        id: nextId(), type: 'person', x: start.x, y: start.y,
        targetX: start.x, targetY: start.y,
        speed: 0.012 + Math.random() * 0.015,
        color: `hsl(${Math.random() * 360}, 65%, 55%)`,
        direction: Math.floor(Math.random() * 4), pathIndex: 0, path: [],
      });
    }
    for (let i = 0; i < numTrucks; i++) {
      const start = spawnOnRoad(state, city);
      entities.push({
        id: nextId(), type: 'truck', x: start.x, y: start.y,
        targetX: start.x, targetY: start.y,
        speed: 0.03 + Math.random() * 0.03,
        color: '#d97706',
        direction: Math.floor(Math.random() * 4), pathIndex: 0, path: [],
      });
    }
  }
  return entities;
}

/** Cached freight polylines so we don't re-run BFS every animation frame. */
const freightPathCache = new Map<string, Array<[number, number]>>();

function nearestCityTo(state: GameState, x: number, y: number): City {
  let best = state.cities[0];
  let bestDistance = Infinity;
  for (const city of state.cities) {
    const distance = Math.hypot(city.x - x, city.y - y);
    if (distance < bestDistance) { bestDistance = distance; best = city; }
  }
  return best;
}

function faceTowards(entity: MovingEntity, dx: number, dy: number) {
  if (Math.abs(dx) > Math.abs(dy)) entity.direction = dx > 0 ? 1 : 3;
  else entity.direction = dy > 0 ? 2 : 0;
}

/**
 * Vehicles advance along a precomputed list of street waypoints. Because every
 * waypoint is an intersection (or a kerbside bay one tile off one) and
 * consecutive waypoints are orthogonally adjacent, the interpolated position
 * can never leave the road surface.
 */
export function updateEntities(entities: MovingEntity[], state: GameState, deltaScale = 1): void {
  const speedMul = state.paused ? 0 : deltaScale;
  if (speedMul === 0) return;
  if (state.cities.length === 0) return;

  const routesByTruck = new Map(state.freight.map(route => [route.id, route]));
  const buildingsById = new Map(state.buildings.map(b => [b.id, b]));

  // Retire freight trucks whose route completed.
  for (let index = entities.length - 1; index >= 0; index--) {
    const entity = entities[index];
    if (entity.type === 'freight_truck' && !routesByTruck.has(entity.id)) {
      freightPathCache.delete(entity.id);
      entities.splice(index, 1);
    }
  }

  // Spawn a truck for any freight route without one.
  const existingIds = new Set(entities.map(e => e.id));
  for (const route of state.freight) {
    if (existingIds.has(route.id)) continue;
    const supplier = buildingsById.get(route.fromBuildingId);
    const buyer = buildingsById.get(route.toBuildingId);
    if (!supplier || !buyer) continue;
    const polyline = buildFreightPolyline(state, supplier, buyer);
    freightPathCache.set(route.id, polyline);
    const origin = polyline[0] ?? [supplier.x, supplier.y];
    entities.push({
      id: route.id, type: 'freight_truck', x: origin[0], y: origin[1],
      targetX: buyer.x, targetY: buyer.y, speed: 0.05, color: '#dc2626', direction: 1,
      pathIndex: 0, path: polyline, fromBuildingId: supplier.id, toBuildingId: buyer.id,
    });
  }

  for (const entity of entities) {
    // Freight trucks: driven by their route's delivery progress.
    if (entity.type === 'freight_truck') {
      const route = routesByTruck.get(entity.id);
      if (!route) continue;
      let polyline = freightPathCache.get(entity.id);
      if (!polyline) {
        const supplier = buildingsById.get(route.fromBuildingId);
        const buyer = buildingsById.get(route.toBuildingId);
        if (!supplier || !buyer) continue;
        polyline = buildFreightPolyline(state, supplier, buyer);
        freightPathCache.set(entity.id, polyline);
      }
      const position = samplePolyline(polyline, route.progress / 100);
      faceTowards(entity, position.x - entity.x, position.y - entity.y);
      entity.x = position.x;
      entity.y = position.y;
      continue;
    }

    // Pedestrians: short walks along the pavement band.
    if (entity.type === 'person') {
      const dx = entity.targetX - entity.x;
      const dy = entity.targetY - entity.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 0.35) {
        const destination = spawnOnPavement(state, nearestCityTo(state, entity.x, entity.y));
        entity.targetX = destination.x;
        entity.targetY = destination.y;
        faceTowards(entity, destination.x - entity.x, destination.y - entity.y);
      } else {
        const step = (entity.speed * speedMul) / distance;
        entity.x += dx * step;
        entity.y += dy * step;
      }
      continue;
    }

    // Cars/trucks/buses: strict waypoint following on the road graph.
    if (entity.path.length === 0 || entity.pathIndex >= entity.path.length) {
      const city = nearestCityTo(state, entity.x, entity.y);
      const network = getRoadNetwork(state, city);
      const route = randomRoadRoute(network, entity.x, entity.y);
      if (route.length === 0) continue;
      entity.path = route;
      entity.pathIndex = 0;
      const snap = nearestNode(network, entity.x, entity.y);
      if (snap && Math.hypot(snap.x - entity.x, snap.y - entity.y) > 2.5) {
        entity.x = snap.x;
        entity.y = snap.y;
      }
    }

    const [waypointX, waypointY] = entity.path[entity.pathIndex];
    const dx = waypointX - entity.x;
    const dy = waypointY - entity.y;
    const distance = Math.hypot(dx, dy);
    const step = entity.speed * speedMul;

    if (distance <= step || distance < 0.02) {
      entity.x = waypointX;
      entity.y = waypointY;
      entity.pathIndex += 1;
      if (entity.pathIndex < entity.path.length) {
        faceTowards(entity, entity.path[entity.pathIndex][0] - entity.x, entity.path[entity.pathIndex][1] - entity.y);
      }
    } else {
      entity.x += (dx / distance) * step;
      entity.y += (dy / distance) * step;
      faceTowards(entity, dx, dy);
    }
    entity.targetX = waypointX;
    entity.targetY = waypointY;
  }
}

export function clearEntityCaches() {
  freightPathCache.clear();
}
