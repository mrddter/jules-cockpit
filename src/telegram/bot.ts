export class TelegramBot {
  private token: string;
  private supergroupId: string;

  constructor(token: string, supergroupId: string) {
    this.token = token;
    this.supergroupId = supergroupId;
  }

  async banChatMember(chatId: string, userId: string): Promise<boolean> {
    const url = `https://api.telegram.org/bot${this.token}/banChatMember`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          user_id: userId,
          revoke_messages: true,
        }),
      });

      if (!response.ok) {
        console.error(`Failed to ban user ${userId} in chat ${chatId}:`, await response.text());
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error banning chat member:', error);
      return false;
    }
  }

  async createForumTopic(name: string): Promise<number | null> {
    const url = `https://api.telegram.org/bot${this.token}/createForumTopic`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.supergroupId,
          name: name,
        }),
      });

      if (!response.ok) {
        console.error(`Failed to create forum topic ${name}:`, await response.text());
        return null;
      }

      const data = await response.json() as { ok: boolean, result?: { message_thread_id: number } };
      if (!data.ok || !data.result?.message_thread_id) {
        console.error(`Invalid response from Telegram createForumTopic:`, data);
        return null;
      }
      return data.result.message_thread_id;
    } catch (error) {
      console.error('Error creating forum topic:', error);
      return null;
    }
  }

  async sendMessage(threadId: number, text: string, options?: Record<string, unknown>): Promise<boolean> {
    const url = `https://api.telegram.org/bot${this.token}/sendMessage`;
    try {
      const body = {
        chat_id: this.supergroupId,
        message_thread_id: threadId,
        text: text,
        ...options
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        console.error(`Failed to send message to thread ${threadId}:`, await response.text());
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error sending message:', error);
      return false;
    }
  }

}
