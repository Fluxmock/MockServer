import test from "node:test";
import assert from "node:assert/strict";
import {
  __setRuntimeCacheClientForTests,
  readCacheEnvelope,
  readOrRebuild,
} from "../src/services/runtimeCache.service.js";

class FakeRedis {
  values = new Map();
  deleted = [];

  async get(key) { return this.values.has(key) ? this.values.get(key) : null; }
  async del(key) { this.deleted.push(key); this.values.delete(key); return 1; }

  async eval(_script, _keys, cacheKey, versionKey, expectedVersion, serialized) {
    const current = this.values.get(versionKey) ?? "0";
    if (current !== expectedVersion) return 0;
    this.values.set(cacheKey, serialized);
    return 1;
  }
}

test("a cached empty endpoint list is a valid cache hit", async () => {
  const redis = new FakeRedis();
  redis.values.set("endpoints", JSON.stringify({ version: 0, data: [] }));
  __setRuntimeCacheClientForTests(redis);

  const result = await readCacheEnvelope("endpoints", Array.isArray);
  assert.equal(result.hit, true);
  assert.deepEqual(result.data, []);
});

test("malformed cache values are removed and treated as misses", async () => {
  const redis = new FakeRedis();
  redis.values.set("endpoints", "not-json");
  __setRuntimeCacheClientForTests(redis);

  const result = await readCacheEnvelope("endpoints", Array.isArray);
  assert.equal(result.hit, false);
  assert.deepEqual(redis.deleted, ["endpoints"]);
});

test("a rebuild racing a mutation cannot overwrite the newer cache version", async () => {
  const redis = new FakeRedis();
  redis.values.set("endpoint-version", "0");
  __setRuntimeCacheClientForTests(redis);

  let loadCount = 0;
  const result = await readOrRebuild({
    cacheKey: "endpoints",
    versionKey: "endpoint-version",
    validate: Array.isArray,
    load: async () => {
      loadCount += 1;
      if (loadCount === 1) {
        // Simulate AppServer's atomic version bump/invalidation after Mongo
        // commits a mutation while this old Mongo snapshot is rebuilding.
        redis.values.set("endpoint-version", "1");
        return [{ path: "/old" }];
      }
      return [{ path: "/new" }];
    },
  });

  assert.deepEqual(result, [{ path: "/new" }]);
  assert.deepEqual(JSON.parse(redis.values.get("endpoints")).data, [{ path: "/new" }]);
  assert.equal(loadCount, 2);
});
