# Archivos completos — v5.1.2

Base: `fafc3260d21292eecae9a500a17513c2f9e1d90d` (v5.1.1).
**6 reemplazos y 1 archivo nuevo.** Todos se cargan en la misma rama.

| Ruta exacta | Acción | Propósito |
|---|---|---|
| `api/_validation.js` | Reemplazar | Mantiene los permisos y exige que la bandera de resultado especial sea booleana; aplica las reglas compartidas. |
| `public/score-rules.js` | Reemplazar | Admite el último set parcial solo en la validación RET; mantiene intacta la validación normal. También lo usa el servidor. |
| `public/result-editor.js` | Reemplazar | Formulario común, mensajes ES/EN, selección de retirado y rechazo de campos faltantes o sets salteados. |
| `public/core-estado.js` | Reemplazar | Los parciales RET suman juegos reales, no sets completos en la clasificación ni sus desempates. |
| `public/match-history.js` | Reemplazar | Historial, estadísticas y H2H reconocen una retirada parcial y conservan los controles de estabilidad de v5.1.1. |
| `tests/regression.test.js` | Reemplazar | Cambia la prueba antigua que prohibía todos los parciales en RET; mantiene y amplía las comprobaciones negativas. |
| `tests/retirement-partials-v512.test.js` | Agregar | 132 pruebas focalizadas de la nueva regla y sus límites. |

Los archivos Markdown, `MANIFIESTO_v512.json` y `SHA256SUMS.txt` son documentación/evidencia local, no necesarios para la aplicación. No subas el respaldo ni las capturas a `public/`.

**No agregues una carpeta llamada `retiradas-v512` dentro de la repo: ese nombre corresponde a la rama.** Cada archivo va en su ruta, no todo dentro de `public/`.
