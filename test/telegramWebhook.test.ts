import type { ExecutionContext } from "@cloudflare/workers-types";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { telegramWebhookHandler } from "../src/controllers/telegramWebhook.js";
import type { Env } from "../src/index.js";

const mockEditMessageText = vi.fn().mockResolvedValue(true);

// Mock TelegramBot
vi.mock("../src/telegram/bot.js", () => {
	return {
		// biome-ignore lint/complexity/useArrowFunction: Vitest mock requires a constructor function
		TelegramBot: vi.fn().mockImplementation(function () {
			return {
				sendMessage: vi.fn().mockResolvedValue(true),
				banChatMember: vi.fn().mockResolvedValue(true),
				editMessageText: mockEditMessageText,
			};
		}),
	};
});

// Mock JulesClient
const mockCreateSession = vi.fn().mockResolvedValue({ id: "new-session-123" });
const mockSendUserMessage = vi.fn().mockResolvedValue(undefined);
const mockApprovePlan = vi.fn().mockResolvedValue(undefined);

vi.mock("../src/jules/client.js", () => {
	return {
		// biome-ignore lint/complexity/useArrowFunction: Vitest mock requires a constructor function
		JulesClient: vi.fn().mockImplementation(function () {
			return {
				createSession: mockCreateSession,
				sendUserMessage: mockSendUserMessage,
				approvePlan: mockApprovePlan,
			};
		}),
	};
});

describe("telegramWebhookHandler (Phase 5)", () => {
	let app: Hono<{ Bindings: Env }>;
	let mockRun: ReturnType<typeof vi.fn>;
	let mockAll: ReturnType<typeof vi.fn>;
	let mockFirst: ReturnType<typeof vi.fn>;
	let mockBind: ReturnType<typeof vi.fn>;
	let mockPrepare: ReturnType<typeof vi.fn>;
	let mockDb: unknown;
	let env: Env;

	beforeEach(() => {
		vi.clearAllMocks();

		mockRun = vi.fn().mockResolvedValue({ success: true });
		mockAll = vi.fn().mockResolvedValue({ results: [] });
		mockFirst = vi.fn().mockResolvedValue(null);
		mockBind = vi
			.fn()
			.mockReturnValue({ run: mockRun, all: mockAll, first: mockFirst });
		mockPrepare = vi.fn().mockReturnValue({ bind: mockBind });
		mockDb = { prepare: mockPrepare };

		env = {
			TELEGRAM_BOT_TOKEN: "mock-token",
			TELEGRAM_SUPERGROUP_ID: "mock-group",
			DB: mockDb as D1Database,
			JULES_API_KEY: "mock-jules-key",
		};

		app = new Hono<{ Bindings: Env }>();
		app.post("/webhook/telegram", telegramWebhookHandler);
	});

	const createCtx = () => {
		let _waitUntilPromise: Promise<void> | undefined;
		return {
			waitUntil: (p: Promise<void>) => {
				_waitUntilPromise = p;
				return p;
			},
			passThroughOnException: () => {},
			_getWaitUntilPromise: () => _waitUntilPromise,
		} as unknown as ExecutionContext & {
			_getWaitUntilPromise: () => Promise<void> | undefined;
		};
	};

	it("TSK-5.1: should ignore messages without message_thread_id", async () => {
		const ctx = createCtx();
		const req = new Request("http://localhost/webhook/telegram", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				message: {
					chat: { id: 123 },
					text: "Hello",
					// no message_thread_id
				},
			}),
		});

		const res = await app.fetch(req, env, ctx);
		expect(res.status).toBe(200);

		// It should just return ok without querying DB for repo
		expect(mockPrepare).not.toHaveBeenCalledWith(
			"SELECT repo_name FROM repositories WHERE telegram_topic_id = ?",
		);
	});

	it("TSK-5.1: should ignore messages in unknown topics", async () => {
		const ctx = createCtx();
		mockFirst.mockResolvedValueOnce(null); // Repo non trovato

		const req = new Request("http://localhost/webhook/telegram", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				message: {
					chat: { id: 123 },
					message_thread_id: 42,
					text: "Hello",
				},
			}),
		});

		const res = await app.fetch(req, env, ctx);
		expect(res.status).toBe(200);

		expect(mockPrepare).toHaveBeenCalledWith(
			"SELECT repo_name FROM repositories WHERE telegram_topic_id = ?",
		);
		expect(mockBind).toHaveBeenCalledWith("42");
	});

	it("TSK-5.2: should handle /new command and create session", async () => {
		const ctx = createCtx();

		// Primo mock: Trova la repo
		mockFirst.mockResolvedValueOnce({ repo_name: "test-repo" });
		// Secondo mock: Nessuna sessione attiva
		mockFirst.mockResolvedValueOnce(null);

		const req = new Request("http://localhost/webhook/telegram", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				message: {
					chat: { id: 123 },
					message_thread_id: 42,
					text: "/new test prompt",
				},
			}),
		});

		const res = await app.fetch(req, env, ctx);
		expect(res.status).toBe(200);

		// Attendiamo la promise in background
		await ctx._getWaitUntilPromise();

		expect(mockCreateSession).toHaveBeenCalledWith("test-repo", "test prompt");
		expect(mockPrepare).toHaveBeenCalledWith(
			"INSERT INTO sessions (jules_session_id, telegram_topic_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
		);
		expect(mockRun).toHaveBeenCalled();
	});

	it("TSK-5.2: should handle /close command", async () => {
		const ctx = createCtx();

		mockFirst.mockResolvedValueOnce({ repo_name: "test-repo" }); // Trova repo
		mockFirst.mockResolvedValueOnce({ jules_session_id: "sess-1" }); // Trova sessione attiva

		const req = new Request("http://localhost/webhook/telegram", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				message: {
					chat: { id: 123 },
					message_thread_id: 42,
					text: "/close",
				},
			}),
		});

		const res = await app.fetch(req, env, ctx);
		expect(res.status).toBe(200);

		expect(mockPrepare).toHaveBeenCalledWith(
			"UPDATE sessions SET status = ?, updated_at = ? WHERE jules_session_id = ?",
		);
		expect(mockBind).toHaveBeenCalledWith(
			"archived",
			expect.any(String),
			"sess-1",
		);
		expect(mockRun).toHaveBeenCalled();
	});

	it("TSK-6.4: should handle approve_plan callback query", async () => {
		const ctx = createCtx();
		const req = new Request("http://localhost/webhook/telegram", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				callback_query: {
					data: "approve_plan:plan-123:sess-1",
					message: {
						message_id: 100,
						message_thread_id: 42,
					},
				},
			}),
		});

		const res = await app.fetch(req, env, ctx);
		expect(res.status).toBe(200);

		// Wait for the async task inside the webhook
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(mockApprovePlan).toHaveBeenCalledWith("sess-1");
		expect(mockEditMessageText).toHaveBeenCalledWith(
			100,
			"✅ Piano approvato",
			{ message_thread_id: 42 },
		);
	});

	it("TSK-6.4: should handle reject_plan callback query", async () => {
		const ctx = createCtx();
		const req = new Request("http://localhost/webhook/telegram", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				callback_query: {
					data: "reject_plan:plan-123:sess-1",
					message: {
						message_id: 100,
						message_thread_id: 42,
					},
				},
			}),
		});

		const res = await app.fetch(req, env, ctx);
		expect(res.status).toBe(200);

		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(mockApprovePlan).not.toHaveBeenCalled();
		expect(mockEditMessageText).toHaveBeenCalledWith(
			100,
			"❌ Piano rifiutato",
			{ message_thread_id: 42 },
		);
	});

	it("TSK-5.3: should forward non-command messages to active session", async () => {
		const ctx = createCtx();

		mockFirst.mockResolvedValueOnce({ repo_name: "test-repo" }); // Trova repo
		mockFirst.mockResolvedValueOnce({ jules_session_id: "sess-1" }); // Trova sessione attiva

		const req = new Request("http://localhost/webhook/telegram", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				message: {
					chat: { id: 123 },
					message_thread_id: 42,
					text: "just a normal message",
				},
			}),
		});

		const res = await app.fetch(req, env, ctx);
		expect(res.status).toBe(200);

		await ctx._getWaitUntilPromise();

		expect(mockSendUserMessage).toHaveBeenCalledWith(
			"sess-1",
			"just a normal message",
		);
	});
});
