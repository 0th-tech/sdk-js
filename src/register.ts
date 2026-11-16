import { RpcError, type RpcProvider } from "starknet";
import { prove, relay } from "./server.ts";
import {
  pendingRegistration,
  setRegistration,
  type Registration,
} from "./session.ts";

export type Step = "proof" | "relay";
export type OnStep = (step: Step, ms: number) => void;

// Requests in flight, so a transaction reuses the proof the login started
let proving: { publicKey: string; proof: Promise<string[]> } | undefined;
let registering: { publicKey: string; done: Promise<void> } | undefined;

// Asks the server for the proof of a login and stores it in place of the letter
export function proveSession(
  serverUrl: string,
  registration: Registration,
  onStep?: OnStep,
): Promise<string[]> {
  if ("proof" in registration) return Promise.resolve(registration.proof);

  const { publicKey, identity, jwt, expiry, secret } = registration;
  if (proving?.publicKey !== publicKey) {
    const since = performance.now();
    const proof = prove(serverUrl, { jwt, publicKey, expiry, secret }).then(
      (proved) => {
        // Catches this package and the circuit disagreeing on how an identity is built
        if (BigInt(proved.identity) !== BigInt(identity))
          throw new Error(
            `identity_hash differs: computed ${identity}, proved ${proved.identity}`,
          );
        setRegistration(publicKey, {
          publicKey,
          identity,
          proof: proved.proof,
        });
        onStep?.("proof", performance.now() - since);
        return proved.proof;
      },
    );
    proving = { publicKey, proof };
    // A failed request is forgotten, so the next caller asks again
    proof.catch(() => {
      if (proving?.proof === proof) proving = undefined;
    });
  }
  return proving.proof;
}

// An account that is not deployed has registered no key
async function isRegistered(
  provider: RpcProvider,
  address: string,
  publicKey: string,
) {
  const expiry = await provider
    .callContract({
      contractAddress: address,
      entrypoint: "get_session_expiry",
      calldata: [publicKey],
    })
    .catch((e) => {
      if (e instanceof RpcError && e.isType("CONTRACT_NOT_FOUND"))
        return undefined;
      throw e;
    });
  return BigInt(expiry?.[0] ?? 0) * 1000n > BigInt(Date.now());
}

async function register(
  provider: RpcProvider,
  address: string,
  serverUrl: string,
  registration: Registration,
  onStep?: OnStep,
) {
  const { publicKey, identity } = registration;
  // A relay sent before a reload may have registered the key already
  if (!(await isRegistered(provider, address, publicKey))) {
    const proof = await proveSession(serverUrl, registration, onStep);

    const since = performance.now();
    const relayed = await relay(serverUrl, identity, proof);
    // The relayer cannot choose the address, it follows from the class hash and constructor data
    if (BigInt(relayed.address) !== BigInt(address))
      throw new Error(`relayer deployed ${relayed.address}, not ${address}`);

    // The dapp's node can lag behind the relayer's and refuse a transaction until it sees the key
    let tries = 0;
    while (!(await isRegistered(provider, address, publicKey))) {
      if (++tries === 20)
        throw new Error("the session key is relayed, but this node lacks it");
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    onStep?.("relay", performance.now() - since);
  }
  setRegistration(publicKey);
}

// Deploys the account and registers the stored session key, once, paid by the relayer
export function registerSession(
  provider: RpcProvider,
  address: string,
  serverUrl: string,
  onStep?: OnStep,
): Promise<void> {
  const registration = pendingRegistration();
  if (!registration) return Promise.resolve();

  const { publicKey } = registration;
  if (registering?.publicKey !== publicKey) {
    const done = register(provider, address, serverUrl, registration, onStep);
    registering = { publicKey, done };
    // Once settled, the next transaction reads the stored state again
    const forget = () => {
      if (registering?.done === done) registering = undefined;
    };
    done.then(forget, forget);
  }
  return registering.done;
}
