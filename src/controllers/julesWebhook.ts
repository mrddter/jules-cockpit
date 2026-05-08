import type { Context } from 'hono';
import { TelegramBot } from '../telegram/bot.js';
import type { Env } from '../index.js';

export const julesWebhookHandler = async (c: Context<{ Bindings: Env }>) => {
  try {
    const body = await c.req.json();

    if (body.event === 'repository.added') {
      const repoName = body.repo_name;

      if (repoName) {
        c.executionCtx.waitUntil((async () => {
          try {
            const bot = new TelegramBot(c.env.TELEGRAM_BOT_TOKEN, c.env.TELEGRAM_SUPERGROUP_ID);
            const topicId = await bot.createForumTopic(repoName);

            if (topicId) {
              await c.env.DB.prepare(
                'INSERT INTO repositories (repo_name, telegram_topic_id) VALUES (?, ?)'
              ).bind(repoName, topicId.toString()).run();

              await bot.sendMessage(
                topicId,
                `🟢 Inizializzazione Cockpit per il repo: ${repoName} completata. Usa /new per avviare una sessione.`
              );
            } else {
              console.error(`Could not create topic for repo ${repoName}`);
            }
          } catch (error) {
            console.error(`Error processing repository.added for ${repoName}:`, error);
          }
        })());
      }
    }

    return c.json({ status: 'ok' }, 200);
  } catch (error) {
    console.error('Error handling jules webhook:', error);
    // Graceful error handling: return 200 OK so Jules doesn't retry unnecessarily if it's our parsing error,
    // or return a sensible error response.
    return c.json({ error: 'invalid payload' }, 400);
  }
};
