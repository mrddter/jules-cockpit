import { createMiddleware } from "hono/factory";
import { z } from "zod";
import type { Env } from "../index.js";

const telegramUpdateSchema = z
	.object({
		message: z
			.object({
				from: z
					.object({
						id: z.number(),
					})
					.optional(),
				new_chat_members: z.array(z.any()).optional(),
			})
			.optional(),
		callback_query: z
			.object({
				from: z
					.object({
						id: z.number(),
					})
					.optional(),
			})
			.optional(),
	})
	.passthrough();

export const authMiddleware = createMiddleware<{ Bindings: Env }>(
	async (c, next) => {
		try {
			const body = await c.req.json();
			const parsed = telegramUpdateSchema.safeParse(body);

			if (!parsed.success) {
				// Malformed request, silently drop to avoid retries
				return c.json({ ok: true }, 200);
			}

			const update = parsed.data;

			// Bypass check if it's a new_chat_members event (TSK-2.2 needs to process this)
			if (
				update.message?.new_chat_members &&
				update.message.new_chat_members.length > 0
			) {
				return await next();
			}

			let userId: number | undefined;

			if (update.message?.from?.id) {
				userId = update.message.from.id;
			} else if (update.callback_query?.from?.id) {
				userId = update.callback_query.from.id;
			}

			if (!userId) {
				// No user ID found, skip auth and silently drop
				return c.json({ ok: true }, 200);
			}

			// Query D1 for user
			const db = c.env.DB;
			const stmt = db
				.prepare("SELECT user_id FROM users_whitelist WHERE user_id = ?")
				.bind(userId.toString());
			const user = await stmt.first();

			if (!user) {
				// User not in whitelist, drop request
				return c.json({ ok: true }, 200);
			}

			// User is authorized
			return await next();
		} catch (error) {
			// If JSON parsing fails or DB error, return 200 to prevent retries
			console.error("Error in auth middleware:", error);
			return c.json({ ok: true }, 200);
		}
	},
);
