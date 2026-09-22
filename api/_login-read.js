'use strict';
// Request-local parallel reads. This never caches credentials or permissions.
// Preserve index order: the first account must NOT depend on network timing.
const lib = require('./_lib');
const CONCURRENCY = 4;
async function readLeagueStates(leagues, read = lib.readState) {
  if (!Array.isArray(leagues)) throw new TypeError('La lista de ligas debe ser un arreglo.');
  const results = new Array(leagues.length);
  let cursor = 0, failure = null;
  async function worker() {
    while (!failure && cursor < leagues.length) {
      const i = cursor++, league = leagues[i];
      try {
        const state = await read(league.id);
        // An unreadable/missing indexed league is not evidence of no membership.
        if (!state || !state.users || typeof state.users !== 'object' || Array.isArray(state.users)) {
          throw new Error('Estado de liga incompleto.');
        }
        results[i] = { league, state };
      } catch (e) { failure = e; }
    }
  }
  await Promise.all(Array.from({length: Math.min(CONCURRENCY, leagues.length)}, worker));
  if (failure) throw Object.assign(new Error('No se pudieron comprobar todas las ligas activas. Intentá nuevamente.'), {
    status: 503, code: 'LOGIN_LEAGUES_UNAVAILABLE'
  });
  return results;
}
async function findMemberships(leagues, name, accepts) {
  const rows = await readLeagueStates(leagues);
  return rows.filter(({state}) => {
    const u = Object.prototype.hasOwnProperty.call(state.users, name) && state.users[name];
    return u && accepts(u);
  }).map(({league, state}) => ({ligaId: league.id, nombre: league.nombre, state, u: state.users[name]}));
}
module.exports = {CONCURRENCY, readLeagueStates, findMemberships};
