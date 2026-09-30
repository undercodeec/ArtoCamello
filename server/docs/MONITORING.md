# Monitorización de pagos y autorización

## Señales disponibles

- `/api/admin/dashboard` muestra transferencias en revisión, pagos vencidos, pagos de tarjeta o PayPhone aprobados sin asignación, proporción de transferencias rechazadas y tiempo medio de revisión de los últimos 1.000 comprobantes revisados. Cada consulta se filtra por tenant.
- Un webhook Kushki que no se pueda autenticar o procesar emite una línea JSON en stderr con `event=payment_webhook_failed`, `provider`, `tenantId`, `reason`, `at` y, si ya se identificó el pago, `paymentId`. No se registran cuerpo, firma, datos de tarjeta ni credenciales.
- `PaymentEvent` conserva los eventos de proveedor autenticados, la asignación y los casos `manual_resolution_required`. Las acciones administrativas se registran en `AuditLog`.

## Alertas iniciales

Configura la recolección central de stderr para **todas** las instancias del API. Cuenta `payment_webhook_failed` por `tenantId` y `reason` en ventanas de 15 minutos. Investiga cualquier `processing`, `event_conflict` o `manual_resolution`; investiga un aumento de `authentication` o `payment_mismatch` por posible configuración errónea o tráfico abusivo. La métrica basada en logs requiere un recolector externo; el proceso no mantiene un contador local que se perdería al reiniciar.

Revisa diariamente `unresolvedProviderPayments` y `expiredPayments`. Un pago de tarjeta o PayPhone aprobado sin asignación requiere revisar el cobro y decidir resolución o reintegro con el proveedor. `unresolvedCardPayments` continúa disponible para aislar solo tarjeta. Una transferencia pendiente que vence no debe desbloquear el contacto. Compara `rejectionRate` y `averageReviewHours` con la línea base del tenant; los valores del dashboard son acumulados salvo el promedio, que usa las últimas 1.000 revisiones.

## Verificación de carga y aislamiento

`npm run test:integration` ejecuta un ensayo de 60 consultas concurrentes a listados de pagos y usuarios de dos tenants. Verifica que todas respondan correctamente y que los resultados pertenezcan al tenant solicitante; imprime la latencia p95 observada. Es una prueba ligera de regresión, no una capacidad máxima certificada. Antes de producción, repite una prueba con el volumen esperado y una copia de los datos reales, mide p95/p99 y errores bajo carga sostenida, y revisa los índices y el plan de ejecución de las consultas lentas.
