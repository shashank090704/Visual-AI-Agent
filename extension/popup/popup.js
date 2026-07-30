/**
 * Popup Logic - Visual AI Agent
 */

document.addEventListener('DOMContentLoaded', () => {
  const toggleSwitch = document.getElementById('toggle-switch');
  const statusText = document.getElementById('status-text');
  const statusDot = document.getElementById('status-dot');
  const sessionIdEl = document.getElementById('session-id');

  // Fetch current status from background worker
  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
    if (response) {
      toggleSwitch.checked = response.isMonitoring;
      sessionIdEl.textContent = response.sessionId || 'Unknown';
      updateUI(response.isMonitoring);
    }
  });

  // Handle Toggle Switch Change
  toggleSwitch.addEventListener('change', (e) => {
    const isMonitoring = e.target.checked;
    updateUI(isMonitoring);

    chrome.runtime.sendMessage({
      type: 'TOGGLE_MONITORING',
      status: isMonitoring
    });
  });

  function updateUI(active) {
    if (active) {
      statusText.textContent = 'Active';
      statusText.className = 'badge';
      statusDot.className = 'pulse-dot';
    } else {
      statusText.textContent = 'Paused';
      statusText.className = 'badge inactive';
      statusDot.className = 'pulse-dot inactive';
    }
  }
});
