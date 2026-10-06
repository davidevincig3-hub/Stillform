import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AuthError, loginSession } from '@/server/integration-auth';
import {
  gymConfig,
  requireGymOwner,
  GYM_SESSION_COOKIE,
} from '@/server/gym-auth';
import { gymReadQuerySchema } from '@/repositories/gym-cloud-query';
import { GymCloudError, SupabaseGymRepository } from '@/server/gym-repository';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };
function failure(error: unknown) {
  return NextResponse.json(
    {
      error:
        error instanceof AuthError || error instanceof GymCloudError
          ? error.message
          : 'Account Gym operation failed. Local data is preserved.',
    },
    {
      status:
        error instanceof AuthError || error instanceof GymCloudError
          ? error.status
          : error instanceof z.ZodError
            ? 400
            : 503,
      headers,
    },
  );
}
export async function GET(request: Request) {
  try {
    const config = gymConfig(request),
      owner = await requireGymOwner(config);
    return NextResponse.json(
      await new SupabaseGymRepository(config).read(
        owner,
        gymReadQuerySchema.parse(
          Object.fromEntries(new URL(request.url).searchParams),
        ),
      ),
      { headers },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    const config = gymConfig(request);
    if (Number(request.headers.get('content-length') || 0) > 50 * 1024 * 1024)
      throw new GymCloudError('Gym upload exceeds 50 MB', 413);
    const text = await request.text();
    if (text.length > 50 * 1024 * 1024)
      throw new GymCloudError('Gym upload exceeds 50 MB', 413);
    const body: unknown = JSON.parse(text);
    const login = z
      .object({
        action: z.literal('login'),
        email: z.email(),
        password: z.string().min(1),
      })
      .safeParse(body);
    if (login.success) {
      await loginSession(login.data, config, GYM_SESSION_COOKIE);
      return NextResponse.json({ authenticated: true }, { headers });
    }
    const owner = await requireGymOwner(config);
    return NextResponse.json(
      await new SupabaseGymRepository(config).save(owner, body),
      { headers },
    );
  } catch (error) {
    return failure(error);
  }
}
