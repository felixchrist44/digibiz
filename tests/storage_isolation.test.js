// Storage tenant-isolation test. Touches ONLY objects it creates itself (test-*.png),
// and removes them at the end via the service role. No produk rows are modified.
// All URLs/secrets come from environment variables; nothing is hardcoded or read from disk.
// Run: node --env-file=.env.local tests/storage_isolation.test.js
const { createClient } = require('@supabase/supabase-js');

const REQUIRED = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'TEST_USER_A_OWNER_EMAIL',
  'TEST_USER_A_OWNER_PASS',
  'TEST_USER_B_OWNER_EMAIL',
  'TEST_USER_B_OWNER_PASS',
];
const missing = REQUIRED.filter(k => !process.env[k]);
if (missing.length) {
  console.error(`Missing required env vars: ${missing.join(', ')}`);
  process.exit(1);
}
const env = process.env;

const B = 'product-images';
const mk = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const PNG = Buffer.from('89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000D49444154789C6360000002000154A24F5D0000000049454E44AE426082', 'hex');

async function login(email, pass) {
  const c = mk();
  const { data, error } = await c.auth.signInWithPassword({ email, password: pass });
  if (error) throw new Error(`login ${email}: ${error.message}`);
  const claims = JSON.parse(Buffer.from(data.session.access_token.split('.')[1], 'base64url').toString());
  return { c, tenant: claims.app_metadata?.tenant_id, topLevel: claims.tenant_id };
}
const exists = async p => {
  const [dir, file] = p.split('/');
  const { data } = await admin.storage.from(B).list(dir, { search: file });
  return (data || []).some(f => f.name === file);
};

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); };

(async () => {
  const A = await login(env.TEST_USER_A_OWNER_EMAIL, env.TEST_USER_A_OWNER_PASS);
  const Bu = await login(env.TEST_USER_B_OWNER_EMAIL, env.TEST_USER_B_OWNER_PASS);
  console.log('claim check: A app_metadata.tenant_id =', A.tenant, '| top-level tenant_id =', A.topLevel);
  check('JWT carries app_metadata.tenant_id', !!A.tenant && !!Bu.tenant && A.tenant !== Bu.tenant);

  const ts = Date.now();
  const aFile = `${A.tenant}/test-${ts}-a.png`;
  const aFile2 = `${A.tenant}/test-${ts}-a2.png`;
  const created = [aFile, aFile2, `${Bu.tenant}/test-${ts}-b.png`, `${A.tenant}/test-${ts}-b-into-a.png`, `test-${ts}-root.png`];

  try {
    // 1. A uploads to own folder (create flow, upsert:false)
    let r = await A.c.storage.from(B).upload(aFile, PNG, { contentType: 'image/png', upsert: false });
    check('A uploads to own folder', !r.error, r.error?.message || '');

    // 2. Re-upload for existing product (update flow: new uuid path, then delete old)
    r = await A.c.storage.from(B).upload(aFile2, PNG, { contentType: 'image/png', upsert: false });
    check('A re-upload (new path)', !r.error, r.error?.message || '');

    // 3. Upsert on own existing path (INSERT + UPDATE both must pass)
    r = await A.c.storage.from(B).upload(aFile2, PNG, { contentType: 'image/png', upsert: true });
    check('A upsert:true on own file', !r.error, r.error?.message || '');

    // 4. B tries to delete A's file -> must affect nothing
    r = await Bu.c.storage.from(B).remove([aFile]);
    check('B delete of A file affects nothing', (r.data || []).length === 0 && await exists(aFile), `(removed=${(r.data || []).length})`);

    // 5. B tries to overwrite A's file via upsert
    r = await Bu.c.storage.from(B).upload(aFile, PNG, { contentType: 'image/png', upsert: true });
    check('B overwrite of A file denied', !!r.error, r.error?.message || 'NO ERROR');

    // 6. B uploads into A's folder
    r = await Bu.c.storage.from(B).upload(`${A.tenant}/test-${ts}-b-into-a.png`, PNG, { contentType: 'image/png' });
    check('B upload into A folder denied', !!r.error, r.error?.message || 'NO ERROR');

    // 7. Root-level upload denied
    r = await A.c.storage.from(B).upload(`test-${ts}-root.png`, PNG, { contentType: 'image/png' });
    check('A root-level upload denied', !!r.error, r.error?.message || 'NO ERROR');

    // 8. B can't move A's file into B's folder
    r = await Bu.c.storage.from(B).move(aFile, `${Bu.tenant}/test-${ts}-b.png`);
    check('B move of A file denied', !!r.error && await exists(aFile), r.error?.message || 'NO ERROR');

    // 9. A deletes own old file (update-flow cleanup)
    r = await A.c.storage.from(B).remove([aFile]);
    check('A deletes own file', (r.data || []).length === 1 && !(await exists(aFile)), `(removed=${(r.data || []).length})`);

    // 10. Public read still works
    const url = A.c.storage.from(B).getPublicUrl(aFile2).data.publicUrl;
    const res = await fetch(url);
    check('Public read of A file', res.ok, `HTTP ${res.status}`);
  } finally {
    let cleanupOk = false;
    try {
      const { error } = await admin.storage.from(B).remove(created);
      if (error) console.error('CLEANUP ERROR:', error.message, '| objects:', created.join(', '));
      else cleanupOk = true;
    } catch (e) {
      console.error('CLEANUP ERROR:', e.message, '| objects:', created.join(', '));
    }
    console.log(`\n${pass} passed, ${fail} failed. ${cleanupOk ? 'Test objects cleaned up.' : 'CLEANUP FAILED - remove objects listed above manually.'}`);
    process.exitCode = fail || !cleanupOk ? 1 : 0;
  }
})().catch(e => { console.error('TEST ERROR:', e.message); process.exitCode = 1; });
