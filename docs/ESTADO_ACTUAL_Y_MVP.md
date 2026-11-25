# ArtoCamello: estado actual y alcance comercial del primer MVP

Actualizado: 24 de noviembre de 2026. Este documento describe el código presente en este repositorio y separa lo implementado de las decisiones comerciales previstas. Para operar el panel, consulta también [ADMIN_OPERACION.md](../ADMIN_OPERACION.md); para requisitos de salida a producción, [PRODUCTION_CHECKLIST.md](../server/docs/PRODUCTION_CHECKLIST.md).

## Actualización del 24 de noviembre de 2026

Las tarjetas de servicios populares enlazan a su categoría de búsqueda. El perfil público oculta la galería cuando no hay imágenes de portafolio y ya no utiliza imágenes de ejemplo en las recomendaciones; se retiró el mensaje de suscripciones. El registro espera a que reCAPTCHA esté listo y limpia el token al cambiar de vista.

Al enviar un comprobante de transferencia se intenta notificar por correo a los revisores autorizados del tenant. Al aprobar y asignar el pago se intenta enviar al profesional un recibo con el logo y los datos del pago; no es una factura tributaria. Estos correos dependen de SMTP, no tienen reintento automático y sus fallos no revierten el comprobante ni la aprobación. Consulta los detalles operativos en [ADMIN_OPERACION.md](../ADMIN_OPERACION.md).

## Actualización del 10 de noviembre de 2026

El cliente ya puede publicar una necesidad general desde `Mis Solicitudes`, además de solicitar directamente a un profesional desde su perfil. El servidor limita las solicitudes dirigidas al destinatario, filtra las publicaciones generales por categoría y tenant y solo entrega datos privados después de asignar una compra. Las solicitudes históricas sin destinatario verificado están en cuarentena. El registro nuevo requiere confirmación por correo y reCAPTCHA; estas funciones necesitan claves, SMTP y dominios configurados antes de usarse en producción. El resto del documento conserva el alcance comercial del MVP y puede contener referencias técnicas previas a esta actualización.

## 1. Qué vende ArtoCamello

ArtoCamello conecta personas que necesitan un servicio con profesionales que quieren contactarles. El cliente publica una solicitud sin pagar a ArtoCamello. El profesional examina oportunidades y paga a ArtoCamello por **desbloquear los datos de contacto de una solicitud**. Ese cobro no es el precio del trabajo. Tras el contacto, el profesional puede enviar una cotización y el cliente elegirla. El pago del trabajo entre cliente y profesional, las liquidaciones al profesional y la facturación electrónica no forman parte de este MVP.

La regla inicial del marketplace es un máximo de **4 profesionales por solicitud**, configurable por tenant. El precio inicial por contacto es **6 % del presupuesto estimado, con mínimo de USD 3**. Estos son parámetros configurables del tenant, no una factura al cliente ni una comisión sobre el trabajo ejecutado.

## 2. Roles y límites

| Actor | Hace en el MVP | Pagos de ArtoCamello |
| --- | --- | --- |
| Visitante | Consulta páginas públicas y perfiles; puede registrarse. | No paga ni ve historial de pagos. |
| Cliente (`client`) | Crea y consulta solicitudes, compara y acepta cotizaciones, cierra solicitudes y puede reseñar. | No paga por publicar ni por consultar profesionales. Su perfil no tiene detalles de pagos. |
| Profesional (`pro`) | Completa perfil, consulta oportunidades, compra acceso a contactos y envía cotizaciones. | Es el único comprador de contactos. Ve sus propios pagos y envía comprobantes de transferencia. |
| Administrador (membresía `TenantMembership`) | Gestiona usuarios, configuración y pagos del tenant según permisos. | No compra contactos. `payments.read` permite **consultar cobros de profesionales** y `payments.review` permite revisar transferencias; no son pagos propios del administrador. Una membresía administrativa activa impide iniciar nuevas compras incluso si la cuenta conserva `User.role = pro`. |

El rol de producto (`User.role`) y el acceso administrativo (membresía, rol y permisos por tenant) son conceptos distintos en el modelo de datos. Una cuenta que tenga ambos atributos opera los pagos de profesionales desde el panel administrativo, pero no inicia compras mientras la membresía esté activa. Una confirmación tardía de un pago anterior sigue siendo una cuestión de conciliación; no debe perderse un cobro ya iniciado.

Dentro del panel, `tenant_owner` y `payments_reviewer` pueden conciliar transferencias; `support_agent` y `auditor` solo consultan según sus permisos. Los datos de un tenant no deben aparecer en otro.

## 3. Recorrido comercial previsto para el MVP

1. El cliente se registra, describe el trabajo y publica una solicitud con presupuesto estimado y datos de contacto privados.
2. Los profesionales ven la oportunidad sin teléfono ni correo del cliente. El cupo de compradores se muestra según la configuración del tenant.
3. Un profesional elige un método habilitado y crea una intención de pago por ese contacto. La referencia y el importe pertenecen a ese profesional y a esa solicitud.
4. En transferencia, paga al banco, declara banco, referencia, fecha e importe, y carga un JPG, PNG o PDF. Un revisor comprueba el movimiento bancario y el comprobante antes de aprobar o rechazar. Si se rechaza, el profesional puede volver a enviar evidencia; se conserva el historial.
5. En PayPhone, el profesional completa el checkout externo. El servidor verifica referencia, identificación del proveedor, importe y moneda antes de asignar el contacto. La tarjeta Kushki está preparada técnicamente, pero apagada por defecto y su activación requiere contrato y UAT.
6. Tras un pago válido, la asignación y el consumo del cupo ocurren en una transacción. El profesional ve el contacto y puede remitir una cotización. El cliente decide si la acepta.
7. El servicio y su cobro entre cliente y profesional quedan fuera de ArtoCamello en esta primera etapa. La plataforma no debe presentar un cobro propio en la interfaz del cliente.

La imagen de un comprobante **no prueba por sí sola** que el dinero llegó al banco. La aprobación exige cotejar el movimiento real. Un cobro aprobado por proveedor que no pudo asignar un contacto queda para resolución manual, sin crear una segunda asignación.

## 4. Qué está implementado hoy

| Área | Implementación actual | Archivo principal |
| --- | --- | --- |
| Sitio público | Landing, categorías, búsqueda y perfiles públicos de profesionales. | `src/app/routes.tsx`, `src/app/components/` |
| Cuenta y perfil | Registro, login, correo, Google, perfiles de cliente y profesional, protección de rutas por rol. | `server/src/index.ts`, `src/shared/components/RouteGuard.tsx` |
| Solicitudes y cotizaciones | Creación de solicitudes por cliente, oportunidades para pro, compra de contacto, cotizaciones y aceptación. | `server/src/index.ts`, `src/app/components/MyRequestsPage.tsx`, `src/app/components/dashboard/` |
| Pagos del profesional | Transferencia con comprobante privado, PayPhone y estructura Kushki deshabilitada por defecto; historial de contactos pagados. | `server/src/transfers.ts`, `server/src/index.ts`, `src/app/components/dashboard/` |
| Administración | Dashboard, listados de clientes y profesionales, membresías, roles, configuración, auditoría, transferencias y todos los pagos. El detalle del pago incluye comprobantes, eventos y asignaciones. | `server/src/admin.ts`, `src/app/components/admin/AdminPanel.tsx` |
| Persistencia | PostgreSQL y Prisma; `Payment`, `PaymentEvent`, `PaymentAllocation`, `TransferSubmission`, `StoredFile`, `LeadPurchase` y entidades de tenant. | `server/prisma/schema.prisma` |
| Seguridad administrativa | Aislamiento por tenant, permisos del servidor, código por correo, MFA TOTP y comprobantes privados con enlace firmado temporal. | `server/src/admin.ts`, `server/src/adminMfa.ts` |

La vista `/demo` en desarrollo usa datos ficticios. Sus apartados de Clientes, Profesionales y Administradores muestran fichas de esos actores; únicamente Transferencias y Todos los pagos muestran detalles de cobros. Esa vista no demuestra un pago real ni carga archivos del servidor.

Los estados de `Payment` son `created`, `awaiting_transfer`, `under_review`, `approved`, `rejected`, `pending_provider`, `failed`, `expired` y `allocated`. `approved` puede indicar cobro de proveedor confirmado aún sin contacto asignado; `allocated` indica que el contacto se desbloqueó. Los detalles de pago del panel administrativo son registros de pagos hechos por profesionales, aunque los consulte un administrador.

## 5. Límites y decisiones pendientes antes de comercializar

- La documentación antigua del README habla de billetera y créditos; el flujo vigente cobra directamente en USD por contacto. `walletService.ts` permanece como archivo heredado sin un sistema activo de recargas.
- La validación comercial de PayPhone queda registrada como deuda técnica aceptada y no forma parte del cierre local actual. No debe activarse ni presentarse como método de pago disponible sin esa validación; Kushki continúa deshabilitado por defecto.
- La restauración de una copia de la base de producción y su reconciliación contra datos reales también queda como deuda técnica aceptada. No sustituye las copias operativas ni la revisión previa a un despliegue de producción.
- Siguen pendientes cuentas bancarias reales, escáner antivirus, backups comprobados, DNS/TLS productivos, alertas y las decisiones contractuales sobre reembolsos, disputas, retención de comprobantes y condiciones comerciales visibles al profesional.
- La exportación de pagos del panel administrativo existe; el botón de exportar del historial del profesional todavía anuncia una funcionalidad futura.
- La vista demo es una muestra de interfaz. Sus nombres, importes y registros no representan transacciones ni usuarios reales.

## 6. Criterios funcionales mínimos del primer MVP

- Un cliente puede publicar una solicitud sin pagar y no ve botones, paneles ni endpoints propios de pago por contacto.
- Solo un profesional sin membresía administrativa activa puede iniciar un pago por contacto. Antes de aprobarlo, no recibe el teléfono ni el correo del cliente.
- El cupo máximo se comprueba en la creación y en la asignación; dos confirmaciones no compran dos veces el mismo contacto.
- Un revisor autorizado consulta todas las evidencias de la transferencia, confirma el ingreso en el banco y decide con motivo registrado. Un administrador con permiso de lectura solo consulta.
- Los comprobantes se sirven desde almacenamiento privado y los pagos se aíslan por tenant. El cliente no puede leerlos mediante el API.
- El profesional conoce el estado de su pago y el motivo de rechazo. Un cobro confirmado sin asignación queda visible para resolución administrativa.
- Las pruebas con dinero real, operaciones y recuperación ante incidentes deben completarse antes de anunciar el MVP como disponible comercialmente.
