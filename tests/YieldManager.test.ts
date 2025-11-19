import { describe, it, expect, beforeEach } from "vitest";
import { uintCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 2000;
const ERR_INVALID_POOL = 2001;
const ERR_INSUFFICIENT_FUNDS = 2002;
const ERR_LOW_YIELD = 2003;
const ERR_INVALID_APY_THRESHOLD = 2004;
const ERR_POOL_ALREADY_EXISTS = 2005;
const ERR_POOL_NOT_FOUND = 2006;
const ERR_INVALID_HARVEST_INTERVAL = 2007;
const ERR_INVALID_REBALANCE_THRESHOLD = 2008;
const ERR_ORACLE_FAILURE = 2009;
const ERR_INVALID_POOL_WEIGHT = 2010;
const ERR_INVALID_STRATEGY = 2011;
const ERR_PAUSED = 2012;
const ERR_INVALID_AMOUNT = 2013;
const ERR_INVALID_TIMESTAMP = 2014;
const ERR_MAX_POOLS_EXCEEDED = 2015;
const ERR_INVALID_POOL_TYPE = 2016;
const ERR_INVALID_REWARD_TOKEN = 2017;
const ERR_INVALID_DEPOSIT_TOKEN = 2018;
const ERR_REBALANCE_NOT_NEEDED = 2019;
const ERR_HARVEST_TOO_SOON = 2020;

interface Pool {
  poolPrincipal: string;
  strategy: string;
  weight: number;
  lastHarvest: number;
  allocatedAmount: number;
  apyThreshold: number;
  poolType: string;
  rewardToken: string;
  depositToken: string;
  active: boolean;
}

interface HarvestHistory {
  poolId: number;
  timestamp: number;
  rewards: number;
  harvester: string;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class YieldManagerMock {
  state: {
    admin: string;
    paused: boolean;
    minHarvestInterval: number;
    rebalanceThreshold: number;
    nextPoolId: number;
    maxPools: number;
    totalAllocated: number;
    pools: Map<number, Pool>;
    poolsByStrategy: Map<string, number>;
    harvestHistory: Map<number, HarvestHistory>;
  } = {
    admin: "ST1ADMIN",
    paused: false,
    minHarvestInterval: 144,
    rebalanceThreshold: 5,
    nextPoolId: 0,
    maxPools: 10,
    totalAllocated: 0,
    pools: new Map(),
    poolsByStrategy: new Map(),
    harvestHistory: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1ADMIN";
  mockVaultBalance: number = 1000000;
  mockApy: Map<string, number> = new Map();
  mockRewards: Map<string, number> = new Map();
  events: Array<{ event: string; [key: string]: any }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      admin: "ST1ADMIN",
      paused: false,
      minHarvestInterval: 144,
      rebalanceThreshold: 5,
      nextPoolId: 0,
      maxPools: 10,
      totalAllocated: 0,
      pools: new Map(),
      poolsByStrategy: new Map(),
      harvestHistory: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1ADMIN";
    this.mockVaultBalance = 1000000;
    this.mockApy = new Map();
    this.mockRewards = new Map();
    this.events = [];
  }

  isAdmin(caller: string): boolean {
    return caller === this.state.admin;
  }

  setAdmin(newAdmin: string): Result<boolean> {
    if (!this.isAdmin(this.caller)) return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.admin = newAdmin;
    return { ok: true, value: true };
  }

  setPaused(newPaused: boolean): Result<boolean> {
    if (!this.isAdmin(this.caller)) return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.paused = newPaused;
    return { ok: true, value: true };
  }

  setMinHarvestInterval(newInterval: number): Result<boolean> {
    if (!this.isAdmin(this.caller)) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newInterval <= 0) return { ok: false, value: ERR_INVALID_HARVEST_INTERVAL };
    this.state.minHarvestInterval = newInterval;
    return { ok: true, value: true };
  }

  setRebalanceThreshold(newThreshold: number): Result<boolean> {
    if (!this.isAdmin(this.caller)) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newThreshold <= 0 || newThreshold > 20) return { ok: false, value: ERR_INVALID_REBALANCE_THRESHOLD };
    this.state.rebalanceThreshold = newThreshold;
    return { ok: true, value: true };
  }

  setMaxPools(newMax: number): Result<boolean> {
    if (!this.isAdmin(this.caller)) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newMax <= 0) return { ok: false, value: ERR_MAX_POOLS_EXCEEDED };
    this.state.maxPools = newMax;
    return { ok: true, value: true };
  }

  addPool(
    poolPrincipal: string,
    strategy: string,
    weight: number,
    apyThreshold: number,
    poolType: string,
    rewardToken: string,
    depositToken: string
  ): Result<number> {
    if (!this.isAdmin(this.caller)) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (this.state.paused) return { ok: false, value: ERR_PAUSED };
    if (this.state.nextPoolId >= this.state.maxPools) return { ok: false, value: ERR_MAX_POOLS_EXCEEDED };
    if (poolPrincipal === this.caller) return { ok: false, value: ERR_INVALID_POOL };
    if (!strategy || strategy.length > 50) return { ok: false, value: ERR_INVALID_STRATEGY };
    if (weight <= 0 || weight > 100) return { ok: false, value: ERR_INVALID_POOL_WEIGHT };
    if (apyThreshold <= 0 || apyThreshold > 50) return { ok: false, value: ERR_INVALID_APY_THRESHOLD };
    if (!["lp", "staking", "lending"].includes(poolType)) return { ok: false, value: ERR_INVALID_POOL_TYPE };
    if (rewardToken === this.caller) return { ok: false, value: ERR_INVALID_REWARD_TOKEN };
    if (depositToken === this.caller) return { ok: false, value: ERR_INVALID_DEPOSIT_TOKEN };
    if (this.state.poolsByStrategy.has(strategy)) return { ok: false, value: ERR_POOL_ALREADY_EXISTS };
    const id = this.state.nextPoolId;
    const pool: Pool = {
      poolPrincipal,
      strategy,
      weight,
      lastHarvest: this.blockHeight,
      allocatedAmount: 0,
      apyThreshold,
      poolType,
      rewardToken,
      depositToken,
      active: true,
    };
    this.state.pools.set(id, pool);
    this.state.poolsByStrategy.set(strategy, id);
    this.state.nextPoolId++;
    this.events.push({ event: "pool-added", id });
    return { ok: true, value: id };
  }

  removePool(poolId: number): Result<boolean> {
    const pool = this.state.pools.get(poolId);
    if (!pool) return { ok: false, value: ERR_POOL_NOT_FOUND };
    if (!this.isAdmin(this.caller)) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (this.state.paused) return { ok: false, value: ERR_PAUSED };
    if (!pool.active) return { ok: false, value: ERR_POOL_NOT_FOUND };
    this.withdrawFromPool(poolId, pool.allocatedAmount);
    this.state.pools.set(poolId, { ...pool, active: false });
    this.state.poolsByStrategy.delete(pool.strategy);
    this.events.push({ event: "pool-removed", id: poolId });
    return { ok: true, value: true };
  }

  deployToPool(poolId: number, amount: number): Result<boolean> {
    const pool = this.state.pools.get(poolId);
    if (!pool) return { ok: false, value: ERR_POOL_NOT_FOUND };
    if (!this.isAdmin(this.caller)) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (this.state.paused) return { ok: false, value: ERR_PAUSED };
    if (!pool.active) return { ok: false, value: ERR_POOL_NOT_FOUND };
    if (amount <= 0) return { ok: false, value: ERR_INVALID_AMOUNT };
    if (this.mockVaultBalance < amount) return { ok: false, value: ERR_INSUFFICIENT_FUNDS };
    this.mockVaultBalance -= amount;
    this.state.pools.set(poolId, { ...pool, allocatedAmount: pool.allocatedAmount + amount });
    this.state.totalAllocated += amount;
    this.events.push({ event: "deployed-to-pool", poolId, amount });
    return { ok: true, value: true };
  }

  private withdrawFromPool(poolId: number, amount: number): Result<boolean> {
    const pool = this.state.pools.get(poolId);
    if (!pool) return { ok: false, value: ERR_POOL_NOT_FOUND };
    if (pool.allocatedAmount < amount) return { ok: false, value: ERR_INSUFFICIENT_FUNDS };
    this.mockVaultBalance += amount;
    this.state.pools.set(poolId, { ...pool, allocatedAmount: pool.allocatedAmount - amount });
    this.state.totalAllocated -= amount;
    this.events.push({ event: "withdrawn-from-pool", poolId, amount });
    return { ok: true, value: true };
  }

  harvestFromPool(poolId: number): Result<number> {
    const pool = this.state.pools.get(poolId);
    if (!pool) return { ok: false, value: ERR_POOL_NOT_FOUND };
    if (!this.isAdmin(this.caller)) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (this.state.paused) return { ok: false, value: ERR_PAUSED };
    if (!pool.active) return { ok: false, value: ERR_POOL_NOT_FOUND };
    if (this.blockHeight - pool.lastHarvest < this.state.minHarvestInterval) return { ok: false, value: ERR_HARVEST_TOO_SOON };
    const rewards = this.mockRewards.get(pool.poolPrincipal) || 0;
    if (rewards <= 0) return { ok: false, value: ERR_LOW_YIELD };
    this.deployToPool(poolId, rewards);
    this.state.pools.set(poolId, { ...pool, lastHarvest: this.blockHeight });
    const historyId = this.state.harvestHistory.size;
    this.state.harvestHistory.set(historyId, {
      poolId,
      timestamp: this.blockHeight,
      rewards,
      harvester: this.caller,
    });
    this.events.push({ event: "harvested-from-pool", poolId, rewards });
    return { ok: true, value: rewards };
  }

  rebalancePool(poolId: number): Result<boolean> {
    const pool = this.state.pools.get(poolId);
    if (!pool) return { ok: false, value: ERR_POOL_NOT_FOUND };
    if (!this.isAdmin(this.caller)) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (this.state.paused) return { ok: false, value: ERR_PAUSED };
    if (!pool.active) return { ok: false, value: ERR_POOL_NOT_FOUND };
    const currentApy = this.mockApy.get(pool.poolPrincipal) || 0;
    if (currentApy > this.state.rebalanceThreshold) return { ok: false, value: ERR_REBALANCE_NOT_NEEDED };
    this.withdrawFromPool(poolId, pool.allocatedAmount);
    this.state.pools.set(poolId, { ...pool, active: false });
    this.events.push({ event: "pool-rebalanced", poolId, reason: "low-apy" });
    return { ok: true, value: true };
  }

  getTotalAllocated(): Result<number> {
    return { ok: true, value: this.state.totalAllocated };
  }

  getPoolCount(): Result<number> {
    return { ok: true, value: this.state.nextPoolId };
  }

  checkPoolExistence(strategy: string): Result<boolean> {
    return { ok: true, value: this.state.poolsByStrategy.has(strategy) };
  }
}

describe("YieldManager", () => {
  let contract: YieldManagerMock;

  beforeEach(() => {
    contract = new YieldManagerMock();
    contract.reset();
  });

  it("adds a pool successfully", () => {
    const result = contract.addPool(
      "STPOOL1",
      "strategy1",
      50,
      10,
      "lp",
      "STREWARD1",
      "STDEPOSIT1"
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    expect(contract.state.pools.get(0)?.strategy).toBe("strategy1");
    expect(contract.events).toEqual([{ event: "pool-added", id: 0 }]);
  });

  it("rejects adding pool when paused", () => {
    contract.setPaused(true);
    const result = contract.addPool(
      "STPOOL1",
      "strategy1",
      50,
      10,
      "lp",
      "STREWARD1",
      "STDEPOSIT1"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_PAUSED);
  });

  it("deploys to pool successfully", () => {
    contract.addPool(
      "STPOOL1",
      "strategy1",
      50,
      10,
      "lp",
      "STREWARD1",
      "STDEPOSIT1"
    );
    const result = contract.deployToPool(0, 1000);
    expect(result.ok).toBe(true);
    expect(contract.state.pools.get(0)?.allocatedAmount).toBe(1000);
    expect(contract.state.totalAllocated).toBe(1000);
  });

  it("harvests from pool successfully", () => {
    contract.addPool(
      "STPOOL1",
      "strategy1",
      50,
      10,
      "lp",
      "STREWARD1",
      "STDEPOSIT1"
    );
    contract.mockRewards.set("STPOOL1", 500);
    contract.blockHeight = 200;
    const result = contract.harvestFromPool(0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(500);
    expect(contract.state.pools.get(0)?.lastHarvest).toBe(200);
  });

  it("rebalances pool when apy low", () => {
    contract.addPool(
      "STPOOL1",
      "strategy1",
      50,
      10,
      "lp",
      "STREWARD1",
      "STDEPOSIT1"
    );
    contract.deployToPool(0, 1000);
    contract.mockApy.set("STPOOL1", 3);
    const result = contract.rebalancePool(0);
    expect(result.ok).toBe(true);
    expect(contract.state.pools.get(0)?.active).toBe(false);
    expect(contract.state.totalAllocated).toBe(0);
  });

  it("rejects rebalance when apy sufficient", () => {
    contract.addPool(
      "STPOOL1",
      "strategy1",
      50,
      10,
      "lp",
      "STREWARD1",
      "STDEPOSIT1"
    );
    contract.mockApy.set("STPOOL1", 10);
    const result = contract.rebalancePool(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_REBALANCE_NOT_NEEDED);
  });

  it("removes pool successfully", () => {
    contract.addPool(
      "STPOOL1",
      "strategy1",
      50,
      10,
      "lp",
      "STREWARD1",
      "STDEPOSIT1"
    );
    contract.deployToPool(0, 1000);
    const result = contract.removePool(0);
    expect(result.ok).toBe(true);
    expect(contract.state.pools.get(0)?.active).toBe(false);
    expect(contract.state.totalAllocated).toBe(0);
  });

  it("sets min harvest interval successfully", () => {
    const result = contract.setMinHarvestInterval(200);
    expect(result.ok).toBe(true);
    expect(contract.state.minHarvestInterval).toBe(200);
  });

  it("rejects harvest too soon", () => {
    contract.addPool(
      "STPOOL1",
      "strategy1",
      50,
      10,
      "lp",
      "STREWARD1",
      "STDEPOSIT1"
    );
    contract.mockRewards.set("STPOOL1", 500);
    contract.blockHeight = 100;
    const result = contract.harvestFromPool(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_HARVEST_TOO_SOON);
  });

  it("gets total allocated correctly", () => {
    contract.addPool(
      "STPOOL1",
      "strategy1",
      50,
      10,
      "lp",
      "STREWARD1",
      "STDEPOSIT1"
    );
    contract.deployToPool(0, 1000);
    const result = contract.getTotalAllocated();
    expect(result.value).toBe(1000);
  });

  it("checks pool existence correctly", () => {
    contract.addPool(
      "STPOOL1",
      "strategy1",
      50,
      10,
      "lp",
      "STREWARD1",
      "STDEPOSIT1"
    );
    const result = contract.checkPoolExistence("strategy1");
    expect(result.value).toBe(true);
  });

  it("rejects invalid weight", () => {
    const result = contract.addPool(
      "STPOOL1",
      "strategy1",
      101,
      10,
      "lp",
      "STREWARD1",
      "STDEPOSIT1"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_POOL_WEIGHT);
  });

  it("rejects max pools exceeded", () => {
    contract.setMaxPools(1);
    contract.addPool(
      "STPOOL1",
      "strategy1",
      50,
      10,
      "lp",
      "STREWARD1",
      "STDEPOSIT1"
    );
    const result = contract.addPool(
      "STPOOL2",
      "strategy2",
      50,
      10,
      "lp",
      "STREWARD2",
      "STDEPOSIT2"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_POOLS_EXCEEDED);
  });

  it("rejects deploy with insufficient funds", () => {
    contract.addPool(
      "STPOOL1",
      "strategy1",
      50,
      10,
      "lp",
      "STREWARD1",
      "STDEPOSIT1"
    );
    contract.mockVaultBalance = 500;
    const result = contract.deployToPool(0, 1000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INSUFFICIENT_FUNDS);
  });

  it("parses pool parameters with Clarity types", () => {
    const weight = uintCV(50);
    expect(weight.value).toEqual(BigInt(50));
  });
});