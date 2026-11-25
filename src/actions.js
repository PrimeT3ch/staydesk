import { randomUUID } from 'crypto';
import { loadData, saveData } from './store.js';
import {
  CATEGORIES,
  URGENCIES,
  addRequest,
  buildReport,
  buildView,
  findUnit,
  matchChoice,
} from './resolvers/logic.js';

// Rovo agent action: reads StayDesk data and returns a plain-text report.
export async function getStayDeskSummary(payload) {
  const data = await loadData();
  const unitName = payload ? payload.unitName : undefined;
  return buildReport(data, Date.now(), unitName);
}

// Rovo agent action: logs a new repair request on behalf of the user.
export async function logRepairRequest(payload) {
  const input = payload || {};
  const data = await loadData();

  if (data.units.length === 0) {
    return 'Nothing was logged: there are no units yet. The user must add a unit on the StayDesk page first.';
  }

  const unit = findUnit(data, input.unitName);
  if (!unit) {
    return `Nothing was logged: no single unit matches "${input.unitName || ''}". Existing units: ${data.units
      .map((u) => u.name)
      .join(', ')}. Ask the user which unit they mean.`;
  }

  const category = matchChoice(CATEGORIES, input.category);
  if (!category) {
    return `Nothing was logged: "${input.category || ''}" is not a valid category. Valid categories: ${CATEGORIES.join(', ')}. Ask the user to choose one.`;
  }

  const urgency = matchChoice(URGENCIES, input.urgency);
  if (!urgency) {
    return `Nothing was logged: "${input.urgency || ''}" is not a valid urgency. Valid urgencies: ${URGENCIES.join(', ')}. Ask the user to choose one.`;
  }

  const newId = randomUUID();
  const result = addRequest(
    data,
    { unitId: unit.id, category, urgency, title: input.description },
    newId,
    new Date().toISOString()
  );
  if (!result.ok) {
    return `Nothing was logged: ${result.error}`;
  }
  if (!(await saveData(result.data))) {
    return 'Nothing was logged: StayDesk storage is full. Old requests need to be cleared first.';
  }

  const logged = buildView(result.data, Date.now()).requests.find((r) => r.id === newId);
  let message = `Logged: [${urgency}] ${unit.name} | ${category} | ${logged.title}.`;
  if (logged.isRepeat) {
    message += ` Warning: this is a repeat fault. ${unit.name} has had ${logged.repeatCount} ${category} problems in the last 90 days.`;
  }
  return message;
}
