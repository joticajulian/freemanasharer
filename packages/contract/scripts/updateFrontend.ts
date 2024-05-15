/**
 * Script to update constants and abi in the frontend
 */
import { Signer } from "koilib";
import fs from "fs";
import path from "path";
import abi from "../src/build/freemanasharer-abi.json";
import koinosConfig from "../src/koinos.config.js";

const [inputNetworkName] = process.argv.slice(2);

async function main() {
  const networkName = inputNetworkName || "harbinger";
  const network = koinosConfig.networks[networkName];
  if (!network) throw new Error(`network ${networkName} not found`);

  if (!network.accounts.contract.privateKeyWif) {
    throw new Error(
      `no private key defined for the contract in ${networkName}`
    );
  }
  const contractAccount = Signer.fromWif(
    network.accounts.contract.privateKeyWif
  );

  const constantsFile = path.join(
    __dirname,
    "../../website/src/koinos/constants.ts"
  );
  if (fs.existsSync(constantsFile)) {
    const data = fs.readFileSync(constantsFile, "utf8");
    const newData = data
      .split("\n")
      .map((line) => {
        if (line.startsWith("export const CONTRACT_ID = ")) {
          return `export const CONTRACT_ID = "${contractAccount.address}";`;
        }
        if (line.startsWith("export const RPC_NODE = ")) {
          return `export const RPC_NODE = "${network.rpcNodes[0]}";`;
        }
        if (line.startsWith("export const NETWORK_NAME = ")) {
          return `export const NETWORK_NAME = "${networkName}";`;
        }
        if (line.startsWith("export const BLOCK_EXPLORER = ")) {
          const blockExplorer =
            networkName === "harbinger"
              ? "https://harbinger.koinosblocks.com"
              : "https://koinosblocks.com";
          return `export const BLOCK_EXPLORER = "${blockExplorer}";`;
        }
        return line;
      })
      .join("\n");
    fs.writeFileSync(constantsFile, newData);
    console.log(`constants updated in the frontend for ${networkName}`);
  } else {
    console.log(`file '${constantsFile}' was not found`);
  }

  const data = `export default ${JSON.stringify(abi, null, 2)}`;
  const abiFile = path.join(__dirname, "../../website/src/koinos/abi.ts");
  fs.writeFileSync(abiFile, data);
  console.log("abi updated in the frontend");
}

main()
  .then(() => {})
  .catch((error) => console.error(error));
