import { accountAddress, type Deployment } from "./account.ts";
import {
  googleKey,
  type PendingLogin,
  readGoogleAnswer,
  redirectToGoogle,
} from "./google.ts";
import {
  claims,
  identityHash,
  loginNonce,
  newSessionKey,
  randomSecret,
} from "./identity.ts";
import { type Circuit, type ProofStep, proveLogin } from "./proof.ts";
import { fetchSalt, relay } from "./server.ts";
import { type StoredSession, storeSession } from "./session.ts";

const DAY = 24 * 3600;
const MAX_SESSION_LENGTH = 30 * DAY;

export type Step = ProofStep | "relay";

export type LoginConfig = {
  // The dapp's client id at the provider. Public, no secret in this flow
  clientId: string;
  // Must match what is registered, byte for byte, trailing slash included
  redirectUri: string;
  deployment: Deployment;
  serverUrl: string;
  circuit: Circuit;
  // Seconds a session key stays valid, a day by default
  sessionLength?: number;
};

export function startLogin({
  clientId,
  redirectUri,
  sessionLength = DAY,
}: LoginConfig) {
  if (!(sessionLength > 0 && sessionLength < MAX_SESSION_LENGTH))
    throw new Error("sessionLength must be above 0 and under 30 days");

  const session = newSessionKey();
  const expiry = BigInt(Math.floor(Date.now() / 1000 + sessionLength));
  const secret = randomSecret();
  redirectToGoogle(
    clientId,
    redirectUri,
    loginNonce(session.publicKey, expiry, secret),
    { session, expiry, secret },
  );
}

// The letter the provider left in the URL, or undefined on an ordinary page load
export const pendingLogin = readGoogleAnswer;

export async function finishLogin(
  { jwt, session, expiry, secret }: PendingLogin,
  { clientId, deployment, serverUrl, circuit }: LoginConfig,
  onStep?: (step: Step, ms: number) => void,
): Promise<StoredSession> {
  // Checked up front so a bad letter fails before spending time on a proof
  const { aud, sub } = claims(
    jwt,
    clientId,
    loginNonce(session.publicKey, expiry, secret),
  );

  const [providerKey, salt] = await Promise.all([
    googleKey(jwt),
    fetchSalt(serverUrl, jwt),
  ]);

  const { calldata, identity } = await proveLogin(
    circuit,
    { jwt, providerKey },
    { publicKey: session.publicKey, expiry, secret, salt },
    onStep,
  );

  // Catches this package and the circuit disagreeing on how an identity is built
  const expected = identityHash(aud, sub, salt);
  if (expected !== identity)
    throw new Error(
      `identity_hash differs: computed 0x${expected.toString(16)}, proved 0x${identity.toString(16)}`,
    );

  const address = accountAddress(deployment, identity);

  const since = performance.now();
  const relayed = await relay(serverUrl, identity, calldata);
  // The relayer cannot choose the address, it follows from the class hash and constructor data
  if (BigInt(relayed.address) !== BigInt(address))
    throw new Error(`relayer deployed ${relayed.address}, not ${address}`);
  onStep?.("relay", performance.now() - since);

  const stored = { address, privateKey: session.privateKey, expiry };
  storeSession(stored, deployment);
  return stored;
}
