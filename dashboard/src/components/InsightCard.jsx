import React from 'react';

export default function InsightCard({ insight, onSelectImage }) {
  const timeFormatted = new Date(insight.processedAt || Date.now()).toLocaleTimeString();

  return (
    <div className="glass-card insight-item">
      <div className="insight-header">
        <span className="task-tag">{insight.detectedTask || 'General Task'}</span>
        <span className="time-stamp">{timeFormatted}</span>
      </div>

      <div className="insight-body">
        {insight.actionSummary}
      </div>

      {insight.userIntent && (
        <div className="intent-box">
          <strong>User Intent:</strong> {insight.userIntent}
        </div>
      )}

      {insight.uiElementsIdentified && insight.uiElementsIdentified.length > 0 && (
        <div className="elements-wrap">
          {insight.uiElementsIdentified.map((el, i) => (
            <span key={i} className="element-chip">🔍 {el}</span>
          ))}
        </div>
      )}

      {insight.screenshotUrl && (
        <img
          src={insight.screenshotUrl}
          alt="Screen Capture"
          className="screenshot-thumbnail"
          onError={(e) => { e.target.style.display = 'none'; }}
          onClick={() => onSelectImage(insight.screenshotUrl)}
        />
      )}
    </div>
  );
}
