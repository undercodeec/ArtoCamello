# Validación previa a producción

## Verificado en este repositorio

- [x] Migraciones Prisma aplicadas en la base local; `prisma migrate status` al día.
- [x] `pnpm prisma:reconcile` sin diferencias en la base local. Había **0 compras pagadas**, por lo que esto no prueba la migración histórica con datos reales.
- [x] Compilación de servidor y frontend, y pruebas de integración de permisos, aislamiento por tenant, MFA, transferencias, PayPhone simulado, tarjeta simulada e idempotencia.
- [x] Límite distribuido de intentos de acceso y registro, con prueba de respuesta `429`.
- [x] Pruebas de bloqueo del cambio de rol tras el onboarding, privacidad de perfiles públicos, reseñas aisladas por tenant y acceso autorizado a comprobantes.

## Requiere entorno y datos reales

- [ ] Restaurar una copia reciente de la base de producción en un entorno aislado, aplicar migraciones y ejecutar `pnpm prisma:reconcile`. Comprobar conteos, importes y referencias de PayPhone antes del despliegue.
- [ ] Configurar cuentas bancarias, SMTP, `CLAMSCAN_PATH`, `JWT_SECRET`, `MFA_ENCRYPTION_KEY`, copias de PostgreSQL y `server/private-proofs/`, y el dominio principal de cada tenant. Configurar DNS y TLS de `admin.artocamello.com`, publicar ahí el frontend, y definir `ADMIN_HOSTNAMES=admin.artocamello.com` en el API. Definir la política de retención de comprobantes y auditoría con el negocio.
- [ ] Probar con credenciales del comercio los flujos aprobado, cancelado, monto incorrecto y retorno perdido de [PayPhone](PAYPHONE_PROVIDER.md). Confirmar que el dominio y el tiempo de confirmación funcionan como espera el proveedor.
- [ ] Validar en UAT los casos de checkout, firma, moneda, importe, reintento, webhook tardío y Analytics de [Kushki](CARD_PROVIDER.md). Mantener `KUSHKI_CARD_ENABLED=false` y `cardEnabled=false` en producción hasta que la validación termine.
- [ ] Ejecutar carga sostenida sobre una copia representativa, medir p95/p99 y errores, y revisar consultas lentas e índices según [monitorización](MONITORING.md). La prueba de 60 consultas concurrentes del repositorio es solo una regresión ligera.
- [ ] Conectar los logs `payment_webhook_failed` a un recolector central y configurar alertas por tenant. Ensayar recuperación ante pérdida de webhook y resolución de tarjetas cobradas sin cupo.

No se han realizado transacciones reales ni pruebas con cuentas de proveedor en este entorno.
