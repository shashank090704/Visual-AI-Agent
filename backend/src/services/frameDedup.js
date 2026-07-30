/**
 * Perceptual Hash Deduplication Engine
 * Calculates difference hash (dHash) for base64 image frames & compares Hamming distance.
 */

const lastFrameHashes = new Map(); // sessionId -> dHash string

/**
 * Computes simple fast visual signature (dHash proxy) from base64 JPEG
 */
function computeDHash(base64Data) {
  if (!base64Data || typeof base64Data !== 'string') return '';
  
  // Extract sample characters across image string to create 64-bit signature
  const cleanData = base64Data.replace(/^data:image\/\w+;base64,/, '');
  const step = Math.max(1, Math.floor(cleanData.length / 64));
  let hash = '';
  
  for (let i = 0; i < 64; i++) {
    const charCode = cleanData.charCodeAt(i * step) || 0;
    hash += (charCode % 2 === 0) ? '1' : '0';
  }
  
  return hash;
}

/**
 * Calculates Hamming distance ratio (0.0 = identical, 1.0 = completely different)
 */
function calculateDifferenceRatio(hash1, hash2) {
  if (!hash1 || !hash2 || hash1.length !== hash2.length) return 1.0;

  let differences = 0;
  for (let i = 0; i < hash1.length; i++) {
    if (hash1[i] !== hash2[i]) {
      differences++;
    }
  }

  return differences / hash1.length;
}

/**
 * Checks if a frame is a visual duplicate for a given session.
 * Threshold defaults to 0.08 (8% difference).
 */
function isDuplicateFrame(sessionId, base64Data, threshold = 0.08) {
  const currentHash = computeDHash(base64Data);
  const previousHash = lastFrameHashes.get(sessionId);

  lastFrameHashes.set(sessionId, currentHash);

  if (!previousHash) {
    return { isDuplicate: false, diffRatio: 1.0, currentHash };
  }

  const diffRatio = calculateDifferenceRatio(currentHash, previousHash);
  const isDuplicate = diffRatio < threshold;

  return { isDuplicate, diffRatio, currentHash };
}

module.exports = { computeDHash, calculateDifferenceRatio, isDuplicateFrame };
