import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { runNodeConnectionAction } from "../lib/node-connection-actions.ts";

const nodeProfileSource = await readFile(
  new URL("../components/NodeProfileScreen.tsx", import.meta.url),
  "utf8",
);

function setup(overrides = {}) {
  const calls = [];
  const state = { error: "old error", notice: "old notice" };
  const lock = { current: false };
  const options = {
    action: async () => { calls.push("action"); },
    successMessage: "The Node connection was updated.",
    lock,
    refetchProfile: async () => {
      calls.push("refetch");
      return { isError: false };
    },
    invalidateMyNodes: () => { calls.push("invalidate"); },
    setError: (message) => { state.error = message; },
    setNotice: (message) => { state.notice = message; },
    ...overrides,
  };
  return { calls, state, lock, options };
}

test("successful connection actions refresh the Node profile before showing success", async () => {
  const { calls, state, options } = setup();

  const succeeded = await runNodeConnectionAction(options);

  assert.equal(succeeded, true);
  assert.deepEqual(calls, ["action", "refetch", "invalidate"]);
  assert.equal(state.error, "");
  assert.equal(state.notice, "The Node connection was updated.");
});

test("action failures show the server message and do not refresh or announce success", async () => {
  const { calls, state, options } = setup({
    action: async () => {
      calls.push("action");
      throw { data: { message: "This Node is no longer available." } };
    },
  });

  const succeeded = await runNodeConnectionAction(options);

  assert.equal(succeeded, false);
  assert.deepEqual(calls, ["action"]);
  assert.equal(state.error, "This Node is no longer available.");
  assert.equal(state.notice, "");
});

test("profile refresh failures do not show a false success", async () => {
  const { calls, state, options } = setup({
    refetchProfile: async () => {
      calls.push("refetch");
      return { isError: true, error: new Error("Refresh failed.") };
    },
  });

  const succeeded = await runNodeConnectionAction(options);

  assert.equal(succeeded, false);
  assert.deepEqual(calls, ["action", "refetch"]);
  assert.equal(state.error, "Refresh failed.");
  assert.equal(state.notice, "");
});

test("only one connection action can run at a time", async () => {
  let releaseAction;
  let actionCount = 0;
  const { calls, state, options } = setup({
    action: () => {
      actionCount += 1;
      calls.push("action");
      return new Promise((resolve) => { releaseAction = resolve; });
    },
  });

  const first = runNodeConnectionAction(options);
  assert.equal(options.lock.current, true);
  assert.equal(await runNodeConnectionAction({
    ...options,
    action: async () => { actionCount += 1; },
    successMessage: "Second success",
  }), false);

  releaseAction();
  assert.equal(await first, true);
  assert.equal(actionCount, 1);
  assert.deepEqual(calls, ["action", "refetch", "invalidate"]);
  assert.equal(state.notice, "The Node connection was updated.");
  assert.equal(options.lock.current, false);
});

test("a rejected action releases the lock so the participant can retry", async () => {
  const { calls, lock, state, options } = setup({
    action: async () => {
      calls.push("action");
      throw new Error("Temporary failure.");
    },
  });

  assert.equal(await runNodeConnectionAction(options), false);
  assert.equal(lock.current, false);

  options.action = async () => { calls.push("retry"); };
  assert.equal(await runNodeConnectionAction(options), true);
  assert.deepEqual(calls, ["action", "retry", "refetch", "invalidate"]);
  assert.equal(state.error, "");
  assert.equal(state.notice, "The Node connection was updated.");
});

test("unknown errors receive a useful fallback message", async () => {
  const { state, options } = setup({
    action: async () => { throw new Error(); },
  });

  assert.equal(await runNodeConnectionAction(options), false);
  assert.equal(state.error, "This action could not be completed. Please try again.");
});

test("the profile wires connect, role changes, and disconnects to their matching mutations", () => {
  assert.match(nodeProfileSource, /connect\.mutateAsync\(\{ nodeId, data: \{ role: selectedRole \} \}\),\s*'You are connected to this Node\.'/);
  assert.match(nodeProfileSource, /updateConnection\.mutateAsync\(\{ nodeId, data: \{ role: role\.key \} \}\),\s*'Your Node role was updated\.'/);
  assert.match(nodeProfileSource, /disconnect\.mutateAsync\(\{ nodeId \}\),\s*'You disconnected from this Node\.'/);
  assert.match(nodeProfileSource, /disabled=\{busy \|\| active\}/);
  assert.match(nodeProfileSource, /disabled=\{busy\}/);
});

test("a successful connection refreshes membership before showing its pending or active state", () => {
  assert.match(nodeProfileSource, /refetchProfile: \(\) => profile\.refetch\(\)/);
  assert.match(nodeProfileSource, /membership\.status === 'active' \? 'You’re connected to this Node' : 'Connection requested'/);
});
