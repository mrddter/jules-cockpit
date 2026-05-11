import type { Context } from "hono";
import type { Env } from "../index.js";
import { TelegramBot } from "../telegram/bot.js";
import { JulesClient } from "../jules/client.js";

export const telegramWebhookHandler = async (c: Context<{ Bindings: Env }>) => {
	try {
		const update = await c.req.json();

		// TSK-2.2: Auto-Kick degli Intrusi
		if (
			update.message?.new_chat_members &&
			update.message.new_chat_members.length > 0
		) {
			const chatId = update.message.chat.id;
			const newMembers = update.message.new_chat_members;

			const bot = new TelegramBot(
				c.env.TELEGRAM_BOT_TOKEN,
				c.env.TELEGRAM_SUPERGROUP_ID,
			);
			const db = c.env.DB;

			for (const member of newMembers) {
				if (member.is_bot) continue;

				const userId = member.id;
				const stmt = db
					.prepare("SELECT user_id FROM users_whitelist WHERE user_id = ?")
					.bind(userId.toString());
				const user = await stmt.first();

				if (!user) {
					// User not in whitelist, kick them
					console.log(
						`Kicking unauthorized user ${userId} from chat ${chatId}`,
					);
					await bot.banChatMember(chatId.toString(), userId.toString());
				}
			}

			// Successfully handled new members
			return c.json({ ok: true }, 200);
		}

		// TSK-6.4 Gestione Callback Queries
		if (update.callback_query) {
			const data = update.callback_query.data;
			const messageId = update.callback_query.message?.message_id;
			const threadId = update.callback_query.message?.message_thread_id;
			const bot = new TelegramBot(
				c.env.TELEGRAM_BOT_TOKEN,
				c.env.TELEGRAM_SUPERGROUP_ID,
			);

			if (data && messageId) {
				if (data.startsWith("approve_plan:")) {
					const parts = data.split(":");
					const sessionId = parts[2];

					if (sessionId) {
						try {
							const julesClient = new JulesClient(c.env.JULES_API_KEY);
							await julesClient.approvePlan(sessionId);

							await bot.editMessageText(messageId, "✅ Piano approvato", {
								message_thread_id: threadId,
							});
						} catch (err) {
							console.error("Error approving plan:", err);
						}
					}
				} else if (data.startsWith("reject_plan:")) {
					try {
						await bot.editMessageText(messageId, "❌ Piano rifiutato", {
							message_thread_id: threadId,
						});
					} catch (err) {
						console.error("Error rejecting plan:", err);
					}
				}
			}

			return c.json({ ok: true }, 200);
		}

		// TSK-5.1 Isolamento Logico del Topic
		if (update.message?.text) {
			const messageThreadId = update.message.message_thread_id;
			const bot = new TelegramBot(
				c.env.TELEGRAM_BOT_TOKEN,
				c.env.TELEGRAM_SUPERGROUP_ID,
			);

			if (!messageThreadId) {
				// Ignora silenziosamente i messaggi scritti al di fuori di un topic
				return c.json({ ok: true }, 200);
			}

			// Trova il repository
			const db = c.env.DB;
			const stmt = db
				.prepare(
					"SELECT repo_name FROM repositories WHERE telegram_topic_id = ?",
				)
				.bind(messageThreadId.toString());
			const repo = await stmt.first<{ repo_name: string }>();

			if (!repo) {
				// Messaggio in un topic sconosciuto, ignoriamo silenziosamente o inviamo un avviso
				return c.json({ ok: true }, 200);
			}

			const text = update.message.text as string;
			const repoName = repo.repo_name;

			// TSK-5.2 Gestione Comandi del Ciclo di Vita (/new, /close, /list, /open)
			if (text.startsWith("/")) {
				const [command, ...args] = text.split(" ");

				if (command === "/new") {
					const activeSessionStmt = db
						.prepare(
							"SELECT jules_session_id FROM sessions WHERE telegram_topic_id = ? AND status = ?",
						)
						.bind(messageThreadId.toString(), "active");
					const activeSession = await activeSessionStmt.first<{
						jules_session_id: string;
					}>();

					if (activeSession) {
						await bot.sendMessage(
							messageThreadId,
							"C'è già una sessione attiva. Usa /close prima",
						);
					} else {
						const prompt =
							args.length > 0
								? args.join(" ")
								: "Avvia una nuova sessione operativa.";

						// Per non bloccare webhook eseguiamo in background
						c.executionCtx.waitUntil(
							(async () => {
								try {
									const julesClient = new JulesClient(c.env.JULES_API_KEY);
									const session = await julesClient.createSession(
										repoName,
										prompt,
									);

									await db
										.prepare(
											"INSERT INTO sessions (jules_session_id, telegram_topic_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
										)
										.bind(
											session.id,
											messageThreadId.toString(),
											"active",
											new Date().toISOString(),
											new Date().toISOString(),
										)
										.run();

									await bot.sendMessage(
										messageThreadId,
										`Nuova sessione avviata con successo: ${session.id}`,
									);
								} catch (err) {
									console.error("Error creating session", err);
									await bot.sendMessage(
										messageThreadId,
										"Errore nell'avvio della sessione.",
									);
								}
							})(),
						);
					}
					return c.json({ ok: true }, 200);
				}

				if (command === "/close") {
					const activeSessionStmt = db
						.prepare(
							"SELECT jules_session_id FROM sessions WHERE telegram_topic_id = ? AND status = ?",
						)
						.bind(messageThreadId.toString(), "active");
					const activeSession = await activeSessionStmt.first<{
						jules_session_id: string;
					}>();

					if (activeSession) {
						await db
							.prepare(
								"UPDATE sessions SET status = ?, updated_at = ? WHERE jules_session_id = ?",
							)
							.bind(
								"archived",
								new Date().toISOString(),
								activeSession.jules_session_id,
							)
							.run();
						await bot.sendMessage(messageThreadId, "Sessione archiviata.");
					} else {
						await bot.sendMessage(
							messageThreadId,
							"Nessuna sessione attiva da chiudere.",
						);
					}
					return c.json({ ok: true }, 200);
				}

				if (command === "/list") {
					const sessionsStmt = db
						.prepare(
							"SELECT jules_session_id, status, created_at FROM sessions WHERE telegram_topic_id = ? ORDER BY created_at DESC LIMIT 10",
						)
						.bind(messageThreadId.toString());
					const { results } = await sessionsStmt.all<{
						jules_session_id: string;
						status: string;
						created_at: string;
					}>();

					if (!results || results.length === 0) {
						await bot.sendMessage(messageThreadId, "Nessuna sessione trovata.");
					} else {
						const listText = results
							.map(
								(s) =>
									`- ${s.jules_session_id} (${s.status}) [${s.created_at}]`,
							)
							.join("\n");
						await bot.sendMessage(
							messageThreadId,
							`Sessioni recenti:\n${listText}`,
						);
					}
					return c.json({ ok: true }, 200);
				}

				if (command === "/open") {
					const sessionId = args[0];
					if (!sessionId) {
						await bot.sendMessage(messageThreadId, "Uso: /open <session_id>");
						return c.json({ ok: true }, 200);
					}

					// Trova se esiste
					const targetSessionStmt = db
						.prepare(
							"SELECT status FROM sessions WHERE jules_session_id = ? AND telegram_topic_id = ?",
						)
						.bind(sessionId, messageThreadId.toString());
					const targetSession = await targetSessionStmt.first();

					if (!targetSession) {
						await bot.sendMessage(
							messageThreadId,
							"Sessione non trovata per questo topic.",
						);
						return c.json({ ok: true }, 200);
					}

					// Archivia la corrente se presente
					await db
						.prepare(
							"UPDATE sessions SET status = ?, updated_at = ? WHERE telegram_topic_id = ? AND status = ?",
						)
						.bind(
							"archived",
							new Date().toISOString(),
							messageThreadId.toString(),
							"active",
						)
						.run();

					// Imposta active
					await db
						.prepare(
							"UPDATE sessions SET status = ?, updated_at = ? WHERE jules_session_id = ?",
						)
						.bind("active", new Date().toISOString(), sessionId)
						.run();

					await bot.sendMessage(
						messageThreadId,
						`Sessione ${sessionId} impostata come attiva.`,
					);
					return c.json({ ok: true }, 200);
				}
			}

			// TSK-5.3 Inoltro Trasparente dei Messaggi (Chat)
			// Se il messaggio non è un comando (già catturato sopra per l'early return)
			const activeSessionStmt = db
				.prepare(
					"SELECT jules_session_id FROM sessions WHERE telegram_topic_id = ? AND status = ?",
				)
				.bind(messageThreadId.toString(), "active");
			const activeSession = await activeSessionStmt.first<{
				jules_session_id: string;
			}>();

			if (!activeSession) {
				// Ignora silenziosamente se non c'è una sessione attiva
				return c.json({ ok: true }, 200);
			}

			// Invia a Jules in background
			c.executionCtx.waitUntil(
				(async () => {
					try {
						const julesClient = new JulesClient(c.env.JULES_API_KEY);
						await julesClient.sendUserMessage(
							activeSession.jules_session_id,
							text,
						);
						// Optional: potresti inviare un feedback visivo a Telegram, ma l'agente Jules risponderà da solo via webhook
					} catch (err) {
						console.error("Error sending message to Jules:", err);
						await bot.sendMessage(
							messageThreadId,
							"Errore di comunicazione con Jules.",
						);
					}
				})(),
			);

			return c.json({ ok: true }, 200);
		}

		return c.json({ ok: true }, 200);
	} catch (error) {
		console.error("Error in telegramWebhookHandler:", error);
		return c.json({ ok: true }, 200);
	}
};
