# Publicación de servicios requeridos por clientes — Plan de implementación

**Estado al 10 de noviembre de 2026:** flujo de backend y frontend implementado en el árbol de trabajo y pruebas automatizadas aprobadas. Quedan pendientes la configuración de producción y la validación manual en navegador y con proveedores de pago. La lista de tareas de abajo conserva el plan original para trazabilidad.

> **Para quien implemente:** ejecutar tarea por tarea con pruebas que fallen antes de cambiar el código. Este plan se ejecuta tras el plan de seguridad de solicitudes.

**Goal:** Permitir que un cliente publique y gestione una necesidad de servicio general para que profesionales elegibles la encuentren y contacten mediante el flujo de pago existente.

**Architecture:** Reutilizar `ServiceRequest`, pagos por contacto, cotizaciones y paneles actuales. Añadir una ruta y formulario de publicación, validación de edición, idempotencia y vistas de estado; el servidor impone `visibility='marketplace'` y los permisos.

**Tech Stack:** React 18, React Router 7, TypeScript, Express 4, Prisma 6, PostgreSQL, Node `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-10-publicacion-cliente-design.md`.

## Global Constraints

- Depende de `visibility`, DTO de vista previa, `city`, política de pagos y token de cotizaciones del plan `2026-11-10-solicitudes-seguridad.md`.
- Cliente no paga a ArtoCamello por publicar; profesional paga para desbloquear el contacto. Máximo configurable por tenant, por defecto 4.
- Dirección exacta, correo y teléfono quedan fuera de oportunidades no compradas.
- Una publicación editada después de una compra pagada o mientras haya una intención de pago activa debe rechazarse, incluso con dos solicitudes simultáneas.

## Review Focus

1. Reenvío del formulario con igual clave de idempotencia crea una sola solicitud: prueba Tarea 2.
2. Otro cliente no edita ni cancela una publicación ajena: prueba Tarea 3.
3. Un profesional que ya pagó conserva el contacto tras cancelación, pero no se admiten compras ni cotizaciones nuevas: prueba Tareas 3 y 4.
4. Un profesional de otra categoría o tenant no encuentra la publicación: prueba Tarea 4.
5. Un usuario que inició el formulario antes de autenticarse conserva datos en su sesión y no publica como `guest`: prueba Tarea 1.

## Orden y archivos

1. `src/app/routes.tsx`, `src/app/components/Hero.tsx`, nuevo `src/app/components/PublishServicePage.tsx`: acceso y formulario.
2. `src/services/requestService.ts`, `server/src/index.ts`, `server/prisma/schema.prisma`: contrato de publicación e idempotencia.
3. `src/app/components/MyRequestsPage.tsx`, `server/src/index.ts`: edición segura y gestión.
4. `src/app/components/dashboard/ExploreJobs.tsx`, `src/app/components/dashboard/MyContacts.tsx`: oportunidades y contacto.

### Tarea 1: Entrada del cliente y formulario

**Files:** `src/app/routes.tsx`; `src/app/components/Hero.tsx`; `src/app/components/Header.tsx`; `src/app/components/MyRequestsPage.tsx`; `src/app/components/SignUpModal.tsx`; `src/shared/components/RouteGuard.tsx`; `src/app/components/OnboardingPage.tsx`; nuevo `src/app/components/PublishServicePage.tsx`; prueba frontend `test/publishServicePage.test.mjs`.

**Interfaces:** ruta `/publicar-servicio`; `PublishServicePage` recoge `categorySlug`, `title`, `description`, `city`, `location`, `urgency`, `preferredDate?`, `estimatedBudget`, `contactName`, `contactEmail`, `contactPhone`. `RouteGuard` permite solo `client`; también restringir `/mis-solicitudes` y `/mi-perfil` a `client`, pues hoy permiten `pro` aunque sus APIs lo rechazan. `RouteGuard` ya pasa `state.from` al redirigir; `SignUpModal` y `OnboardingPage` deben usarlo para volver a `/publicar-servicio` después de login/selección de rol. Borrador de formulario en `sessionStorage`, con clave distinta de tokens y sin persistir teléfono si no se necesita.

- [ ] Escribir prueba de navegación: invitación visible en inicio y `mis-solicitudes`, usuario no autenticado vuelve al formulario tras login, rol `pro` no publica.
- [ ] Escribir prueba de campos obligatorios, presupuesto positivo, estado de carga y error de API; confirmar fallo.
- [ ] Implementar ruta, enlace y formulario accesible; prefijar contacto desde perfil, pero permitir corregirlo.
- [ ] Ejecutar prueba frontend y `pnpm build`; exigir salida 0.

### Tarea 2: Publicación explícita e idempotente en backend

**Files:** `src/services/requestService.ts`; `server/src/index.ts`; `server/prisma/schema.prisma`; nueva migración de idempotencia; `server/tests/client-request.integration.js`.

**Interfaces:** `createServiceRequest(payload, idempotencyKey)` envía `Idempotency-Key` UUID. `POST /api/requests` crea `marketplace` sin destinatario y devuelve 201; repetir misma clave, cliente y contenido devuelve el mismo ID sin otra fila; reutilizar clave con contenido distinto devuelve 409. Guardar clave y hash de contenido por `(tenantId, clientId, key)` con índice único.

- [ ] Escribir integración de publicación válida, rol no cliente (403), destino prohibido (400), categoría inexistente (400) y mismo `Idempotency-Key` dos veces (una fila).
- [ ] Confirmar fallo; implementar contrato, validación y transacción de idempotencia; no aceptar `visibility='direct'` desde esta ruta de frontend.
- [ ] Ejecutar integración y compilación de servidor; exigir salida 0.

### Tarea 3: Gestión de una publicación propia

**Files:** `server/src/index.ts`; `src/services/requestService.ts`; `src/app/components/MyRequestsPage.tsx`; `server/tests/client-request.integration.js`.

**Interfaces:** `PATCH /api/requests/:id` permite modificar título, descripción, ciudad, dirección, fecha, urgencia, presupuesto y contacto solo al cliente propietario, mientras `purchaseCount=0`, no existe pago activo y el estado está abierto. `POST /api/requests/:id/cancel` solo cambia estados abiertos; devuelve 409 si ya cerrada.

- [ ] Escribir integración de edición válida antes de compra, cliente ajeno, publicación con intención de pago activa, publicación con compra pagada, edición/cancelación concurrente y repetición de cancelación.
- [ ] Confirmar fallo; implementar `updateMany` condicional dentro de transacción y controles de propiedad/tenant. Mantener intacto el historial de pagos y contactos ya asignados.
- [ ] Mostrar edición y cancelación en `mis-solicitudes` con estados y errores claros; usar datos nuevos devueltos por API.
- [ ] Ejecutar integración y `pnpm build`; exigir salida 0.

### Tarea 4: Descubrimiento y contacto profesional

**Files:** `server/src/index.ts`; `server/src/requestPolicy.ts`; `src/app/components/dashboard/ExploreJobs.tsx`; `src/app/components/dashboard/MyContacts.tsx`; `server/tests/client-request.integration.js`.

**Interfaces:** `GET /api/requests/available` incluye publicaciones `marketplace` para pros elegibles; tarjeta indica ciudad, categoría, urgencia, presupuesto y cupos. El contacto completo sale solo por `GET /api/leads/unlocked` tras pago asignado; la cotización usa el token corregido.

- [ ] Escribir integración de filtros por tenant/categoría, ausencia de PII en vista previa, compra y desbloqueo del profesional correcto, cupo agotado y cancelación.
- [ ] Confirmar fallo de los casos nuevos; adaptar tarjetas y estados de pago sin duplicar la lógica de tarifa en React.
- [ ] Ejecutar integración, prueba de cotizaciones y compilación frontend; exigir salida 0.

### Tarea 5: Recorrido completo y lanzamiento

**Files:** prueba de flujo nueva en `server/tests/client-request.integration.js`; `README.md`; `docs/ESTADO_ACTUAL_Y_MVP.md`.

- [ ] Probar recorrido con cliente A, cliente B y dos profesionales: publicación, vista previa, pago, contacto, cotización, aceptación, cancelación y aislamiento de cuentas.
- [ ] Probar manualmente en navegador móvil y escritorio: publicación, retorno desde login, errores de CAPTCHA, doble clic, pantalla vacía, estados y lector de pantalla.
- [ ] Actualizar documentación comercial y operativa; habilitar la navegación pública solo después de que el plan de seguridad esté verificado.
- [ ] Ejecutar `pnpm --dir server test:integration`, `pnpm build`, `pnpm --dir server build`; registrar resultados y fallos restantes.

## Línea base de la investigación (antes de implementar)

El backend ya tiene publicación genérica y flujo de compra/cotización, pero el frontend solo crea solicitudes desde el perfil profesional. No se implementó esta función ni se cambió el código del producto durante esta investigación.
