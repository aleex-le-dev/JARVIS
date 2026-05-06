#!/bin/bash
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

# Accès à l'affichage X11
export DISPLAY=${DISPLAY:-:0}
export XAUTHORITY=${XAUTHORITY:-$HOME/.Xauthority}

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
