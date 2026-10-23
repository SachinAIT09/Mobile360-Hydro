import { Platform } from 'react-native';
import { createApi } from '@demo/shared';

/**
 * API origin.
 * - Production web build (served by the API server at /app): same origin as the page.
 * - Dev (pnpm dev): http://localhost:3000.
 * - Expo Go on a real phone: set EXPO_PUBLIC_API_URL to the server, e.g. http://192.168.1.20:3000.
 */
function defaultApiUrl(): string {
  if (Platform.OS === 'web' && process.env.NODE_ENV === 'production' && typeof window !== 'undefined') {
    return window.location.origin;
  }
  return 'http://localhost:3000';
}
export const API_URL: string = process.env.EXPO_PUBLIC_API_URL || defaultApiUrl();

/** Module-level token holder so the API client and socket always read the latest value. */
let currentToken: string | null = null;
export function setCurrentToken(t: string | null) {
  currentToken = t;
}
export function getCurrentToken() {
  return currentToken;
}

let unauthorizedHandler: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  unauthorizedHandler = fn;
}

export const api = createApi({
  baseUrl: API_URL,
  getToken: () => currentToken,
  onUnauthorized: () => unauthorizedHandler?.(),
});
