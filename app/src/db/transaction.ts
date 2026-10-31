/**
 * BEGIN / COMMIT / ROLLBACK around `fn`, using a synchronous statement runner. The drivers on
 * both sides (expo-sqlite and the test harness) execute statements synchronously, so nothing
 * else can interleave between the awaits inside `fn`.
 */
export async function withTransaction<T>(exec: (sql: string) => void, fn: () => Promise<T>) {
  exec('BEGIN');
  try {
    const result = await fn();
    exec('COMMIT');
    return result;
  } catch (error) {
    exec('ROLLBACK');
    throw error;
  }
}
