/**
 * Token Bucket Rate Limiter — Architecture v2
 *
 * Reads limits from environment variables so they never need a code change:
 *   GEMINI_RPM_LIMIT  — max requests per minute (token bucket capacity & refill rate)
 *   GEMINI_RPD_LIMIT  — max requests per day (daily hard cap)
 *
 * Distinguishes two 429 scenarios:
 *   RPM throttle  → tryConsume() returns false, worker backs off and retries
 *   RPD exhausted → isDailyQuotaExhausted() returns true, worker holds stream
 */

class TokenBucketRateLimiter {
  constructor() {
    this.capacity          = parseInt(process.env.GEMINI_RPM_LIMIT, 10) || 10;
    this.refillRate        = this.capacity; // tokens per minute
    this.tokens            = this.capacity;
    this.lastRefill        = Date.now();

    this.dailyLimit        = parseInt(process.env.GEMINI_RPD_LIMIT, 10) || 1500;
    this.dailyUsed         = 0;
    this.dailyResetAt      = this._nextMidnightUTC();

    this.totalRequestsHandled = 0;
    this.totalThrottled       = 0;
    this.totalDailyHeld       = 0;
  }

  /* ─── Internal ──────────────────────────────────────────────────────────── */

  _nextMidnightUTC() {
    const d = new Date();
    d.setUTCHours(24, 0, 0, 0);
    return d.getTime();
  }

  _checkDailyReset() {
    if (Date.now() >= this.dailyResetAt) {
      this.dailyUsed    = 0;
      this.dailyResetAt = this._nextMidnightUTC();
      console.log('[RateLimiter] Daily quota reset.');
    }
  }

  refill() {
    const now = Date.now();
    const elapsedMinutes = (now - this.lastRefill) / 60_000;
    const tokensToAdd    = elapsedMinutes * this.refillRate;

    if (tokensToAdd >= 0.001) {
      this.tokens    = Math.min(this.capacity, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }
  }

  /* ─── Public API ─────────────────────────────────────────────────────────── */

  /**
   * Returns true if the per-minute token bucket has a token available and the
   * daily quota has not been exhausted. Consumes one token if successful.
   */
  tryConsume() {
    this._checkDailyReset();
    this.refill();

    if (this.dailyUsed >= this.dailyLimit) {
      this.totalDailyHeld++;
      return false;
    }

    if (this.tokens >= 1) {
      this.tokens               -= 1;
      this.dailyUsed            += 1;
      this.totalRequestsHandled += 1;
      return true;
    }

    this.totalThrottled++;
    return false;
  }

  /**
   * Records a failed Gemini call that was reported as daily-quota-exhausted
   * (HTTP 429 with RESOURCE_EXHAUSTED / dailyLimitExceeded reason).
   * Forces the worker to stop consuming until the quota resets.
   */
  markDailyQuotaExhausted() {
    this.dailyUsed = this.dailyLimit;
    console.warn('[RateLimiter] Daily Gemini quota marked as exhausted. Worker will hold stream until UTC midnight.');
  }

  /**
   * True when the daily quota is gone — worker should hold the stream, not ack messages.
   */
  isDailyQuotaExhausted() {
    this._checkDailyReset();
    return this.dailyUsed >= this.dailyLimit;
  }

  getStatus() {
    this._checkDailyReset();
    this.refill();
    return {
      availableTokens:      Math.floor(this.tokens),
      capacity:             this.capacity,
      dailyUsed:            this.dailyUsed,
      dailyLimit:           this.dailyLimit,
      dailyQuotaExhausted:  this.isDailyQuotaExhausted(),
      dailyResetsAt:        new Date(this.dailyResetAt).toISOString(),
      totalRequestsHandled: this.totalRequestsHandled,
      totalThrottled:       this.totalThrottled,
      totalDailyHeld:       this.totalDailyHeld,
      isQuotaAvailable:     !this.isDailyQuotaExhausted() && this.tokens >= 1,
    };
  }
}

const geminiRateLimiter = new TokenBucketRateLimiter();

function getRateLimiterStatus() {
  return geminiRateLimiter.getStatus();
}

module.exports = { geminiRateLimiter, getRateLimiterStatus };
