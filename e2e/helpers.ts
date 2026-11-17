export function need(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

// The check runs every half second until it answers, for up to 30 seconds
export async function waitFor(what: string, check: () => Promise<unknown>) {
  for (let tries = 0; !(await check().catch(() => false)); tries++) {
    if (tries === 60) throw new Error(`${what} is not answering`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}
