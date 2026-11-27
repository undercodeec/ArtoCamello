# Pendientes de auditoría: decisiones y validación

## Reseñas históricas

`Review.requestId` es opcional para conservar las reseñas anteriores a la migración. Las reseñas nuevas sí necesitan una solicitud completada y cotización aceptada. **Decisión del producto:** conservar visibles las históricas con etiqueta «Contratación no verificada», pero excluirlas del promedio y número públicos de reseñas verificadas. Las vistas públicas de perfiles y cotizaciones calculan estos agregados de la tabla de reseñas, sin confiar en el agregado almacenado previamente en `ProfessionalProfile` (que puede contener históricos); las nuevas escrituras solo agregan reseñas vinculadas. No vincular una reseña antigua a una solicitud basándose solo en nombres o fechas; tampoco borrarla.

Queda pendiente definir cómo informar a los autores de la etiqueta y moderar posibles abusos. Si otros consumidores futuros utilizan las columnas agregadas almacenadas, deberán recalcularlas o usar el mismo criterio que los endpoints públicos.

## Pagos confirmados sin contacto asignable

Un pago puede quedar `approved` sin `PaymentAllocation` si cambia la disponibilidad de la solicitud; `PaymentEvent.type = manual_resolution_required` registra algunos de estos casos en el webhook o la conciliación. El panel ahora lista los pagos aprobados sin asignación por tenant y permite notas de seguimiento con permiso `payments.review`; cada nota crea un evento y un registro de auditoría, sin alterar el estado del pago. **No hay decisión automática de cierre ni devolución.** No inferir que `rejected`, `failed` o `expired` signifiquen dinero devuelto.

Propuesta para un flujo auditable, **sin activar devoluciones automáticas**:

1. Conciliar cada caso abierto con el extracto del proveedor o banco antes de cualquier acción financiera; la lista permite localizar pagos confirmados sin asignación.
2. Definir expediente con evidencia/referencia externa y estados como «investigando», «pendiente de contactar», «reembolso solicitado», «reembolso confirmado por proveedor/banco» y «resuelto». Las notas auditadas existentes no certifican ninguno de estos estados.
3. Permitir cerrar un caso solo con evidencia verificable de asignación válida, devolución confirmada o resolución documentada con el pagador; proteger contra doble cierre y dos operadores simultáneos; conservar eventos y registro de auditoría. Nunca mostrar comprobantes bancarios a terceros.
4. Definir con negocio elegibilidad, plazos, aprobaciones y método para pagos parciales, transferencias, contracargos y solicitudes canceladas **antes** de integrar reembolsos de Kushki/PayPhone o transferencias.

## Correo durable

El outbox en PostgreSQL ya cubre solicitud directa, primera cotización, revisión de comprobante por revisor, transferencia rechazada y recibo de transferencia aprobada. Encola referencias mínimas dentro de la transacción, revalida destinatario/preferencias o permisos al enviar cuando aplica y reclama trabajos con bloqueo temporal. Tras ocho errores mantiene estado `failed`; el panel lista estos avisos y permite reintentos manuales auditados con permiso `settings.manage`. SMTP puede aceptar un mensaje y fallar antes de confirmar el resultado: entrega **al menos una vez**, no exactamente una vez. Falta migrar los demás avisos transaccionales (invitaciones, cierres); los tokens/códigos de acceso deben mantenerse fuera de una cola de larga duración por vencimiento.

## Validación pendiente

- Las pruebas automáticas locales cubren privacidad de solicitudes, migraciones e integración con PostgreSQL desechable; no equivalen a validar datos de producción.
- No hay aún suite de capturas/regresión visual (ni Playwright/Cypress en `package.json`): se puede preparar con navegador y datos ficticios para móviles/escritorio, sin información real de clientes.
- Pagos reales: solo con credenciales y entorno **sandbox** del proveedor, webhooks autenticados y casos de conciliación/reembolso autorizados. Correo: SMTP de pruebas/captura local, nunca destinatarios reales para pruebas automatizadas.
- La migración de reseñas sigue pendiente en producción; ningún push a GitHub la aplica. Acceso a la VPS de Nava únicamente si una nueva solicitud invoca `/nava-vps`.
