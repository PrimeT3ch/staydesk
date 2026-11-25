import { kvs } from '@forge/kvs';
import { MAX_BYTES, normalizeData } from './resolvers/logic.js';

const DATA_KEY = 'staydesk-data';

export async function loadData() {
  return normalizeData(await kvs.get(DATA_KEY));
}

// Returns true if saved, false if the data would exceed the storage cap.
export async function saveData(data) {
  if (JSON.stringify(data).length > MAX_BYTES) {
    return false;
  }
  await kvs.set(DATA_KEY, data);
  return true;
}
