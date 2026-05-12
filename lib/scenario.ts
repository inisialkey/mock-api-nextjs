import { NextRequest } from 'next/server';
import { Errors } from './response';

/**
 * Scenario simulator for testing mobile-app edge cases.
 *
 * Usage: append `?scenario=<name>` to any endpoint.
 *
 * See `docs/api/00-overview.md` §9 for the full table. Available scenarios:
 *
 *   error         500 INTERNAL_SERVER_ERROR
 *   validation    422 VALIDATION_ERROR (with sample field errors)
 *   unauthorized  401 AUTH_TOKEN_EXPIRED
 *   forbidden     403 AUTHORIZATION_FORBIDDEN
 *   not_found     404 RESOURCE_NOT_FOUND
 *   maintenance   503 MAINTENANCE_MODE
 *   rate_limit    429 RATE_LIMIT_EXCEEDED (with Retry-After: 30)
 *   force_update  426 FORCE_UPDATE_REQUIRED
 *   empty         200 with empty data — handled by each route via `isEmptyScenario`
 *   slow          3-second delay, then normal response
 *   very_slow     10-second delay
 *   timeout       hangs until the client times out
 */
export async function handleScenario(
  request: NextRequest
): Promise<Response | null> {
  const { searchParams } = new URL(request.url);
  const scenario = searchParams.get('scenario');

  if (!scenario) {
    // Apply global delay if configured via MOCK_DELAY env var.
    const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env || {};
    const globalDelay = parseInt(env.MOCK_DELAY || '0', 10);
    if (globalDelay > 0) {
      await delay(globalDelay);
    }
    return null;
  }

  switch (scenario) {
    case 'error':
      return Errors.internal('Simulated internal server error.');

    case 'empty':
      return null; // each route handles the empty-list shape itself

    case 'slow':
      await delay(3000);
      return null;

    case 'very_slow':
      await delay(10000);
      return null;

    case 'timeout':
      // Hang the request until the client aborts (no response).
      // Useful for verifying Dio `receiveTimeout` handling.
      await new Promise<never>(() => {}); // never resolves
      return null;

    case 'unauthorized':
      return Errors.tokenExpired('Simulated token expiry — refresh and retry.');

    case 'forbidden':
      return Errors.forbidden('Simulated forbidden — insufficient permissions.');

    case 'not_found':
      return Errors.notFound('Resource');

    case 'validation':
      return Errors.validation('The given data was invalid.', {
        email: ['The email field is required.', 'The email must be valid.'],
        password: ['The password must be at least 8 characters.'],
      });

    case 'maintenance':
      return Errors.maintenance(
        'We are upgrading our systems. Please try again in 30 minutes.'
      );

    case 'rate_limit':
      return Errors.rateLimit(30);

    case 'force_update':
      return Errors.forceUpdate(
        'A required update is available. Please update to continue.'
      );

    default:
      // Unknown scenario name — fall through to normal handling.
      return null;
  }
}

/**
 * Check if current request is the `empty` scenario — each route handler should
 * short-circuit to an empty-but-well-shaped list response.
 */
export function isEmptyScenario(request: NextRequest): boolean {
  const { searchParams } = new URL(request.url);
  return searchParams.get('scenario') === 'empty';
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
