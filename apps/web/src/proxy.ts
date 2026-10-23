import { NextRequest, NextResponse } from "next/server";
import { hasBasicAuthConfig, isAuthorizedBasicRequest } from "./lib/basic-auth";

function unauthorized() {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="SUPERSTORM AI"' },
  });
}

export function proxy(request: NextRequest) {
  // Fail closed: never protect a private dashboard with built-in credentials.
  if (!hasBasicAuthConfig()) {
    return new NextResponse("Authentication is not configured", { status: 503 });
  }

  if (!isAuthorizedBasicRequest(request.headers.get("authorization"))) return unauthorized();

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw.js).*)"],
};
