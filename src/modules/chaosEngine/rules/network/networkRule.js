const networkHandlers = {

  // timeout: terminates by destroying the socket — client gets ECONNRESET
  timeout: async (rule, req, res) => {
    const ms = Number(rule?.config?.ms ?? 0);

    if (ms > 0) {
      // optional: wait before dropping — simulates a slow timeout
      await new Promise((resolve) => setTimeout(resolve, ms));
    }

    // destroy the underlying socket — no response is ever sent
    req.socket?.destroy();
    console.log(`[network] timeout simulated — socket destroyed after ${ms}ms`);
    return true; // terminates — engine stops
  },

  // packetLoss: drops the request by ending without a response body
  // client receives an empty response with connection closed
  packetLoss: async (rule, req, res) => {
    const shouldDrop = Boolean(rule?.config?.drop ?? true);
    if (!shouldDrop) return false;

    // send empty 200 with connection: close to simulate a dropped packet
    res.set("Connection", "close").status(200).end();
    console.log("[network] packetLoss — connection dropped");
    return true; // terminates
  },

  // reset: abruptly resets the connection
  reset: async (rule, req, res) => {
    req.socket?.destroy();
    console.log("[network] connection reset");
    return true;
  },
};

export const applyNetworkRule = async (rule, req, res) => {
  const subType = rule?.config?.type;
  const handler = networkHandlers[subType];

  if (!handler) {
    console.warn(`[network] unknown type: ${subType}`);
    return false;
  }

  return handler(rule, req, res);
};

export default { applyNetworkRule };
