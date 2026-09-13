# Módulo multiempresa

## Modelo de datos

`direct_tenants` representa una empresa de la plataforma. Cada registro de
`direct_profiles` pertenece a exactamente un tenant mediante `tenant_id`.
Los clientes (`direct_clients`), los archivos procesados (`direct_client_imports`)
y las credenciales cifradas (`direct_credentials`) contienen también `tenant_id`.

```
auth.users 1 ── 1 direct_profiles * ── 1 direct_tenants
direct_tenants 1 ── * direct_clients
direct_tenants 1 ── * direct_client_imports
direct_tenants 1 ── * direct_credentials
```

`client_key` es único por tenant. Se forma con RNC, cédula o nombre normalizado,
en ese orden, para evitar que el mismo cliente se registre dos veces dentro de
una empresa sin impedir que exista en otra empresa.

## Autorización

Las rutas de la aplicación validan el JWT con Supabase Auth y obtienen el
`tenant_id` exclusivamente desde `direct_profiles`; nunca aceptan el tenant en
la URL ni en el cuerpo de la solicitud. Todas las consultas y mutaciones filtran
por ese valor. Un usuario normal puede consultar los clientes de su empresa. Un
administrador de esa misma empresa puede crear usuarios, importar Excel y crear
clientes. No hay un administrador global en las rutas de negocio.

Las tablas expuestas usan RLS y no conceden permisos a `anon` ni a
`authenticated`. El navegador no recibe la clave de servicio. Las rutas de
servidor son la única capa que usa el rol de servicio y aplican el filtro de
tenant antes de cada operación. Esto evita que un cambio de identificador desde
el navegador permita leer o modificar información de otra empresa.

## Sesión única

`direct_active_sessions` conserva un identificador aleatorio por usuario. Cada
inicio de sesión lo reemplaza. Las rutas autenticadas comprueban ese identificador
en cada solicitud; cuando otra computadora inicia sesión con el mismo usuario,
la sesión anterior recibe un 401, borra su bóveda de memoria y vuelve a la pantalla
de acceso.

## Flujo de Excel

1. El usuario autenticado sin clientes aterriza en el estado vacío de Clientes.
2. Selecciona `.xlsx`, `.xls` o `.csv` de hasta 8 MB. La primera hoja debe tener
   `Nombre`, `Razón social` o `profile_name`; RNC, cédula, correo y teléfono son
   opcionales.
3. El navegador lee la hoja y el servidor vuelve a validar longitud, formato de
   RNC/cédula/correo, límite de 5,000 filas y duplicados del propio archivo.
4. El servidor consulta los `client_key` sólo del tenant autenticado, crea los
   clientes que no existían y guarda una auditoría con filas importadas,
   duplicadas e inválidas.
5. Al terminar, se actualiza el panel de Clientes. Las filas existentes no se
   sobrescriben silenciosamente.

## Activación

Aplica `supabase/migrations/202609120001_multi_tenant_clients.sql` antes de
publicar esta versión. La migración crea el tenant inicial `Save`, asocia los
perfiles y datos actuales a él y cambia las credenciales a una clave compuesta
por tenant e identificador.
