'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { GameState, Camera, BuildingType, UIPanel, IsometricTile, MovingEntity, OverlayMode } from '../game/types';
import {
  createNewGame, simulateTick, buildBuilding, demolishBuildingAction, takeLoan, repayLoan,
  buyShares, sellShares, upgradeBuilding, setOverlay, generateMap, generateEntities, updateEntities,
  configureBuildingProduct, autoSourceBuilding, toggleInternalSale, setBuildingPrice, setTrainingBudget,
  setRentMultiplier, setMediaPolicy, startResearch, hireExecutive, spendKnowledge, intensiveTraining,
  issueBond, buyBond, issueShares, buyLand, sellLand, completeScouting,
  optimizeAllSupply, fundAdvertising, acquireTechnology, makePurchaseOffer, getAskingPrice,
  acceptIncomingOffer, rejectIncomingOffer, removeRetailProduct, setWarehouseTier,
  setMenuItemPrice, toggleMenuItem, setAdBudget,
  toggleDelivery, configureDelivery, setSafetyStockPolicy, setProductionIntensity,
  hedgeCommodity, offshoreProduction, buyAsset, sellAsset,
} from '../game/engine';
import GameCanvas from './GameCanvas';
import TopBar from './TopBar';
import BottomBar from './BottomBar';
import SidePanel from './SidePanel';
import StartScreen from './StartScreen';
import NewsTicker from './NewsTicker';
import ScoutingBrief from './ScoutingBrief';

export default function GameApp() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [tiles, setTiles] = useState<IsometricTile[][]>([]);
  const [entities, setEntities] = useState<MovingEntity[]>([]);
  const [activePanel, setActivePanel] = useState<UIPanel>('none');
  const [buildMode, setBuildMode] = useState<BuildingType | null>(null);
  const [showStartScreen, setShowStartScreen] = useState(true);
  const [showTooltips, setShowTooltips] = useState(true);

  // Escape leaves build mode and closes any open panel — the universal
  // "cancel" gesture players expect from every builder game.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setBuildMode(null);
        setActivePanel('none');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const [showNotifications, setShowNotifications] = useState(false);
  const gameStateRef = useRef<GameState | null>(null);
  const entitiesRef = useRef<MovingEntity[]>([]);

  const startGame = useCallback((playerName: string, scenario: string, seed: number) => {
    const state = createNewGame(seed, playerName + ' Corp', scenario);
    state.paused = true;
    setGameState(state);
    gameStateRef.current = state;
    setTiles(generateMap(state));
    const ents = generateEntities(state);
    setEntities(ents);
    entitiesRef.current = ents;
    setShowStartScreen(false);
  }, []);

  const runAction = useCallback((action: (state: GameState) => GameState) => {
    setGameState(previous => {
      if (!previous) return previous;
      const next = action(previous);
      const updated = { ...next };
      gameStateRef.current = updated;
      return updated;
    });
  }, []);

  // Game loop
  useEffect(() => {
    if (!gameState || gameState.speed === 0 || gameState.paused) return;
    const tickMs = gameState.speed === 1 ? 60000 : gameState.speed === 2 ? 10000 : 2000;
    const interval = setInterval(() => {
      setGameState(prev => {
        if (!prev || prev.speed === 0 || prev.paused) return prev;
        const next = simulateTick(prev);
        gameStateRef.current = next;
        return next;
      });
    }, tickMs);
    return () => clearInterval(interval);
  }, [gameState?.speed, gameState?.paused]);

  useEffect(() => {
    if (!gameState || gameState.paused) return;
    const interval = setInterval(() => {
      setEntities(prev => {
        if (gameStateRef.current && !gameStateRef.current.paused) {
          updateEntities(prev, gameStateRef.current);
          return [...prev];
        }
        return prev;
      });
    }, 50);
    return () => clearInterval(interval);
  }, [gameState?.paused, gameState?.speed]);

  const handleCameraChange = useCallback((camera: Camera) => {
    setGameState(prev => prev ? { ...prev, camera } : prev);
  }, []);

  const handleSpeedChange = useCallback((speed: number) => {
    setGameState(prev => prev ? { ...prev, speed } : prev);
  }, []);

  const handlePauseToggle = useCallback(() => {
    setGameState(prev => prev ? { ...prev, paused: !prev.paused } : prev);
  }, []);

  const handlePanelToggle = useCallback((panel: string) => {
    setActivePanel(prev => prev === panel ? 'none' : panel as UIPanel);
    setBuildMode(null);
  }, []);

  const handleBuild = useCallback((type: BuildingType) => {
    setBuildMode(prev => prev === type ? null : type);
    setActivePanel('none');
  }, []);

  const handleTileClick = useCallback((x: number, y: number) => {
    if (buildMode) {
      runAction(state => {
        const result = buildBuilding(state, buildMode, x, y, tiles);
        return result;
      });
      // Always disable build mode after attempt so player must re-select
      setBuildMode(null);
      setActivePanel('none');
    }
  }, [buildMode, runAction, tiles]);

  const handleBuildingClick = useCallback((buildingId: string) => {
    setGameState(prev => prev ? { ...prev, selectedBuilding: buildingId } : prev);
    setActivePanel('building');
  }, []);

  const handleCityClick = useCallback((cityId: string) => {
    setGameState(prev => {
      if (!prev) return prev;
      const city = prev.cities.find(c => c.id === cityId);
      if (!city) return prev;
      return { ...prev, selectedCity: cityId, camera: { ...prev.camera, x: city.x, y: city.y, zoom: Math.max(prev.camera.zoom, 1.3) } };
    });
  }, []);

  // Focus the map on a building and open its details panel. Used by the
  // "Your Buildings" list to jump directly to a chosen site.
  const handleFocusBuilding = useCallback((buildingId: string) => {
    setGameState(prev => {
      if (!prev) return prev;
      const building = prev.buildings.find(b => b.id === buildingId);
      if (!building) return prev;
      return {
        ...prev,
        selectedBuilding: buildingId,
        camera: { ...prev.camera, x: building.x, y: building.y, zoom: Math.max(prev.camera.zoom, 1.4) },
      };
    });
    setActivePanel('building');
  }, []);

  const handleTakeLoan = useCallback((amount: number) => {
    runAction(state => takeLoan(state, amount));
  }, [runAction]);

  const handleRepayLoan = useCallback((amount: number) => {
    runAction(state => repayLoan(state, amount));
  }, [runAction]);

  const handleBuyShares = useCallback((companyId: string, amount: number) => {
    runAction(state => buyShares(state, companyId, amount));
  }, [runAction]);

  const handleSellShares = useCallback((companyId: string, amount: number) => {
    runAction(state => sellShares(state, companyId, amount));
  }, [runAction]);

  const handleUpgradeBuilding = useCallback((buildingId: string) => {
    runAction(state => upgradeBuilding(state, buildingId));
  }, [runAction]);

  const handleDemolishBuilding = useCallback((buildingId: string) => {
    runAction(state => demolishBuildingAction(state, buildingId));
    setActivePanel('none');
  }, [runAction]);

  const handleOverlayChange = useCallback((overlay: OverlayMode) => {
    runAction(state => setOverlay(state, overlay));
  }, [runAction]);

  // Camera rotation removed — fixed isometric perspective

  const handleConfigureProduct = useCallback((buildingId: string, productId: string) => runAction(state => configureBuildingProduct(state, buildingId, productId)), [runAction]);
  const handleAutoSource = useCallback((buildingId: string) => runAction(state => autoSourceBuilding(state, buildingId)), [runAction]);
  const handleOptimizeAllSupply = useCallback(() => runAction(state => optimizeAllSupply(state)), [runAction]);
  const handleAdvertiseProduct = useCallback((productId: string, amount: number) => runAction(state => fundAdvertising(state, productId, amount)), [runAction]);
  const handleAcquireTechnology = useCallback((productId: string) => runAction(state => acquireTechnology(state, productId)), [runAction]);
  const handleToggleInternalSale = useCallback((buildingId: string) => runAction(state => toggleInternalSale(state, buildingId)), [runAction]);
  const handleSetPrice = useCallback((buildingId: string, value: number) => runAction(state => setBuildingPrice(state, buildingId, value)), [runAction]);
  const handleSetTraining = useCallback((buildingId: string, value: number) => runAction(state => setTrainingBudget(state, buildingId, value)), [runAction]);
  const handleSetRent = useCallback((buildingId: string, value: number) => runAction(state => setRentMultiplier(state, buildingId, value)), [runAction]);
  const handleSetMedia = useCallback((buildingId: string, budget: number, price: number) => runAction(state => setMediaPolicy(state, buildingId, budget, price)), [runAction]);
  const handleStartResearch = useCallback((buildingId: string, productId: string) => runAction(state => startResearch(state, buildingId, productId)), [runAction]);
  const handleHireExecutive = useCallback((executiveId: string) => runAction(state => hireExecutive(state, executiveId)), [runAction]);
  const handleSpendKnowledge = useCallback((category: string) => runAction(state => spendKnowledge(state, category)), [runAction]);
  const handleIntensiveTraining = useCallback(() => runAction(state => intensiveTraining(state)), [runAction]);
  const handleIssueBond = useCallback((amount: number, term: 5 | 10 | 15 | 20) => runAction(state => issueBond(state, amount, term)), [runAction]);
  const handleBuyBond = useCallback((bondId: string) => runAction(state => buyBond(state, bondId)), [runAction]);
  const handleIssueShares = useCallback((amount: number) => runAction(state => issueShares(state, amount)), [runAction]);
  const handleBuyLand = useCallback((cityId: string, size: number) => {
    const city = gameStateRef.current?.cities.find(item => item.id === cityId);
    if (!city) return;
    runAction(state => buyLand(state, Math.min(state.mapSize - 2, city.x + 10), Math.min(state.mapSize - 2, city.y + 8), size, tiles));
  }, [runAction, tiles]);
  const handleSellLand = useCallback((holdingId: string) => runAction(state => sellLand(state, holdingId)), [runAction]);
  const handleCompleteScouting = useCallback(() => runAction(state => {
    const next = completeScouting(state);
    next.paused = false;
    return next;
  }), [runAction]);
  const handleToggleTechDisruption = useCallback(() => runAction(state => ({ ...state, technologyDisruption: !state.technologyDisruption })), [runAction]);
  const handleToggleInverseInflation = useCallback(() => runAction(state => ({ ...state, inverseInflation: !state.inverseInflation })), [runAction]);

  // Digital Age stubs — functional but simplified
  const noop = useCallback(() => {}, []);
  const noopStr = useCallback((_a: string) => {}, []);
  const noopStr2 = useCallback((_a: string, _b: string) => {}, []);
  const noopStrNum = useCallback((_a: string, _b: number) => {}, []);
  const noopStrStrNull = useCallback((_a: string, _b: string | null) => {}, []);
  const noopStrNumNum = useCallback((_a: string, _b: number, _c: number) => {}, []);

  const handleAcceptOffer = useCallback((offerId: string) => runAction(state => acceptIncomingOffer(state, offerId)), [runAction]);
  const handleRejectOffer = useCallback((offerId: string) => runAction(state => rejectIncomingOffer(state, offerId)), [runAction]);
  const handleRemoveProduct = useCallback((buildingId: string, productId: string) =>
    runAction(state => removeRetailProduct(state, buildingId, productId)), [runAction]);
  const handleSetWarehouseTier = useCallback((buildingId: string, tier: 'general' | 'cold' | 'hazmat') =>
    runAction(state => setWarehouseTier(state, buildingId, tier)), [runAction]);
  const handleSetMenuPrice = useCallback((buildingId: string, itemId: string, price: number) =>
    runAction(state => setMenuItemPrice(state, buildingId, itemId, price)), [runAction]);
  const handleToggleMenuItem = useCallback((buildingId: string, itemId: string) =>
    runAction(state => toggleMenuItem(state, buildingId, itemId)), [runAction]);
  const handleSetAdBudget = useCallback((buildingId: string, budget: number) =>
    runAction(state => setAdBudget(state, buildingId, budget)), [runAction]);
  const handleToggleDelivery = useCallback((buildingId: string) =>
    runAction(state => toggleDelivery(state, buildingId)), [runAction]);
  const handleConfigureDelivery = useCallback((buildingId: string, patch: Partial<{ mode: 'in_house' | 'platform'; radius: number; couriers: number; customerFee: number }>) =>
    runAction(state => configureDelivery(state, buildingId, patch)), [runAction]);
  const handleSetSafetyStock = useCallback((buildingId: string, policy: number) =>
    runAction(state => setSafetyStockPolicy(state, buildingId, policy)), [runAction]);
  const handleSetIntensity = useCallback((buildingId: string, intensity: number) =>
    runAction(state => setProductionIntensity(state, buildingId, intensity)), [runAction]);
  const handleHedge = useCallback((months: number) =>
    runAction(state => hedgeCommodity(state, months)), [runAction]);
  const handleBuyAsset = useCallback((assetId: string, units: number) =>
    runAction(state => buyAsset(state, assetId, units)), [runAction]);
  const handleSellAsset = useCallback((assetId: string, units: number) =>
    runAction(state => sellAsset(state, assetId, units)), [runAction]);
  const handleOffshore = useCallback((buildingId: string, partnerId: string) =>
    runAction(state => offshoreProduction(state, buildingId, partnerId)), [runAction]);

  const handleMakeOffer = useCallback((buildingId: string, amount: number) => {
    runAction(state => makePurchaseOffer(state, buildingId, amount));
  }, [runAction]);
  const askingPriceFor = useCallback((buildingId: string) => {
    return gameStateRef.current ? getAskingPrice(gameStateRef.current, buildingId) : null;
  }, []);

  if (showStartScreen) {
    return <StartScreen onStart={startGame} />;
  }

  if (!gameState) return null;

  return (
    <div className="h-screen w-screen flex flex-col bg-gray-900 overflow-hidden select-none">
      <TopBar
        gameState={gameState}
        onSpeedChange={handleSpeedChange}
        onPauseToggle={handlePauseToggle}
        onPanelToggle={handlePanelToggle}
        onOverlayChange={handleOverlayChange}
      />
      <div className="flex-1 relative overflow-hidden">
        <GameCanvas
          gameState={gameState}
          tiles={tiles}
          entities={entities}
          onCameraChange={handleCameraChange}
          onTileClick={handleTileClick}
          onBuildingClick={handleBuildingClick}
          onCityClick={handleCityClick}
          buildMode={buildMode}
        />
        {/* News Ticker */}
        <NewsTicker items={gameState.stockMarket.ticker} />

        {!gameState.scoutingComplete && (
          <ScoutingBrief
            gameState={gameState}
            onOverlayChange={handleOverlayChange}
            onFocusCity={handleCityClick}
            onComplete={handleCompleteScouting}
          />
        )}

        {/* Right Side Panel */}
        <SidePanel
          gameState={gameState}
          activePanel={activePanel}
          onClose={() => { setActivePanel('none'); setBuildMode(null); }}
          onBuild={handleBuild}
          onTakeLoan={handleTakeLoan}
          onRepayLoan={handleRepayLoan}
          onBuyShares={handleBuyShares}
          onSellShares={handleSellShares}
          onUpgradeBuilding={handleUpgradeBuilding}
          onDemolishBuilding={handleDemolishBuilding}
          onConfigureProduct={handleConfigureProduct}
          onAutoSource={handleAutoSource}
          onOptimizeAllSupply={handleOptimizeAllSupply}
          onAdvertiseProduct={handleAdvertiseProduct}
          onAcquireTechnology={handleAcquireTechnology}
          onToggleInternalSale={handleToggleInternalSale}
          onSetPrice={handleSetPrice}
          onSetTraining={handleSetTraining}
          onSetRent={handleSetRent}
          onSetMedia={handleSetMedia}
          onStartResearch={handleStartResearch}
          onHireExecutive={handleHireExecutive}
          onSpendKnowledge={handleSpendKnowledge}
          onIntensiveTraining={handleIntensiveTraining}
          onIssueBond={handleIssueBond}
          onBuyBond={handleBuyBond}
          onIssueShares={handleIssueShares}
          onBuyLand={handleBuyLand}
          onSellLand={handleSellLand}
          onFocusCity={handleCityClick}
          onToggleTechDisruption={handleToggleTechDisruption}
          onToggleInverseInflation={handleToggleInverseInflation}
          onStartTechProject={noopStrNumNum as any}
          onStartSoftwareProject={noopStrStrNull as any}
          onToggleAutoVersion={noopStr}
          onAssignSoftware={noopStr2 as any}
          onToggleEcommerce={noopStr}
          onSetEcommercePrice={noopStrNumNum as any}
          onSetTelecomPolicy={noopStrNumNum as any}
          onSetWebsitePolicy={noopStrNumNum as any}
          onHireTalent={noopStr2 as any}
          onHeadhuntTalent={noopStr2 as any}
          onRaiseSalary={noopStrNum as any}
          onToggleAutoLoyalty={noopStr}
          onMakeOffer={handleMakeOffer}
          askingPriceFor={askingPriceFor}
          onAcceptOffer={handleAcceptOffer}
          onRejectOffer={handleRejectOffer}
          onRemoveProduct={handleRemoveProduct}
          onSetWarehouseTier={handleSetWarehouseTier}
          onSetMenuPrice={handleSetMenuPrice}
          onToggleMenuItem={handleToggleMenuItem}
          onSetAdBudget={handleSetAdBudget}
          onToggleDelivery={handleToggleDelivery}
          onConfigureDelivery={handleConfigureDelivery}
          onSetSafetyStock={handleSetSafetyStock}
          onSetIntensity={handleSetIntensity}
          onHedge={handleHedge}
          onOffshore={handleOffshore}
          showTooltips={showTooltips}
          onToggleTooltips={() => setShowTooltips(v => !v)}
          onFocusBuilding={handleFocusBuilding}
          onBuyAsset={handleBuyAsset}
          onSellAsset={handleSellAsset}
        />

        {/* Build mode banner */}
        {buildMode && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-500 to-orange-500 text-black px-5 py-2.5 rounded-xl font-bold text-sm shadow-2xl flex items-center gap-2 z-30 animate-pulse">
            <span>🏗️</span>
            <span>Building Mode: Click on map to place {buildMode.replace(/_/g, ' ')}</span>
            <button onClick={() => setBuildMode(null)} className="ml-2 bg-black/20 hover:bg-black/30 rounded px-2 py-0.5">✕</button>
          </div>
        )}

        {/* Notifications toast */}
        {showNotifications && gameState.notifications.length > 0 && (
          <div className="absolute top-20 right-4 w-80 max-h-96 overflow-y-auto bg-gray-900/95 border border-gray-700 rounded-xl shadow-2xl z-30">
            <div className="flex items-center justify-between p-3 border-b border-gray-700">
              <span className="text-sm font-bold text-white">📬 Notifications</span>
              <button onClick={() => setShowNotifications(false)} className="text-gray-400 hover:text-white text-sm">✕</button>
            </div>
            <div className="divide-y divide-gray-800">
              {gameState.notifications.slice().reverse().map(n => (
                <div key={n.id} className={`p-2.5 text-xs ${
                  n.type === 'success' ? 'text-green-300 bg-green-900/20' :
                  n.type === 'warning' ? 'text-yellow-300 bg-yellow-900/20' :
                  n.type === 'danger' ? 'text-red-300 bg-red-900/20' : 'text-gray-300'
                }`}>
                  {n.message}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <BottomBar
        gameState={gameState}
        onPanelToggle={handlePanelToggle}
        onShowNotifications={() => setShowNotifications(p => !p)}
        notificationCount={gameState.notifications.length}
      />
    </div>
  );
}
