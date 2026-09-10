# Llave Maestra — Bóveda de Credenciales Institucionales

Aplicación web segura para gestionar credenciales de acceso a los portales gubernamentales dominicanos: **DGII, TSS, Ministerio de Trabajo y SIRLA**.

## Acceso directo

**[Abrir Llave Maestra](https://claude.ai/code/artifact/620a4319-2420-432f-bf84-e6fcf9eba18a)**

> Requiere una cuenta en [claude.ai](https://claude.ai). Funciona desde cualquier red.

---

## Cómo empezar

### Primera vez (quien configura la bóveda)

1. Abre el enlace de arriba
2. Verás la pantalla **"Crear bóveda"** — es la primera vez que alguien entra
3. Elige una **contraseña maestra** que todo el equipo usará (mínimo 8 caracteres)
4. Confírmala y presiona **Crear bóveda**
5. Comparte la contraseña con los 10 usuarios del equipo (por un canal seguro)

### Usuarios del equipo (acceso posterior)

1. Abre el mismo enlace
2. Ingresa la contraseña maestra del equipo
3. Accedes inmediatamente a todas las credenciales del equipo

### Agentes externos (otra red)

Exactamente igual — el mismo enlace, la misma contraseña. No hay diferencia entre red interna y externa.

---

## Características

| Función | Detalle |
|---|---|
| **Instituciones** | DGII · TSS · Ministerio de Trabajo · SIRLA |
| **Sincronización** | Tiempo real — todos los usuarios ven los cambios al instante |
| **Cifrado** | AES-256-GCM en el navegador (las credenciales nunca viajan sin cifrar) |
| **Contraseña** | La clave maestra solo existe en memoria; nunca se almacena en el servidor |
| **Usuarios** | Sin límite — 10 internos + externos desde cualquier red |
| **Campos secretos** | Contraseñas y tokens ocultos por defecto; revelar al pasar el cursor |
| **Copiar** | Un clic copia cualquier campo al portapapeles |
| **Búsqueda** | Busca por institución, categoría, nombre o campo |
| **Tema** | Claro / Oscuro según el sistema o elección manual |

---

## Seguridad

```
Contraseña maestra (solo en memoria del navegador)
        │
        ▼ PBKDF2 · SHA-256 · 200 000 iteraciones + salt aleatorio
        │
        ▼ Clave AES-256-GCM
        │
        ├─ Cifra cada credencial antes de subirla a la nube
        └─ Descifra al abrirla — el servidor nunca ve texto plano
```

- El **salt** y el **verificador de contraseña** se guardan en la base de datos compartida
- Los **datos de credenciales** se guardan cifrados — ilegibles sin la contraseña maestra
- **Cerrar sesión** borra la clave de memoria; al volver hay que ingresar la contraseña de nuevo

---

## Cambiar la contraseña maestra

1. Dentro de la app, clic en **Contraseña** (pie del menú lateral)
2. Ingresa la contraseña actual y la nueva (dos veces)
3. La app re-cifra todas las credenciales con la nueva clave automáticamente
4. Informa al equipo la nueva contraseña

---

## Estructura del proyecto

```
SERP/
└── index.html   # Aplicación completa (HTML + CSS + JS en un solo archivo)
```

---

## Tecnologías

- **Web Crypto API** — cifrado AES-256-GCM nativo del navegador
- **claude.ai `db` capability** — base de datos compartida en tiempo real
- **Google Fonts** — Libre Baskerville · DM Sans · IBM Plex Mono
- Sin frameworks · Sin dependencias externas · Sin servidor propio
