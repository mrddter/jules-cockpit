import { Hono } from 'hono';

export interface Env {
  TELEGRAM_BOT_TOKEN: string;
  JULES_API_KEY: string;
  TELEGRAM_SUPERGROUP_ID: string;
  DB: D1Database;
}

const app = new Hono<{ Bindings: Env }>();

app.get('/', (c) => c.text('Jules Telegram Cockpit OK'));

export default app;
