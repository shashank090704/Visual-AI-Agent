/**
 * Gemini Vision AI Service — Architecture v2
 *
 * Model is read from GEMINI_MODEL env var (default: gemini-1.5-flash-latest).
 *
 * 429 error handling distinguishes:
 *   RPM_THROTTLE   — per-minute limit hit; worker should back off briefly and retry
 *   RPD_EXHAUSTED  — daily limit exhausted; worker should stop and hold the stream
 */

require('dotenv').config();
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');

const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

let genAI = null;
if (process.env.GEMINI_API_KEY) {
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
}

/* ─── Error types the caller can act on ───────────────────────────────────── */
class GeminiRpmThrottleError extends Error {
  constructor(msg) { super(msg); this.type = 'RPM_THROTTLE'; }
}
class GeminiRpdExhaustedError extends Error {
  constructor(msg) { super(msg); this.type = 'RPD_EXHAUSTED'; }
}

/* ─── Main analysis function ─────────────────────────────────────────────── */

/**
 * Analyse a screenshot and tab metadata using Gemini Vision.
 * @param {{ screenshot: string, url: string, tabTitle: string }} opts
 * @returns {Promise<object>} Structured AI insight
 * @throws {GeminiRpmThrottleError | GeminiRpdExhaustedError}
 */
async function analyzeScreenCapture({ screenshot, url, tabTitle }) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (apiKey && genAI) {
    try {
      const model = genAI.getGenerativeModel({
        model: MODEL_NAME,
        safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT,        threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,       threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        ]
      });

      const cleanBase64 = screenshot.replace(/^data:image\/\w+;base64,/, '');
      const imagePart = {
        inlineData: { data: cleanBase64, mimeType: 'image/jpeg' }
      };

      const prompt = `You are a Visual AI Agent monitoring browser activity for productivity and UX analysis.
Analyze this screenshot and tab metadata:
URL: ${url}
Tab Title: ${tabTitle}

Return a valid JSON object strictly matching this format (no markdown, no code blocks, pure JSON only):
{
  "detectedTask": "Short summary of the task being performed (max 8 words)",
  "actionSummary": "1-2 sentence description of what user is viewing or doing",
  "userIntent": "Inferred goal of the user",
  "uiElementsIdentified": ["Element 1", "Element 2", "Element 3"],
  "confidence": 0.95,
  "riskOrAnomalyScore": 0.0
}`;

      const result = await model.generateContent([prompt, imagePart]);
      const textResponse = result.response.text();
      const jsonText = textResponse.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(jsonText);

      return {
        detectedTask:         parsed.detectedTask         || 'Browsing Web Page',
        actionSummary:        parsed.actionSummary        || `User is active on ${tabTitle}`,
        userIntent:           parsed.userIntent           || 'Information lookup',
        uiElementsIdentified: parsed.uiElementsIdentified || ['Navigation Bar', 'Content Body'],
        confidence:           parsed.confidence           ?? 0.92,
        riskOrAnomalyScore:   parsed.riskOrAnomalyScore   ?? 0.0,
        modelUsed:            MODEL_NAME,
      };

    } catch (error) {
      // Parse the 429 subtype from the error message / status
      const msg = error.message || '';
      if (error.status === 429 || msg.includes('429')) {
        if (
          msg.toLowerCase().includes('resource_exhausted') ||
          msg.toLowerCase().includes('dailylimitexceeded') ||
          msg.toLowerCase().includes('quota_exceeded')
        ) {
          throw new GeminiRpdExhaustedError(`Gemini daily quota exhausted: ${msg}`);
        }
        throw new GeminiRpmThrottleError(`Gemini RPM throttle: ${msg}`);
      }
      console.warn('[Gemini AI] API call failed:', msg);
      // Non-quota errors fall through to the rule-based fallback
    }
  }

  // Fallback rule-based engine when API key is missing or a non-quota error occurs
  return generateRuleBasedInsight(url, tabTitle);
}

/* ─── Rule-based fallback ────────────────────────────────────────────────── */

function generateRuleBasedInsight(url, tabTitle) {
  const lowerUrl   = (url   || '').toLowerCase();
  const lowerTitle = (tabTitle || '').toLowerCase();

  let detectedTask         = 'General Web Browsing';
  let actionSummary        = `User is browsing ${tabTitle || 'web page'}`;
  let userIntent           = 'General Information Discovery';
  let uiElementsIdentified = ['Viewport', 'Web Content'];

  if (lowerUrl.includes('github.com')) {
    detectedTask         = 'Software Development & Code Review';
    actionSummary        = `User is inspecting GitHub repository: "${tabTitle}"`;
    userIntent           = 'Reviewing code, pull requests, or issues';
    uiElementsIdentified = ['Code Editor', 'File Explorer', 'Branch Dropdown', 'Commit History'];
  } else if (lowerUrl.includes('google.com/search') || lowerUrl.includes('bing.com')) {
    detectedTask         = 'Web Search & Research';
    actionSummary        = `User is searching for queries: "${tabTitle}"`;
    userIntent           = 'Finding documentation, technical solutions, or answers';
    uiElementsIdentified = ['Search Input Box', 'Search Results Cards', 'Header Navigation'];
  } else if (lowerUrl.includes('youtube.com')) {
    detectedTask         = 'Video Content Consumption';
    actionSummary        = `User is watching video content: "${tabTitle}"`;
    userIntent           = 'Learning from tutorial or entertainment';
    uiElementsIdentified = ['Video Player Control', 'Related Videos Column', 'Comments Section'];
  } else if (lowerUrl.includes('stackoverflow.com')) {
    detectedTask         = 'Technical Troubleshooting';
    actionSummary        = `User is reading Q&A on Stack Overflow: "${tabTitle}"`;
    userIntent           = 'Debugging error codes or API implementations';
    uiElementsIdentified = ['Question Container', 'Accepted Answer Card', 'Code Snippets'];
  } else if (lowerUrl.includes('localhost') || lowerUrl.includes('127.0.0.1')) {
    detectedTask         = 'Local Application Development';
    actionSummary        = `User is testing local web application: "${tabTitle}"`;
    userIntent           = 'Debugging local frontend UI or backend API';
    uiElementsIdentified = ['App Interface', 'Console Overlay', 'Navigation Menu'];
  }

  return {
    detectedTask,
    actionSummary,
    userIntent,
    uiElementsIdentified,
    confidence:         0.88,
    riskOrAnomalyScore: 0.0,
    modelUsed:          'rule-engine-fallback',
  };
}

module.exports = { analyzeScreenCapture, GeminiRpmThrottleError, GeminiRpdExhaustedError };
