#!/bin/bash
# Service Desk — Ubuntu deployment script
#
#   bash deploy.sh setup     first-time: install Node/MySQL/NGINX/PM2, create dirs
#   bash deploy.sh dbsetup   create the database schema + admin user (run once)
#   bash deploy.sh deploy    build + (re)start the app  — also used for updates
#   bash deploy.sh restart   restart API + NGINX
#   bash deploy.sh status    show what's running
#
# Typical first run:  setup → configure MySQL → create backend/.env → dbsetup → deploy

set -euo pipefail

# ─── Configuration ─────────────────────────────────────────────────────────
APP_DIR="${APP_DIR:-/var/www/servicedesk}"
REPO_URL="${REPO_URL:-https://github.com/XxDarknytxX/Service-Desk.git}"
BRANCH="${BRANCH:-main}"
NODE_MAJOR=20
# Public address this server is reached on. Only used to put the right IP in the
# self-signed certificate's SAN field, so browsers match it to the URL bar.
PUBLIC_IP="${PUBLIC_IP:-27.123.188.86}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()   { echo -e "${GREEN}[DEPLOY]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# ─── FIRST-TIME SERVER SETUP ───────────────────────────────────────────────
setup() {
    log "First-time server setup..."
    sudo apt update && sudo apt upgrade -y
    sudo apt install -y git curl ca-certificates

    if ! command -v node &> /dev/null; then
        log "Installing Node.js ${NODE_MAJOR}..."
        curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash -
        sudo apt install -y nodejs
    fi
    log "Node.js: $(node -v), npm: $(npm -v)"

    command -v pm2   &> /dev/null || { log "Installing PM2...";   sudo npm install -g pm2; }
    command -v nginx &> /dev/null || { log "Installing NGINX..."; sudo apt install -y nginx; }

    if ! command -v mysql &> /dev/null; then
        log "Installing MySQL..."
        sudo apt install -y mysql-server
        sudo systemctl enable --now mysql
        warn "Run 'sudo mysql_secure_installation' to set a root password and harden MySQL."
    fi

    # App directory, owned by the deploying user so git/npm don't need sudo.
    sudo mkdir -p "$APP_DIR"
    sudo chown -R "$USER":"$USER" "$APP_DIR"

    # Clone if this is a bare first run.
    if [ ! -d "$APP_DIR/.git" ]; then
        log "Cloning $REPO_URL ..."
        git clone -b "$BRANCH" "$REPO_URL" "$APP_DIR"
    fi

    mkdir -p "$APP_DIR/backend/logs"

    # NGINX (www-data) must be able to traverse into the build directory.
    chmod o+rx "$APP_DIR" 2>/dev/null || true

    # Open the firewall for HTTP + HTTPS if ufw is active ("Full" covers 80+443).
    if command -v ufw &> /dev/null && sudo ufw status | grep -q "Status: active"; then
        sudo ufw allow 'Nginx Full' || true
    fi

    cat <<EOF

Setup complete. Next:

  1) Create the database and a MySQL user — run 'sudo mysql' and paste:

     CREATE DATABASE IF NOT EXISTS service_desk
       CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
     CREATE USER IF NOT EXISTS 'servicedesk'@'localhost'
       IDENTIFIED BY 'CHOOSE_A_STRONG_PASSWORD';
     GRANT ALL PRIVILEGES ON service_desk.* TO 'servicedesk'@'localhost';
     FLUSH PRIVILEGES;

  2) Create the backend environment file:

     cp $APP_DIR/backend/.env.example $APP_DIR/backend/.env
     nano $APP_DIR/backend/.env

     Set at minimum:
       DATABASE_HOST=localhost
       DATABASE_USER=servicedesk
       DATABASE_PASSWORD=the password you chose above
       DATABASE_NAME=service_desk
       JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || echo "run: openssl rand -hex 32")
       NODE_ENV=production
       PORT=5000

  3) bash deploy.sh dbsetup      # creates all tables + the admin user
  4) bash deploy.sh deploy       # builds the frontend and starts everything

EOF
}

# ─── DATABASE SCHEMA ───────────────────────────────────────────────────────
# Idempotent: safe to re-run. Add --with-seed for demo teams/users/templates.
dbsetup() {
    [ -f "$APP_DIR/backend/.env" ] || error "backend/.env not found. Copy .env.example and configure it first."
    log "Installing backend dependencies (needed by the bootstrap)..."
    cd "$APP_DIR/backend"
    npm ci --omit=dev
    log "Creating schema + admin user..."
    node src/config/bootstrap-fresh.js "$@"
}

# ─── DEPLOY / UPDATE ───────────────────────────────────────────────────────
deploy() {
    log "Deploying..."
    cd "$APP_DIR"

    [ -d ".git" ] || error "No git repo at $APP_DIR — run 'bash deploy.sh setup' first."
    [ -f "backend/.env" ] || error "backend/.env not found. Copy backend/.env.example and configure it."

    log "Pulling latest code ($BRANCH)..."
    local before_hash after_hash
    before_hash=$(sha256sum "$APP_DIR/deploy.sh" | awk '{print $1}')
    git pull origin "$BRANCH"
    after_hash=$(sha256sum "$APP_DIR/deploy.sh" | awk '{print $1}')

    # If the pull updated THIS script, the running bash process is still executing
    # the version it parsed at startup, while every other file on disk (nginx.conf,
    # migrations) is already the new one. That mismatch silently skips new steps —
    # it's how a deploy once installed a TLS-enabled nginx.conf without running the
    # certificate generation that shipped alongside it. Re-exec so both halves match.
    if [ "$before_hash" != "$after_hash" ] && [ -z "${SD_REEXECED:-}" ]; then
        log "deploy.sh changed in this pull — restarting with the updated script..."
        SD_REEXECED=1 exec bash "$APP_DIR/deploy.sh" deploy
    fi

    log "Installing backend dependencies..."
    ( cd backend && npm ci --omit=dev )

    # Migrations are idempotent, so this doubles as the upgrade path: a deploy
    # that adds a new table/column applies it here automatically.
    log "Applying database migrations..."
    ( cd backend && node src/config/bootstrap-fresh.js ) \
        || warn "Bootstrap reported an issue — check the output above."

    log "Building frontend..."
    ( cd frontend && npm ci && npm run build )
    [ -d "frontend/build" ] || error "Frontend build missing — expected frontend/build."

    # TLS certificate must exist before nginx reloads, or it refuses to start.
    # Self-signed because a public CA can't issue for a bare IP — replace with
    # certbot once a domain points here (see the notes in nginx.conf).
    if [ ! -f /etc/nginx/ssl/servicedesk-selfsigned.crt ]; then
        log "Generating self-signed TLS certificate..."
        sudo mkdir -p /etc/nginx/ssl
        local ips san
        # Include every address the app is reached on in the SAN field; modern
        # browsers ignore the legacy CN and validate against SAN only.
        # `|| true`: with `set -euo pipefail`, grep matching nothing would fail the
        # pipeline and abort the deploy. An empty list is fine — the SAN below
        # still covers localhost and the public IP.
        ips=$(hostname -I 2>/dev/null | tr ' ' '\n' | grep -E '^[0-9.]+$' | sed 's/^/IP:/' | paste -sd, - || true)
        san="DNS:localhost,IP:127.0.0.1${PUBLIC_IP:+,IP:$PUBLIC_IP}${ips:+,$ips}"
        sudo openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
            -keyout /etc/nginx/ssl/servicedesk-selfsigned.key \
            -out    /etc/nginx/ssl/servicedesk-selfsigned.crt \
            -subj "/O=Service Desk/CN=${PUBLIC_IP:-servicedesk}" \
            -addext "subjectAltName=${san}" 2>/dev/null \
            || error "Failed to generate the self-signed certificate."
        sudo chmod 600 /etc/nginx/ssl/servicedesk-selfsigned.key
        log "Certificate created (SAN: ${san})"
    fi

    log "Configuring NGINX..."
    sudo cp "$APP_DIR/nginx.conf" /etc/nginx/sites-available/servicedesk
    sudo ln -sf /etc/nginx/sites-available/servicedesk /etc/nginx/sites-enabled/servicedesk
    sudo rm -f /etc/nginx/sites-enabled/default
    sudo nginx -t || error "NGINX config test failed."

    log "Starting API under PM2..."
    mkdir -p "$APP_DIR/backend/logs"
    pm2 startOrRestart ecosystem.config.cjs --env production
    pm2 save
    # Start PM2 on boot (prints a command to run if it needs sudo).
    pm2 startup systemd -u "$USER" --hp "$HOME" 2>/dev/null || true

    sudo systemctl reload nginx

    sleep 2
    log "Verifying..."
    local api_code web_code tls_code
    api_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://127.0.0.1:5000/api/auth/login \
        -H "Content-Type: application/json" -d '{"email":"x","password":"y"}' || echo "000")
    web_code=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1/ || echo "000")
    # -k because the certificate is self-signed; we're testing the listener, not trust.
    tls_code=$(curl -sk -o /dev/null -w "%{http_code}" https://127.0.0.1/ || echo "000")
    # 400/401 from the login probe means the API is up and validating input.
    [[ "$api_code" =~ ^(400|401)$ ]] && log "API    OK (HTTP $api_code)" || warn "API    unexpected response: $api_code — check 'pm2 logs servicedesk-api'"
    [ "$web_code" = "200" ]         && log "HTTP   OK (HTTP $web_code)" || warn "HTTP   unexpected response: $web_code — check 'sudo nginx -t' and the error log"
    [ "$tls_code" = "200" ]         && log "HTTPS  OK (HTTP $tls_code)" || warn "HTTPS  unexpected response: $tls_code — check the certificate and 'sudo nginx -t'"

    local ip
    ip=$(hostname -I 2>/dev/null | awk '{print $1}')
    cat <<EOF

Deployment complete.
  Internal:  http://${ip:-<server-ip>}/
  Public:    https://${PUBLIC_IP}/          (self-signed cert — expect a browser warning)
  API:       proxied at /api  ->  127.0.0.1:5000
  Logs:      pm2 logs servicedesk-api   |   sudo tail -f /var/log/nginx/servicedesk.error.log

EOF
}

restart() {
    log "Restarting..."
    cd "$APP_DIR"
    pm2 restart ecosystem.config.cjs --env production
    sudo systemctl reload nginx
    log "Restarted."
}

status() {
    echo "── PM2 ──"; pm2 status || true
    echo; echo "── NGINX ──"; systemctl is-active nginx && sudo nginx -t 2>&1 | tail -2
    echo; echo "── MySQL ──"; systemctl is-active mysql || true
    echo; echo "── Ports ──"; sudo ss -lntp 2>/dev/null | grep -E ':80|:5000|:3306' || true
}

case "${1:-deploy}" in
    setup)   setup ;;
    dbsetup) shift; dbsetup "$@" ;;
    deploy)  deploy ;;
    restart) restart ;;
    status)  status ;;
    *)       echo "Usage: bash deploy.sh [setup|dbsetup|deploy|restart|status]" ;;
esac
