import { afterEach, describe, expect, it, vi } from 'vitest';

import { HarmonClient, commandSource, pollForProviderConnected } from './api.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubFetch(response: Response | (() => Response)) {
  const mock = vi.fn<(input: string, init: RequestInit) => Promise<Response>>(
    async () => (typeof response === 'function' ? response() : response.clone()),
  );
  vi.stubGlobal('fetch', mock);
  return mock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('HarmonClient.search', () => {
  it('sends the singular type the spotify parser expects', async () => {
    const mock = stubFetch(jsonResponse({ tracks: [] }));
    await new HarmonClient('http://127.0.0.1:17373').search('spotify', 'query');

    expect(String(mock.mock.calls[0]?.[0])).toContain('/v1/spotify/search?q=query&type=track&limit=20');
  });

  it('maps track to songs for the apple parser', async () => {
    const mock = stubFetch(jsonResponse({ songs: [] }));
    await new HarmonClient('http://127.0.0.1:17373').search('apple', 'query');

    expect(String(mock.mock.calls[0]?.[0])).toContain('/v1/apple/search?q=query&type=songs&limit=20');
  });

  it('maps track to songs for the youtube parser', async () => {
    const mock = stubFetch(jsonResponse({ songs: [] }));
    await new HarmonClient('http://127.0.0.1:17373').search('youtube', 'query');

    expect(String(mock.mock.calls[0]?.[0])).toContain('/v1/youtube/search?q=query&type=songs&limit=20');
  });
});

describe('HarmonClient.play', () => {
  it('sends body.uri for spotify and youtube', async () => {
    for (const provider of ['spotify', 'youtube'] as const) {
      const mock = stubFetch(jsonResponse({ success: true }));
      await new HarmonClient('http://127.0.0.1:17373').play(provider, { uri: 'abc' });

      const init = mock.mock.calls[0]?.[1] as RequestInit;
      expect(JSON.parse(String(init.body))).toEqual({ uri: 'abc' });
    }
  });

  it('sends body.url for apple (the daemon reads req.body.url)', async () => {
    const mock = stubFetch(jsonResponse({ success: true }));
    await new HarmonClient('http://127.0.0.1:17373').play('apple', { uri: 'https://music.apple.com/song/1' });

    const init = mock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({ url: 'https://music.apple.com/song/1' });
  });
});

describe('HarmonClient.smartPlay', () => {
  it('sends only { query } when no provider is forced (daemon auto-routes)', async () => {
    const mock = stubFetch(jsonResponse({ success: true }));
    await new HarmonClient('http://127.0.0.1:17373').smartPlay('song');

    expect(String(mock.mock.calls[0]?.[0])).toContain('/v1/smart/play');
    const init = mock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({ query: 'song' });
  });

  it('sends the forced provider in the body so the daemon plays only there', async () => {
    const mock = stubFetch(jsonResponse({ success: true }));
    await new HarmonClient('http://127.0.0.1:17373').smartPlay('song', 'youtube');

    const init = mock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({ query: 'song', provider: 'youtube' });
  });
});

describe('HarmonClient logout endpoints', () => {
  it('POSTs to the per-provider daemon logout routes', async () => {
    const cases = [
      ['spotifyLogout', '/v1/auth/spotify/logout'],
      ['youtubeLogout', '/v1/auth/youtube/logout'],
      ['appleLogout', '/v1/auth/apple/logout'],
    ] as const;

    for (const [method, path] of cases) {
      const mock = stubFetch(jsonResponse({ success: true }));
      await new HarmonClient('http://127.0.0.1:17373')[method]();

      expect(String(mock.mock.calls[0]?.[0])).toContain(path);
      expect((mock.mock.calls[0]?.[1] as RequestInit).method).toBe('POST');
    }
  });
});

describe('HarmonClient request hardening', () => {
  it('fails with a clear timeout message when the daemon never responds', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      }),
    ));

    const promise = new HarmonClient('http://127.0.0.1:17373').getStatus();
    const assertion = expect(promise).rejects.toThrow(
      'daemon did not respond within 10s — is harmond running at http://127.0.0.1:17373?',
    );
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
  });

  it('sends the Authorization header to loopback http', async () => {
    const mock = stubFetch(jsonResponse({ isRunning: true }));
    await new HarmonClient('http://127.0.0.1:17373', 'secret').getStatus();

    const init = mock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer secret');
  });

  it('withholds the token over remote plain http and explains it on 401', async () => {
    const mock = stubFetch(() => new Response('Unauthorized', { status: 401 }));
    const client = new HarmonClient('http://192.168.1.20:17373', 'secret');

    await expect(client.getStatus()).rejects.toThrow(
      /token was withheld because .* is an insecure remote HTTP connection — use https/,
    );
    const init = mock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)['Authorization']).toBeUndefined();
  });
});

describe('commandSource', () => {
  it('uses values that exist in the protocol DeviceKind/DeviceOS enums', () => {
    const source = commandSource();
    expect(['cli', 'menubar', 'voice', 'mcp']).toContain(source.kind);
    expect(['macos', 'windows', 'wsl', 'linux']).toContain(source.device);
  });
});

describe('pollForProviderConnected', () => {
  it('resolves true as soon as the provider reports connected', async () => {
    vi.useFakeTimers();
    const getStatus = vi.fn()
      .mockResolvedValueOnce({ isRunning: true, providers: { spotify: { connected: false } } })
      .mockResolvedValueOnce({ isRunning: true, providers: { spotify: { connected: true } } });
    const client = { getStatus } as unknown as HarmonClient;

    const promise = pollForProviderConnected(client, 'spotify');
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(2000);

    await expect(promise).resolves.toBe(true);
    expect(getStatus).toHaveBeenCalledTimes(2);
  });

  it('resolves false immediately when aborted', async () => {
    const getStatus = vi.fn();
    const client = { getStatus } as unknown as HarmonClient;

    await expect(pollForProviderConnected(client, 'spotify', () => true)).resolves.toBe(false);
    expect(getStatus).not.toHaveBeenCalled();
  });
});
