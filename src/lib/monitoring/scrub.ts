/**
 * Removes personal data from error reports before they leave the device: customer names
 * and phones, staff emails, tokens. Only ids (uuids), roles and technical details are kept.
 */

const EMAIL = /[^\s@"'<>]+@[^\s@"'<>]+\.[a-z]{2,}/gi;
// Egyptian mobiles and other long digit runs (with spaces, dashes or +), in Latin or Arabic-Indic digits.
const PHONE = /\+?[\d٠-٩][\d٠-٩ \-]{7,}[\d٠-٩]/g;
const BEARER = /\b(Bearer\s+)[\w.-]+/gi;
const JWT = /\beyJ[\w-]+\.[\w-]+\.[\w-]+/g;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

export function scrubText(text: string): string {
  // Uuids are fine (no personal data) but their digit runs look like phones: keep them aside.
  const ids: string[] = [];
  const masked = text.replace(UUID, (id) => {
    ids.push(id);
    return `\u0000${ids.length - 1}\u0000`;
  });
  return masked
    .replace(JWT, '[token]')
    .replace(BEARER, '$1[token]')
    .replace(EMAIL, '[email]')
    .replace(PHONE, '[phone]')
    .replace(/\u0000(\d+)\u0000/g, (_, i: string) => ids[Number(i)] ?? '');
}

/** Field names whose values are never sent, whatever they contain. */
const SECRET_KEYS =
  /^(email|phone|customer_name|customer_phone|name|display_name|note|notes|reference|reason|password|token|access_token|refresh_token|authorization|apikey)$/i;

export function scrubValue(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return scrubText(value);
  if (depth > 6 || value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => scrubValue(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SECRET_KEYS.test(key) ? '[removed]' : scrubValue(v, depth + 1);
  }
  return out;
}

type ReportEvent = {
  message?: string;
  user?: Record<string, unknown>;
  request?: unknown;
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
  exception?: { values?: { value?: string }[] };
  breadcrumbs?: { message?: string; data?: Record<string, unknown> }[];
};

/** Applied to every event (beforeSend). Keeps only the user's id. */
export function scrubEvent<E extends ReportEvent>(event: E): E {
  const user = event.user?.id != null ? { id: event.user.id } : undefined;
  return {
    ...event,
    user,
    request: undefined,
    message: event.message != null ? scrubText(event.message) : undefined,
    extra: event.extra ? (scrubValue(event.extra) as Record<string, unknown>) : undefined,
    contexts: event.contexts ? (scrubValue(event.contexts) as Record<string, unknown>) : undefined,
    exception: event.exception
      ? {
          ...event.exception,
          values: event.exception.values?.map((v) => ({
            ...v,
            value: v.value != null ? scrubText(v.value) : v.value,
          })),
        }
      : undefined,
    breadcrumbs: event.breadcrumbs?.map(scrubBreadcrumb),
  };
}

export function scrubBreadcrumb<B extends { message?: string; data?: Record<string, unknown> }>(
  crumb: B,
): B {
  return {
    ...crumb,
    message: crumb.message != null ? scrubText(crumb.message) : undefined,
    data: crumb.data ? (scrubValue(crumb.data) as Record<string, unknown>) : undefined,
  };
}
