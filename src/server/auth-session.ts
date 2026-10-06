import 'server-only';
import { z } from 'zod';
// Kept independent of repositories/Next cookies so the page gate never traces
// development file-storage inputs into its deployment artifact.
export const authSession = z.object({
  owner: z.uuid(),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  expires: z.number(),
});
