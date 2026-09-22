import dotenv from "dotenv";
import app from "./app.js";
import connectDB from "./config/mongo.js";
import redisClient from "./config/redis.js";

dotenv.config({path: ".env"});

const PORT = process.env.PORT || 9000;

connectDB().then(() => {
  
  redisClient.ping().then((reply) => {
    console.log(`Redis ping: ${reply}`);
  });

  app.listen(process.env.PORT || 9000, () => {
    console.log(`MockServer running on port ${process.env.PORT}`);
  });
})
.catch((err) => {
  console.log("mongo DB connection failed!", err)
});
