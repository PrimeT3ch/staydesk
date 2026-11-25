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

// ---------------------------------------------------------------------------
// Helpers used by the Rovo agent actions
// ---------------------------------------------------------------------------

// Returns the canonical value from `list` that matches `value` ignoring case, or null.
export function matchChoice(list, value) {
  if (typeof value !== 'string') return null;
  const wanted = value.trim().toLowerCase();
  return list.find((item) => item.toLowerCase() === wanted) || null;
}

// Finds a unit by name: exact match (ignoring case) first, then a unique "contains" match.
export function findUnit(data, name) {
  if (typeof name !== 'string' || name.trim() === '') return null;
  const wanted = name.trim().toLowerCase();
  const exact = data.units.find((u) => u.name.toLowerCase() === wanted);
  if (exact) return exact;
  const partial = data.units.filter((u) => u.name.toLowerCase().includes(wanted));
  return partial.length === 1 ? partial[0] : null;
}

const dateOnly = (iso) => String(iso).slice(0, 10);

// Plain-text report that the Rovo agent reads to answer questions.
export function buildReport(data, nowMs, unitFilter) {
  const view = buildView(data, nowMs);
  const today = new Date(nowMs).toISOString().slice(0, 10);

  if (view.units.length === 0) {
    return 'StayDesk has no units yet. The user needs to add units on the StayDesk page in Jira before there is anything to report.';
  }

  let units = view.units;
  let requests = view.requests;
  let scope = 'all units';
  if (typeof unitFilter === 'string' && unitFilter.trim() !== '') {
    const unit = findUnit(data, unitFilter);
    if (!unit) {
      return `No single unit matches "${unitFilter.trim()}". Existing units: ${view.units
        .map((u) => u.name)
        .join(', ')}.`;
    }
    units = view.units.filter((u) => u.id === unit.id);
    requests = view.requests.filter((r) => r.unitId === unit.id);
    scope = unit.name;
  }

  const open = requests.filter((r) => r.status === 'Open');
  const resolved = requests.filter((r) => r.status === 'Resolved');
  const lines = [];
  lines.push(`StayDesk report for ${scope} (as of ${today}).`);
  lines.push(
    `Units (${units.length}): ${units.map((u) => `${u.name} (${u.openCount} open)`).join(', ')}.`
  );

  if (open.length === 0) {
    lines.push('There are no open requests.');
  } else {
    lines.push(`Open requests (${open.length}), most urgent first:`);
    open.forEach((r, i) => {
      const repeat = r.isRepeat ? ` | REPEAT FAULT x${r.repeatCount} in ${REPEAT_WINDOW_DAYS} days` : '';
      lines.push(
        `${i + 1}. [${r.urgency}] ${r.unitName} | ${r.category} | ${r.title} | logged ${dateOnly(r.createdAt)}${repeat}`
      );
    });
  }

  // Repeat-fault groups among open requests.
  const groups = new Map();
  open
    .filter((r) => r.isRepeat)
    .forEach((r) => {
      const key = `${r.unitName} / ${r.category}`;
      const g = groups.get(key) || { count: r.repeatCount, open: 0 };
      g.open += 1;
      groups.set(key, g);
    });
  if (groups.size > 0) {
    lines.push('Repeat faults (same unit and category at least twice in 90 days):');
    groups.forEach((g, key) =>
      lines.push(`- ${key}: ${g.count} problems in ${REPEAT_WINDOW_DAYS} days, ${g.open} still open`)
    );
  } else {
    lines.push('No repeat faults right now.');
  }

  if (resolved.length > 0) {
    const recent = resolved.slice(0, 5);
    lines.push(`Recently resolved (showing ${recent.length} of ${resolved.length}):`);
    recent.forEach((r) =>
      lines.push(`- ${r.unitName} | ${r.category} | ${r.title} | logged ${dateOnly(r.createdAt)}`)
    );
  }
  return lines.join('\n');
}
