# Direct Save — Bóveda de Credenciales Institucionales

Sistema web seguro para gestionar credenciales de acceso a los portales gubernamentales dominicanos. Permite a equipos de contabilidad y consultoría acceder rápidamente a los portales de sus clientes con auto-login.

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

---

## Módulos

| Módulo | Descripción |
|--------|-------------|
| **Direct** | Bóveda de credenciales con portales gubernamentales y auto-login |
| **Cami** | Herramienta ITBIS — cálculo de IVA / facturas 606/607 |
| **NALA** | Chat IA para contabilidad dominicana |

---

## Roles de usuario

| Rol | Permisos |
|-----|----------|
| `admin` | Gestión completa: usuarios, credenciales, config. |
| `user` | Acceso a los portales asignados por el admin |

El admin puede:
- Crear y desactivar usuarios
- Asignar acceso a módulos (Direct / Cami / NALA)
- Asignar portales individuales a cada usuario
- Restablecer la contraseña de cualquier usuario

---

## Características

- **Auto-login**: un clic envía automáticamente las credenciales al portal en una nueva pestaña
- **Cifrado AES-256-GCM** en el navegador — las credenciales viajan y se almacenan siempre cifradas
- **Multi-usuario** con bóveda compartida (todos ven las mismas credenciales cifradas)
- **Sincronización en tiempo real** — cualquier cambio se refleja al instante
- **Enter funciona** en todos los formularios y modales
- **Tema claro / oscuro** según preferencia del sistema o manual

---

## Estructura del proyecto

```
SERP/
├── api/
│   ├── auth/
│   │   ├── login.js       — Autenticación + entrega de material de bóveda
│   │   └── setup.js       — Creación del primer administrador
│   ├── config.js          — Config global de la app (vaultSalt, verifier, URLs de portales)
│   ├── credentials.js     — Lectura de credenciales cifradas
│   ├── credentials/
│   │   └── [id].js        — Escritura / borrado de una credencial
│   └── users/
│       ├── index.js        — CRUD de usuarios (admin only)
│       └── [id].js         — Actualización de usuario / reset de clave
├── lib/
│   ├── auth.js            — Middleware de autenticación JWT
│   ├── db.js              — Abstracción sobre Supabase
│   └── supabase.js        — Cliente Supabase con rol de servicio
├── public/
│   └── index.html         — App completa (HTML + CSS + JS)
└── vercel.json            — Ruteo de API y archivos estáticos
```

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

## Cómo subir empresas desde Excel

El script `upload-companies.mjs` lee el Excel de credenciales y las sube directamente a la bóveda cifrada:

```bash
node upload-companies.mjs
```

El script inicia sesión como admin, deriva el masterKey en local, cifra cada credencial con AES-256-GCM y hace PUT a la API. El servidor nunca ve las contraseñas en texto plano.
