const networkHandlers = {
  latency: async (rule, req, res) => {
    const ms = Number(rule?.config?.ms ?? 0);

    if (!Number.isFinite(ms) || ms <= 0) {
      return false;
    }

    await new Promise((resolve) => setTimeout(resolve, ms));
    console.log("Network latency injected");
    return true;
  },

  timeout: async (rule, req, res) => {
    const ms = Number(rule?.config?.ms ?? 0);

    if (!Number.isFinite(ms) || ms <= 0) {
      return false;
    }

    await new Promise((resolve) => setTimeout(resolve, ms));
    console.log("Network timeout simulated");
    return true;
  },

  packetLoss: async (rule, req, res) => {
    const shouldDrop = Boolean(rule?.config?.drop ?? false);
    if (!shouldDrop) {
      return false;
    }

    console.log("Packet loss simulated");
    return true;
  },
};

export const applyNetworkRule = async (rule, req, res) => {
  const subType = rule?.config?.type;
  const handler = networkHandlers[subType];

  if (!handler) {
    return false;
  }

  return handler(rule, req, res);
};

export default {
  applyNetworkRule,
};
