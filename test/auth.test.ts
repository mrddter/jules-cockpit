import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { Env } from "../src/index.js";
import { authMiddleware } from "../src/middlewares/auth.js";

describe("Auth Middleware", () => {
	const createMockDb = (userExists: boolean) => {
		return {
			prepare: () => ({
				bind: () => ({
					first: async () => (userExists ? { user_id: "123" } : null),
				}),
			}),
		} as unknown as D1Database;
	};

	const createTestApp = (db: D1Database) => {
		const app = new Hono<{ Bindings: Env }>();

		// Inject the mock DB into the request environment
		app.use("*", async (c, next) => {
			c.env = { ...c.env, DB: db };
			await next();
		});

		app.use("*", authMiddleware);

		app.post("/webhook", (c) => c.json({ status: "ok" }, 200));
		return app;
	};

	it("should allow authorized users", async () => {
		const db = createMockDb(true);
		const app = createTestApp(db);

		const req = new Request("http://localhost/webhook", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				message: {
					from: { id: 123 },
					text: "hello",
				},
			}),
		});

		const res = await app.request(req);
		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data).toEqual({ status: "ok" });
	});

	it("should drop requests from unauthorized users silently", async () => {
		const db = createMockDb(false);
		const app = createTestApp(db);

		const req = new Request("http://localhost/webhook", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				message: {
					from: { id: 456 }, // Not in whitelist
					text: "hello",
				},
			}),
		});

		const res = await app.request(req);
		expect(res.status).toBe(200);
		const data = await res.json();
		// It should NOT reach the controller (which returns { status: 'ok' })
		expect(data).toEqual({ ok: true });
	});

	it("should bypass auth check for new_chat_members events", async () => {
		const db = createMockDb(false); // User is not authorized
		const app = createTestApp(db);

		const req = new Request("http://localhost/webhook", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				message: {
					from: { id: 456 },
					new_chat_members: [{ id: 456, is_bot: false, first_name: "test" }],
				},
			}),
		});

		const res = await app.request(req);
		expect(res.status).toBe(200);
		const data = await res.json();
		// It SHOULD reach the controller because the event bypassed auth
		expect(data).toEqual({ status: "ok" });
	});

	it("should handle callback_queries for authorized users", async () => {
		const db = createMockDb(true);
		const app = createTestApp(db);

		const req = new Request("http://localhost/webhook", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				callback_query: {
					from: { id: 123 },
					data: "some_data",
				},
			}),
		});

		const res = await app.request(req);
		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data).toEqual({ status: "ok" });
	});
});
