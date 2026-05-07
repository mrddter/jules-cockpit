export class TelegramBot {
  private token: string;
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: Needed for later
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

  // Telegram API methods will go here
}
