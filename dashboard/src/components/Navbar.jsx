import React from 'react';

export default function Navbar({ activeTab, setActiveTab, health }) {
  return (
    <nav className="navbar">
      <div className="brand">
        <div className="brand-icon">👁️</div>
        <div>
          <h1>Visual AI Agent</h1>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
            Gemini Vision + MongoDB Tracking Gateway
          </div>
        </div>
      </div>

      <div className="nav-links">
        <button
          id="nav-btn-feed"
          className={`nav-btn ${activeTab === 'feed' ? 'active' : ''}`}
          onClick={() => setActiveTab('feed')}
        >
          AI Activity Feed
        </button>
        <button
          id="nav-btn-sessions"
          className={`nav-btn ${activeTab === 'sessions' ? 'active' : ''}`}
          onClick={() => setActiveTab('sessions')}
        >
          Sessions & Timeline
        </button>
      </div>

      <div className="pulse-badge active">
        <span className="dot"></span>
        {health?.mongoConnected ? 'MongoDB Connected' : 'Gateway Online'}
      </div>
    </nav>
  );
}
