import assert from "node:assert/strict";
import test from "node:test";
import { normalizePersonalMemory } from "./personal-collections-rules.mjs";

test("personal memories accept notes, owned photo keys, and safe links", () => {
  assert.deepEqual(
    normalizePersonalMemory({
      title: " First volunteer day ",
      body: "Met the group at the river.",
      photoObjectKeys: ["42/memories/123e4567-e89b-42d3-a456-426614174000"],
      links: ["https://example.com/album"],
    }, 42),
    {
      ok: true,
      value: {
        title: "First volunteer day",
        body: "Met the group at the river.",
        photoObjectKeys: ["42/memories/123e4567-e89b-42d3-a456-426614174000"],
        links: ["https://example.com/album"],
      },
    },
  );
});

test("personal memories reject another profile's photo key and insecure links", () => {
  assert.equal(
    normalizePersonalMemory({ photoObjectKeys: ["43/memories/123e4567-e89b-42d3-a456-426614174000"] }, 42).ok,
    false,
  );
  assert.equal(
    normalizePersonalMemory({ links: ["http://example.com"] }, 42).ok,
    false,
  );
  assert.equal(
    normalizePersonalMemory({ links: ["https://user:pass@example.com"] }, 42).ok,
    false,
  );
});

test("personal memories require content and enforce media limits", () => {
  assert.equal(normalizePersonalMemory({}, 42).ok, false);
  assert.equal(
    normalizePersonalMemory({
      photoObjectKeys: Array.from(
        { length: 6 },
        (_, i) => `42/memories/${i.toString(16).padStart(8, "0")}-e89b-42d3-a456-426614174000`,
      ),
    }, 42).ok,
    false,
  );
  assert.equal(
    normalizePersonalMemory({ links: Array.from({ length: 6 }, (_, i) => `https://example.com/${i}`) }, 42).ok,
    false,
  );
});

test("partial updates retain existing values and reject emptying a memory", () => {
  const current = {
    title: "A day out",
    body: null,
    photoObjectKeys: ["42/memories/123e4567-e89b-42d3-a456-426614174000"],
    links: [],
  };
  assert.deepEqual(
    normalizePersonalMemory({ body: "A good day." }, 42, current),
    {
      ok: true,
      value: {
        title: "A day out",
        body: "A good day.",
        photoObjectKeys: ["42/memories/123e4567-e89b-42d3-a456-426614174000"],
        links: [],
      },
    },
  );
  assert.equal(
    normalizePersonalMemory({ title: null, body: null, photoObjectKeys: [], links: [] }, 42, current).ok,
    false,
  );
});
