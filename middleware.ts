import { NextResponse, type NextRequest } from 'next/server';

import { resolveTenantRoute } from './shared/tenancy';

/**
 * Tenant URLs are the public contract; existing App Router pages stay the
 * internal implementation. Legacy root URLs redirect explicitly to Tenant A
 * instead of silently selecting a tenant in application data access.
 */
export function middleware(request: NextRequest) {
  const resolution = resolveTenantRoute(request.nextUrl.pathname);

  if (resolution.kind === 'legacy') {
    const destination = new URL(resolution.destination, request.url);
    destination.search = request.nextUrl.search;
    return NextResponse.redirect(destination, 308);
  }

  if (resolution.kind === 'tenant') {
    const destination = request.nextUrl.clone();
    destination.pathname = resolution.internalPath;
    return NextResponse.rewrite(destination);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
