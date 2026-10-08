import { randomUUID } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

function requiredArgument(name) {
  const value = process.argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3)?.trim();
  if (!value) throw new Error(`Argumento obrigatório: --${name}=...`);
  return value;
}

const projectId = requiredArgument('project');
const email = requiredArgument('email').toLowerCase();
const isFirestoreEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const isAuthEmulator = Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST);
const isEmulator = isFirestoreEmulator && isAuthEmulator;

if (isFirestoreEmulator !== isAuthEmulator) {
  throw new Error('Ambiente incompleto: configure os emuladores de Firestore e Auth juntos, ou nenhum dos dois.');
}
if (isEmulator) {
  if (!projectId.startsWith('demo-')) throw new Error('Bootstrap em emulador só aceita project ID demo-.');
  if (!process.argv.includes('--confirm-platform-owner-bootstrap')) {
    throw new Error('Confirme o bootstrap local com --confirm-platform-owner-bootstrap.');
  }
} else {
  if (projectId.startsWith('demo-')) throw new Error('Projeto demo- exige os emuladores de Auth e Firestore ativos.');
  if (!process.argv.includes('--confirm-production-platform-owner-bootstrap')) {
    throw new Error('Fora do Emulator, use --confirm-production-platform-owner-bootstrap somente após revisar projeto, conta e backup.');
  }
}

if (!getApps().length) initializeApp({ projectId });
const auth = getAuth();
const db = getFirestore();
const account = await auth.getUserByEmail(email).catch((error) => {
  if (error?.code === 'auth/user-not-found') throw new Error(`A conta ${email} não existe no Firebase Authentication; crie-a e verifique o e-mail antes do bootstrap.`);
  throw error;
});

if (account.disabled) throw new Error('A conta está desativada no Firebase Authentication. Nenhum dado foi alterado.');
if (!account.emailVerified) throw new Error('O e-mail da conta ainda não foi verificado. Nenhum dado foi alterado.');

const identityRef = db.doc(`users/${account.uid}`);
const platformOwnersQuery = db.collection('users').where('platformRole', '==', 'platform_owner').limit(1);
const auditRef = db.doc(`platformAuditLogs/${randomUUID()}`);

await db.runTransaction(async (transaction) => {
  const [identity, existingOwners] = await Promise.all([
    transaction.get(identityRef),
    transaction.get(platformOwnersQuery),
  ]);
  if (identity.exists && identity.data()?.active === false) {
    throw new Error('A identidade global está desativada. Reative-a por um processo administrativo aprovado antes de continuar.');
  }
  if (!existingOwners.empty) {
    throw new Error('Já existe uma identidade platform_owner. Este procedimento é apenas para o primeiro owner; não altere permissões existentes.');
  }

  const now = FieldValue.serverTimestamp();
  transaction.set(identityRef, {
    uid: account.uid,
    email: account.email ?? email,
    active: true,
    platformRole: 'platform_owner',
    updatedAt: now,
  }, { merge: true });
  transaction.create(auditRef, {
    action: 'PLATFORM_OWNER_BOOTSTRAPPED',
    actorUid: account.uid,
    affectedUserId: account.uid,
    projectId,
    summary: 'Primeira identidade platform_owner provisionada por bootstrap administrativo explícito.',
    createdAt: now,
  });
});

process.stdout.write(`Bootstrap concluído para ${account.email ?? email} (${account.uid}) no projeto ${projectId}.\n`);
process.stdout.write('Guarde o registro de auditoria e confirme o acesso em /platform. Nenhuma senha ou credencial foi gravada pelo script.\n');
