<div align="center">

# J.A.R.V.I.S

**Assistant vocal IA personnel — Just A Rather Very Intelligent System**

[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![Gemini](https://img.shields.io/badge/Gemini_2.5_Flash-4285F4?style=for-the-badge&logo=google&logoColor=white)](https://ai.google.dev)
[![Three.js](https://img.shields.io/badge/Three.js-000000?style=for-the-badge&logo=three.js&logoColor=white)](https://threejs.org)
[![License](https://img.shields.io/badge/Licence-MIT-green?style=for-the-badge)](LICENSE)

</div>

---

## Aperçu

JARVIS est un assistant vocal IA personnel inspiré du système informatique d'Iron Man.  
Il tourne entièrement en local sur Linux, avec une interface web 3D et un accès mobile.

- **Voix** — commandes en français, réponse vocale synthétisée
- **Multi-IA** — Gemini 2.5 Flash + fallbacks Groq, Grok, Ollama (offline)
- **Domotique** — intégration Home Assistant complète
- **Vision** — analyse d'écran et webcam via Gemini Vision
- **Google Workspace** — Gmail, Calendar, Drive, Docs, Sheets
- **Contrôle PC** — fichiers, Spotify, applications

---

## Interface

> Ajoutez ici une capture d'écran ou un GIF de l'orbe en action.  
> Exemple : `![JARVIS Interface](docs/screenshot.png)`

L'orbe 3D change d'état en temps réel :

| État | Couleur | Signification |
|------|---------|---------------|
| `idle` | Bleu calme | En veille |
| `listening` | Cyan pulsant | Écoute active |
| `thinking` | Violet | Traitement IA |
| `speaking` | Blanc vibrant | Parole en cours |

---

## Prérequis

- Linux (Ubuntu/Debian recommandé)
- Python 3.10+
- Node.js 18+
- Microphone + haut-parleurs
- Clé API Gemini (gratuite sur [Google AI Studio](https://aistudio.google.com))

---

## Installation

```bash
cd /home/alex/Bureau/JARVIS && sudo bash install_linux.sh
```

Installe automatiquement : paquets système, venv Python, modules Python, frontend npm, PulseAudio.

### Configuration

Éditez le fichier `.env` :

```env
GEMINI_API_KEY=votre_cle_gemini     # Obligatoire
GROQ_API_KEY=votre_cle_groq         # Recommandé (gratuit)
HA_URL=http://192.168.1.XX:8123     # Si vous avez Home Assistant
HA_TOKEN=votre_token_ha
YOUTUBE_API_KEY=votre_cle_youtube   # Optionnel
XAI_API_KEY=votre_cle_grok          # Optionnel
SERPAPI_API_KEY=votre_cle_serpapi   # Optionnel
```

---

## Lancement

```bash
cd /home/alex/Bureau/JARVIS && bash start_jarvis.sh
```

L'interface desktop s'ouvre automatiquement sur `http://localhost:5173`.  
Accès mobile depuis votre réseau : `http://[IP_DU_PC]:8080`

---

## Utilisation

Dites **"Jarvis"** pour activer la session, puis parlez naturellement.

```
"Jarvis, allume la lumière du salon"
"Jarvis, quel temps fait-il ?"
"Jarvis, joue du Daft Punk sur Spotify"
"Jarvis, mémorise que mon mot de passe wifi est..."
"Jarvis, regarde mon écran et dis-moi ce que tu vois"
"Jarvis, appelle Julie sur WhatsApp"
"Jarvis, trie mon dossier téléchargements par type"
```

Dites **"Merci"** ou **"Au revoir"** pour retourner en veille.  
Dites **"Tais-toi"** pour interrompre une réponse en cours.

---

## Architecture

```
                  ┌─────────────────┐
                  │   Microphone    │
                  └────────┬────────┘
                           │ SpeechRecognition (fr-FR)
                  ┌────────▼────────┐
                  │   ecouter()     │  Thread IA
                  └────────┬────────┘
                           │ _run_async()
          ┌────────────────▼────────────────┐
          │       traiter_reponse_ia()       │  Boucle WebSocket
          │                                 │
          │  Commandes locales → Gemini      │
          │  Vision → Fallbacks IA           │
          └────────────────┬────────────────┘
                           │
          ┌────────────────▼────────────────┐
          │           parler()              │
          │   edge-tts → pygame / mobile    │
          └────────────────┬────────────────┘
                           │ WebSocket :8765
          ┌────────────────▼────────────────┐
          │     Frontend Three.js :5173     │
          │     Mobile HTML/JS    :8080     │
          └─────────────────────────────────┘
```

---

## Fallbacks IA

En cas d'indisponibilité, JARVIS bascule automatiquement :

```
Gemini 2.5 Flash → Flash Lite → 1.5 Flash → 2.5 Pro
    → SerpAPI → Groq/Llama 3.3 → Grok/xAI → Ollama → Local
```

---

## Personnalisation

Consultez [CLAUDE.md](CLAUDE.md) pour la documentation complète :
- Entités Home Assistant à configurer
- Wake word, voix TTS, ville météo
- Noms des pièces et appareils
- System prompt et personnalité de l'assistant

---

## Stack technique

| Composant | Technologie |
|-----------|-------------|
| Backend | Python 3.10+, asyncio |
| IA principale | Google Gemini 2.5 Flash |
| TTS | Microsoft Edge TTS (`fr-FR-HenriNeural`) |
| STT | Google Speech Recognition |
| Audio | pygame, PyAudio |
| Vision | Gemini Vision, OpenCV, PIL |
| Frontend | TypeScript, Vite, Three.js |
| Domotique | Home Assistant REST API |
| Communication | WebSocket (websockets) |

---

## Crédits

Projet créé par **Alex**
