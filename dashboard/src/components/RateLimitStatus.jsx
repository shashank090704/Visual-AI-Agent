import React from 'react';

export default function RateLimitStatus({ rateLimiter }) {
  const available = rateLimiter?.availableTokens ?? 10;
  const capacity = rateLimiter?.capacity ?? 10;
  const percentage = Math.round((available / capacity) * 100);

  return (
    <div className="glass-card">
      <div className="section-title">
        <span>⚡ Gemini Free Tier Rate Limiter</span>
        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
          {available}/{capacity} Tokens
        </span>
      </div>

      <div style={{ height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden', marginBottom: '12px' }}>
        <div 
          style={{ 
            height: '100%', 
            width: `${percentage}%`, 
            background: available > 2 ? 'linear-gradient(90deg, #10b981, #38bdf8)' : 'linear-gradient(90deg, #f59e0b, #f43f5e)',
            transition: 'width 0.5s ease'
          }} 
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-secondary)' }}>
        <span>Requests Processed: {rateLimiter?.totalRequestsHandled || 0}</span>
        <span>Throttled/Requeued: {rateLimiter?.totalThrottled || 0}</span>
      </div>
    </div>
  );
}
