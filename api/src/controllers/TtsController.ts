import { Request, Response } from 'express';

/**
 * Text-to-speech for the kiosk, proxied to Kokoro on the Mac Studio.
 *
 * Proxied rather than called from the browser because the TTS server has no
 * CORS headers and no auth — it is a bare LAN service. Routing through the API
 * also keeps its address out of the UI bundle.
 *
 * See docs/voice-stack.md for the service itself and why it runs where it does.
 */

const TTS_URL = process.env.TTS_URL || '';
const TTS_MODEL = process.env.TTS_MODEL || 'mlx-community/Kokoro-82M-bf16';
const TTS_VOICE = process.env.TTS_VOICE || 'af_heart';

/**
 * Cap on what will be synthesised. The model prompt already asks for short
 * spoken answers; this is the backstop for when it ignores that, so a runaway
 * reply cannot tie up the kiosk speaker for a minute.
 */
const MAX_CHARS = 1000;

/** Synthesis is ~0.1s warm, but a cold service loads the model first. */
const TIMEOUT_MS = 20000;

/**
 * Strip the markdown the model emits for the screen.
 *
 * The spoken-mode system prompt asks for plain prose, but it is not reliable
 * about it, and a stray asterisk is read aloud as "asterisk" by some voices.
 * Cheap to do here and it cannot make the audio worse.
 */
export function forSpeech(text: string): string {
    return (text || '')
        .replace(/```[\s\S]*?```/g, ' ')          // fenced code
        .replace(/`([^`]*)`/g, '$1')              // inline code
        .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')    // images
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')  // links -> their text
        .replace(/^\s{0,3}#{1,6}\s+/gm, '')       // headings
        .replace(/^\s{0,3}[-*+]\s+/gm, '')        // bullets
        .replace(/^\s{0,3}\d+\.\s+/gm, '')        // numbered list markers
        .replace(/^\s{0,3}>\s?/gm, '')            // block quotes
        .replace(/(\*\*|__)(.*?)\1/g, '$2')       // bold
        .replace(/(\*|_)(.*?)\1/g, '$2')          // italic
        .replace(/~~(.*?)~~/g, '$1')              // strikethrough
        .replace(/^\s*([-*_]\s*){3,}$/gm, ' ')    // horizontal rules
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{2,}/g, '. ')                 // paragraph breaks -> a pause
        .replace(/\n/g, ' ')
        .replace(/\s*\.\s*\./g, '.')              // ".." from the line above
        .trim();
}

/**
 * POST /tts/speak  { text } -> audio/wav
 *
 * Returns the audio itself rather than a URL: the kiosk plays it straight from
 * the response, and nothing needs to be stored or cleaned up.
 */
export const speak = async (req: Request, res: Response) => {
    if (!TTS_URL) {
        return res.status(503).json({ error: 'TTS is not configured (TTS_URL unset)' });
    }

    const raw = typeof req.body?.text === 'string' ? req.body.text : '';
    const text = forSpeech(raw).slice(0, MAX_CHARS);
    if (!text) {
        return res.status(400).json({ error: 'No text to speak' });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const upstream = await fetch(TTS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: req.body?.model || TTS_MODEL,
                voice: req.body?.voice || TTS_VOICE,
                input: text,
            }),
            signal: controller.signal,
        });

        if (!upstream.ok) {
            const detail = (await upstream.text().catch(() => '')).slice(0, 200);
            console.error(`[TTS] upstream ${upstream.status}: ${detail}`);
            return res.status(502).json({ error: `TTS upstream returned ${upstream.status}` });
        }

        const audio = Buffer.from(await upstream.arrayBuffer());
        res.setHeader('Content-Type', upstream.headers.get('content-type') || 'audio/wav');
        res.setHeader('Content-Length', String(audio.length));
        res.setHeader('Cache-Control', 'no-store');
        return res.end(audio);
    } catch (err: any) {
        const aborted = err?.name === 'AbortError';
        console.error(`[TTS] ${aborted ? 'timed out' : 'failed'}:`, err?.message || err);
        return res.status(aborted ? 504 : 502).json({
            error: aborted ? 'TTS timed out' : 'TTS request failed',
        });
    } finally {
        clearTimeout(timer);
    }
};
