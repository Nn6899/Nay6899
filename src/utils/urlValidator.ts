/**
 * Utility for validating and categorizing external solution URLs safely.
 * Strictly prevents XSS, javascript: pseudoprotocols, data URIs, or malicious schemes.
 */

export type UrlProvider = 'youtube' | 'facebook' | 'website';

export interface ValidatedSolutionLink {
  originalUrl: string;
  safeUrl: string;
  provider: UrlProvider;
  label: string;
}

/**
 * Validates whether a URL is secure (only http: and https:)
 * and does not contain dangerous schemes like javascript:, data:, vbscript:.
 */
export function isSafeUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;

  const trimmed = url.trim();
  if (!trimmed) return false;

  // Disallow obvious dangerous protocols before even parsing
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('file:') ||
    lower.startsWith('blob:')
  ) {
    return false;
  }

  try {
    const parsed = new URL(trimmed);
    // Strictly require http: or https:
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    // Hostname must exist and not be empty
    if (!parsed.hostname || parsed.hostname.length === 0) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Categorizes a valid safe URL as YouTube, Facebook, or general Website
 */
export function getUrlProvider(safeUrl: string): UrlProvider {
  try {
    const parsed = new URL(safeUrl);
    const host = parsed.hostname.toLowerCase();

    if (
      host === 'youtube.com' ||
      host.endsWith('.youtube.com') ||
      host === 'youtu.be' ||
      host.endsWith('.youtu.be')
    ) {
      return 'youtube';
    }

    if (
      host === 'facebook.com' ||
      host.endsWith('.facebook.com') ||
      host === 'fb.com' ||
      host.endsWith('.fb.com') ||
      host === 'fb.watch' ||
      host.endsWith('.fb.watch')
    ) {
      return 'facebook';
    }

    return 'website';
  } catch {
    return 'website';
  }
}

/**
 * Sanitizes and validates a list of solution links, returning only valid safe links.
 */
export function filterAndValidateSolutionLinks(
  links?: (string | null | undefined)[]
): ValidatedSolutionLink[] {
  if (!links || !Array.isArray(links)) return [];

  const results: ValidatedSolutionLink[] = [];

  for (const raw of links) {
    if (!raw) continue;
    const trimmed = raw.trim();
    if (!isSafeUrl(trimmed)) continue;

    const provider = getUrlProvider(trimmed);
    let label = 'Xem lời giải (Website)';
    if (provider === 'youtube') {
      label = 'Xem lời giải trên YouTube';
    } else if (provider === 'facebook') {
      label = 'Xem lời giải trên Facebook';
    }

    results.push({
      originalUrl: raw,
      safeUrl: trimmed,
      provider,
      label,
    });
  }

  return results;
}
