import ApiError from "../../utils/ApiError.js";
import ChaosRuleSet from "../../models/ChaosRule.js";
import { readOrRebuild, runtimeCacheKeys } from "../../services/runtimeCache.service.js";

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

// Fetch rules for one scope — Redis first, MongoDB fallback. Disabled rules are
// intentionally retained because an endpoint-level disabled rule suppresses a
// project-level rule of the same type.
const getRules = (projectId, endpointId = null) => readOrRebuild({
  cacheKey: runtimeCacheKeys.chaos(projectId, endpointId),
  versionKey: runtimeCacheKeys.chaosVersion(projectId, endpointId),
  validate: Array.isArray,
  load: async () => {
    const ruleSet = await ChaosRuleSet.findOne({
      projectId,
      endpointId: endpointId ?? null,
    }).lean();
    return ruleSet?.rules ?? [];
  },
});

export const loadChaosRules = async (projectId, endpointId = null) => {
  if (!projectId) {
    throw new ApiError(400, "Project ID is required to load chaos rules");
  }

  console.log(`[chaos] loading rules → projectId:${projectId} endpointId:${endpointId ?? "none"}`);

  const [projectRules, endpointRules] = await Promise.all([
    getRules(projectId, null),
    endpointId ? getRules(projectId, endpointId) : Promise.resolve([]),
  ]);

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
