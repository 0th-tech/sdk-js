import { hasStringFields } from "./identity.ts";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const PENDING = "0th.login";

// What crosses the redirect in sessionStorage, so every value is a string
const STORED_FIELDS = [
  "privateKey",
  "publicKey",
  "expiry",
  "secret",
  "state",
] as const;

type StoredLogin = Record<(typeof STORED_FIELDS)[number], string>;

export type PendingLogin = {
  jwt: string;
  session: { privateKey: string; publicKey: bigint };
  expiry: bigint;
  secret: bigint;
};

export function redirectToGoogle(
  clientId: string,
  redirectUri: string,
  nonce: string,
  { session, expiry, secret }: Omit<PendingLogin, "jwt">,
) {
  const state = crypto.randomUUID();
  const pending: StoredLogin = {
    privateKey: session.privateKey,
    publicKey: String(session.publicKey),
    expiry: String(expiry),
    secret: String(secret),
    state,
  };
  sessionStorage.setItem(PENDING, JSON.stringify(pending));

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    // Any other scope adds claims, and the letter must fit the circuit's size limit
    scope: "openid",
    response_type: "id_token",
    nonce,
    state,
  });
  location.assign(`${AUTH_URL}?${params}`);
}

export function readGoogleAnswer(): PendingLogin | undefined {
  const pending = sessionStorage.getItem(PENDING);
  const fragment = new URLSearchParams(location.hash.slice(1));
  if (!fragment.size) return undefined;
  history.replaceState(null, "", location.pathname);
  sessionStorage.removeItem(PENDING);

  const error = fragment.get("error");
  if (error) throw new Error(`Google refused the login: ${error}`);

  const jwt = fragment.get("id_token");
  if (!jwt) return undefined;
  if (!pending)
    throw new Error("a letter came back, but this tab was not logging in");

  const parsed: unknown = JSON.parse(pending);
  if (!hasStringFields(parsed, STORED_FIELDS))
    throw new Error("the stored login is unreadable");
  if (fragment.get("state") !== parsed.state)
    throw new Error("state does not match: this letter is not from this login");

  return {
    jwt,
    session: {
      privateKey: parsed.privateKey,
      publicKey: BigInt(parsed.publicKey),
    },
    expiry: BigInt(parsed.expiry),
    secret: BigInt(parsed.secret),
  };
}
