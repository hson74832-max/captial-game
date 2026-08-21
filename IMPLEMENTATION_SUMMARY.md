# Capital Empire - Feature Implementation Summary

## Latest Updates (Session 6)

### 1. Technology Unlock Years
**Problem:** Technologies like Bitcoin appeared from the start of the game (year 2000), which is historically inaccurate.

**Solution:** Implemented a technology unlock system where products and assets become available only in their historically accurate years.

**Implementation:**
- Added `unlockYear` field to `Product` and `TradedAsset` types
- Updated `PRODUCT_RULES` with unlock years:
  - Mobile Phone: 1992
  - Smart Phone: 2007
  - Desktop Computer: 1985
  - Notebook Computer: 1991
  - Tablet Computer: 2010
  - Printer: 1988
  - Car/Motorcycle/Truck: 1980
  - Lithium: 2005
  - Game Console: 1995
  - Air Conditioner: 1988
  - Coffee Machine: 1986

- Updated asset unlock years:
  - Bitcoin: 2008
  - Lithium: 1980
  - ETFs (MKTX, INDX): 1980
  - Commodities/Metals: 1800 (always available)

- Modified `eligibleProductsFor()` to filter by year
- UI shows locked products/assets with "🔒 Unlocks: YYYY" indicator
- Buy/Sell buttons disabled for locked assets

### 2. Real-Time Game Speed
**Problem:** Game was running at 5 hours per real second at speed=1, making it difficult to observe changes.

**Solution:** Adjusted the game loop to run at 1 hour per real second.

**Implementation:**
- Changed interval calculation in `src/app/page.tsx`:
  ```typescript
  const interval = Math.max(16, 1000 / gameState.speed);
  ```
- Speed 1 = 1 hour/second (1000ms per tick)
- Speed 2 = 2 hours/second (500ms per tick)
- Speed 4 = 4 hours/second (250ms per tick)
- Speed 8 = 8 hours/second (125ms per tick)

### 3. Daily UI Updates
**Problem:** Building and company statistics updated every tick (hourly), causing constant UI changes that were hard to track.

**Solution:** Implemented daily snapshot system where UI-facing statistics update once per day (at hour 0).

**Implementation:**

#### Added accumulator fields to types:
- **Building:** `revenueAccum`, `cogsAccum`, `opexAccum`, `profitAccum`, `utilizationAccum`, `soldUnitsAccum`, `producedUnitsAccum`
- **Company:** `revenueAccum`, `profitAccum`, `expensesAccum`

#### Added daily snapshot fields to types:
- **Building:** `dailyRevenue`, `dailyCogs`, `dailyOpex`, `dailyProfit`, `dailyUtilization`, `dailySold`, `dailyProduced`
- **Company:** `dailyCash`, `dailyMarketCap`, `dailySharePrice`, `dailyRevenue`, `dailyProfit`, `dailyExpenses`, `dailyNetWorth`

#### Simulation changes:
- Per-tick values accumulate into accumulators
- At hour 0 (midnight), accumulators are snapshotted to daily fields and reset
- UI panels now read from daily snapshot fields:
  - Dashboard: `dailyCash`, `dailyRevenue`, `dailyProfit`, `dailyMarketCap`, `dailySharePrice`, `dailyNetWorth`
  - Companies panel: `dailyCash`, `dailyMarketCap`, `dailySharePrice`
  - Building detail: `dailyRevenue`, `dailyCogs`, `dailyOpex`, `dailyProfit`, `dailyUtilization`

### 4. Bitcoin-Specific Features
**Implementation:**
- Added "Hard cap 21M · issuance halves every 4 years" label for BTC
- Bitcoin halvings occur every 4 years starting from 2008 (2008, 2012, 2016, 2020, 2024...)
- Annual issuance decreases from 164,000 BTC → 82,000 → 41,000 → etc.

## Previous Sessions Summary

### Session 1: Core Game Engine
- Isometric map with 10 cities, roads, terrain
- 5 building types: factory, farm, retail, mine, warehouse
- Basic economic simulation with supply/demand
- Stock market with 12 assets (commodities, metals, crypto, ETFs)
- AI competitors with different strategies
- Loan system with interest rates

### Session 2: Advanced Economic Features
- Traded assets with supply/demand mechanics
- Transaction fees and tax lots for capital gains
- Property tax, corporate tax, dividend tax
- Seaports for international trade
- NIMBY effects and zoning regulations
- Enhanced AI behavior (cartels, predatory pricing)

### Session 3: Realism Improvements
- Supply chain disruptions and supplier failures
- Quality degradation from rushing production
- Labor market with unions and strikes
- Forward-looking stock market
- Government regulations and antitrust
- Trade partnerships with tariffs and quotas

### Session 4: Market Dynamics
- Real commodity supply (finite world supply)
- Stock-to-flow pricing (scarcity drives price)
- Bitcoin halving mechanics
- Market impact on large trades
- Short-term vs long-term capital gains
- Loss carry-forward for tax harvesting

### Session 5: Tax System & Loopholes
- 0.5% transaction fees on all trades
- Tax lots with FIFO consumption
- Property tax on buildings (1.2% annually)
- Corporate tax on profits (21%)
- Dividend tax on payouts (15%)
- Closed tax-loss harvesting loophole
- Seaport quota system to prevent arbitrage

## Game Balance

### Starting Conditions
- Year: 2000
- Cash: $50M
- 10 cities with varying populations
- 8-12 AI competitors
- 12 tradeable assets

### Economic Parameters
- Corporate tax: 21%
- Property tax: 1.2% annually
- Dividend tax: 15%
- Capital gains: 15% long-term, 22% short-term
- Transaction fees: 0.5%
- Loan interest: 5-8% depending on credit rating

### Technology Timeline
- 1980-1990: Desktop computers, basic electronics
- 1991-2000: Notebooks, mobile phones
- 2001-2010: Smartphones, tablets, lithium batteries
- 2008+: Bitcoin and crypto markets

## Technical Architecture

### File Structure
```
src/
├── game/
│   ├── types.ts          # TypeScript interfaces
│   ├── constants.ts      # Product rules, building configs
│   ├── engine.ts         # Core simulation logic
│   ├── markets.ts        # Asset trading and supply
│   ├── roads.ts          # Road network generation
│   ├── consumers.ts      # Consumer behavior models
│   ├── supplychain.ts    # Supply chain mechanics
│   ├── taxation.ts       # Tax collection logic
│   ├── indexing.ts       # Spatial indexing
│   └── entities.ts       # Moving entities (vehicles)
├── app/
│   ├── page.tsx          # Main game UI
│   ├── layout.tsx        # Root layout
│   └── globals.css       # Global styles
```

### Performance Optimizations
- Spatial indexing for O(1) neighbor queries
- Daily UI snapshots to reduce re-renders
- Efficient road pathfinding with A* algorithm
- Cached supply chain calculations

## Known Issues & Future Work

### Potential Improvements
1. **R&D System:** Allow companies to research and unlock technologies early
2. **Patents:** Protect innovations for limited time
3. **Mergers & Acquisitions:** Allow buying/selling entire companies
4. **Multiplayer:** Real-time competitive play
5. **Scenarios:** Pre-built challenges with specific goals
6. **Modding Support:** Custom products, buildings, and rules
7. **Replay System:** Record and playback game sessions
8. **Advanced Analytics:** Detailed charts and graphs
9. **Tutorial System:** Guided introduction to mechanics
10. **Achievement System:** Unlock rewards for milestones

### Performance Considerations
- Large maps (200x200+) may cause slowdowns
- Many buildings (>500) can impact simulation speed
- Consider Web Workers for heavy calculations
- Implement level-of-detail rendering for distant buildings

## Testing

### Manual Testing Checklist
- [x] Start game with year 2000
- [x] Verify Bitcoin not available until 2008
- [x] Check smartphone unlock at 2007
- [x] Confirm 1 hour = 1 second at speed 1
- [x] Verify daily UI updates (hour 0)
- [x] Test product eligibility filters by year
- [x] Check asset trading with unlock years
- [x] Verify tax calculations work correctly
- [x] Test supply chain disruptions
- [x] Confirm AI respects technology timelines

### Build Status
- TypeScript compilation: ✓ PASS
- Production build: ✓ PASS
- Type checking: ✓ PASS
- Runtime testing: ✓ PASS

## Conclusion

The Capital Empire game now features:
- Historically accurate technology unlocks
- Real-time pacing (1 hour/second)
- Daily UI updates for better readability
- Comprehensive tax system
- Realistic supply/demand mechanics
- Advanced AI behaviors
- Multiple paths to victory

The game provides a deep, realistic economic simulation that teaches players about business strategy, market dynamics, and financial management.
