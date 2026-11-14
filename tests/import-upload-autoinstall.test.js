'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const A = require('../scripts/install-dependencies.cjs');
const I = require('../scripts/install-results-review.cjs');
const root = path.resolve(__dirname, '..');
const targets = ['public/index.html', 'scripts/public-assets.json', 'api/liga.js', 'api/_request-security.js'];
const imports = ['scripts/install-results-review.cjs', 'api/_import-results.js', 'public/operation-feedback.js', 'public/import-results-review.js', 'public/import-results.css'];
const silent = { log() {}, warn() {} };
const pkg = { name: 'sohail-upload-fixture', version: '1.0.0', dependencies: {} };
const lock = { name: pkg.name, version: pkg.version, lockfileVersion: 3, packages: { '': { name: pkg.name, version: pkg.version, dependencies: {} } } };
function put(dir, file, content) {
  const p = path.join(dir, file); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, content);
}
function fixture(fn, options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sohail-upload-'));
  try {
    // These fixtures exercise the older four-point import installer. The network
    // extension is covered separately with real current server files.
    for (const file of imports) {
      const source = fs.readFileSync(path.join(root, file));
      put(dir, file, file === 'public/operation-feedback.js' ? source.toString().replaceAll('SOHAIL_NETWORK_FEEDBACK_V1', 'LEGACY_FEEDBACK_FIXTURE') : source);
    }
    put(dir, 'public/index.html', '<html><head></head><body>\n<script src="admin-ciclos-config.js?v=retained"></script>\n<script src="excel-loader.js?v=retained"></script>\n</body></html>\n<!-- unrelated content -->\n');
    put(dir, 'scripts/public-assets.json', JSON.stringify({ appRelease: 'retained-current-version', assets: ['existing.js'], custom: { keep: true } }, null, 2) + '\n');
    put(dir, 'api/liga.js', "'use strict';\nmodule.exports=function(req,res){if(req.query && req.query.operacion!==undefined){return 'retained';}};\n// unrelated routes\n");
    put(dir, 'api/_request-security.js', "'use strict';\nmodule.exports=function(route,op,mode){if(route==='liga'&&op==='history')return 'read';return 'retained';};\n");
    put(dir, 'public/retained-WO-and-destinos.js', '// fixture of unrelated changes; not actual WO/cycle implementation.\n');
    put(dir, 'api/retained-current-logic.js', '// unrelated backend must not be replaced.\n');
    put(dir, 'scripts/release-check.cjs', '// existing release validation remains unchanged\n');
    put(dir, 'package.json', JSON.stringify(pkg));
    if (options.lock !== false) put(dir, 'package-lock.json', JSON.stringify(lock));
    return fn(dir);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
function files(dir) {
  const out = {};
  function walk(d, rel = '') { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const n = rel + e.name, p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, n + '/');
    else if (e.isFile()) out[n] = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  } }
  walk(dir); return out;
}
function run(dir, extra = {}) { return A.main({ root: dir, env: {}, logger: silent, npmRunner() {}, ...extra }); }
function activePrivacy(dir) { put(dir, 'scripts/code-privacy-policy.cjs', '// privacy fixture marker only\n'); }

test('UPLOAD original uploaded patch lacks exactly the four connections before preparation', () => fixture(dir => {
  assert.deepEqual(I.plan(dir).map(([file]) => file).sort(), [...targets].sort());
}));
test('UPLOAD normal dependency step integrates all four points before returning', () => fixture(dir => {
  const order = [];
  const r = run(dir, { npmRunner(args) {
    order.push('npm'); assert.deepEqual(args, ['ci', '--ignore-scripts', '--no-audit', '--no-fund']);
    assert.equal(I.plan(dir).length, 4);
  } });
  assert.deepEqual(order, ['npm']); assert.equal(r.integrated, true); assert.deepEqual(r.changed.sort(), [...targets].sort());
  assert.equal(I.plan(dir).length, 0);
}));
test('UPLOAD second install is idempotent', () => fixture(dir => {
  run(dir); const before = files(dir); const r = run(dir);
  assert.deepEqual(r.changed, []); assert.deepEqual(files(dir), before);
}));
test('UPLOAD already manually integrated checkout continues without duplicate connections', () => fixture(dir => {
  I.install(dir, true); const before = files(dir); assert.deepEqual(run(dir).changed, []); assert.deepEqual(files(dir), before);
}));
test('UPLOAD only the four integration files change, unrelated current code remains byte-identical', () => fixture(dir => {
  const before = files(dir); run(dir); const after = files(dir);
  assert.deepEqual(Object.keys(after).filter(f => after[f] !== before[f]).sort(), [...targets].sort());
  assert.match(fs.readFileSync(path.join(dir, 'public/index.html'), 'utf8'), /unrelated content/);
  assert.match(fs.readFileSync(path.join(dir, 'api/liga.js'), 'utf8'), /unrelated routes/);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'scripts/public-assets.json'), 'utf8'));
  assert.equal(manifest.appRelease, 'retained-current-version'); assert.deepEqual(manifest.custom, { keep: true });
}));
test('UPLOAD dependency installation failure never applies the connections', () => fixture(dir => {
  const before = files(dir); assert.throws(() => run(dir, { npmRunner() { throw Error('simulated npm failure'); } }), /simulated npm failure/);
  assert.deepEqual(files(dir), before);
}));
test('UPLOAD incompatible current route is refused before npm or writes', () => fixture(dir => {
  put(dir, 'api/liga.js', '// different route structure'); const before = files(dir); let called = false;
  assert.throws(() => run(dir, { npmRunner() { called = true; } }), /No se reconoce/);
  assert.equal(called, false); assert.deepEqual(files(dir), before);
}));
for (const file of imports) test('UPLOAD missing required module fails visibly: ' + file, () => fixture(dir => {
  fs.unlinkSync(path.join(dir, file)); const before = files(dir); let called = false;
  assert.throws(() => run(dir, { npmRunner() { called = true; } }), /IMPORT_UPLOAD_FILE_MISSING/);
  assert.equal(called, false); assert.deepEqual(files(dir), before);
}));
test('UPLOAD malformed public manifest is refused without writes', () => fixture(dir => {
  put(dir, 'scripts/public-assets.json', '{ broken'); const before = files(dir);
  assert.throws(() => run(dir)); assert.deepEqual(files(dir), before);
}));
test('UPLOAD dependency lock mismatch fails before npm or integration', () => fixture(dir => {
  put(dir, 'package-lock.json', JSON.stringify({ ...lock, packages: { '': { dependencies: { mismatch: '1.0.0' } } } }));
  const before = files(dir); let called = false;
  assert.throws(() => run(dir, { npmRunner() { called = true; } }), /does not match/);
  assert.equal(called, false); assert.deepEqual(files(dir), before);
}));
test('UPLOAD missing lock retains baseline initial resolution only without privacy policy', () => fixture(dir => {
  let called = false; run(dir, { npmRunner(args) {
    called = true; assert.deepEqual(args, ['install', '--ignore-scripts', '--no-audit', '--no-fund']);
    put(dir, 'package-lock.json', JSON.stringify(lock));
  } }); assert.equal(called, true); assert.equal(I.plan(dir).length, 0);
}, { lock: false }));
for (const env of [{ CI: 'true' }, { VERCEL: '1' }, { VERCEL_ENV: 'preview' }, { GITHUB_ACTIONS: 'true' }]) {
  test('UPLOAD privacy missing-lock guard preserved in ' + Object.keys(env)[0], () => fixture(dir => {
    activePrivacy(dir); const before = files(dir); let called = false;
    assert.throws(() => run(dir, { env, npmRunner() { called = true; } }), /PRIVACY_COMMITTED_LOCK_REQUIRED/);
    assert.equal(called, false); assert.deepEqual(files(dir), before);
  }, { lock: false }));
}
for (const file of ['scripts/install-code-privacy.cjs', '.github/workflows/code-privacy.yml', 'scripts/release-check.cjs']) {
  test('UPLOAD detects installed or partially installed privacy from ' + file, () => fixture(dir => {
    put(dir, file, '// SOHAIL_CODE_PRIVACY_V1');
    assert.equal(A.privacyConfigured(dir), true);
    assert.throws(() => run(dir, { env: { CI: 'true' } }), /PRIVACY_COMMITTED_LOCK_REQUIRED/);
  }, { lock: false }));
}
test('UPLOAD committed lock permits privacy checkout without changing privacy release gate', () => fixture(dir => {
  activePrivacy(dir); const before = fs.readFileSync(path.join(dir, 'scripts/release-check.cjs'));
  run(dir, { env: { CI: 'true', VERCEL: '1' } });
  assert.deepEqual(fs.readFileSync(path.join(dir, 'scripts/release-check.cjs')), before);
}));
test('UPLOAD local privacy setup retains reviewed lock generation workflow option', () => fixture(dir => {
  activePrivacy(dir); run(dir, { npmRunner() { put(dir, 'package-lock.json', JSON.stringify(lock)); } });
  assert.equal(I.plan(dir).length, 0);
}, { lock: false }));
test('UPLOAD lock generated by npm is validated before source integration', () => fixture(dir => {
  assert.throws(() => run(dir, { npmRunner() { put(dir, 'package-lock.json', '{}'); } }), /Unsupported dependency lock/);
  assert.equal(I.plan(dir).length, 4);
}, { lock: false }));
test('UPLOAD symlinked source target is refused', () => fixture(dir => {
  const p = path.join(dir, 'api/liga.js'); fs.renameSync(p, p + '.saved'); fs.symlinkSync('liga.js.saved', p);
  assert.throws(() => run(dir), /IMPORT_UPLOAD_UNSAFE_PATH/);
}));
test('UPLOAD symlinked package-lock is refused', () => fixture(dir => {
  const p = path.join(dir, 'package-lock.json'); fs.renameSync(p, p + '.saved'); fs.symlinkSync('package-lock.json.saved', p);
  assert.throws(() => run(dir), /IMPORT_UPLOAD_UNSAFE_PATH/);
}));
test('UPLOAD changing a path to a symlink during dependency installation is refused', () => fixture(dir => {
  assert.throws(() => run(dir, { npmRunner() {
    const p = path.join(dir, 'api/liga.js'); fs.renameSync(p, p + '.saved'); fs.symlinkSync('liga.js.saved', p);
  } }), /IMPORT_UPLOAD_UNSAFE_PATH/);
  assert.ok(!fs.readFileSync(path.join(dir, 'public/index.html'), 'utf8').includes('import-results-review.js'));
}));
test('UPLOAD source is not integrated if npm does not generate the required lock', () => fixture(dir => {
  assert.throws(() => run(dir), /IMPORT_UPLOAD_FILE_MISSING/); assert.equal(I.plan(dir).length, 4);
}, { lock: false }));
test('UPLOAD retains Vercel install command and existing GitHub install step', () => {
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8')).installCommand, 'node scripts/install-dependencies.cjs');
  assert.match(fs.readFileSync(path.join(root, '.github/workflows/check.yml'), 'utf8'), /run: node scripts\/install-dependencies\.cjs/);
});
test('UPLOAD never changes app data or disables checks from the install hook', () => {
  const src = fs.readFileSync(path.join(root, 'scripts/install-dependencies.cjs'), 'utf8');
  assert.doesNotMatch(src, /fetch\s*\(|\.from\s*\(|\.rpc\s*\(|--no-verify/);
  assert.match(src, /--ignore-scripts/);
});
