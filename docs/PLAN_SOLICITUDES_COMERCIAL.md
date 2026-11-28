# Plan: solicitudes y acceso a contactos

## Modelo y alcance

Se mantiene la publicación gratuita del cliente y la venta de acceso al contacto al profesional. El cupo de compras de una solicitud general es configurable por tenant (predeterminado: 4); una solicitud directa admite un solo profesional. Ninguno de estos cupos representa presupuestos entregados. No se prometen cantidad ni plazo de respuesta, contratación, ni pagos en depósito.

## Entregas y aceptación

1. **Expectativas del cliente.** Sustituir promesas fijas de «hasta 4» y «en pocas horas» por publicación gratuita y propuestas posibles, sin garantía. Explicar en publicación y solicitud directa que las respuestas pueden producirse fuera de la plataforma. El contador de Mis Solicitudes sigue contando solo cotizaciones registradas. Aceptación: ningún texto presenta cupos de contactos como presupuestos garantizados.
2. **Transparencia al profesional.** Antes de cada método de pago, indicar que compra acceso a datos de contacto, que el cliente podría no responder ni contratar y que debe confirmar la cobertura. Rotular `purchaseCount` como contactos desbloqueados; usar el cupo que entrega la API (incluida la solicitud directa). Corregir la FAQ acerca de créditos y alertas automáticas inexistentes. Aceptación: precio, objeto del pago y riesgo son claros sin atribuir compras a cotizaciones.
3. **Cobertura.** Usar la ciudad pública reconocida y las `serviceZones` declaradas. Para solicitudes generales, excluir del descubrimiento y de nuevas intenciones/asignaciones de pago a perfiles cuyas zonas sean inequívocamente de *otra* ciudad. Zonas sectoriales como `Quito - Norte` indican la ciudad, pero no permiten verificar el barrio exacto: avisar al comprador que confirme el sector. Si la ciudad no es reconocida, no hay zonas, o alguna zona no es interpretable, conservar la disponibilidad (no deducir ciudad desde dirección privada). Las solicitudes directas expresamente elegidas por el cliente no se excluyen por ciudad. Aceptación: los tres métodos de pago y la asignación usan la misma regla; no se filtra información privada en la vista previa.
4. **Pruebas.** Unitarias de cobertura (ciudad igual, distinta, sector, desconocida, ausencia de zonas, solicitud directa) e integración de descubrimiento y bloqueo de compra con PostgreSQL aislado; compilaciones y pruebas frontend. No hacer pruebas contra producción.

## Decisiones comerciales pendientes

Definir con negocio y asesoría legal el tratamiento de contactos inexactos/duplicados, pagos sin asignación, contracargos y posibles compensaciones o devoluciones, con plazos, evidencias, responsable y método. Hasta entonces conservar conciliación manual; no automatizar devoluciones ni modificar pagos históricos. Validar diseño y textos en móvil/escritorio y cualquier cambio en producción mediante despliegue autorizado aparte.
