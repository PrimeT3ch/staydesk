import Resolver from '@forge/resolver';
import { randomUUID } from 'crypto';
import { loadData, saveData } from '../store.js';
import { addRequest, addUnit, buildView, setStatus } from './logic.js';

const resolver = new Resolver();

// Saves the new data and returns the refreshed view for the screen.
async function saveAndRespond(result) {
  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  const saved = await saveData(result.data);
  if (!saved) {
    return { ok: false, error: 'Storage is full. Please resolve and remove old requests.' };
  }
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
