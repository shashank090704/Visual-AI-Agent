import React from 'react';

export default function ScreenshotModal({ imageUrl, onClose }) {
  if (!imageUrl) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Captured Screen Frame</h3>
          <button 
            id="close-modal-btn"
            onClick={onClose}
            style={{ 
              background: 'transparent', 
              border: 'none', 
              color: '#94a3b8', 
              fontSize: '20px', 
              cursor: 'pointer' 
            }}
          >
            ✕
          </button>
        </div>
        <img src={imageUrl} alt="Enlarged Screen Capture" className="modal-img" />
      </div>
    </div>
  );
}
