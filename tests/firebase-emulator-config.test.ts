import { describe, expect, it } from 'vitest';

import { resolveFirebaseEmulatorConfig } from '../lib/firebase/emulator-config';

describe('Firebase Emulator endpoints', () => {
  it('preserves the existing local endpoint defaults', () => {
    expect(resolveFirebaseEmulatorConfig({})).toEqual({
      authUrl: 'http://127.0.0.1:9099',
      firestoreHost: '127.0.0.1',
      firestorePort: 8180,
      functionsHost: '127.0.0.1',
      functionsPort: 5001,
    });
  });

  it('supports isolated emulator ports without changing production configuration', () => {
    expect(resolveFirebaseEmulatorConfig({
      NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL: 'http://127.0.0.1:19099',
      NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST: 'localhost',
      NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT: '18180',
      NEXT_PUBLIC_FUNCTIONS_EMULATOR_HOST: 'localhost',
      NEXT_PUBLIC_FUNCTIONS_EMULATOR_PORT: '15001',
    })).toEqual({
      authUrl: 'http://127.0.0.1:19099',
      firestoreHost: 'localhost',
      firestorePort: 18180,
      functionsHost: 'localhost',
      functionsPort: 15001,
    });
  });

  it('rejects malformed public emulator endpoints', () => {
    expect(() => resolveFirebaseEmulatorConfig({ NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT: '8080/path' })).toThrow('Porta do Firestore Emulator inválida.');
    expect(() => resolveFirebaseEmulatorConfig({ NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL: 'https://auth.example.test/path' })).toThrow('URL do Firebase Auth Emulator inválida.');
  });
});
