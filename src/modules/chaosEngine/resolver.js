import redisClient from "../../config/redis.js";
import ApiError from "../../utils/ApiError.js";
import ChaosRuleSet from "../../models/ChaosRule.js";

const CACHE_TTL_SECONDS = 300;

const normalizeRule = (rule) => {
  if (!rule || typeof rule.ruleType !== "string") {
    return null;
  }

  return {
    _id: String(rule._id ?? ""),
    ruleType: rule.ruleType,
    probability: Number(rule.probability ?? 1),
    config: rule.config ?? {},
    isEnabled: rule.isEnabled !== false,
    createdAt: rule.createdAt ?? null,
    updatedAt: rule.updatedAt ?? null,
    scope: rule.scope ?? "project",
  };
};

export const getChaosRuleCacheKey = (projectId, endpointId = null) => {
  if (!endpointId) {
    return `chaos:rules:project:${String(projectId)}`;
  }
  return `chaos:rules:project:${String(projectId)}:endpoint:${String(endpointId)}`;
};

export const resolveChaosRules = (rules = []) => {
  const byType = new Map();

  // first pass — collect all rules including disabled ones, so endpoint-scope
  // disabled rules can suppress project-scope rules of the same type
  for (const rule of rules) {
    const normalized = normalizeRule(rule);
    if (!normalized) continue;

    const existing = byType.get(normalized.ruleType);

    if (!existing) {
      byType.set(normalized.ruleType, normalized);
      continue;
    }

    // endpoint-scoped rule always wins over project-scoped — even if disabled
    // this allows endpoint rules to explicitly suppress project rules
    if (normalized.scope === "endpoint" && existing.scope !== "endpoint") {
      byType.set(normalized.ruleType, normalized);
    }
  }

  // second pass — filter out disabled rules after scope resolution
  return Array.from(byType.values()).filter((r) => r.isEnabled);
};

// Fetch rules for one scope — Redis first, MongoDB fallback, re-warm cache on miss
const getRules = async (cacheKey, projectId, endpointId = null) => {
  const cached = await redisClient.get(cacheKey);

  if (cached) {
    console.log(`[chaos] cache HIT  → ${cacheKey}`);
    return JSON.parse(cached);
  }

  console.log(`[chaos] cache MISS → ${cacheKey} querying MongoDB`);

  const ruleSet = await ChaosRuleSet.findOne({
    projectId,
    endpointId: endpointId ?? null,
  }).lean();

  const rules = ruleSet?.rules ?? [];

  // re-warm cache so next request doesn't hit MongoDB again
  await redisClient.set(cacheKey, JSON.stringify(rules), "EX", CACHE_TTL_SECONDS);

  console.log(`[chaos] MongoDB → ${rules.length} rule(s) cached for ${CACHE_TTL_SECONDS}s`);

  return rules;
};

export const loadChaosRules = async (projectId, endpointId = null) => {
  if (!projectId) {
    throw new ApiError(400, "Project ID is required to load chaos rules");
  }

  console.log(`[chaos] loading rules → projectId:${projectId} endpointId:${endpointId ?? "none"}`);

  const projectKey = getChaosRuleCacheKey(projectId, null);
  const projectRules = await getRules(projectKey, projectId, null);

  let endpointRules = [];
  if (endpointId) {
    const endpointKey = getChaosRuleCacheKey(projectId, endpointId);
    endpointRules = await getRules(endpointKey, projectId, endpointId);
  }

  const scopedProjectRules = projectRules.map((r) => ({ ...r, scope: "project" }));
  const scopedEndpointRules = endpointRules.map((r) => ({ ...r, scope: "endpoint" }));

  const resolved = resolveChaosRules([...scopedProjectRules, ...scopedEndpointRules]);

  console.log(`[chaos] resolved ${resolved.length} rule(s): [${resolved.map((r) => r.ruleType).join(", ") || "none"}]`);

  return resolved;
};

export const loadProjectAndEndpointRules = async (projectId, endpointId = null) => {
  return loadChaosRules(projectId, endpointId);
};

export default loadProjectAndEndpointRules;
