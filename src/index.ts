import { Hono } from "hono";

export interface Env {
	TELEGRAM_BOT_TOKEN: string;
	JULES_API_KEY: string;
	TELEGRAM_SUPERGROUP_ID: string;
	WEBHOOK_SETUP_SECRET: string;
	DB: D1Database;
}

import { julesWebhookHandler } from "./controllers/julesWebhook.js";
import { telegramWebhookHandler } from "./controllers/telegramWebhook.js";
import { JulesClient } from "./jules/client.js";
import { authMiddleware } from "./middlewares/auth.js";
import { TelegramBot } from "./telegram/bot.js";

const app = new Hono<{ Bindings: Env }>();

const escapeMarkdownV2 = (text: string) => {
	// biome-ignore lint/complexity/noUselessEscapeInRegex: This specific regex needs to escape the [ bracket safely.
	return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, "\\$1");
};

app.get("/", (c) => c.text("Jules Telegram Cockpit OK"));

app.get("/setup-webhook", async (c) => {
	const secretHeader = c.req.header("X-Webhook-Secret");
	if (!c.env.WEBHOOK_SETUP_SECRET || secretHeader !== c.env.WEBHOOK_SETUP_SECRET) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const url = new URL(c.req.url);
	const webhookUrl = `${url.origin}/webhook/telegram`;

	try {
		const response = await fetch(
			`https://api.telegram.org/bot${c.env.TELEGRAM_BOT_TOKEN}/setWebhook`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					url: webhookUrl,
				}),
			},
		);

		const data = await response.json();
		return c.json(data);
	} catch (error) {
		console.error("Error setting webhook:", error);
		return c.json({ error: "Failed to set webhook" }, 500);
	}
});

app.post("/webhook/telegram", authMiddleware, telegramWebhookHandler);

app.post("/webhook/jules", julesWebhookHandler);

export default {
	fetch: app.fetch,
	async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext) {
		const db = env.DB;
		const stmt = db.prepare(
			"SELECT jules_session_id, telegram_topic_id, last_activity_count FROM sessions WHERE status = 'active'",
		);
		const { results } = await stmt.all<{
			jules_session_id: string;
			telegram_topic_id: string;
			last_activity_count: number;
		}>();

		if (!results || results.length === 0) return;

		for (const session of results) {
			const sessionId = session.jules_session_id;
			const lastCount = session.last_activity_count || 0;

			try {
				const julesClient = new JulesClient(env.JULES_API_KEY);
				// We fetch up to 100 activities (or all if pageSize is not strictly enforced by default)
				const activities = await julesClient.listActivities(sessionId);

				if (activities.length > lastCount) {
					const newActivities = activities.slice(lastCount);
					const bot = new TelegramBot(
						env.TELEGRAM_BOT_TOKEN,
						env.TELEGRAM_SUPERGROUP_ID,
					);
					const topicId = parseInt(session.telegram_topic_id, 10);

					for (const activity of newActivities) {
						if (activity.type === "agentMessaged") {
							const msgText = `🤖 *Jules:*\n${escapeMarkdownV2(activity.agentMessage)}`;
							await bot.sendMessage(topicId, msgText, {
								parse_mode: "MarkdownV2",
							});
						} else if (activity.type === "planGenerated") {
							const stepsText = activity.plan.steps
								.map((step) => `\\- ${escapeMarkdownV2(step.description)}`)
								.join("\n");
							const messageText = `📋 *Nuovo Piano Generato:*\n\n${stepsText}`;

							const inline_keyboard = [
								[
									{
										text: "✅ Approva",
										callback_data: `approve_plan:${activity.plan.id}:${sessionId}`,
									},
									{
										text: "❌ Rifiuta",
										callback_data: `reject_plan:${activity.plan.id}:${sessionId}`,
									},
								],
							];

							await bot.sendMessage(topicId, messageText, {
								reply_markup: { inline_keyboard },
								parse_mode: "MarkdownV2",
							});
						} else if (activity.type === "userMessaged") {
							// Usually we don't need to re-render what the user just typed, but if it comes from somewhere else we could.
						} else if (activity.type === "planApproved") {
							// We might want to notify that the plan was approved if Jules confirms it.
						}
					}

					// Update last_activity_count in database
					await db
						.prepare(
							"UPDATE sessions SET last_activity_count = ?, updated_at = ? WHERE jules_session_id = ?",
						)
						.bind(activities.length, new Date().toISOString(), sessionId)
						.run();
				}
			} catch (err) {
				console.error(
					`Error fetching activities for session ${sessionId}:`,
					err,
				);
			}
		}
	},
};
