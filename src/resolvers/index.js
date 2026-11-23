import Resolver from '@forge/resolver';
import { kvs } from '@forge/kvs';
import { randomUUID } from 'crypto';
import {
  MAX_BYTES,
  addRequest,
  addUnit,
  buildView,
  normalizeData,
  setStatus,
} from './logic.js';

const DATA_KEY = 'staydesk-data';

const resolver = new Resolver();

async function loadData() {
  return normalizeData(await kvs.get(DATA_KEY));
}

// Saves the new data and returns the refreshed view for the screen.
async function saveAndRespond(result) {
  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  if (JSON.stringify(result.data).length > MAX_BYTES) {
    return { ok: false, error: 'Storage is full. Please resolve and remove old requests.' };
  }
  await kvs.set(DATA_KEY, result.data);
  return { ok: true, view: buildView(result.data, Date.now()) };
}

resolver.define('getData', async () => {
  const data = await loadData();
  return { ok: true, view: buildView(data, Date.now()) };
});

resolver.define('addUnit', async (req) => {
  const data = await loadData();
  const name = req.payload ? req.payload.name : '';
  return saveAndRespond(addUnit(data, name, randomUUID(), new Date().toISOString()));
});

resolver.define('addRequest', async (req) => {
  const data = await loadData();
  return saveAndRespond(addRequest(data, req.payload, randomUUID(), new Date().toISOString()));
});

resolver.define('setStatus', async (req) => {
  const data = await loadData();
  const payload = req.payload || {};
  return saveAndRespond(setStatus(data, payload.id, payload.status, new Date().toISOString()));
});

export const handler = resolver.getDefinitions();
