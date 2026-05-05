import { handleCommand, handleTextMessage } from './telegram/commands';
import { JulesClient } from './jules/client';
/**
 * Jules Telegram Cockpit - Cloudflare Worker Entry Point
 */

import { Hono } from 'hono';
import { TelegramBot, TelegramUpdate } from './telegram/bot';
import { isUserWhitelisted } from './telegram/middleware';

export type Bindings = {
  TELEGRAM_BOT_TOKEN: string;
  JULES_API_KEY: string;
  ENVIRONMENT: string;
  TELEGRAM_SUPERGROUP_ID: string;
  DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();

// Health check
app.get('/health', (c) => {
  return c.json({ status: 'ok', service: 'jules-telegram-cockpit' });
});

// Root endpoint
app.get('/', (c) => c.text('Jules Telegram Cockpit is running.'));

// Telegram webhook endpoint
app.post('/webhook/telegram', async (c) => {
  try {
    const update = await c.req.json<TelegramUpdate>();
    const bot = new TelegramBot(c.env.TELEGRAM_BOT_TOKEN);
    const db = c.env.DB;

    // Handle new chat members
    if (update.message?.new_chat_members) {
        const chatId = update.message.chat.id;
        for (const member of update.message.new_chat_members) {
            // Ignore bots
            if (member.id.toString() === c.env.TELEGRAM_BOT_TOKEN.split(':')[0]) continue;

            const whitelisted = await isUserWhitelisted(member.id, db);
            if (!whitelisted) {
                console.log(`Kicking unauthorized user ${member.id} from chat ${chatId}`);
                await bot.banChatMember(chatId, member.id);
            }
        }
        return c.text('OK');
    }

    // Get the user ID from the update
    let userId: number | undefined;
    if (update.message?.from?.id) {
        userId = update.message.from.id;
    } else if (update.callback_query?.from?.id) {
        userId = update.callback_query.from.id;
    }

    if (!userId) {
        return c.text('No user ID found, ignoring.');
    }

    // Check whitelist
    const whitelisted = await isUserWhitelisted(userId, db);
    if (!whitelisted) {
        console.log(`Unauthorized user ${userId} tried to interact. Ignoring.`);
        return c.text('Unauthorized', 403);
    }

    // Proceed with handling the update
    const julesClient = new JulesClient(c.env.JULES_API_KEY);

    const supergroupId = c.env.TELEGRAM_SUPERGROUP_ID;




    // Handle Callback Queries (Button clicks)
    if (update.callback_query) {
        const callbackData = update.callback_query.data;
        const messageId = update.callback_query.message?.message_id;
        const chatId = update.callback_query.message?.chat.id;
        const userName = update.callback_query.from.first_name || update.callback_query.from.username || 'Utente';

        if (callbackData && messageId && chatId) {
            const parts = callbackData.split(':');
            const action = parts[0];
            const sessionId = parts[1];
            const planId = parts[2];

            if (action === 'approve_plan' || action === 'reject_plan') {
                try {
                    if (action === 'approve_plan') {
                        await julesClient.approvePlan(sessionId, planId);
                        await bot.editMessageText(chatId, messageId, `✅ <b>Piano approvato da ${userName}</b>`, { reply_markup: { inline_keyboard: [] } });
                    } else {
                        await julesClient.rejectPlan(sessionId, planId);
                        await bot.editMessageText(chatId, messageId, `❌ <b>Piano rifiutato da ${userName}</b>`, { reply_markup: { inline_keyboard: [] } });
                    }
                } catch (err: any) {
                    // Send an alert in the same thread if possible
                    console.error('Plan approval/rejection failed:', err);
                }
            }
        }
        return c.text('OK');
    }

    if (update.message?.text) {

        const text = update.message.text;

        const topicId = update.message.message_thread_id?.toString();



        if (topicId) {

            if (text.startsWith("/")) {

                await handleCommand(text, topicId, userId, db, bot, julesClient, supergroupId);

            } else {

                await handleTextMessage(text, topicId, db, bot, julesClient, supergroupId);

            }

        }

    }
    console.log('Received Telegram update from whitelisted user:', update.update_id);

    // Logic will be expanded here

    return c.text('OK');
  } catch (error) {
    console.error('Webhook error:', error);
    return c.text('Error', 500);
  }
});

export default {
  fetch(request: Request, env: Bindings, ctx: ExecutionContext) {
    return app.fetch(request, env, ctx);
  },
};

// Type definition for Jules webhook payload
interface JulesWebhookPayload {
    event: string;
    data: any;
}

// Jules Webhook Endpoint
app.post('/webhook/jules', async (c) => {
  try {
    // Add simple authentication for webhooks if Jules supports it
    // const authHeader = c.req.header('Authorization');
    // if (authHeader !== `Bearer ${c.env.JULES_API_KEY}`) return c.text('Unauthorized', 401);

    const payload = await c.req.json<JulesWebhookPayload>();
    const db = c.env.DB;
    const bot = new TelegramBot(c.env.TELEGRAM_BOT_TOKEN);
    // Replace with your supergroup ID via env var if needed, or get from config
    const TELEGRAM_SUPERGROUP_ID = c.env.TELEGRAM_SUPERGROUP_ID;

    if (!TELEGRAM_SUPERGROUP_ID) {
        console.error('TELEGRAM_SUPERGROUP_ID is not configured');
        return c.text('Configuration Error', 500);
    }

    if (payload.event === 'activity.created' || payload.event === 'activity_created') {

        const sessionId = payload.data.session_id;

        const activityType = payload.data.type;

        const activityPayload = payload.data.payload;



        if (!sessionId) return c.text('Session ID missing', 400);



        // Find associated topic

        const stmt = db.prepare('SELECT telegram_topic_id FROM sessions WHERE jules_session_id = ?');

        const sessionResult = await stmt.bind(sessionId).first();



        if (sessionResult && sessionResult.telegram_topic_id) {

            const topicId = parseInt(sessionResult.telegram_topic_id as string);



            if (activityType === 'message') {

                await bot.sendMessage(TELEGRAM_SUPERGROUP_ID, `🤖 <b>Jules:</b>\n${activityPayload.text}`, { message_thread_id: topicId });

            } else if (activityType === 'plan') {

                const planId = payload.data.id || activityPayload.plan_id;

                const planText = activityPayload.description || 'Jules ha proposto un nuovo piano.';



                const replyMarkup = {

                    inline_keyboard: [

                        [

                            { text: '✅ Approva', callback_data: `approve_plan:${sessionId}:${planId}` },

                            { text: '❌ Rifiuta', callback_data: `reject_plan:${sessionId}:${planId}` }

                        ]

                    ]

                };



                await bot.sendMessage(TELEGRAM_SUPERGROUP_ID, `📋 <b>Nuovo Piano Proposto</b>\n\n${planText}`, {

                    message_thread_id: topicId,

                    reply_markup: replyMarkup

                });

            }

        }

        return c.text('Activity handled');

    }
    if (payload.event === 'repository.added' || payload.event === 'repository_added') {
        const repoName = payload.data.repository_name || payload.data.name;

        if (!repoName) {
            return c.text('Repository name missing', 400);
        }

        console.log(`New repository added in Jules: ${repoName}. Creating Telegram topic...`);

        // Create Forum Topic in Telegram
        const topicId = await bot.createForumTopic(TELEGRAM_SUPERGROUP_ID, repoName);

        if (topicId) {
            // Save to database
            const stmt = db.prepare('INSERT INTO repositories (repo_name, telegram_topic_id) VALUES (?, ?)');
            await stmt.bind(repoName, topicId.toString()).run();

            // Send welcome message
            await bot.sendMessage(
                TELEGRAM_SUPERGROUP_ID,
                `🚀 <b>Nuovo repository connesso!</b>\nQuesto topic è associato a <code>${repoName}</code>.\nUsa /new per avviare una sessione.`,
                { message_thread_id: topicId }
            );

            return c.text('Topic created successfully');
        } else {
            console.error('Failed to create Telegram topic');
            return c.text('Failed to create topic', 500);
        }
    }

    // Altri eventi da implementare in Fase 6

    return c.text('Event not handled', 200);
  } catch (error) {
    console.error('Jules webhook error:', error);
    return c.text('Error', 500);
  }
});
