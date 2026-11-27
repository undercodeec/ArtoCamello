# Matriz técnica de correos (revisión de código)

## Precio de desbloqueo y comprobante

El cliente introduce un **presupuesto estimado para el trabajo**, no el importe que el profesional paga por el contacto. El servidor calcula el precio de desbloqueo como `máximo(presupuesto × porcentaje, mínimo)` y lo redondea a centavos: por defecto 6 % y USD 3 de mínimo; estos parámetros se pueden cambiar por tenant desde Administración. Por ejemplo, un presupuesto de USD 50 produce USD 3 y uno de USD 100 produce USD 6. La intención de pago almacena ese monto y el comprobante debe declarar exactamente el mismo importe; si el pago real difiere, corresponde una gestión individual con soporte, no modificar el precio desde el formulario.

## Eventos y destinatarios

La entrega depende de SMTP. Los avisos de solicitudes, cotizaciones y cierres son **intentos posteriores al cambio de estado**: un fallo de correo no revierte la operación y no existe todavía cola de reintentos ni registro fiable de entrega. No incluir datos de contacto, dirección, descripción ni precio del trabajo en alertas que no requieren esos datos.

| Acción | Destinatario y estado | Criterio |
| --- | --- | --- |
| Registro y recuperación de contraseña | Titular; implementados | Verificación y seguridad; no sujetos a preferencias opcionales. |
| Solicitud directa a un perfil | Profesional destinatario verificado; implementado, respeta `notif-new-jobs` | Una alerta por solicitud creada, sin datos privados del cliente ni acceso al contacto sin pago. |
| Publicación en mercado | No se envía correo masivo a profesionales | Requiere definir elegibilidad, frecuencia/resumen, límites de volumen y respeto de `notif-new-jobs` antes de habilitarlo. La publicación ya aparece en el panel. |
| Primera cotización a una solicitud | Cliente; implementado, respeta `emailQuotes` | Sin contenido de la cotización en el mensaje. Editar una cotización no reenvía aviso. |
| Comprobante recibido | Revisores autorizados de pagos; implementado | Aviso interno para revisión, sin adjuntar comprobante. |
| Transferencia aprobada | Profesional pagador; recibo implementado | No depende de preferencias opcionales; contacto disponible en panel. |
| Cierre de cuenta | Titular de la cuenta cliente o profesional; implementado | Al correo anterior al cierre, sin contraseña ni datos de terceros; aviso de seguridad. |
| Comprobante rechazado, pago no asignable o confirmado por otros métodos | Profesional afectado; **pendiente** | Prioritario: requiere integrar todos los estados de pago y garantizar que la notificación no revele información de terceros. |
| Cotización aceptada/rechazada, cancelación o finalización de solicitud | Participantes afectados; **pendiente** | Valorar correo transaccional solo para quienes intervienen, con reglas anti-duplicados y estado persistido; notificar cancelación a compradores puede ser importante. |
| Boletines y promociones | **No habilitados** | Registrar una preferencia no autoriza por sí solo el envío; definir base jurídica y mecanismo de baja antes de activarlos. |

Pendiente antes de prometer entrega garantizada: cola durable, reintentos controlados, monitorización y pruebas de extremo a extremo con servidor SMTP de pruebas. Los ajustes `emailMessages` y `notif-client-msgs` están guardados, pero no existe todavía un flujo de chat que utilice esos avisos.
