import { eq } from 'drizzle-orm';
import * as t from '@main/db/schema';
import type { DatabaseHandle } from '@main/db/client';

// Not "Quicken import": electron-vite's CJS shim scan reads a string ending in `import"` as an import statement.
export const IMPORT_INSTITUTION_NAME = 'Imported from Quicken';

/** Institutions that talk to Plaid. Imported ones hold history and never sync or need sign-in. */
export function selectPlaidInstitutions(db: DatabaseHandle['db']) {
  return db.select().from(t.institutions).where(eq(t.institutions.source, 'plaid'));
}
