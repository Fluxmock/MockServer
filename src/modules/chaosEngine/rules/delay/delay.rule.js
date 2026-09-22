export const buildDelayRule = ({
  ms = 1000,
  probability = 1,
  isEnabled = true,
} = {}) => ({
  ruleType: "delay",
  probability,
  config: {
    ms,
  },
  isEnabled,
});

export const applyDelayRule = async (rule, req, res) => {
  const ms = Number(rule?.config?.ms ?? 0);

  if (!Number.isFinite(ms) || ms <= 0) {
    return false;
  }

  await new Promise((resolve) => setTimeout(resolve, ms));
  console.log("Added delay!");
  return true;
};

export default {
  buildDelayRule,
  applyDelayRule,
};
