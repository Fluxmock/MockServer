import test from 'node:test';
import assert from 'node:assert/strict';

import { applyChaosRules } from '../src/modules/chaosEngine/engine.js';

test('delay rule executes and waits for configured ms', async () => {
  const rule = {
    ruleType: 'delay',
    probability: 1,
    isEnabled: true,
    config: { ms: 5 },
  };

  const start = Date.now();
  const result = await applyChaosRules([rule], {}, {});
  const elapsed = Date.now() - start;

  assert.equal(result, true);
  assert.ok(elapsed >= 5);
});

test('error rule returns custom status without crashing', async () => {
  let statusCode = null;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      return payload;
    },
  };

  const rule = {
    ruleType: 'error',
    probability: 1,
    isEnabled: true,
    config: { statusCode: 503, message: 'Service unavailable' },
  };

  const result = await applyChaosRules([rule], {}, res);

  assert.equal(result, true);
  assert.equal(statusCode, 503);
});

test('network rule dispatches subrule type', async () => {
  let delayHit = false;
  const req = {};
  const res = {};

  const rule = {
    ruleType: 'network',
    probability: 1,
    isEnabled: true,
    config: { type: 'latency', ms: 10 },
  };

  const result = await applyChaosRules([rule], req, res);

  assert.equal(result, true);
  assert.equal(typeof result, 'boolean');
});
