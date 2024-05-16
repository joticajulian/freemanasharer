// SPDX-License-Identifier: MIT

import { System, Storage, Protobuf, authority } from "@koinos/sdk-as";
import { common, token, IToken } from "@koinosbox/contracts";
import { freemanasharer } from "./proto/freemanasharer";

const OWNER_SPACE_ID = 0;
const BALANCES_SPACE_ID = 1;
const PENDING_WITHDRAW_SPACE_ID = 2;
const RC_LIMIT_SPACE_ID = 3;
const KOIN_RESERVED_SPACE_ID = 4;
const RECOMMENDED_MANA_OFFSET_SPACE_ID = 5;

export class Freemanasharer {
  callArgs: System.getArgumentsReturn | null;

  contractId: Uint8Array = System.getContractId();

  owner: Storage.Obj<common.address> = new Storage.Obj(
    this.contractId,
    OWNER_SPACE_ID,
    common.address.decode,
    common.address.encode
  );

  balances: Storage.Map<Uint8Array, token.uint64> = new Storage.Map(
    this.contractId,
    BALANCES_SPACE_ID,
    token.uint64.decode,
    token.uint64.encode,
    () => new token.uint64(0)
  );

  pendingWithdraw: Storage.Map<Uint8Array, token.uint64> = new Storage.Map(
    this.contractId,
    PENDING_WITHDRAW_SPACE_ID,
    token.uint64.decode,
    token.uint64.encode,
    () => new token.uint64(0)
  );

  rcLimit: Storage.Obj<token.uint64> = new Storage.Obj(
    this.contractId,
    RC_LIMIT_SPACE_ID,
    token.uint64.decode,
    token.uint64.encode,
    () => new token.uint64(1000000000)
  );

  koinReserved: Storage.Obj<token.uint64> = new Storage.Obj(
    this.contractId,
    KOIN_RESERVED_SPACE_ID,
    token.uint64.decode,
    token.uint64.encode,
    () => new token.uint64(0)
  );

  recommendedManaOffset: Storage.Obj<token.uint64> = new Storage.Obj(
    this.contractId,
    RECOMMENDED_MANA_OFFSET_SPACE_ID,
    token.uint64.decode,
    token.uint64.encode,
    () => new token.uint64(0)
  );

  formatMana(value: u64): string {
    let mana = `${value}`;
    if (mana.length <= 8) return "0." + "0".repeat(8 - mana.length) + mana;
    if (mana.endsWith("00000000")) return mana.slice(0, mana.length - 8);
    let integer = mana.slice(0, mana.length - 8);
    let decimals = mana.slice(mana.length - 8);
    while (decimals.slice(decimals.length - 1) == "0") {
      decimals = decimals.slice(0, decimals.length - 1);
    }
    return `${integer}.${decimals}`;
  }

  /**
   * @external
   */
  authorize(args: authority.authorize_arguments): authority.authorize_result {
    if (args.type != authority.authorization_type.transaction_application) {
      if (System.checkSystemAuthority()) {
        return new authority.authorize_result(true);
      }
      System.fail("freemanasharer only authorizes transaction_application");
    }

    const availableMana = this.getAvailableMana();
    const txRcLimit =
      System.getTransactionField("header.rc_limit")!.uint64_value;
    if (availableMana < txRcLimit) {
      System.fail("no mana available in the free manasharer service");
    }
    const rcLimit = this.rcLimit.get()!.value;
    if (txRcLimit > rcLimit) {
      System.fail(
        `set max mana to a value inferior to ${this.formatMana(rcLimit)}`
      );
    }
    return new authority.authorize_result(true);
  }

  /**
   * Get balance of an account
   * @external
   * @readonly
   */
  balance_of(args: token.balance_of_args): token.uint64 {
    return this.balances.get(args.owner!)!;
  }

  /**
   * Get pending balance to withdraw of an account
   * @external
   * @readonly
   */
  pending_withdraw_of(args: token.balance_of_args): token.uint64 {
    return this.pendingWithdraw.get(args.owner!)!;
  }

  getAvailableMana(): u64 {
    const mana = System.getAccountRC(this.contractId);
    const koinReserved = this.koinReserved.get()!.value;
    const availableMana = mana <= koinReserved ? 0 : mana - koinReserved;
    return availableMana;
  }

  /**
   * Get available mana and balance
   * @external
   * @readonly
   */
  get_status(): freemanasharer.info {
    const mana = System.getAccountRC(this.contractId);
    const koinReserved = this.koinReserved.get()!.value;
    const availableMana = mana <= koinReserved ? 0 : mana - koinReserved;
    const koin = new IToken(System.getContractAddress("koin"));
    const koinBalance = koin.balance_of(
      new token.balance_of_args(this.contractId)
    ).value;
    const availableBalance = koinBalance - koinReserved;
    const recommendedManaOffset = this.recommendedManaOffset.get()!.value;
    return new freemanasharer.info(
      mana,
      koinBalance,
      koinReserved,
      availableMana,
      availableBalance,
      recommendedManaOffset,
    );
  }

  /**
   * Get RC Limit allowed
   * @external
   * @readonly
   */
  get_rc_limit(): token.uint64 {
    return this.rcLimit.get()!;
  }

  /**
   * Get owner
   * @external
   * @readonly
   */
  get_owner(): common.address {
    const owner = this.owner.get();
    System.require(owner, "no owner");
    return owner!;
  }

  /**
   * Set rc limit
   * @external
   */
  set_rc_limit(args: token.uint64): void {
    const owner = this.owner.get();
    System.require(owner, "no owner defined");
    const isAuthorized = System.checkAuthority(
      authority.authorization_type.contract_call,
      owner!.value!
    );
    System.require(isAuthorized, "not authorized by the owner");
    this.rcLimit.put(args);
  }

  /**
   * Set recommended mana offset
   * @external
   */
  set_recommended_mana_offset(args: token.uint64): void {
    const owner = this.owner.get();
    System.require(owner, "no owner defined");
    const isAuthorized = System.checkAuthority(
      authority.authorization_type.contract_call,
      owner!.value!
    );
    System.require(isAuthorized, "not authorized by the owner");
    this.recommendedManaOffset.put(args);
  }

  /**
   * Set owner
   * @external
   */
  set_owner(args: common.address): void {
    System.require(
      !!args.value && args.value!.length > 0,
      "new owner must be defined"
    );
    const owner = this.owner.get();
    if (owner) {
      const isAuthorized = System.checkAuthority(
        authority.authorization_type.contract_call,
        owner.value!
      );
      System.require(isAuthorized, "not authorized by the owner");
    }
    this.owner.put(args);
  }

  /**
   * Deposit KOIN
   * @external
   * @event deposit token.mint_args
   */
  deposit(args: token.mint_args): void {
    const owner = this.owner.get();
    System.require(owner, "no owner defined");
    const koin = new IToken(System.getContractAddress("koin"));
    koin.transfer(
      new token.transfer_args(args.to!, this.contractId, args.value)
    );
    const balance = this.balances.get(args.to!)!;
    balance.value += args.value;
    this.balances.put(args.to!, balance);

    const impacted = [args.to!];
    System.event(
      "deposit",
      Protobuf.encode<token.mint_args>(args, token.mint_args.encode),
      impacted
    );
  }

  /**
   * Stop the consumption of mana of your KOIN to
   * prepare the withdrawal of them (you can skip this
   * function and call withdraw directly if the contract
   * has enough mana)
   * @external
   * @event prepare_withdraw token.mint_args
   */
  prepare_withdraw(args: token.mint_args): void {
    const isAuthorized = System.checkAuthority(
      authority.authorization_type.contract_call,
      args.to!
    );
    System.require(isAuthorized, "prepare withdraw not authorized");
    const balance = this.balances.get(args.to!)!;
    System.require(balance.value >= args.value, "not enough balance");

    // update pending (remove the previous value and set new one)
    const pendingWithdraw = this.pendingWithdraw.get(args.to!)!;
    const koinReserved = this.koinReserved.get()!;
    const deltaPendingWithdraw = args.value - pendingWithdraw.value;
    koinReserved.value += deltaPendingWithdraw;
    pendingWithdraw.value += deltaPendingWithdraw;

    // save data
    this.pendingWithdraw.put(args.to!, pendingWithdraw);
    this.koinReserved.put(koinReserved);

    System.event(
      "prepare_withdraw",
      Protobuf.encode<token.mint_args>(args, token.mint_args.encode),
      [args.to!]
    );
  }

  /**
   * Withdraw KOIN
   * @external
   * @event withdraw token.mint_args
   */
  withdraw(args: token.mint_args): void {
    const isAuthorized = System.checkAuthority(
      authority.authorization_type.contract_call,
      args.to!
    );
    System.require(isAuthorized, "withdraw not authorized");
    const balance = this.balances.get(args.to!)!;
    System.require(balance.value >= args.value, "not enough balance");

    // make the transfer
    const koin = new IToken(System.getContractAddress("koin"));
    koin.transfer(
      new token.transfer_args(this.contractId, args.to!, args.value)
    );

    // update balance
    balance.value -= args.value;
    this.balances.put(args.to!, balance);

    // update pending
    const koinReserved = this.koinReserved.get()!;
    const pendingWithdraw = this.pendingWithdraw.get(args.to!)!;
    const deltaPendingWithdraw =
      pendingWithdraw.value >= args.value ? args.value : pendingWithdraw.value;
    koinReserved.value -= deltaPendingWithdraw;
    pendingWithdraw.value -= deltaPendingWithdraw;

    // save data
    this.pendingWithdraw.put(args.to!, pendingWithdraw);
    this.koinReserved.put(koinReserved);

    System.event(
      "withdraw",
      Protobuf.encode<token.mint_args>(args, token.mint_args.encode),
      [args.to!]
    );
  }
}
