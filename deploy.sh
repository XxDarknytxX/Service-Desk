#!/bin/bash
# Service Desk - Production Deployment Script
# Usage: bash deploy.sh [setup|deploy|restart]

set -e

# Configuration - CHANGE THESE
APP_DIR="/var/www/servicedesk"
REPO_URL="YOUR_GIT_REPO_URL"
BRANCH="main"
DOMAIN="yourdomain.com"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[DEPLOY]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# ─── FIRST-TIME SERVER SETUP ───
setup() {
    log "Starting first-time server setup..."

    # Update system
    sudo apt update && sudo apt upgrade -y

    # Install Node.js 20 LTS
    if ! command -v node &> /dev/null; then
        log "Installing Node.js 20..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt install -y nodejs
    fi
    log "Node.js version: $(node -v)"

    # Install PM2
    if ! command -v pm2 &> /dev/null; then
        log "Installing PM2..."
        sudo npm install -g pm2
    fi

    # Install NGINX
    if ! command -v nginx &> /dev/null; then
        log "Installing NGINX..."
        sudo apt install -y nginx
    fi

    # Install MySQL (if not using external DB)
    if ! command -v mysql &> /dev/null; then
        log "Installing MySQL..."
        sudo apt install -y mysql-server
        sudo systemctl enable mysql
        sudo systemctl start mysql
        warn "Run 'sudo mysql_secure_installation' to secure MySQL"
    fi

    # Install Certbot for SSL
    if ! command -v certbot &> /dev/null; then
        log "Installing Certbot..."
        sudo apt install -y certbot python3-certbot-nginx
    fi

    # Create app directory
    sudo mkdir -p "$APP_DIR"
    sudo chown $USER:$USER "$APP_DIR"

    # Create logs directory
    mkdir -p "$APP_DIR/logs"

    # Setup MySQL database and user
    log "Setting up MySQL database..."
    echo "
    Run these commands in MySQL (sudo mysql):

    CREATE DATABASE IF NOT EXISTS servicedesk CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    CREATE USER IF NOT EXISTS 'servicedesk_user'@'localhost' IDENTIFIED BY 'YOUR_STRONG_PASSWORD';
    GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, DROP ON servicedesk.* TO 'servicedesk_user'@'localhost';
    FLUSH PRIVILEGES;
    "

    log "Setup complete! Next steps:"
    echo "  1. Configure MySQL (see above)"
    echo "  2. Clone your repo to $APP_DIR"
    echo "  3. Copy backend/.env.example to backend/.env and fill in values"
    echo "  4. Run: bash deploy.sh deploy"
}

# ─── DEPLOY / UPDATE ───
deploy() {
    log "Starting deployment..."

    cd "$APP_DIR"

    # Pull latest code
    if [ -d ".git" ]; then
        log "Pulling latest changes..."
        git pull origin "$BRANCH"
    else
        error "No git repo found at $APP_DIR. Clone it first."
    fi

    # Check backend .env exists
    if [ ! -f "backend/.env" ]; then
        error "backend/.env not found. Copy from backend/.env.example and configure."
    fi

    # Install backend dependencies
    log "Installing backend dependencies..."
    cd "$APP_DIR/backend"
    npm ci --production

    # Run database migrations
    log "Running database migrations..."
    node run-migration.js || warn "Migration may have already been applied"

    # Build frontend
    log "Building frontend..."
    cd "$APP_DIR/frontend"
    npm ci
    npm run build

    # Setup NGINX config
    log "Configuring NGINX..."
    # Update domain in nginx config
    sed "s/yourdomain.com/$DOMAIN/g" "$APP_DIR/nginx.conf" | sudo tee /etc/nginx/sites-available/servicedesk > /dev/null

    # Enable site
    sudo ln -sf /etc/nginx/sites-available/servicedesk /etc/nginx/sites-enabled/
    sudo rm -f /etc/nginx/sites-enabled/default

    # Test NGINX config
    sudo nginx -t || error "NGINX configuration test failed"

    # Start/restart backend with PM2
    log "Starting backend with PM2..."
    cd "$APP_DIR"
    pm2 startOrRestart ecosystem.config.cjs --env production
    pm2 save

    # Setup PM2 to start on boot
    pm2 startup systemd -u $USER --hp $HOME 2>/dev/null || true
    pm2 save

    # Restart NGINX
    sudo systemctl restart nginx

    log "Deployment complete!"
    echo ""
    echo "  Backend:  PM2 (pm2 status / pm2 logs servicedesk-api)"
    echo "  Frontend: NGINX serving from $APP_DIR/frontend/build"
    echo "  Domain:   https://$DOMAIN"
    echo ""
    warn "If SSL is not set up yet, run: sudo certbot --nginx -d $DOMAIN"
}

# ─── RESTART ───
restart() {
    log "Restarting services..."
    cd "$APP_DIR"
    pm2 restart ecosystem.config.cjs --env production
    sudo systemctl restart nginx
    log "Services restarted."
}

# ─── MAIN ───
case "${1:-deploy}" in
    setup)   setup ;;
    deploy)  deploy ;;
    restart) restart ;;
    *)       echo "Usage: bash deploy.sh [setup|deploy|restart]" ;;
esac
