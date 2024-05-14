// SPDX-License-Identifier: MIT

import { System, Storage, Base58, Protobuf, authority } from "@koinos/sdk-as";
import { common } from "@koinosbox/contracts";
import { freemanasharer } from "./proto/freemanasharer";

const MY_VALUE_SPACE_ID = 1;
const USER_DATA_SPACE_ID = 2;

export class Freemanasharer {
  callArgs: System.getArgumentsReturn | null;

  contractId: Uint8Array = System.getContractId();

  /**
   * Use the Storage class to define objects to save
   * in the storage of the contract
   */
  myValue: Storage.Obj<common.str> = new Storage.Obj(
    this.contractId,
    MY_VALUE_SPACE_ID,
    common.str.decode,
    common.str.encode,
    () => new common.str("default value"),
  );

  /**
   * For maps use Storage.Map, for instance, to store
   * user balances
   */
  userData: Storage.Map<Uint8Array, freemanasharer.userdata> =
    new Storage.Map(
      this.contractId,
      USER_DATA_SPACE_ID,
      freemanasharer.userdata.decode,
      freemanasharer.userdata.encode,
      () => new freemanasharer.userdata(),
    );

  /**
   * Get my value
   * @external
   * @readonly
   */
  get_my_value(): common.str {
    return this.myValue.get()!;
  }

  /**
   * Get user data
   * @external
   * @readonly
   */
  data_of(args: common.address): freemanasharer.userdata {
    return this.userData.get(args.value!)!;
  }

  /**
   * Set my value
   * @external
   * @event my_value_event common.str
   */
  set_my_value(args: common.str): void {
    this.myValue.put(args);

    System.event(
      "set_my_value",
      Protobuf.encode<common.str>(args, common.str.encode),
      [],
    );
  }

  /**
   * Set user data
   * @external
   * @event data_updated userdata_args
   */
  set_data_of(args: freemanasharer.userdata_args): void {
    // Check if the account authorized this transaction
    const isAuthorized = System.checkAuthority(
      authority.authorization_type.contract_call,
      args.account!,
    );
    System.require(
      isAuthorized,
      `not authorized by ${Base58.encode(args.account!)}`,
    );

    // update data in the storage
    this.userData.put(args.account!, args.data!);

    System.event(
      "set_data_of",
      Protobuf.encode<freemanasharer.userdata_args>(
        args,
        freemanasharer.userdata_args.encode,
      ),
      [args.account!],
    );
  }
}
