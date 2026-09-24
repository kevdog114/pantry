# Voice stack: speech-to-text and text-to-speech

The kitchen kiosk's voice features (the ASK view, and the mic in smart chat)
depend on two services that do **not** run in Docker and are **not** part of the
Portainer stack. They run natively on a Mac, because both need Apple Silicon GPU
access that a Linux container on the Pi or the Asahi hosts cannot provide.

If voice suddenly gets worse rather than breaking outright, the cause is almost
always one of the two footguns in [Gotchas](#gotchas) — both fail silently.

---

## Architecture

```
Kiosk (Raspberry Pi 4, Chromium)
   │  mic → 16 kHz PCM over socket.io
   ▼
pantry-api  (Docker, fedora-asahi)
   │  WHISPER_HOST:WHISPER_PORT  ── Wyoming protocol (TCP, JSON-lines)
   │                                → wyoming-faster-whisper   :10300   [LIVE]
   │
   │  TTS_URL                    ── HTTP POST /v1/audio/speech
   │                                → mlx-audio server          :10400   [LIVE]
   ▼
Kiosk plays returned audio → HDMI → display speakers
```

> **Status:** both are wired into pantry and in use. The kiosk ASK view has a
> speak toggle; when it is on the reply is spoken as well as shown, and the
> model is told to word the answer for the ear. Set `TTS_URL` or the toggle
> reports TTS unavailable and replies stay on screen.

Both services live on the Mac Studio (`10.36.222.234` in this deployment) as
launchd **LaunchAgents**. Everything is on the LAN with no auth, so keep it on a
trusted network.

| service | port | what runs | latency |
|---|---|---|---|
| STT | 10300 | `wyoming-faster-whisper`, `large-v3-turbo` on MPS | ~0.40 s over LAN |
| TTS | 10400 | `mlx-audio` server, Kokoro-82M | ~0.14 s over LAN |

---

## Speech-to-text (Whisper)

**Location:** `~/wyoming-whisper` on the Mac, LaunchAgent
`~/Library/LaunchAgents/com.klschaefer.wyoming-whisper.plist`.

**Config that matters:**

```
--model openai/whisper-large-v3-turbo
--stt-library transformers
--device mps
--beam-size 5
--language en
--vad-endpointing 0.6
--uri tcp://0.0.0.0:10300
--data-dir ~/wyoming-whisper/data
--initial-prompt "<pantry + music vocabulary, room names>"
```

### Why each of those

**`--stt-library transformers --device mps`** — the default backend is
faster-whisper, which runs on CTranslate2, which has **no Metal backend**. On
macOS it is CPU-only, so the GPU sits idle. Transformers passes `mps` through to
torch and actually uses it.

**`large-v3-turbo`** — turbo keeps large-v3's encoder (where accuracy lives) but
distils the decoder from 32 layers to 4. The decoder is the serial,
latency-dominating half, so turbo is ~8x cheaper there while staying
large-class. On CPU it is too slow to consider; on the GPU it is the fastest
*and* most accurate option measured.

**`--beam-size 5`** — `wyoming-faster-whisper` defaults `beam_size` to **1 on
ARM** (5 everywhere else). Greedy decoding commits to each token irreversibly:
it emitted "edg" for "Ed Sheeran" and could not revisit it once "Sheeran"
arrived, turning *"play Ed Sheeran songs"* into *"play edgier songs"* — which
downstream read as a mood and built an AI playlist instead of an artist lookup.
Beam search costs ~0.07 s.

**`--vad-endpointing 0.6`** — the server finalises the utterance after 0.6 s of
Silero-detected silence instead of waiting for the client to send `audio-stop`.
Measured 2.55 s vs 3.45 s from end-of-speech to transcript.

**`--initial-prompt`** — biases decoding toward pantry, music and room
vocabulary. Worth more than it sounds; see the caveat in Gotchas about how it is
passed.

### Measured accuracy

72 clips (24 phrases x 3 synthetic voices), byte-identical audio across
backends, beam 5, verified deterministic over three reloads:

| backend | clean | fan 10 dB | fan 5 dB | fan 0 dB | s/clip |
|---|---|---|---|---|---|
| small / CPU | 93.1% | 84.7% | 75.0% | 50.0% | 0.94 |
| medium / CPU | 94.4% | 87.5% | 80.6% | 63.9% | 2.83 |
| **turbo / GPU** | **98.6%** | **93.1%** | **83.3%** | 62.5% | **0.23** |

Better than either CPU option at every level that matters, and 4–12x faster.

---

## Text-to-speech (Kokoro)

**Location:** `~/mlx-tts` on the Mac, LaunchAgent
`~/Library/LaunchAgents/com.klschaefer.kokoro-tts.plist`, launcher
`~/mlx-tts/run.sh`.

Serves an **OpenAI-compatible** endpoint, so any client that can talk to
OpenAI's `/v1/audio/speech` works:

```bash
curl -X POST http://<mac>:10400/v1/audio/speech \
  -H 'Content-Type: application/json' \
  -d '{"model":"mlx-community/Kokoro-82M-bf16",
       "voice":"af_heart",
       "input":"Playing Ed Sheeran in the kitchen."}' \
  --output reply.wav
```

**Model:** `mlx-community/Kokoro-82M-bf16`, voice `af_heart`.

### Why Kokoro

Blind-rated against alternatives on identical sentences:

| engine | subjective quality | latency (resident) |
|---|---|---|
| **Kokoro af_heart** | **5/5** | **0.06 s** |
| macOS `say` (basic voices) | 4/5 | 1.03 s |
| Piper ryan-high | 2/5 | 0.09 s |
| Piper lessac-medium | 1/5 | 0.03 s |
| Qwen3-TTS (`serena`) | 0/5 — wrong accent | 1.07 s |

Kokoro wins outright once it is held resident: best quality *and* Piper-class
speed, so there is no tradeoff to weigh. Qwen3-TTS scored badly only because
`serena` is one of its Chinese-English bilingual speakers; it has `ryan`/`eric`
if you ever want to re-audition it.

### The resident-model rule

**This is the single most important thing about the TTS service.** mlx-audio's
`generate_audio()` helper rebuilds the Kokoro pipeline on *every call*:

| how it is called | short reply | long reply |
|---|---|---|
| `generate_audio()` per call | 0.99 s | 1.05 s |
| model held resident | **0.057 s** | **0.112 s** |

The giveaway that this is overhead and not inference: 4-bit cost exactly the
same as bf16, and a 5.67 s utterance cost only 6% more than a 2.33 s one. Cost
that ignores both model size and output length is not generation.

The `mlx_audio.server` module caches loaded models between requests, which is
why the service runs as a server rather than shelling out per reply. **Do not**
replace it with a CLI call.

### Warmup

The first request after a restart pays ~3 s of model load (and ~14 s the very
first time, while MLX compiles). `run.sh` fires a throwaway synthesis at startup
so nobody standing at the kiosk ever pays it. Confirm with:

```bash
grep warmup ~/mlx-tts/server.log     # → "warmup ok: ...af_heart resident"
```

---

## Setting this up on a new Mac

Assumes Apple Silicon and Homebrew. Adjust hostnames to taste.

### 0. Prerequisites

```bash
brew install espeak-ng        # REQUIRED for Kokoro — see Gotchas
```

### 1. Speech-to-text

```bash
mkdir -p ~/wyoming-whisper && cd ~/wyoming-whisper
uv venv                                   # or python3.12 -m venv .venv
uv pip install --python .venv/bin/python \
    wyoming-faster-whisper torch transformers
```

Then **apply the `get_prompt_ids` patch** (see Gotchas — without it you get
*worse* accuracy than a CPU `small` model). The patch, the original file and an
`apply.sh` live in `~/wyoming-whisper/patches/` on the current Mac; copy that
directory across.

Create the LaunchAgent with the flags from
[Speech-to-text](#speech-to-text-whisper) above, then:

```bash
launchctl load ~/Library/LaunchAgents/com.klschaefer.wyoming-whisper.plist
```

### 2. Text-to-speech

```bash
mkdir -p ~/mlx-tts && cd ~/mlx-tts
python3.12 -m venv .venv
.venv/bin/pip install mlx-audio "misaki[en]" uvicorn fastapi \
    python-multipart webrtcvad-wheels
```

Copy `run.sh` and the LaunchAgent plist from the current Mac, then:

```bash
launchctl load ~/Library/LaunchAgents/com.klschaefer.kokoro-tts.plist
```

### 3. Point pantry at it

In `stack.env` (or Portainer's variable store):

```
WHISPER_HOST=<mac-ip>
WHISPER_PORT=10300                              # optional; default in code
TTS_URL=http://<mac-ip>:10400/v1/audio/speech   # blank disables spoken replies
TTS_MODEL=mlx-community/Kokoro-82M-bf16         # optional; this is the default
TTS_VOICE=af_heart                              # optional; this is the default
```

### How pantry uses TTS

`POST /tts/speak { text } -> audio/wav` (`api/src/controllers/TtsController.ts`)
proxies Kokoro. Proxied rather than called from the browser because the TTS
server has no CORS and no auth, and this keeps its address out of the UI bundle.
It strips markdown before synthesising — the spoken-mode prompt asks for plain
prose but is not reliable about it, and a stray asterisk gets read aloud.

The kiosk ASK view (`kiosk-voice`) has a speak toggle, remembered per device in
`localStorage` (default on — the kiosk is what this is for). When it is on:

* the chat request carries `responseMode: 'spoken'`, and the system instruction
  gains `SPOKEN_RESPONSE_RULES`;
* the reply is both displayed and played through `SpeechPlaybackService`.

**The prompt change is not cosmetic.** Eight expiring items is a useful list on
screen and useless out of a speaker, so spoken answers summarise and offer the
rest ("five things expire this week, milk is first, on Thursday") rather than
enumerating. It also spells out units and dates the way they are said. Because
the system instruction changes, spoken and on-screen turns get separate context
cache entries automatically — `hashContext` covers it, no extra bookkeeping.

The answer is always shown even when spoken: the screen is right there, and a
spoken summary is easier to trust with the detail visible beside it.

Playback is triggered from the push-to-talk gesture, which satisfies the browser
autoplay policy. A TTS failure is logged and swallowed rather than surfaced —
the answer is already on screen, so a silent reply is a degradation, not an
error.

### 4. Verify you got the same performance

```bash
# STT — expect ~0.4 s and a correct transcript, NOT "edgier songs"
# (any 16 kHz mono PCM of "play Ed Sheeran songs")

# TTS — first call ~3 s, subsequent ~0.10 s
for i in 1 2 3; do
  /usr/bin/time -p curl -s -o /tmp/t.wav -X POST \
    http://<mac-ip>:10400/v1/audio/speech \
    -H 'Content-Type: application/json' \
    -d '{"model":"mlx-community/Kokoro-82M-bf16","voice":"af_heart",
         "input":"Playing Ed Sheeran in the kitchen."}'
done
```

If TTS sits near **1.0 s** instead of 0.10 s, the model is not resident.
If STT transcripts are subtly wrong on names, the Whisper patch is missing.

---

## Gotchas

These are ordered by how much time they cost to rediscover.

### 1. The Whisper `get_prompt_ids` patch reverts on upgrade — silently

`wyoming_faster_whisper/transformers_whisper.py` builds `prompt_ids` with a bare
`tokenizer(..., add_special_tokens=False)` call, omitting the `<|startofprev|>`
marker. Without that marker Whisper treats `--initial-prompt` as decoder content
it must **reproduce** rather than as bias context.

Measured cost: **98.6% → 76.4%** exact match, and **0.23 s → 0.89 s** per clip.
That is worse than the CPU `small` model it replaced.

Nothing errors. The service starts fine. The only symptom is the kiosk
mishearing names again, which reads like a model regression rather than a
dependency one. **Any `pip install -U` into that venv reverts it.** Re-run
`~/wyoming-whisper/patches/apply.sh` and reload the LaunchAgent.

### 2. Kokoro must be resident

Covered above. 17x difference, and the wrong way looks like it works.

### 3. espeak-ng must come from Homebrew

Kokoro's text processing is misaki → phonemizer → espeak-ng. The
`libespeak-ng.dylib` bundled in the `espeakng_loader` wheel has its **build-time
data path compiled in** (`/Users/runner/work/...`) and ignores both
`ESPEAK_DATA_PATH` and `EspeakWrapper.set_data_path()`. It fails with:

```
Error processing file '/Users/runner/work/.../espeak-ng-data/phontab': No such file
```

`brew install espeak-ng` and point at `/opt/homebrew/lib/libespeak-ng.dylib`;
`run.sh` already exports the right variables.

### 4. `webrtcvad`, not `webrtcvad-wheels`, will try to compile

mlx-audio's server needs `webrtcvad`, which has no arm64 macOS wheel. Install
`webrtcvad-wheels` instead. The server also needs `uvicorn`, `fastapi` and
`python-multipart`, none of which the base `mlx-audio` wheel declares.

### 5. `uv`-created venvs have no `pip`

`~/wyoming-whisper/.venv` was made with `uv`, so `.venv/bin/pip` does not exist
and `python -m pip` fails. Use
`uv pip install --python ~/wyoming-whisper/.venv/bin/python <pkg>`.

### 6. `KeepAlive` means `pkill` will not free the port

Both LaunchAgents set `KeepAlive`, so launchd restarts them within a second.
To actually stop one:

```bash
launchctl unload ~/Library/LaunchAgents/<label>.plist
while lsof -nP -iTCP:<port> -sTCP:LISTEN >/dev/null; do sleep 1; done
```

### 7. MLX Whisper cannot do beam search

If you are tempted by `mlx_whisper` for STT (it is the fastest option measured,
0.15 s): it raises *"Beam search decoder is not yet implemented"* for **any**
`beam_size`, 1 included, because upstream whisper selects the beam decoder
whenever the option is not `None`. Greedy is the only decoder it has — and
greedy is the bug described above. It is a dead end for this use case.

### 8. LaunchAgents need a login session

These are LaunchAgents, not LaunchDaemons: after a reboot they do not start
until someone logs in. With FileVault enabled that is unavoidable for anything
needing the user keychain or home directory. If the Mac reboots unattended,
voice stays down until login.

---

## Where the numbers came from

All figures here are measured, not estimated, on an M3 Ultra Mac Studio
(32 CPU / 80 GPU cores, 256 GB). STT used a 72-clip suite with pink-noise
mixing at four SNRs and paired comparisons; TTS used five representative kiosk
replies with the model warm. The full working record, including the dead ends,
is in `homelab/asahi-mac-mini-findings-2026-09-19.md` §6 outside this repo.
