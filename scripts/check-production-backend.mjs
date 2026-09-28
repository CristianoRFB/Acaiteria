import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const projectId = JSON.parse(readFileSync('.firebaserc', 'utf8')).projects?.default;
if (!projectId) {
  console.error('Verificação do backend bloqueada: .firebaserc não define um projeto padrão.');
  process.exit(1);
}

const firebaseCli = process.platform === 'win32'
  ? 'node_modules/firebase-tools/lib/bin/firebase.js'
  : 'node_modules/.bin/firebase';
const result = spawnSync(process.execPath, [firebaseCli, 'functions:list', '--project', projectId, '--json'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});

if (result.error || result.status !== 0) {
  console.error('Verificação do backend falhou. Confirme o login do Firebase CLI, o projeto e o plano de faturamento.');
  process.exit(1);
}

let response;
try {
  response = JSON.parse(result.stdout.trim());
} catch {
  console.error('Verificação do backend falhou: o Firebase CLI não retornou uma resposta JSON válida.');
  process.exit(1);
}

const deployed = response?.result;
if (response?.status !== 'success' || !Array.isArray(deployed)) {
  console.error('Verificação do backend falhou: não foi possível confirmar as Functions publicadas.');
  process.exit(1);
}

const expected = [
  'assignDelivery', 'confirmDelivery', 'createDeliveryDriver', 'createOrder',
  'finalizeOrderEdit', 'getIntegrationReadiness', 'getPublicOrder',
  'operateCashRegister', 'reconcileCashRegisterControl', 'progressDelivery', 'reassignDelivery',
  'refundCompletedOrder', 'reportDeliveryFailure', 'requeueDelivery',
  'respondDelivery', 'retryOrderIntegration', 'saveFinanceEntry',
  'saveIntegrationMappings', 'sanitizeLegacyDeliveryLinks',
  'setDeliveryDriverEnabled', 'setDriverAvailability', 'updateDeliveryDriver', 'updateDriverContact',
  'updateFinanceStatus', 'updateOrderDetails', 'updateOrderEstimate',
  'updateOrderStatus', 'verifyOrderPricing',
];
const names = new Set(deployed.flatMap((entry) => [entry.id, entry.name, entry.functionId, entry.entryPoint]
  .filter((value) => typeof value === 'string')
  .map((value) => value.split('/').at(-1).split('(')[0])));
const missing = expected.filter((name) => !names.has(name));

if (missing.length) {
  console.error(`Backend incompleto no projeto ${projectId}; faltam Functions necessárias para o app: ${missing.join(', ')}.`);
  process.exit(1);
}

console.log(`Backend pronto no projeto ${projectId}: ${expected.length} Functions críticas encontradas.`);
