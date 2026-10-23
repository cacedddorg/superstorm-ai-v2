export function hasBasicAuthConfig(): boolean {
  return Boolean(process.env.AUTH_USER && process.env.AUTH_PASSWORD);
}

export function isAuthorizedBasicRequest(authorization: string | null): boolean {
  const expectedUser = process.env.AUTH_USER;
  const expectedPassword = process.env.AUTH_PASSWORD;
  if (!expectedUser || !expectedPassword || !authorization?.startsWith("Basic ")) return false;

  let decoded: string;
  try {
    decoded = Buffer.from(authorization.slice("Basic ".length), "base64").toString("utf8");
  } catch {
    return false;
  }

  const separator = decoded.indexOf(":");
  return separator >= 0 && decoded.slice(0, separator) === expectedUser && decoded.slice(separator + 1) === expectedPassword;
}
