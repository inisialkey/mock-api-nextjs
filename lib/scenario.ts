import { NextRequest } from 'next/server';
import { Errors, errorResponse } from './response';

/**
 * Scenario simulator for testing edge cases from mobile app.
 *
 * Usage: Add ?scenario=<name> to any endpoint
 *
 * Available scenarios:
 * - error     : Returns 500 Internal Server Error
 * - empty     : Returns empty data array
 * - slow      : Adds 3 second delay before response
 * - very_slow : Adds 10 second delay before response
 * - unauthorized : Returns 401 Unauthorized
 * - forbidden    : Returns 403 Forbidden
 * - not_found    : Returns 404 Not Found
 * - validation   : Returns 422 Validation Error
 * - maintenance  : Returns 503 Service Unavailable
 * - rate_limit   : Returns 429 Too Many Requests
 */
export async function handleScenario(
  request: NextRequest
): Promise<Response | null> {
  const { searchParams } = new URL(request.url);
  const scenario = searchParams.get('scenario');

  if (!scenario) {
    // Apply global delay if configured
    const globalDelay = parseInt(process.env.MOCK_DELAY || '0');
    if (globalDelay > 0) {
      await delay(globalDelay);
    }
    return null;
  }

  switch (scenario) {
    case 'error':
      return Errors.internal('Simulated internal server error');

    case 'empty':
      return null; // handled by each route individually

    case 'slow':
      await delay(3000);
      return null;

    case 'very_slow':
      await delay(10000);
      return null;

    case 'unauthorized':
      return Errors.unauthorized('Simulated unauthorized');

    case 'forbidden':
      return Errors.forbidden('Simulated forbidden');

    case 'not_found':
      return Errors.notFound('Simulated resource');

    case 'validation':
      return Errors.validation('Simulated validation error', {
        field: 'example',
        rule: 'required',
      });

    case 'maintenance':
      return errorResponse({
        code: 'SERVICE_UNAVAILABLE',
        message: 'Server is under maintenance',
        status: 503,
      });

    case 'rate_limit':
      return errorResponse({
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please try again later.',
        status: 429,
      });

    default:
      return null;
  }
}

/**
 * Check if current scenario is 'empty'
 */
export function isEmptyScenario(request: NextRequest): boolean {
  const { searchParams } = new URL(request.url);
  return searchParams.get('scenario') === 'empty';
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
