const KEY = 'goblin.referral';
const TTL = 30 * 24 * 60 * 60 * 1000;
export const normalizeReferral = value => typeof value === 'string' && /^[A-Z0-9]{3,32}$/i.test(value.trim()) ? value.trim().toUpperCase() : '';

// First valid invitation wins for 30 days, until a successful registration.
// Storage may be unavailable in private/restricted browser contexts.
export function captureReferral(search = window.location.search, storage, now = Date.now()) {
  if (!storage) try { storage = window.localStorage; } catch { /* optional storage */ }
  let saved;
  try { saved = JSON.parse(storage.getItem(KEY)); } catch { /* no usable storage */ }
  if (normalizeReferral(saved?.code) && Number.isFinite(saved?.at) && now >= saved.at && now - saved.at < TTL) return saved.code;
  try { storage.removeItem(KEY); } catch { /* optional storage */ }
  const code = normalizeReferral(new URLSearchParams(search).get('ref'));
  if (code) try { storage.setItem(KEY, JSON.stringify({ code, at: now })); } catch { /* URL still works */ }
  return code;
}

export function clearReferral() {
  try { window.localStorage.removeItem(KEY); } catch { /* optional storage */ }
}
