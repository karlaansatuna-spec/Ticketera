# Ticketera de Visitas

Aplicación web para reservar el acceso de visitas a 6 parqueaderos. Antes de poder reservar, la persona debe ingresar su correo electrónico, que se valida contra una lista de correos autorizados. Luego elige parqueadero, día, hora de entrada y salida (la duración se calcula sola) y un código de proveedor, también validado contra una lista. Cada parqueadero admite máximo 1 visita por hora (con 6 parqueaderos, eso da un máximo de 6 personas en la misma hora). Hay un panel de administrador protegido con contraseña donde se ven todas las solicitudes y se puede enviar cada una por correo (con copia a quien la solicitó y al administrador).

Las listas (correos permitidos, códigos de proveedor, nombres de parqueaderos) y el registro de reservas viven en una **hoja de Google Sheets**, para que el personal no técnico pueda editarlas directamente como si fuera Excel.

## Cómo funciona (resumen técnico)

- **Next.js** (App Router) + Tailwind, pensado para desplegarse gratis en Vercel.
- **Google Sheets** como base de datos, mediante una cuenta de servicio de Google (sin que nadie tenga que iniciar sesión).
- **SMTP** (Nodemailer) para el envío de correos, usando la cuenta de correo que ya tiene la persona encargada (Outlook, Gmail, etc.) — sin necesitar dominio propio.
- El panel `/admin` pide una contraseña simple y guarda una cookie de sesión firmada (dura 8 horas). Cada solicitud enviada por correo queda marcada como "Enviado" para que no se pueda reenviar por accidente, y además hay un límite de envíos por ventana de tiempo como protección extra contra el envío masivo de correos.

## 1. Crear la hoja de Google Sheets

1. Crea una hoja de cálculo nueva en [sheets.google.com](https://sheets.google.com).
2. Dentro de esa hoja, crea **4 pestañas** con estos nombres **exactos** (respetando mayúsculas):
   - `Reservas`
   - `EmailsPermitidos`
   - `CodigosProveedor`
   - `Parqueaderos`
3. En cada pestaña, la primera fila debe tener estos encabezados exactos:

   **Reservas**
   `ID | CreadoEn | Email | Parqueadero | Dia | HoraEntrada | HoraSalida | DuracionHoras | CodigoProveedor | Estado | EnviadoEn`
   (esta pestaña la llena la aplicación sola, no hace falta escribir nada más ahí)

   **EmailsPermitidos**
   `Email | Nombre`

   **CodigosProveedor**
   `Codigo | Proveedor`

   **Parqueaderos**
   `Nombre` (una fila por parqueadero, hasta 6 filas con el nombre que quieras darle a cada uno)

   En la carpeta [`plantilla-hoja-calculo/`](./plantilla-hoja-calculo) de este proyecto hay un `.csv` de ejemplo para cada pestaña — puedes importarlos directamente (Archivo → Importar → Insertar nueva hoja) y luego renombrar la pestaña con el nombre exacto de la lista de arriba.

   > **Acceso automático por dominio de correo:** si quieres que cualquier persona con correo de la empresa (ej. `@tigo.com.ec`) entre sin necesidad de agregarla a `EmailsPermitidos`, configura la variable `ALLOWED_EMAIL_DOMAINS` (ver `.env.example`). La lista de `EmailsPermitidos` sigue funcionando en paralelo, para dar acceso puntual a proveedores o visitantes externos que no tengan correo de ese dominio.

4. Copia el **ID de la hoja**: es la parte de la URL entre `/d/` y `/edit`, por ejemplo:
   `https://docs.google.com/spreadsheets/d/ESTE_ES_EL_ID/edit` → guarda `ESTE_ES_EL_ID`.

## 2. Crear la cuenta de servicio de Google (para que la app pueda leer/escribir la hoja)

1. Ve a [Google Cloud Console](https://console.cloud.google.com/) y crea un proyecto nuevo (o usa uno existente).
2. En el buscador superior escribe "Google Sheets API" y presiona **Habilitar**.
3. Ve a **APIs y servicios → Credenciales → Crear credenciales → Cuenta de servicio**. Dale cualquier nombre (ej. `ticketera-visitas`) y termina el asistente (no necesitas asignarle roles de proyecto).
4. Entra a la cuenta de servicio recién creada → pestaña **Claves** → **Agregar clave → Crear clave nueva → JSON**. Se descargará un archivo `.json`.
5. Abre ese archivo. Necesitas dos valores:
   - `client_email` → esto va en la variable `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `private_key` → esto va en la variable `GOOGLE_PRIVATE_KEY` (cópialo completo, incluyendo `-----BEGIN PRIVATE KEY-----` y `-----END PRIVATE KEY-----`)
6. **Muy importante:** vuelve a tu hoja de Google Sheets, presiona **Compartir**, y comparte la hoja con el correo `client_email` del paso anterior, dándole permiso de **Editor**. Sin este paso la aplicación no podrá leer ni escribir nada.

Guarda ese `.json` en un lugar seguro (no lo subas a ningún repositorio) — es lo único que da acceso a la hoja.

## 3. Envío de correos (SMTP, sin necesitar dominio propio)

Los correos se envían usando directamente el correo que ya tiene la persona encargada (Outlook, Gmail, etc.), por SMTP. No hace falta comprar ningún dominio ni crear cuentas en servicios externos.

> Servicios como Resend o Brevo sí exigen verificar un dominio propio para enviar a destinatarios distintos al tuyo, por eso no se usan aquí.

### Si usan Outlook / Hotmail (cuenta personal)

1. Entra a [account.microsoft.com/security](https://account.microsoft.com/security) y activa la **verificación en dos pasos**.
2. Busca **"Contraseñas de aplicación"** (App passwords) y crea una nueva. Copia el código de 16 caracteres.
3. Configura:
   ```
   SMTP_HOST=smtp-mail.outlook.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=tu-correo@outlook.com   (o @hotmail.com)
   SMTP_PASS=la contraseña de aplicación de 16 caracteres
   ```

⚠️ **Importante:** Microsoft está retirando gradualmente la autenticación por contraseña en SMTP (incluidas las contraseñas de aplicación) en todas sus cuentas, incluidas las personales de Outlook/Hotmail, y algunas cuentas nuevas ya no pueden usarla. Al momento de escribir esto todavía funciona para la mayoría de cuentas existentes, pero puede dejar de funcionar sin previo aviso. Si en algún momento empieza a fallar con un error de autenticación, la alternativa más estable ahora mismo es pasar a Gmail (ver abajo) — es solo cambiar estas mismas 5 variables de entorno, no hay que tocar código.

### Si usan Microsoft 365 (correo de empresa)

Igual que arriba, pero con `SMTP_HOST=smtp.office365.com`. Ten en cuenta que muchas organizaciones ya tienen la autenticación básica SMTP desactivada por política del administrador de TI — si da error de autenticación de entrada, probablemente haya que pedirle a esa persona que la habilite para esta cuenta, o usar Gmail en su lugar.

### Alternativa más estable: Gmail

1. Activa la verificación en dos pasos en [myaccount.google.com/security](https://myaccount.google.com/security).
2. Busca **"Contraseñas de aplicación"**, créala para "Correo" y copia los 16 caracteres.
3. Configura:
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=tu-correo@gmail.com
   SMTP_PASS=la contraseña de aplicación de 16 caracteres
   ```

### Otro proveedor de correo

Cualquier proveedor con acceso SMTP funciona igual: solo necesitas el host y puerto SMTP que te dé ese proveedor (normalmente en su sección de "Configuración de cliente de correo" o similar).

## 4. Configurar las variables de entorno

Copia `.env.example` como `.env.local` y completa cada valor (ver comentarios dentro del archivo). Para generar `ADMIN_SESSION_SECRET`, ejecuta en una terminal con Node instalado:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Para probar en tu computador:

```bash
npm install
npm run dev
```

Abre `http://localhost:3000` para la ticketera y `http://localhost:3000/admin` para el panel de administrador.

## 5. Desplegar en Vercel (gratis)

1. Sube este proyecto a un repositorio de GitHub (puede ser privado).
2. En [vercel.com](https://vercel.com), **Add New → Project**, e importa ese repositorio.
3. En **Environment Variables**, agrega exactamente las mismas variables que tienes en tu `.env.local` (todas las de `.env.example`).
4. Presiona **Deploy**. Vercel te dará una URL pública (algo como `tu-proyecto.vercel.app`).
5. Cada vez que hagas `git push`, Vercel vuelve a desplegar automáticamente.

No necesitas configurar ninguna base de datos en Vercel: todo se guarda en la hoja de Google Sheets.

## Uso diario

- **Editar las listas**: cualquier persona con acceso de edición a la hoja de Google Sheets puede agregar o quitar correos en `EmailsPermitidos`, códigos en `CodigosProveedor`, o cambiar los nombres en `Parqueaderos`, directamente ahí — sin tocar código. Los cambios se reflejan de inmediato porque la app siempre lee la hoja en el momento.
- **Panel de administrador** (`/admin`): pide la contraseña definida en `ADMIN_PASSWORD`. Ahí se ven todas las solicitudes, con un botón **"Enviar solicitud"** por cada una (envía un correo a `SOLICITUD_EMAIL_TO`, con copia a quien reservó y a `ADMIN_EMAIL`). Una vez enviada, el botón queda deshabilitado y dice "Enviado" para evitar reenvíos accidentales.
- **Descargar Excel**: en el panel de administrador hay un botón "Descargar Excel" que genera un `.xlsx` con todas las solicitudes al momento, por si lo necesitas fuera de Google Sheets.
- **Cambiar la contraseña de administrador**: cambia `ADMIN_PASSWORD` en Vercel (Project Settings → Environment Variables) y vuelve a desplegar.

## Notas importantes

- **Capacidad**: cada parqueadero admite una sola visita por franja horaria (si dos horarios se cruzan, se bloquea la segunda reserva). Como hay 6 parqueaderos, en la práctica el máximo son 6 personas a la misma hora si los 6 están ocupados.
- **Protección contra envío masivo de correos**: el botón de envío solo existe dentro del panel de administrador (protegido con contraseña), cada solicitud solo se puede enviar una vez, y además hay un límite de 20 envíos cada 10 minutos como protección adicional en el servidor.
- **Zona horaria**: los horarios se guardan tal cual se ingresan (hora local de quien reserva), sin conversión de zona horaria. Si todo el personal está en la misma zona horaria esto no representa ningún problema.
- **Límites de los planes gratuitos** a tener en cuenta si el uso crece mucho: Gmail/Outlook por SMTP (alrededor de 300–500 correos/día según el proveedor, de sobra para este uso), Google Sheets API (cuotas generosas, pensadas para uso normal de una organización pequeña/mediana), Vercel (plan Hobby gratuito, pensado para proyectos no comerciales).

## Estructura del proyecto

```
app/
  page.tsx                  Flujo público: correo -> formulario de reserva
  admin/page.tsx             Panel de administrador
  api/
    check-email/             Valida el correo contra la lista
    book/                    Crea una reserva (valida todo en el servidor)
    parqueaderos/             Lista de parqueaderos
    admin/login, logout/      Autenticación del panel
    admin/reservas/           Lista de solicitudes (protegida)
    admin/send/                Envía una solicitud por correo (protegida)
    admin/export/               Descarga el Excel (protegida)
lib/
  sheets.ts                  Toda la conexión con Google Sheets
  auth.ts                    Sesión de administrador
  email.ts                   Envío por SMTP (Nodemailer)
  ratelimit.ts                Límite de envíos
  time.ts                     Cálculo de duración y validaciones de fecha/hora
plantilla-hoja-calculo/       CSVs de ejemplo para las pestañas de Google Sheets
```
