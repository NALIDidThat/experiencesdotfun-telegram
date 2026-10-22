const TELEGRAM_POLLING_LOCK_KEY = [5190022, 1] as const;

type AdvisoryLockClient = {
  query(
    sql: string,
    values?: unknown[],
  ): Promise<{ rows: Array<Record<string, unknown>> }>;
  release(error?: Error | boolean): void;
  on(event: "error", listener: (error: Error) => void): void;
  removeListener(event: "error", listener: (error: Error) => void): void;
};

type AdvisoryLockPool = {
  connect(): Promise<AdvisoryLockClient>;
};

export type TelegramPollingLease = {
  release(): Promise<void>;
};

export async function tryAcquireTelegramPollingLease(
  pool: AdvisoryLockPool,
  onConnectionLost: (error: Error) => void,
): Promise<TelegramPollingLease | null> {
  const client = await pool.connect();
  let released = false;
  const handleConnectionError = (error: Error) => {
    if (released) return;
    released = true;
    client.release(error);
    onConnectionLost(error);
  };
  client.on("error", handleConnectionError);

  try {
    const result = await client.query(
      "SELECT pg_try_advisory_lock($1, $2) AS acquired",
      [...TELEGRAM_POLLING_LOCK_KEY],
    );
    if (result.rows[0]?.acquired !== true) {
      released = true;
      client.removeListener("error", handleConnectionError);
      client.release();
      return null;
    }

    return {
      async release() {
        if (released) return;
        released = true;
        client.removeListener("error", handleConnectionError);
        try {
          const unlock = await client.query(
            "SELECT pg_advisory_unlock($1, $2) AS unlocked",
            [...TELEGRAM_POLLING_LOCK_KEY],
          );
          if (unlock.rows[0]?.unlocked !== true) {
            throw new Error("Telegram polling advisory lock was not held during release.");
          }
        } finally {
          client.release();
        }
      },
    };
  } catch (error) {
    if (!released) {
      released = true;
      client.removeListener("error", handleConnectionError);
      client.release(error instanceof Error ? error : undefined);
    }
    throw error;
  }
}
