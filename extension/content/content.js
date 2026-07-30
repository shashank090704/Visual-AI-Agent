/**
 * Content Script - Visual AI Agent
 * Captures DOM interactions & redacts sensitive information.
 */

(function () {
  let eventBatch = [];
  const BATCH_INTERVAL_MS = 3000;

  // Redaction helper: Check if an element or its input contains sensitive information
  function isSensitiveElement(element) {
    if (!element) return false;
    
    // Check element attributes
    const inputType = (element.getAttribute('type') || '').toLowerCase();
    const autocomplete = (element.getAttribute('autocomplete') || '').toLowerCase();
    const isDataPrivate = element.hasAttribute('data-private') || element.closest('[data-private]');

    if (inputType === 'password') return true;
    if (autocomplete.includes('cc-number') || autocomplete.includes('cvv') || autocomplete.includes('card')) return true;
    if (isDataPrivate) return true;

    return false;
  }

  // Generate clean, safe target selector string
  function getSafeSelector(element) {
    if (!element) return 'unknown';
    if (isSensitiveElement(element)) return '[REDACTED_SENSITIVE_INPUT]';

    const tag = element.tagName ? element.tagName.toLowerCase() : 'element';
    const id = element.id ? `#${element.id}` : '';
    const className = element.className && typeof element.className === 'string' 
      ? `.${element.className.trim().split(/\s+/).slice(0, 2).join('.')}` 
      : '';
    
    return `${tag}${id}${className}`;
  }

  // Click Listener
  document.addEventListener('click', (e) => {
    if (isSensitiveElement(e.target)) return;

    const eventData = {
      type: 'click',
      target: getSafeSelector(e.target),
      url: window.location.href,
      tabTitle: document.title,
      coordinates: { x: Math.round(e.clientX), y: Math.round(e.clientY) },
      timestamp: Date.now()
    };

    queueEvent(eventData);
  }, true);

  // Scroll Listener (Throttled)
  let scrollTimeout = null;
  document.addEventListener('scroll', () => {
    if (scrollTimeout) return;
    scrollTimeout = setTimeout(() => {
      scrollTimeout = null;
      queueEvent({
        type: 'scroll',
        target: 'window',
        url: window.location.href,
        tabTitle: document.title,
        scrollTop: Math.round(window.scrollY),
        timestamp: Date.now()
      });
    }, 1500);
  }, { passive: true });

  // Queue event for batch submission
  function queueEvent(evt) {
    eventBatch.push(evt);
  }

  // Flush events to background service worker every BATCH_INTERVAL_MS
  setInterval(() => {
    if (eventBatch.length === 0) return;

    const batchToSend = [...eventBatch];
    eventBatch = [];

    chrome.runtime.sendMessage({
      type: 'BATCH_DOM_EVENTS',
      events: batchToSend
    }, () => {
      // Ignore runtime errors if extension reloaded
      if (chrome.runtime.lastError) {
        // Retry logic could go here
      }
    });
  }, BATCH_INTERVAL_MS);

})();
