import Endpoint from "../models/Endpoint.js";
import { match } from "path-to-regexp";
import { readOrRebuild, runtimeCacheKeys } from "../services/runtimeCache.service.js";

const isEndpointCollection = (value) => Array.isArray(value);

const loadActiveEndpoints = (projectId) => Endpoint.find({
  projectId,
  isActive: true,
}).lean();

const endpointResolver = async (req, res, next) => {
  try {
    const endpoints = await readOrRebuild({
      cacheKey: runtimeCacheKeys.endpoints(req.projectId),
      versionKey: runtimeCacheKeys.endpointsVersion(req.projectId),
      validate: isEndpointCollection,
      load: () => loadActiveEndpoints(req.projectId),
    });

    let matchedEndpoint = null;
    let pathParams = {};

    for (const item of endpoints) {
      if (String(item.method).toUpperCase() !== String(req.method).toUpperCase()) continue;
      if (!item.isActive) continue;

      try {
        const result = match(item.path, { decode: decodeURIComponent })(req.mockPath || "/");
        if (result) {
          matchedEndpoint = item;
          pathParams = result.params || {};
          break;
        }
      } catch (error) {
        // An invalid legacy pattern must not take down runtime routing.
        console.warn(`[endpoint] invalid route pattern ${item.path}:`, error.message);
      }
    }

    if (!matchedEndpoint) {
      return res.status(404).json({ success: false, message: "Endpoint not found" });
    }

    req.endpoint = {
      ...matchedEndpoint,
      _id: String(matchedEndpoint._id),
      projectId: String(matchedEndpoint.projectId),
    };
    req.pathParams = pathParams;
    return next();
  } catch (error) {
    return next(error);
  }
};

export default endpointResolver;
