# HERMES 2.0 — RELEASE PRODUCTIVO AUTORIZADO

## OBJETIVO

El propietario solicita desplegar cuanto antes las mejoras aprobadas de Hermes 2.0 y comprobar posteriormente su funcionamiento en el VPS.

AUTORIZACIÓN ACTUAL:
- Integrar los PR #11, #12, #9 y #10 siguiendo sus dependencias.
- Preparar y publicar la imagen Docker del backend aprobado.
- Continuar hasta entregar el digest inmutable para despliegue.
- No modificar PostgreSQL desde esta etapa.

No limitarse a preparar otro plan: ejecutar las acciones permitidas y verificarlas.

## 1. REFERENCIAS

Repositorio: undercodeec/hermes_n8n

Rama objetivo:
pilot/a7-d12-monitor-only-20261026

PR #11: correcciones TypeScript.
PR #12: seguridad de follow-redirects.
PR #9: cordialidad personalizada.
PR #10: inteligencia comercial y soporte anual.

HEADs de referencia:

PR #11:
7aaa022566bf9a84078e1ac665046697c4d87010

PR #12:
ff4f667d547c135c98dd92350772422c057313be

PR #9:
41b9365f90d120ee4de98d3707898122d682e1df

PR #10:
23113d2588180f3d727d45f430bec430a370873e

Verificar HEADs y reglas GitHub nuevamente.

## 2. INTEGRACIÓN

Utilizar la simulación validada:

HERMES_PR9_PR12_INTEGRATION_READINESS_2026-11-05.md

Secuencia:

1. Revisar y fusionar PR #11 en el piloto.
2. Revisar y fusionar PR #12 en el piloto.
3. Incorporar el piloto actualizado a PR #9 mediante merge normal.
4. Verificar y fusionar PR #9 en el piloto.
5. Actualizar la base de PR #10 para apuntar al piloto.
6. Incorporar el piloto actualizado a la rama de PR #10 mediante merge normal.
7. Verificar y fusionar PR #10 en el piloto.

Preservar los cuatro historiales.

No utilizar force-push.

No omitir revisiones ni protecciones obligatorias de GitHub.

Si se produce un conflicto, un cambio inesperado de HEAD o una restricción de permisos, detener la operación afectada y documentar el bloqueo.

## 3. VALIDACIÓN DEL COMMIT FINAL

Sobre el HEAD definitivo del piloto ejecutar:

- TypeScript: 0 errores.
- Build: aprobado.
- ESLint: aprobado.
- Prisma validate: aprobado.
- Secret scan: aprobado.
- Suite unitaria: 1.855 pruebas esperadas.
- Integración aislada: 188 pruebas esperadas.
- A7-D16: 31 pruebas esperadas.
- Comprobaciones comerciales: 9/9.
- npm audit --omit=dev: 0 alertas conocidas.

Registrar resultados efectivos, no asumir cifras si las suites han cambiado.

Las 21 alertas de desarrollo existentes deben permanecer documentadas y evaluadas; no ocultarlas.

Verificar que se mantiene:

- Saludo formal personalizado.
- Black Friday prioritario.
- Nueve planes comerciales.
- Precios desde CRM.
- Soporte anual.
- VIP prioritario.
- Corrección de «paguina web».
- Dos planes para proyectos turísticos.
- Cotización contextual.
- STOP, opt-out, privacidad, handoff y F3.

Confirmar que no se introdujeron migraciones nuevas.

## 4. PUBLICACIÓN GHCR

No construir la imagen productiva directamente en el VPS.

Utilizar el workflow manual existente en GitHub Actions:

hermes-backend-ghcr-manual.yml

El workflow se ejecuta desde main y recibe:

source_sha = HEAD definitivo del piloto.

expected_tree = SHA del árbol Git del mismo commit.

Verificar que el workflow efectivo conserva la validación del HEAD piloto antes de publicarlo.

Ejemplo de invocación mediante GitHub CLI autenticado:

gh workflow run hermes-backend-ghcr-manual.yml --ref main -f source_sha=<SHA_FINAL_40> -f expected_tree=<TREE_SHA_40>

No utilizar SHA de la simulación temporal como identidad productiva.

Esperar el resultado efectivo del workflow y comprobar:

- Estado success.
- Digest sha256.
- Plataforma linux/amd64.
- Etiqueta OCI revision igual al commit final.
- Imagen disponible en GHCR.

## 5. ENTREGA

Registrar:

- SHA definitivo del piloto.
- Git tree SHA.
- Merge commits de los cuatro PR.
- Estados finales de los PR.
- Resultados de pruebas.
- GitHub Actions run ID.
- Imagen por digest.
- Comprobación OCI.
- Instrucciones de rollback Git.

Generar un handoff para Codex VPS.

No desplegar desde Local.

No modificar PostgreSQL.

No modificar las tarifas comerciales.

## DICTAMEN

Si la publicación terminó correctamente:

HERMES_BACKEND_IMAGE_READY_FOR_VPS

Si existe un bloqueo:

HERMES_RELEASE_BLOCKED

Entregar el resultado real con SHA y digest verificables.