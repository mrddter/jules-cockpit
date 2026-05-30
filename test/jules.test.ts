import { beforeEach, describe, expect, it, vi } from "vitest";
import { JulesClient } from "../src/jules/client.js";

describe("JulesClient", () => {
	const mockApiKey = "test-api-key";
	let client: JulesClient;
	const baseUrl = "https://jules.googleapis.com/v1alpha";

	beforeEach(() => {
		client = new JulesClient(mockApiKey);
		globalThis.fetch = vi.fn();
	});

	const mockFetchSuccess = (responseData: unknown) => {
		(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: async () => responseData,
		} as Response);
	};

	const mockFetchError = (
		status: number,
		statusText: string,
		errorData: unknown,
	) => {
		(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: false,
			status,
			statusText,
			json: async () => errorData,
			text: async () => JSON.stringify(errorData),
		} as Response);
	};

	describe("createSession", () => {
		it("should send correct POST request to create a session", async () => {
			const mockSession = { id: "session-123" };
			mockFetchSuccess(mockSession);

			const source = "test-repo";
			const prompt = "test-prompt";
			const result = await client.createSession(source, prompt);

			expect(globalThis.fetch).toHaveBeenCalledWith(
				`${baseUrl}/sessions`,
				expect.objectContaining({
					method: "POST",
					headers: expect.objectContaining({
						Authorization: `Bearer ${mockApiKey}`,
						"Content-Type": "application/json",
					}),
					body: JSON.stringify({
						requirePlanApproval: true,
						sourceContext: { repository: source },
						prompt,
					}),
				}),
			);
			expect(result).toEqual(mockSession);
		});

		it("should throw an error if API request fails", async () => {
			mockFetchError(400, "Bad Request", { error: "Invalid prompt" });

			await expect(
				client.createSession("source", "prompt"),
			).rejects.toThrowError(
				'Jules API error: 400 Bad Request - {"error":"Invalid prompt"}',
			);
		});
	});

	describe("getSession", () => {
		it("should send correct GET request to fetch a session", async () => {
			const mockSession = { id: "session-123" };
			mockFetchSuccess(mockSession);

			const sessionId = "session-123";
			const result = await client.getSession(sessionId);

			expect(globalThis.fetch).toHaveBeenCalledWith(
				`${baseUrl}/sessions/${sessionId}`,
				expect.objectContaining({
					headers: expect.objectContaining({
						Authorization: `Bearer ${mockApiKey}`,
					}),
				}),
			);
			expect(result).toEqual(mockSession);
		});
	});

	describe("sendUserMessage", () => {
		it("should send correct POST request to send user message", async () => {
			mockFetchSuccess({});

			const sessionId = "session-123";
			const message = "hello agent";
			await client.sendUserMessage(sessionId, message);

			expect(globalThis.fetch).toHaveBeenCalledWith(
				`${baseUrl}/sessions/${sessionId}:sendMessage`,
				expect.objectContaining({
					method: "POST",
					body: JSON.stringify({ message }),
					headers: expect.objectContaining({
						Authorization: `Bearer ${mockApiKey}`,
						"Content-Type": "application/json",
					}),
				}),
			);
		});
	});

	describe("approvePlan", () => {
		it("should send correct POST request to approve a plan", async () => {
			mockFetchSuccess({});

			const sessionId = "session-123";
			await client.approvePlan(sessionId);

			expect(globalThis.fetch).toHaveBeenCalledWith(
				`${baseUrl}/sessions/${sessionId}:approvePlan`,
				expect.objectContaining({
					method: "POST",
					body: JSON.stringify({}),
					headers: expect.objectContaining({
						Authorization: `Bearer ${mockApiKey}`,
						"Content-Type": "application/json",
					}),
				}),
			);
		});
	});

	describe("listActivities", () => {
		it("should send correct GET request to list activities", async () => {
			const mockActivities = [{ type: "agentMessaged", agentMessage: "hi" }];
			mockFetchSuccess({ activities: mockActivities });

			const sessionId = "session-123";
			const result = await client.listActivities(sessionId);

			expect(globalThis.fetch).toHaveBeenCalledWith(
				`${baseUrl}/sessions/${sessionId}/activities`,
				expect.objectContaining({
					headers: expect.objectContaining({
						Authorization: `Bearer ${mockApiKey}`,
					}),
				}),
			);
			expect(result).toEqual(mockActivities);
		});

		it("should correctly append pageSize parameter if provided", async () => {
			mockFetchSuccess({ activities: [] });

			const sessionId = "session-123";
			const pageSize = 10;
			await client.listActivities(sessionId, pageSize);

			expect(globalThis.fetch).toHaveBeenCalledWith(
				`${baseUrl}/sessions/${sessionId}/activities?pageSize=${pageSize}`,
				expect.objectContaining({
					headers: expect.objectContaining({
						Authorization: `Bearer ${mockApiKey}`,
					}),
				}),
			);
		});
	});
});
