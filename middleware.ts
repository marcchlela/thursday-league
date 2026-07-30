import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const match = request.nextUrl.pathname.match(/^\/l\/[^/]+(\/.*)?$/);
  if (!match) return NextResponse.next();

  const target = request.nextUrl.clone();
  target.pathname = match[1] || "/";
  return NextResponse.rewrite(target);
}

export const config = {
  matcher: ["/l/:path*"]
};
