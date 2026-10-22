import { NextRequest, NextResponse } from "next/server";

function unauthorized() {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="SUPERSTORM AI"' },
  });
}

export function proxy(request: NextRequest) {
  const expectedUser = process.env.AUTH_USER;
  const expectedPassword = process.env.AUTH_PASSWORD;

  // Fail closed: never protect a private dashboard with built-in credentials.
  if (!expectedUser || !expectedPassword) {
    return new NextResponse("Authentication is not configured", { status: 503 });
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Basic ")) return unauthorized();

  let decoded: string;
  try {
    decoded = atob(authorization.slice("Basic ".length));
  } catch {
    return unauthorized();
  }

  const separator = decoded.indexOf(":");
  if (separator < 0) return unauthorized();

  const user = decoded.slice(0, separator);
  const password = decoded.slice(separator + 1);
  if (user !== expectedUser || password !== expectedPassword) return unauthorized();

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw.js).*)"],
};
