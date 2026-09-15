import fs from 'node:fs';
import { storePublicConfigSeed } from '../shared/menu-data.mjs';

const projectId = 'food-5fb44';
const tokenPath = `${process.env.USERPROFILE}/.config/configstore/firebase-tools.json`;
const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8')).tokens.access_token;
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

function value(input) {
  if (input === null) return { nullValue: null };
  if (typeof input === 'boolean') return { booleanValue: input };
  if (typeof input === 'number') return { integerValue: String(input) };
  if (typeof input === 'string') return { stringValue: input };
  if (Array.isArray(input)) return { arrayValue: { values: input.map(value) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(input).map(([key, item]) => [key, value(item)])) } };
}
function fields(input) { return Object.fromEntries(Object.entries(input).map(([key, item]) => [key, value(item)])); }

const configUrl = `${base}/storePublicConfig/main`;
const current = await fetch(configUrl, { headers });
if (!current.ok) throw new Error(`Falha ao ler storePublicConfig/main: ${current.status}`);
const currentDoc = await current.json();
const merged = { ...storePublicConfigSeed, ...(currentDoc.fields ? {} : {}) };
const patchResponse = await fetch(configUrl, { method: 'PATCH', headers, body: JSON.stringify({ fields: fields(merged) }) });
if (!patchResponse.ok) throw new Error(`Falha ao atualizar storePublicConfig/main: ${patchResponse.status} ${await patchResponse.text()}`);
console.log('storePublicConfig/main atualizado com configuração completa.');

const productsResponse = await fetch(`${base}/products?pageSize=200`, { headers });
if (!productsResponse.ok) throw new Error(`Falha ao listar produtos: ${productsResponse.status}`);
const products = (await productsResponse.json()).documents ?? [];
for (const product of products) {
  const description = product.fields?.description?.stringValue;
  const name = product.fields?.name?.stringValue;
  if (description !== 'dsds' && name !== 'Monte seu copo') continue;
  const isOfficial = product.name.endsWith('/acai-monte-seu');
  if (isOfficial) continue;
  const response = await fetch(`https://firestore.googleapis.com/v1/${product.name}?updateMask.fieldPaths=active&updateMask.fieldPaths=updatedAt`, { method: 'PATCH', headers, body: JSON.stringify({ fields: { active: { booleanValue: false }, updatedAt: { timestampValue: new Date().toISOString() } } }) });
  if (!response.ok) throw new Error(`Falha ao desativar produto de teste: ${response.status}`);
  console.log(`Produto de teste desativado: ${product.name.split('/').pop()}`);
}
