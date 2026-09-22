import redisClient from "../../config/redis.js";
import ApiError from "../../utils/ApiError.js";

const normalizeRule = (rule) => {
  if (!rule || typeof rule.ruleType !== "string") {
    return null;
  }

  return {
    _id: rule._id ?? null,
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
  const normalizedProjectId = String(projectId);
  if (!endpointId) {
    return `chaos:rules:project:${normalizedProjectId}`;
  }

  return `chaos:rules:project:${normalizedProjectId}:endpoint:${String(endpointId)}`;
};

export const resolveChaosRules = (rules = []) => {
  const byType = new Map();

  for (const rule of rules) {
    const normalized = normalizeRule(rule);
    if (!normalized || !normalized.isEnabled) {
      continue;
    }

    const existing = byType.get(normalized.ruleType);

    if (!existing) {
      byType.set(normalized.ruleType, normalized);
      continue;
    }

    if(normalized.scope === "endpoint" && existing.scope !== "endpoint"){
        byType.set(normalized.ruleType, normalized);
    }
  }

  return Array.from(byType.values());
};

export const loadChaosRules = async (projectId, endpointId = null) => {
  if (!projectId) {
    throw new ApiError(400, "Project ID is required to load chaos rules");
  }

  const projectKey = getChaosRuleCacheKey(projectId, null);
  const endpointKey = endpointId ? getChaosRuleCacheKey(projectId, endpointId) : null;

  const [projectRulesRaw, endpointRulesRaw] = await Promise.all([
    redisClient.get(projectKey),
    endpointKey ? redisClient.get(endpointKey) : null,
  ]);

  const projectRules = projectRulesRaw ? JSON.parse(projectRulesRaw) : [];
  const endpointRules = endpointRulesRaw ? JSON.parse(endpointRulesRaw) : [];

  const scopedProjectRules = projectRules.map((rule) => ({ ...rule, scope: "project" }));
  const scopedEndpointRules = endpointRules.map((rule) => ({ ...rule, scope: "endpoint" }));

  return resolveChaosRules([...scopedProjectRules, ...scopedEndpointRules]);
};

export const loadProjectAndEndpointRules = async (projectId, endpointId = null) => {
  return loadChaosRules(projectId, endpointId);
};

export default loadProjectAndEndpointRules;