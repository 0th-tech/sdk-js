import type { Deployment } from "./account.ts";
import { hasStringFields } from "./identity.ts";

const STORED = "0th.session";

const DEPLOYMENT_FIELDS = ["registry", "verifier", "accountClassHash"] as const;
const STORED_FIELDS = [
  "address",
  "privateKey",
  "expiry",
  ...DEPLOYMENT_FIELDS,
] as const;

export type StoredSession = {
  address: string;
  privateKey: string;
  expiry: bigint;
};

// What registering the session key needs: the letter until the proof arrives, then the proof.
// Strings only, since it is kept in localStorage
export type Registration = {
  publicKey: string;
  identity: string;
} & ({ jwt: string; expiry: string; secret: string } | { proof: string[] });

const isRegistration = (value: unknown): value is Registration =>
  hasStringFields(value, ["publicKey", "identity"]) &&
  (hasStringFields(value, ["jwt", "expiry", "secret"]) ||
    ("proof" in value &&
      Array.isArray(value.proof) &&
      value.proof.every((felt) => typeof felt === "string")));

export function storeSession(
  session: StoredSession,
  deployment: Deployment,
  registration: Registration,
) {
  localStorage.setItem(
    STORED,
    JSON.stringify({
      ...deployment,
      ...session,
      expiry: String(session.expiry),
      registration,
    }),
  );
}

export function clearSession() {
  localStorage.removeItem(STORED);
}

function stored(): Record<string, unknown> | undefined {
  const text = localStorage.getItem(STORED);
  if (!text) return undefined;
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== "object" || parsed === null)
    throw new Error("the stored session is unreadable");
  return parsed as Record<string, unknown>;
}

// Undefined once the session key is registered on chain
export function pendingRegistration(): Registration | undefined {
  const registration = stored()?.registration;
  if (registration === undefined) return undefined;
  if (!isRegistration(registration))
    throw new Error("the stored registration is unreadable: sign in again");
  return registration;
}

// Replaces or removes the registration, unless a newer login stored another session key
export function setRegistration(publicKey: string, next?: Registration) {
  const session = stored();
  const current = session?.registration;
  if (!session || !isRegistration(current) || current.publicKey !== publicKey)
    return;
  localStorage.setItem(
    STORED,
    JSON.stringify({ ...session, registration: next }),
  );
}

export function resumeSession(
  deployment: Deployment,
): StoredSession | undefined {
  try {
    const parsed = stored();
    if (!parsed) return undefined;
    if (!hasStringFields(parsed, STORED_FIELDS))
      throw new Error("a field is missing");
    // A login under another registry, verifier or account class gives another address
    if (DEPLOYMENT_FIELDS.some((field) => parsed[field] !== deployment[field]))
      throw new Error("the session is from another deployment");

    const expiry = BigInt(parsed.expiry);
    if (expiry * 1000n <= BigInt(Date.now()))
      throw new Error("the session has expired");

    return { address: parsed.address, privateKey: parsed.privateKey, expiry };
  } catch {
    clearSession();
    return undefined;
  }
}
