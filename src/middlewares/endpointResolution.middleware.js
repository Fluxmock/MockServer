import redisClient from "../config/redis.js";
import Endpoint from "../models/Endpoint.js";
import { match } from "path-to-regexp";

const endpointResolver = async (req, res, next) => {
  try {
    const cacheKey = `project:endpoints:${req.projectId}`; //get the project key from the projectResolution middleware
    let endpoints = [];  

    const cachedEndpoints = await redisClient.get(cacheKey); //returns the cachedEndpoints of that project

    if (cachedEndpoints) {
      try {
        //if the endpoint exists in the redis convert them to JSON format
        const parsed = JSON.parse(cachedEndpoints);
        if (Array.isArray(parsed)) {
          //arrays of endpoint then copy parsed array to endpoint array
          endpoints = parsed;
          console.log(`[endpoint] cache HIT  → projectId:${req.projectId} (${endpoints.length} endpoints)`);
        }
      } catch (error) {
        endpoints = [];  //return empty array
      }
    }

    if (!cachedEndpoints || endpoints.length === 0) {
      //if it is not already cached then query mongodb!
      console.log(`[endpoint] cache MISS → projectId:${req.projectId} querying MongoDB`);
      endpoints = await Endpoint.find({
        //find the active endpoints of the project
        projectId: req.projectId,
        isActive: true,
      }).lean();
      
      //cache it to the redis
      //I SHOULD INCREASE THE TTL
      await redisClient.set(cacheKey, JSON.stringify(endpoints), "EX", 300);
      console.log(`[endpoint] MongoDB HIT → ${endpoints.length} endpoints cached for 300s`);
    }

    // Try path-to-regexp matching for parameterized routes
    let matchedEndpoint = null;
    let pathParams = {};

    for (const item of endpoints) {
      //loop through all cached endpoints
      if (String(item.method).toUpperCase() !== String(req.method).toUpperCase()) {
        //simply checks the method if the request is GET etc then matches in the endpoint
        continue;
      }

      if (!item.isActive) {
        continue;
      }

      try {
        // match() this converts a route pattern into a function that can test actual URLS
        const matcher = match(item.path, { decode: decodeURIComponent });
        const result = matcher(req.mockPath || "/");

        if (result) {
          //save the matching endpoints
          matchedEndpoint = item;
          pathParams = result.params || {};
          //stop because found the endpoint
          break;
        }
      } catch (error) {
        // path-to-regexp parsing failed, skip this endpoint
        continue;
      }
    }

    if (!matchedEndpoint) {
      return res.status(404).json({
        success: false,
        message: "Endpoint not found",
      });
    }
    //creates a req that gets used by a later middleware
    req.endpoint = {
      ...matchedEndpoint,
      _id: String(matchedEndpoint._id),           // normalize ObjectId → plain string always
      projectId: String(matchedEndpoint.projectId),
    };
    req.pathParams = pathParams;
    return next();
  } catch (error) {
    return next(error);
  }
};

export default endpointResolver;