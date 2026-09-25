'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {verify} = require('../scripts/verify-release.cjs');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const pkg = () => JSON.parse(read('package.json'));

// Bounded contract for the inline commands used by both supplied workflows.
// This is not a general YAML parser. Comments or commands inside echo strings
// are not evidence of running a test. YAML and Bash are checked separately.
function assertWorkflowCommands(workflow, manifest) {
  const commands = [...workflow.matchAll(/^\s*(?:-\s*)?run:\s*([^\r\n]+)$/gm)]
    .map(match => match[1].trim());
  assert.ok(commands.includes('npm test'), 'Debe ejecutar npm test.');
  const direct = commands.includes('node scripts/verify-release.cjs');
  const alias = commands.includes('npm run verify') &&
    manifest.scripts?.verify === 'node scripts/verify-release.cjs';
  assert.ok(direct || alias, 'Debe ejecutar el verificador real, directamente o con su alias npm.');
  const active = workflow.split(/\r?\n/).filter(line => !/^\s*#/.test(line)).join('\n');
  assert.match(active, /^\s*contents:\s*read\s*$/m);
  assert.ok(!/^\s*(?:-\s*)?continue-on-error\s*:/m.test(active), 'No se deben ignorar los fallos.');
  assert.ok(!commands.some(command => /\|\|\s*(?:true|:|exit\s+0)\b/.test(command)), 'No se deben convertir fallos en éxitos.');
}

test('V400 release: full workflow includes real tests and local integrity checks', () => {
  assertWorkflowCommands(read('.github/workflows/check.yml'), pkg());
});

test('V400 release: changed browser modules use the release cache key', () => {
  const html = read('public/index.html');
  const tag = 'sohail-v400-restauracion-identidades';
  const updated = new Set(['persistencia.js','history-leagues.js','match-history.js','ui-modern.css','jugadores-perfiles.js']);
  for (const file of ['data-operations.js', 'player-identity.js', 'player-duplicates.js',
    'persistencia.js', 'history-leagues.js', 'match-history.js', 'bootstrap.js',
    'ui-modern.css', 'jugadores-perfiles.js', 'jugadores-perfiles-catalogo.js']) {
    assert.ok(html.includes(file + '?v=' + (['ui-modern.css','jugadores-perfiles.js'].includes(file)?'sohail-v491-passwords-injury-access':updated.has(file)?'sohail-v480-rules-injuries':file==='bootstrap.js'?'sohail-v460-unified-experience':file==='player-identity.js'?'sohail-v420-all-leagues-300':tag)), file);
  }
  assert.ok(html.includes('content="sohail-v480-rules-injuries"'));
});

test('V400 release: migration and private handlers have complete file paths', () => {
  for (const file of ['04_restore_identities.sql', '05_verify_restore_identities.sql',
    'api/_identities.js', 'api/_identities_route.js', 'api/_restore.js',
    'api/_restore_route.js', 'api/_operations.js', 'tests/support/mock-db.cjs']) {
    assert.ok(read(file).length > 100, file);
  }
  for (const file of ['api/restore.js', 'api/identities.js']) {
    assert.equal(fs.existsSync(path.join(root, file)), false, file);
  }
});

test('V400 release: scripts directory matches package and existing tests', () => {
  assert.equal(pkg().scripts.verify, 'node scripts/verify-release.cjs');
  assert.match(read('scripts/verify-release.cjs'), /module.exports=\{verify\}/);
});

test('CI401-01: original user workflow also runs the real verifier', () => {
  // Exact full file received from the user, not a reconstructed approximation.
  assertWorkflowCommands(read('tests/fixtures/check-anterior.txt'), pkg());
});

test('CI401-02: direct command and verified npm alias are both accepted', () => {
  const original = read('tests/fixtures/check-anterior.txt');
  assertWorkflowCommands(original, pkg());
  assertWorkflowCommands(original.replace('run: node scripts/verify-release.cjs', 'run: npm run verify'), pkg());
});

test('CI401-03: an npm alias pointing somewhere else is rejected', () => {
  const workflow = read('tests/fixtures/check-anterior.txt')
    .replace('run: node scripts/verify-release.cjs', 'run: npm run verify');
  assert.throws(() => assertWorkflowCommands(workflow, {scripts: {verify: 'echo OK'}}), /verificador real/);
});

test('CI401-04: commenting out the integrity command is still a failure', () => {
  const workflow = read('tests/fixtures/check-anterior.txt')
    .replace('run: node scripts/verify-release.cjs', '# run: node scripts/verify-release.cjs');
  assert.throws(() => assertWorkflowCommands(workflow, pkg()), /verificador real/);
});

test('CI401-05: removing or merely printing the test command is still a failure', () => {
  const workflow = read('tests/fixtures/check-anterior.txt');
  for (const replacement of ['# run: npm test', 'run: echo "npm test"', 'run: npm test || true']) {
    assert.throws(() => assertWorkflowCommands(workflow.replace('run: npm test', replacement), pkg()), /npm test/);
  }
});

test('CI401-06: ignoring a failing step is rejected', () => {
  const workflow = read('tests/fixtures/check-anterior.txt')
    .replace('run: npm test', 'continue-on-error: true\n        run: npm test');
  assert.throws(() => assertWorkflowCommands(workflow, pkg()), /ignorar los fallos/);
});

function temporaryRelease(run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sohail-ci401-'));
  try {
    for (const folder of ['public', 'api']) {
      fs.cpSync(path.join(root, folder), path.join(dir, folder), {recursive: true});
    }
    fs.copyFileSync(path.join(root, 'vercel.json'), path.join(dir, 'vercel.json'));
    return run(dir);
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
}

test('CI401-07: missing private restore handler is detected before deployment', () => {
  temporaryRelease(dir => {
    fs.rmSync(path.join(dir, 'api/_restore_route.js'));
    assert.ok(verify(dir).some(result => !result.ok && result.name === 'local module api/liga.js -> ./_restore_route'));
  });
});

test('CI401-08: a missing dependency causes the verifier CLI to exit nonzero', () => {
  temporaryRelease(dir => {
    fs.rmSync(path.join(dir, 'api/_operations.js'));
    const run = spawnSync(process.execPath, [path.join(root, 'scripts/verify-release.cjs'), dir], {
      encoding: 'utf8', timeout: 20000
    });
    assert.equal(run.error, undefined);
    assert.equal(run.status, 1, run.stdout + run.stderr);
    assert.match(run.stdout, /FAIL local module .*_operations/);
  });
});

test('CI401-09: Node version comes from package and diagnostics retain the commit guard', () => {
  const workflow = read('.github/workflows/check.yml');
  assert.equal(pkg().engines.node, '22.x');
  assert.match(workflow, /^\s*node-version-file:\s*package\.json\s*$/m);
  assert.ok(workflow.includes('git rev-parse HEAD'));
  assert.ok(workflow.includes('[ "$checked_sha" != "$GITHUB_SHA" ]'));
  assert.ok(workflow.includes('exit 1'));
  assert.ok(workflow.includes('GITHUB_STEP_SUMMARY'));
});

test('CI401-10: original workflow and required check names are retained', () => {
  const workflow = read('.github/workflows/check.yml');
  const original = read('tests/fixtures/check-anterior.txt');
  for (const expression of [/^name: check$/m, /^  verify:$/m, /^    name: Integridad, regresión y seguridad local$/m]) {
    assert.match(workflow, expression);
    assert.match(original, expression);
  }
});
