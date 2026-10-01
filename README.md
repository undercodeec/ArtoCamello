# ArtoCamello — Marketplace de Servicios Profesionales

Marketplace que conecta clientes con profesionales locales a través de un sistema de solicitudes, compra de contacto con créditos, presupuestos y reseñas.

## Stack Tecnológico

- **React 18** + **TypeScript**
- **Vite 6** (con plugin custom para assets Figma)
- **Tailwind CSS v4** (via `@tailwindcss/vite`)
- **React Router v7**
- **Framer Motion** (via `motion`)
- **lucide-react** para iconografía
- **Radix UI** + **shadcn/ui** como sistema de componentes base

## Cómo Ejecutar

El proyecto usa **pnpm 11.24.0** y Node.js 22 o posterior. Activa Corepack si tu entorno no selecciona automáticamente la versión indicada en `packageManager`.

```bash
# Instalar dependencias
pnpm install

# Servidor de desarrollo
pnpm dev

# Build de producción
pnpm build

# Preview del build
pnpm preview
```

## Estructura del Proyecto

```
src/
├── domain/                    # Modelo de dominio
│   ├── types.ts               # Entidades, enums, interfaces
│   └── constants.ts           # Constantes de negocio (MAX_PROS=4)
│
├── mocks/                     # Datos semilla y persistencia mock
│   └── db.ts                  # Base de datos simulada (localStorage)
│
├── services/                  # Capa de servicios (contratos para backend)
│   ├── authService.ts         # Login, registro, logout
│   ├── requestService.ts      # CRUD de solicitudes
│   ├── leadService.ts         # Compra de contacto / desbloqueo de lead
│   ├── quoteService.ts        # Presupuestos
│   ├── walletService.ts       # Billetera y recargas
│   ├── reviewService.ts       # Reseñas
│   └── categoryService.ts     # Categorías de servicio
│
├── shared/                    # Utilidades compartidas
│   ├── context/
│   │   └── AuthContext.tsx     # Estado global de autenticación
│   └── components/
│       └── RouteGuard.tsx      # Protección de rutas por rol
│
├── app/                       # Aplicación principal
│   ├── App.tsx                # Entry point con AuthProvider
│   ├── routes.tsx             # Definición de rutas
│   └── components/            # Componentes de página
│       ├── Hero.tsx           # Hero landing cliente
│       ├── HomePage.tsx       # Página principal
│       ├── ProPage.tsx        # Landing profesional
│       ├── MyRequestsPage.tsx # Solicitudes del cliente
│       ├── Header.tsx         # Navegación global
│       ├── Footer.tsx         # Footer
│       ├── SignUpModal.tsx    # Modal de registro/login
│       ├── OnboardingPage.tsx # Onboarding profesional
│       ├── dashboard/         # Dashboard profesional
│       │   ├── ProDashboardLayout.tsx
│       │   ├── DashboardHome.tsx
│       │   ├── ExploreJobs.tsx
│       │   ├── MyContacts.tsx
│       │   ├── WalletBilling.tsx
│       │   └── ProProfileSettings.tsx
│       ├── figma/             # Componentes de Figma
│       └── ui/                # shadcn/ui primitives
│
├── assets/                    # Imágenes PNG exportadas de Figma
├── imports/                   # Frames/SVGs exportados de Figma
├── styles/                    # CSS global
└── vite-env.d.ts              # Type declarations
```

## Modelo de Dominio

### Entidades principales:
| Entidad | Descripción |
|---|---|
| **User** | Usuario base con rol (client/pro/guest) |
| **ClientProfile** | Perfil del cliente (direcciones, preferencias) |
| **ProfessionalProfile** | Perfil público del profesional |
| **ServiceCategory** | Categoría de servicio (10 categorías seed) |
| **ServiceRequest** | Solicitud de trabajo del cliente |
| **LeadPurchase** | Registro de compra de contacto |
| **Quote** | Presupuesto enviado por profesional |
| **Review** | Reseña del cliente al profesional |
| **Wallet** | Saldo de créditos del profesional |
| **WalletTransaction** | Historial de recargas y gastos |
| **CreditPackage** | Paquetes de recarga disponibles |
| **Notification** | Notificaciones del sistema |

### Estados de solicitud:
`draft` → `submitted` → `matching` → `contact_limit_open` → `quotes_received` → `hired` → `completed`

### Regla crítica:
> **Máximo 4 profesionales** pueden comprar el contacto de una misma solicitud.

## Rutas

| Ruta | Rol | Descripción |
|---|---|---|
| `/` | Público | Landing cliente |
| `/pro` | Público | Landing profesional |
| `/mis-solicitudes` | Cliente | Mis solicitudes con comparación de presupuestos |
| `/mi-perfil` | Cliente | Perfil del cliente |
| `/onboarding` | Público | Onboarding profesional |
| `/dashboard` | Profesional | Resumen del negocio |
| `/dashboard/jobs` | Profesional | Explorar y desbloquear trabajos |
| `/dashboard/contacts` | Profesional | Contactos comprados |
| `/dashboard/wallet` | Profesional | Billetera y facturación |
| `/dashboard/profile` | Profesional | Perfil público editable |

## Credenciales Demo

| Rol | Email | Contraseña |
|---|---|---|
| Cliente | `cliente@artocamello.com` | `password123` |
| Profesional | `pro@artocamello.com` | `password123` |

## Administración y pagos

El panel está en `https://admin.artocamello.com`; el sitio público no publica rutas administrativas. La API administrativa usa membresías por tenant, permisos por operación, MFA TOTP y auditoría. Los profesionales pueden pagar por PayPhone o enviar una transferencia que desbloquea el contacto después de la aprobación.

Para producción, cree el DNS de `admin.artocamello.com` hacia el frontend, incluya ese host en `ADMIN_HOSTNAMES=admin.artocamello.com` y `ADMIN_APP_BASE_URL=https://admin.artocamello.com` en el API, y emita su certificado TLS. El mismo host debe existir en `TenantDomain` para resolver el tenant; el `seed` ya lo registra para ArtoCamello. Configure `VITE_ADMIN_URL` y `VITE_PUBLIC_APP_URL` antes de construir el frontend. En local puede usar `http://admin.localhost:5173` con `VITE_ADMIN_URL` y `ADMIN_APP_BASE_URL`, y ejecutar el API sin `ADMIN_HOSTNAMES`.

Consulta [ADMIN_OPERACION.md](ADMIN_OPERACION.md) para migraciones, roles, cuenta inicial, configuración bancaria y conciliación. La integración provisional de tarjeta con Kushki y sus requisitos de activación están en [server/docs/CARD_PROVIDER.md](server/docs/CARD_PROVIDER.md). Los pasos pendientes antes de producción están en [server/docs/PRODUCTION_CHECKLIST.md](server/docs/PRODUCTION_CHECKLIST.md).

## Otros pendientes

- Procedimiento operativo de recuperación MFA, escáner de comprobantes y retención de datos antes de producción.
- Contrato, credenciales y pruebas sandbox reales del proveedor de tarjeta antes de activarla.
- Notificaciones push, carga de imágenes de perfil y búsqueda geográfica.
- Chat entre cliente y profesional y facturación electrónica SRI.
