export interface Session {
  id: string;
  title?: string;
  sourceContext?: {
    repository?: string;
  };
}

export interface PlanStep {
  id: string;
  description: string;
}

export interface Plan {
  id: string;
  steps: PlanStep[];
}

export type Activity =
  | { type: 'agentMessaged'; agentMessage: string }
  | { type: 'planGenerated'; plan: Plan }
  | { type: 'planApproved' }
  | { type: 'userMessaged'; userMessage: string };

export class JulesClient {
  private apiKey: string;
  private baseUrl = 'https://jules.googleapis.com/v1alpha';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async fetch(path: string, options: RequestInit = {}): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    const headers = {
      ...options.headers,
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };

    const response = await fetch(url, { ...options, headers });

    if (!response.ok) {
      const text = await response.text();
      let errorData: unknown = text;
      try {
        errorData = JSON.parse(text);
      } catch {
        // Not JSON, keep as text
      }
      throw new Error(`Jules API error: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`);
    }

    return response;
  }

  async createSession(source: string, prompt: string): Promise<Session> {
    const response = await this.fetch('/sessions', {
      method: 'POST',
      body: JSON.stringify({
        requirePlanApproval: true,
        sourceContext: { repository: source },
        prompt,
      }),
    });
    return response.json() as Promise<Session>;
  }

  async getSession(sessionId: string): Promise<Session> {
    const response = await this.fetch(`/sessions/${sessionId}`);
    return response.json() as Promise<Session>;
  }

  async sendUserMessage(sessionId: string, message: string): Promise<void> {
    await this.fetch(`/sessions/${sessionId}:sendMessage`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
  }

  async approvePlan(sessionId: string): Promise<void> {
    await this.fetch(`/sessions/${sessionId}:approvePlan`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  async listActivities(sessionId: string, pageSize?: number): Promise<Activity[]> {
    const query = pageSize ? `?pageSize=${pageSize}` : '';
    const response = await this.fetch(`/sessions/${sessionId}/activities${query}`);
    const data = await response.json() as { activities: Activity[] };
    return data.activities || [];
  }
}
