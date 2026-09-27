/**
 * Generates an unguessable, human-friendly public access code for a quiz test.
 * Avoids ambiguous characters like 0, O, I, 1, L.
 * Format: 8 uppercase alphanumeric characters, e.g. "X7KM9T2P"
 */
export function generatePublicCode(length: number = 8): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let result = '';
  
  // Use crypto API if available
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const randomValues = new Uint8Array(length);
    crypto.getRandomValues(randomValues);
    for (let i = 0; i < length; i++) {
      result += chars[randomValues[i] % chars.length];
    }
  } else {
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  }

  return result;
}

/**
 * Validates whether a public code string conforms to the expected format
 */
export function isValidPublicCode(code: string): boolean {
  if (!code || typeof code !== 'string') return false;
  const clean = code.trim().toUpperCase();
  return /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6,12}$/.test(clean);
}
