import { database } from '../database';

/** Wipes the (in-memory, LokiJS-backed under Jest) database between tests so PendingActions and
 * shopping-list rows from one test never leak into the next. */
export async function resetDatabase(): Promise<void> {
  await database.write(async () => {
    await database.unsafeResetDatabase();
  });
}
