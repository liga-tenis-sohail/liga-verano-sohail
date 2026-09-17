'use strict';
// Offline regression only. Uses the same mock transport as the existing tests.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createDB, fixture, req, call } = require('./support/mock-db.cjs');
const source = fs.readFileSync(path.join(__dirname, '../public/reglamento.js'), 'utf8');
const context = vm.createContext({});
vm.runInContext(source, context);
const normalize = context.rgHighlightColor;
const colours = ['#fef08a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#e9d5ff'];
const markup = '<p>Un <b><span style="background-color: rgb(254, 240, 138);">texto destacado</span></b> del reglamento.</p>';

test('HL01: the marker palette is fixed, opaque and contains five colours', () => {
  const actual = vm.runInContext('RG_HIGHLIGHT_COLORS.map(c=>c.value)', context);
  assert.deepEqual(Array.from(actual), colours);
  assert.equal(vm.runInContext('Object.isFrozen(RG_HIGHLIGHT_COLORS)', context), true);
});
test('HL02: hexadecimal and native browser RGB outputs normalize identically', () => {
  for (const colour of colours) {
    const channels = [1, 3, 5].map(offset => parseInt(colour.slice(offset, offset + 2), 16));
    assert.equal(normalize(colour.toUpperCase()), colour);
    assert.equal(normalize('rgb(' + channels.join(', ') + ')'), colour);
  }
});
test('HL03: background images, CSS injection, opacity and off-palette colours are rejected', () => {
  for (const value of [null, undefined, [], {}, '#000000', '#fff', 'red', '#fef08a;display:none', 'url(javascript:alert(1))', 'var(--brand)', 'rgba(254,240,138,.2)', 'rgb(999,240,138)', '#fef08a00', 'expression(alert(1))', 'transparent']) {
    assert.equal(normalize(value), '', String(value));
  }
});
function luminance(hex) {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return c[0] * .2126 + c[1] * .7152 + c[2] * .0722;
}
test('HL04: every fixed marker has at least 4.5:1 contrast with its foreground', () => {
  for (const colour of colours) assert.ok((luminance(colour) + .05) / (luminance('#172033') + .05) >= 4.5);
});
for (const role of ['admin', 'superadmin']) test('HL05: ' + role + ' can persist rich highlights via existing save/state handlers', async () => {
  const previous = global.fetch;const db = createDB();global.fetch = db.fetch;
  try {
    const incoming = structuredClone(db.state());const matches = structuredClone(incoming.matches);const cycles = structuredClone(incoming.cycles);
    incoming.REGLAMENTO = markup;
    const saved = await call(require('../api/save'), req(db, role, { ligaId: 'liga-actual', state: incoming }));
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(db.state().REGLAMENTO, markup);assert.deepEqual(db.state().matches, matches);assert.deepEqual(db.state().cycles, cycles);
    const get = req(db, role, {});get.method = 'GET';get.query = { liga: 'liga-actual' };
    const read = await call(require('../api/state'), get);
    assert.equal(read.status, 200);assert.equal(read.body.state.REGLAMENTO, markup);
  } finally { global.fetch = previous; }
});
test('HL06: a player cannot publish a modified rule or a highlight', async () => {
  const previous = global.fetch;const db = createDB();global.fetch = db.fetch;
  try {
    const old = JSON.stringify(db.state());const incoming = structuredClone(db.state());incoming.REGLAMENTO = markup;
    const saved = await call(require('../api/save'), req(db, 'Alicia', { ligaId: 'liga-actual', state: incoming }));
    assert.equal(saved.status, 403);assert.equal(JSON.stringify(db.state()), old);
  } finally { global.fetch = previous; }
});
test('HL07: an archived league still rejects rules edits by an administrator', async () => {
  const previous = global.fetch;const db = createDB([{ id:'liga-actual', estado:'finalizada', state:fixture() }]);global.fetch = db.fetch;
  try {
    const old = JSON.stringify(db.state());const incoming = structuredClone(db.state());incoming.REGLAMENTO = markup;
    assert.equal((await call(require('../api/save'), req(db, 'admin', { ligaId:'liga-actual', state:incoming }))).status, 403);
    assert.equal(JSON.stringify(db.state()), old);
  } finally { global.fetch = previous; }
});
test('HL08: saving markers in one league does not modify another', async () => {
  const previous = global.fetch;const db = createDB([{ id:'liga-actual', state:fixture() }, { id:'otra-liga', state:fixture() }]);global.fetch = db.fetch;
  try {
    const old = JSON.stringify(db.state('otra-liga'));const incoming = structuredClone(db.state());incoming.REGLAMENTO = markup;
    assert.equal((await call(require('../api/save'), req(db, 'admin', { ligaId:'liga-actual', state:incoming }))).status, 200);
    assert.equal(JSON.stringify(db.state('otra-liga')), old);
  } finally { global.fetch = previous; }
});
