'use strict';
// Upload-ready import review: prepare the checkout before tests/build, without
// committing generated edits, contacting the league API or running npm lifecycles.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const defaultRoot = path.resolve(__dirname, '..');
const TARGETS = ['public/index.html', 'scripts/public-assets.json', 'api/liga.js', 'api/_request-security.js'];
const IMPORT_FILES = [
  'scripts/install-results-review.cjs', 'api/_import-results.js',
  'public/operation-feedback.js', 'public/import-results-review.js', 'public/import-results.css'
];
// SOHAIL_CODE_PRIVACY_V1: compatible with the existing privacy installer.
// Presence of the privacy package (even not yet integrated) keeps its CI lock guard.
function privacyConfigured(root) {
  for (const file of ['scripts/code-privacy-policy.cjs', 'scripts/install-code-privacy.cjs', '.github/workflows/code-privacy.yml']) {
    if (fs.existsSync(path.join(root, file))) return true;
  }
  const release = path.join(root, 'scripts/release-check.cjs');
  return fs.existsSync(release) && fs.readFileSync(release, 'utf8').includes('SOHAIL_CODE_PRIVACY_V1');
}
function validateLock(pkg, lock) {
  if (lock.lockfileVersion !== 3 || !lock.packages?.['']) throw Error('Unsupported dependency lock.');
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    const a = pkg[field] || {}, b = lock.packages[''][field] || {};
    if (JSON.stringify(Object.entries(a).sort()) !== JSON.stringify(Object.entries(b).sort())) {
      throw Error('package-lock.json does not match package.json: ' + field);
    }
  }
  for (const [name, item] of Object.entries(lock.packages)) {
    if (!name) continue;
    if (item.link || !/^https:\/\/registry\.npmjs\.org\//.test(item.resolved || '') || !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(item.integrity || '')) {
      throw Error('Dependency must have npm HTTPS origin and SHA-512 integrity: ' + name);
    }
  }
  return true;
}
function regularFile(root, relative) {
  let current = root;
  const parts = relative.split('/');
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    if (!fs.existsSync(current)) throw Error('IMPORT_UPLOAD_FILE_MISSING: falta ' + relative + '. Subi el parche completo conservando sus carpetas.');
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink() || (i === parts.length - 1 ? !stat.isFile() : !stat.isDirectory())) {
      throw Error('IMPORT_UPLOAD_UNSAFE_PATH: ' + relative);
    }
  }
  return current;
}
function prepareImport(root) {
  for (const file of [...IMPORT_FILES, ...TARGETS]) regularFile(root, file);
  const installer = require(path.join(root, 'scripts/install-results-review.cjs'));
  if (typeof installer.plan !== 'function' || typeof installer.install !== 'function') {
    throw Error('IMPORT_UPLOAD_INSTALLER_INVALID: el instalador no es compatible.');
  }
  const edits = installer.plan(root); // Validate every anchor before npm or any write.
  if (!Array.isArray(edits) || edits.some(edit => !Array.isArray(edit) || !TARGETS.includes(edit[0]) || typeof edit[1] !== 'string')) {
    throw Error('IMPORT_UPLOAD_PLAN_INVALID: no se permiten otros archivos.');
  }
  return { installer, edits };
}
function runNpm(args, { root, env }) {
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, {
    cwd: root, env, stdio: 'inherit', shell: process.platform === 'win32'
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error('npm command failed (' + result.status + ').');
}
function main({ root = defaultRoot, env = process.env, npmRunner = runNpm, logger = console } = {}) {
  root = fs.realpathSync(root);
  regularFile(root, 'package.json');
  const prepared = prepareImport(root);
  const lockPath = path.join(root, 'package-lock.json');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (fs.existsSync(lockPath)) {
    regularFile(root, 'package-lock.json');
    validateLock(pkg, JSON.parse(fs.readFileSync(lockPath, 'utf8')));
    npmRunner(['ci', '--ignore-scripts', '--no-audit', '--no-fund'], { root, env });
  } else {
    if (privacyConfigured(root) && (env.CI || env.VERCEL || env.VERCEL_ENV || env.GITHUB_ACTIONS)) {
      throw Error('PRIVACY_COMMITTED_LOCK_REQUIRED: generate and review package-lock.json with the dependency-lock workflow before deploying.');
    }
    logger.warn('NOTICE: initial dependency resolution; not yet a reproducible installation. Commit the generated lockfile after the manual dependency-review workflow passes.');
    if (env.GITHUB_OUTPUT) fs.appendFileSync(env.GITHUB_OUTPUT, 'lock_generated=true\n');
    npmRunner(['install', '--ignore-scripts', '--no-audit', '--no-fund'], { root, env });
  }
  regularFile(root, 'package-lock.json');
  validateLock(pkg, JSON.parse(fs.readFileSync(lockPath, 'utf8')));
  // Integration happens AFTER successful dependency installation and BEFORE the
  // workflow's integrity checks/tests or Vercel's release:check build command.
  prepareImport(root); // Recheck paths and anchors before modifying the checkout.
  const applied = prepared.installer.install(root, true);
  if (prepared.installer.plan(root).length) throw Error('IMPORT_UPLOAD_INTEGRATION_INCOMPLETE');
  logger.log('[SOHAIL_IMPORT_AUTO] Integracion lista: ' + applied.length + ' archivo(s) ajustado(s).');
  logger.log('[SOHAIL_IMPORT_AUTO] Continuan las pruebas y controles habituales; no se modificaron datos de la liga.');
  return { integrated: true, changed: applied.map(([file]) => file) };
}
module.exports = { validateLock, privacyConfigured, regularFile, prepareImport, main };
if (require.main === module) {
  try {
    if (process.argv.length > 2) throw Error('El comando de instalacion no admite opciones para saltar controles.');
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
