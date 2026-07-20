#!/usr/bin/env bash
set -euo pipefail

DOMAIN_OR_IP="${1:-180.93.0.87}"
APP_DIR="/var/www/hd-manager"
RELEASE_ID="$(date +%Y%m%d%H%M%S)"
RELEASE_DIR="${APP_DIR}/releases/${RELEASE_ID}"
DIST_ZIP="/tmp/hd-manager-dist.zip"
NGINX_TEMPLATE="/tmp/hd-manager.conf.template"
NGINX_SITE="/etc/nginx/sites-available/hd-manager"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Hay chay script bang sudo/root."
  exit 1
fi

apt-get update
apt-get install -y nginx unzip curl ca-certificates ufw certbot python3-certbot-nginx

if [[ ! -f "${DIST_ZIP}" ]]; then
  echo "Khong tim thay ${DIST_ZIP}. Hay upload file build zip truoc."
  exit 1
fi

mkdir -p "${RELEASE_DIR}"
unzip -oq "${DIST_ZIP}" -d "${RELEASE_DIR}"

if [[ -d "${RELEASE_DIR}/dist" ]]; then
  shopt -s dotglob
  mv "${RELEASE_DIR}/dist/"* "${RELEASE_DIR}/"
  rmdir "${RELEASE_DIR}/dist"
  shopt -u dotglob
fi

ln -sfn "${RELEASE_DIR}" "${APP_DIR}/current"

if [[ ! -f "${NGINX_TEMPLATE}" ]]; then
  echo "Khong tim thay ${NGINX_TEMPLATE}."
  exit 1
fi

sed "s/__DOMAIN_OR_IP__/${DOMAIN_OR_IP}/g" "${NGINX_TEMPLATE}" > "${NGINX_SITE}"
ln -sfn "${NGINX_SITE}" /etc/nginx/sites-enabled/hd-manager
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl enable nginx
systemctl reload nginx

ufw allow OpenSSH || true
ufw allow 'Nginx Full' || true

echo "HD Manager da duoc cai tai http://${DOMAIN_OR_IP}"
echo "Neu da tro domain ve VPS, hay chay SSL:"
echo "  certbot --nginx -d ${DOMAIN_OR_IP}"
echo "Sau do dat SePay webhook: https://${DOMAIN_OR_IP}/webhooks/sepay"
