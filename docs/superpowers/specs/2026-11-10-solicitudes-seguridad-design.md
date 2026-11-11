# Solicitudes dirigidas y seguridad: investigación y diseño

Fecha: 2026-11-10. Alcance: código local y una reproducción contra la API y PostgreSQL de desarrollo. No se hizo una prueba sobre producción ni se inspeccionaron datos reales.

## Hallazgo principal reproducido

El formulario de `ProProfilePage.tsx` crea una solicitud desde el perfil de un profesional, pero `CreateRequestPayload` y `POST /api/requests` no tienen un destinatario. La base `ServiceRequest` tampoco guarda uno. `GET /api/requests/available` selecciona todas las solicitudes abiertas del tenant y las filtra únicamente por categoría. La prueba existente `server/tests/client-request.integration.js` verifica esa distribución general, sin probar solicitudes dirigidas.

Reproducción local con dos profesionales de `fontaneria`: se envió `POST /api/requests` con `targetProfessionalId` del profesional A. Respuesta: HTTP 201, destinatario guardado `null`; la misma solicitud apareció en los buzones de A y B. La lista de B devolvió `location: "Domicilio de auditoria"` antes del pago; el teléfono no apareció. Esto demuestra el cruce en el código actual. No demuestra que todos los profesionales de producción hayan recibido cada solicitud: solo los del mismo tenant y categoría, mientras hay cupo.

## Otros hallazgos verificables

| Prioridad | Evidencia en el repositorio | Impacto y límite de la evidencia |
| --- | --- | --- |
| P0 | `server/src/index.ts`, `GET /api/requests/available`, elimina `contactPhone`, `contactEmail` y `contactName`, pero devuelve `location` y `description`. | Se revela la dirección exacta si el cliente la ingresó; la reproducción local lo confirmó. Revisar también texto libre para teléfonos o correos escritos por el cliente. |
| P1 | `src/services/authService.ts` guarda `authToken` en `sessionStorage`; `src/services/quoteService.ts` lee `localStorage.token`. | Los cuatro llamados de cotizaciones salen sin el token de la sesión normal y pueden recibir 401. Es una incompatibilidad confirmada por lectura; no se atribuye a ella el cruce de datos. |
| P1 | `POST /api/quotes/:id/accept` verifica propiedad, pero no comprueba estado de solicitud ni de cotización. `POST /api/quotes` permite actualizar una cotización pagada sin comprobar si la solicitud sigue abierta. | Se pueden intentar transiciones inválidas, por ejemplo aceptar después de cancelar. Falta prueba de API específica. |
| P1 | `POST /api/requests` valida solo que `estimatedBudget` sea mayor que cero; pasa campos de texto, categoría, fecha y contacto a Prisma sin límites ni formatos completos. | Una petición HTTP directa omite la validación del navegador; entradas inválidas pueden causar 500 o datos no confiables. |
| P1 | `POST /api/auth/register` guarda `emailVerified: true` y las rutas anteriores de verificación por correo están comentadas. | El registro no demuestra control del correo declarado; la verificación antes de publicar queda pendiente. |
| P2 | No hay integración CAPTCHA en `src` ni verificación de token en `server/src`; sí existe limitación de intentos para registro, login y recuperación en `authThrottle.ts`. | Falta una barrera contra automatización en registro y publicación. CAPTCHA complementa límites de tasa y autorización; no los sustituye. |
| P2 | `pnpm audit --prod` reportó una vulnerabilidad **moderada** de `qs` `<=6.16.0`, vía `server>express` y `body-parser` (GHSA-6pq8-jhm2-2vcw). | Versión vulnerable confirmada por el auditor; la explotabilidad de ese fallo en una ruta de esta aplicación no está demostrada. |
| P2 | `POST /api/notifications/preferences` interpola `label` y `user.fullName` sin escape en HTML de correo. | Permite alterar el contenido del correo que recibe el propio usuario; falta una prueba de salida. |

## Decisión de diseño propuesta

Conservar dos clases publicables de solicitud: `direct` desde un perfil profesional y `marketplace` publicada por el cliente. El valor interno `legacy_unclassified` pondrá en cuarentena registros históricos cuya intención no se puede conocer. `ServiceRequest` tendrá `visibility` y `targetProfessionalUserId` opcional, con una restricción de base de datos: `direct` exige destinatario y los otros valores lo prohíben. Se validará que el destinatario esté activo, verificado, en el mismo tenant y ofrezca la categoría elegida. Una solicitud `direct` solo será visible y comprable por ese profesional; una `marketplace` seguirá visible para profesionales elegibles de su categoría, con el límite configurable del tenant. El modelo comercial actual de pago por desbloqueo se mantiene para ambos tipos como supuesto de diseño.

Separar dirección exacta y ciudad. Las vistas de oportunidades devolverán solo ciudad, categoría, urgencia, presupuesto y un título generado a partir de la categoría; ningún texto libre del cliente saldrá antes del pago, pues puede contener PII. Los datos completos seguirán disponibles para el cliente dueño y el profesional cuyo pago esté asignado. Las solicitudes antiguas no tienen destinatario recuperable del modelo: migrarlas como `marketplace` **solo después de revisión operativa** de registros y consentimiento; no inventar un destinatario. Hasta entonces, contener el formulario dirigido y revisar qué solicitudes ya fueron expuestas.

Alternativas consideradas: mantener un solo tipo y filtrar por categoría conserva el error; guardar el destinatario únicamente en el navegador no protege la API; duplicar la tabla de solicitudes separa flujos pero duplica pagos, cotizaciones y estados. El discriminador en la tabla existente permite una regla única en las rutas y en la base.

## Controles y criterios de aceptación

- API y pagos rechazan a un profesional distinto del destinatario de una `direct`, incluso si conoce el ID; otro tenant tampoco puede verla o comprarla.
- El profesional destinatario ve una vista previa de su solicitud `direct`, sin PII exacta; tras pago asignado ve el contacto. El cliente ve su solicitud completa.
- Una publicación `marketplace` aparece solo a profesionales del mismo tenant con categoría válida; los datos privados siguen bloqueados hasta asignación.
- Crear, cotizar, aceptar, cancelar y completar tienen estados permitidos definidos y pruebas para repeticiones, carreras y entradas malformadas. Publicar requiere correo verificado.
- El mismo token de sesión autentica todos los servicios frontend; reCAPTCHA se verifica en el servidor en registro y publicación, con nombre de host y expiración válidos.
- Se mantiene auditoría de solicitudes y accesos a contactos sin registrar teléfonos, correos o tokens en claro.

Referencias de implementación: [Google, verificación de reCAPTCHA](https://developers.google.com/recaptcha/docs/verify), [OWASP, autorización por objeto](https://api-security.owasp.org/editions/2023/en/0xa1-broken-object-level-authorization/), [OWASP, validación de entrada](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html), [advisory GHSA-6pq8-jhm2-2vcw](https://github.com/advisories/GHSA-6pq8-jhm2-2vcw).
