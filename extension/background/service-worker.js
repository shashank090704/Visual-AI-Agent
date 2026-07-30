/**
 * Background Service Worker - Visual AI Agent
 * Captures visible tab screenshots, batches events, and manages agent monitoring state.
 */

import { uploadPayload } from '../utils/uploader.js';

let isMonitoring = true;
let currentSessionId = null;
const CAPTURE_INTERVAL_SEC = 10;

// Initialize Session ID & Storage State
async function initializeState() {
  const result = await chrome.storage.local.get(['isMonitoring', 'sessionId']);
  if (result.isMonitoring !== undefined) {
    isMonitoring = result.isMonitoring;
  } else {
    await chrome.storage.local.set({ isMonitoring: true });
  }

  if (result.sessionId) {
    currentSessionId = result.sessionId;
  } else {
    currentSessionId = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    await chrome.storage.local.set({ sessionId: currentSessionId });
  }

  updateBadge();
}

// Update Extension Action Badge
function updateBadge() {
  if (isMonitoring) {
    chrome.action.setBadgeText({ text: 'ON' });
    chrome.action.setBadgeBackgroundColor({ color: '#10B981' }); // Green
  } else {
    chrome.action.setBadgeText({ text: 'OFF' });
    chrome.action.setBadgeBackgroundColor({ color: '#EF4444' }); // Red
  }
}

// Listen for messages from Content Script or Popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TOGGLE_MONITORING') {
    isMonitoring = message.status;
    chrome.storage.local.set({ isMonitoring });
    updateBadge();
    sendResponse({ success: true, isMonitoring });
    return true;
  }

  if (message.type === 'GET_STATUS') {
    sendResponse({ isMonitoring, sessionId: currentSessionId });
    return true;
  }

  if (message.type === 'BATCH_DOM_EVENTS' && isMonitoring) {
    if (message.events && message.events.length > 0) {
      uploadPayload({
        sessionId: currentSessionId,
        events: message.events
      });
    }
    sendResponse({ status: 'queued' });
    return true;
  }
});

// Alarm Listener for Screenshot Capture Loop
chrome.alarms.create('visual_ai_capture_alarm', { periodInMinutes: CAPTURE_INTERVAL_SEC / 60 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'visual_ai_capture_alarm' || !isMonitoring) return;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('edge://')) {
      return;
    }

    // Capture visible viewport screenshot as compressed JPEG
    const dataUrl = await chrome.tabs.captureVisibleTab(null, {
      format: 'jpeg',
      quality: 45
    });

    if (dataUrl) {
      await uploadPayload({
        sessionId: currentSessionId,
        events: [
          {
            type: 'screenshot',
            url: tab.url,
            tabTitle: tab.title || '',
            screenshot: dataUrl,
            timestamp: Date.now()
          }
        ]
      });
    }
  } catch (error) {
    console.warn('[Visual AI Agent] Capture error:', error.message);
  }
});

// Startup Initialization
chrome.runtime.onInstalled.addListener(initializeState);
chrome.runtime.onStartup.addListener(initializeState);
initializeState();
