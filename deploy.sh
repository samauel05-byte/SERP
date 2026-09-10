#!/usr/bin/env bash
# deploy.sh — Instala Llave Maestra en Ubuntu 24.04 (DigitalOcean Droplet)
# Uso: sudo bash deploy.sh YOUR_DOMAIN
# Ejemplo: sudo bash deploy.sh llave.miempresa.com

set -euo pipefail

DOMAIN="${1:-}"
APP_DIR="/opt/llave-maestra"
APP_USER="llave"

if [[ -z "$DOMAIN" ]]; then
  echo "Uso: sudo bash deploy.sh tu-dominio.com"
  exit 1
fi

echo "==> [1/8] Actualizando paquetes del sistema…"
apt-get update -qq && apt-get upgrade -y -qq

echo "==> [2/8] Instalando Node.js 20 LTS…"
if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
fi
node --version && npm --version

echo "==> [3/8] Instalando PM2 y Nginx…"
npm install -g pm2 --quiet
apt-get install -y -qq nginx

echo "==> [4/8] Creando usuario de sistema '$APP_USER'…"
id -u "$APP_USER" &>/dev/null || useradd -r -s /usr/sbin/nologin -d "$APP_DIR" "$APP_USER"

echo "==> [5/8] Copiando la aplicación a $APP_DIR…"
mkdir -p "$APP_DIR"
# Copia el contenido del directorio actual (asume que el script se ejecuta desde la raíz del repo)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cp -r "$SCRIPT_DIR/server" "$APP_DIR/"
cp -r "$SCRIPT_DIR/public" "$APP_DIR/"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

echo "==> [6/8] Instalando dependencias Node…"
cd "$APP_DIR/server"
npm install --omit=dev --quiet
cd -

echo "==> [7/8] Configurando PM2 para arrancar con el sistema…"
# Crear directorio de datos
mkdir -p "$APP_DIR/server/data"
chown "$APP_USER:$APP_USER" "$APP_DIR/server/data"

cat > /etc/pm2-llave-maestra.json << JSON
{
  "apps": [{
    "name": "llave-maestra",
    "script": "$APP_DIR/server/index.js",
    "user": "$APP_USER",
    "env": {
      "NODE_ENV": "production",
      "PORT": "3000",
      "DATA_DIR": "$APP_DIR/server/data"
    },
    "restart_delay": 3000,
    "max_memory_restart": "256M",
    "log_date_format": "YYYY-MM-DD HH:mm:ss"
  }]
}
JSON

pm2 start /etc/pm2-llave-maestra.json
pm2 save
pm2 startup systemd -u root --hp /root | bash || true

echo "==> [8/8] Configurando Nginx + Let's Encrypt…"
apt-get install -y -qq certbot python3-certbot-nginx

# Escribir config temporal HTTP-only para que certbot pueda validar
cat > "/etc/nginx/sites-available/llave-maestra" << NGINX
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    root /var/www/html;
    location / { try_files \$uri \$uri/ =404; }
}
NGINX

ln -sf "/etc/nginx/sites-available/llave-maestra" "/etc/nginx/sites-enabled/llave-maestra"
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# Obtener certificado SSL
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "admin@$DOMAIN" --redirect

# Ahora escribir la config final con proxy inverso
SCRIPT_DIR_FINAL="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sed "s/YOUR_DOMAIN/$DOMAIN/g" "$SCRIPT_DIR_FINAL/nginx.conf" > "/etc/nginx/sites-available/llave-maestra"
nginx -t && systemctl reload nginx

echo ""
echo "============================================================"
echo "  Llave Maestra desplegada correctamente"
echo "  URL: https://$DOMAIN"
echo ""
echo "  Comandos útiles:"
echo "    pm2 status              — ver estado del proceso"
echo "    pm2 logs llave-maestra  — ver logs en tiempo real"
echo "    pm2 restart llave-maestra — reiniciar la app"
echo "============================================================"
