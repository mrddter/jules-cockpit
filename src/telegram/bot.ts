/**
 * Telegram bot for Jules Cockpit.
 * Uses HTML parse mode to avoid MarkdownV2 escaping issues.
 */

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    message_thread_id?: number;
    chat: { id: number; type: string };
    text?: string;
    from?: { id: number; username?: string; first_name?: string };
    new_chat_members?: Array<{ id: number; username?: string; first_name?: string }>;
  };
  callback_query?: {
    id: string;
    from: { id: number; username?: string; first_name?: string };
    message?: {
      message_id: number;
      message_thread_id?: number;
      chat: { id: number };
    };
    data: string;
  };
}

export class TelegramBot {
  private token: string;
  private baseUrl: string;

  constructor(token: string) {
    this.token = token;
    this.baseUrl = `https://api.telegram.org/bot${token}`;
  }

  async sendMessage(chatId: string | number, text: string, options?: { message_thread_id?: number; reply_markup?: any }): Promise<any> {
    try {
      const payload: any = {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      };

      if (options?.message_thread_id) {
        payload.message_thread_id = options.message_thread_id;
      }

      if (options?.reply_markup) {
        payload.reply_markup = options.reply_markup;
      }

      const res = await fetch(`${this.baseUrl}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error('Telegram send failed:', res.status, errorText);
      }

      return await res.json();
    } catch (err) {
      console.error('Telegram error:', (err as Error).message);
    }
  }

  async banChatMember(chatId: string | number, userId: number): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/banChatMember`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          user_id: userId,
        }),
      });
    } catch (err) {
      console.error('Telegram banChatMember error:', (err as Error).message);
    }
  }

  async editMessageText(chatId: string | number, messageId: number, text: string, options?: { reply_markup?: any }): Promise<void> {
    try {
      const payload: any = {
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      };

      if (options?.reply_markup) {
        payload.reply_markup = options.reply_markup;
      }

      await fetch(`${this.baseUrl}/editMessageText`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.error('Telegram editMessageText error:', (err as Error).message);
    }
  }

  async createForumTopic(chatId: string | number, name: string): Promise<number | null> {
    try {
      const res = await fetch(`${this.baseUrl}/createForumTopic`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          name: name,
        }),
      });

      const data: any = await res.json();
      if (data.ok && data.result) {
        return data.result.message_thread_id;
      }
      return null;
    } catch (err) {
      console.error('Telegram createForumTopic error:', (err as Error).message);
      return null;
    }
  }
}
