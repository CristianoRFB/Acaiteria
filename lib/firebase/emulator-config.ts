export interface FirebaseEmulatorConfig {
  authUrl: string;
  firestoreHost: string;
  firestorePort: number;
  functionsHost: string;
  functionsPort: number;
}

function parseHost(value: string | undefined, fallback: string, label: string): string {
  const host = value?.trim() || fallback;
  if (!host || /[\s/:]/.test(host)) throw new Error(`${label} inválido.`);
  return host;
}

function parsePort(value: string | undefined, fallback: number, label: string): number {
  if (value === undefined || value.trim() === '') return fallback;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`${label} inválida.`);
  return port;
}

export function resolveFirebaseEmulatorConfig(
  env: Record<string, string | undefined> = process.env,
): FirebaseEmulatorConfig {
  const authUrl = env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL?.trim() || 'http://127.0.0.1:9099';
  let parsedAuthUrl: URL;
  try { parsedAuthUrl = new URL(authUrl); }
  catch { throw new Error('URL do Firebase Auth Emulator inválida.'); }
  if (!['http:', 'https:'].includes(parsedAuthUrl.protocol) || !parsedAuthUrl.hostname || parsedAuthUrl.pathname !== '/') {
    throw new Error('URL do Firebase Auth Emulator inválida.');
  }

  return {
    authUrl: parsedAuthUrl.origin,
    firestoreHost: parseHost(env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST, '127.0.0.1', 'Host do Firestore Emulator'),
    firestorePort: parsePort(env.NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT, 8180, 'Porta do Firestore Emulator'),
    functionsHost: parseHost(env.NEXT_PUBLIC_FUNCTIONS_EMULATOR_HOST, '127.0.0.1', 'Host do Functions Emulator'),
    functionsPort: parsePort(env.NEXT_PUBLIC_FUNCTIONS_EMULATOR_PORT, 5001, 'Porta do Functions Emulator'),
  };
}
