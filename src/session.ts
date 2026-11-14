import { hasStringFields } from "./identity.ts";

const STORED = "0th.session";

const STORED_FIELDS = ["address", "privateKey", "expiry"] as const;

export type StoredSession = {
  address: string;
  privateKey: string;
  expiry: bigint;
};

export function storeSession(session: StoredSession) {
  localStorage.setItem(
    STORED,
    JSON.stringify({ ...session, expiry: String(session.expiry) }),
  );
}

export function clearSession() {
  localStorage.removeItem(STORED);
}

// The stored session, if the account would still accept its signature
export function resumeSession(): StoredSession | undefined {
  const stored = localStorage.getItem(STORED);
  if (!stored) return undefined;

  try {
    const parsed: unknown = JSON.parse(stored);
    if (!hasStringFields(parsed, STORED_FIELDS))
      throw new Error("a field is missing");

    const expiry = BigInt(parsed.expiry);
    if (expiry * 1000n <= BigInt(Date.now()))
      throw new Error("the session has expired");

    return { address: parsed.address, privateKey: parsed.privateKey, expiry };
  } catch {
    // An expired or unreadable session is removed, so the page asks for a new login
    clearSession();
    return undefined;
  }
}
