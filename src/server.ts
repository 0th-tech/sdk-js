import { hasStringFields } from "./identity.ts";

async function post<T>(url: string, input: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  }).catch(() => {
    throw new Error(`cannot reach ${url}`);
  });
  if (!res.ok) {
    // An unknown route answers with an empty body, a failed one with { error }
    const body: unknown = await res.json().catch(() => undefined);
    const error = hasStringFields(body, ["error"])
      ? body.error
      : `${res.status} ${res.statusText}`;
    throw new Error(`${url} failed: ${error}`);
  }
  return (await res.json()) as T;
}

// The calldata register_session takes. The server already sees the letter at /salt
export const prove = (
  serverUrl: string,
  login: { jwt: string; publicKey: string; expiry: string; secret: string },
) => post<{ proof: string[]; identity: string }>(`${serverUrl}/prove`, login);

// Deploys the account and registers the session key in one transaction, paid by the relayer
export const relay = (serverUrl: string, identity: string, proof: string[]) =>
  post<{ address: string }>(`${serverUrl}/relay`, { identity, proof });

// The salt is derived server side, so an address cannot be computed from the claims alone
export const fetchSalt = async (serverUrl: string, jwt: string) =>
  BigInt((await post<{ salt: string }>(`${serverUrl}/salt`, { jwt })).salt);
