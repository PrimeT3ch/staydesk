// StayDesk core logic: pure functions with no Forge imports, so they are easy to test.

export const CATEGORIES = [
  'Plumbing',
  'Electrical',
  'Air conditioning',
  'Appliance',
  'Cleaning',
  'Furniture',
  'Internet',
  'Other',
];
export const URGENCIES = ['Low', 'Medium', 'High'];
export const STATUSES = ['Open', 'Resolved'];

export const REPEAT_WINDOW_DAYS = 90;
export const REPEAT_THRESHOLD = 2;

export const MAX_UNITS = 50;
export const MAX_REQUESTS = 300;
// Forge stores up to 128 KiB per key; stay safely below that.
export const MAX_BYTES = 110000;

const DAY_MS = 24 * 60 * 60 * 1000;
const URGENCY_RANK = { High: 0, Medium: 1, Low: 2 };

export function emptyData() {
  return { units: [], requests: [] };
}

export function normalizeData(raw) {
  if (!raw || !Array.isArray(raw.units) || !Array.isArray(raw.requests)) {
    return emptyData();
  }
  return { units: raw.units, requests: raw.requests };
}

export function addUnit(data, name, id, nowIso) {
  const clean = typeof name === 'string' ? name.trim() : '';
  if (clean.length < 1) {
    return { ok: false, error: 'Please enter a unit name.' };
  }
  if (clean.length > 60) {
    return { ok: false, error: 'Unit names can be at most 60 characters.' };
  }
  if (data.units.length >= MAX_UNITS) {
    return { ok: false, error: `You can have at most ${MAX_UNITS} units.` };
  }
  const exists = data.units.some((u) => u.name.toLowerCase() === clean.toLowerCase());
  if (exists) {
    return { ok: false, error: `A unit named "${clean}" already exists.` };
  }
  const unit = { id, name: clean, createdAt: nowIso };
  return { ok: true, data: { ...data, units: [...data.units, unit] } };
}

export function addRequest(data, input, id, nowIso) {
  const title = input && typeof input.title === 'string' ? input.title.trim() : '';
  if (!input || !data.units.some((u) => u.id === input.unitId)) {
    return { ok: false, error: 'Please choose a unit.' };
  }
  if (!CATEGORIES.includes(input.category)) {
    return { ok: false, error: 'Please choose a category.' };
  }
  if (!URGENCIES.includes(input.urgency)) {
    return { ok: false, error: 'Please choose an urgency.' };
  }
  if (title.length < 3) {
    return { ok: false, error: 'Please describe the problem (at least 3 characters).' };
  }
  if (title.length > 100) {
    return { ok: false, error: 'Descriptions can be at most 100 characters.' };
  }
  if (data.requests.length >= MAX_REQUESTS) {
    return { ok: false, error: `You can store at most ${MAX_REQUESTS} requests.` };
  }
  const request = {
    id,
    unitId: input.unitId,
    title,
    category: input.category,
    urgency: input.urgency,
    status: 'Open',
    createdAt: nowIso,
    resolvedAt: null,
  };
  return { ok: true, data: { ...data, requests: [...data.requests, request] } };
}

export function setStatus(data, requestId, status, nowIso) {
  if (!STATUSES.includes(status)) {
    return { ok: false, error: 'Unknown status.' };
  }
  if (!data.requests.some((r) => r.id === requestId)) {
    return { ok: false, error: 'That request no longer exists.' };
  }
  const requests = data.requests.map((r) =>
    r.id === requestId
      ? { ...r, status, resolvedAt: status === 'Resolved' ? nowIso : null }
      : r
  );
  return { ok: true, data: { ...data, requests } };
}

// A request is a "repeat fault" when the same unit has had the same category of
// problem at least REPEAT_THRESHOLD times within the last REPEAT_WINDOW_DAYS days.
export function buildView(data, nowMs) {
  const cutoff = nowMs - REPEAT_WINDOW_DAYS * DAY_MS;
  const unitName = new Map(data.units.map((u) => [u.id, u.name]));

  const requests = data.requests.map((r) => {
    const repeatCount = data.requests.filter(
      (o) =>
        o.unitId === r.unitId &&
        o.category === r.category &&
        new Date(o.createdAt).getTime() >= cutoff
    ).length;
    const inWindow = new Date(r.createdAt).getTime() >= cutoff;
    return {
      ...r,
      unitName: unitName.get(r.unitId) || 'Unknown unit',
      repeatCount,
      isRepeat: inWindow && repeatCount >= REPEAT_THRESHOLD,
    };
  });

  requests.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'Open' ? -1 : 1;
    if (a.status === 'Open' && a.urgency !== b.urgency) {
      return URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency];
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const units = data.units.map((u) => ({
    id: u.id,
    name: u.name,
    openCount: requests.filter((r) => r.unitId === u.id && r.status === 'Open').length,
  }));

  return {
    units,
    requests,
    categories: CATEGORIES,
    urgencies: URGENCIES,
    summary: {
      units: units.length,
      open: requests.filter((r) => r.status === 'Open').length,
      repeats: requests.filter((r) => r.status === 'Open' && r.isRepeat).length,
    },
  };
}
