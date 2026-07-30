/**
 * Uploader Utility - Visual AI Agent
 * Handles REST API communication with the Express Ingestion Gateway.
 */

const API_ENDPOINT = 'http://localhost:5000/api/v1/activity';
const DEFAULT_AGENT_ID = 'agent_demo_user';

export async function uploadPayload(payload) {
  try {
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-agent-id': DEFAULT_AGENT_ID
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.warn(`[Visual AI Agent] Ingest server responded with status: ${response.status}`);
      return false;
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('[Visual AI Agent] Failed to upload activity payload:', error.message);
    return false;
  }
}
