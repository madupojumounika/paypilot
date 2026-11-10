const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env;
export const API_BASE = env?.VITE_API_URL || 'http://localhost:4000';

export async function apiRequest<T>(path: string, token?: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', 'Bearer ' + token);
  let response: Response;
  try {
    response = await fetch(API_BASE + path, { ...options, headers });
  } catch {
    throw new Error('Could not reach the PayPilot API. Start the server and check VITE_API_URL.');
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'The API request failed.');
  return payload as T;
}
