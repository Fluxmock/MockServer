export const AUTH_FAILURE_PRESETS = [
  "expiredToken",
  "invalidSignature",
  "missingAuthHeader",
  "insufficientScope",
  "insufficientPermission"
];

export const applyAuthFailRule = async(rule, req, res) => {
    const config = rule?.config ?? {};

    const failureType = config.failureType;

    if(!AUTH_FAILURE_PRESETS.includes(failureType)){
        console.warn(`[authFail] invalid failureType:  ${failureType}`

        );
        return false;
    }

    const body = config.body ?? {
        success : false,
        message: `simulated auth failure: ${failureType}`,
        chaosRule: "authFail",
        failureType,
    };

    res.status(
        failureType === "insufficientScope" ||
        failureType === "insufficientPermission" 
          ? 403
          : 401
    ).json(body);

    console.log(
        `[authFail] injected ${failureType}`
    );

    return true;  
};

export default { applyAuthFailRule };

