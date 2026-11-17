import test from "node:test";
import assert from "node:assert/strict";
import { applyChaosRules } from "../src/modules/chaosEngine/engine.js";
import { buildLogDoc } from "../src/modules/logging/buildLogDoc.js";

const makeRule = (ruleType, probability = 1, config = {}) => ({ ruleType, probability, config, isEnabled: true });
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json() {} });

test("enabled rules skipped by probability do not count as injections", async () => {
  const req = { method: "GET", path: "/test", chaosRules: [makeRule("error", 0)] };
  const res = response();
  await applyChaosRules(req.chaosRules, req, res);
  const log = buildLogDoc(req, res);
  assert.equal(log.chaosApplied, false);
  assert.deepEqual(log.chaosRules, []);
});

test("counts delay and terminal failure, excluding rules never reached", async () => {
  const rules = [makeRule("delay", 1, { ms: 1 }), makeRule("error"), makeRule("payload")];
  const req = { method: "GET", path: "/test", chaosRules: rules };
  const res = response();
  await applyChaosRules(rules, req, res);
  assert.deepEqual(buildLogDoc(req, res).chaosRules, ["delay", "error"]);
});

test("no-op delay and availability rules are not counted", async () => {
  const rules = [makeRule("delay", 1, { ms: 0 }), makeRule("availability", 1, { type: "partialOutage", affectedPaths: ["/other"] })];
  const req = { method: "GET", path: "/test" };
  const res = response();
  await applyChaosRules(rules, req, res);
  assert.equal(buildLogDoc(req, res).chaosApplied, false);
});

test("terminal rule is recorded when the response is sent", async () => {
  const req = { method: "GET", path: "/test" };
  const res = response();
  res.json = () => assert.deepEqual(buildLogDoc(req, res).chaosRules, ["error"]);
  await applyChaosRules([makeRule("error")], req, res);
});
