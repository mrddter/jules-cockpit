import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { julesWebhookHandler } from '../src/controllers/julesWebhook.js';
import type { Env } from '../src/index.js';

vi.mock('../src/telegram/bot.js', () => {
  return {
    TelegramBot: vi.fn().mockImplementation(function() { return {
      createForumTopic: vi.fn().mockResolvedValue(42),
      sendMessage: vi.fn().mockResolvedValue(true)
    }; })

  };
});

describe('julesWebhookHandler', () => {
  const createTestApp = () => {
    const app = new Hono<{ Bindings: Env }>();
    app.post('/webhook/jules', julesWebhookHandler);
    return app;
  };

  const createEnv = (db: any): Env => ({
    TELEGRAM_BOT_TOKEN: 'mock-token',
    TELEGRAM_SUPERGROUP_ID: 'mock-group',
    DB: db,
    JULES_API_KEY: 'mock-key',
  });

  it('should return 200 OK for valid payload', async () => {
    const app = createTestApp();
    const env = createEnv({});

    const req = new Request('http://localhost/webhook/jules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'other.event' }),
    });

    let waitUntilPromise: Promise<void> | undefined;
    const ctx = {
      waitUntil: (p: Promise<void>) => { waitUntilPromise = p; },
      passThroughOnException: () => {}
    } as any;

    const res = await app.fetch(req, env, ctx);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ status: 'ok' });
  });

  it('should process repository.added event in background', async () => {
    const mockRun = vi.fn().mockResolvedValue(true);
    const mockBind = vi.fn().mockReturnValue({ run: mockRun });
    const mockPrepare = vi.fn().mockReturnValue({ bind: mockBind });
    const db = { prepare: mockPrepare };

    const app = createTestApp();
    const env = createEnv(db);

    const req = new Request('http://localhost/webhook/jules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'repository.added', repo_name: 'test-repo' }),
    });

    let waitUntilPromise: Promise<void> | undefined;
    const ctx = {
      waitUntil: (p: Promise<void>) => { waitUntilPromise = p; },
      passThroughOnException: () => {}
    } as any;

    const res = await app.fetch(req, env, ctx);
    expect(res.status).toBe(200);

    // Wait for the background task to complete
    await waitUntilPromise;

    expect(mockPrepare).toHaveBeenCalledWith(
      'INSERT INTO repositories (repo_name, telegram_topic_id) VALUES (?, ?)'
    );
    expect(mockBind).toHaveBeenCalledWith('test-repo', '42');
    expect(mockRun).toHaveBeenCalled();
  });

  it('should handle invalid json gracefully', async () => {
    const app = createTestApp();
    const env = createEnv({});

    const req = new Request('http://localhost/webhook/jules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'invalid-json',
    });

    let waitUntilPromise: Promise<void> | undefined;
    const ctx = {
      waitUntil: (p: Promise<void>) => { waitUntilPromise = p; },
      passThroughOnException: () => {}
    } as any;

    const res = await app.fetch(req, env, ctx);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data).toEqual({ error: 'invalid payload' });
  });
});
