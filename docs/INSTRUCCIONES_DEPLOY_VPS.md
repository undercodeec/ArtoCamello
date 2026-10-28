# Instrucciones para Codex en el VPS: desplegar ArtoCamello

## Encargo

Actualiza el checkout de ArtoCamello desde `origin/main`, construye y publica los cambios del frontend y la API, aplica las migraciones pendientes y adapta Nginx para que el sitio público y el panel administrativo funcionen por HTTPS. El panel real debe quedar en `https://admin.artocamello.com`. Ejecuta el trabajo en el VPS y entrega un informe con las comprobaciones realizadas.

Este documento describe el repositorio **actual**: React/Vite en la raíz, API Express/Prisma en `server/` y `docker-compose.yml` con **solo PostgreSQL de desarrollo**. No intentes desplegar la API con ese Compose como si ya incluyera la aplicación o Nginx. Detecta cómo se ejecutan hoy la API, PostgreSQL y Nginx, y adapta los comandos a esa instalación.

## Condiciones antes de tocar producción

1. Identifica el checkout, la rama, el remoto y el commit esperado. El remoto debe ser `https://github.com/undercodeec/ArtoCamello.git`. No supongas rutas, nombres de servicios ni usuario de Linux.
2. Comprueba que los cambios que se quieren publicar **ya fueron confirmados y enviados a `origin/main`**. Un cambio que solo exista en el equipo de desarrollo no llegará al VPS con `git pull`; solicita el SHA faltante si no está en el remoto.
3. Si `git status --porcelain` muestra cambios en el checkout del VPS, detente y repórtalos. No uses `git reset --hard`, `git clean`, `git stash` ni sobrescribas archivos de producción para despejarlo.
4. Identifica la base de datos real, el directorio persistente de `server/private-proofs/`, el mecanismo que mantiene viva la API y los sitios activos de Nginx. Haz una copia verificable de PostgreSQL y de los comprobantes privados antes de las migraciones. Conserva también el SHA actual, el frontend publicado y los archivos de Nginx que vayas a editar.
5. Nunca muestres el contenido de `.env`, cadenas de conexión, contraseñas, claves MFA, tokens ni datos de clientes en la terminal o en el informe. No agregues secretos al repositorio.

Comandos iniciales orientativos, ejecutados desde el checkout real:

```bash
whoami
pwd
node --version
pnpm --version
git remote -v
git branch --show-current
git status --porcelain
git rev-parse HEAD
systemctl list-units --type=service --all | grep -Ei 'artocamello|node|api' || true
pm2 list 2>/dev/null || true
sudo nginx -T
```

El proyecto pide Node.js 22 o superior y pnpm 11.24.0. Revisa `systemctl`, PM2 o el método existente antes de reiniciar nada. La API usa `process.cwd()/private-proofs`, por lo que su directorio de trabajo debe seguir siendo `server/` si allí están los comprobantes actuales.

## 1. Obtener el código

Desde la raíz del checkout limpio y en `main`:

```bash
git fetch origin main
git log -1 --oneline HEAD
git log -1 --oneline origin/main
git pull --ff-only origin main
git rev-parse HEAD
```

Detente si el avance rápido falla o `origin/main` no contiene el SHA esperado. No hagas un merge improvisado en el VPS. Asegúrate de que esta misma guía esté en el commit recibido; si fue entregada por separado, úsala como instrucción sin suponer que `git pull` la traerá.

## 2. Preparar configuración y construir

Revisa las variables **por nombre y presencia**, sin imprimir valores. La API debe recibir mediante `server/.env` o su gestor de servicio los valores reales de producción. Como mínimo verifica:

```dotenv
NODE_ENV=production
PORT=3000
ADMIN_HOSTNAMES=admin.artocamello.com
ADMIN_APP_BASE_URL=https://admin.artocamello.com
APP_BASE_URL=https://artocamello.com
DATABASE_URL=<base PostgreSQL de producción>
JWT_SECRET=<secreto existente de al menos 32 caracteres>
MFA_ENCRYPTION_KEY=<clave existente de 64 caracteres hexadecimales>
```

Conserva los secretos ya usados; cambiarlos puede invalidar sesiones o hacer ilegibles datos MFA. Comprueba también la configuración SMTP, `CLAMSCAN_PATH` para comprobantes, credenciales de pago y los flags de proveedor que ya correspondan al entorno. Si falta una dependencia obligatoria para el flujo que se va a publicar, repórtala antes de declarar el despliegue completo. El host administrativo debe existir en `TenantDomain`; el seed del repositorio lo contempla, pero confirma el dato en la base real sin ejecutar el seed indiscriminadamente. Si las variables viven solo en systemd o PM2, proporciona `DATABASE_URL` a los comandos Prisma mediante el mecanismo seguro de ese gestor; no supongas que la terminal hereda el entorno del proceso y no imprimas la variable.

El frontend **debe** compilarse con la API relativa al mismo dominio. Si en la raíz existe un `.env` de desarrollo, las variables del comando siguiente deben prevalecer sobre él. Verifica el valor final del build sin mostrar secretos ni publicar el archivo `.env`:

```bash
pnpm install --frozen-lockfile
VITE_API_URL=/api \
VITE_ADMIN_URL=https://admin.artocamello.com \
VITE_PUBLIC_APP_URL=https://artocamello.com \
pnpm build
pnpm --dir server exec prisma generate
pnpm --dir server build
```

La instalación desde la raíz cubre el workspace `server/`; no hace falta instalarlo otra vez. `VITE_API_URL=/api` es imprescindible: las peticiones administrativas deben salir de `admin.artocamello.com`, porque el backend compara ese hostname con `ADMIN_HOSTNAMES`. La compilación de Vite produce `dist/` en la raíz y la de la API produce `server/dist/`.

## 3. Migraciones y API

Después de verificar y guardar las copias de PostgreSQL y `server/private-proofs/`, aplica únicamente migraciones versionadas:

```bash
pnpm --dir server exec prisma migrate status
pnpm --dir server exec prisma migrate deploy
pnpm --dir server exec prisma migrate status
```

No ejecutes `prisma migrate dev`, `prisma db push` ni `prisma:seed` como parte automática de una actualización. Si alguna migración falla, detén la publicación y diagnostica con la copia disponible; no intentes revertir tablas a ciegas.

Reinicia **solo** el proceso que realmente controla la API, usando su nombre real: `systemctl restart ...`, `pm2 reload ... --update-env` o el mecanismo existente. Confirma que ejecuta `server/dist/index.js` con directorio de trabajo `server/`, variables de producción y acceso a PostgreSQL y `private-proofs/`. La API debe ser accesible para Nginx en el puerto interno configurado, sin abrir ese puerto a Internet. Revisa estado y logs sin volcar secretos.

Este repositorio todavía no define `/api/health`. Usa una ruta existente, por ejemplo `/api/professionals`, para comprobar la API; una comprobación de `/` que devuelva 404 no demuestra una caída.

## 4. Publicar el frontend

Localiza primero el `root` efectivo de Nginx para el sitio público y para `admin.artocamello.com`. Ambos pueden servir **el mismo** `dist/` de producción: React selecciona las rutas por hostname. Publica el build en un directorio de release nuevo, verifica que contiene `index.html` y `assets/`, y cambia el enlace o la ruta activa solo cuando esté completo. Conserva el release anterior para una vuelta atrás. Si la instalación usa otro método de publicación, respétalo y documenta el destino exacto. Nunca copies `.env`, `server/private-proofs/` o archivos de PostgreSQL al directorio público.

## 5. Nginx y certificados

Inspecciona con `sudo nginx -T` los bloques existentes y los certificados disponibles. Haz copia fechada de cada archivo que cambies. No dupliques `server_name` ni reemplaces certificados que ya funcionan. Confirma DNS y conectividad de `admin.artocamello.com`; si el nombre no apunta al VPS, informa el bloqueo. Si aún no hay certificado, usa el método Certbot que ya opere en el servidor: deja primero un bloque HTTP válido, emite el certificado para el nombre real y solo entonces habilita su bloque HTTPS. Mantén la renovación existente. No actives rutas de certificado inexistentes.

En el bloque HTTPS de `admin.artocamello.com`, conserva las directivas TLS reales del VPS y adapta este núcleo. Sustituye las rutas y el puerto por los valores comprobados:

```nginx
server {
    listen 443 ssl;
    server_name admin.artocamello.com;
    root /RUTA/REAL/DEL/FRONTEND_ACTIVO;
    index index.html;

    ssl_certificate /RUTA/REAL/DEL/fullchain.pem;
    ssl_certificate_key /RUTA/REAL/DEL/privkey.pem;
    client_max_body_size 10m;

    location ^~ /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location = /demo { return 404; }
    location ^~ /demo/ { return 404; }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Mantén la ruta `/api/` completa al reenviarla: `proxy_pass` aparece **sin barra final**. Conserva `Host $host`, ya que `ADMIN_HOSTNAMES` y la resolución de tenant dependen del hostname original. Añade la misma regla `/api/` al bloque HTTPS público que sirve este frontend, conservando allí `Host $host`; en ese dominio las rutas administrativas deben responder 404. Conserva las reglas de redirección HTTP a HTTPS y el sitio público que ya existan. `api.artocamello.com` puede permanecer para clientes que lo usen, pero el frontend nuevo debe usar `/api` en su propio dominio.

Comprueba el resultado antes de recargar:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Si la validación falla, restaura el archivo de Nginx desde su copia y vuelve a ejecutar `nginx -t`; no recargues una configuración inválida.

## 6. Comprobación del despliegue

Comprueba las respuestas HTTPS sin usar `-k`, primero desde el VPS y después desde una red externa si está disponible:

```bash
curl -I https://artocamello.com/
curl -I https://admin.artocamello.com/
curl -I https://admin.artocamello.com/login
curl -I https://admin.artocamello.com/demo
curl -sS -o /dev/null -w '%{http_code}\n' https://admin.artocamello.com/api/professionals
curl -sS -o /dev/null -w '%{http_code}\n' https://artocamello.com/api/admin/me
```

Espera HTTPS válido, el panel en `/login`, `404` para `/demo`, respuesta de la API administrativa en `/api/professionals` sin `502`, y `404` para `/api/admin/me` bajo el host público. Comprueba en un navegador que el frontend carga sus recursos y que las peticiones de red van a `/api` en el **mismo** dominio, nunca a `localhost:3000`. Valida con una cuenta autorizada el acceso con código de correo y MFA y una operación de lectura del panel; no incluyas credenciales ni datos privados en el informe. Revisa el estado de migraciones y los logs de API y Nginx.

Si una verificación falla, restaura el release anterior y la configuración anterior de Nginx cuando corresponda, y revisa la compatibilidad del código anterior con las migraciones ya aplicadas. No reviertas la base de datos automáticamente. Deja claramente indicado cualquier bloqueo de DNS, TLS, secretos, permisos, datos de tenant, SMTP o escáner de comprobantes.

## Entrega

Informa el SHA desplegado, ruta del checkout, método y estado de la API, release frontend activo, archivos de Nginx modificados y sus copias, resultado de `nginx -t`, migraciones y comprobaciones HTTPS. Indica qué pruebas funcionales pudiste realizar y qué requisitos reales siguen pendientes.
