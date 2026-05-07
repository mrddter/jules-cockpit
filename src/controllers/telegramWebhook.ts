import type { Context } from 'hono';
import type { Env } from '../index.js';
import { TelegramBot } from '../telegram/bot.js';

export const telegramWebhookHandler = async (c: Context<{ Bindings: Env }>) => {
  try {
    const update = await c.req.json();

    // TSK-2.2: Auto-Kick degli Intrusi
    if (update.message?.new_chat_members && update.message.new_chat_members.length > 0) {
      const chatId = update.message.chat.id;
      const newMembers = update.message.new_chat_members;

      const bot = new TelegramBot(c.env.TELEGRAM_BOT_TOKEN, c.env.TELEGRAM_SUPERGROUP_ID);
      const db = c.env.DB;

      for (const member of newMembers) {
        if (member.is_bot) continue;

        const userId = member.id;
        const stmt = db.prepare('SELECT user_id FROM users_whitelist WHERE user_id = ?').bind(userId.toString());
        const user = await stmt.first();

        if (!user) {
          // User not in whitelist, kick them
          console.log(`Kicking unauthorized user ${userId} from chat ${chatId}`);
          await bot.banChatMember(chatId.toString(), userId.toString());
        }
      }

      // Successfully handled new members
      return c.json({ ok: true }, 200);
    }

    // Other handlers will go here in the future

    return c.json({ ok: true }, 200);
  } catch (error) {
    console.error('Error in telegramWebhookHandler:', error);
    return c.json({ ok: true }, 200);
  }
};
