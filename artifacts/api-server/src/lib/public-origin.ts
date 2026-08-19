function parseHttpsOrigin(raw: string, name: string): string {
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/") {
    throw new Error(`${name} must be an HTTPS origin without a path`);
  }
  return url.origin;
}

export function getCanonicalPublicOrigin(): string {
  const configured = process.env.EMMAUS_PUBLIC_ORIGIN?.trim();
  if (configured) {
    return parseHttpsOrigin(configured, "EMMAUS_PUBLIC_ORIGIN");
  }

  if (process.env.NODE_ENV !== "production") {
    const devDomain = process.env.REPLIT_DEV_DOMAIN?.trim();
    if (devDomain) {
      return parseHttpsOrigin(`https://${devDomain}`, "REPLIT_DEV_DOMAIN");
    }
  }

  throw new Error(
    "EMMAUS_PUBLIC_ORIGIN is required in production for secure authentication",
  );
}

export function isCanonicalRequestOrigin(origin: string): boolean {
  try {
    return new URL(origin).origin === getCanonicalPublicOrigin();
  } catch {
    return false;
  }
}