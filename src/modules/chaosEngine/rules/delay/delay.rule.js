// Latency chaos — fixed delay, random range, jitter, percentage-based
export const applyDelayRule = async (rule, req, res) => {
  const config = rule?.config ?? {};

  // percentage-based: only apply to X% of requests
  // different from probability — probability is "should this rule fire at all"
  // percentage is "of the requests that reach this rule, delay X% of them"
  if (config.percentage !== undefined) {
    if (Math.random() * 100 > Number(config.percentage)) {
      return false;
    }
  }

  let ms = 0;

  if (config.min !== undefined && config.max !== undefined) {
    // random range: between min and max ms
    const min = Number(config.min);
    const max = Number(config.max);
    ms = Math.floor(Math.random() * (max - min + 1)) + min;
  } else {
    ms = Number(config.ms ?? 1000);
  }

  // jitter: add ±jitter ms of randomness on top
  if (config.jitter) {
    const jitter = Number(config.jitter);
    ms += Math.floor(Math.random() * jitter * 2) - jitter;
  }

  ms = Math.max(0, ms);

  if (!Number.isFinite(ms) || ms <= 0) return false;

  await new Promise((resolve) => setTimeout(resolve, ms));
  console.log(`[delay] injected ${ms}ms`);
  return false; // return false so engine continues — delay never terminates the request
};

export default { applyDelayRule };
