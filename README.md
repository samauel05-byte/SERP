# SERP — Plataforma contable multiempresa

Sistema para equipos contables que centraliza clientes, credenciales cifradas y herramientas de trabajo para los portales dominicanos.

## Modelo multiempresa

Hay dos niveles claramente separados:

1. **Empresa operadora (tenant):** por ejemplo, `Save` o `Contadores del Este`. Cada usuario inicia sesión dentro de una sola empresa operadora.
2. **Clientes:** son las empresas que atiende esa operadora. Sus credenciales, RNC, archivos y resultados pertenecen exclusivamente a su empresa operadora.

Los módulos Direct, CAMI, NALA, IR-1 e Estimación Fiscal son funciones comunes del producto: se habilitan para cada empresa operadora contratante, pero sus consultas siempre usan el tenant del usuario autenticado. Por eso Contadores del Este nunca puede ver datos de Save, aun cuando ambos utilicen exactamente los mismos módulos.

## URL de producción

**[https://direct-save.vercel.app](https://direct-save.vercel.app)**

---

## Portales soportados

| Portal | Clave |
|--------|-------|
| DGII — Dirección General de Impuestos Internos | `dgii` |
| TSS — Tesorería de la Seguridad Social | `tss` |
| Ministerio de Trabajo | `trabajo` |
| SIRLA — IDOPPRIL | `sirla` |
| Azul | `azul` |
| Carnet — Portal de Cédula | `carnet` |

---

## Seguridad

```
Contraseña del usuario (solo en memoria del navegador)
        │
        ▼ PBKDF2 · SHA-256 · 200 000 iteraciones + salt personal
        │
        ▼ Clave de usuario (desencripta la clave de bóveda)
        │
        ▼ Secreto de bóveda (bytes aleatorios, en memoria únicamente)
        │
        ▼ PBKDF2 · SHA-256 · 200 000 iteraciones + vaultSalt global
        │
        ▼ MasterKey AES-256-GCM
        │
        ├─ Cifra cada credencial antes de subirla al servidor
        └─ Descifra al abrirla — el servidor nunca ve texto plano
```

- El servidor **nunca** recibe credenciales en texto plano
- Todo el cifrado/descifrado ocurre en el navegador (Web Crypto API)
- El secreto de bóveda existe **solo en memoria de sesión**
- Cada usuario tiene su propio salt y su copia cifrada del secreto de bóveda
- **Aislamiento multiempresa**: clientes y credenciales se consultan con el tenant del perfil autenticado
- **Sesión única por usuario**: un nuevo inicio desde otro equipo bloquea automáticamente la sesión anterior
- **RLS sin acceso directo desde navegador**: las operaciones pasan por rutas autenticadas del servidor

---

## Módulos

| Módulo | Descripción |
|--------|-------------|
| **Direct** | Bóveda de credenciales con portales gubernamentales y auto-login |
| **Cami** | Herramienta ITBIS — cálculo de IVA / facturas 606/607 |
| **NALA** | Chat IA para contabilidad dominicana |
| **Clientes** | Gestión de los clientes de la empresa operadora mediante Excel |

---

## Roles de usuario

| Rol | Permisos |
|-----|----------|
| `admin` | Gestiona usuarios, credenciales, clientes e importaciones de su propia empresa |
| `user` | Accede a los portales y datos asignados dentro de su propia empresa |

El admin puede:
- Crear y desactivar usuarios
- Asignar acceso a módulos (Direct / CAMI / NALA / IR-1 / Estimación Fiscal)
- Asignar portales individuales a cada usuario
- Restablecer la contraseña de cualquier usuario

---

## Características

- **Auto-login**: un clic envía automáticamente las credenciales al portal en una nueva pestaña
- **Cifrado AES-256-GCM** en el navegador — las credenciales viajan y se almacenan siempre cifradas
- **Multiempresa** con datos aislados por tenant, sin convertirla en un permiso visible para usuarios
- **Carga de clientes por Excel** con validación de estructura, formatos y duplicados; la importación crea o actualiza solo clientes de la empresa operadora actual
- **Sesión exclusiva**: al abrir el mismo usuario en otro equipo se bloquea la sesión anterior
- **Sincronización en tiempo real** — cualquier cambio se refleja al instante
- **Enter funciona** en todos los formularios y modales
- **Tema claro / oscuro** según preferencia del sistema o manual

---

## Estructura del proyecto

```
SERP/
├── api/
│   ├── auth/
│   │   ├── login.js       — Autenticación, sesión única y material de bóveda
│   │   └── setup.js       — Creación del primer administrador
│   ├── config.js          — Config global de la app (vaultSalt, verifier, URLs de portales)
│   ├── credentials.js     — Lectura de credenciales cifradas
│   ├── credentials/
│   │   └── [id].js        — Escritura / borrado de una credencial
│   ├── clients/           — Consulta e importación de clientes por tenant
│   └── users/
│       ├── index.js        — CRUD de usuarios (admin only)
│       └── [id].js         — Actualización de usuario / reset de clave
├── lib/
│   ├── auth.js            — Middleware de autenticación JWT
│   ├── tenant.js          — Resolución segura del tenant del perfil
│   ├── db.js              — Abstracción sobre Supabase
│   └── supabase.js        — Cliente Supabase con rol de servicio
├── public/
│   └── index.html         — App completa (HTML + CSS + JS)
└── vercel.json            — Ruteo de API y archivos estáticos
```

## Migraciones requeridas

Antes de usar Clientes o Sesión única, aplica las migraciones de `supabase/migrations/` en orden. La primera crea el tenant inicial `Save` y asocia los datos actuales; la segunda activa la sesión única por usuario.

---

## Tecnologías

- **Frontend**: HTML + CSS + JS vanilla — sin frameworks
- **Cifrado**: Web Crypto API (AES-256-GCM, PBKDF2)
- **Backend**: Vercel Serverless Functions (Node.js)
- **Base de datos**: Supabase (PostgreSQL + Auth)
- **Despliegue**: Vercel (dominio `direct-save.vercel.app`)

---

## Cuenta de administrador por defecto

| Campo | Valor |
|-------|-------|
| Usuario | `root` |
| Contraseña | *(configurada en el primer despliegue)* |

---

## Alta de una empresa nueva y carga por Excel

Cuando se vende el sistema a una firma nueva, por ejemplo `Contadores del Este`, se crea primero su **tenant** y su administrador. Ese administrador no hereda usuarios, clientes ni credenciales de Save.

Luego se sube el Excel de esa firma. El proceso valida encabezados, formatos y duplicados; crea los perfiles de sus clientes nuevos y reporta los ya existentes, dejándolos disponibles en el panel de esa firma. Una carga debe ejecutarse siempre dentro del tenant correcto: nunca desde Save para evitar mezclar carteras.

## Cómo subir información desde Excel

El script `upload-companies.mjs` lee el Excel de credenciales y las sube directamente a la bóveda cifrada:

```bash
node upload-companies.mjs
```

El script inicia sesión como admin, deriva el masterKey en local, cifra cada credencial con AES-256-GCM y hace PUT a la API. El servidor nunca ve las contraseñas en texto plano.
