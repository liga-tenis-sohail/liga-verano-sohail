'use strict';
// Pruebas locales de las URLs emitidas. No se conecta con Supabase ni PostgREST.
const test = require('node:test');
const assert = require('node:assert/strict');
process.env.SUPABASE_URL = 'https://database.invalid';
process.env.SUPABASE_SERVICE_KEY = 'sb_secret_test';
process.env.SESSION_SECRET = 'LOCAL-TEST-NOT-A-PRODUCTION-SECRET';
const lib = require('../api/_lib');

async function inspectFetch(run, inspect) {
  const previous = global.fetch;
  const calls = [];
  global.fetch = async (raw, options = {}) => {
    const url = new URL(raw);
    assert.equal(url.hostname, 'database.invalid');
    calls.push({ url, options });
    inspect(url, options);
    return { ok: true, status: 200, json: async () => [], text: async () => '[]' };
  };
  try { await run(); assert.equal(calls.length, 1); }
  finally { global.fetch = previous; }
}

test('CSV: historial de playoffs filtra NULL con is.null y conserva cuadro 0', async () => {
  await inspectFetch(() => lib.leerMensajes({ ligaId: 'liga-test', tipo: 'playoff', ciclo: null, grupo: 0 }), url => {
    assert.equal(url.searchParams.get('ciclo'), 'is.null');
    assert.equal(url.searchParams.get('grupo'), 'eq.0');
    assert.equal(url.searchParams.get('tipo'), 'eq.playoff');
    assert.equal(url.searchParams.get('liga_id'), 'eq.liga-test');
  });
});

test('CSV: mensajes nuevos de playoffs conservan NULL, cuadro y ultimo id', async () => {
  await inspectFetch(() => lib.leerMensajesDesde({ ligaId: 'liga-test', tipo: 'playoff', ciclo: null, grupo: 2, desdeId: 42 }), url => {
    assert.equal(url.searchParams.get('ciclo'), 'is.null');
    assert.equal(url.searchParams.get('grupo'), 'eq.2');
    assert.equal(url.searchParams.get('id'), 'gt.42');
  });
});

test('CSV: historial de grupo sigue filtrando ciclo numerico', async () => {
  await inspectFetch(() => lib.leerMensajes({ ligaId: 'liga-test', tipo: 'grupo', ciclo: 2, grupo: 1 }), url => {
    assert.equal(url.searchParams.get('ciclo'), 'eq.2');
    assert.equal(url.searchParams.get('grupo'), 'eq.1');
  });
});

test('CSV: polling de grupo sigue filtrando ciclo numerico', async () => {
  await inspectFetch(() => lib.leerMensajesDesde({ ligaId: 'liga-test', tipo: 'grupo', ciclo: 1, grupo: 3, desdeId: 7 }), url => {
    assert.equal(url.searchParams.get('ciclo'), 'eq.1');
    assert.equal(url.searchParams.get('grupo'), 'eq.3');
    assert.equal(url.searchParams.get('id'), 'gt.7');
  });
});

test('CSV: hilo admin no recibe filtros de ciclo o cuadro', async () => {
  await inspectFetch(() => lib.leerMensajes({ ligaId: 'liga-test', tipo: 'admin' }), url => {
    assert.equal(url.searchParams.has('ciclo'), false);
    assert.equal(url.searchParams.has('grupo'), false);
    assert.equal(url.searchParams.get('tipo'), 'eq.admin');
  });
});

test('CSV: insertar playoff conserva ciclo nulo y pertenencia al cuadro', async () => {
  await inspectFetch(() => lib.insertarMensaje({ ligaId: 'liga-test', tipo: 'playoff', ciclo: null, grupo: 0, autor: 'Ana', texto: 'Mensaje de prueba' }), (_url, options) => {
    const row = JSON.parse(options.body);
    assert.equal(options.method, 'POST');
    assert.equal(row.ciclo, null);
    assert.equal(row.grupo, 0);
    assert.equal(row.tipo, 'playoff');
    assert.equal(row.liga_id, 'liga-test');
  });
});
