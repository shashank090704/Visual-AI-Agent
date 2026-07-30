/**
 * Dashboard API Client — Architecture v2
 */

const BASE_URL = 'http://localhost:5000/api/v1';

export async function fetchInsights() {
  try {
    const res = await fetch(`${BASE_URL}/insights`, { headers: { 'x-agent-id': 'agent_demo_user' } });
    if (!res.ok) throw new Error('Failed to fetch insights');
    return await res.json();
  } catch (error) {
    console.warn('[API Client] fetchInsights fallback:', error.message);
    return { insights: [], rateLimiter: { availableTokens: 10, capacity: 10 } };
  }
}

export async function fetchSessions() {
  try {
    const res = await fetch(`${BASE_URL}/sessions`, { headers: { 'x-agent-id': 'agent_demo_user' } });
    if (!res.ok) throw new Error('Failed to fetch sessions');
    return await res.json();
  } catch (error) {
    console.warn('[API Client] fetchSessions fallback:', error.message);
    return { sessions: [] };
  }
}

export async function fetchSessionDetails(sessionId) {
  try {
    const res = await fetch(`${BASE_URL}/sessions/${sessionId}`, { headers: { 'x-agent-id': 'agent_demo_user' } });
    if (!res.ok) throw new Error('Failed to fetch session details');
    return await res.json();
  } catch (error) {
    console.warn('[API Client] fetchSessionDetails fallback:', error.message);
    return { session: { sessionId }, events: [], insights: [] };
  }
}

export async function fetchHealth() {
  try {
    const res = await fetch('http://localhost:5000/health');
    if (!res.ok) throw new Error('Failed to fetch health status');
    return await res.json();
  } catch (error) {
    return { status: 'offline', mongoConnected: false, redisConnected: false, minioConnected: false };
  }
}

export async function fetchQueueStatus() {
  try {
    const res = await fetch(`${BASE_URL}/queue/status`, { headers: { 'x-agent-id': 'agent_demo_user' } });
    if (!res.ok) throw new Error('Failed to fetch queue status');
    return await res.json();
  } catch (error) {
    console.warn('[API Client] fetchQueueStatus fallback:', error.message);
    return {
      broker:  { connected: false, streamLength: 'N/A', pendingCount: 'N/A' },
      storage: { connected: false },
      worker:  { lastHeartbeat: null },
      rateLimiter: { availableTokens: 0, capacity: 10, dailyUsed: 0, dailyLimit: 1500 },
    };
  }
}
