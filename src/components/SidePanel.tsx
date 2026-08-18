'use client';

import { useState } from 'react';
import type { GameState, BuildingType, UIPanel } from '../game/types';
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
        {activePanel === 'goals' && <GoalsPanel {...props} />}
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
};

function BuildingPanel({
  gameState, onUpgradeBuilding, onDemolishBuilding, onConfigureProduct, onAutoSource,
  onToggleInternalSale, onSetPrice, onSetTraining, onSetRent, onSetMedia, onStartResearch,
  onMakeOffer, askingPriceFor,
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

      <div className="grid grid-cols-2 gap-1.5">
        <StatBox label="Revenue" value={formatMoney(building.revenue)} color="text-blue-400" />
        <StatBox label="Costs" value={formatMoney(building.operatingCost)} color="text-orange-400" />
        <StatBox label="Profit" value={formatMoney(building.profit)} color={building.profit >= 0 ? 'text-green-400' : 'text-red-400'} />
        <StatBox label="Employees" value={building.employees.toString()} color="text-gray-300" />
        <StatBox label="Util" value={`${building.utilization.toFixed(0)}%`} color="text-yellow-400" />
        <StatBox label="Train" value={`Lv ${building.trainingLevel}`} color="text-purple-400" />
        <StatBox label="Cond" value={`${building.condition.toFixed(0)}%`} color={building.condition > 60 ? 'text-cyan-400' : 'text-red-400'} />
        <StatBox label="Traffic" value={building.customerTraffic.toFixed(0)} color="text-pink-400" />
        <StatBox label="Supply" value={building.supply.toFixed(0)} color="text-yellow-400" />
        <StatBox label="Demand" value={building.demand.toFixed(0)} color="text-orange-400" />
      </div>

      <ProgressBar label="Utilization" value={building.utilization} color="bg-emerald-500" />
      <ProgressBar label="Condition" value={building.condition} color="bg-cyan-500" />

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
        <Section title="Operating Product">
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
        <Section title="Acquisition Offer">
          {(() => {
            const asking = askingPriceFor(building.id);
            return (
              <div className="space-y-2">
                <DataRow label="Seller" value={company.name} color="text-gray-300" />
                <DataRow label="Board ask" value={asking ? formatMoney(asking) : '--'} color="text-amber-400" />
                <input
                  type="number"
                  value={offerAmount}
                  onChange={e => setOfferAmount(Math.max(0, Number(e.target.value)))}
                  placeholder={asking ? Math.round(asking).toString() : 'Offer amount'}
                  className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-[11px] text-white"
                />
                <button
                  onClick={() => onMakeOffer(building.id, offerAmount || Math.round(asking || 0))}
                  className="w-full rounded bg-emerald-600 py-1.5 text-[10px] font-bold hover:bg-emerald-500"
                >
                  Submit offer{(asking && offerAmount >= asking) ? ' (buyout)' : ''}
                </button>
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

function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-gray-900 rounded-lg p-2 border border-gray-800 text-center">
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
  const sm = gameState.stockMarket;
  const visibleCompanies = gameState.companies.filter(company =>
    (sector === 'all' || company.sector === sector) && (!ownedOnly || company.sharesOwned > 0)
  );

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

      <div className="space-y-1.5">
        {visibleCompanies.map(c => (
          <div key={c.id} className="bg-gray-900 rounded-lg p-2.5 border border-gray-800">
            <div className="flex justify-between items-center mb-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: c.color }} />
                <span className="text-[11px] font-bold truncate">{c.name}</span>
                {c.isPlayer && <span className="text-[8px] bg-emerald-600 px-1 py-0.5 rounded">YOU</span>}
              </div>
              <span className="text-xs font-mono font-bold text-yellow-400">${c.sharePrice.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-[9px] text-gray-500 mb-1.5">
              <span>MCap: {formatMoney(c.marketCap)}</span>
              <span>Owned: {c.sharesOwned.toLocaleString()}</span>
            </div>
            {!c.isPlayer && (
              <div className="flex gap-1">
                <button onClick={() => onBuyShares(c.id, shareAmount)} className="flex-1 py-1 bg-green-600/30 hover:bg-green-600 border border-green-600 rounded text-[10px] font-bold transition-colors">
                  Buy {shareAmount.toLocaleString()}
                </button>
                <button onClick={() => onSellShares(c.id, shareAmount)} className="flex-1 py-1 bg-red-600/30 hover:bg-red-600 border border-red-600 rounded text-[10px] font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed" disabled={c.sharesOwned < shareAmount}>
                  Sell
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============= SUPPLY CHAIN =============

function SupplyChainPanel({ gameState, onOptimizeAllSupply }: SidePanelProps) {
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

  return (
    <div className="space-y-3">
      <Section title={`🏗️ Your ${myBuildings.length} Buildings`}>
        <div className="text-[10px] text-gray-400">
          Total revenue: <span className="text-emerald-400 font-mono font-bold">{formatMoney(myBuildings.reduce((s, b) => s + b.revenue, 0) * 24 * 30)}/mo</span>
        </div>
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
                    <div key={b.id} className={`bg-gray-900 rounded p-2 border-l-2 ${g.color}`}>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-gray-300 truncate">{b.name} • {city?.name}</span>
                        <span className={`font-mono font-bold ${b.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatMoney(b.profit)}</span>
                      </div>
                      <div className="flex justify-between text-[9px] text-gray-500 mt-0.5">
                        <span>Util {b.utilization.toFixed(0)}%</span>
                        <span>Lv{b.trainingLevel}</span>
                      </div>
                    </div>
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
            <div className="mt-2 flex gap-1">
              <button onClick={() => onAdvertiseProduct(product.id, 1000000)} className="flex-1 rounded bg-pink-700 py-1.5 text-[9px] font-bold hover:bg-pink-600">Advertise $1M</button>
              <button onClick={() => onAcquireTechnology(product.id)} className="flex-1 rounded bg-violet-700 py-1.5 text-[9px] font-bold hover:bg-violet-600">Buy technology</button>
            </div>
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
              <div><span className="text-gray-500">Pop:</span> <span className="text-gray-300">{(city.population / 1000000).toFixed(1)}M</span></div>
              <div><span className="text-gray-500">Wage:</span> <span className="text-gray-300">${city.wageRate.toFixed(0)}</span></div>
              <div><span className="text-gray-500">Unemp:</span> <span className={city.unemploymentRate > 8 ? 'text-red-400' : 'text-green-400'}>{city.unemploymentRate.toFixed(1)}%</span></div>
              <div><span className="text-gray-500">Growth:</span> <span className="text-green-400">+{city.growthRate.toFixed(1)}%</span></div>
              <div><span className="text-gray-500">Land:</span> <span className="text-yellow-400">{city.landCostMultiplier.toFixed(1)}x</span></div>
              <div><span className="text-gray-500">Bldgs:</span> <span className="text-cyan-400">{myBuildings.length}/{cityBuildings.length}</span></div>
              <div><span className="text-gray-500">Housing:</span> <span className={city.housingDemand < 0 ? 'text-emerald-400' : 'text-red-400'}>{city.housingDemand.toFixed(0)}</span></div>
              <div><span className="text-gray-500">Office:</span> <span className={city.officeDemand < 0 ? 'text-emerald-400' : 'text-red-400'}>{city.officeDemand.toFixed(0)}</span></div>
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
            {!c.isPlayer && <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold uppercase ${
              c.aiStrategy === 'aggressive' ? 'bg-red-600' :
              c.aiStrategy === 'conservative' ? 'bg-blue-600' : 'bg-gray-600'
            }`}>{c.aiStrategy[0]}</span>}
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
        </div>
      ))}
    </div>
  );
}

// ============= GOALS =============

function GoalsPanel({ gameState }: SidePanelProps) {
  return (
    <div className="space-y-2">
      <div className="bg-gray-900 rounded-lg p-2.5 border border-gray-800 text-[10px] text-gray-400">
        Complete objectives to earn cash rewards. Watch your empire grow! 🚀
      </div>
      {gameState.goals.map(goal => {
        const progress = Math.min(100, (goal.current / goal.target) * 100);
        const numericGoal = goal.target <= 100;
        return (
          <div key={goal.id} className={`bg-gray-900 rounded-lg p-2.5 border ${goal.completed ? 'border-green-500' : 'border-gray-800'}`}>
            <div className="flex items-start justify-between mb-1">
              <div>
                <div className="text-[11px] font-bold text-white">
                  {goal.completed && '✅ '}{goal.name}
                </div>
                <div className="text-[9px] text-gray-500">{goal.description}</div>
              </div>
              <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                goal.category === 'wealth' ? 'bg-green-700' :
                goal.category === 'expansion' ? 'bg-blue-700' :
                goal.category === 'dominance' ? 'bg-red-700' : 'bg-purple-700'
              }`}>+{formatMoney(goal.reward)} | {goal.knowledgeReward} KP</span>
            </div>
            <div className="flex justify-between text-[9px] text-gray-400 mb-0.5">
              <span>{numericGoal ? goal.current.toFixed(1) : formatMoney(goal.current)} / {numericGoal ? goal.target : formatMoney(goal.target)}</span>
              <span className={progress >= 100 ? 'text-green-400' : 'text-yellow-400'}>{progress.toFixed(0)}%</span>
            </div>
            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${progress >= 100 ? 'bg-green-500' : progress > 50 ? 'bg-yellow-500' : 'bg-orange-500'}`}
                style={{ width: `${progress}%` }}
              />
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

function SettingsPanel({ gameState, onToggleTechDisruption, onToggleInverseInflation }: SidePanelProps) {
  return (
    <div className="space-y-2">
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
        <div className="flex justify-between"><span className="text-gray-500">Map Size</span><span className="text-cyan-400">100×100 tiles</span></div>
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
