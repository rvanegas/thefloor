import { Platform } from 'react-native';

/**
 * Where the server lives. Set EXPO_PUBLIC_API_URL in app/.env — a LAN address
 * rather than localhost, because a phone running the app is not this machine.
 * The simulator can reach localhost, but using one address for both clients is
 * less to get wrong.
 */
const configured = process.env.EXPO_PUBLIC_API_URL?.trim();

export const API_URL =
  configured || (Platform.OS === 'web' ? 'http://localhost:8787' : '');

export const WS_URL = API_URL.replace(/^http/, 'ws') + '/ws';

export function describeMissingConfig(): string | null {
  if (API_URL) return null;
  return [
    'EXPO_PUBLIC_API_URL is not set, so the app has no server to talk to.',
    '',
    'Create app/.env containing:',
    '',
    '  EXPO_PUBLIC_API_URL=http://<your-mac-lan-ip>:8787',
    '',
    'then restart the bundler with `npx expo start --clear`.',
  ].join('\n');
}
