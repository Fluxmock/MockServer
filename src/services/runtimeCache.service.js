import redisClient from "../config/redis.js";

let cacheClient = redisClient;

// Narrow dependency injection seam for the Node test suite. Production always
// uses the configured ioredis client above.
export function __setRuntimeCacheClientForTests(client) {
  cacheClient = client;
}

export const RUNTIME_CACHE_TTL_SECONDS = 300;

export const runtimeCacheKeys = {
  project: (projectKey) => `project:key:${projectKey}`,
  projectVersion: (projectKey) => `cache:version:project-key:${projectKey}`,
  endpoints: (projectId) => `project:endpoints:${projectId}`,
  endpointsVersion: (projectId) => `cache:version:endpoints:${projectId}`,
  chaos: (projectId, endpointId = null) =>
    endpointId
      ? `chaos:rules:project:${projectId}:endpoint:${endpointId}`
      : `chaos:rules:project:${projectId}`,
  chaosVersion: (projectId, endpointId = null) =>
    endpointId
      ? `cache:version:chaos:${projectId}:endpoint:${endpointId}`
      : `cache:version:chaos:${projectId}`,
};

const WRITE_IF_VERSION_CURRENT = `
  local current = redis.call('GET', KEYS[2]) or '0'
  if current ~= ARGV[1] then return 0 end
  redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
  return 1
`;

const safeDelete = async (key) => {
  try {
    await cacheClient.del(key);
  } catch (error) {
    console.error(`[cache] could not remove invalid ${key}:`, error.message);
  }
};

export async function readCacheEnvelope(key, validate) {
  let raw;
  try {
    raw = await cacheClient.get(key);
  } catch (error) {
    console.error(`[cache] read failed for ${key}; falling back to MongoDB:`, error.message);
    return { hit: false, redisAvailable: false };
  }

  if (raw === null) return { hit: false, redisAvailable: true };

  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      Number.isInteger(parsed.version) &&
      parsed.version >= 0 &&
      validate(parsed.data)
    ) {
      return { hit: true, redisAvailable: true, data: parsed.data };
    }
  } catch (error) {
    console.error(`[cache] malformed JSON in ${key}; rebuilding:`, error.message);
  }

  await safeDelete(key);
  return { hit: false, redisAvailable: true };
}

async function getVersion(versionKey) {
  try {
    const raw = await cacheClient.get(versionKey);
    const parsed = raw === null ? 0 : Number(raw);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
  } catch (error) {
    console.error(`[cache] version read failed for ${versionKey}; skipping cache write:`, error.message);
    return null;
  }
}

async function writeIfVersionCurrent(cacheKey, versionKey, version, data) {
  try {
    const result = await cacheClient.eval(
      WRITE_IF_VERSION_CURRENT,
      2,
      cacheKey,
      versionKey,
      String(version),
      JSON.stringify({ version, data }),
      String(RUNTIME_CACHE_TTL_SECONDS)
    );
    return result === 1;
  } catch (error) {
    console.error(`[cache] write failed for ${cacheKey}; serving MongoDB result without caching:`, error.message);
    return true;
  }
}

/**
 * Read a versioned cache entry or rebuild it from MongoDB. An AppServer
 * mutation increments the companion version key before invalidating this key.
 * The conditional Lua write means a rebuild that started earlier cannot write
 * an obsolete snapshot after that mutation completes.
 */
export async function readOrRebuild({ cacheKey, versionKey, validate, load }) {
  const cached = await readCacheEnvelope(cacheKey, validate);
  if (cached.hit) return cached.data;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const version = await getVersion(versionKey);
    const data = await load();

    // Do not negatively cache absent projects/endpoints here. A newly created
    // configuration should become reachable immediately without waiting TTL.
    if (data === null || data === undefined) return data;

    if (version === null || await writeIfVersionCurrent(cacheKey, versionKey, version, data)) {
      return data;
    }
  }

  // A mutation was continuously racing this request. One final authoritative
  // read is safer than caching a potentially stale snapshot.
  return load();
}
