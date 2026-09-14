import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { menuCatalog, storePublicConfigSeed } from '../shared/menu-data.mjs';

const project = process.argv[2] || 'food-5fb44';
const tokenFile = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
const auth = JSON.parse(fs.readFileSync(tokenFile, 'utf8'));
const token = auth.tokens?.access_token || auth.access_token;
if (!token) throw new Error('Firebase CLI token ausente. Execute firebase login.');
const apiBase = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
const resourceBase = `projects/${project}/databases/(default)/documents`;
const value = (v) => v === null ? { nullValue: 'NULL_VALUE' } : typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? { integerValue: String(v) } : typeof v === 'string' ? { stringValue: v } : Array.isArray(v) ? { arrayValue: { values: v.map(value) } } : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, value(x)])) } };
const doc = (name, fields) => ({ name: `${resourceBase}/${name}`, fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, value(v)])) });
const writes = [
  doc('storePublicConfig/main', storePublicConfigSeed),
  ...menuCatalog.categories.map((x) => doc(`categories/${x.id}`, x)),
  ...menuCatalog.products.map((x) => doc(`products/${x.id}`, x)),
  ...menuCatalog.groups.map((x) => doc(`modifierGroups/${x.id}`, x)),
  ...menuCatalog.modifiers.map((x) => doc(`modifiers/${x.id}`, x)),
];
for (let i = 0; i < writes.length; i += 400) {
  const response = await fetch(`${apiBase}:commit`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ writes: writes.slice(i, i + 400).map((d) => ({ update: d })) }) });
  if (!response.ok) throw new Error(`Firestore commit ${response.status}: ${await response.text()}`);
}
console.log(`Importados ${writes.length} documentos em ${project}.`);
