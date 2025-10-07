import { describe, it, expect, beforeEach } from "vitest";
import { ClarityValue, cvToValue, uintCV } from "@stacks/transactions";

const ERR_NOT_ADMIN = 1000;
const ERR_INSUFFICIENT_BALANCE = 1001;
const ERR_INVALID_AMOUNT = 1002;
const ERR_PAUSED = 1003;
const ERR_NOT_PAUSED = 1004;
const ERR_INVALID_REDEEM = 1005;
const ERR_INVALID_ADMIN = 1006;
const ERR_MAX_DEPOSIT_EXCEEDED = 1007;
const ERR_MIN_DEPOSIT_NOT_MET = 1008;
const ERR_INVALID_FEE = 1009;
const ERR_INVALID_ORACLE = 1011;
const ERR_NOT_AUTHORIZED = 1016;

interface VaultInfo {
  admin: string;
  paused: boolean;
  totalDeposits: number;
  maxDeposit: number;
  minDeposit: number;
  depositFee: number;
  redeemFee: number;
  lastUpdate: number;
  yieldAccumulator: number;
  decimals: number;
  currency: string;
  status: boolean;
}

interface Result<T> {
  ok: boolean;
  value: T | number;
}

class StablecoinMock {
  balances: Map<string, number> = new Map();
  approvals: Map<string, Map<string, number>> = new Map();

  transfer(amount: number, from: string, to: string): Result<boolean> {
    const fromBal = this.balances.get(from) || 0;
    if (fromBal < amount) return { ok: false, value: ERR_INSUFFICIENT_BALANCE };
    this.balances.set(from, fromBal - amount);
    const toBal = this.balances.get(to) || 0;
    this.balances.set(to, toBal + amount);
    return { ok: true, value: true };
  }

  getBalance(who: string): Result<number> {
    return { ok: true, value: this.balances.get(who) || 0 };
  }

  approve(amount: number, spender: string): Result<boolean> {
    const caller = "ST1TEST";
    let approvals = this.approvals.get(caller) || new Map();
    approvals.set(spender, amount);
    this.approvals.set(caller, approvals);
    return { ok: true, value: true };
  }
}

class VaultMock {
  state: {
    admin: string;
    paused: boolean;
    totalDeposits: number;
    maxDeposit: number;
    minDeposit: number;
    depositFee: number;
    redeemFee: number;
    lastUpdate: number;
    oracleContract: string | null;
    yieldAccumulator: number;
    decimals: number;
    currency: string;
    status: boolean;
    userDeposits: Map<string, number>;
    userShares: Map<string, number>;
    vaultUpdates: Map<number, { timestamp: number; updater: string; changeType: string }>;
  } = {
    admin: "ST1TEST",
    paused: false,
    totalDeposits: 0,
    maxDeposit: 1000000000000,
    minDeposit: 100,
    depositFee: 0,
    redeemFee: 0,
    lastUpdate: 0,
    oracleContract: null,
    yieldAccumulator: 0,
    decimals: 6,
    currency: "USD",
    status: true,
    userDeposits: new Map(),
    userShares: new Map(),
    vaultUpdates: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  contractPrincipal: string = "STVAULT";
  events: Array<{ event: string; [key: string]: any }> = [];
  updateId: number = 0;

  reset() {
    this.state = {
      admin: "ST1TEST",
      paused: false,
      totalDeposits: 0,
      maxDeposit: 1000000000000,
      minDeposit: 100,
      depositFee: 0,
      redeemFee: 0,
      lastUpdate: 0,
      oracleContract: null,
      yieldAccumulator: 0,
      decimals: 6,
      currency: "USD",
      status: true,
      userDeposits: new Map(),
      userShares: new Map(),
      vaultUpdates: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.events = [];
    this.updateId = 0;
  }

  getVaultInfo(): VaultInfo {
    return {
      admin: this.state.admin,
      paused: this.state.paused,
      totalDeposits: this.state.totalDeposits,
      maxDeposit: this.state.maxDeposit,
      minDeposit: this.state.minDeposit,
      depositFee: this.state.depositFee,
      redeemFee: this.state.redeemFee,
      lastUpdate: this.state.lastUpdate,
      yieldAccumulator: this.state.yieldAccumulator,
      decimals: this.state.decimals,
      currency: this.state.currency,
      status: this.state.status,
    };
  }

  getUserDeposit(user: string): number | null {
    return this.state.userDeposits.get(user) || null;
  }

  getUserShares(user: string): number | null {
    return this.state.userShares.get(user) || null;
  }

  isAdmin(who: string): boolean {
    return who === this.state.admin;
  }

  setAdmin(newAdmin: string): Result<boolean> {
    if (!this.isAdmin(this.caller)) return { ok: false, value: ERR_NOT_ADMIN };
    this.state.admin = newAdmin;
    return { ok: true, value: true };
  }

  setPaused(newPaused: boolean): Result<boolean> {
    if (!this.isAdmin(this.caller)) return { ok: false, value: ERR_NOT_ADMIN };
    this.state.paused = newPaused;
    return { ok: true, value: true };
  }

  setMaxDeposit(newMax: number): Result<boolean> {
    if (!this.isAdmin(this.caller)) return { ok: false, value: ERR_NOT_ADMIN };
    if (newMax <= 0) return { ok: false, value: ERR_INVALID_AMOUNT };
    this.state.maxDeposit = newMax;
    return { ok: true, value: true };
  }

  setMinDeposit(newMin: number): Result<boolean> {
    if (!this.isAdmin(this.caller)) return { ok: false, value: ERR_NOT_ADMIN };
    if (newMin <= 0) return { ok: false, value: ERR_INVALID_AMOUNT };
    this.state.minDeposit = newMin;
    return { ok: true, value: true };
  }

  setDepositFee(newFee: number): Result<boolean> {
    if (!this.isAdmin(this.caller)) return { ok: false, value: ERR_NOT_ADMIN };
    if (newFee > 500) return { ok: false, value: ERR_INVALID_FEE };
    this.state.depositFee = newFee;
    return { ok: true, value: true };
  }

  setRedeemFee(newFee: number): Result<boolean> {
    if (!this.isAdmin(this.caller)) return { ok: false, value: ERR_NOT_ADMIN };
    if (newFee > 500) return { ok: false, value: ERR_INVALID_FEE };
    this.state.redeemFee = newFee;
    return { ok: true, value: true };
  }

  setOracle(newOracle: string): Result<boolean> {
    if (!this.isAdmin(this.caller)) return { ok: false, value: ERR_NOT_ADMIN };
    this.state.oracleContract = newOracle;
    return { ok: true, value: true };
  }

  updateYield(newYield: number): Result<boolean> {
    if (this.state.oracleContract === null) return { ok: false, value: ERR_INVALID_ORACLE };
    if (this.caller !== this.state.oracleContract) return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.yieldAccumulator += newYield;
    this.state.lastUpdate = this.blockHeight;
    return { ok: true, value: true };
  }

  deposit(amount: number, stable: StablecoinMock): Result<number> {
    const user = this.caller;
    if (this.state.paused) return { ok: false, value: ERR_PAUSED };
    if (amount <= 0 || amount > this.state.maxDeposit) return { ok: false, value: ERR_INVALID_AMOUNT };
    if (amount < this.state.minDeposit) return { ok: false, value: ERR_MIN_DEPOSIT_NOT_MET };
    const userBal = stable.getBalance(user).value as number;
    if (userBal < amount) return { ok: false, value: ERR_INSUFFICIENT_BALANCE };
    const feeAmount = Math.floor((amount * this.state.depositFee) / 10000);
    const netAmount = amount - feeAmount;
    const currentDeposit = this.state.userDeposits.get(user) || 0;
    const totalShares = this.state.totalDeposits > 0 ? this.state.totalDeposits : 1;
    const shares = Math.floor((netAmount * totalShares) / (this.state.totalDeposits || 1)) || netAmount;
    stable.transfer(amount, user, this.contractPrincipal);
    if (feeAmount > 0) {
      stable.transfer(feeAmount, this.contractPrincipal, this.state.admin);
    }
    this.state.userDeposits.set(user, currentDeposit + netAmount);
    this.state.userShares.set(user, (this.state.userShares.get(user) || 0) + shares);
    this.state.totalDeposits += netAmount;
    this.events.push({ event: "deposit", user, amount, net: netAmount, shares });
    this.state.vaultUpdates.set(this.updateId++, {
      timestamp: this.blockHeight,
      updater: user,
      changeType: "deposit",
    });
    return { ok: true, value: netAmount };
  }

  redeem(shares: number, stable: StablecoinMock): Result<number> {
    const user = this.caller;
    if (this.state.paused) return { ok: false, value: ERR_PAUSED };
    const currentShares = this.state.userShares.get(user) || 0;
    if (currentShares < shares) return { ok: false, value: ERR_INVALID_REDEEM };
    const totalShares = this.state.totalDeposits > 0 ? this.state.totalDeposits : 1;
    const amount = Math.floor((shares * this.state.totalDeposits) / totalShares);
    const feeAmount = Math.floor((amount * this.state.redeemFee) / 10000);
    const netAmount = amount - feeAmount;
    const accruedYield = Math.floor((shares * this.state.yieldAccumulator) / totalShares);
    const totalOut = netAmount + accruedYield;
    this.state.userShares.set(user, currentShares - shares);
    this.state.userDeposits.set(user, (this.state.userDeposits.get(user) || 0) - amount);
    this.state.totalDeposits -= amount;
    stable.transfer(totalOut, this.contractPrincipal, user);
    if (feeAmount > 0) {
      stable.transfer(feeAmount, this.contractPrincipal, this.state.admin);
    }
    this.events.push({ event: "redeem", user, shares, amount: totalOut });
    this.state.vaultUpdates.set(this.updateId++, {
      timestamp: this.blockHeight,
      updater: user,
      changeType: "redeem",
    });
    return { ok: true, value: totalOut };
  }

  emergencyWithdraw(stable: StablecoinMock): Result<number> {
    if (!this.isAdmin(this.caller)) return { ok: false, value: ERR_NOT_ADMIN };
    if (!this.state.paused) return { ok: false, value: ERR_NOT_PAUSED };
    const balance = stable.getBalance(this.contractPrincipal).value as number;
    stable.transfer(balance, this.contractPrincipal, this.state.admin);
    this.state.totalDeposits = 0;
    this.state.vaultUpdates.set(this.updateId++, {
      timestamp: this.blockHeight,
      updater: this.caller,
      changeType: "emergency-withdraw",
    });
    this.events.push({ event: "emergency-withdraw", amount: balance });
    return { ok: true, value: balance };
  }
}

describe("VaultContract", () => {
  let vault: VaultMock;
  let stable: StablecoinMock;

  beforeEach(() => {
    vault = new VaultMock();
    stable = new StablecoinMock();
    vault.reset();
    stable.balances.set("ST1TEST", 1000000);
  });

  it("deposits successfully", () => {
    const result = vault.deposit(1000, stable);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(1000);
    expect(vault.state.totalDeposits).toBe(1000);
    expect(vault.getUserDeposit("ST1TEST")).toBe(1000);
    expect(stable.balances.get("STVAULT")).toBe(1000);
  });

  it("rejects deposit when paused", () => {
    vault.setPaused(true);
    const result = vault.deposit(1000, stable);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_PAUSED);
  });

  it("rejects invalid deposit amount", () => {
    const result = vault.deposit(0, stable);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_AMOUNT);
  });

  it("redeems successfully", () => {
    vault.deposit(1000, stable);
    const result = vault.redeem(1000, stable);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(1000);
    expect(vault.state.totalDeposits).toBe(0);
    expect(stable.balances.get("ST1TEST")).toBe(1000000);
  });

  it("rejects redeem when paused", () => {
    vault.deposit(1000, stable);
    vault.setPaused(true);
    const result = vault.redeem(1000, stable);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_PAUSED);
  });

  it("applies redeem fee and yield", () => {
    vault.deposit(1000, stable);
    vault.setRedeemFee(100);
    vault.setOracle("STORACLE");
    vault.caller = "STORACLE";
    vault.updateYield(100);
    vault.caller = "ST1TEST";
    const result = vault.redeem(1000, stable);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(1090);
  });

  it("rejects emergency withdraw when not paused", () => {
    vault.deposit(1000, stable);
    const result = vault.emergencyWithdraw(stable);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_PAUSED);
  });

  it("sets admin successfully", () => {
    const result = vault.setAdmin("STNEWADMIN");
    expect(result.ok).toBe(true);
    expect(vault.state.admin).toBe("STNEWADMIN");
  });

  it("rejects set admin by non-admin", () => {
    vault.caller = "STFAKE";
    const result = vault.setAdmin("STNEWADMIN");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_ADMIN);
  });

  it("updates yield successfully", () => {
    vault.setOracle("STORACLE");
    vault.caller = "STORACLE";
    const result = vault.updateYield(100);
    expect(result.ok).toBe(true);
    expect(vault.state.yieldAccumulator).toBe(100);
  });

  it("rejects yield update by non-oracle", () => {
    vault.setOracle("STORACLE");
    const result = vault.updateYield(100);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("gets vault info correctly", () => {
    const info = vault.getVaultInfo();
    expect(info.admin).toBe("ST1TEST");
    expect(info.totalDeposits).toBe(0);
    expect(info.currency).toBe("USD");
  });

  it("parses clarity values", () => {
    const amountCV = uintCV(1000);
    expect(cvToValue(amountCV as ClarityValue)).toBe(1000n);
  });
});