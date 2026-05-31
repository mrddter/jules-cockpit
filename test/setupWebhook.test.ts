import { beforeEach, describe, expect, it, vi } from "vitest";
import app from "../src/index.js";

// biome-ignore lint/complexity/useArrowFunction: Vitest mock requirement
vi.mock("node-fetch", function () {
	return {
		default: vi.fn(),
	};
});

describe("Setup Webhook Route", () => {
	const MOCK_ENV = {
		TELEGRAM_BOT_TOKEN: "mock-token",
		JULES_API_KEY: "mock-jules-key",
		TELEGRAM_SUPERGROUP_ID: "-100123456789",
		WEBHOOK_SETUP_SECRET: "my-secret-token",
		DB: {} as D1Database,
	};

	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("should return 401 Unauthorized if secret header is missing", async () => {
		const req = new Request("http://localhost/setup-webhook", {
			method: "GET",
		});
		const res = await app.fetch(req, MOCK_ENV);

		expect(res.status).toBe(401);
		const data = await res.json();
		expect(data).toEqual({ error: "Unauthorized" });
	});

	it("should return 401 Unauthorized if secret header is incorrect", async () => {
		const req = new Request("http://localhost/setup-webhook", {
			method: "GET",
			headers: {
				"X-Webhook-Secret": "wrong-secret",
			},
		});
		const res = await app.fetch(req, MOCK_ENV);

		expect(res.status).toBe(401);
		const data = await res.json();
		expect(data).toEqual({ error: "Unauthorized" });
	});

	it("should set webhook and return success if secret header is correct", async () => {
		const mockFetchResponse = new Response(
			JSON.stringify({ ok: true, result: true }),
			{
				status: 200,
				headers: { "Content-Type": "application/json" },
			},
		);

		const fetchMock = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValueOnce(mockFetchResponse);

		const req = new Request("https://my-worker.com/setup-webhook", {
			method: "GET",
			headers: {
				"X-Webhook-Secret": MOCK_ENV.WEBHOOK_SETUP_SECRET,
			},
		});
		const res = await app.fetch(req, MOCK_ENV);

		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data).toEqual({ ok: true, result: true });

		expect(fetchMock).toHaveBeenCalledTimes(1);
		// biome-ignore lint/style/noNonNullAssertion: safe here since toHaveBeenCalledTimes is checked
		const [url, options] = fetchMock.mock.calls[0]!;
		expect(url).toBe(
			`https://api.telegram.org/bot${MOCK_ENV.TELEGRAM_BOT_TOKEN}/setWebhook`,
		);
		expect(options?.method).toBe("POST");

		const body = JSON.parse(options?.body as string);
		expect(body.url).toBe("https://my-worker.com/webhook/telegram");
	});

	it("should handle Telegram API errors gracefully", async () => {
		const mockFetchResponse = new Response(
			JSON.stringify({ ok: false, description: "Bad Request" }),
			{
				status: 400,
				headers: { "Content-Type": "application/json" },
			},
		);

		const _fetchMock = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValueOnce(mockFetchResponse);

		const req = new Request("https://my-worker.com/setup-webhook", {
			method: "GET",
			headers: {
				"X-Webhook-Secret": MOCK_ENV.WEBHOOK_SETUP_SECRET,
			},
		});
		const res = await app.fetch(req, MOCK_ENV);

		// The route currently just forwards the response json, so it should be 200 from the worker's perspective
		// if we didn't throw an error, or whatever Telegram returns
		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data).toEqual({ ok: false, description: "Bad Request" });
	});

	it("should handle fetch throwing an error", async () => {
		const _consoleErrorMock = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});

		const _fetchMock = vi
			.spyOn(globalThis, "fetch")
			.mockRejectedValueOnce(new Error("Network failure"));

		const req = new Request("https://my-worker.com/setup-webhook", {
			method: "GET",
			headers: {
				"X-Webhook-Secret": MOCK_ENV.WEBHOOK_SETUP_SECRET,
			},
		});
		const res = await app.fetch(req, MOCK_ENV);

		expect(res.status).toBe(500);
		const data = await res.json();
		expect(data).toEqual({ error: "Failed to set webhook" });
	});
});
