import test from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';

test('API health and protected route checks', async (t) => {
  const server = app.listen(0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address();
  const base = 'http://127.0.0.1:' + address.port;

  const healthResponse = await fetch(base + '/api/health');
  assert.equal(healthResponse.status, 200);
  const health = await healthResponse.json();
  assert.equal(health.status, 'ok');
  assert.equal(health.paymentsEnabled, false);

  const rulesResponse = await fetch(base + '/api/rules');
  assert.equal(rulesResponse.status, 401);

  const auditResponse = await fetch(base + '/api/audit');
  assert.equal(auditResponse.status, 401);

  const fxQuoteResponse = await fetch(base + '/api/fx/quotes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approvalId: '507f1f77bcf86cd799439011' }),
  });
  assert.equal(fxQuoteResponse.status, 401);

  const assistantResponse = await fetch(base + '/api/assistant/plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'wireless headphones' }),
  });
  assert.equal(assistantResponse.status, 503);

  const registerResponse = await fetch(base + '/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'A', email: 'not-an-email', password: 'short' }),
  });
  assert.equal(registerResponse.status, 400);
});
