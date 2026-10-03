# Guía para Claude en este repositorio

## Mantener la documentación al día (importante)

Siempre que hagas y publiques un cambio que modifique funcionalidad, comportamiento, portales, módulos, flujo de despliegue o configuración, **actualiza en el mismo cambio**:

- `README.md` — documentación técnica del proyecto (portales, módulos, relay, seguridad, pruebas, despliegue).
- `ABOUT.md` — resumen del proyecto y sus novedades recientes.

Reglas:
- Que ambos reflejen el estado real tras el cambio (URLs, lista de portales/módulos, características). No dejes datos viejos.
- Añade las novedades relevantes a la sección de novedades de `ABOUT.md`.
- No hace falta documentar refactors internos sin efecto visible, pero sí cualquier cosa que cambie lo que ve o hace el usuario.

## Convenciones del proyecto

- Responder al usuario siempre en español.
- Publicar cada cambio automáticamente: PR en borrador → listo → squash-merge → verificar despliegue.
- No manejar credenciales de clientes en texto plano ni iniciar sesión en sus cuentas: van cifradas en el navegador con la contraseña del usuario.
- No romper el auto-llenado de la tarjeta de códigos DGII ni cambiar la parte del token de OpenAI.
- El relay debe hacer que los portales funcionen sin extensiones de navegador.
- Rama de trabajo de esta línea: `claude/upbeat-gauss-qugoox` (reiniciar desde `main` tras cada merge).

## Hook de aviso de documentación

El repo incluye un hook `pre-commit` versionado que **avisa** (sin bloquear)
cuando confirmas cambios de código (`public/`, `lib/`, `api/`, `worker.js`,
`supabase/`) sin incluir `README.md` ni `ABOUT.md`. Para activarlo en tu clon:

```bash
bash scripts/install-hooks.sh     # hace: git config core.hooksPath scripts/hooks
```

Para desactivarlo: `git config --unset core.hooksPath`.

## Pruebas

```bash
npm run test:direct   # app Direct + relay (worker.js)
npm run test:nala     # flujo fiscal NALA
```
