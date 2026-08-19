'use client';

import { useState } from 'react';
import type { GameState, BuildingType, UIPanel, Building } from '../game/types';
import { formatMoney, formatPercent } from '../utils/format';

interface SidePanelProps {
  gameState: GameState;
  activePanel: UIPanel;
  onClose: () => void;
  onBuild: (type: BuildingType) => void;
  onTakeLoan: (amount: number) => void;
  onRepayLoan: (amount: number) => void;
  onBuyShares: (companyId: string, amount: number) => void;
  onSellShares: (companyId: string, amount: number) => void;
  onUpgradeBuilding: (buildingId: string) => void;
  onDemolishBuilding: (buildingId: string) => void;
  onMakeOffer: (buildingId: string, amount: number) => void;
  askingPriceFor: (buildingId: string) => number | null;
  onAcceptOffer: (offerId: string) => void;
  onRejectOffer: (offerId: string) => void;
  onRemoveProduct: (buildingId: string, productId: string) => void;
  onSetWarehouseTier: (buildingId: string, tier: 'general' | 'cold' | 'hazmat') => void;
  onSetMenuPrice: (buildingId: string, itemId: string, price: number) => void;
  onToggleMenuItem: (buildingId: string, itemId: string) => void;
  onSetAdBudget: (buildingId: string, budget: number) => void;
  onToggleDelivery: (buildingId: string) => void;
  onConfigureDelivery: (buildingId: string, patch: Partial<{ mode: 'in_house' | 'platform'; radius: number; couriers: number; customerFee: number }>) => void;
  onSetSafetyStock: (buildingId: string, policy: number) => void;
  onSetIntensity: (buildingId: string, intensity: number) => void;
  onHedge: (months: number) => void;
  onOffshore: (buildingId: string, partnerId: string) => void;
  onConfigureProduct: (buildingId: string, productId: string) => void;
  onAutoSource: (buildingId: string) => void;
  onOptimizeAllSupply: () => void;
  onAdvertiseProduct: (productId: string, amount: number) => void;
  onAcquireTechnology: (productId: string) => void;
  onToggleInternalSale: (buildingId: string) => void;
  onSetPrice: (buildingId: string, value: number) => void;
  onSetTraining: (buildingId: string, value: number) => void;
  onSetRent: (buildingId: string, value: number) => void;
  onSetMedia: (buildingId: string, budget: number, price: number) => void;
  onStartResearch: (buildingId: string, productId: string) => void;
  onHireExecutive: (executiveId: string) => void;
  onSpendKnowledge: (category: string) => void;
  onIntensiveTraining: () => void;
  onIssueBond: (amount: number, term: 5 | 10 | 15 | 20) => void;
  onBuyBond: (bondId: string) => void;
  onIssueShares: (amount: number) => void;
  onBuyLand: (cityId: string, size: number) => void;
  onSellLand: (holdingId: string) => void;
  onFocusCity: (cityId: string) => void;
  onFocusBuilding: (buildingId: string) => void;
  onStartTechProject: (buildingId: string, technologyId: string, months: number) => void;
  onStartSoftwareProject: (buildingId: string, softwareId: string, targetOsId: string | null) => void;
  onToggleAutoVersion: (softwareId: string) => void;
  onAssignSoftware: (buildingId: string, softwareId: string | null) => void;
  onToggleEcommerce: (buildingId: string) => void;
  onSetEcommercePrice: (buildingId: string, productId: string, price: number) => void;
  onSetTelecomPolicy: (buildingId: string, price: number, upgradeBudget: number) => void;
  onSetWebsitePolicy: (buildingId: string, contentBudget: number, costPerClick: number) => void;
  onHireTalent: (talentId: string, buildingId: string) => void;
  onHeadhuntTalent: (talentId: string, buildingId: string) => void;
  onRaiseSalary: (talentId: string, percent: number) => void;
  onToggleAutoLoyalty: (talentId: string) => void;
  onToggleTechDisruption: () => void;
  onToggleInverseInflation: () => void;
  showTooltips: boolean;
  onToggleTooltips: () => void;
  onBuyAsset: (assetId: string, units: number) => void;
  onSellAsset: (assetId: string, units: number) => void;
}

/** Context-sensitive plain-language explanation of utilization. */
function utilizationExplainer(type: BuildingType): string {
  switch (type) {
    case 'retail_store':
    case 'internet_ecommerce':
    case 'restaurant':
    case 'fast_food':
    case 'cafe':
    case 'bar':
      return 'Share of achievable sales actually captured — set by footfall, service quality, price and stock. Above 90% the venue is capacity-constrained and new customers walk away.';
    case 'factory':
    case 'farm':
    case 'mine':
      return 'Output as a share of nameplate capacity, reduced by input availability, season and strikes. Above 90% the line runs hard and staff overwork (satisfaction falls).';
    case 'warehouse':
      return 'Storage fill. Sustained 100% blocks inbound freight; near 0% the facility is under-used and paying for idle space.';
    case 'apartment':
    case 'commercial':
      return 'Occupancy — the share of lettable units tenanted. Below 85% vacancy friction (broker fees, refits, void periods) erodes the rent roll.';
    case 'rd_center':
    case 'software_company':
      return 'Research bench utilisation — active programme load. Peaks during a project, idles between programmes.';
    case 'seaport':
      return 'Berth throughput vs. nominal handling capacity.';
    default:
      return 'How fully the facility is being used relative to its design capacity.';
  }
}

export default function SidePanel(props: SidePanelProps) {
  const { activePanel, onClose, gameState } = props;
  if (activePanel === 'none') return null;

  return (
    <div className="absolute right-0 top-0 bottom-0 w-80 max-w-full bg-gray-950/95 border-l border-gray-800 shadow-2xl z-40 flex flex-col text-white overflow-hidden backdrop-blur">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800 bg-gradient-to-r from-gray-900 to-gray-800">
        <h2 className="text-xs font-black uppercase tracking-widest text-emerald-400">
          {activePanel.replace(/_/g, ' ')}
        </h2>
        <button onClick={onClose} className="text-gray-400 hover:text-white text-base w-6 h-6 flex items-center justify-center rounded hover:bg-gray-700 transition-colors">✕</button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {activePanel === 'build' && <BuildPanel {...props} />}
        {activePanel === 'building' && <BuildingPanel {...props} />}
        {activePanel === 'finances' && <FinancesPanel {...props} />}
        {activePanel === 'stock_market' && <StockMarketPanel {...props} />}
        {activePanel === 'supply_chain' && <SupplyChainPanel {...props} />}
        {activePanel === 'products' && <ProductsPanel {...props} />}
        {activePanel === 'city' && <CityPanel {...props} />}
        {activePanel === 'company' && <CompanyPanel {...props} />}
        {activePanel === 'offers' && <OffersPanel {...props} />}
        {activePanel === 'policy' && <PolicyPanel {...props} />}
        {activePanel === 'assets' && <AssetsPanel {...props} />}
        {activePanel === 'research' && <ResearchPanel {...props} />}
        {activePanel === 'executives' && <ExecutivesPanel {...props} />}
        {activePanel === 'land' && <LandPanel {...props} />}
        {activePanel === 'classroom' && <ClassroomPanel {...props} />}
        {activePanel === 'scouting' && <ScoutingPanel {...props} />}
        {activePanel === 'settings' && <SettingsPanel {...props} />}
      </div>
    </div>
  );
}

// ============= BUILD PANEL =============

const BUILDING_DEFS: { type: BuildingType; name: string; icon: string; cost: number; desc: string; category: string }[] = [
  { type: 'retail_store', name: 'Retail Store', icon: '🏪', cost: 500000, desc: 'Sell products to customers', category: 'retail' },
  { type: 'factory', name: 'Factory', icon: '🏭', cost: 2000000, desc: 'Manufacture products', category: 'industry' },
  { type: 'farm', name: 'Farm', icon: '🌾', cost: 300000, desc: 'Grow agricultural goods', category: 'industry' },
  { type: 'mine', name: 'Mine', icon: '⛏️', cost: 1500000, desc: 'Extract raw resources', category: 'industry' },
  { type: 'warehouse', name: 'Warehouse', icon: '📦', cost: 400000, desc: 'Store and distribute goods', category: 'industry' },
  { type: 'hq', name: 'Headquarters', icon: '🏢', cost: 3000000, desc: 'Corporate headquarters', category: 'corporate' },
  { type: 'rd_center', name: 'R&D Center', icon: '🔬', cost: 2500000, desc: 'Research new tech', category: 'corporate' },
  { type: 'apartment', name: 'Apartment', icon: '🏠', cost: 1500000, desc: 'Residential income', category: 'realestate' },
  { type: 'commercial', name: 'Commercial', icon: '🏛️', cost: 2000000, desc: 'Office rental income', category: 'realestate' },
  { type: 'media_tv', name: 'TV Station', icon: '📺', cost: 5000000, desc: 'Television empire', category: 'media' },
  { type: 'media_radio', name: 'Radio Station', icon: '📻', cost: 1000000, desc: 'Radio advertising', category: 'media' },
  { type: 'media_newspaper', name: 'Newspaper', icon: '📰', cost: 800000, desc: 'Print media', category: 'media' },
  { type: 'media_tower', name: 'Telecom Tower', icon: '📡', cost: 600000, desc: 'Telecom infrastructure', category: 'media' },
  { type: 'civic_school', name: 'School', icon: 'SC', cost: 1800000, desc: 'Raises community access', category: 'civic' },
  { type: 'civic_hospital', name: 'Hospital', icon: 'H', cost: 4200000, desc: 'Major residential amenity', category: 'civic' },
  { type: 'civic_stadium', name: 'Stadium', icon: 'ST', cost: 6500000, desc: 'Sports and traffic anchor', category: 'civic' },
  { type: 'civic_museum', name: 'Museum', icon: 'MU', cost: 2800000, desc: 'Culture and land value', category: 'civic' },
  { type: 'civic_park', name: 'City Park', icon: 'PK', cost: 650000, desc: 'Green environment bonus', category: 'civic' },
  { type: 'internet_search', name: 'Search Engine', icon: 'SE', cost: 4500000, desc: 'Global advertising reach', category: 'digital' },
  { type: 'internet_social', name: 'Social Network', icon: 'SN', cost: 3800000, desc: 'Network-driven advertising', category: 'digital' },
  { type: 'internet_ecommerce', name: 'E-Commerce', icon: 'EC', cost: 5200000, desc: 'Sell in every city', category: 'digital' },
  { type: 'software_company', name: 'Software Studio', icon: 'SW', cost: 3200000, desc: 'Develop digital products', category: 'digital' },
  { type: 'telecom', name: 'Telecom Operator', icon: '📡', cost: 4800000, desc: 'Grows the internet population', category: 'digital' },
  { type: 'restaurant', name: 'Restaurant', icon: '🍽️', cost: 850000, desc: 'Full-service dining', category: 'hospitality' },
  { type: 'fast_food', name: 'Fast Food', icon: '🍔', cost: 520000, desc: 'High-turnover quick service', category: 'hospitality' },
  { type: 'cafe', name: 'Cafe', icon: '☕', cost: 310000, desc: 'Coffee & light bites', category: 'hospitality' },
  { type: 'bar', name: 'Bar & Grill', icon: '🍺', cost: 640000, desc: 'Evening trade, drinks-led', category: 'hospitality' },
];

function BuildPanel({ onBuild, gameState }: SidePanelProps) {
  const company = gameState.companies.find(c => c.isPlayer)!;
  const categories = Array.from(new Set(BUILDING_DEFS.map(b => b.category)));
  const [filter, setFilter] = useState<string | 'all'>('all');
  const filtered = filter === 'all' ? BUILDING_DEFS : BUILDING_DEFS.filter(b => b.category === filter);

  return (
    <div className="space-y-3">
      <div className="bg-gray-900 rounded-lg p-2.5 border border-gray-800">
        <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Available Cash</div>
        <div className="text-lg font-black text-emerald-400 font-mono">{formatMoney(company.cash)}</div>
      </div>
      {/* Filter pills */}
      <div className="flex flex-wrap gap-1">
        <button
          onClick={() => setFilter('all')}
          className={`px-2 py-0.5 text-[10px] rounded-full ${filter === 'all' ? 'bg-emerald-600' : 'bg-gray-800 text-gray-400'}`}
        >All</button>
        {categories.map(c => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            className={`px-2 py-0.5 text-[10px] rounded-full capitalize ${filter === c ? 'bg-emerald-600' : 'bg-gray-800 text-gray-400'}`}
          >{c}</button>
        ))}
      </div>
      {filtered.map(b => {
        const affordable = company.cash >= b.cost;
        return (
          <button
            key={b.type}
            onClick={() => onBuild(b.type)}
            className={`w-full flex items-center gap-2.5 p-2.5 rounded-lg border transition-all text-left ${
              affordable
                ? 'bg-gray-900 hover:bg-gray-800 border-gray-800 hover:border-emerald-500'
                : 'bg-gray-900/50 border-gray-800 opacity-50'
            }`}
          >
            <span className="text-2xl">{b.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-white">{b.name}</div>
              <div className="text-[10px] text-gray-500 truncate">{b.desc}</div>
            </div>
            <div className="text-right">
              <div className={`text-[10px] font-mono font-bold ${affordable ? 'text-emerald-400' : 'text-red-400'}`}>{formatMoney(b.cost)}</div>
              <div className="text-[8px] text-gray-500 uppercase">{b.category}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ============= BUILDING DETAIL =============

const BUILDING_ICONS: Record<BuildingType, string> = {
  retail_store: '🏪', factory: '🏭', farm: '🌾', mine: '⛏️',
  warehouse: '📦', hq: '🏢', rd_center: '🔬', apartment: '🏠',
  commercial: '🏛️', media_tv: '📺', media_radio: '📻', media_newspaper: '📰',
  media_tower: '📡', seaport: '⚓',
  civic_school: 'SC', civic_hospital: 'H', civic_stadium: 'ST', civic_museum: 'MU', civic_park: 'PK',
  internet_search: 'SE', internet_social: 'SN', internet_ecommerce: 'EC', software_company: 'SW',
  telecom: '📡',
  restaurant: '🍽️', fast_food: '🍔', cafe: '☕', bar: '🍺',
};

function isShopType(type: string) {
  return type === 'retail_store' || type === 'internet_ecommerce';
}

function isHospitalityType(type: string) {
  return type === 'restaurant' || type === 'fast_food' || type === 'cafe' || type === 'bar';
}

function BuildingPanel({
  gameState, onUpgradeBuilding, onDemolishBuilding, onConfigureProduct, onAutoSource,
  onToggleInternalSale, onSetPrice, onSetTraining, onSetRent, onSetMedia, onStartResearch,
  onMakeOffer, askingPriceFor, onRemoveProduct, onSetWarehouseTier,
  onSetMenuPrice, onToggleMenuItem, onSetAdBudget,
  onToggleDelivery, onConfigureDelivery, onSetSafetyStock, onSetIntensity, onOffshore,
  showTooltips,
}: SidePanelProps) {
  const [offerAmount, setOfferAmount] = useState(0);
  const building = gameState.buildings.find(b => b.id === gameState.selectedBuilding);
  if (!building) return <div className="text-gray-400 text-xs">No building selected</div>;
  const company = gameState.companies.find(c => c.id === building.companyId);
  const city = gameState.cities.find(c => c.id === building.cityId);
  const isOwned = company?.isPlayer;
  const product = gameState.products.find(item => item.id === building.productId);
  const averageSupplierPrice = building.supplierLinks.length > 0 ? building.supplierLinks.reduce((sum, link) => sum + link.pricePerUnit, 0) / building.supplierLinks.length : product?.productionCost || 0;
  const retailRating = product ? (Math.max(0, 100 - Math.max(0, building.pricingMultiplier - 0.55) * 65) * product.priceWeight + product.quality * product.qualityWeight + product.brand * product.brandWeight) / 100 : 0;
  const monthlyWagePerEmployee = city ? city.wageRate * 24 : 0;
  const sellThrough = building.supply > 0 ? building.lastUnitsSold * 720 / Math.max(1, building.supply) * 100 : 0;
  const productionTypes = ['factory', 'farm', 'mine', 'retail_store', 'warehouse', 'rd_center', 'internet_ecommerce', 'software_company'];
  const availableProducts = gameState.products.filter(item => {
    if (item.unlockYear > gameState.year) return false;
    if (building.type === 'farm') return item.kind === 'farm';
    if (building.type === 'mine') return item.kind === 'raw';
    if (building.type === 'factory') return item.kind === 'semi' || item.kind === 'consumer';
    if (building.type === 'retail_store' || building.type === 'internet_ecommerce') return item.kind === 'consumer';
    if (building.type === 'software_company') return item.kind === 'digital';
    if (building.type === 'rd_center') return item.kind === 'consumer' || item.kind === 'digital';
    return item.kind !== 'digital';
  });

  return (
    <div className="space-y-3">
      <div className="text-center bg-gray-900 rounded-xl p-3 border border-gray-800">
        <div className="text-4xl mb-1">{BUILDING_ICONS[building.type]}</div>
        <h3 className="font-bold text-sm text-white">{building.name}</h3>
        <div className="text-[10px] text-gray-500">
          {city?.name || 'Wilderness'} • Lv {building.level}/{building.maxLevel}
        </div>
        <div className="mt-1.5">
          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold text-white" style={{ backgroundColor: company?.color || '#666' }}>
            {company?.name || 'System'}
          </span>
        </div>
      </div>

      {isOwned ? (
        <>
          <div className="grid grid-cols-2 gap-1.5">
            <StatBox label="Revenue" value={formatMoney(building.revenue)} color="text-blue-400" />
            <StatBox label="COGS" value={formatMoney(building.cogs)} color="text-amber-400" />
            <StatBox label="Opex" value={formatMoney(building.operatingCost)} color="text-orange-400" />
            <StatBox label="Profit" value={formatMoney(building.profit)} color={building.profit >= 0 ? 'text-green-400' : 'text-red-400'} />
            <StatBox label="Employees" value={building.employees.toString()} color="text-gray-300" />
            <StatBox label="Util" value={`${building.utilization.toFixed(0)}%`} color="text-yellow-400" tip={utilizationExplainer(building.type)} />
            <StatBox label="Train" value={`Lv ${building.trainingLevel}`} color="text-purple-400" />
            <StatBox label="Cond" value={`${building.condition.toFixed(0)}%`} color={building.condition > 60 ? 'text-cyan-400' : 'text-red-400'} />
            <StatBox label="Traffic" value={building.customerTraffic.toFixed(0)} color="text-pink-400" />
            <StatBox label="Margin" value={`${building.revenue > 0 ? (building.profit / building.revenue * 100).toFixed(0) : '0'}%`} color={building.profit >= 0 ? 'text-emerald-400' : 'text-red-400'} />
          </div>
          <ProgressBar label="Utilization" value={building.utilization} color="bg-emerald-500" />
          {showTooltips && (
            <div className="rounded-lg border border-gray-800 bg-gray-900/70 px-2.5 py-2 text-[9px] leading-relaxed text-gray-400">
              <span className="font-bold text-gray-300">Utilization = {utilizationExplainer(building.type)}</span>
              {building.utilization > 90 && (
                <div className="mt-1 text-amber-400">⚠ Running at capacity — this facility is the bottleneck. Upgrade or add another site.</div>
              )}
              {building.utilization < 25 && building.revenue > 0 && (
                <div className="mt-1 text-cyan-400">Running light — check inputs, pricing or location before paying for idle capacity.</div>
              )}
            </div>
          )}
          <ProgressBar label="Condition" value={building.condition} color="bg-cyan-500" />
        </>
      ) : (
        <CompetitorView building={building} gameState={gameState} />
      )}

      {building.type === 'seaport' && (
        <Section title={`${building.portKind === 'industrial' ? 'I' : 'C'} Port Inventory`}>
          <p className="text-[10px] leading-relaxed text-gray-500">
            {building.portKind === 'industrial' ? 'Industrial inputs and semi-products for local manufacturing.' : 'Finished retail goods ready for import.'}
          </p>
          {building.products.map(productId => {
            const item = gameState.products.find(candidate => candidate.id === productId);
            return item ? <DataRow key={productId} label={item.name} value={`${Math.floor(building.inventory[productId] || 0)} units`} color="text-cyan-400" /> : null;
          })}
        </Section>
      )}

      {isOwned && productionTypes.includes(building.type) && building.type !== 'mine' && (
        <Section title={isShopType(building.type) ? `Operating Lines (${building.products.length}/${building.productSlots} slots)` : 'Operating Product'}>
          {isShopType(building.type) ? (
            <div className="space-y-1.5">
              {building.products.slice(0, building.productSlots).map(pid => {
                const line = gameState.products.find(p => p.id === pid);
                if (!line) return null;
                const stock = building.inventory[pid] || 0;
                return (
                  <div key={pid} className="flex items-center justify-between rounded border border-gray-800 bg-gray-900/60 px-2 py-1.5">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span>{line.icon}</span>
                      <div className="min-w-0">
                        <div className="truncate text-[10px] font-semibold text-gray-200">{line.name}</div>
                        <div className="text-[9px] text-gray-500">stock {stock.toFixed(0)} · demand {line.marketDemand.toFixed(0)}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => onRemoveProduct(building.id, pid)}
                      disabled={building.products.length <= 1}
                      className="ml-2 shrink-0 rounded border border-gray-700 px-1.5 py-0.5 text-[9px] text-gray-400 hover:border-red-600 hover:text-red-300 disabled:opacity-30"
                      title="Delist"
                    >✕</button>
                  </div>
                );
              })}
              {building.products.length < building.productSlots && (
                <select
                  value=""
                  onChange={event => event.target.value && onConfigureProduct(building.id, event.target.value)}
                  className="w-full rounded-md border border-gray-700 bg-gray-800 px-2 py-1.5 text-[11px] text-white outline-none focus:border-emerald-500"
                >
                  <option value="">+ Add product line…</option>
                  {availableProducts.filter(p => !building.products.includes(p.id)).map(item => (
                    <option key={item.id} value={item.id}>{item.icon} {item.name} · ${item.currentPrice.toFixed(2)}</option>
                  ))}
                </select>
              )}
              <div className="text-[9px] leading-relaxed text-gray-500">
                Upgrades add two shelf slots. Each line sources and sells independently.
              </div>
            </div>
          ) : (
            <>
              <select
                value={building.productId || ''}
                onChange={event => onConfigureProduct(building.id, event.target.value)}
                className="w-full rounded-md border border-gray-700 bg-gray-800 px-2 py-1.5 text-[11px] text-white outline-none focus:border-emerald-500"
              >
                <option value="">Select a product</option>
                {availableProducts.map(item => <option key={item.id} value={item.id}>{item.name} | Tech {item.techLevel.toFixed(1)}</option>)}
              </select>
              {product && (
                <div className="mt-2 grid grid-cols-2 gap-1 text-[10px]">
                  <span className="text-gray-500">Market demand</span><span className="text-right text-cyan-400">{product.marketDemand.toFixed(0)}/100</span>
                  <span className="text-gray-500">Necessity</span><span className="text-right text-amber-400">{product.demandIndex}/100</span>
                  <span className="text-gray-500">Demand shifted</span><span className={product.demandShift > 70 ? 'text-right text-red-400' : 'text-right text-gray-300'}>{product.demandShift.toFixed(0)}%</span>
                </div>
              )}
            </>
          )}
        </Section>
      )}

      {isOwned && building.menu.length > 0 && (
        <Section title="Menu Board">
          {(() => {
            const active = building.menu.filter(m => m.enabled);
            const weight = active.reduce((s, m) => s + m.popularity, 0) || 1;
            const blendedPrice = active.reduce((s, m) => s + (m.popularity / weight) * m.price, 0);
            const blendedCost = active.reduce((s, m) => s + (m.popularity / weight) * (m.foodCost + (m.includesToy ? 0.42 : 0)), 0);
            const foodCostPct = blendedPrice > 0 ? (blendedCost / blendedPrice) * 100 : 0;
            return (
              <>
                <div className="mb-1.5 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px]">
                  <span className="text-gray-500">Avg check</span>
                  <span className="text-right font-mono text-emerald-400">${(blendedPrice * building.pricingMultiplier).toFixed(2)}</span>
                  <span className="text-gray-500">Food cost</span>
                  <span className={`text-right font-mono ${foodCostPct < 32 ? 'text-emerald-400' : foodCostPct < 38 ? 'text-amber-400' : 'text-red-400'}`}>
                    {foodCostPct.toFixed(1)}%
                  </span>
                  <span className="text-gray-500">Covers / hr</span>
                  <span className="text-right font-mono text-cyan-400">{building.lastUnitsSold.toFixed(1)}</span>
                </div>
                <div className="mb-1.5 text-[9px] leading-relaxed text-gray-500">
                  Industry benchmark is 28–35% food cost. Drinks and sides carry the margin;
                  kids boxes include a licensed toy at $0.42 but pull family traffic.
                </div>
                <div className="space-y-1">
                  {building.menu.map(item => (
                    <div key={item.id} className={`rounded border px-2 py-1.5 ${item.enabled ? 'border-gray-800 bg-gray-900/60' : 'border-gray-800/50 bg-gray-900/20 opacity-50'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="truncate text-[10px] font-semibold text-gray-200">{item.name}</span>
                            {item.includesToy && <span className="rounded bg-amber-700 px-1 text-[8px] font-bold text-white">TOY</span>}
                          </div>
                          <div className="text-[9px] uppercase tracking-wide text-gray-500">
                            {item.category} · cost ${item.foodCost.toFixed(2)} · {(item.popularity * 100).toFixed(0)}% mix
                          </div>
                        </div>
                        <button
                          onClick={() => onToggleMenuItem(building.id, item.id)}
                          className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] ${item.enabled ? 'border-emerald-700 text-emerald-400' : 'border-gray-700 text-gray-500'}`}
                        >{item.enabled ? 'On' : 'Off'}</button>
                      </div>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className="text-[9px] text-gray-500">$</span>
                        <input
                          type="number"
                          step="0.25"
                          value={item.price}
                          onChange={e => onSetMenuPrice(building.id, item.id, Number(e.target.value))}
                          className="w-16 rounded border border-gray-700 bg-gray-800 px-1 py-0.5 text-[10px] text-white"
                        />
                        <span className={`text-[9px] font-mono ${
                          (item.price - item.foodCost) / item.price > 0.68 ? 'text-emerald-400' : 'text-amber-400'
                        }`}>
                          {(((item.price - item.foodCost) / Math.max(0.01, item.price)) * 100).toFixed(0)}% GM
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            );
          })()}
        </Section>
      )}

      {isOwned && (isHospitalityType(building.type) || building.type === 'retail_store') && (
        <Section title="Delivery Channel">
          <button
            onClick={() => onToggleDelivery(building.id)}
            className={`w-full rounded border py-1.5 text-[10px] font-bold ${
              building.delivery.enabled
                ? 'border-emerald-600 bg-emerald-600/15 text-emerald-300'
                : 'border-gray-700 text-gray-400 hover:border-gray-500'
            }`}
          >
            {building.delivery.enabled ? 'Delivery active' : 'Enable delivery'}
          </button>
          {building.delivery.enabled && (
            <div className="mt-2 space-y-2">
              <div className="flex gap-1">
                {(['platform', 'in_house'] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => onConfigureDelivery(building.id, { mode })}
                    className={`flex-1 rounded border py-1 text-[9px] font-bold ${
                      building.delivery.mode === mode
                        ? 'border-cyan-500 bg-cyan-950/40 text-cyan-300'
                        : 'border-gray-700 text-gray-400'
                    }`}
                  >{mode === 'platform' ? 'Marketplace' : 'Own fleet'}</button>
                ))}
              </div>
              <RangeRow label="Radius (tiles)" value={building.delivery.radius} min={2} max={18} step={1} suffix=""
                onChange={v => onConfigureDelivery(building.id, { radius: v })} />
              {building.delivery.mode === 'in_house' && (
                <RangeRow label="Couriers on shift" value={building.delivery.couriers} min={0} max={20} step={1} suffix=""
                  onChange={v => onConfigureDelivery(building.id, { couriers: v })} />
              )}
              <RangeRow label="Delivery fee" value={building.delivery.customerFee} min={0} max={12} step={0.5} suffix="$"
                onChange={v => onConfigureDelivery(building.id, { customerFee: v })} />
              <DataRow label="Orders / hr" value={building.delivery.ordersLastTick.toFixed(1)} color="text-cyan-400" />
              <DataRow
                label="Avg delivery time"
                value={`${building.delivery.avgDeliveryMinutes.toFixed(0)} min`}
                color={building.delivery.avgDeliveryMinutes < 30 ? 'text-emerald-400' : building.delivery.avgDeliveryMinutes < 45 ? 'text-amber-400' : 'text-red-400'}
              />
              {building.delivery.mode === 'platform' && (
                <DataRow label="Commission" value={`${(building.delivery.commissionRate * 100).toFixed(0)}%`} color="text-red-400" />
              )}
              <div className="text-[9px] leading-relaxed text-gray-500">
                Past 30 minutes customers stop reordering; past 45 the channel collapses.
                A fee above ~8% of basket value suppresses orders. Marketplaces need no
                fleet but take {(building.delivery.commissionRate * 100).toFixed(0)}% of every order.
              </div>
            </div>
          )}
        </Section>
      )}

      {isOwned && (building.type === 'factory' || building.type === 'farm' || building.type === 'mine') && (
        <Section title="Operations Policy">
          <RangeRow label="Line intensity" value={building.productionIntensity} min={0.6} max={1.4} step={0.05} suffix="x"
            onChange={v => onSetIntensity(building.id, v)} />
          <RangeRow label="Safety stock" value={building.safetyStockPolicy} min={0} max={1} step={0.05} suffix=""
            onChange={v => onSetSafetyStock(building.id, v)} />
          <DataRow label="Demand forecast" value={building.demandForecast.toFixed(0)} color="text-cyan-400" />
          <DataRow label="Staffed" value={`${building.staffedEmployees.toFixed(0)} / ${building.employees}`}
            color={building.staffedEmployees >= building.employees * 0.95 ? 'text-emerald-400' : 'text-amber-400'} />
          <DataRow label="Effective skill" value={`Lv ${building.effectiveTraining.toFixed(1)} / ${building.trainingLevel}`} color="text-violet-400" />
          {building.supplyDisrupted && (
            <div className="mt-1 rounded border border-red-800 bg-red-950/30 px-2 py-1 text-[9px] text-red-300">
              Supplier failure — this plant is stranded and re-sourcing.
            </div>
          )}
          <div className="text-[9px] leading-relaxed text-gray-500">
            Running above 1.0× lifts output but raises defects and burns out staff.
            Lean safety stock frees working capital; heavy buffers absorb the bullwhip.
          </div>
        </Section>
      )}

      {isOwned && building.type === 'factory' && gameState.tradePartners.length > 0 && (
        <Section title="Offshoring">
          <div className="text-[9px] leading-relaxed text-gray-500">
            Relocating cuts payroll by ~65% but imports a quality penalty, tariff exposure
            and reputational damage.
          </div>
          <div className="mt-1.5 space-y-1">
            {gameState.tradePartners.map(partner => (
              <button
                key={partner.id}
                onClick={() => onOffshore(building.id, partner.id)}
                className="w-full rounded border border-gray-700 px-2 py-1 text-left text-[9px] hover:border-amber-600"
              >
                <span className="font-bold text-gray-200">{partner.name}</span>
                <span className="text-gray-500"> · wages {(partner.wageIndex * 100).toFixed(0)}% · quality −{(partner.qualityPenalty * 100).toFixed(0)}% · tariff {(partner.tariffRate * 100).toFixed(0)}%</span>
              </button>
            ))}
          </div>
        </Section>
      )}

      {isOwned && (building.type === 'retail_store' || isHospitalityType(building.type)) && (
        <Section title="Marketing">
          <RangeRow
            label="Local ad spend / mo"
            value={building.adBudget}
            min={0} max={120000} step={5000}
            suffix=""
            onChange={value => onSetAdBudget(building.id, value)}
          />
          <DataRow label="Brand awareness" value={`${(company?.brandAwareness ?? 0).toFixed(0)}/100`} color="text-fuchsia-400" />
          <DataRow label="Loyal customer base" value={`${(building.loyalCustomerBase * 100).toFixed(0)}%`} color="text-cyan-400" />
          <div className="text-[9px] leading-relaxed text-gray-500">
            Advertising builds national awareness that lifts every outlet. Loyal customers
            keep buying through price changes — roughly 15% of a base can switch per month.
          </div>
        </Section>
      )}

      {isOwned && (building.type === 'retail_store' || isHospitalityType(building.type) || building.type === 'warehouse') && (
        <Section title="Site Accessibility">
          <DataRow label="Parking" value={`${(building.parkingScore * 100).toFixed(0)}/100`} color={building.parkingScore > 0.6 ? 'text-emerald-400' : 'text-amber-400'} />
          <DataRow label="Highway access" value={`${(building.highwayAccess * 100).toFixed(0)}/100`} color={building.highwayAccess > 0.5 ? 'text-emerald-400' : 'text-gray-400'} />
          <DataRow label="Staff morale" value={`${building.employeeSatisfaction.toFixed(0)}/100`} color={building.employeeSatisfaction > 65 ? 'text-emerald-400' : building.employeeSatisfaction > 40 ? 'text-amber-400' : 'text-red-400'} />
          {city && (
            <div className="text-[9px] leading-relaxed text-gray-500">
              {city.name} is {(city.carDependency * 100).toFixed(0)}% car-dependent
              {city.carDependency > 0.6 ? ' — parking is critical here.' : ' — footfall matters more than parking.'}
            </div>
          )}
        </Section>
      )}

      {isOwned && building.type === 'warehouse' && (
        <Section title="Storage Specialisation">
          <div className="flex gap-1">
            {(['general', 'cold', 'hazmat'] as const).map(tier => (
              <button
                key={tier}
                onClick={() => onSetWarehouseTier(building.id, tier)}
                className={`flex-1 rounded border py-1.5 text-[9px] font-bold capitalize ${
                  building.warehouseTier === tier
                    ? 'border-cyan-500 bg-cyan-950/40 text-cyan-300'
                    : 'border-gray-700 text-gray-400 hover:border-gray-500'
                }`}
              >{tier}</button>
            ))}
          </div>
          <div className="mt-1.5 text-[9px] leading-relaxed text-gray-500">
            {building.warehouseTier === 'cold' && 'Cold chain: premium rates for food & pharma, higher energy opex.'}
            {building.warehouseTier === 'hazmat' && 'Hazmat-certified: top rates for chemicals & fuel, strict compliance costs.'}
            {building.warehouseTier === 'general' && 'General dry goods: low rates, low opex, broad demand.'}
          </div>
        </Section>
      )}

      {isOwned && (building.type === 'retail_store' || building.type === 'internet_ecommerce') && (
        <Section title="Retail Policy">
          <RangeRow label="Price" value={building.pricingMultiplier} min={0.55} max={1.8} step={0.05} suffix="x" onChange={value => onSetPrice(building.id, value)} />
          <div className="mt-1 text-[10px] text-gray-500">Lower prices improve rating and unit sales; higher prices improve margin.</div>
        </Section>
      )}

      {isOwned && (building.type === 'retail_store' || building.type === 'internet_ecommerce') && product && (
        <Section title="Capitalism Lab Style Retail Details">
          <DataRow label="Employee wage / month" value={formatMoney(monthlyWagePerEmployee)} color="text-amber-400" />
          <DataRow label="Product quality" value={`${product.quality.toFixed(1)}/100`} color="text-cyan-400" />
          <DataRow label="Brand score" value={`${product.brand.toFixed(1)}/100`} color="text-fuchsia-400" />
          <DataRow label="Overall rating" value={`${retailRating.toFixed(1)}/100`} color={retailRating > 60 ? 'text-emerald-400' : 'text-red-400'} />
          <DataRow label="Buy price" value={formatMoney(averageSupplierPrice)} color="text-orange-400" />
          <DataRow label="Freight / unit" value={formatMoney(building.freightCost)} color="text-yellow-400" />
          <DataRow label="Shelf price" value={formatMoney(product.currentPrice * building.pricingMultiplier)} color="text-emerald-400" />
          <DataRow label="Gross margin" value={`${(((product.currentPrice * building.pricingMultiplier - averageSupplierPrice - building.freightCost) / Math.max(1, product.currentPrice * building.pricingMultiplier)) * 100).toFixed(1)}%`} color="text-blue-400" />
          <DataRow label="Units sold / hour" value={building.lastUnitsSold.toFixed(2)} color={building.lastUnitsSold > 0.15 ? 'text-emerald-400' : 'text-red-400'} />
          <DataRow label="Sell-through / month" value={`${sellThrough.toFixed(1)}%`} color={sellThrough > 50 ? 'text-emerald-400' : 'text-amber-400'} />
          <DataRow label="Inventory" value={`${Object.values(building.inventory).reduce((sum, value) => sum + value, 0).toFixed(0)} / ${building.inventoryCapacity.toFixed(0)}`} color="text-gray-300" />
          {(product.category === 'Food' || product.category === 'Beverage' || product.category === 'Drugs') && (
            <>
              <DataRow label="Expired / hour" value={building.expiredUnits.toFixed(2)} color={building.expiredUnits > 0 ? 'text-red-400' : 'text-emerald-400'} />
              <DataRow label="Spoilage loss" value={formatMoney(building.spoilageLoss)} color="text-red-400" />
            </>
          )}
          <div className="mt-1 text-[9px] leading-relaxed text-gray-500">
            Sales diagnosis: {building.lastUnitsSold <= 0.01 ? 'No movement. Check supplier stock, price, traffic, and rating.' : sellThrough > 75 ? 'Selling fast. Consider more stores, more inventory, or a higher price.' : sellThrough < 20 ? 'Weak movement. Lower price, increase brand, or move to higher traffic.' : 'Balanced shelf performance.'}
          </div>
        </Section>
      )}

      {isOwned && (building.type === 'factory' || building.type === 'farm' || building.type === 'mine') && product && (
        <Section title="Manufacturer's Guide">
          <DataRow label="Output" value={product.name} color="text-emerald-400" />
          <DataRow label="Produced / hour" value={building.lastUnitsProduced.toFixed(2)} color="text-cyan-400" />
          <DataRow label="Production tech" value={product.techLevel.toFixed(1)} color="text-violet-400" />
          <DataRow label="Output quality" value={`${product.quality.toFixed(1)}/100`} color="text-cyan-400" />
          <DataRow label="Unit production cost" value={formatMoney(product.productionCost)} color="text-orange-400" />
          <DataRow label="Input landed cost" value={formatMoney(building.inputCost + building.freightCost)} color="text-yellow-400" />
          {product.inputs.length === 0 ? <div className="text-[10px] text-gray-500">Raw or farm product. Quality is driven mostly by location and training.</div> : product.inputs.map(input => {
            const link = building.supplierLinks.find(item => item.productId === input.productId);
            return (
              <div key={input.productId} className="border-t border-gray-800 pt-1 text-[10px]">
                <div className="flex justify-between"><span className="text-gray-300">{input.productName} x{input.quantity}</span><span className="text-amber-400">Q{(link?.quality || 0).toFixed(0)}</span></div>
                <div className="text-[9px] text-gray-500">Buy {formatMoney(link?.pricePerUnit || 0)} + freight {formatMoney(link?.freightPerUnit || 0)} per unit</div>
              </div>
            );
          })}
          <div className="mt-1 rounded border border-cyan-900 bg-cyan-950/30 p-2 text-[9px] leading-relaxed text-cyan-200">
            Quality is determined by production tech, training, and input quality. Raw-material mines deplete; farms do not, but farm output is seasonal and training-sensitive.
          </div>
        </Section>
      )}

      {isOwned && building.supplierLinks.length > 0 && (
        <Section title="Supplier Links">
          {building.supplierLinks.map(link => {
            const input = gameState.products.find(item => item.id === link.productId);
            const supplier = gameState.buildings.find(item => item.id === link.supplierBuildingId);
            return (
              <div key={link.productId} className="border-b border-gray-800 pb-1.5 last:border-0">
                <div className="flex justify-between text-[10px]"><span className="text-gray-300">{input?.name}</span><span className="text-emerald-400">Q{link.quality.toFixed(0)}</span></div>
                <div className="truncate text-[9px] text-gray-500">{supplier?.name} | Goods {formatMoney(link.pricePerUnit)} + freight {formatMoney(link.freightPerUnit)}/u</div>
              </div>
            );
          })}
          <button onClick={() => onAutoSource(building.id)} className="mt-1.5 w-full rounded bg-cyan-700 py-1.5 text-[10px] font-bold hover:bg-cyan-600">Find best landed cost</button>
        </Section>
      )}

      {isOwned && (building.type === 'factory' || building.type === 'farm' || building.type === 'mine') && (
        <Section title="Wholesale Policy">
          <button onClick={() => onToggleInternalSale(building.id)} className={`w-full rounded border py-1.5 text-[10px] font-bold ${building.internalSale ? 'border-amber-500 bg-amber-500/15 text-amber-300' : 'border-emerald-600 bg-emerald-600/15 text-emerald-300'}`}>
            {building.internalSale ? 'Internal sale only' : 'Open to competitor clients'}
          </button>
          <div className="mt-1 text-[9px] leading-relaxed text-gray-500">Open sales monetize spare capacity. Internal sale protects scarce inputs and product advantages.</div>
          {gameState.buildings.filter(client => client.supplierLinks.some(link => link.supplierBuildingId === building.id)).map(client => (
            <div key={client.id} className="flex justify-between border-t border-gray-800 pt-1 text-[9px]"><span className="max-w-32 truncate text-gray-400">{client.name}</span><span className="text-emerald-400">client</span></div>
          ))}
        </Section>
      )}

      {isOwned && (building.type === 'apartment' || building.type === 'commercial') && (
        <Section title="Real Estate Economics">
          <RangeRow label="Rent" value={building.rentMultiplier} min={0.6} max={1.6} step={0.05} suffix="x" onChange={value => onSetRent(building.id, value)} />
          <DataRow label="Rent / unit" value={`$${building.rentPerUnit.toFixed(0)}/mo`} color="text-emerald-400" />
          <DataRow label="Market rent" value={`$${(building.rentPerUnit / Math.max(0.01, building.rentMultiplier)).toFixed(0)}/mo`} color="text-cyan-400" />
          <DataRow label="Annual NOI" value={formatMoney(building.rentPerUnit * building.capacity * (building.occupancy / 100) * 12)} color="text-blue-400" />
          <DataRow label="Occupancy" value={`${building.occupancy.toFixed(0)}%`} color="text-emerald-400" />
          <DataRow label="Community" value={`${building.amenityCommunity.toFixed(0)}/100`} color="text-cyan-400" />
          <DataRow label="Sports / green" value={`${building.amenitySports.toFixed(0)}/100`} color="text-lime-400" />
          <DataRow label="Shopping" value={`${building.amenityShopping.toFixed(0)}/100`} color="text-violet-400" />
          {city && (
            <div className="mt-1 text-[9px] leading-relaxed text-gray-500">
              Rent-to-income: {(building.rentPerUnit / Math.max(1, city.wageRate * 173) * 100).toFixed(0)}% of gross pay (30% = affordability benchmark).
            </div>
          )}
        </Section>
      )}

      {!isOwned && company && building.companyId !== 'system' && (
        <Section title="Acquisition Negotiation">
          {(() => {
            const asking = askingPriceFor(building.id);
            const blocked = gameState.tick < building.negotiationBlockedUntil;
            const monthsLeft = blocked
              ? Math.max(1, Math.ceil((building.negotiationBlockedUntil - gameState.tick) / (24 * 30)))
              : 0;
            const insultThreshold = asking ? asking * 0.55 : 0;
            const isInsult = Boolean(asking) && offerAmount > 0 && offerAmount < insultThreshold;
            return (
              <div className="space-y-2">
                <DataRow label="Owner" value={company.name} color="text-gray-300" />
                <DataRow label="Board valuation" value={asking ? formatMoney(asking) : '--'} color="text-amber-400" />
                <DataRow
                  label="Status"
                  value={blocked ? 'Talks closed' : 'Open to offers'}
                  color={blocked ? 'text-red-400' : 'text-cyan-400'}
                />
                <div className="text-[9px] leading-relaxed text-gray-500">
                  Valuation is a DCF of forward earnings at {(gameState.economy.interestRate).toFixed(1)}% base rate
                  plus depreciated replacement cost. It moves with rates, occupancy and the cycle.
                </div>

                {blocked ? (
                  <div className="rounded-lg border border-red-800 bg-red-950/40 p-2 text-[10px] leading-relaxed text-red-300">
                    {company.name} walked away from talks. Their board will not reconsider for {monthsLeft} more month{monthsLeft > 1 ? 's' : ''}.
                  </div>
                ) : (
                  <>
                    <input
                      type="number"
                      value={offerAmount || ''}
                      onChange={e => setOfferAmount(Math.max(0, Number(e.target.value)))}
                      placeholder={asking ? Math.round(asking).toString() : 'Offer amount'}
                      className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-[11px] text-white"
                    />
                    {isInsult && (
                      <div className="rounded border border-red-800 bg-red-950/30 px-2 py-1 text-[9px] text-red-300">
                        Below 55% of book value — this will be treated as an insult and end talks for three months.
                      </div>
                    )}
                    <button
                      onClick={() => onMakeOffer(building.id, offerAmount || Math.round(asking || 0))}
                      className="w-full rounded bg-emerald-600 py-1.5 text-[10px] font-bold hover:bg-emerald-500"
                    >
                      Submit offer{(asking && offerAmount >= asking) ? ' — meets ask' : ''}
                    </button>
                  </>
                )}

                {gameState.lastOffer && gameState.lastOffer.buildingId === building.id && (
                  <div className={`rounded-lg border p-2 text-[10px] leading-relaxed ${
                    gameState.lastOffer.status === 'accepted'
                      ? 'border-emerald-700 bg-emerald-950/40 text-emerald-300'
                      : gameState.lastOffer.status === 'counter'
                        ? 'border-amber-700 bg-amber-950/40 text-amber-300'
                        : 'border-red-800 bg-red-950/40 text-red-300'
                  }`}>
                    {gameState.lastOffer.message}
                  </div>
                )}
              </div>
            );
          })()}
        </Section>
      )}

      {isOwned && (building.type.startsWith('media_') || building.type.startsWith('internet_')) && building.type !== 'media_tower' && (
        <Section title="Audience and Advertising">
          <RangeRow label="Content" value={building.contentBudget} min={0} max={1} step={0.05} suffix="" onChange={value => onSetMedia(building.id, value, building.advertisingPrice)} />
          <RangeRow label="Ad price" value={building.advertisingPrice} min={0.5} max={8} step={0.25} suffix="$" onChange={value => onSetMedia(building.id, building.contentBudget, value)} />
          <DataRow label="Rating / reach" value={building.mediaRating.toFixed(1)} color="text-fuchsia-400" />
        </Section>
      )}

      {isOwned && (building.type === 'rd_center' || building.type === 'software_company') && product && (
        <Section title="Research Project">
          <ProgressBar label="Project progress" value={building.researchProgress} color="bg-violet-500" />
          <button onClick={() => onStartResearch(building.id, product.id)} disabled={Boolean(building.researchProjectId && building.researchProgress < 100)} className="mt-1.5 w-full rounded bg-violet-600 py-1.5 text-[10px] font-bold hover:bg-violet-500 disabled:bg-gray-700 disabled:text-gray-500">Start next technology level</button>
        </Section>
      )}

      {isOwned && (
        <div className="space-y-1.5">
          <Section title="Workforce Training">
            <RangeRow label="Monthly budget" value={building.trainingBudget} min={0} max={1} step={0.05} suffix="" onChange={value => onSetTraining(building.id, value)} />
          </Section>
          <button
            onClick={() => onUpgradeBuilding(building.id)}
            className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-xs font-bold transition-colors"
            disabled={building.level >= building.maxLevel}
          >
            ⬆️ Upgrade (Lv {building.level} → {building.level + 1}) — {formatMoney(building.constructionCost * 0.4)}
          </button>
          <button
            onClick={() => onDemolishBuilding(building.id)}
            className="w-full py-2 bg-red-600/20 hover:bg-red-600 border border-red-600 rounded-lg text-xs font-bold transition-colors"
          >
            🗑️ Demolish (Refund: {formatMoney(building.constructionCost * 0.4)})
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * What a rival's premises look like from the street. Internal financials
 * (revenue, costs, payroll, training) are private — you only see what any
 * customer or analyst could observe: the storefront, the menu, prices,
 * how busy it is, and how well kept the building looks.
 */
function CompetitorView({ building, gameState }: { building: Building; gameState: GameState }) {
  const product = gameState.products.find(item => item.id === building.productId);
  const menu = building.products
    .map(id => gameState.products.find(p => p.id === id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));
  const isVenue = ['restaurant', 'fast_food', 'cafe', 'bar'].includes(building.type);
  const isShop = building.type === 'retail_store' || building.type === 'internet_ecommerce';
  const isRealEstate = building.type === 'apartment' || building.type === 'commercial';

  const busyness = building.utilization > 75 ? 'Packed' : building.utilization > 45 ? 'Steady trade' : building.utilization > 20 ? 'Quiet' : 'Nearly empty';
  const busyColor = building.utilization > 75 ? 'text-emerald-400' : building.utilization > 45 ? 'text-cyan-400' : building.utilization > 20 ? 'text-amber-400' : 'text-red-400';
  const upkeep = building.condition > 80 ? 'Well maintained' : building.condition > 55 ? 'Showing wear' : 'Run down';

  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-2 text-[9px] italic leading-relaxed text-gray-500">
        Competitor premises. Internal accounts are confidential — this is what public
        observation and market research can establish.
      </div>

      <Section title={isVenue ? 'On the Menu' : isShop ? 'On the Shelves' : 'Operation'}>
        {isVenue && building.menu.length > 0 ? (
          building.menu.filter(m => m.enabled).map(item => (
            <div key={item.id} className="flex items-center justify-between border-b border-gray-800 py-1 last:border-0">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-[10px] text-gray-300">{item.name}</span>
                {item.includesToy && <span className="shrink-0 rounded bg-amber-800 px-1 text-[8px] text-amber-200">toy</span>}
              </div>
              <span className="shrink-0 font-mono text-[10px] text-emerald-400">
                ${(item.price * building.pricingMultiplier).toFixed(2)}
              </span>
            </div>
          ))
        ) : (isVenue || isShop) && menu.length > 0 ? (
          menu.map(item => (
            <div key={item.id} className="flex items-center justify-between border-b border-gray-800 py-1 last:border-0">
              <div className="flex min-w-0 items-center gap-1.5">
                <span>{item.icon}</span>
                <span className="truncate text-[10px] text-gray-300">{item.name}</span>
              </div>
              <span className="shrink-0 font-mono text-[10px] text-emerald-400">
                ${(item.currentPrice * building.pricingMultiplier).toFixed(2)}
              </span>
            </div>
          ))
        ) : isRealEstate ? (
          <>
            <DataRow label="Units" value={`${Math.round(building.capacity)}`} color="text-gray-300" />
            <DataRow label="Asking rent" value={`$${building.rentPerUnit.toFixed(0)}/mo`} color="text-emerald-400" />
            <DataRow label="Occupancy" value={`${building.occupancy.toFixed(0)}%`} color={building.occupancy > 70 ? 'text-emerald-400' : 'text-amber-400'} />
          </>
        ) : product ? (
          <DataRow label="Produces" value={product.name} color="text-cyan-400" />
        ) : (
          <div className="text-[10px] text-gray-500">No public product listing.</div>
        )}
      </Section>

      <Section title="Public Observation">
        <DataRow label="Footfall" value={busyness} color={busyColor} />
        {building.customerTraffic > 0 && (
          <DataRow label="Location traffic" value={`${building.customerTraffic.toFixed(0)}/100`} color="text-pink-400" />
        )}
        <DataRow label="Condition" value={upkeep} color={building.condition > 70 ? 'text-cyan-400' : 'text-amber-400'} />
        <DataRow label="Site size" value={`${building.width}×${building.height} plots`} color="text-gray-300" />
        <DataRow label="Storeys" value={`${building.level}`} color="text-gray-300" />
        {product && (isVenue || isShop) && (
          <DataRow label="Reputation" value={`${product.brand.toFixed(0)}/100`} color="text-violet-400" />
        )}
      </Section>
    </div>
  );
}

function StatBox({ label, value, color, tip }: { label: string; value: string; color: string; tip?: string }) {
  return (
    <div className="bg-gray-900 rounded-lg p-2 border border-gray-800 text-center cursor-help" title={tip}>
      <div className="text-[9px] text-gray-500 uppercase tracking-wider">{label}</div>
      <div className={`text-xs font-mono font-bold ${color}`}>{value}</div>
    </div>
  );
}

function ProgressBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-[10px] text-gray-500 mb-0.5">
        <span>{label}</span>
        <span>{value.toFixed(0)}%</span>
      </div>
      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function RangeRow({ label, value, min, max, step, suffix, onChange }: {
  label: string; value: number; min: number; max: number; step: number; suffix: string; onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-[10px] text-gray-500">
        <span>{label}</span>
        <span className="font-mono text-gray-300">{suffix === '$' ? '$' : ''}{value.toFixed(2)}{suffix === 'x' ? 'x' : ''}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={event => onChange(Number(event.target.value))} className="w-full accent-emerald-500" />
    </div>
  );
}

// ============= FINANCES =============

function FinancesPanel({ gameState, onTakeLoan, onRepayLoan, onIssueBond, onBuyBond, onIssueShares }: SidePanelProps) {
  const [loanAmount, setLoanAmount] = useState(5000000);
  const [bondTerm, setBondTerm] = useState<5 | 10 | 15 | 20>(10);
  const [shareAmount, setShareAmount] = useState(100000);
  const company = gameState.companies.find(c => c.isPlayer)!;
  const maxLoan = Math.max(0, company.totalAssets - company.debt);
  const ownership = company.sharesOwned / Math.max(1, company.sharesOutstanding) * 100;

  return (
    <div className="space-y-3">
      <div className="bg-gradient-to-br from-emerald-900/40 to-gray-900 rounded-xl p-3 border border-emerald-800">
        <div className="text-[10px] text-emerald-300 uppercase tracking-wider">Net Worth</div>
        <div className="text-2xl font-black text-white font-mono">{formatMoney(gameState.player.netWorth)}</div>
        <div className="text-[10px] text-gray-400 mt-1">Bond Rating: <span className="text-yellow-400 font-bold">{company.bondRating}</span></div>
      </div>

      <Section title="📊 Financials">
        <DataRow label="Cash" value={formatMoney(company.cash)} color="text-green-400" />
        <DataRow label="Revenue (mo)" value={formatMoney(company.revenue * 24 * 30)} color="text-blue-400" />
        <DataRow label="Expenses (mo)" value={formatMoney(company.expenses * 24 * 30)} color="text-orange-400" />
        <DataRow label="Net Profit (mo)" value={formatMoney(company.profit * 24 * 30)} color={company.profit >= 0 ? 'text-green-400' : 'text-red-400'} />
        <DataRow label="Total Assets" value={formatMoney(company.totalAssets)} color="text-cyan-400" />
        <DataRow label="Total Debt" value={formatMoney(company.debt)} color="text-red-400" />
        <DataRow label="Share Price" value={`$${company.sharePrice.toFixed(2)}`} color="text-yellow-400" />
        <DataRow label="Market Cap" value={formatMoney(company.marketCap)} color="text-purple-400" />
      </Section>
      <Section title={`Freight in transit (${gameState.freight.length})`}>
        {gameState.freight.length === 0 && <div className="text-[10px] text-gray-500">No trucks are currently dispatched.</div>}
        {gameState.freight.slice(0, 8).map(route => {
          const product = gameState.products.find(item => item.id === route.good);
          const from = gameState.buildings.find(item => item.id === route.fromBuildingId);
          const to = gameState.buildings.find(item => item.id === route.toBuildingId);
          return (
            <div key={route.id} className="border-b border-gray-800 py-1 last:border-0">
              <div className="flex justify-between text-[10px]"><span className="text-gray-300">{product?.name}</span><span className="font-mono text-amber-400">{route.progress.toFixed(0)}%</span></div>
              <div className="truncate text-[9px] text-gray-500">{from?.name} to {to?.name} | {route.distance.toFixed(1)} km | {formatMoney(route.freightCost)}</div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-gray-800"><div className="h-full bg-amber-500" style={{ width: `${route.progress}%` }} /></div>
            </div>
          );
        })}
      </Section>

      <Section title="💳 Debt Management">
        <div className="text-[10px] text-gray-400">Max borrowing: <span className="text-emerald-400 font-mono">{formatMoney(maxLoan)}</span></div>
        <div className="flex items-center gap-2 mt-1">
          <input
            type="range"
            min={100000}
            max={Math.max(100000, maxLoan)}
            step={100000}
            value={loanAmount}
            onChange={e => setLoanAmount(Number(e.target.value))}
            className="flex-1"
          />
          <span className="text-[10px] font-mono text-emerald-400 w-16 text-right">{formatMoney(loanAmount)}</span>
        </div>
        <div className="flex gap-1.5 mt-2">
          <button onClick={() => onTakeLoan(loanAmount)} className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded text-[11px] font-bold">Bank loan</button>
          <button onClick={() => onRepayLoan(loanAmount)} className="flex-1 py-1.5 bg-orange-600 hover:bg-orange-500 rounded text-[11px] font-bold disabled:bg-gray-700 disabled:text-gray-500" disabled={company.debt <= 0}>Repay</button>
        </div>
      </Section>

      <Section title="Commercial Bank Offers">
        {gameState.bankOffers.map(offer => (
          <div key={offer.id} className="border-b border-gray-800 py-1.5 last:border-0">
            <div className="flex justify-between text-[10px]"><span className="text-gray-300">{offer.bankName}</span><span className="font-mono text-cyan-400">{offer.interestRate.toFixed(1)}%</span></div>
            <div className="text-[9px] text-gray-500">Limit {formatMoney(offer.creditLimit)} | up to {offer.maxTermYears} years</div>
          </div>
        ))}
      </Section>

      <Section title="Issue Corporate Bond">
        <div className="flex gap-1">
          {([5, 10, 15, 20] as const).map(term => (
            <button key={term} onClick={() => setBondTerm(term)} className={`flex-1 rounded py-1 text-[10px] font-bold ${bondTerm === term ? 'bg-violet-600 text-white' : 'bg-gray-800 text-gray-500'}`}>{term}Y</button>
          ))}
        </div>
        <button onClick={() => onIssueBond(loanAmount, bondTerm)} className="mt-1.5 w-full rounded bg-violet-600 py-1.5 text-[10px] font-bold hover:bg-violet-500">Issue {formatMoney(loanAmount)} at market coupon</button>
        <div className="text-[9px] leading-relaxed text-gray-500">Longer terms and weaker credit ratings raise the coupon. Principal is redeemed at maturity.</div>
      </Section>

      <Section title="Bond Market">
        {gameState.bonds.map(bond => {
          const issuer = gameState.companies.find(item => item.id === bond.issuerId);
          return (
            <div key={bond.id} className="border-b border-gray-800 py-1.5 last:border-0">
              <div className="flex justify-between text-[10px]"><span className="max-w-32 truncate text-gray-300">{issuer?.name}</span><span className="text-amber-400">{bond.rating}</span></div>
              <div className="flex justify-between text-[9px] text-gray-500"><span>{bond.couponRate.toFixed(1)}% coupon | {bond.maturityYear}</span><span>${bond.marketPrice.toFixed(1)}</span></div>
              {issuer?.id !== company.id && !bond.holderId && <button onClick={() => onBuyBond(bond.id)} className="mt-1 w-full rounded border border-cyan-700 py-1 text-[9px] font-bold text-cyan-300 hover:bg-cyan-900/40">Buy issue for {formatMoney(bond.faceValue * bond.quantity * bond.marketPrice / 100)}</button>}
            </div>
          );
        })}
      </Section>

      <Section title="Equity Financing">
        <DataRow label="CEO ownership" value={`${ownership.toFixed(1)}%`} color={ownership >= 50 ? 'text-emerald-400' : 'text-red-400'} />
        <input type="number" value={shareAmount} min={1000} step={10000} onChange={event => setShareAmount(Math.max(1000, Number(event.target.value)))} className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-[10px] text-white" />
        <button onClick={() => onIssueShares(shareAmount)} className="w-full rounded bg-blue-600 py-1.5 text-[10px] font-bold hover:bg-blue-500">Issue shares for {formatMoney(shareAmount * company.sharePrice * 0.97)}</button>
        <div className="text-[9px] leading-relaxed text-gray-500">New shares raise cash without interest but dilute your control. Falling below 50% exposes the company to takeover.</div>
      </Section>

      <Section title="📈 Economy">
        <DataRow label="GDP Growth" value={formatPercent(gameState.economy.gdpGrowth)} color={gameState.economy.gdpGrowth > 0 ? 'text-green-400' : 'text-red-400'} />
        <DataRow label="Inflation" value={formatPercent(gameState.economy.inflation)} color="text-yellow-400" />
        <DataRow label="Interest Rate" value={formatPercent(gameState.economy.interestRate)} color="text-blue-400" />
        <DataRow label="Consumer Conf." value={gameState.economy.consumerConfidence.toFixed(0)} color="text-cyan-400" />
        <DataRow label="Business Conf." value={gameState.economy.businessConfidence.toFixed(0)} color="text-purple-400" />
        <DataRow label="Cycle" value={gameState.economy.cycle.toUpperCase()} color={
          gameState.economy.cycle === 'boom' ? 'text-green-400' :
          gameState.economy.cycle === 'recession' ? 'text-red-400' : 'text-yellow-400'
        } />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-900 rounded-xl p-3 border border-gray-800 space-y-1.5">
      <h4 className="text-[10px] font-bold text-gray-300 uppercase tracking-wider">{title}</h4>
      {children}
    </div>
  );
}

function DataRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex justify-between items-center text-[11px]">
      <span className="text-gray-500">{label}</span>
      <span className={`font-mono font-bold ${color}`}>{value}</span>
    </div>
  );
}

// ============= STOCK MARKET =============

function StockMarketPanel({ gameState, onBuyShares, onSellShares }: SidePanelProps) {
  const [shareAmount, setShareAmount] = useState(1000);
  const [sector, setSector] = useState('all');
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statementView, setStatementView] = useState<'income' | 'balance'>('income');
  const sm = gameState.stockMarket;
  const visibleCompanies = gameState.companies.filter(company =>
    (sector === 'all' || company.sector === sector) && (!ownedOnly || company.sharesOwned > 0)
  );

  // Sector-level aggregates make the industry comparison meaningful — one
  // click and you're looking at whether the whole tech sector is profitable,
  // not just a single ticker.
  const sectorTotals = new Map<string, { revenue: number; profit: number; assets: number; debt: number; firms: number }>();
  for (const c of gameState.companies) {
    const bucket = sectorTotals.get(c.sector) ?? { revenue: 0, profit: 0, assets: 0, debt: 0, firms: 0 };
    bucket.revenue += c.revenue * 24 * 365;
    bucket.profit += c.profit * 24 * 365;
    bucket.assets += c.totalAssets;
    bucket.debt += c.debt;
    bucket.firms += 1;
    sectorTotals.set(c.sector, bucket);
  }

  return (
    <div className="space-y-3">
      <div className="bg-gradient-to-br from-blue-900/40 to-gray-900 rounded-xl p-3 border border-blue-800">
        <div className="flex justify-between items-center mb-2">
          <span className="text-[10px] text-gray-400 uppercase">Market Index</span>
          <span className={`text-lg font-mono font-black ${
            sm.sentiment === 'bullish' ? 'text-green-400' : sm.sentiment === 'bearish' ? 'text-red-400' : 'text-yellow-400'
          }`}>
            {sm.index.toFixed(0)}
          </span>
        </div>
        <div className="h-14 flex items-end gap-px">
          {sm.indexHistory.slice(-50).map((val, i, arr) => {
            const min = Math.min(...arr);
            const max = Math.max(...arr);
            const range = max - min || 1;
            const h = ((val - min) / range) * 100;
            return (
              <div
                key={i}
                className="flex-1 rounded-t"
                style={{
                  height: `${h}%`,
                  backgroundColor: i === arr.length - 1 ? '#10b981' : (val > (arr[i - 1] ?? val) ? '#22c55eaa' : '#ef4444aa'),
                }}
              />
            );
          })}
        </div>
        <div className="flex justify-between text-[9px] text-gray-500 mt-1.5">
          <span>Rate: <span className="text-blue-400">{sm.interestRate.toFixed(1)}%</span></span>
          <span>Inf: <span className="text-yellow-400">{sm.inflationRate.toFixed(1)}%</span></span>
          <span className={sm.sentiment === 'bullish' ? 'text-green-400' : sm.sentiment === 'bearish' ? 'text-red-400' : 'text-yellow-400'}>
            {sm.sentiment.toUpperCase()}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 bg-gray-900 rounded-lg p-2 border border-gray-800">
        <span className="text-[10px] text-gray-500">Shares:</span>
        <input
          type="number"
          value={shareAmount}
          onChange={e => setShareAmount(Math.max(1, parseInt(e.target.value) || 1))}
          className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-white"
        />
      </div>

      <div className="flex flex-wrap gap-1">
        {['all', 'consumer', 'technology', 'real_estate', 'media', 'investment'].map(item => (
          <button key={item} onClick={() => setSector(item)} className={`rounded px-2 py-1 text-[9px] capitalize ${sector === item ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-500'}`}>{item.replace('_', ' ')}</button>
        ))}
        <button onClick={() => setOwnedOnly(value => !value)} className={`rounded px-2 py-1 text-[9px] ${ownedOnly ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-gray-500'}`}>Owned</button>
      </div>

      {/* Sector snapshot: industry-wide P&L and balance so the player can
         compare where capital is actually earning. */}
      {sector !== 'all' && (() => {
        const totals = sectorTotals.get(sector);
        if (!totals || totals.firms === 0) return null;
        const equity = totals.assets - totals.debt;
        return (
          <div className="rounded-lg border border-cyan-800 bg-cyan-950/25 p-2.5">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">Sector · {sector.replace('_', ' ')}</span>
              <span className="text-[9px] text-cyan-500">{totals.firms} firm{totals.firms > 1 ? 's' : ''}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px]">
              <span className="text-gray-500">Revenue (annualised)</span>
              <span className="text-right font-mono text-blue-400">{formatMoney(totals.revenue)}</span>
              <span className="text-gray-500">Net income</span>
              <span className={`text-right font-mono ${totals.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatMoney(totals.profit)}</span>
              <span className="text-gray-500">Total assets</span>
              <span className="text-right font-mono text-cyan-400">{formatMoney(totals.assets)}</span>
              <span className="text-gray-500">Total equity</span>
              <span className="text-right font-mono text-violet-400">{formatMoney(equity)}</span>
              <span className="text-gray-500">Sector ROA</span>
              <span className={`text-right font-mono ${totals.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{totals.assets > 0 ? `${(totals.profit / totals.assets * 100).toFixed(1)}%` : '—'}</span>
            </div>
          </div>
        );
      })()}

      <div className="space-y-1.5">
        {visibleCompanies.map(c => {
          const expanded = expandedId === c.id;
          const annualRevenue = c.revenue * 24 * 365;
          const annualExpenses = c.expenses * 24 * 365;
          const annualProfit = c.profit * 24 * 365;
          const equity = c.totalAssets - c.debt;
          const pe = c.profit > 0 ? c.marketCap / annualProfit : null;
          return (
            <div key={c.id} className="bg-gray-900 rounded-lg p-2.5 border border-gray-800">
              <div className="flex justify-between items-center mb-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: c.color }} />
                  <span className="text-[11px] font-bold truncate">{c.name}</span>
                  {c.isPlayer && <span className="text-[8px] bg-emerald-600 px-1 py-0.5 rounded">YOU</span>}
                  <span className="text-[8px] uppercase text-gray-500">{c.sector.replace('_', ' ')}</span>
                </div>
                <span className="text-xs font-mono font-bold text-yellow-400">${c.sharePrice.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-[9px] text-gray-500 mb-1.5">
              <span>MCap: {formatMoney(c.marketCap)}</span>
              {pe !== null && <span>P/E: {pe.toFixed(1)}</span>}
              <span>Rating: <span className="text-orange-400">{c.bondRating}</span></span>
            </div>
            <div className="flex justify-between text-[9px] text-gray-500 mb-1.5">
              <span>Outstanding: {c.sharesOutstanding.toLocaleString()}</span>
              <span>Float: {c.sharesFloat.toLocaleString()}</span>
              <span>You own: {c.sharesOwned.toLocaleString()}</span>
            </div>
              <div className="flex gap-1">
                {!c.isPlayer && (
                  <>
                    <button onClick={() => onBuyShares(c.id, shareAmount)} className="flex-1 rounded border border-green-600 bg-green-600/30 py-1 text-[10px] font-bold transition-colors hover:bg-green-600">
                      Buy {shareAmount.toLocaleString()}
                    </button>
                    <button onClick={() => onSellShares(c.id, shareAmount)} className="flex-1 rounded border border-red-600 bg-red-600/30 py-1 text-[10px] font-bold transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-30" disabled={c.sharesOwned < shareAmount}>
                      Sell
                    </button>
                  </>
                )}
                <button
                  onClick={() => setExpandedId(expanded ? null : c.id)}
                  className={`rounded border px-2 py-1 text-[10px] font-bold ${expanded ? 'border-cyan-500 bg-cyan-950/40 text-cyan-300' : 'border-gray-700 text-gray-400 hover:border-cyan-600'}`}
                >
                  {expanded ? 'Hide filings' : 'Filings'}
                </button>
              </div>

              {/* Expandable filings viewer: income statement and balance
                 sheet, at parity for every listed firm. Rival financials are
                 disclosures — public just like real 10-Ks. */}
              {expanded && (
                <div className="mt-2 rounded border border-gray-800 bg-gray-950/60 p-2">
                  <div className="mb-1.5 flex gap-1">
                    <button onClick={() => setStatementView('income')} className={`flex-1 rounded px-1 py-0.5 text-[9px] font-bold ${statementView === 'income' ? 'bg-cyan-700 text-white' : 'bg-gray-800 text-gray-400'}`}>Income statement</button>
                    <button onClick={() => setStatementView('balance')} className={`flex-1 rounded px-1 py-0.5 text-[9px] font-bold ${statementView === 'balance' ? 'bg-cyan-700 text-white' : 'bg-gray-800 text-gray-400'}`}>Balance sheet</button>
                  </div>
                  {statementView === 'income' ? (
                    <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px]">
                      <span className="text-gray-500">Revenue</span>
                      <span className="text-right font-mono text-blue-400">{formatMoney(annualRevenue)}</span>
                      <span className="text-gray-500">Operating expenses</span>
                      <span className="text-right font-mono text-orange-400">({formatMoney(annualExpenses)})</span>
                      <span className="text-gray-500">Interest on debt</span>
                      <span className="text-right font-mono text-red-400">({formatMoney(c.debt * (c.interestRate / 100))})</span>
                      <span className="border-t border-gray-800 pt-0.5 text-gray-400">Net income (annualised)</span>
                      <span className={`border-t border-gray-800 pt-0.5 text-right font-mono font-bold ${annualProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatMoney(annualProfit)}</span>
                      <span className="text-gray-500">Operating margin</span>
                      <span className={`text-right font-mono ${annualProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{annualRevenue > 0 ? `${(annualProfit / annualRevenue * 100).toFixed(1)}%` : '—'}</span>
                      <span className="text-gray-500">Return on equity</span>
                      <span className={`text-right font-mono ${annualProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{equity > 0 ? `${(annualProfit / equity * 100).toFixed(1)}%` : '—'}</span>
                      <span className="text-gray-500">Dividend payout ratio</span>
                      <span className="text-right font-mono text-violet-400">{c.dividendPayout.toFixed(0)}%</span>
                      <span className="text-gray-500">Dividends paid (annual)</span>
                      <span className="text-right font-mono text-violet-400">{formatMoney(c.dividendsPaid)}</span>
                      <span className="text-gray-500">Operating cash flow</span>
                      <span className={`text-right font-mono ${c.operatingCashFlow >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatMoney(c.operatingCashFlow)}</span>
                      <span className="text-gray-500">Free cash flow</span>
                      <span className={`text-right font-mono ${c.operatingCashFlow >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatMoney(c.operatingCashFlow - c.dividendsPaid)}</span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px]">
                      <span className="text-[9px] font-bold uppercase text-gray-500 col-span-2">Assets</span>
                      <span className="text-gray-500 pl-2">Cash & equivalents</span>
                      <span className="text-right font-mono text-emerald-400">{formatMoney(c.cash)}</span>
                      <span className="text-gray-500 pl-2">Property, plant & equipment</span>
                      <span className="text-right font-mono text-gray-300">{formatMoney(Math.max(0, c.totalAssets - c.cash - c.intangibleTechnology))}</span>
                      <span className="text-gray-500 pl-2">Intangibles (technology)</span>
                      <span className="text-right font-mono text-violet-400">{formatMoney(c.intangibleTechnology)}</span>
                      <span className="border-t border-gray-800 pt-0.5 font-bold text-gray-300">Total assets</span>
                      <span className="border-t border-gray-800 pt-0.5 text-right font-mono font-bold text-cyan-400">{formatMoney(c.totalAssets)}</span>
                      <span className="mt-1 text-[9px] font-bold uppercase text-gray-500 col-span-2">Liabilities & equity</span>
                      <span className="text-gray-500 pl-2">Long-term debt</span>
                      <span className="text-right font-mono text-red-400">{formatMoney(c.debt)}</span>
                      <span className="text-gray-500 pl-2">Shareholders' equity</span>
                      <span className={`text-right font-mono ${equity >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatMoney(equity)}</span>
                      <span className="border-t border-gray-800 pt-0.5 font-bold text-gray-300">Total L+E</span>
                      <span className="border-t border-gray-800 pt-0.5 text-right font-mono font-bold text-cyan-400">{formatMoney(c.debt + equity)}</span>
                      <span className="text-gray-500">Debt / equity</span>
                      <span className={`text-right font-mono ${c.debt / Math.max(1, equity) > 1 ? 'text-red-400' : 'text-emerald-400'}`}>{equity > 0 ? (c.debt / equity).toFixed(2) : '—'}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============= SUPPLY CHAIN =============

function SupplyChainPanel({ gameState, onOptimizeAllSupply, onFocusBuilding }: SidePanelProps) {
  const player = gameState.companies.find(c => c.isPlayer)!;
  const myBuildings = gameState.buildings.filter(b => b.companyId === player.id);
  const groups: { label: string; icon: string; types: string[]; color: string }[] = [
    { label: 'Farms & Mines', icon: '🌾', types: ['farm', 'mine'], color: 'border-green-600' },
    { label: 'Factories', icon: '🏭', types: ['factory'], color: 'border-gray-500' },
    { label: 'Warehouses', icon: '📦', types: ['warehouse'], color: 'border-yellow-600' },
    { label: 'Retail Stores', icon: '🏪', types: ['retail_store'], color: 'border-blue-600' },
    { label: 'Real Estate', icon: '🏠', types: ['apartment', 'commercial'], color: 'border-purple-600' },
    { label: 'Media & R&D', icon: '📺', types: ['media_tv', 'media_radio', 'media_newspaper', 'media_tower', 'rd_center', 'hq'], color: 'border-pink-600' },
  ];

  const totalMonthlyRevenue = myBuildings.reduce((s, b) => s + b.revenue, 0) * 24 * 30;
  const totalMonthlyProfit = myBuildings.reduce((s, b) => s + b.profit, 0) * 24 * 30;
  const worstPerformer = myBuildings.slice().sort((a, b) => a.profit - b.profit)[0];

  return (
    <div className="space-y-3">
      <Section title={`🏗️ Your ${myBuildings.length} Buildings`}>
        <div className="grid grid-cols-2 gap-1 text-[10px]">
          <div><span className="text-gray-500">Revenue / mo</span></div>
          <div className="text-right font-mono font-bold text-emerald-400">{formatMoney(totalMonthlyRevenue)}</div>
          <div><span className="text-gray-500">Profit / mo</span></div>
          <div className={`text-right font-mono font-bold ${totalMonthlyProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatMoney(totalMonthlyProfit)}</div>
        </div>
        {worstPerformer && worstPerformer.profit < 0 && (
          <button
            onClick={() => onFocusBuilding(worstPerformer.id)}
            className="mt-2 w-full rounded border border-red-800 bg-red-950/30 px-2 py-1 text-left text-[9px] text-red-200 hover:bg-red-950/60"
          >
            ⚠ Worst performer: {worstPerformer.name} losing {formatMoney(Math.abs(worstPerformer.profit) * 24 * 30)}/mo — jump to site.
          </button>
        )}
        <button onClick={onOptimizeAllSupply} className="mt-1.5 w-full rounded bg-cyan-700 py-1.5 text-[10px] font-bold hover:bg-cyan-600">Batch optimize every supplier link</button>
      </Section>
      {groups.map(g => {
        const items = myBuildings.filter(b => g.types.includes(b.type));
        return (
          <div key={g.label}>
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="text-base">{g.icon}</span>
              <span className="text-[11px] font-bold text-gray-300">{g.label} ({items.length})</span>
            </div>
            {items.length === 0 ? (
              <div className="text-[10px] text-gray-600 ml-5 italic">None yet</div>
            ) : (
              <div className="space-y-1 ml-5">
                {items.map(b => {
                  const city = gameState.cities.find(c => c.id === b.cityId);
                  return (
                    <button
                      key={b.id}
                      onClick={() => onFocusBuilding(b.id)}
                      className={`w-full rounded border-l-2 bg-gray-900 p-2 text-left transition-colors hover:bg-gray-800 ${g.color}`}
                      title={`Focus map on ${b.name}`}
                    >
                      <div className="flex justify-between text-[10px]">
                        <span className="truncate text-gray-300">{b.name} • {city?.name}</span>
                        <span className={`font-mono font-bold ${b.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatMoney(b.profit)}</span>
                      </div>
                      <div className="mt-0.5 flex justify-between text-[9px] text-gray-500">
                        <span>Util {b.utilization.toFixed(0)}%</span>
                        <span>Lv {b.trainingLevel}</span>
                        <span className="text-cyan-400">Focus →</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      {myBuildings.length === 0 && (
        <div className="text-center py-6 text-gray-500 text-xs">
          <div className="text-3xl mb-2">🏗️</div>
          <p>No buildings yet!</p>
          <p className="text-[10px] mt-1">Use the Build menu to start your empire</p>
        </div>
      )}
    </div>
  );
}

// ============= PRODUCTS =============

function ProductsPanel({ gameState, onAdvertiseProduct, onAcquireTechnology }: SidePanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const categories = Array.from(new Set(gameState.products.map(p => p.category)));
  return (
    <div className="space-y-2">
      {categories.map(cat => {
        const prods = gameState.products.filter(p => p.category === cat);
        return (
          <div key={cat} className="bg-gray-900 rounded-lg p-2.5 border border-gray-800">
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="text-lg">{prods[0].icon}</span>
              <span className="text-[11px] font-bold text-white">{cat}</span>
              <span className="text-[9px] text-gray-500">({prods.length})</span>
              <span className="ml-auto text-[9px] text-yellow-400">Necessity {prods[0].demandIndex}</span>
            </div>
            <div className="space-y-0.5">
              {prods.map(p => (
                <button key={p.id} onClick={() => setSelectedId(selectedId === p.id ? null : p.id)} className="flex w-full justify-between py-0.5 text-left text-[10px]">
                  <span className="text-gray-400 truncate flex-1">{p.name}{p.obsolete ? ' | OBSOLETE' : ''}</span>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <span className="text-emerald-400 font-mono">{formatMoney(p.currentPrice)}</span>
                    <span className="text-yellow-400 font-mono">Q{p.quality.toFixed(0)}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        );
      })}
      {selectedId && (() => {
        const product = gameState.products.find(item => item.id === selectedId);
        if (!product) return null;
        const overlap = gameState.products.filter(item => item.inputs.some(input => product.inputs.some(source => source.productId === input.productId) || input.productId === product.id));
        return (
          <div className="sticky bottom-0 rounded-xl border border-emerald-700 bg-gray-950 p-3 shadow-2xl">
            <div className="flex items-start justify-between"><div><div className="text-xs font-bold text-white">{product.name}</div><div className="text-[9px] uppercase tracking-wider text-emerald-400">{product.kind} | {product.category}</div></div><button onClick={() => setSelectedId(null)} className="text-xs text-gray-500">x</button></div>
            <div className="mt-2 grid grid-cols-2 gap-1 text-[10px]">
              <span className="text-gray-500">Tech</span><span className="text-right text-cyan-400">{product.techLevel.toFixed(1)}</span>
              <span className="text-gray-500">Market demand</span><span className="text-right text-emerald-400">{product.marketDemand.toFixed(0)}</span>
              <span className="text-gray-500">Player share</span><span className="text-right text-amber-400">{product.playerMarketShare.toFixed(1)}%</span>
              <span className="text-gray-500">Demand shifted</span><span className="text-right text-red-400">{product.demandShift.toFixed(1)}%</span>
            </div>
            <div className="mt-2 text-[9px] font-bold uppercase tracking-wider text-gray-500">Recipe</div>
            {product.inputs.length === 0 ? <div className="text-[10px] text-gray-500">No manufactured inputs</div> : product.inputs.map(input => <div key={input.productId} className="flex justify-between text-[10px]"><span className="text-gray-300">{input.productName}</span><span className="font-mono text-gray-500">x{input.quantity}</span></div>)}
            {overlap.length > 0 && <div className="mt-2 text-[9px] leading-relaxed text-gray-500">Supply overlap: {overlap.slice(0, 5).map(item => item.name).join(', ')}{overlap.length > 5 ? ` and ${overlap.length - 5} more` : ''}.</div>}
            {(() => {
              const brandable = product.kind === 'consumer' || product.kind === 'digital';
              const researchable = brandable || product.kind === 'semi';
              if (!brandable && !researchable) {
                return (
                  <div className="mt-2 rounded border border-gray-800 bg-gray-900/60 px-2 py-1.5 text-[9px] leading-relaxed text-gray-500">
                    {product.kind === 'raw' ? 'Extracted commodity' : 'Unprocessed farm output'} — sold on grade and spot price.
                    Brands and process licences do not apply. Improve yield through better deposits, land quality and training.
                  </div>
                );
              }
              return (
                <div className="mt-2 flex gap-1">
                  {brandable && (
                    <button onClick={() => onAdvertiseProduct(product.id, 1000000)} className="flex-1 rounded bg-pink-700 py-1.5 text-[9px] font-bold hover:bg-pink-600">
                      Advertise $1M
                    </button>
                  )}
                  {researchable && (
                    <button onClick={() => onAcquireTechnology(product.id)} className="flex-1 rounded bg-violet-700 py-1.5 text-[9px] font-bold hover:bg-violet-600">
                      Licence technology
                    </button>
                  )}
                </div>
              );
            })()}
          </div>
        );
      })()}
    </div>
  );
}

// ============= CITIES =============

function CityPanel({ gameState, onFocusCity }: SidePanelProps) {
  const maxWage = Math.max(...gameState.cities.map(city => city.wageRate), 1);
  return (
    <div className="space-y-2">
      <Section title="Economic Graphs | Wage Rate">
        {[...gameState.cities].sort((a, b) => b.wageRate - a.wageRate).map(city => (
          <button key={city.id} onClick={() => onFocusCity(city.id)} className="flex w-full items-center gap-2 text-[10px]">
            <span className="w-20 truncate text-left text-gray-400">{city.name}</span>
            <span className="h-1.5 flex-1 overflow-hidden rounded bg-gray-800"><span className="block h-full bg-gradient-to-r from-emerald-500 to-red-500" style={{ width: `${city.wageRate / maxWage * 100}%` }} /></span>
            <span className="w-8 text-right font-mono text-gray-200">${city.wageRate.toFixed(0)}</span>
          </button>
        ))}
      </Section>
      {gameState.cities.map(city => {
        const cityBuildings = gameState.buildings.filter(b => b.cityId === city.id);
        const myBuildings = cityBuildings.filter(b => b.companyId === gameState.companies.find(c => c.isPlayer)?.id);
        return (
          <div key={city.id} className="bg-gray-900 rounded-lg p-2.5 border border-gray-800 border-l-4" style={{ borderLeftColor: city.color }}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <span className="text-base">🏙️</span>
                <span className="text-xs font-bold text-white">{city.name}</span>
                <span className={`text-[8px] uppercase px-1.5 py-0.5 rounded ${
                  city.tier === 'metropolis' ? 'bg-purple-600' :
                  city.tier === 'large' ? 'bg-blue-600' :
                  city.tier === 'medium' ? 'bg-green-600' : 'bg-gray-600'
                }`}>{city.tier}</span>
              </div>
              {city.hasSeaport && <span className="text-[10px] bg-blue-600/30 text-blue-300 px-1.5 py-0.5 rounded">⚓</span>}
            </div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px]">
              <div><span className="text-gray-500">Pop:</span> <span className="text-gray-300">{city.population >= 1e6 ? `${(city.population / 1e6).toFixed(2)}M` : `${(city.population / 1e3).toFixed(0)}k`}</span></div>
              <div><span className="text-gray-500">Wage:</span> <span className="text-gray-300">${city.wageRate.toFixed(0)}</span></div>
              <div><span className="text-gray-500">Unemp:</span> <span className={city.unemploymentRate > 8 ? 'text-red-400' : 'text-green-400'}>{city.unemploymentRate.toFixed(1)}%</span></div>
              <div><span className="text-gray-500">Growth:</span> <span className={city.growthRate >= 0 ? 'text-green-400' : 'text-red-400'}>{city.growthRate >= 0 ? '+' : ''}{city.growthRate.toFixed(2)}%</span></div>
              <div><span className="text-gray-500">Land:</span> <span className="text-yellow-400">{city.landCostMultiplier.toFixed(1)}x</span></div>
              <div><span className="text-gray-500">Bldgs:</span> <span className="text-cyan-400">{myBuildings.length}/{cityBuildings.length}</span></div>
              <div><span className="text-gray-500">Housing:</span> <span className={city.housingDemand >= 0 ? 'text-emerald-400' : 'text-red-400'}>{city.housingDemand.toFixed(0)}%</span></div>
              <div><span className="text-gray-500">Office:</span> <span className={city.officeDemand >= 0 ? 'text-emerald-400' : 'text-red-400'}>{city.officeDemand.toFixed(0)}%</span></div>
            </div>

            {/* Vital statistics — the three flows that actually move population.
                Rates are per 1,000 residents per year, as demographers report them. */}
            <div className="mt-1.5 rounded border border-gray-800 bg-gray-950/60 p-1.5">
              <div className="mb-0.5 flex items-center justify-between">
                <span className="text-[9px] font-bold uppercase tracking-wider text-gray-500">Vital statistics</span>
                <span className="text-[9px] text-gray-500">median age {city.medianAge.toFixed(0)}</span>
              </div>
              <div className="grid grid-cols-3 gap-x-1 text-[9px]">
                <div className="text-center">
                  <div className="text-gray-500">Births</div>
                  <div className="font-mono text-emerald-400">{city.birthRate.toFixed(1)}</div>
                  <div className="text-[8px] text-gray-600">{Math.round(city.birthsThisYear).toLocaleString()} yr</div>
                </div>
                <div className="text-center">
                  <div className="text-gray-500">Deaths</div>
                  <div className="font-mono text-red-400">{city.deathRate.toFixed(1)}</div>
                  <div className="text-[8px] text-gray-600">{Math.round(city.deathsThisYear).toLocaleString()} yr</div>
                </div>
                <div className="text-center">
                  <div className="text-gray-500">Migration</div>
                  <div className={`font-mono ${city.netMigrationRate >= 0 ? 'text-cyan-400' : 'text-amber-400'}`}>
                    {city.netMigrationRate >= 0 ? '+' : ''}{city.netMigrationRate.toFixed(1)}
                  </div>
                  <div className="text-[8px] text-gray-600">{Math.round(city.migrationThisYear).toLocaleString()} yr</div>
                </div>
              </div>
              <div className="mt-1 flex justify-between border-t border-gray-800 pt-1 text-[9px]">
                <span className="text-gray-500">Natural increase</span>
                <span className={`font-mono ${city.naturalIncrease >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {city.naturalIncrease >= 0 ? '+' : ''}{city.naturalIncrease.toFixed(1)} / 1,000
                </span>
              </div>
              {city.suppressedMigration > 0.5 && (
                <div className="mt-1 rounded border border-amber-800 bg-amber-950/30 px-1.5 py-1 text-[9px] leading-relaxed text-amber-300">
                  Housing shortage is turning away {city.suppressedMigration.toFixed(1)} per 1,000 would-be residents.
                  Build apartments here to capture that demand — and the rents it supports.
                </div>
              )}
            </div>
            <button onClick={() => onFocusCity(city.id)} className="mt-2 w-full rounded border border-gray-700 py-1 text-[9px] font-bold uppercase tracking-wider text-gray-400 hover:border-cyan-600 hover:text-cyan-300">Focus city</button>
          </div>
        );
      })}
    </div>
  );
}

// ============= COMPANIES =============

function CompanyPanel({ gameState }: SidePanelProps) {
  return (
    <div className="space-y-2">
      {gameState.companies.map(c => (
        <div key={c.id} className="bg-gray-900 rounded-lg p-2.5 border border-gray-800 border-l-4" style={{ borderLeftColor: c.color }}>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: c.color }} />
              <span className="text-xs font-bold text-white truncate">{c.name}</span>
            </div>
            {c.isPlayer && <span className="text-[8px] bg-emerald-600 px-1.5 py-0.5 rounded font-bold">YOU</span>}
            {!c.isPlayer && (
              <div className="flex shrink-0 items-center gap-1">
                <span
                  className={`text-[8px] px-1.5 py-0.5 rounded font-bold uppercase ${
                    c.skill === 'ruthless' ? 'bg-rose-700' :
                    c.skill === 'shrewd' ? 'bg-amber-600' :
                    c.skill === 'competent' ? 'bg-slate-600' : 'bg-slate-800 text-slate-400'
                  }`}
                  title={
                    c.skill === 'ruthless' ? 'Ruthless: reads the market accurately, reprices monthly, cuts losses fast and retaliates hard.'
                    : c.skill === 'shrewd' ? 'Shrewd: good forecasts and disciplined pricing.'
                    : c.skill === 'competent' ? 'Competent: reasonable judgement, slower to react.'
                    : 'Novice: noisy market research, infrequent price reviews, clings to losing sites.'
                  }
                >{c.skill}</span>
                <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold uppercase ${
                  c.aiStrategy === 'aggressive' ? 'bg-red-600' :
                  c.aiStrategy === 'conservative' ? 'bg-blue-600' : 'bg-gray-600'
                }`} title={`${c.aiStrategy} expansion strategy`}>{c.aiStrategy[0]}</span>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px]">
            <div><span className="text-gray-500">Cash:</span> <span className="text-green-400 font-mono">{formatMoney(c.cash)}</span></div>
            <div><span className="text-gray-500">Rev:</span> <span className="text-blue-400 font-mono">{formatMoney(c.revenue * 24 * 30)}</span></div>
            <div><span className="text-gray-500">Stock:</span> <span className="text-yellow-400 font-mono">${c.sharePrice.toFixed(2)}</span></div>
            <div><span className="text-gray-500">MCap:</span> <span className="text-purple-400 font-mono">{formatMoney(c.marketCap)}</span></div>
            <div><span className="text-gray-500">Bldgs:</span> <span className="text-cyan-400">{c.buildings.length}</span></div>
            <div><span className="text-gray-500">Debt:</span> <span className="text-red-400 font-mono">{formatMoney(c.debt)}</span></div>
            <div><span className="text-gray-500">Brand:</span> <span className="text-pink-400">{c.brandValue.toFixed(0)}</span></div>
            <div><span className="text-gray-500">Rating:</span> <span className="text-orange-400 font-bold">{c.bondRating}</span></div>
          </div>
          {/* Treasury: own stock held back, stakes in rivals, and hard assets. */}
          {(() => {
            const assetValue = Object.entries(c.assetHoldings).reduce((sum, [id, units]) => {
              const asset = gameState.tradedAssets.find(a => a.id === id);
              return sum + (asset ? asset.price * units : 0);
            }, 0);
            const stakes = Object.entries(c.equityHoldings).filter(([, n]) => n > 0);
            if (c.treasuryShares === 0 && assetValue < 1000 && stakes.length === 0) return null;
            return (
              <div className="mt-1.5 border-t border-gray-800 pt-1 text-[9px]">
                <span className="font-bold uppercase tracking-wider text-gray-500">Treasury</span>
                <div className="mt-0.5 grid grid-cols-2 gap-x-2">
                  {c.treasuryShares > 0 && (
                    <>
                      <span className="text-gray-500">Own shares held</span>
                      <span className="text-right font-mono text-violet-400">{c.treasuryShares.toLocaleString()}</span>
                    </>
                  )}
                  {assetValue >= 1000 && (
                    <>
                      <span className="text-gray-500">Hard assets</span>
                      <span className="text-right font-mono text-amber-400">{formatMoney(assetValue)}</span>
                    </>
                  )}
                  {stakes.length > 0 && (
                    <>
                      <span className="text-gray-500">Equity stakes</span>
                      <span className="text-right font-mono text-cyan-400">{stakes.length} firm{stakes.length > 1 ? 's' : ''}</span>
                    </>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      ))}
    </div>
  );
}

// ============= COMMODITIES, METALS & CRYPTO =============

function AssetsPanel({ gameState, onBuyAsset, onSellAsset }: SidePanelProps) {
  const [units, setUnits] = useState<Record<string, number>>({});
  const eco = gameState.economy;
  const groups: Array<{ label: string; cls: string; note: string }> = [
    { label: 'Commodities', cls: 'commodity', note: 'Industrial inputs. Prices feed straight into your freight and production costs.' },
    { label: 'Precious Metals', cls: 'metal', note: 'Classic inflation hedge — rallies when real interest rates turn negative.' },
    { label: 'Crypto', cls: 'crypto', note: 'Extreme volatility. Tracks liquidity conditions and risk appetite.' },
    { label: 'Index Funds', cls: 'etf', note: 'Diversified exposure with far lower single-name risk.' },
  ];

  const portfolioValue = gameState.tradedAssets.reduce((s, a) => s + a.price * a.playerHolding, 0);
  const portfolioCost = gameState.tradedAssets.reduce((s, a) => s + a.playerCostBasis * a.playerHolding, 0);
  const unrealised = portfolioValue - portfolioCost;

  return (
    <div className="space-y-3">
      <Section title="Portfolio">
        <DataRow label="Market value" value={formatMoney(portfolioValue)} color="text-cyan-400" />
        <DataRow label="Cost basis" value={formatMoney(portfolioCost)} color="text-gray-400" />
        <DataRow
          label="Unrealised P&L"
          value={`${unrealised >= 0 ? '+' : ''}${formatMoney(unrealised)}`}
          color={unrealised >= 0 ? 'text-emerald-400' : 'text-red-400'}
        />
        <div className="mt-1 text-[9px] leading-relaxed text-gray-500">
          Capital gains are taxed on realisation: {eco.shortTermCapitalGainsRate}% under a year,
          {' '}{eco.longTermCapitalGainsRate}% after. Losses carry forward to shelter future gains.
        </div>
      </Section>

      {groups.map(group => {
        const items = gameState.tradedAssets.filter(a => a.assetClass === group.cls);
        if (items.length === 0) return null;
        return (
          <Section key={group.cls} title={group.label}>
            <div className="mb-1.5 text-[9px] leading-relaxed text-gray-500">{group.note}</div>
            {items.map(asset => {
              const prior = asset.history[asset.history.length - 2] ?? asset.price;
              const change = ((asset.price - prior) / Math.max(0.01, prior)) * 100;
              const holdingValue = asset.price * asset.playerHolding;
              const qty = units[asset.id] ?? 0;
              return (
                <div key={asset.id} className="border-b border-gray-800 py-1.5 last:border-0">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold text-gray-200">{asset.symbol}</span>
                      <span className="ml-1 text-[9px] text-gray-500">{asset.name}</span>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-[10px] text-white">
                        ${asset.price < 10 ? asset.price.toFixed(2) : asset.price.toFixed(0)}
                        <span className="text-[8px] text-gray-500">/{asset.unit}</span>
                      </div>
                      <div className={`text-[8px] font-mono ${change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                      </div>
                    </div>
                  </div>
                  {asset.playerHolding > 0 && (
                    <div className="mt-0.5 flex justify-between text-[9px]">
                      <span className="text-gray-500">Holding {asset.playerHolding.toFixed(asset.price > 1000 ? 3 : 1)} {asset.unit}</span>
                      <span className={holdingValue >= asset.playerCostBasis * asset.playerHolding ? 'text-emerald-400' : 'text-red-400'}>
                        {formatMoney(holdingValue)}
                      </span>
                    </div>
                  )}
                  <div className="mt-1 flex items-center gap-1">
                    <input
                      type="number"
                      value={qty || ''}
                      placeholder="units"
                      onChange={e => setUnits(u => ({ ...u, [asset.id]: Math.max(0, Number(e.target.value)) }))}
                      className="w-16 rounded border border-gray-700 bg-gray-800 px-1 py-0.5 text-[9px] text-white"
                    />
                    <button
                      onClick={() => qty > 0 && onBuyAsset(asset.id, qty)}
                      className="flex-1 rounded border border-green-700 bg-green-700/25 py-0.5 text-[9px] font-bold hover:bg-green-700"
                    >Buy</button>
                    <button
                      onClick={() => qty > 0 && onSellAsset(asset.id, qty)}
                      disabled={asset.playerHolding <= 0}
                      className="flex-1 rounded border border-red-700 bg-red-700/25 py-0.5 text-[9px] font-bold hover:bg-red-700 disabled:opacity-30"
                    >Sell</button>
                  </div>
                </div>
              );
            })}
          </Section>
        );
      })}
    </div>
  );
}

// ============= POLICY, TRADE & LABOUR =============

function PolicyPanel({ gameState, onHedge }: SidePanelProps) {
  const gov = gameState.government;
  const eco = gameState.economy;
  return (
    <div className="space-y-3">
      <Section title="Fiscal & Regulatory">
        <DataRow label="Corporate tax" value={`${gov.corporateTaxRate.toFixed(1)}%`} color="text-red-400" />
        <DataRow label="Carbon levy" value={gov.carbonTaxPerUnit > 0 ? `$${gov.carbonTaxPerUnit.toFixed(0)}/t` : 'Not enacted'} color={gov.carbonTaxPerUnit > 0 ? 'text-amber-400' : 'text-gray-500'} />
        <DataRow label="Minimum wage" value={`$${gov.minimumWage.toFixed(2)}/hr`} color="text-cyan-400" />
        <DataRow label="Antitrust trigger" value={`${gov.antitrustThreshold}% share`} color="text-orange-400" />
        {gov.antitrustWarnings > 0 && (
          <div className="mt-1 rounded border border-red-800 bg-red-950/30 px-2 py-1 text-[9px] text-red-300">
            {gov.antitrustWarnings} active competition warning{gov.antitrustWarnings > 1 ? 's' : ''}. Further dominance risks fines then forced divestiture.
          </div>
        )}
        {gov.subsidisedCategories.length > 0 && (
          <div className="mt-1 rounded border border-emerald-800 bg-emerald-950/30 px-2 py-1 text-[9px] text-emerald-300">
            Subsidies active: {gov.subsidisedCategories.join(', ')}
          </div>
        )}
      </Section>

      <Section title="Energy & Commodities">
        <DataRow label="Diesel" value={`$${eco.dieselPrice.toFixed(2)}/gal`} color={eco.dieselPrice > 4.5 ? 'text-red-400' : 'text-emerald-400'} />
        {eco.fuelShockMonths > 0 && (
          <div className="rounded border border-red-800 bg-red-950/30 px-2 py-1 text-[9px] text-red-300">
            Energy shock — {eco.fuelShockMonths} month{eco.fuelShockMonths > 1 ? 's' : ''} remaining.
          </div>
        )}
        <div className="mt-1.5 flex gap-1">
          {[6, 12, 24].map(months => (
            <button key={months} onClick={() => onHedge(months)}
              className="flex-1 rounded bg-violet-700 py-1.5 text-[9px] font-bold hover:bg-violet-600">
              Hedge {months}mo
            </button>
          ))}
        </div>
        <div className="text-[9px] leading-relaxed text-gray-500">
          Hedging locks input costs against volatility for a ~3.5% premium on exposure.
        </div>
      </Section>

      <Section title="International Trade">
        {gameState.tradePartners.map(partner => (
          <div key={partner.id} className="border-b border-gray-800 py-1.5 last:border-0">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-gray-200">{partner.name}</span>
              <span className={`text-[9px] ${partner.relationship > 20 ? 'text-emerald-400' : partner.relationship < -20 ? 'text-red-400' : 'text-amber-400'}`}>
                {partner.relationship > 20 ? 'Friendly' : partner.relationship < -20 ? 'Hostile' : 'Neutral'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-2 text-[9px] text-gray-500">
              <span>FX {partner.exchangeRate.toFixed(2)}</span>
              <span className="text-right">Tariff {(partner.tariffRate * 100).toFixed(0)}%</span>
              <span>Wages {(partner.wageIndex * 100).toFixed(0)}%</span>
              <span className="text-right">Their duty {(partner.retaliatoryTariff * 100).toFixed(0)}%</span>
            </div>
          </div>
        ))}
      </Section>

      <Section title="Labour Relations">
        {gameState.unions.map(union => {
          const city = gameState.cities.find(c => c.id === union.cityId);
          return (
            <div key={union.id} className="flex items-center justify-between border-b border-gray-800 py-1 last:border-0">
              <span className="text-[10px] text-gray-300">{city?.name}</span>
              <div className="flex items-center gap-2 text-[9px]">
                <span className="text-gray-500">{union.density.toFixed(0)}% organised</span>
                {union.strikeTicks > 0
                  ? <span className="rounded bg-red-700 px-1 font-bold text-white">ON STRIKE</span>
                  : <span className={union.militancy > 65 ? 'text-amber-400' : 'text-gray-500'}>
                      militancy {union.militancy.toFixed(0)}
                    </span>}
              </div>
            </div>
          );
        })}
      </Section>

      {gameState.cartels.length > 0 && (
        <Section title="Market Intelligence">
          <div className="text-[9px] leading-relaxed text-amber-300">
            {gameState.cartels.length} suspected price-fixing arrangement{gameState.cartels.length > 1 ? 's' : ''} detected in the market.
            Prices in affected categories are being held above competitive levels.
          </div>
        </Section>
      )}

      {gameState.patents.length > 0 && (
        <Section title="Patent Portfolio">
          {gameState.patents
            .filter(p => p.ownerId === gameState.companies.find(c => c.isPlayer)?.id)
            .map(patent => {
              const product = gameState.products.find(pr => pr.id === patent.productId);
              return (
                <DataRow key={patent.id} label={product?.name ?? 'Unknown'}
                  value={`expires ${patent.expiresYear}`} color="text-violet-400" />
              );
            })}
        </Section>
      )}
    </div>
  );
}

// ============= INBOUND ACQUISITION OFFERS =============

function OffersPanel({ gameState, onAcceptOffer, onRejectOffer }: SidePanelProps) {
  const offers = gameState.incomingOffers;
  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-2.5 text-[10px] leading-relaxed text-gray-400">
        Rival boards periodically bid for your assets. Bids sit between 88% and 108% of independent
        fair value — nobody overpays. Weigh the cash against the earnings you give up.
      </div>
      {offers.length === 0 && (
        <div className="py-8 text-center text-xs text-gray-500">
          <div className="mb-2 text-3xl">📭</div>
          <p>No inbound offers.</p>
          <p className="mt-1 text-[10px]">Profitable, well-located assets attract buyers.</p>
        </div>
      )}
      {offers.map(offer => {
        const premium = (offer.amount / Math.max(1, offer.fairValue) - 1) * 100;
        const building = gameState.buildings.find(b => b.id === offer.buildingId);
        const monthlyProfit = building ? building.profit * 24 * 30 : 0;
        const paybackYears = monthlyProfit > 0 ? offer.amount / (monthlyProfit * 12) : Infinity;
        return (
          <div key={offer.id} className="rounded-lg border border-amber-800 bg-amber-950/20 p-2.5">
            <div className="mb-1 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-[11px] font-bold text-white">{offer.buildingName}</div>
                <div className="text-[9px] text-gray-400">Bidder: {offer.buyerName}</div>
              </div>
              <span className="shrink-0 rounded bg-amber-700 px-1.5 py-0.5 text-[9px] font-bold text-white">
                {formatMoney(offer.amount)}
              </span>
            </div>
            <p className="mb-1.5 text-[9px] italic leading-relaxed text-gray-400">{offer.rationale}</p>
            <div className="mb-2 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[9px]">
              <span className="text-gray-500">Fair value</span>
              <span className="text-right font-mono text-cyan-400">{formatMoney(offer.fairValue)}</span>
              <span className="text-gray-500">Premium</span>
              <span className={`text-right font-mono ${premium >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {premium >= 0 ? '+' : ''}{premium.toFixed(1)}%
              </span>
              <span className="text-gray-500">Monthly profit</span>
              <span className={`text-right font-mono ${monthlyProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {formatMoney(monthlyProfit)}
              </span>
              <span className="text-gray-500">Payback</span>
              <span className="text-right font-mono text-gray-300">
                {Number.isFinite(paybackYears) ? `${paybackYears.toFixed(1)} yrs` : 'n/a'}
              </span>
            </div>
            <div className="flex gap-1.5">
              <button onClick={() => onAcceptOffer(offer.id)} className="flex-1 rounded bg-emerald-600 py-1.5 text-[10px] font-bold hover:bg-emerald-500">
                Accept
              </button>
              <button onClick={() => onRejectOffer(offer.id)} className="flex-1 rounded border border-gray-700 py-1.5 text-[10px] font-bold text-gray-300 hover:border-red-600 hover:text-red-300">
                Decline
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============= RESEARCH =============

function ResearchPanel({ gameState, onStartResearch }: SidePanelProps) {
  const company = gameState.companies.find(item => item.isPlayer)!;
  const centers = gameState.buildings.filter(building => building.companyId === company.id && (building.type === 'rd_center' || building.type === 'software_company'));
  const [centerId, setCenterId] = useState(centers[0]?.id || '');
  const researchable = gameState.products.filter(product => (product.kind === 'consumer' || product.kind === 'digital') && product.unlockYear <= gameState.year);
  const [productId, setProductId] = useState(researchable[0]?.id || '');

  return (
    <div className="space-y-3">
      <Section title="Technology Portfolio">
        <DataRow label="Intangible asset" value={formatMoney(company.intangibleTechnology)} color="text-violet-400" />
        <DataRow label="Knowledge points" value={gameState.player.knowledgePoints.toFixed(1)} color="text-cyan-400" />
        <DataRow label="Active projects" value={gameState.researchProjects.filter(project => project.active).length.toString()} color="text-emerald-400" />
        <div className="text-[9px] leading-relaxed text-gray-500">Technology loses 10% each year when disruption is enabled. A lead must be maintained, not merely achieved once.</div>
      </Section>

      <Section title="Start Project">
        {centers.length === 0 ? (
          <div className="text-[10px] leading-relaxed text-amber-400">Build an R&D center or software studio before starting a project.</div>
        ) : (
          <>
            <select value={centerId} onChange={event => setCenterId(event.target.value)} className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-[10px] text-white">
              {centers.map(center => <option key={center.id} value={center.id}>{center.name} | level {center.trainingLevel}</option>)}
            </select>
            <select value={productId} onChange={event => setProductId(event.target.value)} className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-[10px] text-white">
              {researchable.map(product => <option key={product.id} value={product.id}>{product.name} | tech {product.techLevel.toFixed(1)}</option>)}
            </select>
            <button onClick={() => onStartResearch(centerId, productId)} className="w-full rounded bg-violet-600 py-1.5 text-[10px] font-bold hover:bg-violet-500">Fund research cycle</button>
          </>
        )}
      </Section>

      <Section title="Project Queue">
        {gameState.researchProjects.length === 0 && <div className="text-[10px] text-gray-500">No research history yet.</div>}
        {gameState.researchProjects.map(project => {
          const product = gameState.products.find(item => item.id === project.productId);
          return (
            <div key={project.id} className="border-b border-gray-800 py-1.5 last:border-0">
              <div className="flex justify-between text-[10px]"><span className="text-gray-300">{product?.name}</span><span className={project.completed ? 'text-emerald-400' : 'text-violet-400'}>{project.completed ? 'Complete' : `Tech ${project.targetTech}`}</span></div>
              <ProgressBar label="Progress" value={project.progress} color="bg-violet-500" />
            </div>
          );
        })}
      </Section>

      <Section title="Technology Timeline">
        {gameState.products.filter(product => product.unlockYear >= gameState.year - 2 && product.unlockYear <= gameState.year + 10).sort((a, b) => a.unlockYear - b.unlockYear).slice(0, 8).map(product => (
          <DataRow key={product.id} label={product.name} value={product.unlockYear <= gameState.year ? 'Available' : `${product.unlockYear}`} color={product.unlockYear <= gameState.year ? 'text-emerald-400' : 'text-gray-400'} />
        ))}
      </Section>
    </div>
  );
}

// ============= EXECUTIVES =============

function ExecutivesPanel({ gameState, onHireExecutive, onSpendKnowledge, onIntensiveTraining }: SidePanelProps) {
  const categories = ['Manufacturing', 'Retail', 'Computers', 'Communication', 'Automobile', 'Branding'];
  return (
    <div className="space-y-3">
      <Section title="CEO Expertise">
        <DataRow label="Knowledge available" value={gameState.player.knowledgePoints.toFixed(1)} color="text-cyan-400" />
        {categories.map(category => (
          <div key={category} className="flex items-center gap-2 text-[10px]">
            <span className="w-24 truncate text-gray-500">{category}</span>
            <span className="h-1.5 flex-1 overflow-hidden rounded bg-gray-800"><span className="block h-full bg-cyan-500" style={{ width: `${gameState.player.expertise[category] || 0}%` }} /></span>
            <button onClick={() => onSpendKnowledge(category)} disabled={gameState.player.knowledgePoints < 1} className="h-5 w-5 rounded bg-cyan-700 font-bold text-white disabled:bg-gray-800 disabled:text-gray-600">+</button>
          </div>
        ))}
      </Section>

      {gameState.executives.map(executive => (
        <Section key={executive.id} title={`${executive.role} | ${executive.name}`}>
          <DataRow label="Annual salary" value={formatMoney(executive.salary)} color="text-amber-400" />
          {Object.entries(executive.expertise).map(([category, value]) => <DataRow key={category} label={category} value={value.toFixed(0)} color="text-violet-400" />)}
          <button onClick={() => onHireExecutive(executive.id)} disabled={executive.hired} className="w-full rounded bg-emerald-600 py-1.5 text-[10px] font-bold hover:bg-emerald-500 disabled:bg-gray-800 disabled:text-emerald-400">{executive.hired ? 'Appointed' : `Hire with ${formatMoney(executive.salary * 0.25)} signing cost`}</button>
        </Section>
      ))}

      <Section title="Intensive Training">
        <div className="text-[9px] leading-relaxed text-gray-500">Immediately raises every eligible firm by one level. It is fast, global and expensive.</div>
        <button onClick={onIntensiveTraining} className="w-full rounded bg-amber-600 py-1.5 text-[10px] font-bold hover:bg-amber-500">Train all firms</button>
      </Section>
    </div>
  );
}

// ============= LAND =============

function LandPanel({ gameState, onBuyLand, onSellLand }: SidePanelProps) {
  const [cityId, setCityId] = useState(gameState.cities[0]?.id || '');
  const [size, setSize] = useState(3);
  const company = gameState.companies.find(item => item.isPlayer)!;
  const holdings = gameState.landHoldings.filter(holding => holding.companyId === company.id);
  return (
    <div className="space-y-3">
      <Section title="Land Market">
        <DataRow label="Holdings" value={holdings.length.toString()} color="text-cyan-400" />
        <DataRow label="Portfolio value" value={formatMoney(holdings.reduce((sum, holding) => sum + holding.currentValue, 0))} color="text-emerald-400" />
        <DataRow label="Property bubble" value={`${gameState.economy.realEstateBubble.toFixed(0)}/100`} color={gameState.economy.realEstateBubble > 65 ? 'text-red-400' : 'text-amber-400'} />
        <DataRow label="Inflation" value={`${gameState.economy.inflation.toFixed(1)}%`} color="text-violet-400" />
      </Section>

      <Section title="Acquire Outskirts Plot">
        <select value={cityId} onChange={event => setCityId(event.target.value)} className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-[10px] text-white">
          {gameState.cities.map(city => <option key={city.id} value={city.id}>{city.name} | land {city.landCostMultiplier.toFixed(1)}x</option>)}
        </select>
        <div className="flex gap-1">{[2, 3, 4, 5].map(value => <button key={value} onClick={() => setSize(value)} className={`flex-1 rounded py-1 text-[10px] ${size === value ? 'bg-emerald-600' : 'bg-gray-800 text-gray-500'}`}>{value}x{value}</button>)}</div>
        <button onClick={() => onBuyLand(cityId, size)} className="w-full rounded bg-emerald-600 py-1.5 text-[10px] font-bold hover:bg-emerald-500">Buy strategic plot</button>
        <div className="text-[9px] leading-relaxed text-gray-500">Plots are acquired on the selected city's low-cost edge. Nearby development, wages, GDP and inflation alter the resale value.</div>
      </Section>

      <Section title="Owned Plots">
        {holdings.length === 0 && <div className="text-[10px] text-gray-500">No land held outside operating firms.</div>}
        {holdings.map(holding => {
          const city = gameState.cities.find(item => item.id === holding.cityId);
          const gain = (holding.currentValue / holding.purchasePrice - 1) * 100;
          return (
            <div key={holding.id} className="border-b border-gray-800 py-1.5 last:border-0">
              <div className="flex justify-between text-[10px]"><span className="text-gray-300">{city?.name} | {holding.size}x{holding.size}</span><span className={gain >= 0 ? 'text-emerald-400' : 'text-red-400'}>{gain >= 0 ? '+' : ''}{gain.toFixed(1)}%</span></div>
              <div className="text-[9px] text-gray-500">Paid {formatMoney(holding.purchasePrice)} | value {formatMoney(holding.currentValue)}</div>
              <button onClick={() => onSellLand(holding.id)} className="mt-1 w-full rounded border border-gray-700 py-1 text-[9px] text-gray-300 hover:border-emerald-600">Sell plot</button>
            </div>
          );
        })}
      </Section>
    </div>
  );
}

// ============= CLASSROOM =============

function ClassroomPanel({ gameState }: SidePanelProps) {
  const history = gameState.replayHistory.slice(-18);
  const maxNetWorth = Math.max(...history.map(point => point.netWorth), 1);
  return (
    <div className="space-y-3">
      <Section title="Decision Replay">
        {history.length === 0 ? <div className="text-[10px] text-gray-500">The replay begins recording after the first simulated month.</div> : (
          <div className="flex h-24 items-end gap-1 border-b border-gray-700">
            {history.map((point, index) => <div key={`${point.year}-${point.month}-${index}`} title={`${point.month}/${point.year}: ${formatMoney(point.netWorth)}`} className="flex-1 bg-gradient-to-t from-emerald-700 to-cyan-400" style={{ height: `${Math.max(4, point.netWorth / maxNetWorth * 100)}%` }} />)}
          </div>
        )}
        <div className="text-[9px] leading-relaxed text-gray-500">Use the timeline to connect changes in net worth with GDP, inflation, borrowing and expansion decisions.</div>
      </Section>
      <Section title="Learning Outcomes">
        {[
          'Compare low-cost production with high-income retail demand.',
          'Measure landed cost instead of supplier price alone.',
          'Balance leverage, dilution and default risk.',
          'Diagnose excess capacity with supply and demand.',
          'Respond to product obsolescence through R&D.',
          'Explain how amenities and jobs shape city growth.',
        ].map((outcome, index) => <div key={outcome} className="flex gap-2 text-[10px] leading-relaxed text-gray-400"><span className="font-mono text-emerald-400">{String(index + 1).padStart(2, '0')}</span><span>{outcome}</span></div>)}
      </Section>
      <Section title="Recent Consequences">
        {gameState.notifications.slice(-6).reverse().map(item => <div key={item.id} className="border-b border-gray-800 py-1 text-[9px] leading-relaxed text-gray-400 last:border-0">{item.message}</div>)}
      </Section>
    </div>
  );
}

// ============= SCOUTING =============

function ScoutingPanel({ gameState, onFocusCity }: SidePanelProps) {
  const citiesByWage = [...gameState.cities].sort((a, b) => a.wageRate - b.wageRate);
  const ports = gameState.buildings.filter(building => building.type === 'seaport');
  return (
    <div className="space-y-3">
      <Section title="Recommended Locations">
        <DataRow label="Lowest-cost factory" value={citiesByWage[0]?.name || '-'} color="text-emerald-400" />
        <DataRow label="Affluent retail" value={citiesByWage[citiesByWage.length - 1]?.name || '-'} color="text-amber-400" />
        <DataRow label="Industrial ports" value={ports.filter(port => port.portKind === 'industrial').length.toString()} color="text-cyan-400" />
        <DataRow label="Commercial ports" value={ports.filter(port => port.portKind === 'commercial').length.toString()} color="text-violet-400" />
      </Section>
      {ports.map(port => {
        const city = gameState.cities.find(item => item.id === port.cityId);
        return (
          <Section key={port.id} title={`${port.portKind === 'industrial' ? 'I' : 'C'} | ${port.name}`}>
            <button onClick={() => onFocusCity(port.cityId)} className="w-full text-left text-[10px] font-bold text-cyan-400 hover:text-cyan-300">Focus {city?.name} &gt;</button>
            <div className="text-[9px] leading-relaxed text-gray-500">{port.products.map(productId => gameState.products.find(item => item.id === productId)?.name).filter(Boolean).join(', ')}</div>
          </Section>
        );
      })}
      <Section title="Opening Rule of Thumb">
        <div className="text-[10px] leading-relaxed text-gray-400">Cluster raw materials, factories and warehouses near an industrial port. Put luxury retail in high-wage, high-traffic districts. For necessities, co-locate production and retail to minimize freight.</div>
      </Section>
    </div>
  );
}

// ============= SETTINGS =============

function SettingsPanel({ gameState, onToggleTechDisruption, onToggleInverseInflation, showTooltips, onToggleTooltips }: SidePanelProps) {
  return (
    <div className="space-y-2">
      <Section title="New Player Help">
        <button onClick={onToggleTooltips} className="flex w-full items-center justify-between rounded bg-gray-800 px-2 py-1.5 text-[10px]">
          <span className="text-gray-300">Explanatory tooltips</span>
          <span className={showTooltips ? 'text-emerald-400' : 'text-gray-500'}>{showTooltips ? 'ON' : 'OFF'}</span>
        </button>
        <p className="text-[9px] leading-relaxed text-gray-500">
          When on, panels explain metrics in plain language — e.g. what Utilization means for each building type,
          why a delivery radius is too large, or what a fuel shock does to your freight costs.
        </p>
      </Section>
      <div className="bg-gray-900 rounded-lg p-3 border border-gray-800 text-center">
        <div className="text-3xl mb-2">⚙️</div>
        <h3 className="text-sm font-bold text-white mb-1">About Capital Game</h3>
        <p className="text-[10px] text-gray-400 leading-relaxed">
          A complete business simulation for education and corporate training. Build your empire across multiple cities, manage supply chains, and dominate markets.
        </p>
      </div>
      <div className="bg-gray-900 rounded-lg p-2.5 border border-gray-800 space-y-1 text-[10px]">
        <div className="flex justify-between"><span className="text-gray-500">Engine</span><span className="text-emerald-400">Custom ECS-lite</span></div>
        <div className="flex justify-between"><span className="text-gray-500">Renderer</span><span className="text-emerald-400">Canvas 2D Isometric</span></div>
        <div className="flex justify-between"><span className="text-gray-500">Map Size</span><span className="text-cyan-400">{gameState.mapSize}×{gameState.mapSize} tiles</span></div>
        <div className="flex justify-between"><span className="text-gray-500">Biomes</span><span className="text-cyan-400">8 types</span></div>
        <div className="flex justify-between"><span className="text-gray-500">Resources</span><span className="text-cyan-400">9 types</span></div>
        <div className="flex justify-between"><span className="text-gray-500">Time</span><span className="text-cyan-400">Day/Night/Seasons</span></div>
        <div className="flex justify-between"><span className="text-gray-500">Building Types</span><span className="text-cyan-400">23 types</span></div>
      </div>
      <Section title="Simulation Rules">
        <button onClick={onToggleTechDisruption} className="flex w-full items-center justify-between rounded bg-gray-800 px-2 py-1.5 text-[10px]"><span className="text-gray-300">Technology disruption</span><span className={gameState.technologyDisruption ? 'text-emerald-400' : 'text-gray-500'}>{gameState.technologyDisruption ? 'ON' : 'OFF'}</span></button>
        <button onClick={onToggleInverseInflation} className="flex w-full items-center justify-between rounded bg-gray-800 px-2 py-1.5 text-[10px]"><span className="text-gray-300">Inverse inflation</span><span className={gameState.inverseInflation ? 'text-emerald-400' : 'text-gray-500'}>{gameState.inverseInflation ? 'ON' : 'OFF'}</span></button>
        <DataRow label="Purchasing power" value={`${gameState.economy.purchasingPowerIndex.toFixed(1)}%`} color="text-amber-400" />
      </Section>
    </div>
  );
}
