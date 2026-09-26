import loadProjectAndEndpointRules from "../modules/chaosEngine/resolver.js";
import { applyChaosRules } from "../modules/chaosEngine/engine.js";

const chaosResolutionMiddleware = async (req, res, next) => {
  try {
    //get endpointId passed on by the projectResolution middleware 
    //always remains a string
    const endpointId = req.endpoint?._id ? String(req.endpoint._id) : null;
    
    //loads the endpoint and the project rules of the respective ids
    //performs the hirarchial priority of chaos
    const rules = await loadProjectAndEndpointRules(
      req.projectId,
      endpointId
    );
 
    console.log(`[chaos] rules resolved: ${rules?.length} → ${rules.map(r => r.ruleType).join(", ") || "none"}`);
    //this gets passed on to the chaosRules resolver middleware
    req.chaosRules = rules;

    await applyChaosRules(req.chaosRules, req, res);  //applies the runs the middleware which applies the particular rule for that endpoint

    if (res.headersSent) {
      console.log("[chaos] response sent by chaos rule, skipping mock response");
      return;
    }

    return next();
  } catch (error) {
    console.error("[chaos] resolution error:", error);
    return next(error);
  }
};

export default chaosResolutionMiddleware;