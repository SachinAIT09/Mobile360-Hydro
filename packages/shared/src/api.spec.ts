import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, ApiPaths, createApi } from './api';

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

const json = (body: unknown, status = 200) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let fetchMock: FetchMock;

beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function lastRequest() {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  return { url, init, headers: init.headers as Record<string, string> };
}

describe('createApi', () => {
  it('prefixes paths with /api under the base URL, stripping a trailing slash', async () => {
    fetchMock.mockResolvedValue(json({ customer: {} }));
    const api = createApi({ baseUrl: 'http://localhost:3000/', getToken: () => null });
    await api.me();
    const { url, init, headers } = lastRequest();
    expect(url).toBe(`http://localhost:3000/api${ApiPaths.me}`);
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
    expect(headers.Accept).toBe('application/json');
    expect(headers['Content-Type']).toBeUndefined();
    expect(headers.Authorization).toBeUndefined();
  });

  it('sends the bearer token and a JSON body for writes', async () => {
    fetchMock.mockResolvedValue(json({ token: 't', user: {} }));
    const api = createApi({ baseUrl: 'http://api.test', getToken: () => 'abc' });
    await api.login({ email: 'manny@demo.test', password: 'demo' });
    const { url, init, headers } = lastRequest();
    expect(url).toBe('http://api.test/api/auth/login');
    expect(init.method).toBe('POST');
    expect(headers.Authorization).toBe('Bearer abc');
    expect(headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual({ email: 'manny@demo.test', password: 'demo' });
  });

  it('returns the parsed JSON body', async () => {
    fetchMock.mockResolvedValue(json({ push: true, sms: false, email: false }));
    const api = createApi({ baseUrl: 'http://api.test', getToken: () => null });
    await expect(api.updateChannels({ push: true, sms: false, email: false })).resolves.toEqual({ push: true, sms: false, email: false });
    expect(lastRequest().init.method).toBe('PATCH');
  });

  it('resolves an empty success body to null', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 200 }));
    const api = createApi({ baseUrl: 'http://api.test', getToken: () => null });
    await expect(api.me()).resolves.toBeNull();
  });

  it('calls onUnauthorized on 401 and throws an ApiError with the server message', async () => {
    fetchMock.mockResolvedValue(json({ statusCode: 401, message: 'Unauthorized', error: 'Unauthorized' }, 401));
    const onUnauthorized = vi.fn();
    const api = createApi({ baseUrl: 'http://api.test', getToken: () => 'expired', onUnauthorized });
    const err = await api.me().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(401);
    expect((err as ApiError).message).toBe('Unauthorized');
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('does not call onUnauthorized for other errors', async () => {
    fetchMock.mockResolvedValue(json({ statusCode: 404, message: 'Campaign not found', error: 'Not Found' }, 404));
    const onUnauthorized = vi.fn();
    const api = createApi({ baseUrl: 'http://api.test', getToken: () => null, onUnauthorized });
    await expect(api.me()).rejects.toMatchObject({ status: 404, message: 'Campaign not found' });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('joins a validation-error message array with commas', async () => {
    fetchMock.mockResolvedValue(json({ statusCode: 400, message: ['consent must be true', 'evMake must be a string'], error: 'Bad Request' }, 400));
    const api = createApi({ baseUrl: 'http://api.test', getToken: () => null });
    await expect(api.me()).rejects.toMatchObject({ status: 400, message: 'consent must be true, evMake must be a string' });
  });

  it('falls back to the status text when the error body is empty', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 503, statusText: 'Service Unavailable' }));
    const api = createApi({ baseUrl: 'http://api.test', getToken: () => null });
    await expect(api.me()).rejects.toMatchObject({ status: 503, message: 'Service Unavailable' });
  });
});
