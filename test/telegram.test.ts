import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TelegramBot } from '../src/telegram/bot.js';

describe('TelegramBot', () => {
  const mockToken = 'test-token';
  const mockSupergroupId = '-1001234567890';
  let bot: TelegramBot;

  beforeEach(() => {
    bot = new TelegramBot(mockToken, mockSupergroupId);
    globalThis.fetch = vi.fn();
  });

  const mockFetchSuccess = (responseData: unknown) => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => responseData,
    } as Response);
  };

  const mockFetchError = () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      text: async () => 'Error',
    } as Response);
  };

  describe('createForumTopic', () => {
    it('should create a forum topic and return its id', async () => {
      mockFetchSuccess({ ok: true, result: { message_thread_id: 42 } });

      const result = await bot.createForumTopic('test-repo');

      expect(globalThis.fetch).toHaveBeenCalledWith(
        `https://api.telegram.org/bot${mockToken}/createForumTopic`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            chat_id: mockSupergroupId,
            name: 'test-repo',
          }),
        })
      );
      expect(result).toBe(42);
    });

    it('should return null if API call fails', async () => {
      mockFetchError();
      const result = await bot.createForumTopic('test-repo');
      expect(result).toBeNull();
    });

    it('should return null if response format is invalid', async () => {
      mockFetchSuccess({ ok: false });
      const result = await bot.createForumTopic('test-repo');
      expect(result).toBeNull();
    });
  });

  describe('sendMessage', () => {
    it('should send a message to a specific thread', async () => {
      mockFetchSuccess({ ok: true });

      const result = await bot.sendMessage(42, 'hello', { parse_mode: 'HTML' });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        `https://api.telegram.org/bot${mockToken}/sendMessage`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            chat_id: mockSupergroupId,
            message_thread_id: 42,
            text: 'hello',
            parse_mode: 'HTML'
          }),
        })
      );
      expect(result).toBe(true);
    });

    it('should return false if API call fails', async () => {
      mockFetchError();
      const result = await bot.sendMessage(42, 'hello');
      expect(result).toBe(false);
    });
  });
});
