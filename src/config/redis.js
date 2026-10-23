import Redis from "ioredis";

const redisClient = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: 3,
  // Commands connect on demand. This also keeps pure runtime-rule/cache tests
  // from opening a retrying Redis socket merely by importing a module.
  lazyConnect: true,
});

redisClient.on("connect", () => {
  console.log("Redis connected");
});

redisClient.on("error", (err) => {
  console.error("Redis error:", err.message);
});

export default redisClient;
