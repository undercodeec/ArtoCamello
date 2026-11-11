# Corrección de solicitudes dirigidas y seguridad — Plan de implementación

**Estado al 10 de noviembre de 2026:** implementación en el árbol de trabajo y pruebas automatizadas aprobadas. Quedan pendientes la configuración de claves y dominios reCAPTCHA/SMTP en producción, revisión de solicitudes históricas en cuarentena y validación manual de navegador y proveedores reales. La lista de tareas de abajo conserva el plan original para trazabilidad.

> **Para quien implemente:** ejecutar tarea por tarea con pruebas que fallen antes de cambiar el código. No clasificar registros históricos sin revisión operativa.

**Goal:** Impedir que una solicitud enviada desde el perfil de un profesional se distribuya a otros y cerrar los riesgos de privacidad y autorización comprobados.

**Architecture:** Añadir visibilidad explícita al modelo, centralizar la elegibilidad por solicitud en el servidor y devolver DTO de vista previa sin datos privados. Aplicar la misma política en listado, inicio de pago y asignación final; validar entradas y estados en cada transición.

**Tech Stack:** Express 4, Prisma 6, PostgreSQL, React 18, TypeScript, Node `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-10-solicitudes-seguridad-design.md`.

## Global Constraints

- Los cambios existentes sin confirmar en el árbol de trabajo son ajenos a este plan; revisarlos antes de editar y no sobrescribirlos.
- La regla de compra actual es hasta 4 profesionales por solicitud general, configurable por tenant; una solicitud dirigida admite solo al destinatario.
- No usar CAPTCHA ni filtros del navegador como fuente de autorización.
- No exponer dirección exacta, correo ni teléfono en vistas previas o logs.
- Una solicitud histórica sin destinatario verificable queda en cuarentena hasta revisión.

## Review Focus

1. Un profesional de la misma categoría distinto del destinatario no ve ni puede pagar una solicitud dirigida: prueba en Tareas 2 y 3.
2. Una dirección o un teléfono escritos en `title` o `description` no salen en la vista previa: prueba en Tarea 2.
3. Dos pagos concurrentes para una solicitud dirigida no asignan dos contactos: prueba en Tarea 3.
4. Una cotización de solicitud cancelada/completada no puede aceptarse ni modificarse: prueba en Tarea 4.
5. Un CAPTCHA vencido, repetido o resuelto para otro host no permite publicar: prueba en Tarea 5.

## Orden y archivos

1. `server/prisma/schema.prisma` y nueva migración SQL: visibilidad, destinatario, ciudad y restricción.
2. `server/src/requestPolicy.ts` (nuevo), `server/src/index.ts`: validación de destinatario y DTO privado/público.
3. `server/src/transfers.ts`, `server/src/payments.ts`, `server/src/index.ts`: elegibilidad en PayPhone, transferencia, tarjeta y asignación.
4. `src/services/requestService.ts`, `src/domain/types.ts`, `src/app/components/ProProfilePage.tsx`, `src/services/quoteService.ts`: contrato frontend y token común.
5. `server/src/captcha.ts` (nuevo), `server/src/index.ts`, formularios React: protección contra automatización.

### Tarea 1: Modelo y cuarentena histórica

**Files:** `server/prisma/schema.prisma`; nueva `server/prisma/migrations/<timestamp>_request_visibility/migration.sql`; `server/tests/client-request.integration.js`.

**Interfaces:** `ServiceRequest.visibility: 'legacy_unclassified' | 'direct' | 'marketplace'`, `targetProfessionalUserId: string | null`, `city: string | null`. La migración marca las filas existentes `legacy_unclassified`; el API no puede crear ese valor. Una restricción SQL exige destinatario en `direct` y ausencia de destinatario en las otras dos clases.

- [ ] Escribir prueba de migración/creación: registros históricos quedan `legacy_unclassified`; intento de `direct` sin destino y de `marketplace` con destino falla; registros nuevos válidos se guardan.
- [ ] Ejecutar la prueba y confirmar fallo por ausencia de campos.
- [ ] Añadir relaciones Prisma, índice `(tenantId, visibility, status, createdAt)` y migración; generar cliente Prisma.
- [ ] Ejecutar `pnpm --dir server prisma:generate`, `pnpm --dir server build` y prueba; exigir salida 0.

### Tarea 2: Creación, autorización de lectura y privacidad

**Files:** `server/src/requestPolicy.ts` (nuevo); `server/src/index.ts`; `server/tests/client-request.integration.js`; `src/app/components/ProProfilePage.tsx`; `src/services/requestService.ts`; `src/domain/types.ts`.

**Interfaces:** `canProfessionalAccessRequest(request, professionalUserId, professionalCategories, tenantId): boolean`; `toProfessionalPreview(request, costUSD, maxProfessionals): ProfessionalRequestPreview`. `POST /api/requests` acepta `visibility: 'direct' | 'marketplace'`, `city`, y solo para `direct`, `targetProfessionalUserId` (ID de `User`, que ya usa el perfil público). `GET /api/requests/available` devuelve la vista previa.

- [ ] Escribir integración con cliente, destinatario A, profesional B de igual categoría y tenant ajeno: A ve la `direct`, B y otro tenant no; ambos elegibles ven `marketplace`; `legacy_unclassified` no aparece.
- [ ] Añadir casos con dirección exacta y teléfono incrustado en título/descripción; la vista previa solo contiene ciudad, categoría, presupuesto, urgencia y título generado desde categoría; no contiene campos privados ni texto libre del cliente.
- [ ] Ejecutar prueba y confirmar fallo; implementar política y DTO de lista. No intentar limpiar PII del texto libre con expresiones regulares.
- [ ] Cambiar formulario del perfil para enviar `visibility='direct'`, `targetProfessionalUserId=pro.id` y `city`; el servidor valida profesional activo/verificado, tenant y categoría. Rechazar un destino falso con 400/404. Corregir el texto del formulario que hoy promete no compartir el teléfono: explicar que solo el profesional destinatario lo verá tras desbloquear el contacto.
- [ ] Ejecutar integración y `pnpm build`; exigir salida 0.

### Tarea 3: Compras y asignación con la misma política

**Files:** `server/src/index.ts`; `server/src/transfers.ts`; `server/src/payments.ts`; `server/tests/client-request.integration.js`.

**Interfaces:** reutilizar `canProfessionalAccessRequest`; `purchaseLimitForRequest(request, tenantSettings): number` devuelve 1 para `direct` y `maxProfessionalsPerLead` para `marketplace`. La elegibilidad se reevalúa dentro de la transacción de `allocateLead`.

- [ ] Escribir pruebas para B intentando PayPhone, transferencia y tarjeta con ID directo de A: 403/404 y ninguna intención de pago. A puede iniciar un pago. Un registro en cuarentena no se compra.
- [ ] Añadir prueba concurrente: como máximo un `LeadPurchase` pagado y un cupo consumido para `direct`; confirmación repetida es idempotente.
- [ ] Ejecutar y confirmar fallo; aplicar política antes de crear intención y dentro de la asignación, con estado abierto y tenant del request/profesional.
- [ ] Ejecutar `pnpm --dir server test:integration`; exigir 0 fallos. Revisar manualmente que un cobro ya confirmado sin asignación conserve ruta de conciliación, sin revelar contacto.

### Tarea 4: Estados, entradas y sesión de cotizaciones

**Files:** `server/src/index.ts`; `src/services/quoteService.ts`; `src/services/authService.ts`; `server/tests/client-request.integration.js`; prueba frontend nueva `test/quoteService.test.mjs`.

**Interfaces:** `getAuthHeader()` usa `getCurrentAuth().token`. `POST /api/quotes` admite solo solicitudes abiertas con compra pagada del profesional; `accept` exige cotización `sent` y solicitud `contact_limit_open`, `contact_limit_reached` o `quotes_received`; cancelar solo estado abierto; completar solo `hired`.

- [ ] Escribir integración de límites de texto, fecha, categoría y presupuesto (`NaN`, infinito, negativo, texto enorme); esperar 400 sin crear fila.
- [ ] Escribir integración de estados: cancelar y luego aceptar/cotizar, aceptar dos veces y completar sin contratación devuelve 409; ninguna operación cambia la fila.
- [ ] Escribir prueba frontend: tras login normal, los cuatro llamados de `quoteService` llevan `Authorization: Bearer <authToken>`.
- [ ] Confirmar fallos; validar en servidor y transacciones condicionales; reutilizar `getCurrentAuth` en el servicio. Evitar `parseFloat` de valores no validados.
- [ ] Ejecutar `pnpm --dir server test:integration`, pruebas frontend y `pnpm build`; exigir 0 fallos.

### Tarea 5: Verificación de correo, reCAPTCHA y límites de publicación

**Files:** `server/src/captcha.ts` (nuevo); `server/src/index.ts`; `server/prisma/schema.prisma`; `src/app/routes.tsx`; `src/app/pages/VerifyEmailPage.tsx` (nuevo); `src/app/components/SignUpModal.tsx`; `src/app/components/ProProfilePage.tsx`; `src/services/authService.ts`; `src/services/requestService.ts`; `server/tests/client-request.integration.js`.

**Interfaces:** `verifyRecaptcha(token: string, expectedHostname: string, remoteIp?: string): Promise<boolean>` llama `https://www.google.com/recaptcha/api/siteverify` con secreto del servidor. Variables `RECAPTCHA_SECRET_KEY` y `VITE_RECAPTCHA_SITE_KEY`; configurar host de cada tenant. `POST /api/auth/verify-email` recibe token de uso único desde el fragmento del enlace, comprueba su hash y activa la cuenta. Ruta frontend `/verificar-correo`. En producción, ausencia de secreto impide publicar/registrar (503), nunca bypass silencioso. En test, inyectar verificador simulado.

- [ ] Escribir pruebas de token ausente, vencido, reutilizado, host distinto y respuesta válida; exigir 400/403 para fallos y 201 solo para válido. Añadir límite por usuario e IP en publicación (429 con `Retry-After`).
- [ ] Escribir integración: cuenta nueva tiene `emailVerified=false`, no publica antes de verificar; enlace aleatorio, hash almacenado, caducidad y uso único; tras verificar puede publicar. Registrar entrega fallida y permitir reenviar con límite.
- [ ] Confirmar fallos; integrar widget reCAPTCHA v2 en registro y ambos formularios de solicitud, regenerar token tras error y verificarlo en backend. Mantener los límites existentes de login/registro/recuperación.
- [ ] Implementar confirmación de correo para cuentas nuevas y negar acciones de publicación a no verificadas; añadir página de confirmación y reenvío. Migrar cuentas existentes mediante política operativa sin ponerlas todas en estado no verificado a ciegas.
- [ ] Ejecutar integración y compilaciones; probar manualmente teclado, lector de pantalla, carga fallida del widget y reintento sin duplicar solicitud.

### Tarea 6: Endurecimiento y salida controlada

**Files:** `server/src/index.ts`; `server/package.json`; `pnpm-lock.yaml`; `server/tests/client-request.integration.js`; documentación de operación `server/docs/PRODUCTION_CHECKLIST.md`.

- [ ] Añadir prueba para `notifications/preferences`: `label` y `fullName` con HTML se escapan en correo y existe una lista cerrada de preferencias; limitar envíos por usuario.
- [ ] Añadir escape de HTML y límite; actualizar `qs`/cadena de Express a versión sin GHSA-6pq8-jhm2-2vcw; ejecutar `pnpm audit --prod` y documentar cualquier aviso restante.
- [ ] Medir y revisar solicitudes históricas en cuarentena con el negocio; registrar decisión por ID sin volcar PII. Solo entonces reclasificar, comunicar a clientes afectados si corresponde y habilitar el formulario dirigido.
- [ ] Ejecutar `pnpm --dir server test:integration`, `pnpm --dir server test:security-unit`, `pnpm build`, `pnpm --dir server build` y `pnpm audit --prod`; publicar resultados y riesgos restantes.

## Línea base de la investigación (antes de implementar)

`pnpm --dir server build`: correcto. `node --test tests/client-request.integration.js` desde `server`: 1 prueba aprobada. La reproducción local de dos profesionales confirmó la exposición de la solicitud y dirección. `pnpm audit --prod`: 1 aviso moderado en `qs`. Ninguna tarea de implementación de este plan se ha ejecutado.
