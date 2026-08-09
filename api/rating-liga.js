// Motor de rating de liga por ciclos (grupos + Victorias-Derrotas).

const FACTOR_MUESTRA = { 1: 0.5, 2: 0.75, 3: 0.92 }; // 4+ => 1.0
const factorMuestra = (n) => FACTOR_MUESTRA[n] ?? 1.0;
const valorBase = (g) => 9.6 - 0.35 * (g - 1);
const eficienciaCiclo = (v, d) => (3 * v + d) / (3 * (v + d)); // = 1/3 + 2/3*(v/n)
const ajusteCiclo = (v, d) => 0.8 * (v / (v + d) - 0.5) * factorMuestra(v + d);
const notaCiclo = (g, v, d) => valorBase(g) + ajusteCiclo(v, d);

function ratingCompleto(ciclos) {
  const N = ciclos.map((c) => c.v + c.d);
  const fm = N.map(factorMuestra);
  const ef = ciclos.map((c) => eficienciaCiclo(c.v, c.d));
  const aj = ciclos.map((c) => ajusteCiclo(c.v, c.d));
  const no = ciclos.map((c) => notaCiclo(c.grupo, c.v, c.d));

  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const partidos = sum(N);
  const ganados = sum(ciclos.map((c) => c.v));
  const perdidos = sum(ciclos.map((c) => c.d));
  const sumFm = sum(fm);

  const nivelMedio = sum(no.map((x, i) => x * fm[i])) / sumFm;
  const eficMedia = sum(ef.map((x, i) => x * fm[i])) / sumFm;
  const grupoMedio = sum(ciclos.map((c, i) => c.grupo * N[i])) / partidos;
  const valorBaseMedio = 9.6 - 0.35 * (grupoMedio - 1);
  const ajusteEficMedio = sum(aj) / aj.length;

  const w = ciclos.map((c, i) => N[i] * valorBase(c.grupo));
  const eficPonderada = 1 + 9 * sum(ef.map((e, i) => e * w[i])) / sum(w);
  const fiabilidad = 10 * (1 - Math.exp(-partidos / 11.2));
  const rating = 0.85 * nivelMedio + 0.10 * eficPonderada + 0.05 * fiabilidad;

  return { rating, nivelMedioCiclo: nivelMedio, fiabilidad, grupoMedio,
    valorBaseMedio, ajusteEficMedio, eficienciaMedia: eficMedia,
    eficienciaPonderada: eficPonderada,
    puntosPorPartido: (3 * ganados + perdidos) / partidos,
    partidos, ganados, perdidos, porcentajeVictorias: 100 * ganados / partidos };
}

// ---- test vectors ----
const casos = {
  "Jonas Jones":     { c: [[1,4,0],[1,4,0],[1,2,2],[2,3,0],[1,4,0],[1,4,0]], R:9.7755 },
  "Marcos Gavassa":  { c: [[4,4,0],[2,2,2],[1,0,3],[3,3,0],[1,1,2],[2,5,0]], R:9.1402 },
  "Kevin Moro":      { c: [[7,0,1]],                                          R:6.6477 },
  "Michael Pazynych":{ c: [[22,4,0],[20,1,0],[20,1,0],[20,1,1],[20,2,0],[18,1,0]], R:3.8841 },
};
for (const [n, o] of Object.entries(casos)) {
  const ciclos = o.c.map(([grupo, v, d]) => ({ grupo, v, d }));
  const r = ratingCompleto(ciclos).rating;
  console.log(`${n.padEnd(18)} calc=${r.toFixed(4)}  oficial=${o.R.toFixed(4)}  ${Math.abs(r-o.R)<1e-3?"OK":"XX"}`);
}
