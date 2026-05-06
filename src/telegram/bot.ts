export class TelegramBot {
  private token: string;
  private supergroupId: string;

  constructor(token: string, supergroupId: string) {
    this.token = token;
    this.supergroupId = supergroupId;
  }

  // Telegram API methods will go here
}
