// Starts the full local stack used by integration and browser tests:
// Postgres (existing cluster) → PostgREST → Supabase-compatible gateway →
// Vercel-like server running the real api/ handlers and public/ files.
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');
const JWT_SECRET = 'nala-local-test-secret-0123456789abcdef';
const PORTS = { postgrest: 54301, gateway: 54321, app: 54380, openai: 54390 };

async function waitFor(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.status < 500) return; } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error(`timeout esperando ${url}`);
}

async function startStack({ resetDb = true, openai = true } = {}) {
  if (resetDb) execFileSync('bash', [path.join(__dirname, 'db.sh')], { stdio: 'inherit' });
  const { sign } = require('./fake-supabase');
  const serviceKey = sign({ role: 'service_role', iss: 'supabase' }, JWT_SECRET);
  const anonKey = sign({ role: 'anon', iss: 'supabase' }, JWT_SECRET);
  const dbUrl = 'postgres://authenticator:authenticator@127.0.0.1:5432/nala_test';
  const conf = path.join(os.tmpdir(), 'nala-postgrest.conf');
  fs.writeFileSync(conf, [`db-uri = "${dbUrl}"`, 'db-schemas = "public"', 'db-anon-role = "anon"', `jwt-secret = "${JWT_SECRET}"`, `server-port = ${PORTS.postgrest}`, 'db-pool = 20', 'log-level = "error"'].join('\n'));
  const postgrestBin = process.env.POSTGREST_BIN || '/tmp/claude-0/postgrest';
  const postgrest = spawn(postgrestBin, [conf], { stdio: ['ignore', 'inherit', 'inherit'] });
  await waitFor(`http://127.0.0.1:${PORTS.postgrest}/`);
  const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nala-storage-'));
  const gateway = await require('./fake-supabase').start({ port: PORTS.gateway, postgrestUrl: `http://127.0.0.1:${PORTS.postgrest}`, jwtSecret: JWT_SECRET,
    dbUrl: 'postgres://postgres:postgres@127.0.0.1:5432/nala_test', storageDir });
  Object.assign(process.env, {
    SUPABASE_URL: `http://127.0.0.1:${PORTS.gateway}`, SUPABASE_SERVICE_ROLE_KEY: serviceKey, SUPABASE_ANON_KEY: anonKey,
    NALA_WORKER_SECRET: 'worker-secret-for-local-tests-123',
  });
  let fakeOpenai = null;
  if (openai) {
    fakeOpenai = await require('./fake-openai').start({ port: PORTS.openai });
    process.env.OPENAI_API_KEY = 'sk-test-local';
    process.env.NALA_OPENAI_BASE_URL = `http://127.0.0.1:${PORTS.openai}/v1`;
  }
  const app = await require('./vercel-dev').start({ port: PORTS.app });
  return {
    base: `http://127.0.0.1:${PORTS.app}`, gatewayUrl: process.env.SUPABASE_URL, openaiUrl: `http://127.0.0.1:${PORTS.openai}`, storageDir, fakeOpenai,
    async stop() { app.close(); fakeOpenai?.server.close(); await gateway.close(); postgrest.kill(); },
  };
}

module.exports = { startStack, PORTS, JWT_SECRET, ROOT };

if (require.main === module) {
  // Manual run: node tests/nala/support/stack.js  → keeps the stack up.
  startStack({ openai: process.env.NALA_REAL_OPENAI !== '1' }).then(s => console.log(`NALA local en ${s.base}/  (admin/Admin#2026, oficial/Oficial#2026)`));
}
