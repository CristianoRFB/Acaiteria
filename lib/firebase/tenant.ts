import { collection, doc, type Firestore } from 'firebase/firestore';

import { tenantPathSegments } from '@/shared/tenancy';

export function tenantCollection(db: Firestore, tenantId: string, ...segments: string[]) {
  return collection(db, tenantPathSegments(tenantId, ...segments));
}

export function tenantDoc(db: Firestore, tenantId: string, ...segments: string[]) {
  return doc(db, tenantPathSegments(tenantId, ...segments));
}
