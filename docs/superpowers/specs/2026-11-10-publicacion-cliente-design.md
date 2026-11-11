# Publicación de necesidades por clientes: investigación y diseño

Fecha: 2026-11-10. Alcance: flujo actual de React, API Express y modelo Prisma.

## Estado actual

El sitio público lleva de la búsqueda a perfiles de profesionales (`Hero.tsx`, `SearchResultsPage.tsx`, `ProProfilePage.tsx`). La única interfaz que llama `createServiceRequest` está en el perfil profesional. El backend ya puede crear solicitudes sin destinatario con `POST /api/requests`, listarlas al cliente con `GET /api/requests/client` y ofrecerlas por categoría a profesionales con `GET /api/requests/available`. El profesional las ve en `ExploreJobs.tsx` y `MyContacts.tsx`, paga para desbloquear el contacto y remite una cotización. `MyRequestsPage.tsx` permite al cliente consultar, cancelar, aceptar y completar. Falta una pantalla para que el cliente publique una necesidad general por iniciativa propia; también faltan edición y estados claros de publicación.

## Objetivo y recorrido propuesto

Un cliente autenticado publica una necesidad de servicio desde `/publicar-servicio`, sin elegir un profesional. El formulario pide categoría válida, título, descripción, ciudad, dirección privada, urgencia, fecha opcional, presupuesto estimado mayor que cero y contacto. Tras publicar, ve la solicitud en `/mis-solicitudes`. Los profesionales activos y habilitados del mismo tenant y categoría ven una vista previa; pueden pagar el precio del contacto bajo las reglas actuales, ver los datos privados al confirmarse el pago y enviar una cotización. El cliente compara y acepta una; puede cancelar una solicitud abierta o marcar como completada una contratada.

Para una primera entrega, la edición queda permitida mientras no haya ningún contacto pagado **ni una intención de pago activa**; después, el cliente cancela y crea otra solicitud para cambios sustanciales. Así no se cambia una oferta mientras alguien paga o después de que pagó por verla. El cliente puede guardar un borrador local en el navegador, pero la publicación es una operación explícita en la API. El servidor es autoridad sobre estado, cupos, precio de contacto y permisos. No se añade chat ni cobro del trabajo entre cliente y profesional.

## Alternativas y dependencias

Reutilizar el endpoint y la entidad existentes con `visibility=marketplace` minimiza cambios e integra pagos y cotizaciones. Crear una segunda entidad de anuncios duplicaría reglas de cupos y pagos. Convertir la búsqueda actual en publicación automática produciría solicitudes incompletas; se propone un botón claro junto a la búsqueda y en el área del cliente.

Este trabajo depende de la distinción `direct`/`marketplace`, la privacidad de vistas previas y la corrección de autenticación de cotizaciones del plan de seguridad. El formulario de publicación debe enviar `visibility=marketplace`; el servidor lo impone y rechaza `targetProfessionalUserId` para esta clase.

## Criterios de aceptación

- Un visitante ve la invitación a publicar, inicia sesión o se registra y vuelve al formulario sin perder el contexto introducido en esa sesión.
- Solo un cliente puede publicar, editar lo permitido, cancelar y consultar sus propias solicitudes. Otro cliente recibe 403/404 sin datos.
- Un profesional de categoría y tenant correctos ve la publicación con ubicación aproximada; otros roles, categorías o tenants no la ven.
- La ficha del profesional muestra si la solicitud fue dirigida; la ficha de la publicación general indica que compiten varios profesionales y que el contacto se desbloquea tras el pago.
- El formulario muestra validación accesible y errores de API; un doble clic no crea dos publicaciones. La API cubre duplicados con clave de idempotencia.
- Borradores y publicaciones se distinguen visualmente; cancelar impide nuevas compras y cotizaciones; aceptar presupuestos respeta el estado actual.
