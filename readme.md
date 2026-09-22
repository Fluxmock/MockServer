# MockServer

MockServer is the runtime data-plane for FluxMock. It receives project-scoped mock traffic, resolves the project key from the URL, loads the mock endpoint matching the request path, applies chaos rules, and returns a mocked response from that project.

This service is intentionally separate from the AppServer control plane. AppServer owns user auth, project metadata, endpoint configuration, and chaos rule definition. MockServer reads the project and endpoint configuration, applies the runtime behavior, and emits logs.

---

## What this service does

MockServer is responsible for:

- receiving HTTP requests on the mock domain
- resolving the project from the project key in the URL
- validating the project is active
- matching request method + path to a configured endpoint
- loading active chaos rules for the project and endpoint
- applying chaos logic such as delay, error injection, payload mutation, rate limiting, etc.
- returning the configured mock response
- logging request/response metadata
- streaming realtime logs through Socket.IO

The core request flow is:

1. request comes in
2. project key is extracted from the URL
3. project is resolved (MongoDB + Redis cache)
4. endpoint is matched against the project configuration
5. chaos rules are resolved and applied
6. mock response is sent
7. log is created and emitted

---

## Server architecture

### Request lifecycle

The current flow on the server side is roughly:

- app starts in [src/server.js](src/server.js)
- Express app is created in [src/app.js](src/app.js)
- project key resolution runs in [src/middlewares/projectResolution.middleware.js](src/middlewares/projectResolution.middleware.js)
- once the project is resolved, the route matching layer should identify the endpoint for the request
- chaos rules are loaded from Redis and resolved in [src/modules/chaosEngine/resolver.js](src/modules/chaosEngine/resolver.js)
- actual rule behavior is implemented in rule files under [src/modules/chaosEngine/rules](src/modules/chaosEngine/rules)
- logs are recorded in [src/modules/logging](src/modules/logging)
- realtime data is emitted through [src/modules/realtime](src/modules/realtime)

### Important architectural boundary

MockServer is read-heavy for runtime traffic, and it does not own the source-of-truth project configuration. The source-of-truth lives in AppServer. MockServer mirrors the necessary Project model in MongoDB for resolution and request routing.

This means:

- AppServer creates/updates projects, endpoints, and rules
- MockServer only reads and serves
- Redis gives fast cached project resolution
- MongoDB is the durable data source for project lookup

---

## Folder structure

```text
MockServer/
├── .env
├── .gitignore
├── package.json
├── package-lock.json
├── readme.md
├── public/
│   └── temp/
├── src/
│   ├── app.js
│   ├── server.js
│   ├── config/
│   │   ├── constant.js
│   │   ├── env.js
│   │   ├── mongo.js
│   │   └── redis.js
│   ├── middlewares/
│   │   ├── errorHandler.middleware.js
│   │   ├── projectResolution.middleware.js
│   │   └── selfRateLimit.middleware.js
│   ├── models/
│   │   └── Project.js
│   ├── modules/
│   │   ├── apiKeyResolution/
│   │   ├── chaosEngine/
│   │   │   ├── engine.js
│   │   │   ├── resolver.js
│   │   │   ├── scheduleCheck.js
│   │   │   └── rules/
│   │   │       ├── authFail/
│   │   │       ├── availability/
│   │   │       ├── consistency/
│   │   │       ├── dataSchema/
│   │   │       ├── delay/
│   │   │       ├── error/
│   │   │       ├── network/
│   │   │       ├── payload/
│   │   │       └── rateLimit/
│   │   ├── logging/
│   │   │   ├── buildLogDoc.js
│   │   │   ├── emit.js
│   │   │   └── sanitize.js
│   │   ├── proxy/
│   │   │   ├── forward.js
│   │   │   └── recordReplay.js
│   │   ├── realtime/
│   │   │   ├── socketServer.js
│   │   │   └── streamConsumer.js
│   │   ├── router/
│   │   │   ├── cache.js
│   │   │   ├── index.js
│   │   │   └── matcher.js
│   │   └── templating/
│   │       └── resolveTemplate.js
│   ├── utils/
│   │   ├── ApiError.js
│   │   ├── ApiResponse.js
│   │   ├── asyncHandler.js
│   │   ├── logger.js
│   │   └── ...
│   ├── workers/
│   │   ├── chaosMonkey.worker.js
│   │   ├── logRetention.worker.js
│   │   └── scheduleEnforcer.worker.js
│   └── ...
└── node_modules/   
```

---

## Runtime dependencies

The current project dependencies are defined in [package.json](package.json). The stack is:

- express — HTTP server and routing
- cors — cross-origin handling
- cookie-parser — cookie parsing
- dotenv — env loading
- mongoose — MongoDB access
- ioredis — Redis client
- socket.io — realtime log streaming
- bullmq — background job processing
- path-to-regexp — route matching patterns
- undici — HTTP client support
- luxon — time/date utilities
- @faker-js/faker — templated mock payload generation
- winston — structured logging
- cloudinary — optional asset-related support

Development dependencies:

- nodemon — local development reloading

---

## Installation

From the MockServer folder:

```bash
cd MockServer
npm install
```

Then start the server in development mode:

```bash
npm run dev
```

Production start:

```bash
npm start
```

---

## Environment variables

Create a .env file in the MockServer folder.

Example:

```env
PORT=9000
REDIS_URL=redis://localhost:6379
MONGODB_URI=mongodb://localhost:27017
CORS_ORIGIN=http://localhost:3000
```

### Meaning of each env

- PORT
  - port where MockServer listens
  - default: 9000

- REDIS_URL
  - Redis connection string for cache and rate-limiting

- MONGODB_URI
  - MongoDB connection URI used by this service

- CORS_ORIGIN
  - allowed front-end origin for browser access

The app also expects a Mongo database name defined in [src/config/constant.js](src/config/constant.js):

```js
export const MONGODB_DB_NAME = "fluxmock";
```

So the full Mongo connection is effectively:

```text
<MONGODB_URI>/<MONGODB_DB_NAME>
```

---

## Important runtime assumptions

### 1. Project key URL format

MockServer expects a URL shaped like:

```text
/pk_<projectKey>/path/to/mock/route
```

Example:

```text
http://localhost:9000/pk_abc123/users/cart
```

The resolver strips the project key from the URL and keeps the remainder as the mock path.

### 2. Project model is a read mirror

The Project model in MockServer is a lightweight mirror of the project configuration created by AppServer. It does not own project creation; it only reads the project.

---

## Typical startup sequence

When the app boots:

1. dotenv loads environment variables
2. MongoDB connects via [src/config/mongo.js](src/config/mongo.js)
3. Redis connects via [src/config/redis.js](src/config/redis.js)
4. the Express app listens on the configured port
5. requests begin passing through project key resolution
6. future runtime routing layer resolves endpoints and chaos logic

---

## Local development setup

You will typically run these services together:

- MongoDB
- Redis
- AppServer
- MockServer
- frontend

Example local setup:

```bash
# in one terminal
cd MockServer
npm run dev

# in another terminal
cd AppServer
npm run dev
```

Then open the frontend app and create a project using AppServer, then use the generated project key in a MockServer request like:

```text
http://localhost:9000/pk_<your_project_key>/users/cart
```

---

## Notes for contributors

- keep MockServer stateless in the request pipeline
- keep project resolution and route matching separated
- route matching should happen after project validation
- chaos rules should be applied only after a valid endpoint is found
- do not write new source-of-truth project config in MockServer; read it from AppServer or the mirrored Mongo collection

---

## Notes on the Module Pattern (Backend)

Applied consistently in both `app-backend` and `mock-server`:

- Every module owns its own `routes` → `controller` → `service` → `validation` chain. Controllers never touch the database directly — only services do.
- Modules import from `shared`/`config`/`utils`, never from each other's internals directly. If `webhooks` needs something from `projects`, it calls the `projects` service's exported function, not its internal files.
- `index.js` in each module is the only file other parts of the app are allowed to import from — this keeps the module's internal structure free to change without breaking anything outside it.