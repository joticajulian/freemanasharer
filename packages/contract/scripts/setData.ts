/**
 * Script to mint tokens
 */
import crypto from "crypto";
import { Signer, Contract, Provider } from "koilib";
import * as dotenv from "dotenv";
import { TransactionJson, TransactionOptions } from "koilib/lib/interface";
import abi from "../src/build/___CONTRACT_ABI_FILE___";
import koinosConfig from "../src/koinos.config.js";

dotenv.config();
if (!["true", "false"].includes(process.env.USE_FREE_MANA))
  throw new Error(`The env var USE_FREE_MANA must be true or false`);
const useFreeMana = process.env.USE_FREE_MANA === "true";
const [inputNetworkName] = process.argv.slice(2);

async function main() {
  const networkName = inputNetworkName || "harbinger";
  const network = koinosConfig.networks[networkName];
  if (!network) throw new Error(`network ${networkName} not found`);
  const provider = new Provider(network.rpcNodes);

  const signer = new Signer({
    privateKey: crypto.randomBytes(32).toString("hex"),
    provider,
  });

  if (!network.accounts.contract.privateKeyWif) {
    throw new Error(
      `no private key defined for the contract in ${networkName}`,
    );
  }
  const contractAccount = Signer.fromWif(
    network.accounts.contract.privateKeyWif,
  );

  const contract = new Contract({
    id: contractAccount.address,
    signer,
    provider,
    abi,
  });

  const rcLimit = "2000000000";
  let txOptions: TransactionOptions;
  if (useFreeMana) {
    txOptions = {
      payer: network.accounts.freeManaSharer.id,
      payee: signer.address,
      rcLimit,
    };
  } else {
    if (!network.accounts.manaSharer.privateKeyWif) {
      throw new Error(
        `no private key defined for the manaSharer in ${networkName}`,
      );
    }
    const manaSharer = Signer.fromWif(
      network.accounts.manaSharer.privateKeyWif,
    );
    manaSharer.provider = provider;
    txOptions = {
      payer: manaSharer.address,
      payee: signer.address,
      rcLimit,
      beforeSend: async (tx: TransactionJson) => {
        await manaSharer.signTransaction(tx);
      },
    };
  }

  const { transaction, receipt } = await contract.functions.set_data_of(
    {
      account: signer.address,
      data: {
        name: "my name",
        value: "123",
      },
    },
    txOptions,
  );

  console.log("Transaction submitted");
  console.log(`Data set for ${signer.address}`);
  console.log(
    `consumption: ${(Number(receipt!.rc_used) / 1e8).toFixed(2)} mana`,
  );
  const { blockNumber } = await transaction!.wait("byBlock", 60000);
  console.log(`mined in block ${blockNumber} (${networkName})`);
}

main()
  .then(() => {})
  .catch((error) => console.error(error));
