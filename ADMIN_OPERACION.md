# Operación del panel administrativo

## Decisiones iniciales

- El tenant inicial es `artocamello`. Cada marketplace futuro tendrá su propio tenant y dominio registrado.
- El dominio marcado `isPrimary` en `TenantDomain` se usa para retornos de pago, verificación de correo e invitaciones; en desarrollo local se usa `APP_BASE_URL`.
- El cupo inicial es **4 profesionales por solicitud**. El dueño del tenant puede cambiarlo en `/admin/settings`; el servidor lo aplica al listado, creación y aprobación de pagos.
- Moneda inicial: USD. Comisión: 6% del presupuesto, mínimo USD 3. Transferencias: referencia única y vencimiento de 72 horas.
- Las cuentas receptoras no se inventan en la semilla. Un `tenant_owner` debe configurarlas en `/admin/settings` antes de habilitar transferencias.
- Un `payments_reviewer` o `tenant_owner` concilia transferencias. `support_agent` solo consulta.

## Puesta en marcha local

1. Para PostgreSQL local reproducible, ejecuta `docker compose up -d db` en la raíz y copia `server/.env.example` a `server/.env`. Configura `DATABASE_URL` y `JWT_SECRET` según tu entorno. Para crear un dueño inicial, define `ADMIN_SEED_EMAIL` y `ADMIN_SEED_PASSWORD` (mínimo 14 caracteres). Para el dueño global de desarrollo usa `PLATFORM_OWNER_EMAIL` y `PLATFORM_OWNER_PASSWORD` (mínimo 16 caracteres). Usa correos distintos.
2. En `server/`: `npm install`, `npx prisma migrate deploy`, `npx prisma generate`, `npm run prisma:seed`, `npm run prisma:reconcile`, `npm run dev`.
3. En la raíz: `npm install` y `npm run dev`. Entra con el correo sembrado y abre `/admin`.
4. Configura una cuenta bancaria receptora. Solo entonces el profesional verá las instrucciones de transferencia.

`PAYPHONE_MOCK=true` habilita el flujo simulado únicamente fuera de producción. En producción usa `NODE_ENV=production`, credenciales reales de PayPhone y `PAYPHONE_MOCK` desactivado.

El flujo y las pruebas previas a activar credenciales reales están en [PAYPHONE_PROVIDER.md](server/docs/PAYPHONE_PROVIDER.md). La confirmación real coteja referencia, ID, monto y moneda con el pago guardado.

El panel exige MFA TOTP para todas las membresías administrativas. En el primer acceso, cada administrador registra la clave en una aplicación autenticadora, confirma un código y guarda ocho códigos de recuperación de un solo uso. La sesión administrativa dura 30 minutos y se valida además del token de acceso general. Para producción configura `MFA_ENCRYPTION_KEY` con 32 bytes aleatorios codificados en 64 caracteres hexadecimales y guárdala junto con los respaldos; perder esta clave impide descifrar los secretos TOTP. `ADMIN_MFA_REQUIRED=false` solo desactiva la exigencia en desarrollo; producción siempre la exige. Si alguien pierde autenticador y códigos, la recuperación exige verificación de identidad y un procedimiento manual supervisado; no se permite desactivar MFA desde una sesión de contraseña sola.

Para invitar a un administrador nuevo, configura `SMTP_USER` y `SMTP_PASS`. El enlace enviado por correo dura siete días y permite crear una contraseña; después el invitado inicia sesión. Si el usuario ya tiene una cuenta verificada, recibe un enlace a `/admin` y acepta la membresía allí.

La migración conserva `LeadPurchase` y sus campos PayPhone heredados. `npm run prisma:reconcile` compara cantidades, importes y referencias de compras pagadas con las asignaciones nuevas. Detén el despliegue si reporta diferencias. En la base local durante esta implementación había 0 compras pagadas, así que el cotejo dio 0/0.

## Revisión de transferencias

1. Filtra `under_review` en `/admin/payments/transfers` y abre el pago.
2. Comprueba identidad del pagador, solicitud, monto exacto, monto declarado, referencia, banco, fecha y cuenta receptora. Abre el comprobante privado desde el detalle. Si el monto declarado difiere del pago esperado, rechaza el comprobante; el servidor bloquea la aprobación. Los comprobantes anteriores a esta migración no tienen monto declarado y requieren cotejo manual con el banco.
3. Investiga la advertencia de duplicados. Busca movimientos con igual referencia bancaria o comprobante; compara monto y pagador. El aviso no equivale a prueba de fraude.
4. Confirma la recepción en el banco **antes** de pulsar Aprobar. La aprobación asigna el pago y desbloquea el contacto en una transacción. Una segunda aprobación no incrementa el cupo.
5. Si no coincide, rechaza con motivo específico. El profesional ve el motivo y puede enviar un nuevo comprobante; el anterior permanece en el historial.

Objetivo operativo inicial: revisar cada envío dentro de un día hábil. Escala pagos vencidos, duplicados o disputados al dueño del tenant. Si el banco está indisponible, deja el pago en revisión; no apruebes por la imagen sola.

El dashboard muestra pagos vencidos, pagos de proveedor aprobados pendientes de resolución, proporción de decisiones de transferencia rechazadas y tiempo medio de revisión de los últimos 1.000 comprobantes revisados. Supervisa estos valores junto con la bandeja y la auditoría.
El indicador de pagos de proveedor por resolver incluye tarjeta y PayPhone. Filtra el historial de pagos por estado `approved` para localizar un cobro confirmado que no desbloqueó el contacto. Comprueba los eventos y la referencia del proveedor antes de gestionar un reintegro o una solución comercial.

La guía de [monitorización](server/docs/MONITORING.md) define las señales de fallos de webhook, las alertas iniciales y la prueba ligera de carga y aislamiento de listados.

## Seguridad y soporte

- Los comprobantes se guardan en `server/private-proofs/`, fuera de la carpeta pública y excluidos de Git. Respalda ese directorio junto con PostgreSQL y limita permisos del sistema operativo al proceso del servidor.
- En producción configura `CLAMSCAN_PATH` a un ejecutable ClamAV disponible y `JWT_SECRET` de 32 o más caracteres. Sin escáner, el API rechaza comprobantes.
- Los enlaces de comprobante duran cinco minutos y requieren token administrativo y permiso `payments.read` además de la firma.
- No registres ni compartas contraseñas, tokens, comprobantes, números completos de cuentas de origen ni secretos de proveedor en tickets.
- Un cambio de membresía o permisos invalida sus sesiones previas mediante `sessionVersion` y se aplica en el siguiente request. Para un incidente, revoca la membresía o suspende al usuario y revisa `/admin/audit`.
- `POST /api/platform/tenants` y `GET /api/platform/tenants` son rutas globales exclusivas de `platform_owner`; el resto de rutas administrativas están ligadas al tenant resuelto por dominio.
- El inicio de sesión limita a 8 intentos por correo e IP y 80 por IP en 15 minutos; el registro limita a 20 intentos por IP y hora. Los contadores se comparten en PostgreSQL y responden `429`/`Retry-After` al superar el límite. Si el API está detrás de un proxy, configura `TRUST_PROXY_CIDRS` con **solo** las IP o subredes de tus proxies de confianza y haz que estos sobrescriban `X-Forwarded-For` y `X-Forwarded-Host`. Sin esa configuración se usa la IP de la conexión directa. Los contadores vencidos se purgan cada hora.

## Criterios previos a producción

Antes de producción, prueba la inscripción y recuperación MFA con usuarios reales y documenta el procedimiento supervisado de recuperación. También faltan una política de retención formal para comprobantes y auditoría, un escáner configurado, cuentas reales y ensayos sobre una copia de la base de producción. La integración provisional de tarjeta con Kushki permanece deshabilitada hasta contar con contrato, credenciales, webhooks y Analytics habilitados, y completar las pruebas de `server/docs/CARD_PROVIDER.md`.
