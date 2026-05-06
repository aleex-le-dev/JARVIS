#!/bin/bash
# ======================================================
#   J.A.R.V.I.S — Installateur Linux
#   Usage : sudo bash install_linux.sh
# ======================================================
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'
RED='\033[0;31m';   CYAN='\033[0;36m'; NC='\033[0m'

ok()   { echo -e "${GREEN}[✓] $1${NC}"; }
info() { echo -e "${CYAN}[…] $1${NC}"; }
warn() { echo -e "${YELLOW}[!] $1${NC}"; }
fail() { echo -e "${RED}[✗] $1${NC}"; exit 1; }

echo -e "${CYAN}"
echo "======================================================"
echo "        J.A.R.V.I.S — Installation Linux"
echo "======================================================"
echo -e "${NC}"

# ── 1. Sudo requis ─────────────────────────────────────
[ "$EUID" -ne 0 ] && fail "Lancez avec sudo : sudo bash install_linux.sh"

REAL_USER="${SUDO_USER:-$USER}"
REAL_HOME=$(eval echo "~$REAL_USER")

# ── 2. Paquets système ─────────────────────────────────
info "Installation des paquets système..."
apt-get update -qq
apt-get install -y -q \
    python3 python3-pip python3-venv python3-dev \
    portaudio19-dev libasound2-dev \
    pulseaudio \
    nodejs npm \
    libxcb-xinerama0 python3-xlib \
    espeak ffmpeg lsof \
    build-essential pkg-config \
    libsdl2-dev libsdl2-image-dev libsdl2-mixer-dev libsdl2-ttf-dev \
    libfreetype6-dev libportmidi-dev
ok "Paquets système installés."

# ── 3. Venv Python ─────────────────────────────────────
info "Création de l'environnement virtuel Python..."
PY=$(which python3.12 2>/dev/null || which python3.11 2>/dev/null || which python3.10 2>/dev/null || which python3)
$PY --version

# Supprimer le venv cassé si pip absent
if [ -d "$DIR/venv" ] && [ ! -f "$DIR/venv/bin/pip" ]; then
    rm -rf "$DIR/venv"
fi

if [ ! -d "$DIR/venv" ]; then
    $PY -m venv "$DIR/venv" --without-pip
    # Bootstrap pip manuellement (compatible Python 3.14)
    curl -sS https://bootstrap.pypa.io/get-pip.py | "$DIR/venv/bin/python"
fi

# Vérification
[ -f "$DIR/venv/bin/pip" ] || { echo "get-pip.py non disponible, essai ensurepip..." && "$DIR/venv/bin/python" -m ensurepip --upgrade; }
ok "Venv créé avec $PY"

PIP="$DIR/venv/bin/pip"
"$PIP" install --upgrade pip setuptools wheel -q

# ── 4. Modules Python ──────────────────────────────────
info "Installation des modules Python..."

"$PIP" install -q \
    python-dotenv \
    google-genai google-generativeai \
    google-auth google-auth-oauthlib google-auth-httplib2 \
    google-api-python-client \
    google-api-core googleapis-common-protos \
    grpcio grpcio-status proto-plus protobuf

"$PIP" install -q \
    openai groq \
    flask flask-cors requests websockets httpx aiohttp

"$PIP" install -q \
    SpeechRecognition edge-tts pyttsx3 pygame

"$PIP" install -q \
    pyautogui Pillow screeninfo psutil \
    colorama tenacity tabulate tqdm pydantic

# PyAudio — compilation depuis les sources si pas de wheel
info "Installation de PyAudio (peut prendre un moment)..."
"$PIP" install -q pyaudio || warn "PyAudio échoué — micro peut-être non fonctionnel"

# OpenCV — optionnel
"$PIP" install -q opencv-python || warn "OpenCV non installé — vision caméra désactivée"

ok "Modules Python installés."

# ── 5. Frontend npm ────────────────────────────────────
info "Installation du frontend (npm)..."
if command -v npm &>/dev/null && [ -f "$DIR/frontend/package.json" ]; then
    cd "$DIR/frontend" && npm install --silent && cd "$DIR"
    ok "Frontend npm installé."
else
    warn "npm non disponible — interface web ignorée."
fi

# ── 6. Permissions ─────────────────────────────────────
chown -R "$REAL_USER":"$REAL_USER" "$DIR" 2>/dev/null || true

# ── 7. Lanceur ─────────────────────────────────────────
info "Création du lanceur start_jarvis.sh..."
cat > "$DIR/start_jarvis.sh" << 'LAUNCHER'
#!/bin/bash
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

# Démarrer PulseAudio si absent
if ! pgrep -x pulseaudio > /dev/null 2>&1; then
    pulseaudio --start --log-target=syslog 2>/dev/null || true
    sleep 1
fi

echo ""
echo "======================================================"
echo "   J.A.R.V.I.S — Démarrage"
echo "======================================================"
echo ""

"$DIR/venv/bin/python" main2.py
LAUNCHER
chmod +x "$DIR/start_jarvis.sh"
chown "$REAL_USER":"$REAL_USER" "$DIR/start_jarvis.sh" 2>/dev/null || true
ok "Lanceur créé."

# ── Fin ─────────────────────────────────────────────────
echo ""
echo -e "${GREEN}======================================================"
echo "   [✓] Installation terminée !"
echo "======================================================"
echo -e "${NC}"
echo "  Vérifiez votre fichier .env (clé GEMINI_API_KEY)"
echo ""
echo "  Pour lancer JARVIS :"
echo -e "  ${CYAN}bash start_jarvis.sh${NC}"
echo ""
