import { Context } from 'hono';
import { TelegramUpdate } from './bot';
import { Bindings } from '../index';

export async function isUserWhitelisted(userId: number, db: D1Database): Promise<boolean> {
  const stmt = db.prepare('SELECT user_id FROM users_whitelist WHERE user_id = ?');
  const result = await stmt.bind(userId.toString()).first();
  return result !== null;
}

export async function addAdminToWhitelist(userId: string, username: string, db: D1Database): Promise<void> {
    const stmt = db.prepare('INSERT OR IGNORE INTO users_whitelist (user_id, username) VALUES (?, ?)');
    await stmt.bind(userId, username).run();
}
