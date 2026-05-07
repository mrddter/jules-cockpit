export class TelegramBot {
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: Needed for later
  private token: string;
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: Needed for later
  private supergroupId: string;

  constructor(token: string, supergroupId: string) {
    this.token = token;
    this.supergroupId = supergroupId;
  }

  // Telegram API methods will go here
}
