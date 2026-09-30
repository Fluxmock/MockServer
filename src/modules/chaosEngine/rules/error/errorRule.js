// Error injection — 4xx/5xx with custom body
const ALLOWED_ERROR_CODES = new Set([
  400, //bad request
  401, //unauthorized
  402, //payment required
  403, //forbidden
  404, //not found
  405, //method not allowed
  406, //not acceptable
  407, //proxy authentication
  408, //request timeout
  409, //conflict , request conflicts with the current state of the server
  410, //gone, the requested resource is permanently deleted
  411, //length required - requries specified content length header
  412, //precondition failed -> PUT,PATCH,DELETE
  413, //payload to large
  414, //URI too long-> uri requested by client is too long than the server is willing to interpret
  415, //unsupported media type
  416, //range not satisfiable
  417, //expectation failed
  418, //i am a teapot 
  421, //misdirected request
  422, //unprocessable entity
  423, //locked
  424, //failed dependency
  425, //too early
  426, //upgrade required
  428, //precondition requried
  429, //too many requests
  431, //header fields too large
  451, //unavailable for legal reasons
  500, //internal server error
  501, //not implemented 
  502, //bad gateway
  503, //service unavailable
  504, //gateway timeout
  505, //http version not supported
  506, //variant also negotiates
  507, //insufficient storage
  508, //loop detected
  510, //not extended
  511, //network auth required
])
export const applyErrorRule = async (rule, req, res) => {
  const config = rule?.config ?? {};

  const statusCode = Number(config.statusCode ?? 500);

  // if (!Number.isFinite(statusCode) || statusCode < 100) return false;
  if(!ALLOWED_ERROR_CODES.has(statusCode)){
    console.warn(
      `[error] invalid statusCode: ${config.statusCode}`
    );

    return false;
  }

  const body = config.body ?? {
    success: false,
    message: config.message ?? "Simulated error",
    chaosRule: "error",
  };

  res.status(statusCode).json(body);
  console.log(`[error] injected ${statusCode}`);
  return true; // terminates — no response after this
};

export default { applyErrorRule };
