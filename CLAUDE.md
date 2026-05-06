# JARVIS — Documentation Développeur & IA

Assistant vocal IA personnel inspiré d'Iron Man, tournant sur Linux.
Créateur : Mickael (TechEnClair — https://techenclair.fr/pages/jarvis.html)

---

## Architecture

```
JARVIS/
├── main2.py              # Backend principal (3300+ lignes, Python async)
├── jarvis_agent.py       # Scaffold agent minimal réutilisable (Gemini)
├── jarvis_memoire.json   # Mémoire persistante clé/valeur
├── .env                  # Clés API (ne jamais commiter)
├── requirements.txt      # Dépendances Python
├── start_jarvis.sh       # Lanceur Linux (./venv/bin/python main2.py)
├── install_linux.sh      # Installation complète (venv + pip + npm)
├── frontend/             # UI desktop TypeScript + Vite + Three.js
│   └── src/
│       ├── main.ts       # WebSocket client, gestion états orbe
│       ├── orb.ts        # Orbe 3D animée (idle/listening/thinking/speaking)
│       ├── screen_capture.ts  # Capture écran via getUserMedia
│       └── style.css
└── mobile/               # UI mobile HTML/JS vanilla + Three.js (port 8080)
    ├── index.html
    ├── app.js
    ├── orb.js
    └── style.css
```

### Flux de démarrage (`main()` → `start_ia()`)

1. `liberer_port(8765)` + `liberer_port(8080)` — tue les instances précédentes
2. Lance Vite (`npm run dev`, port 5173) dans un sous-processus
3. Ouvre le navigateur sur `http://localhost:5173`
4. Lance le serveur HTTP mobile (port 8080) dans un thread daemon
5. Lance `start_ia()` dans un thread daemon
   - Démarre le serveur WebSocket (port 8765) dans son propre thread → capture `WS_LOOP`
   - Appelle `_run_async(parler("Bonjour Mickael"))` via la boucle WS
   - Entre dans `ecouter()` (boucle infinie STT)

### Architecture async (point critique)

Trois threads coexistent :
- **Thread principal** : `main()`, boucle `while True: time.sleep(1)`
- **Thread IA** : `start_ia()` → `ecouter()` (synchrone, bloquant)
- **Thread WS** : `asyncio.run(start_ws())` — **seule vraie boucle async**

Toutes les coroutines (`parler`, `traiter_reponse_ia`, `send_web_state`) doivent
tourner dans la boucle WS. On utilise `_run_async(coro)` depuis le thread IA :

```python
def _run_async(coro):
    _WS_LOOP_READY.wait(timeout=10)   # attend que WS_LOOP soit prête
    fut = asyncio.run_coroutine_threadsafe(coro, WS_LOOP)
    return fut.result(timeout=120)
```

`WS_LOOP` est capturée dans `start_ws()` via `asyncio.get_running_loop()`.

---

## Pipeline vocal complet

```
Microphone → SpeechRecognition (Google, fr-FR)
           → ecouter()          [thread IA, sync]
           → _run_async(traiter_reponse_ia(commande))
           → resoudre_commandes_locales()   [Spotify, dossiers, apps]
           → resoudre_*_localement()        [math, traduction, info système]
           → demander_ia()                  [Gemini 2.5 Flash → fallbacks]
           → parler(réponse)               [edge-tts → pygame ou mobile WS]
```

---

## Modèles IA et ordre de fallback

| Ordre | Modèle | Condition |
|-------|--------|-----------|
| 1 | Gemini 2.5 Flash (+ Google Search) | Par défaut |
| 2 | Gemini 2.5 Flash Lite | Si Flash timeout |
| 3 | Gemini 1.5 Flash | Si Flash Lite timeout |
| 4 | Gemini 2.5 Pro | Si 1.5 Flash timeout |
| 5 | Gemini 2.0 Flash Exp | Si Pro timeout |
| 6 | SerpAPI (web scraping) | Si tous Gemini KO |
| 7 | Groq / Llama 3.3 | Fallback cloud rapide |
| 8 | Grok / xAI | Fallback cloud |
| 9 | Ollama (mistral/llama3/gemma4) | 100% offline |
| 10 | `reponse_locale()` | Fallback hardcodé |

Timeout par modèle Gemini : **12 secondes**.
Historique limité à **20 entrées** (10 tours) pour éviter un contexte trop lourd.

Détection du modèle forcé : `detecter_cerveau(texte)` retourne `"GROK"` si le
texte contient "demande à grok" / "utilise grok".

---

## TTS & Audio

- Voix : `fr-FR-HenriNeural` (Microsoft Edge TTS)
- Fichier temporaire fixe : `jarvis_tts_current.mp3` (remplacé à chaque utterance)
- Lecture : `pygame.mixer.music`
- Interruption : `STOP_PARLER = True` (détecté dans la boucle pygame)
- Mode mobile : l'audio est encodé en base64 et envoyé via WebSocket au lieu
  d'être joué sur le PC (`_skip_pc_audio = True`)
- Mise à jour volume frontend : toutes les **100ms** (10 messages/sec)

---

## WebSocket (port 8765)

Messages entrants (frontend → backend) :
```json
{"type": "mobile_command", "text": "allume la lumière"}
{"type": "stop_audio"}
{"type": "screen_frame", "id": "uuid", "data": "base64..."}
{"type": "screen_frame", "id": "uuid", "error": "no_stream"}
```

Messages sortants (backend → frontend) :
```json
{"action": "set_state", "state": "idle|listening|thinking|speaking"}
{"action": "set_volume", "volume": 0.0-1.0}
{"action": "request_screen_capture", "id": "uuid"}
{"action": "jarvis_audio", "text": "...", "audio_b64": "..."}
{"action": "demo"}
```

---

## Mémoire persistante

Fichier : `jarvis_memoire.json`
Structure :
```json
{
  "prénom": {"valeur": "Mickael", "timestamp": "25/04/2025 20:00"}
}
```

Fonctions : `ajouter_memoire(cle, valeur)`, `supprimer_memoire(cle)`, `charger_memoire()`

Le system prompt est **mis en cache** (variable `_prompt_cache`) et invalidé
uniquement si le mtime/size de `jarvis_memoire.json` change.

Commandes vocales : *"mémorise que..."*, *"oublie..."*, *"qu'est-ce que tu sais sur moi"*

---

## Configuration — Variables à modifier

### `.env` (obligatoire)

```env
GEMINI_API_KEY=...      # OBLIGATOIRE — cerveau principal
GROQ_API_KEY=...        # Recommandé  — fallback rapide gratuit
YOUTUBE_API_KEY=...     # Optionnel   — recherche YouTube
XAI_API_KEY=...         # Optionnel   — fallback Grok
HA_URL=http://192.168.1.XX:8123   # Si vous avez Home Assistant
HA_TOKEN=...            # Token longue durée Home Assistant
SERPAPI_API_KEY=...     # Optionnel   — recherche web fallback
```

### Dans `main2.py`

```python
# Ligne ~94 — Ville pour la météo par défaut
VILLE_PAR_DEFAUT = "Amilly"
LAT_PAR_DEFAUT   = 47.9742
LON_PAR_DEFAUT   = 2.7708

# Ligne ~701 — Mot de réveil
WAKE_WORD = "jarvis"

# Ligne ~704 — Timeout session (secondes sans parler avant retour en veille)
SESSION_TIMEOUT = 30.0

# Ligne ~87 — Ordre des modèles Gemini à essayer
MODELS_LIST = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-1.5-flash", ...]

# Ligne ~1741 — Voix TTS (liste sur https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support)
voice="fr-FR-HenriNeural"

# Ligne ~110 — Prénom du créateur (utilisé dans le system prompt et les réponses)
"Prenom : Mickael"
```

---

## Home Assistant — Entités à personnaliser

Toutes ces constantes sont dans `main2.py` (~ligne 1267). Remplacez les
`entity_id` par ceux de votre installation HA.

### Lumières — `PIECES_LUMIERES`
```python
"salon"             : "light.salon",
"plafond salon"     : "light.plafond",
"canapes"           : "light.canapes",
"lampadaire"        : "light.lampadaire",
"lampe de chevet"   : "light.lampe_de_chevet_2",
"grosse boule"      : "light.grosse_boule",
"petite boule"      : "light.petite_boule",
"cuisine"           : "light.lsc_smart_led_strip_rgbic_cctic_5m",
"cuisine 2"         : "light.cuisine_2",
"esteban"           : "light.pc_3",
"bureau"            : "light.bureau",
"pc"                : "light.pc",
"parents"           : "light.chambre_parentale",
"toutes"            : "light.all",
```

### Prises — `PIECES_PRISES`
```python
"salon"   : "switch.prise_salon",
"bureau"  : "switch.prise_bureau",
"cuisine" : "switch.prise_cuisine",
```

### Capteurs température — `PIECES_CAPTEURS`
```python
"salon"        : "sensor.salon_temperature_2",
"chambre"      : "sensor.miaomiaoc_de_..._temperature",
"bureau"       : "sensor.temp_temperature",
"exterieur"    : "sensor.temperature_exterieure",
"consommation" : "sensor.lixee_zlinky_tic_puissance_apparente",
"tiktok"       : "sensor.tiktok_followers_techenclair",
"oeufs"        : "input_select.ramassage_des_oeufs",
```

### Capteurs humidité — `PIECES_HUMIDITE`
```python
"bureau" : "sensor.temp_humidite",
```

### Consommation énergie mensuelle — `APPAREILS_ENERGIE`
```python
"tv"           : "sensor.prise_1_salon_mensuel",
"pc esteban"   : "sensor.prise_3_pc_esteban_mensuel",
"zoe"          : "sensor.zoe_mensuel",
"bureau"       : "sensor.bureau_mensuel",
```

### Batteries appareils — `APPAREILS_BATTERIE`
```python
"mon telephone"  : "sensor.sm_s921b_battery_level",
"julie"          : "sensor.sm_julie_battery_level",
"esteban"        : "sensor.esteban_battery_level",
"bob"            : "sensor.bob_batterie",           # aspirateur robot
"dyad"           : "sensor.dyad_air_2024_batterie", # aspirateur Dyson
"montre papa"    : "sensor.galaxy_watch6_classic_d4he_battery_level",
"toner"          : "sensor.samsung_m2020_series_black_toner_...",
"boite aux lettres": "sensor.detecterur_batterie",
"camera jardin"  : "sensor.arriere_cour_battery_percentage",
```

### Entités spéciales hardcodées
```python
# Alarme (ligne ~2833)
"alarm_control_panel.home_base_2"

# Aspirateur (ligne ~2927)
"vacuum.bob"

# Simulation de présence (ligne ~2840)
# → chercher action "ha_simulation" dans traiter_reponse_ia()

# Météo HA (ligne ~1451)
"weather.forecast_amilly"   # à remplacer par votre entité météo HA
```

### Tarifs électricité — `HA_TARIFS` (optionnel, pour le calcul de coût)
```python
HA_TARIFS = { "p1": 0.1296, "p2": 0.1603, ... }  # €/kWh par plage tarifaire
```

---

## Google APIs (optionnel)

Nécessite un fichier `credentials.json` (OAuth2 Google Cloud) dans le dossier racine.
Au premier lancement, une fenêtre de navigateur s'ouvre pour l'authentification.
Le token est sauvegardé dans `token.pickle`.

Scopes utilisés :
- `gmail.send` + `gmail.readonly`
- `documents` (Google Docs)
- `drive`
- `spreadsheets`
- `calendar`

---

## Commandes vocales clés

| Commande | Action |
|----------|--------|
| "Jarvis" | Active la session (jarvis_actif = True) |
| "Merci" / "Au revoir" | Retour en veille |
| "Tais-toi" / "Silence" | Coupe la parole en cours |
| "Allume/éteins la lumière [pièce]" | Contrôle lumières HA |
| "Il fait quel temps ?" | Météo (HA ou OpenMeteo) |
| "Mémorise que [info]" | Sauvegarde dans jarvis_memoire.json |
| "Joue du [artiste]" | Lance Spotify |
| "Ouvre le dossier [nom]" | Ouvre via xdg-open |
| "Regarde mon écran" | Capture via getUserMedia → Gemini Vision |
| "Active la caméra" | Webcam → Gemini Vision |
| "Mode Iron Man on/off" | Active détection double applaudissement |
| "Appelle [contact] sur WhatsApp" | Ouvre WhatsApp Desktop + raccourci appel |

---

## Détection d'applaudissements (Mode Iron Man)

Thread `monitor_claps()` écoute en continu via PyAudio.
- Seuil : `CLAP_THRESHOLD = 1200`
- Double clap détecté → toggle lumières OU action YouTube selon contexte

---

## Lancement

```bash
# Première fois
bash install_linux.sh

# Ensuite
bash start_jarvis.sh
# ou directement :
./venv/bin/python main2.py
```

L'interface desktop s'ouvre automatiquement sur `http://localhost:5173`.
L'interface mobile est accessible sur `http://[IP_PC]:8080`.

---

## Performances (améliorations appliquées)

- **Boucle event loop** : une seule boucle WS partagée, accès via
  `asyncio.run_coroutine_threadsafe` — plus de création/destruction à chaque cycle
- **Cache system prompt** : invalidé uniquement sur changement de `jarvis_memoire.json`
- **Historique Gemini** : plafonné à 20 entrées (10 tours)
- **Volume WebSocket** : 10 updates/sec (sleep 100ms)
- **Fichier TTS** : nom fixe `jarvis_tts_current.mp3`
- **`send_web_state`** : `return_exceptions=True` pour éviter les propagations silencieuses

---

## Personnalisation avancée (source : techenclair.fr)

- **Prénom** : changer `"Prenom : Mickael"` dans `CREATOR_INFO` (~ligne 108) et dans
  `construire_system_prompt()` partout où "Mickael" apparaît dans les réponses hardcodées
- **Ton de l'assistant** : modifier le system prompt dans `construire_system_prompt()`
- **Wake word** : `WAKE_WORD = "jarvis"` (~ligne 701)
- **Voix TTS** : paramètre `voice=` dans `parler()` — liste complète sur le site Microsoft
- **Ville météo** : `VILLE_PAR_DEFAUT`, `LAT_PAR_DEFAUT`, `LON_PAR_DEFAUT`
- **Timeout session** : `SESSION_TIMEOUT = 30.0` (secondes)
- **Sensibilité micro** : `r.energy_threshold = 300` et `CLAP_THRESHOLD = 1200` dans `ecouter()`
- **Modèles IA** : réordonner `MODELS_LIST` selon préférence/coût
