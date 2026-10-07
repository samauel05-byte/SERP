# Acerca de SERP

**SERP** es una plataforma contable multiempresa para firmas que gestionan los trámites de sus clientes en los portales dominicanos (DGII, TSS, Ministerio de Trabajo, SISALRIL, bancos, etc.). Centraliza, en un solo lugar y con las credenciales cifradas de extremo a extremo, el acceso a esos portales y las herramientas fiscales del día a día.

- **Producción:** https://app.casalabs.com.do
- **Relay de portales:** `portal-rd-relay.samauel05.workers.dev` (Cloudflare Worker)

> Este archivo y el [`README.md`](README.md) se mantienen al día con cada cambio del repositorio.

## Para qué sirve

- **Bóveda de credenciales cifradas** por empresa cliente, con auto-login a los portales del gobierno y bancos sin extensiones de navegador.
- **Flujo fiscal 606/607 (NALA)**: carga de facturas, extracción con IA, validación, auditoría, aprobación y generación del TXT y de la Herramienta de Envío oficial de la DGII.
- **Herramientas contables**: CAMI (ITBIS / IT-1), IR-2 (renta) y Estimación Fiscal.
- **Gestión de clientes** por empresa operadora, con carga masiva por Excel.

## Cómo está construido

| Capa | Tecnología |
|------|------------|
| Frontend | HTML + CSS + JS vanilla (sin frameworks) |
| Cifrado | Web Crypto API — AES-256-GCM + PBKDF2 (en el navegador) |
| Backend | Vercel Serverless Functions (Node.js) |
| Base de datos | Supabase (PostgreSQL), acceso solo por rutas de servidor con rol de servicio |
| Relay de portales | Cloudflare Worker (`worker.js`) |
| Despliegue | Vercel (`app.casalabs.com.do`) + Cloudflare, auto-deploy desde `main` |

## Principios

- **Privacidad por diseño**: el servidor nunca ve credenciales ni nombres de empresa en texto plano; todo se cifra/descifra en el navegador con la contraseña del usuario.
- **Aislamiento multiempresa (tenant)**: cada firma solo ve sus propios datos.
- **Aislamiento por empresa en el relay**: abrir varias empresas del mismo portal no mezcla sesiones.
- **Sin extensiones**: los portales funcionan a través del relay «como un sistema normal».

## Estado y novedades recientes

- **Direct — modo aislamiento (prueba, admin)**: botón nuevo (solo administradores) que activa el aislamiento por empresa en los portales SPA para poder abrir varias empresas a la vez sin que se repita la primera. Aísla el almacenamiento (localStorage + IndexedDB) y también los canales que viven en el origen y se comparten entre pestañas (BroadcastChannel y SharedWorker por empresa; Service Worker desactivado). Apagado por defecto (el flujo lleva el prefijo `iso-` solo cuando se activa), para validarlo sin afectar el uso normal.
- **Direct — logos en favoritos y recientes**: las tarjetas de inicio (favoritos y recientes) ahora cargan el logo oficial nítido de cada portal (p. ej. la cúpula del Ministerio de Trabajo) en lugar del ícono de respaldo dibujado a mano.
- **Direct — panel de uso (admin)**: vista en vivo dentro de la app con los accesos a portales (KPIs, por día, por usuario, por portal y por hora).
- **Direct — logos de portales**: Azul usa un logo limpio sólido y Cardnet su marca oficial (la «N» rosada) servida localmente; ONAPI e IDOPPRIL usan su ícono oficial servido localmente (su wordmark raspado era blanco/invisible o no se obtenía). Así todos se ven nítidos sin depender del sitio externo.

- **NALA — 607 igual que el 606**: copiar/pegar en la Herramienta de Envío y llenado del Excel con macro, también para el 607.
- **Direct — mejoras de accesos**: favoritos y recientes, aviso de contraseña vencida, revisión de tarjetas de códigos DGII, calendario de vencimientos, historial de entradas (admin) y permisos por empresa.
- **Relay — sesión por empresa (blindaje)**: al abrir una segunda empresa del mismo portal (p. ej. Ministerio de Trabajo o SISALRIL), su sesión ya no hereda la de la primera. Además de las cookies, el `localStorage` y el `IndexedDB` separados por empresa, los portales SPA ya no usan la cookie compartida de «último flujo» (`serp_lastflow_`) ni reenvían cookies de otra pestaña cuando una petición llega sin flujo.
- **SISALRIL — panel semi-automático**: como su login con Keycloak impide el auto-login por relay, Direct guía el acceso en 2 pasos (copia correo y contraseña con un toque).

Para el detalle técnico de cada módulo y portal, ver [`README.md`](README.md) y `docs/`.
