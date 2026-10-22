import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { tryAcquireTelegramPollingLease } from "./telegram-polling-lock.ts";

class FakeClient extends EventEmitter {
  queries = [];
  released = [];

  constructor(results) {
    super();
    this.results = results;
  }

  async query(sql, values) {
    this.queries.push({ sql, values });
    const result = this.results.shift();
    if (result instanceof Error) throw result;
    return result;
  }

  release(error) {
    this.released.push(error);
  }
}

function fakePool(client) {
  return { connect: async () => client };
}

test("polling lease is held for the session and explicitly unlocked on release", async () => {
  const client = new FakeClient([
    { rows: [{ acquired: true }] },
    { rows: [{ unlocked: true }] },
  ]);
  const lease = await tryAcquireTelegramPollingLease(fakePool(client), () => {
    assert.fail("unexpected lock connection loss");
  });

  assert.ok(lease);
  assert.deepEqual(client.released, []);
  await lease.release();
  await lease.release();
  assert.deepEqual(client.queries.map(({ sql }) => sql), [
    "SELECT pg_try_advisory_lock($1, $2) AS acquired",
    "SELECT pg_advisory_unlock($1, $2) AS unlocked",
  ]);
  assert.deepEqual(client.released, [undefined]);
});

test("polling lease releases the database client when another process owns the lock", async () => {
  const client = new FakeClient([{ rows: [{ acquired: false }] }]);
  const lease = await tryAcquireTelegramPollingLease(fakePool(client), () => {
    assert.fail("unexpected lock connection loss");
  });

  assert.equal(lease, null);
  assert.deepEqual(client.released, [undefined]);
});

test("polling lease loss notifies the poller and does not release the client twice", async () => {
  const client = new FakeClient([{ rows: [{ acquired: true }] }]);
  const errors = [];
  const lease = await tryAcquireTelegramPollingLease(fakePool(client), (error) => errors.push(error));
  const connectionError = new Error("connection lost");
  client.emit("error", connectionError);

  assert.equal(errors[0], connectionError);
  await lease.release();
  assert.deepEqual(client.released, [connectionError]);
});
