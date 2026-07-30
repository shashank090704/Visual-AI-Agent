/**
 * Queue Status Panel — Architecture v2
 * Shows Redis Streams broker, MinIO storage, AI worker, and rate-limiter state.
 */

import React from 'react';

function StatusDot({ connected }) {
  return (
    <span style={{
      display:      'inline-block',
      width:         9,
      height:        9,
      borderRadius: '50%',
      marginRight:   7,
      background:    connected ? '#10b981' : '#f43f5e',
      boxShadow:     connected ? '0 0 7px #10b981' : '0 0 7px #f43f5e',
      flexShrink:    0,
    }} />
  );
}

function Row({ label, value, mono }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <span style={{ fontSize: 12, color: '#94a3b8' }}>{label}</span>
      <span style={{ fontSize: 12, color: '#f8fafc',
                     fontFamily: mono ? "'JetBrains Mono', monospace" : 'inherit',
                     fontWeight: 600 }}>
        {value}
      </span>
    </div>
  );
}

export default function QueueStatus({ queueStatus }) {
  if (!queueStatus) return null;

  const { broker, storage, worker, rateLimiter } = queueStatus;

  const dailyPct = rateLimiter
    ? Math.round((rateLimiter.dailyUsed / (rateLimiter.dailyLimit || 1500)) * 100)
    : 0;

  const rpmPct = rateLimiter
    ? Math.round(((rateLimiter.capacity - rateLimiter.availableTokens) / (rateLimiter.capacity || 10)) * 100)
    : 0;

  const lastSeen = worker?.lastHeartbeat
    ? new Date(worker.lastHeartbeat).toLocaleTimeString()
    : 'Not seen';

  return (
    <div className="glass-card" style={{ marginBottom: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>🔧 Infrastructure Status</span>
      </div>

      {/* Service rows */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '7px 0',
                      borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <StatusDot connected={broker?.connected} />
          <span style={{ fontSize: 12, color: '#94a3b8', flex: 1 }}>Redis Streams</span>
          <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
                         color: broker?.connected ? '#10b981' : '#f43f5e', fontWeight: 700 }}>
            {broker?.connected ? 'Connected' : 'Offline'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', padding: '7px 0',
                      borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <StatusDot connected={storage?.connected} />
          <span style={{ fontSize: 12, color: '#94a3b8', flex: 1 }}>MinIO Storage</span>
          <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
                         color: storage?.connected ? '#10b981' : '#f43f5e', fontWeight: 700 }}>
            {storage?.connected ? 'Connected' : 'Offline'}
          </span>
        </div>

        <Row label="Stream messages"  value={broker?.streamLength ?? 'N/A'} mono />
        <Row label="Pending (un-acked)" value={broker?.pendingCount ?? 'N/A'} mono />
        <Row label="Worker last seen"  value={lastSeen} />
      </div>

      {/* Daily Quota Bar */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>Daily Quota (RPD)</span>
          <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
                         color: dailyPct >= 90 ? '#f43f5e' : dailyPct >= 70 ? '#f59e0b' : '#10b981' }}>
            {rateLimiter?.dailyUsed ?? 0} / {rateLimiter?.dailyLimit ?? 1500}
          </span>
        </div>
        <div style={{ height: 5, borderRadius: 4, background: 'rgba(255,255,255,0.08)' }}>
          <div style={{
            height:       '100%',
            borderRadius: 4,
            width:        `${Math.min(dailyPct, 100)}%`,
            background:   dailyPct >= 90 ? '#f43f5e' : dailyPct >= 70 ? '#f59e0b' : '#10b981',
            transition:   'width 0.4s ease',
          }} />
        </div>
      </div>

      {/* RPM Bucket Bar */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>Token Bucket (RPM)</span>
          <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#38bdf8' }}>
            {rateLimiter?.availableTokens ?? 0} / {rateLimiter?.capacity ?? 10} tokens
          </span>
        </div>
        <div style={{ height: 5, borderRadius: 4, background: 'rgba(255,255,255,0.08)' }}>
          <div style={{
            height:       '100%',
            borderRadius: 4,
            width:        `${Math.max(0, 100 - rpmPct)}%`,
            background:   'linear-gradient(90deg, #38bdf8, #818cf8)',
            transition:   'width 0.4s ease',
          }} />
        </div>
      </div>

      {rateLimiter?.dailyQuotaExhausted && (
        <div style={{
          marginTop:    12,
          padding:      '8px 12px',
          borderRadius: 8,
          background:   'rgba(244, 63, 94, 0.12)',
          border:       '1px solid rgba(244, 63, 94, 0.3)',
          fontSize:     12,
          color:        '#f43f5e',
        }}>
          ⚠️ Daily Gemini quota exhausted. Worker holding stream until UTC midnight.
          Resets: {rateLimiter?.dailyResetsAt ? new Date(rateLimiter.dailyResetsAt).toLocaleTimeString() : '—'}
        </div>
      )}
    </div>
  );
}
