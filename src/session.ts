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

export function storeSession(session: StoredSession, deployment: Deployment) {
  localStorage.setItem(
    STORED,
    JSON.stringify({
      ...deployment,
      ...session,
      expiry: String(session.expiry),
    }),
  );
}

export function clearSession() {
  localStorage.removeItem(STORED);
}

export function resumeSession(
  deployment: Deployment,
): StoredSession | undefined {
  const stored = localStorage.getItem(STORED);
  if (!stored) return undefined;

  try {
    const parsed: unknown = JSON.parse(stored);
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
