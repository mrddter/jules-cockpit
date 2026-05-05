/**
 * Jules API Client
 * Documentazione: https://jules.google/docs/api/reference/
 */

export class JulesClient {
  private baseUrl = 'https://developers.google.com/jules/api'; // O l'endpoint corretto per le chiamate se diverso (es. https://api.jules.google)
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    // Utilizziamo un base URL fittizio/ipotetico basato sulla documentazione di esempio se non diversamente specificato
    this.baseUrl = 'https://api.jules.google/v1';
  }

  private getHeaders() {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
  }

  // --- Sessions ---

  async createSession(repoName: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/sessions`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        repository: repoName
      })
    });
    if (!res.ok) throw new Error(`Jules API error: ${res.statusText}`);
    return res.json();
  }

  async getSession(sessionId: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/sessions/${sessionId}`, {
      method: 'GET',
      headers: this.getHeaders()
    });
    if (!res.ok) throw new Error(`Jules API error: ${res.statusText}`);
    return res.json();
  }

  async listSessions(repoName: string): Promise<any[]> {
    const res = await fetch(`${this.baseUrl}/sessions?repository=${encodeURIComponent(repoName)}`, {
      method: 'GET',
      headers: this.getHeaders()
    });
    if (!res.ok) throw new Error(`Jules API error: ${res.statusText}`);
    const data: any = await res.json();
    return data.sessions || [];
  }

  // --- Activities ---

  async sendActivity(sessionId: string, text: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/sessions/${sessionId}/activities`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        type: 'message',
        payload: {
          text: text
        }
      })
    });
    if (!res.ok) throw new Error(`Jules API error: ${res.statusText}`);
    return res.json();
  }

  async getActivities(sessionId: string): Promise<any[]> {
    const res = await fetch(`${this.baseUrl}/sessions/${sessionId}/activities`, {
      method: 'GET',
      headers: this.getHeaders()
    });
    if (!res.ok) throw new Error(`Jules API error: ${res.statusText}`);
    const data: any = await res.json();
    return data.activities || [];
  }

  // --- Plans ---

  async approvePlan(sessionId: string, planId: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/sessions/${sessionId}/activities`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        type: 'plan_approval',
        payload: {
            plan_id: planId,
            approved: true
        }
      })
    });
    if (!res.ok) throw new Error(`Jules API error: ${res.statusText}`);
    return res.json();
  }

  async rejectPlan(sessionId: string, planId: string, reason?: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/sessions/${sessionId}/activities`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        type: 'plan_approval',
        payload: {
            plan_id: planId,
            approved: false,
            reason: reason || 'Rejected by user via Telegram'
        }
      })
    });
    if (!res.ok) throw new Error(`Jules API error: ${res.statusText}`);
    return res.json();
  }
}
