import type { Agent, City, GameState } from './types';
import { getRoadNetwork, nearestNode, randomRoadRoute, invalidateRoadCache } from './roads';

// ════════════════════════════════════════════════════════════════════
// MOVING ENTITIES
// ════════════════════════════════════════════════════════════════════
// Vehicles advance along a precomputed list of street waypoints. Because every
// waypoint is an intersection (or a kerbside parking bay one tile off one) and
// consecutive waypoints are orthogonally adjacent, the interpolated position can
// never leave the road surface. Pedestrians stay in a narrow pavement band.

const CAR_COLORS = ['#ef4444', '#3b82f6', '#fbbf24', '#10b981', '#f97316',
  '#a855f7', '#1abc9c', '#f5f5f5', '#475569', '#ec4899'];

let entityCounter = 0;
const nextId = () => `ent_${++entityCounter}`;

/** Per-agent waypoint cursor. Kept out of the serialised agent record. */
const routes = new Map<string, { path: Array<[number, number]>; index: number }>();

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

/** Populate every city with cars and pedestrians scaled to its population. */
export function generateEntities(cities: City[], rand: () => number, state?: GameState): Agent[] {
  const entities: Agent[] = [];
  for (const city of cities) {
    const popFactor = city.population / 1_000_000;
    const numCars = Math.min(24, Math.max(3, Math.floor(popFactor * 5) + 4));
    const numPeople = Math.min(30, Math.max(4, Math.floor(popFactor * 6) + 6));

    for (let i = 0; i < numCars; i++) {
      const start = state ? spawnOnRoad(state, city) : { x: city.x + rand() * 4 - 2, y: city.y + rand() * 4 - 2 };
      entities.push({
        id: nextId(), kind: 'car', x: start.x, y: start.y, tx: start.x, ty: start.y,
        speed: 0.05 + rand() * 0.06,
        color: CAR_COLORS[Math.floor(rand() * CAR_COLORS.length)],
        cityId: city.id,
      });
    }
    for (let i = 0; i < numPeople; i++) {
      const start = state ? spawnOnPavement(state, city) : { x: city.x + rand() * 4 - 2, y: city.y + rand() * 4 - 2 };
      entities.push({
        id: nextId(), kind: 'person', x: start.x, y: start.y, tx: start.x, ty: start.y,
        speed: 0.012 + rand() * 0.015,
        color: `hsl(${Math.floor(rand() * 360)}, 65%, 55%)`,
        cityId: city.id,
      });
    }
  }
  return entities;
}

function nearestCityTo(state: GameState, x: number, y: number): City {
  let best = state.cities[0];
  let bestDistance = Infinity;
  for (const city of state.cities) {
    const distance = Math.hypot(city.x - x, city.y - y);
    if (distance < bestDistance) { bestDistance = distance; best = city; }
  }
  return best;
}

/**
 * Advance every agent one step along the street graph.
 */
export function updateEntities(state: GameState, rand: () => number, deltaScale = 1): void {
  if (state.paused || deltaScale === 0 || state.cities.length === 0) return;

  for (const entity of state.agents) {
    // ── Pedestrians: short walks along the pavement band ──
    if (entity.kind === 'person') {
      const dx = entity.tx - entity.x;
      const dy = entity.ty - entity.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 0.35) {
        const city = state.cities.find(c => c.id === entity.cityId) ?? nearestCityTo(state, entity.x, entity.y);
        const destination = spawnOnPavement(state, city);
        entity.tx = destination.x;
        entity.ty = destination.y;
      } else {
        const step = (entity.speed * deltaScale) / distance;
        entity.x += dx * step;
        entity.y += dy * step;
      }
      continue;
    }

    // ── Cars: strict waypoint following on the road graph ──
    let route = routes.get(entity.id);
    if (!route || route.index >= route.path.length) {
      const city = state.cities.find(c => c.id === entity.cityId) ?? nearestCityTo(state, entity.x, entity.y);
      const network = getRoadNetwork(state, city);
      const path = randomRoadRoute(network, entity.x, entity.y, rand);
      if (path.length === 0) continue;
      route = { path, index: 0 };
      routes.set(entity.id, route);
      // Snap back onto the lattice if the agent has drifted off it.
      const snap = nearestNode(network, entity.x, entity.y);
      if (snap && Math.hypot(snap.x - entity.x, snap.y - entity.y) > 2.5) {
        entity.x = snap.x;
        entity.y = snap.y;
      }
    }

    const [waypointX, waypointY] = route.path[route.index];
    const dx = waypointX - entity.x;
    const dy = waypointY - entity.y;
    const distance = Math.hypot(dx, dy);
    const step = entity.speed * deltaScale;

    if (distance <= step || distance < 0.02) {
      entity.x = waypointX;
      entity.y = waypointY;
      route.index += 1;
    } else {
      entity.x += (dx / distance) * step;
      entity.y += (dy / distance) * step;
    }
    entity.tx = waypointX;
    entity.ty = waypointY;
  }
}

/** Clears route cursors and the underlying road-network cache. */
export function clearEntityCaches() {
  routes.clear();
  entityCounter = 0;
  invalidateRoadCache();
}
