/**
 * J.A.R.V.I.S — Interface Web avec Orbe Three.js
 *
 * Se connecte au backend Python via WebSocket (ws://localhost:8765),
 * recoit les changements d'etat et pilote l'orbe en consequence.
 *
 * Etats: "idle" | "listening" | "thinking" | "speaking"
 */

import { createOrb, type OrbState } from "./orb";
import { injectVisionButton, captureFrame } from "./screen_capture";
import "./style.css";

// ── Config ────────────────────────────────────────────────────────────────────
const WS_URL = `ws://${window.location.hostname}:8765`;
const RECONNECT_INTERVAL_MS = 2_000;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const canvas = document.getElementById("orb-canvas") as HTMLCanvasElement;
const statusEl = document.getElementById("status-text") as HTMLDivElement;
const errorEl = document.getElementById("error-text") as HTMLDivElement;
const badgeEl = document.getElementById("connection-badge") as HTMLDivElement;
const badgeLabelEl = document.getElementById(
  "connection-label"
) as HTMLSpanElement;
const muteButtonEl    = document.getElementById("mute-button") as HTMLButtonElement;
const micButtonEl     = document.getElementById("mic-button") as HTMLButtonElement;
const transcriptEl    = document.getElementById("transcript-text") as HTMLDivElement;
const textInputEl     = document.getElementById("text-input") as HTMLInputElement;
const textSendEl      = document.getElementById("text-send") as HTMLButtonElement;

// ── Orb ───────────────────────────────────────────────────────────────────────
const orb = createOrb(canvas);

// ── State labels (French) ────────────────────────────────────────────────────
const STATE_LABELS: Record<OrbState, string> = {
  idle: "",
  listening: "ecoute...",
  thinking: "reflexion...",
  speaking: "",
};

function applyState(state: OrbState): void {
  orb.setState(state);
  statusEl.textContent = STATE_LABELS[state];
  if (state === "idle") transcriptEl.textContent = "";
}

function setMuted(muted: boolean): void {
  muteButtonEl.classList.toggle("is-muted", muted);
  muteButtonEl.setAttribute("aria-pressed", String(muted));
  muteButtonEl.textContent = muted ? "unmute" : "mute";
}

// ── Error toast ───────────────────────────────────────────────────────────────
let errorTimer: ReturnType<typeof setTimeout> | null = null;

function showError(msg: string): void {
  errorEl.textContent = msg;
  errorEl.style.opacity = "1";
  if (errorTimer) clearTimeout(errorTimer);
  errorTimer = setTimeout(() => {
    errorEl.style.opacity = "0";
  }, 4_000);
}

// ── Connection badge ──────────────────────────────────────────────────────────
function setConnected(ok: boolean): void {
  badgeEl.classList.toggle("connected", ok);
  badgeEl.classList.toggle("disconnected", !ok);
  badgeLabelEl.textContent = ok ? "connecte" : "reconnexion";
  muteButtonEl.disabled = !ok;
}

// ── WebSocket with auto-reconnect ─────────────────────────────────────────────
let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function connect(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  ws = new WebSocket(WS_URL);

  ws.addEventListener("open", () => {
    setConnected(true);
  });

  ws.addEventListener("message", async (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data as string) as {
        state?: string;
        action?: string;
        muted?: boolean;
        volume?: number;
        id?: string;
        audio_b64?: string;
      };

      if (data.action === "jarvis_audio" && data.audio_b64) {
        playBase64Audio(data.audio_b64 as string);
        return;
      }

      if (data.action === "request_screen_capture") {
        const frame = await captureFrame();
        if (frame && ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: "screen_frame",
            id: data.id,
            data: frame,
          }));
        } else if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: "screen_frame",
            id: data.id,
            error: "no_stream",
          }));
        }
        return;
      }

      if (data.action === "demo") {
        orb.triggerDemo();
        return;
      }
      if (data.action === "set_volume" && typeof data.volume === "number") {
        orb.setVolume(data.volume);
        return;
      }
      if (data.state) {
        applyState(data.state as OrbState);
      }
      if (typeof data.volume === "number") {
        orb.setVolume(data.volume);
      }
      if (typeof data.muted === "boolean") {
        setMuted(data.muted);
      }
    } catch {
      // ignore malformed messages
    }
  });

  ws.addEventListener("close", () => {
    setConnected(false);
    applyState("idle");
    scheduleReconnect();
  });

  ws.addEventListener("error", () => {
    setConnected(false);
  });
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, RECONNECT_INTERVAL_MS);
}

// ── Audio playback ────────────────────────────────────────────────────────────
let currentAudio: HTMLAudioElement | null = null;

function playBase64Audio(b64: string): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  const audio = new Audio(`data:audio/mpeg;base64,${b64}`);
  currentAudio = audio;
  audio.play().catch(() => {/* autoplay bloqué, ignoré */});
  audio.addEventListener("ended", () => {
    currentAudio = null;
  });
}

// ── Events ──────────────────────────────────────────────────────────────────
muteButtonEl.addEventListener("click", () => {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  // Couper l'audio en cours dans le navigateur
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }

  // Envoi du signal stop au backend
  ws.send(JSON.stringify({ type: "stop_audio" }));

  // Feedback immédiat sur l'orbe
  applyState("idle");
});

// ── Web Speech API (micro Chrome) ────────────────────────────────────────────
const SpeechRecognitionAPI =
  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

let recognition: any = null;
let browserListening = false;

if (SpeechRecognitionAPI) {
  recognition = new SpeechRecognitionAPI();
  recognition.lang           = "fr-FR";
  recognition.continuous     = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  recognition.addEventListener("start", () => {
    browserListening = true;
    micButtonEl.classList.add("is-listening");
    transcriptEl.textContent = "";
    applyState("listening");
  });

  recognition.addEventListener("result", (event: any) => {
    let interim = "";
    let final_txt = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const t = event.results[i][0].transcript;
      if (event.results[i].isFinal) final_txt += t;
      else interim += t;
    }
    transcriptEl.textContent = final_txt || interim;
  });

  recognition.addEventListener("end", () => {
    browserListening = false;
    micButtonEl.classList.remove("is-listening");
    const texte = transcriptEl.textContent?.trim() ?? "";
    if (texte && ws && ws.readyState === WebSocket.OPEN) {
      applyState("thinking");
      ws.send(JSON.stringify({ type: "mobile_command", text: texte }));
    } else {
      applyState("idle");
      transcriptEl.textContent = "";
    }
  });

  recognition.addEventListener("error", (event: any) => {
    browserListening = false;
    micButtonEl.classList.remove("is-listening");
    applyState("idle");
    if (event.error === "not-allowed") {
      transcriptEl.textContent = "⚠ Micro non autorisé";
    } else if (event.error !== "no-speech") {
      transcriptEl.textContent = `⚠ ${event.error}`;
    }
  });

  micButtonEl.addEventListener("click", () => {
    if (browserListening) {
      recognition.stop();
    } else {
      transcriptEl.textContent = "";
      try { recognition.start(); } catch (e) { /* déjà en cours */ }
    }
  });
} else {
  micButtonEl.title = "Web Speech API non supportée sur ce navigateur";
  micButtonEl.style.opacity = "0.3";
  micButtonEl.disabled = true;
}

// ── Text input ────────────────────────────────────────────────────────────────
function sendTextCommand(): void {
  const texte = textInputEl.value.trim();
  if (!texte || !ws || ws.readyState !== WebSocket.OPEN) return;
  textInputEl.value = "";
  transcriptEl.textContent = texte;
  applyState("thinking");
  ws.send(JSON.stringify({ type: "mobile_command", text: texte }));
}

textSendEl.addEventListener("click", sendTextCommand);

textInputEl.addEventListener("keydown", (e: KeyboardEvent) => {
  if (e.key === "Enter") sendTextCommand();
});

// ── Boot ──────────────────────────────────────────────────────────────────────
setConnected(false);
applyState("idle");
setMuted(false);
injectVisionButton();
connect();

// Silence unused-import warning for showError
void showError;
