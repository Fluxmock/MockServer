import { applyDelayRule } from "./rules/delay/delayRule.js";
import { applyErrorRule } from "./rules/error/errorRule.js";
import { applyNetworkRule } from "./rules/network/networkRule.js";

const shouldApplyRule = (probability = 1) => {
  return Math.random() < Number(probability ?? 1);
};

const ruleHandlers = {
  delay: applyDelayRule,
  error: applyErrorRule,
  network: applyNetworkRule,
};

export const applyChaosRules = async (rules = [], req = {}, res = {}) => {
  let appliedRule = false;

  for (const rule of rules) {
    if (!rule || !rule.isEnabled) {
      continue;
    }

    if (!shouldApplyRule(rule.probability)) {
      continue;
    }

    const handler = ruleHandlers[rule.ruleType];

    if (!handler) {
      console.warn(`Unknown chaos rule: ${rule.ruleType}`);
      continue;
    }

    const didApply = await handler(rule, req, res);
    if (didApply !== false) {
      appliedRule = true;
    }
  }

  return appliedRule;
};

export default applyChaosRules;