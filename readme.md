# FluxMock — Three-Repo Structure, Month Plan & Dependencies

Three separate codebases: **app-backend** (control plane: auth, teams, projects, config, webhooks), **mock-server** (data plane: chaos proxy, logging, realtime, background workers), and **frontend** (Next.js + Redux dashboard). Backends follow a **module pattern** — one self-contained folder per feature, each with its own routes, controller, service, and validation.

---

## 1. `app-backend/` — Control Plane

```
app-backend/
├── src/
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.routes.js
│   │   │   ├── auth.controller.js
│   │   │   ├── auth.service.js
│   │   │   ├── auth.validation.js
│   │   │   └── index.js
│   │   ├── users/
│   │   │   └── (routes / controller / service / validation / index)
│   │   ├── teams/
│   │   ├── projects/
│   │   ├── endpoints/
│   │   ├── chaosRules/
│   │   ├── apiKeys/
│   │   ├── webhooks/
│   │   ├── presets/
│   │   ├── auditLogs/
│   │   └── analytics/
│   ├── middlewares/
│   │   ├── rbac.middleware.js
│   │   ├── auth.middleware.js        # JWT verification
│   │   ├── validate.middleware.js    # runs each module's Zod schema
│   │   └── errorHandler.middleware.js
│   ├── jobs/                          # BullMQ producers only — consumers live in workers/
│   │   ├── webhookDispatch.queue.js
│   │   └── analyticsRollup.queue.js
│   ├── workers/
│   │   ├── webhookDispatch.worker.js
│   │   └── analyticsRollup.worker.js
│   ├── config/
│   │   ├── db.js                      # Postgres pool
│   │   ├── redis.js
│   │   ├── env.js
│   │   └── constants.js
│   ├── utils/
│   │   ├── logger.js
│   │   ├── hash.js
│   │   └── pagination.js
│   ├── app.js                         # Express app assembly, mounts every module's routes
│   └── server.js                      # entrypoint — starts the HTTP server
├── scripts/
│   ├── migrate/                       # versioned SQL files
│   └── seed/
├── tests/
│   └── modules/                       # mirrors src/modules structure, one folder per module
├── .env.example
├── package.json
└── tsconfig.json (if using TypeScript)
```

Each module folder is self-contained on purpose — you should be able to delete `modules/webhooks/` entirely and nothing outside it breaks except its mount line in `app.js`.

---

## 2. `mock-server/` — Data Plane (Chaos Backend)

```
mock-server/
├── src/
│   ├── modules/
│   │   ├── apiKeyResolution/
│   │   │   └── (middleware.js / cache.js / index.js)
│   │   ├── router/                    # dynamic request matcher
│   │   │   ├── matcher.js
│   │   │   ├── cache.js
│   │   │   └── index.js
│   │   ├── chaosEngine/
│   │   │   ├── engine.js              # orchestrator — order of rule application
│   │   │   ├── resolver.js            # endpoint-vs-project rule precedence
│   │   │   ├── scheduleCheck.js       # runtime cron/window evaluation
│   │   │   └── rules/
│   │   │       ├── delay/
│   │   │       ├── error/
│   │   │       ├── authFail/
│   │   │       ├── rateLimit/
│   │   │       ├── payload/
│   │   │       ├── network/
│   │   │       ├── dataSchema/
│   │   │       ├── availability/
│   │   │       └── consistency/
│   │   ├── proxy/                     # passthrough forwarding
│   │   │   ├── forward.js
│   │   │   └── recordReplay.js
│   │   ├── templating/                # faker token resolution
│   │   │   └── resolveTemplate.js
│   │   ├── logging/                   # builds + emits the log document
│   │   │   ├── buildLogDoc.js
│   │   │   ├── sanitize.js
│   │   │   └── emit.js
│   │   └── realtime/                  # Socket.io server + Redis Stream consumer
│   │       ├── socketServer.js
│   │       └── streamConsumer.js
│   ├── middlewares/
│   │   ├── selfRateLimit.middleware.js
│   │   └── errorHandler.middleware.js
│   ├── workers/
│   │   ├── chaosMonkey.worker.js
│   │   ├── scheduleEnforcer.worker.js
│   │   └── logRetention.worker.js
│   ├── config/
│   │   ├── mongo.js
│   │   ├── redis.js
│   │   ├── postgres.js                # read-only connection — config source of truth
│   │   └── env.js
│   ├── utils/
│   │   └── logger.js
│   ├── app.js
│   └── server.js
├── tests/
│   └── modules/
├── .env.example
└── package.json
```

Note this server reads config from the **same** Postgres database `app-backend` writes to, but never writes to it itself (except `chaos_rules` rows it creates for Chaos Monkey, tagged `created_by = 'chaos_monkey'`). Keep that boundary strict — it's what keeps the two services safely decoupled.

---

## 3. `frontend/` — Next.js + Redux Dashboard

```
fluxmock/
├── .next/                          (build output, unchanged)
├── node_modules/
├── public/
│   ├── images/
│   ├── icons/
│   └── fonts/
├── app/
│   ├── layout.tsx                  # root layout — fonts, Redux provider, global toasts
│   ├── page.tsx                    # root "/" → marketing landing page
│   ├── globals.css
│   ├── favicon.ico
│   ├── not-found.tsx
│   ├── error.tsx
│   │
│   ├── (marketing)/                # public site — own navbar/footer layout
│   │   ├── layout.tsx
│   │   ├── pricing/page.tsx
│   │   ├── docs/page.tsx
│   │   └── about/page.tsx
│   │
│   ├── (auth)/                     # login/register — centered, no app chrome
│   │   ├── layout.tsx
│   │   ├── login/page.tsx
│   │   ├── register/page.tsx
│   │   └── forgot-password/page.tsx
│   │
│   ├── (software)/                 # ── THE PRODUCT ── sidebar + topbar layout
│   │   ├── layout.tsx              #    project switcher lives here
│   │   ├── projects/
│   │   │   ├── page.tsx            #    project list
│   │   │   ├── new/page.tsx
│   │   │   └── [projectId]/
│   │   │       ├── layout.tsx      #    tab nav: overview/endpoints/rules/logs...
│   │   │       ├── page.tsx        #    overview
│   │   │       ├── endpoints/
│   │   │       │   ├── page.tsx
│   │   │       │   └── [endpointId]/page.tsx
│   │   │       ├── chaos-rules/
│   │   │       │   ├── page.tsx
│   │   │       │   └── [ruleId]/page.tsx
│   │   │       ├── logs/page.tsx   #    live log stream (WebSocket)
│   │   │       ├── webhooks/page.tsx
│   │   │       ├── presets/page.tsx
│   │   │       ├── chaos-monkey/page.tsx
│   │   │       └── settings/page.tsx
│   │   └── team/
│   │       ├── page.tsx
│   │       └── members/page.tsx
│   │
│   └── (analytics)/                # ── SEPARATE SECTION ── own layout, own nav
│       ├── layout.tsx              #    opens at /analytics, distinct from software UI
│       └── analytics/
│           ├── page.tsx            #    org-wide analytics overview
│           └── [projectId]/page.tsx
│
├── components/
│   ├── ui/                         # buttons, inputs, modal, dropdown — shared primitives
│   ├── marketing/                  # navbar, footer, hero, pricing cards
│   ├── software/                   # sidebar, topbar, endpoint table, rule form
│   ├── analytics/                  # chart cards, metric tiles, filters
│   └── logs/                       # live log table, row, detail drawer
│
├── store/
│   ├── slices/
│   │   ├── auth.slice.ts
│   │   ├── projects.slice.ts
│   │   ├── endpoints.slice.ts
│   │   ├── chaosRules.slice.ts
│   │   ├── logs.slice.ts
│   │   ├── analytics.slice.ts
│   │   └── ui.slice.ts
│   ├── store.ts
│   ├── hooks.ts                    # typed useAppSelector / useAppDispatch
│   └── provider.tsx                # client component wrapping <Provider>
│
├── services/
│   ├── apiClient.ts                # axios instance + interceptors (attaches JWT)
│   ├── auth.api.ts
│   ├── projects.api.ts
│   ├── endpoints.api.ts
│   ├── chaosRules.api.ts
│   ├── analytics.api.ts
│   └── socket.ts                   # WebSocket client → mock-server realtime service
│
├── hooks/
│   ├── useRealtimeLogs.ts
│   ├── useAuth.ts
│   └── useDebounce.ts
│
├── lib/
│   ├── auth.ts                     # token storage/refresh helpers
│   └── constants.ts
│
├── types/
│   ├── project.ts
│   ├── endpoint.ts
│   ├── chaosRule.ts
│   └── log.ts
│
├── middleware.ts                   # route protection — redirects unauthenticated users
├── .env.local.example
├── .gitignore
├── AGENTS.md
├── CLAUDE.md
├── eslint.config.mjs
├── next.config.ts
├── next-env.d.ts
├── postcss.config.mjs
├── package.json
├── package-lock.json
├── README.md
└── tsconfig.json
```

The `services/` folder in the frontend intentionally mirrors the `modules/` folder in `app-backend` one-to-one — makes it trivial to find which API file talks to which backend module.

---

## 2. Integrated Month Plan (All Three Repos)

Each day names the specific repo(s) touched. Weeks build vertically — by the end of each week, all three repos are in sync at that feature depth, not one repo racing ahead of the others.

### Week 1 — Foundations (Days 1–7)

| Day | Repo(s) | Deliverable |
|---|---|---|
| 1 | app-backend, mock-server | Scaffold both repos' module structure, `docker-compose.yml` (postgres, mongo, redis), `.env.example` in each |
| 2 | app-backend | Postgres migrations: `users` → `teams` → `team_members` → `projects` → `api_keys` |
| 3 | app-backend | Postgres migrations continued: `endpoints` → `chaos_rules` → `webhooks` → `audit_logs` + indexes |
| 4 | app-backend | `auth` module: register/login/refresh, JWT issuance and verification middleware |
| 5 | frontend | Scaffold Next.js app, Tailwind setup, Redux store + `auth` slice, login/register pages wired to auth API |
| 6 | app-backend | `apiKeys` module: generate/revoke endpoints, hashing |
| 7 | mock-server | Scaffold: `apiKeyResolution` module + `router` module (dynamic matcher against endpoint list). **Milestone: login works end to end in the browser; mock server can authenticate and match a request.** |

### Week 2 — Core CRUD + Core Chaos (Days 8–14)

| Day | Repo(s) | Deliverable |
|---|---|---|
| 8 | app-backend | `projects` and `endpoints` modules — full CRUD with Zod validation, cache invalidation |
| 9 | frontend | Redux `projects` and `endpoints` slices + pages: project list, create project, endpoint list |
| 10 | app-backend | `chaosRules` module — CRUD, per-rule-type config validation |
| 11 | mock-server | `chaosEngine` core: rule fetching, precedence resolution, probability roll |
| 12 | mock-server | `templating` module + mock responder — plain mock endpoints work with no chaos configured |
| 13 | mock-server | `delay` and `error` rule modules |
| 14 | frontend | Redux `chaosRules` slice + chaos rule creation form (delay/error only for now). **Milestone: user can create a mock endpoint and a delay/error rule from the UI and see it fire.** |

### Week 3 — Full Chaos Coverage + Realtime (Days 15–21)

| Day | Repo(s) | Deliverable |
|---|---|---|
| 15 | mock-server | `logging` module: build log doc, sanitize, write to Mongo, publish to Redis Stream |
| 16 | mock-server | `realtime` module: Socket.io server, JWT room auth, stream consumer |
| 17 | frontend | `logs` slice + Socket.io client + real-time log table component |
| 18 | mock-server | `authFail` and `rateLimit` rule modules |
| 19 | mock-server | `payload` and `dataSchema` rule modules |
| 20 | mock-server | `network` and `availability` rule modules |
| 21 | app-backend | RBAC middleware wired onto every module's routes. **Milestone: every chaos category works, logs stream live in the dashboard, and roles are enforced.** |

### Week 4 — Advanced Features (Days 22–27)

| Day | Repo(s) | Deliverable |
|---|---|---|
| 22 | mock-server | `proxy` module: passthrough forwarding + late-apply chaos on real responses |
| 23 | mock-server | Record & replay (`recordReplay.js`) + frontend toggle in endpoint settings |
| 24 | app-backend | `webhooks` module + `webhookDispatch` worker (HMAC signing, retry/backoff) |
| 25 | mock-server | `chaosMonkey` worker: start/stop, tick job, safe-bounds random rule toggling |
| 26 | mock-server | `scheduleEnforcer` worker + schedule field support in `chaosEngine` |
| 27 | app-backend, frontend | `presets` module (save/apply/revert + 5 built-in presets) + frontend preset picker UI |

### Final Stretch — Hardening, Polish, Deploy (Days 28–30)

| Day | Repo(s) | Deliverable |
|---|---|---|
| 28 | app-backend | `analytics` module + `analyticsRollup` worker; frontend analytics charts page |
| 29 | app-backend, mock-server | Security pass: SSRF allowlist on target URLs, body size limits, gateway self-rate-limit, secret redaction audit across both repos |
| 30 | all three | Load test the mock-server proxy path, fix engine-overhead latency, add health-check endpoints to both backends, containerize all three for deployment |

**Deliberately deferred past day 30:** CLI, OpenAPI/Postman import, automated log retention sweep. None of these block a working, demoable product — pick them up in the sprint immediately after.

---

## 3. Dependencies

### `app-backend` — package.json

**Runtime**
- `express` — HTTP framework
- `cors`, `helmet` — cross-origin + security headers
- `dotenv` — env loading
- `pg` — Postgres client
- `ioredis` — Redis client
- `jsonwebtoken` — JWT issuance/verification
- `bcrypt` — password hashing
- `zod` — request/config validation, shared shape with frontend types
- `uuid` — id generation where DB doesn't handle it
- `bullmq` — job queues (webhook dispatch, analytics rollup)
- `winston` — structured logging
- `morgan` — HTTP request logging in dev
- `multer` — file upload handling (OpenAPI/Postman import, later)
- `js-yaml` — parsing uploaded OpenAPI YAML specs (later)
- `luxon` — timezone-aware schedule handling for presets/rules

**Dev**
- `typescript`, `ts-node`, `@types/node`, `@types/express` (if using TypeScript)
- `nodemon` — dev auto-restart
- `eslint`, `prettier`, `eslint-config-prettier`
- `jest`, `supertest` — unit + integration testing
- `husky`, `lint-staged` — pre-commit hooks (optional but recommended once team > 1)

### `mock-server` — package.json

**Runtime**
- `express` — HTTP framework
- `ioredis` — Redis client (config cache, rate limit counters, stream pub/sub)
- `mongoose` — MongoDB client for logs
- `pg` — read-only Postgres client (shares schema with app-backend)
- `undici` — fast HTTP client for passthrough forwarding
- `path-to-regexp` — endpoint pattern matching in the dynamic router
- `@faker-js/faker` — response templating tokens
- `socket.io` — real-time log streaming to the dashboard
- `bullmq` — background jobs (Chaos Monkey tick, schedule enforcer, log retention)
- `luxon` — schedule window/timezone evaluation
- `winston` — structured logging
- `dotenv`, `cors`, `helmet`

**Dev**
- `typescript`, `ts-node`, `@types/node`, `@types/express`
- `nodemon`
- `eslint`, `prettier`
- `jest`, `supertest`
- `k6` or `artillery` (not an npm dependency — separate load-testing tool, install globally or via CI)

### `frontend` — package.json

**Runtime**
- `next`, `react`, `react-dom`
- `@reduxjs/toolkit`, `react-redux` — state management
- `axios` — API client
- `socket.io-client` — real-time log/event stream from mock-server
- `react-hook-form` — form state
- `zod` + `@hookform/resolvers` — shared validation shapes with backend, wired into forms
- `tailwindcss`, `postcss`, `autoprefixer` — styling
- `clsx` — conditional classNames
- `recharts` — analytics charts
- `lucide-react` — icon set
- `date-fns` — date formatting/relative time in log views

**Dev**
- `typescript`, `@types/react`, `@types/node`
- `eslint`, `eslint-config-next`, `prettier`
- `jest`, `@testing-library/react`, `@testing-library/jest-dom` — component testing

---

## Notes on the Module Pattern (Backend)

Applied consistently in both `app-backend` and `mock-server`:

- Every module owns its own `routes` → `controller` → `service` → `validation` chain. Controllers never touch the database directly — only services do.
- Modules import from `shared`/`config`/`utils`, never from each other's internals directly. If `webhooks` needs something from `projects`, it calls the `projects` service's exported function, not its internal files.
- `index.js` in each module is the only file other parts of the app are allowed to import from — this keeps the module's internal structure free to change without breaking anything outside it.