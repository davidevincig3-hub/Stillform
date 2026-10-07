import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AuthError } from './integration-auth';
import { GymCloudError } from './gym-repository';
import { GymHistoryReadError } from './gym-previous-read';
export function gymReadFailure(error: unknown) {
  const code =
    error instanceof AuthError
      ? 'authentication'
      : error instanceof GymHistoryReadError
        ? error.code
        : error instanceof z.ZodError
          ? 'validation'
          : error instanceof Error &&
              ['TimeoutError', 'AbortError'].includes(error.name)
            ? 'timeout'
            : error instanceof GymCloudError
              ? error.code
              : 'processing';
  const status =
    error instanceof AuthError ||
    error instanceof GymCloudError ||
    error instanceof GymHistoryReadError
      ? error.status
      : error instanceof z.ZodError
        ? 400
        : 503;
  return NextResponse.json(
    {
      error:
        error instanceof AuthError
          ? 'Gym history access requires account verification.'
          : 'Gym history could not be loaded. Save status is shown separately in Account Gym.',
      diagnostic: { operation: 'gym_read', code, status },
    },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}
