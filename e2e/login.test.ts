import assert from "node:assert/strict";
import { before, test } from "node:test";
import { CallData, RpcProvider, cairo, logger } from "starknet";
import { finishLogin, sessionAccount, type LoginConfig } from "../src/index.ts";
import { fixture } from "../test/fixture.ts";
import "../test/storage.ts";
import { need, waitFor } from "./helpers.ts";

logger.setLogLevel("ERROR");

// Starknet's fee token, same address on every network
const STRK =
  "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

const provider = new RpcProvider({ nodeUrl: need("RPC_URL") });
const config: LoginConfig = {
  clientId: fixture.aud,
  redirectUri: "",
  deployment: {
    registry: need("REGISTRY"),
    verifier: need("VERIFIER"),
    accountClassHash: need("ACCOUNT_CLASS_HASH"),
  },
  serverUrl: `http://127.0.0.1:${need("PORT")}`,
};

// The server loads the circuit before it listens
before(() =>
  waitFor(`the server at ${config.serverUrl}`, () => fetch(config.serverUrl)),
);

test("a login, then a transfer, deploys the account and registers the session key", async () => {
  const session = await finishLogin(
    {
      jwt: fixture.jwt,
      session: {
        privateKey: fixture.session_privkey,
        publicKey: BigInt(fixture.session_pubkey),
      },
      expiry: BigInt(fixture.expiry),
      secret: BigInt(fixture.secret),
    },
    config,
  );

  const { transaction_hash } = await sessionAccount(
    provider,
    session,
    config,
  ).execute({
    contractAddress: STRK,
    entrypoint: "transfer",
    calldata: CallData.compile([session.address, cairo.uint256(1)]),
  });
  const receipt = await provider.waitForTransaction(transaction_hash);

  assert.ok(receipt.isSuccess(), "the transfer reverted");
  const [expiry] = await provider.callContract({
    contractAddress: session.address,
    entrypoint: "get_session_expiry",
    calldata: [fixture.session_pubkey],
  });
  assert.equal(BigInt(expiry!), BigInt(fixture.expiry));
});
