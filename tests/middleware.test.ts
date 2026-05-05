import { describe, it, expect, vi } from 'vitest';
import { isUserWhitelisted } from '../src/telegram/middleware';

describe('Telegram Middleware', () => {
    it('should return true if user is whitelisted', async () => {
        const mockDb = {
            prepare: vi.fn().mockReturnThis(),
            bind: vi.fn().mockReturnThis(),
            first: vi.fn().mockResolvedValue({ user_id: '123' })
        };

        const result = await isUserWhitelisted(123, mockDb as any);
        expect(result).toBe(true);
        expect(mockDb.prepare).toHaveBeenCalledWith('SELECT user_id FROM users_whitelist WHERE user_id = ?');
        expect(mockDb.bind).toHaveBeenCalledWith('123');
    });

    it('should return false if user is not whitelisted', async () => {
        const mockDb = {
            prepare: vi.fn().mockReturnThis(),
            bind: vi.fn().mockReturnThis(),
            first: vi.fn().mockResolvedValue(null)
        };

        const result = await isUserWhitelisted(456, mockDb as any);
        expect(result).toBe(false);
    });
});
