# Tarjeta con Kushki (integración preparada, apagada por defecto)

Kushki es el proveedor **provisional** para la fase de tarjeta. Su [checkout alojado para Ecuador](https://docs.kushki.com/ec/payment-forms-and-buttons/payment-button/overview/) acepta USD y tarjetas; sus [webhooks documentan firma HMAC](https://docs.kushki.com/cl/notifications/overview/). PayPhone continúa disponible en el flujo anterior, pero su [Notificación Externa](https://docs.payphone.app/notificacion-externa) no describe una firma verificable y requiere autorización comercial. La elección contractual final corresponde al negocio.

El código incluye `KushkiCardProvider`, creación de checkout, `POST /api/webhooks/kushki/:tenantId`, conciliación mediante Analytics, idempotencia y el mismo `allocateLead` transaccional que usan otros métodos. El navegador nunca recibe la llave privada ni envía números de tarjeta a ArtoCamello. La tarjeta solo aparece cuando coinciden el interruptor global, la configuración secreta del tenant y `cardEnabled` en `/admin/settings`.

## Configuración por tenant

Guarda la configuración fuera del repositorio. Ejemplo de estructura para `KUSHKI_CONFIG_JSON` (valores ficticios):

```json
{
  "artocamello": {
    "merchantId": "id-publico-del-comercio",
    "privateMerchantId": "llave-privada",
    "webhookSecret": "id-de-firma-de-webhooks",
    "environment": "uat",
    "webhookAmountUnit": "cents"
  }
}
```

Para las pruebas en UAT, configura `KUSHKI_CARD_ENABLED=true` solo en ese entorno y activa `cardEnabled` en su tenant de prueba. Mantén ambos interruptores apagados en producción hasta completar la lista siguiente. En producción, `environment` debe ser `production`. `webhookAmountUnit` debe fijarse tras observar un webhook sandbox real: `cents` si los importes llegan en centavos o `major` si llegan en USD con decimales. El servidor rechaza una notificación cuyo monto no coincida exactamente con el pago esperado. La documentación de checkout usa USD decimales, mientras los ejemplos de webhook muestran importes enteros; por eso este punto requiere verificación real.

Solicita a Kushki la habilitación del Payment Button y Analytics para el comercio. En su consola, configura el atributo adicional `artocamelloPayment` para que el valor enviado en `additionalInformation` regrese en `metadata` del webhook. Configura el webhook de tarjeta para `https://TU_DOMINIO/api/webhooks/kushki/artocamello` y copia el ID de firma al secreto del tenant. En otros tenants usa su ID, dominio y credenciales propios.

## Pruebas necesarias antes de activar

1. Verifica en UAT la creación de checkout y el retorno del navegador. El retorno no desbloquea el contacto.
2. Ejecuta pago aprobado, declinado, reintento dentro del checkout y expiración. Confirma la unidad monetaria y que `metadata.artocamelloPayment` y `smartLink` lleguen en el webhook.
3. Repite el mismo webhook, altera firma, fecha, monto, moneda, comercio y tenant. Solo un evento aprobado y válido puede generar una asignación.
4. Prueba `/admin/payments/cards/:id/reconcile` con Analytics cuando se pierda el webhook. Verifica que el reporte incluya `metadata.artocamelloPayment`; si no lo incluye, la conciliación automática no funcionará y la tarjeta debe seguir apagada.
5. Prueba un pago aprobado cuando el cupo del lead ya se agotó. El pago quedará en estado `approved` para resolución manual; el dashboard lo muestra como tarjeta por resolver. Gestiona el reintegro en la consola del proveedor según la política comercial.
6. Ejecuta la conciliación sobre una copia de datos reales y documenta liquidación, contracargos, retención y respuesta a incidentes.

Las pruebas del repositorio simulan el API y los webhooks. No se hizo ninguna transacción sandbox ni existe una cuenta Kushki configurada en este entorno.
