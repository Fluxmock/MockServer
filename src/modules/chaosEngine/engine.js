import { applyDelayRule } from "./rules/delay/delay.rule.js";
import { applyErrorRule } from "./rules/error/errorRule.js";
import { applyNetworkRule } from "./rules/network/networkRule.js";
import { applyAuthFailRule } from "./rules/authFail/authRule.js";
import { applyRateLimitRule } from "./rules/rateLimit/rateLimitRule.js";
import { applyPayloadRule } from "./rules/payload/payloadRule.js";
import { applyDataSchemaRule } from "./rules/dataSchema/dataSchemaRule.js";
import { applyAvailabilityRule } from "./rules/availability/availabilityRule.js";
import { applyConsistencyRule } from "./rules/consistency/consistencyRule.js";

const shouldApplyRule = (probability = 1) => {
  return Math.random() < Number(probability ?? 1);
};

// delay must always be first — it never terminates the request,
// just adds latency before other rules run
const RULE_ORDER = ["delay", "authFail", "error", "network", "rateLimit", "payload", "dataSchema", "availability", "consistency"];

const ruleHandlers = {
  delay: applyDelayRule,
  error: applyErrorRule,
  network: applyNetworkRule,
  authFail: applyAuthFailRule,
  rateLimit: applyRateLimitRule,
  payload: applyPayloadRule,
  dataSchema: applyDataSchemaRule,
  availability: applyAvailabilityRule,
  consistency: applyConsistencyRule,
};

export const applyChaosRules = async (rules = [], req, res) => {
  // sort rules so delay always runs first
  const sorted = [...rules].sort((a, b) => {
    const ai = RULE_ORDER.indexOf(a.ruleType);
    const bi = RULE_ORDER.indexOf(b.ruleType);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  for (const rule of sorted) {
    if (!rule || !rule.isEnabled) continue;

    if (!shouldApplyRule(rule.probability)) {
      console.log(`[engine] skipped ${rule.ruleType} (probability roll failed)`);
      continue;
    }

    const handler = ruleHandlers[rule.ruleType];

    if (!handler) {
      console.warn(`[engine] no handler for rule type: ${rule.ruleType}`);
      continue;
    }

    console.log(`[engine] applying ${rule.ruleType}`);
    const terminated = await handler(rule, req, res);

    // if the rule sent a response (returned true), stop processing
    if (terminated === true) {
      console.log(`[engine] ${rule.ruleType} terminated the request`);
      return true;
    }
  }

  return false;
};

export default applyChaosRules;
