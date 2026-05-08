import { Hono } from 'hono';

export interface Env {
  TELEGRAM_BOT_TOKEN: string;
  JULES_API_KEY: string;
  TELEGRAM_SUPERGROUP_ID: string;
  DB: D1Database;
}

import { authMiddleware } from './middlewares/auth.js';
import { telegramWebhookHandler } from './controllers/telegramWebhook.js';
import { julesWebhookHandler } from './controllers/julesWebhook.js';

const app = new Hono<{ Bindings: Env }>();

app.get('/', (c) => c.text('Jules Telegram Cockpit OK'));

app.post('/webhook/telegram', authMiddleware, telegramWebhookHandler);

app.post('/webhook/jules', julesWebhookHandler);

export default app;
