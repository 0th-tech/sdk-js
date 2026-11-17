// Node has no localStorage of its own, so the sdk is given one backed by this map
export const stored = new Map<string, string>();

globalThis.localStorage = {
  getItem: (key) => stored.get(key) ?? null,
  setItem: (key, value) => void stored.set(key, value),
  removeItem: (key) => void stored.delete(key),
} as Storage;
