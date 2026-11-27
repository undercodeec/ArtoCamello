# Matriz técnica de correos (revisión de código)

## Precio de desbloqueo y comprobante

El cliente introduce un **presupuesto estimado para el trabajo**, no el importe que el profesional paga por el contacto. El servidor calcula el precio de desbloqueo como `máximo(presupuesto × porcentaje, mínimo)` y lo redondea a centavos: por defecto 6 % y USD 3 de mínimo; estos parámetros se pueden cambiar por tenant desde Administración. Por ejemplo, un presupuesto de USD 50 produce USD 3 y uno de USD 100 produce USD 6. La intención de pago almacena ese monto y el comprobante debe declarar exactamente el mismo importe; si el pago real difiere, corresponde una gestión individual con soporte, no modificar el precio desde el formulario.

## Eventos y destinatarios

La entrega depende de SMTP. Los avisos de solicitud directa, primera cotización, revisión de comprobante, transferencia rechazada y recibo de transferencia aprobada se encolan en `NotificationOutbox` en la misma transacción que su cambio de estado. Un worker reintenta fallos transitorios (hasta ocho intentos) y conserva los fallos agotados para investigación. El envío es **al menos una vez**, nunca exactamente una vez. El resto de correos continúa con entrega de mejor esfuerzo; un fallo no revierte la operación. No incluir datos de contacto, dirección, descripción ni precio del trabajo en alertas que no requieren esos datos.

| Acción | Destinatario y estado | Criterio |
| --- | --- | --- |
| Registro y recuperación de contraseña | Titular; implementados | Verificación y seguridad; no sujetos a preferencias opcionales. |
| Solicitud directa a un perfil | Profesional destinatario verificado; outbox con reintentos, respeta `notif-new-jobs` | Una alerta por solicitud creada, sin datos privados del cliente ni acceso al contacto sin pago. |
| Publicación en mercado | No se envía correo masivo a profesionales | Requiere definir elegibilidad, frecuencia/resumen, límites de volumen y respeto de `notif-new-jobs` antes de habilitarlo. La publicación ya aparece en el panel. |
| Primera cotización a una solicitud | Cliente; outbox con reintentos, respeta `emailQuotes` | Sin contenido de la cotización en el mensaje. Editar una cotización no reenvía aviso. |
| Comprobante recibido | Revisores autorizados de pagos; outbox con reintentos | Un aviso por revisor autorizado, sin adjuntar comprobante; revalida permiso al enviar. |
| Transferencia aprobada | Profesional pagador; recibo en outbox con reintentos | No depende de preferencias opcionales; contacto disponible en panel. |
| Cierre de cuenta | Titular de la cuenta cliente o profesional; implementado | Al correo anterior al cierre, sin contraseña ni datos de terceros; aviso de seguridad. |
| Comprobante de transferencia rechazado | Profesional pagador; outbox con reintentos | Sin comprobante ni datos bancarios en el mensaje; el motivo está en su panel. |
| Pago no asignable o confirmado por otros métodos | Profesional afectado; **pendiente** | Requiere resolución operativa, notificación y, cuando corresponda, devolución; no prometer contacto automáticamente. |
| Cotización aceptada/rechazada, cancelación o finalización de solicitud | Participantes afectados; **pendiente** | Valorar correo transaccional solo para quienes intervienen, con reglas anti-duplicados y estado persistido; notificar cancelación a compradores puede ser importante. |
| Boletines y promociones | **No habilitados** | Registrar una preferencia no autoriza por sí solo el envío; definir base jurídica y mecanismo de baja antes de activarlos. |

Los fallos agotados aparecen en Administración → Correos fallidos (`settings.manage`), con reintento manual auditado; primero hay que corregir SMTP y asumir el riesgo de duplicados. Pendiente antes de prometer cobertura integral: migrar cierres de cuenta e invitaciones administrativas a la cola cuando se defina su tratamiento de privacidad y probar SMTP de extremo a extremo. Los correos con códigos y tokens de seguridad son independientes y deben respetar su vencimiento. Los ajustes `emailMessages` y `notif-client-msgs` están guardados, pero no existe todavía un flujo de chat que utilice esos avisos.
