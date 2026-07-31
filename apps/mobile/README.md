# Thursday League mobile

Native iOS and Android client built with Expo SDK 57, React Native, and Expo Router. The production Next.js website remains a separate application at the repository root.

## Requirements

- Node.js 22.13 or newer within the Node 22 release line.
- npm 10.9.4 for reproducible dependency installation. npm 11.13 generated an invalid nested Expo lock entry during initial setup on Windows.
- An Android emulator/device or an iPhone for native testing.

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Add the public Supabase URL and publishable key.
3. Keep `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_WEB_URL` pointed at the current Vercel deployment until the custom domain is ready.
4. Install with `npx --yes npm@10.9.4 ci`.
5. Run `npm start`, then choose Android or iOS.

Only public client configuration belongs in `EXPO_PUBLIC_*` variables. Never add the Supabase service-role key, VAPID private key, APNs key, Firebase service account, or any other server secret to this application.

## Current scope

Phase 1 provides the native shell, project configuration, environment validation, Supabase client factory, EAS build profiles, and an isolated dependency tree. Authentication and product screens are intentionally not connected yet.
