import type { Building, City, Company, GameState, Product } from './types';

// ============= STATE INDEX =============
// Hot simulation loops previously used repeated Array.find / Array.filter, which
// is O(n) per lookup and O(n²) overall. This builds O(1) maps plus a uniform
// spatial hash once per tick and shares them across every subsystem.

const CELL_SIZE = 8;

export interface StateIndex {
  buildingsById: Map<string, Building>;
  buildingsByCity: Map<string, Building[]>;
  buildingsByCompany: Map<string, Building[]>;
  buildingsByType: Map<string, Building[]>;
  productsById: Map<string, Product>;
  companiesById: Map<string, Company>;
  citiesById: Map<string, City>;
  spatial: Map<string, Building[]>;
}

function pushInto<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const existing = map.get(key);
  if (existing) existing.push(value);
  else map.set(key, [value]);
}

function cellKey(x: number, y: number) {
  return `${Math.floor(x / CELL_SIZE)},${Math.floor(y / CELL_SIZE)}`;
}

export function buildStateIndex(state: GameState): StateIndex {
  const index: StateIndex = {
    buildingsById: new Map(),
    buildingsByCity: new Map(),
    buildingsByCompany: new Map(),
    buildingsByType: new Map(),
    productsById: new Map(),
    companiesById: new Map(),
    citiesById: new Map(),
    spatial: new Map(),
  };

  for (const product of state.products) index.productsById.set(product.id, product);
  for (const company of state.companies) index.companiesById.set(company.id, company);
  for (const city of state.cities) index.citiesById.set(city.id, city);

  for (const building of state.buildings) {
    index.buildingsById.set(building.id, building);
    pushInto(index.buildingsByCity, building.cityId, building);
    pushInto(index.buildingsByCompany, building.companyId, building);
    pushInto(index.buildingsByType, building.type, building);
    pushInto(index.spatial, cellKey(building.x, building.y), building);
  }

  return index;
}

/** Returns buildings whose centre lies within `radius` of the point. */
export function queryRadius(index: StateIndex, x: number, y: number, radius: number): Building[] {
  const results: Building[] = [];
  const minCellX = Math.floor((x - radius) / CELL_SIZE);
  const maxCellX = Math.floor((x + radius) / CELL_SIZE);
  const minCellY = Math.floor((y - radius) / CELL_SIZE);
  const maxCellY = Math.floor((y + radius) / CELL_SIZE);
  const radiusSquared = radius * radius;

  for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
    for (let cellY = minCellY; cellY <= maxCellY; cellY++) {
      const bucket = index.spatial.get(`${cellX},${cellY}`);
      if (!bucket) continue;
      for (const building of bucket) {
        const dx = building.x - x;
        const dy = building.y - y;
        if (dx * dx + dy * dy <= radiusSquared) results.push(building);
      }
    }
  }
  return results;
}

export function buildingsInCity(index: StateIndex, cityId: string): Building[] {
  return index.buildingsByCity.get(cityId) ?? [];
}

export function buildingsOfCompany(index: StateIndex, companyId: string): Building[] {
  return index.buildingsByCompany.get(companyId) ?? [];
}

export function buildingsOfType(index: StateIndex, type: string): Building[] {
  return index.buildingsByType.get(type) ?? [];
}
