export const buildErrorRule = ({
  statusCode = 500,
  message = "Simulated error",
  probability = 1,
  isEnabled = true,
} = {}) => ({
  ruleType: "error",
  probability,
  config: {
    statusCode,
    message,
  },
  isEnabled,
});

export const applyErrorRule = async (rule, req, res) => {
  const statusCode = Number(rule?.config?.statusCode ?? 500);
  const message = rule?.config?.message ?? "Simulated error";

  if (!Number.isFinite(statusCode) || statusCode < 100) {
    return false;
  }

  if (res && typeof res.status === "function") {
    res.status(statusCode).json({
      success: false,
      message,
      chaosRule: "error",
    });
  }

  return true;
};

export default {
  buildErrorRule,
  applyErrorRule,
};
