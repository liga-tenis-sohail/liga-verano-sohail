'use strict';
// Regression: a zero-point tie must not replace the sporting destination with
// an administrative review banner. The closing rules and API stay unchanged.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Score = require('../public/score-rules');
const Destinos = require('../public/destinos-auto');
const Close = require('../public/cycle-close');
const source = fs.readFileSync(path.join(__dirname, '../public/shell-render.js'), 'utf8');
const names = ['Alicia', 'Beto', 'Ciro', 'Diego', 'Elena'];
const roles = ['visitor', 'player', 'delegated-admin', 'admin', 'superadmin'];
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));

function harness({role = 'player', lang = 'es', automatic = false, finished = false} = {}) {
  const users = Object.fromEntries(names.map(name => [name, {role:'player'}]));
  const state = {
    _v: 7, activeN: finished ? 2 : 1, playoff: {started:false}, users,
    cycles: [
      {n:1, status:finished ? 'finished' : 'active', groups:Array.from({length:5}, (_, i) => ({players:i === 2 ? names.slice() : []}))},
      {n:2, status:finished ? 'active' : 'locked', groups:finished ? Array.from({length:5}, () => ({players:[]})) : null}
    ],
    matches: [], PUNTOS: {3:[5,4,3,2,1]},
    DESTINO: {...(automatic ? Destinos.initial() : {}), 3:['G1','G2','G3','G4','G5']}
  };
  const roleValue = role === 'delegated-admin' ? 'player' : role;
  const ctx = {
    cycles:state.cycles, matches:state.matches, DESTINO:state.DESTINO, USERS:users,
    viewCycle:1, LANG:lang, AJUSTES_PUNTOS:{}, RATING_ON:false,
    currentUser:role === 'visitor' ? null : {name:'Alicia', role:roleValue, isAdmin:role === 'delegated-admin'},
    SohailDestinos:Destinos, SohailScore:Score,
    computeStats:(n,g) => Score.standings(n,g,state.cycles,state.matches),
    ensureDestino:() => { throw new Error('The configured destination must be preserved.'); },
    groupName:n => (lang === 'en' ? 'Group ' : 'Grupo ') + n,
    ptsForPos:(g,p) => state.PUNTOS[g][p], attr:esc, jsq:value => String(value),
    getInitials:name => name.slice(0,2).toUpperCase(),
    esAdmin:user => !!user && (['admin','superadmin'].includes(user.role) || user.isAdmin === true),
    canCreate:() => false,
    findMatch:(n,g,a,b) => state.matches.find(m => m.cycle === n && m.g === g &&
      ((m.aName === a && m.bName === b) || (m.aName === b && m.bName === a))),
    autoTxt:() => '#000000', LEAGUE_COLOR_HL:'#ffffff',
    console:{error:(...args) => { throw new Error(args.map(String).join(' ')); }},
    t:key => ({
      zc_review_needed:lang === 'en' ? 'Tied on 0: destination awaits review at closing.' : 'Empate a 0: destino pendiente de revisión al cerrar.',
      da_review:lang === 'en' ? 'Review destinations' : 'Revisar destinos'
    }[key] || key)
  };
  vm.createContext(ctx);
  vm.runInContext(source, ctx, {filename:'public/shell-render.js'});
  return {ctx, state, html:() => ctx.groupCardHTML(3)};
}
function destinationRows(html) {
  const table = html.match(/<table class="cls-table">[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/);
  assert.ok(table, 'The group standings must render successfully.');
  return [...table[1].matchAll(/<tr\b[^>]*><td><span class="dest ([^"]+)">([^<]+)<\/span><\/td><td>[\s\S]*?<span class="nm-link"[^>]*>([^<]+)<\/span>/g)]
    .map(m => ({css:m[1], destination:m[2], name:m[3]}));
}
function assertNormalDestinations(h, expected = ['G1','G2','G3','G4','G5']) {
  const html = h.html();
  assert.doesNotMatch(html, /Empate a 0|Tied on 0|zc_review_needed|destino pendiente|awaits review/);
  const rows = destinationRows(html);
  assert.equal(rows.length, 5);
  rows.forEach((r,i) => {
    const group = Number(expected[i].slice(1));
    assert.equal(r.css, group < 3 ? 'dest-up' : group > 3 ? 'dest-down' : 'dest-same');
    assert.equal(r.destination, (group < 3 ? '↑' : group > 3 ? '↓' : '=') + h.ctx.groupName(group));
  });
  return rows;
}

for (const role of roles) for (const lang of ['es','en']) for (const automatic of [false,true]) {
  test(`DEST521 all zero: destinations remain visible (${role}, ${lang}, auto=${automatic})`, () => {
    const h = harness({role, lang, automatic});
    assertNormalDestinations(h);
    assert.equal(h.state.cycles[1].status, 'locked');
    assert.equal(h.state.cycles[0].zeroPointDecision, undefined);
  });
}
for (const role of roles) for (const lang of ['es','en']) {
  test(`DEST521 closed cycle shows the administrator's saved assignments (${role}, ${lang})`, () => {
    const h = harness({role, lang, finished:true});
    const selected = ['G5','G4','G3','G2','G1'];
    h.state.cycles[0].zeroPointDecision = {assignments:names.map((name,i) => ({name,group:3,destination:selected[i]}))};
    assertNormalDestinations(h, selected);
  });
}
test('DEST521 a WO and remaining players tied on zero keep destinations and scores', () => {
  const h = harness();
  h.state.matches.push({id:1,cycle:1,g:3,aName:'Alicia',bName:'Beto',status:'confirmed',wo:true,sets:[],winner:'Alicia',retiroDe:'Beto',woPolicy:{loserPoints:false,loserPlayed:false}});
  assertNormalDestinations(h);
  const stats = h.ctx.computeStats(1,3);
  assert.equal(stats.find(s => s.name === 'Alicia').pts, 3);
  assert.equal(stats.find(s => s.name === 'Beto').pts, 0);
  assert.equal(stats.find(s => s.name === 'Beto').g + stats.find(s => s.name === 'Beto').p, 0);
});
test('DEST521 final cycle retains sporting destinations without a review banner', () => {
  const h = harness(); h.state.cycles.pop(); assertNormalDestinations(h);
});
test('DEST521 inactive player filtering preserves the original position of remaining destinations', () => {
  const h = harness(); h.state.users.Alicia.inactive = true;
  const rows = destinationRows(h.html());
  assert.deepEqual(rows.map(r => r.name), names.slice(1));
  assert.deepEqual(rows.map(r => r.destination), ['↑Grupo 2','=Grupo 3','↓Grupo 4','↓Grupo 5']);
});
test('DEST521 rendering does not mutate state or pre-approve the zero-point decision', () => {
  const h = harness(); const before = JSON.stringify(h.state);
  assertNormalDestinations(h); assertNormalDestinations(h);
  assert.equal(JSON.stringify(h.state), before);
  const plan = Close.plan(h.state);
  assert.equal(plan.ties.length, 1);
  assert.throws(() => Close.nextGroups(plan), error => error.code === 'ZERO_TIE_REQUIRED');
});
test('DEST521 unrelated invalid automatic destinations still require configuration, never an invented group', () => {
  const h = harness({automatic:true}); h.state.DESTINO[3][4] = '';
  const rows = destinationRows(h.html());
  assert.equal(rows[4].css, 'badge-pend');
  assert.equal(rows[4].destination, 'Revisar destinos');
  assert.doesNotMatch(h.html(), /Empate a 0|Tied on 0|Grupo 99|Grupo NaN/);
});
