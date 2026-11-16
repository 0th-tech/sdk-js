import { accountAddress, type Deployment } from "./account.ts";
import {
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
import { type OnStep, proveSession } from "./register.ts";
import { fetchSalt } from "./server.ts";
import { type StoredSession, storeSession } from "./session.ts";

const HOUR = 3600;
const MAX_SESSION_LENGTH = 30 * 24 * HOUR;

export type LoginConfig = {
  // The dapp's client id at the provider. Public, no secret in this flow
  clientId: string;
  // Must match what is registered, byte for byte, trailing slash included
  redirectUri: string;
  deployment: Deployment;
  serverUrl: string;
  // Seconds a session key stays valid, under 30 days. The default keeps an hour of margin, since a block's clock can be behind the browser's
  sessionLength?: number;
  // Called when the proof arrives and when the session key is registered on chain
  onStep?: OnStep;
};

export function startLogin({
  clientId,
  redirectUri,
  sessionLength = MAX_SESSION_LENGTH - HOUR,
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

// Nothing goes on chain here: the first transaction deploys the account and registers the key
export async function finishLogin(
  { jwt, session, expiry, secret }: PendingLogin,
  { clientId, deployment, serverUrl, onStep }: LoginConfig,
): Promise<StoredSession> {
  const { aud, sub } = claims(
    jwt,
    clientId,
    loginNonce(session.publicKey, expiry, secret),
  );

  const identity = identityHash(aud, sub, await fetchSalt(serverUrl, jwt));
  const stored = {
    address: accountAddress(deployment, identity),
    privateKey: session.privateKey,
    expiry,
  };
  const registration = {
    publicKey: String(session.publicKey),
    identity: String(identity),
    jwt,
    expiry: String(expiry),
    secret: String(secret),
  };
  storeSession(stored, deployment, registration);

  // Not awaited: the proof is made while the user looks around
  void proveSession(serverUrl, registration, onStep);
  return stored;
}
