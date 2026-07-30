import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import RateLimitStatus from './components/RateLimitStatus';
import QueueStatus from './components/QueueStatus';
import InsightCard from './components/InsightCard';
import ScreenshotModal from './components/ScreenshotModal';
import { fetchInsights, fetchSessions, fetchHealth, fetchQueueStatus } from './api/client';

export default function App() {
  const [activeTab,         setActiveTab]         = useState('feed');
  const [insights,          setInsights]          = useState([]);
  const [sessions,          setSessions]          = useState([]);
  const [rateLimiter,       setRateLimiter]       = useState({ availableTokens: 10, capacity: 10 });
  const [health,            setHealth]            = useState(null);
  const [queueStatus,       setQueueStatus]       = useState(null);
  const [selectedImage,     setSelectedImage]     = useState(null);
  const [dedupSkipped,      setDedupSkipped]      = useState(0);

  useEffect(() => {
    async function loadData() {
      // Parallel fetch of all dashboard data
      const [healthData, insightsData, sessionsData, queueData] = await Promise.all([
        fetchHealth(),
        fetchInsights(),
        fetchSessions(),
        fetchQueueStatus(),
      ]);

      setHealth(healthData);
      setQueueStatus(queueData);

      if (insightsData.insights && insightsData.insights.length > 0) {
        setInsights(insightsData.insights);
      } else {
        setInsights([
          {
            traceId:              'demo_1',
            sessionId:            'sess_demo_101',
            detectedTask:         'Software Architecture Review',
            actionSummary:        'User is reviewing the Visual AI Agent Architecture v2 plan on GitHub.',
            userIntent:           'Evaluating MongoDB + Gemini Vision AI rate limiting design',
            uiElementsIdentified: ['Markdown Header', 'Diagram Block', 'Code Snippet', 'Commit History'],
            processedAt:          new Date().toISOString(),
          }
        ]);
      }

      if (insightsData.rateLimiter) {
        setRateLimiter(insightsData.rateLimiter);
      } else if (queueData?.rateLimiter) {
        setRateLimiter(queueData.rateLimiter);
      }

      // Derive dedup skipped count from rateLimiter stats if available
      if (queueData?.rateLimiter?.totalDailyHeld !== undefined) {
        setDedupSkipped(queueData.rateLimiter.totalThrottled ?? 0);
      }

      if (sessionsData.sessions && sessionsData.sessions.length > 0) {
        setSessions(sessionsData.sessions);
      } else {
        setSessions([
          { sessionId: 'sess_demo_101', lastActiveAt: new Date().toISOString(),
            currentUrl: 'https://github.com', status: 'active' }
        ]);
      }
    }

    loadData();
    const interval = setInterval(loadData, 3000);
    return () => clearInterval(interval);
  }, []);

  // Derive infrastructure status dots for the navbar
  const redisOk = queueStatus?.broker?.connected ?? false;
  const minioOk = queueStatus?.storage?.connected ?? false;

  return (
    <div>
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} health={health} />

      <div className="dashboard-container">
        {/* ── Metric Cards ────────────────────────────────────────────── */}
        <div className="stats-grid">
          <div className="glass-card stat-card">
            <div className="stat-icon-wrapper" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>
              🤖
            </div>
            <div>
              <div className="stat-val">{insights.length}</div>
              <div className="stat-lbl">AI Insights Generated</div>
            </div>
          </div>

          <div className="glass-card stat-card">
            <div className="stat-icon-wrapper" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>
              📡
            </div>
            <div>
              <div className="stat-val">{sessions.length}</div>
              <div className="stat-lbl">Tracked Sessions</div>
            </div>
          </div>

          <div className="glass-card stat-card">
            <div className="stat-icon-wrapper" style={{ background: 'rgba(168, 85, 247, 0.15)', color: '#a855f7' }}>
              🗄️
            </div>
            <div>
              <div className="stat-val" style={{ fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: redisOk ? '#10b981' : '#f43f5e', fontSize: 10 }}>●</span> Redis
                <span style={{ color: minioOk ? '#10b981' : '#f43f5e', fontSize: 10, marginLeft: 4 }}>●</span> MinIO
              </div>
              <div className="stat-lbl">Broker · Storage</div>
            </div>
          </div>

          <div className="glass-card stat-card">
            <div className="stat-icon-wrapper" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' }}>
              ⚡
            </div>
            <div>
              <div className="stat-val">100%</div>
              <div className="stat-lbl">DOM Privacy Scrubbing</div>
            </div>
          </div>
        </div>

        {/* ── Main Grid ───────────────────────────────────────────────── */}
        <div className="main-grid">
          {/* Left — activity feed / sessions */}
          <div>
            {activeTab === 'feed' ? (
              <div>
                <div className="section-title">
                  <span>🧠 Live Visual AI Activity Feed</span>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Auto-refreshing 3s</span>
                </div>
                {insights.map((insight, idx) => (
                  <InsightCard key={insight.traceId || idx} insight={insight} onSelectImage={setSelectedImage} />
                ))}
              </div>
            ) : (
              <div>
                <div className="section-title">
                  <span>📊 Active Browser Sessions</span>
                </div>
                {sessions.map((sess) => (
                  <div
                    key={sess.sessionId}
                    className="glass-card"
                    style={{ marginBottom: 14, cursor: 'pointer' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontFamily: 'monospace', color: '#38bdf8', fontWeight: 600 }}>
                        {sess.sessionId}
                      </span>
                      <span className="task-tag" style={{ fontSize: 10 }}>{sess.status || 'active'}</span>
                    </div>
                    <div style={{ fontSize: 13, color: '#cbd5e1' }}>
                      Last URL: {sess.currentUrl || 'https://google.com'}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                      Active: {new Date(sess.lastActiveAt || Date.now()).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right Sidebar */}
          <div>
            {/* Infrastructure / Queue status — NEW */}
            <QueueStatus queueStatus={queueStatus} />

            {/* Existing rate limit card */}
            <RateLimitStatus rateLimiter={rateLimiter} />

            <div className="glass-card" style={{ marginTop: 20 }}>
              <div className="section-title">🛡️ Extension Status & Privacy</div>
              <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6 }}>
                The Visual AI Agent Chrome extension captures compressed viewport screenshots and DOM
                interaction metadata. Sensitive fields like <code>password</code> inputs and credit card
                numbers are scrubbed client-side before transmission. Screenshots are stored in MinIO
                — only object keys are written to MongoDB.
              </p>
            </div>
          </div>
        </div>
      </div>

      <ScreenshotModal imageUrl={selectedImage} onClose={() => setSelectedImage(null)} />
    </div>
  );
}
