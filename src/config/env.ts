export const config = {
  mode: 'demo' as const,
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabasePublishableKey:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
};
