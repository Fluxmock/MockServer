import resolveTemplate from "../../../templating/resolveTemplate.js";
import { faker } from "@faker-js/faker";

export const DATA_SCHEMA_TYPES = [
  "nullFields",
  "wrongTypes",
  "missingFields",
  "extraFields",
  "staleData",
];

// ── helpers ────────────────────────────────────────────────────────────────

// Recursively set N random leaf fields to null
const injectNulls = (obj, ratio = 0.5) => {
  if (typeof obj !== "object" || obj === null) return obj;

  const result = Array.isArray(obj) ? [...obj] : { ...obj };
  const keys = Object.keys(result);

  for (const key of keys) {
    const val = result[key];
    if (typeof val === "object" && val !== null) {
      result[key] = injectNulls(val, ratio);
    } else {
      if (Math.random() < ratio) {
        result[key] = null;
      }
    }
  }

  return result;
};

// Randomly flip value types: string→number, number→string, bool→string, etc.
const corruptTypes = (obj, ratio = 0.5) => {
  if (typeof obj !== "object" || obj === null) return obj;

  const result = Array.isArray(obj) ? [...obj] : { ...obj };

  for (const key of Object.keys(result)) {
    const val = result[key];

    if (typeof val === "object" && val !== null) {
      result[key] = corruptTypes(val, ratio);
      continue;
    }

    if (Math.random() >= ratio) continue;

    if (typeof val === "string") {
      result[key] = Math.floor(Math.random() * 99999); // string → number
    } else if (typeof val === "number") {
      result[key] = faker.string.alphanumeric(8);       // number → string
    } else if (typeof val === "boolean") {
      result[key] = String(val);                        // bool → string "true"/"false"
    } else if (val === null) {
      result[key] = faker.string.uuid();               // null → random string
    }
  }

  return result;
};

// Drop N random top-level keys
const dropFields = (obj, count = 1) => {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return obj;

  const result = { ...obj };
  const keys = Object.keys(result);
  const toDrop = Math.min(count, keys.length);

  for (let i = 0; i < toDrop; i++) {
    const idx = Math.floor(Math.random() * Object.keys(result).length);
    delete result[Object.keys(result)[idx]];
  }

  return result;
};

// Inject unexpected extra fields
const EXTRA_FIELD_VALUES = () => ({
  __debug_id: faker.string.uuid(),
  __internal_flag: faker.datatype.boolean(),
  __legacy_ref: faker.number.int({ min: 1000, max: 9999 }),
  __chaos_injected: true,
  __deprecated_field: faker.word.noun(),
  __temp_token: faker.string.alphanumeric(16),
});

const addExtraFields = (obj, count = 2) => {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return obj;

  const extras = EXTRA_FIELD_VALUES();
  const extraKeys = Object.keys(extras).slice(0, count);
  const result = { ...obj };

  for (const key of extraKeys) {
    result[key] = extras[key];
  }

  return result;
};

// Make data look stale — backdates timestamps and version fields
const staleifyData = (obj, staleByMs = 7 * 24 * 60 * 60 * 1000) => {
  if (typeof obj !== "object" || obj === null) return obj;

  const result = Array.isArray(obj) ? [...obj] : { ...obj };
  const staleDate = new Date(Date.now() - staleByMs).toISOString();

  const timestampKeys = ["createdAt", "updatedAt", "timestamp", "date", "lastModified", "modified_at"];
  const versionKeys = ["version", "v", "__v", "etag", "revision"];

  for (const key of Object.keys(result)) {
    const val = result[key];

    if (typeof val === "object" && val !== null) {
      result[key] = staleifyData(val, staleByMs);
      continue;
    }

    if (timestampKeys.includes(key)) {
      result[key] = staleDate;
      continue;
    }

    if (versionKeys.includes(key) && typeof val === "number") {
      result[key] = Math.max(0, val - Math.floor(Math.random() * 5 + 1));
      continue;
    }
  }

  return result;
};

// ── sub-type handlers ─────────────────────────────────────────────────────

const dataSchemaHandlers = {

  // Randomly sets N% of leaf fields to null
  // config: { type: "nullFields", ratio: 0.5 }
  nullFields: (resolvedBody, config) => {
    const ratio = Number(config.ratio ?? 0.5);
    return injectNulls(resolvedBody, ratio);
  },

  // Flips value types on N% of leaf fields
  // config: { type: "wrongTypes", ratio: 0.5 }
  wrongTypes: (resolvedBody, config) => {
    const ratio = Number(config.ratio ?? 0.5);
    return corruptTypes(resolvedBody, ratio);
  },

  // Drops N top-level keys from the response
  // config: { type: "missingFields", count: 2 }
  missingFields: (resolvedBody, config) => {
    const count = Number(config.count ?? 1);
    return dropFields(resolvedBody, count);
  },

  // Injects N unexpected extra fields
  // config: { type: "extraFields", count: 2 }
  extraFields: (resolvedBody, config) => {
    const count = Number(config.count ?? 2);
    return addExtraFields(resolvedBody, count);
  },

  // Backdates timestamps and decrements version fields to simulate stale cache
  // config: { type: "staleData", staleDays: 7 }
  staleData: (resolvedBody, config) => {
    const staleDays = Number(config.staleDays ?? 7);
    const staleByMs = staleDays * 24 * 60 * 60 * 1000;
    return staleifyData(resolvedBody, staleByMs);
  },
};

// ── main rule ─────────────────────────────────────────────────────────────

export const applyDataSchemaRule = async (rule, req, res) => {
  const config = rule?.config ?? {};
  const type = config.type;

  const handler = dataSchemaHandlers[type];

  if (!handler) {
    console.warn(`[dataSchema] unknown type: ${type}`);
    return false;
  }

  const endpoint = req.endpoint ?? {};
  const bodyTemplate = endpoint.responseBodyTemplate ?? {};
  const resolvedBody = resolveTemplate(bodyTemplate, req.pathParams ?? {});
  const statusCode = Number(endpoint.statusCode ?? 200);

  const corruptedBody = handler(resolvedBody, config);

  res.status(statusCode).json(corruptedBody);
  console.log(`[dataSchema] ${type} injected`);
  return true;
};

export default { applyDataSchemaRule };
