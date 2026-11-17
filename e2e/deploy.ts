import { readFileSync, writeFileSync } from "node:fs";
import { Account, CallData, RpcProvider, logger } from "starknet";
import { fixture } from "../test/fixture.ts";
import { need, waitFor } from "./helpers.ts";

logger.setLogLevel("ERROR");

const RPC_URL = need("RPC_URL");
const DAY = 24 * 3600;

const provider = new RpcProvider({ nodeUrl: RPC_URL });

const devnet = async (method: string, params: object = {}) => {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const { result, error } = await res.json();
  if (error) throw new Error(`${method}: ${JSON.stringify(error)}`);
  return result;
};

const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));

// A release's compiled class, Sierra and CASM
const contract = (name: string) => ({
  contract: read(`target/contracts/${name}.contract_class.json`),
  casm: read(`target/contracts/${name}.compiled_contract_class.json`),
});

await waitFor(`devnet at ${RPC_URL}`, () => provider.getChainId());

// The fixture session ends at a fixed date, and the account refuses a session ending more than 30
// days after the block's time
await devnet("devnet_setTime", {
  time: Number(fixture.expiry) - DAY,
  generate_block: true,
});

const [admin, relayer] = (await devnet("devnet_getPredeployedAccounts")) as {
  address: string;
  private_key: string;
}[];
const deployer = new Account({
  provider,
  address: admin!.address,
  signer: admin!.private_key,
});

const verifier = await deployer.declareAndDeploy(
  contract("verifier_UltraKeccakZKHonkVerifier"),
);
const registry = await deployer.declareAndDeploy({
  ...contract("registry_Registry"),
  constructorCalldata: [deployer.address],
});
const account = await deployer.declareIfNot(contract("account_Account"));

// The registry takes the test key that signed the fixture letter, as it takes Google's
const { transaction_hash } = await deployer.execute({
  contractAddress: registry.deploy.contract_address,
  entrypoint: "renew_key",
  calldata: CallData.compile([
    fixture.pubkey_modulus_limbs.length,
    ...fixture.pubkey_modulus_limbs.flatMap((limb) => [limb, 0]),
  ]),
});
await provider.waitForTransaction(transaction_hash);

// The server's environment: the fixture's dapp and test key, and the contracts deployed above
const kid = JSON.parse(
  Buffer.from(fixture.jwt.split(".")[0]!, "base64url").toString(),
).kid;
const keys = { keys: [{ ...fixture.jwk, kid, alg: "RS256", use: "sig" }] };
const env = {
  RPC_URL,
  PORT: need("PORT"),
  SEED: "e2e",
  GOOGLE_CLIENT_ID: fixture.aud,
  JWKS_URL: `data:application/json,${encodeURIComponent(JSON.stringify(keys))}`,
  DEVNET: 1,
  RELAYER_ACCOUNT: relayer!.address,
  RELAYER_PRIVATE_KEY: relayer!.private_key,
  REGISTRY: registry.deploy.contract_address,
  VERIFIER: verifier.deploy.contract_address,
  ACCOUNT_CLASS_HASH: account.class_hash,
};
writeFileSync(
  "target/e2e.env",
  Object.entries(env)
    .map(([name, value]) => `${name}=${value}\n`)
    .join(""),
);
