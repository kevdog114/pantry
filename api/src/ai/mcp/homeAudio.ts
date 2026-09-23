/**
 * MCP client for the HassNote home-audio bridge.
 *
 * The bridge exposes a stateless Streamable HTTP MCP server at POST /mcp
 * (JSON-RPC 2.0, no sessions, no SSE), so this needs no MCP SDK — discovery is
 * one HTTP round trip and a tool call is another.
 *
 * Tools are discovered at runtime via tools/list, which means the audio
 * vocabulary lives in the home-audio repo: adding a capability there makes it
 * available here on the next refresh with no change to this codebase.
 *
 * Two deliberate constraints:
 *
 *  1. Only the tools in VOICE_TOOLS are exposed. The bridge publishes ~40, and
 *     pantry already defines ~38 of its own. Handing a small local model
 *     (gemma-4-26b-a4b, reasoning disabled) a 78-tool list measurably degrades
 *     tool selection, so we take the handful that matter for kitchen voice.
 *  2. Failure is never fatal. If the bridge is unreachable we serve the last
 *     known list, or none at all — pantry's own tools keep working.
 */

const MCP_PATH = '/mcp';
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8000;

/** Prefix that marks a tool as belonging to the audio bridge (and routes it). */
export const AUDIO_TOOL_PREFIX = 'audio_';

/**
 * The subset of bridge tools offered to the model. Names are the bridge's own.
 * Keep this tight — every entry competes for the model's attention against
 * pantry's tools.
 */
const VOICE_TOOLS = new Set([
  'play_music',                // play a named song/album/artist/playlist
  'play_prompt',               // "something chill for cooking" -> bridge's own LLM
  'play_bookmark',             // saved one-tap mixes
  'playback_control',          // play / pause / next / previous / stop
  'set_volume',
  'get_now_playing',
  'list_rooms',
  'add_room_to_playback',
  'remove_room_from_playback',
  'search_music',
]);

interface McpTool {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: any;
}

/** Gemini-style function declaration, the shape toolDefinitions.ts emits. */
interface FunctionDeclaration {
  name: string;
  description: string;
  parameters: any;
}

let cachedTools: FunctionDeclaration[] = [];
let displayNames: Record<string, string> = {};
let lastRefreshOk: number | null = null;
let refreshTimer: NodeJS.Timeout | null = null;
let seq = 0;

function baseUrl(): string | null {
  const url = process.env.HOMEAUDIO_URL;
  return url && url.trim().length > 0 ? url.replace(/\/+$/, '') : null;
}

/** Single JSON-RPC call against the bridge. Throws on transport/protocol error. */
async function rpc(method: string, params?: any): Promise<any> {
  const base = baseUrl();
  if (!base) throw new Error('HOMEAUDIO_URL is not configured');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  // The bridge runs in open-LAN mode unless API_TOKEN is set on it.
  if (process.env.HOMEAUDIO_API_TOKEN) {
    headers.Authorization = `Bearer ${process.env.HOMEAUDIO_API_TOKEN}`;
  }
  if (process.env.HOMEAUDIO_CONFIG_TOKEN) {
    headers['X-Config-Token'] = process.env.HOMEAUDIO_CONFIG_TOKEN;
  }

  const res = await fetch(`${base}${MCP_PATH}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: ++seq, method, params }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`MCP ${method} -> HTTP ${res.status}`);
  }

  const body: any = await res.json();
  if (body?.error) {
    throw new Error(`MCP ${method} -> ${body.error.message || 'rpc error'}`);
  }
  return body?.result;
}

/**
 * Strip JSON Schema keywords that Gemini's functionDeclarations reject.
 * The OpenAI path tolerates them, but the schema is shared, so normalise to the
 * stricter dialect.
 */
function sanitizeSchema(schema: any): any {
  if (schema === null || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map(sanitizeSchema);

  const out: any = {};
  for (const [key, value] of Object.entries(schema)) {
    if (
      key === '$schema' ||
      key === 'additionalProperties' ||
      key === 'oneOf' || key === 'anyOf' || key === 'allOf' ||
      key === 'const' ||
      key === 'maxLength' || key === 'minLength' ||
      key === 'default' ||
      key === 'examples'
    ) {
      continue;
    }
    out[key] = sanitizeSchema(value);
  }
  return out;
}

/** Fetch tools/list, filter to the voice subset, cache as function declarations. */
export async function refreshAudioTools(): Promise<number> {
  if (!baseUrl()) return 0;

  const result = await rpc('tools/list');
  const tools: McpTool[] = Array.isArray(result?.tools) ? result.tools : [];

  const next: FunctionDeclaration[] = [];
  const names: Record<string, string> = {};

  for (const tool of tools) {
    if (!VOICE_TOOLS.has(tool.name)) continue;
    const prefixed = `${AUDIO_TOOL_PREFIX}${tool.name}`;
    next.push({
      name: prefixed,
      description: tool.description || tool.title || tool.name,
      parameters: sanitizeSchema(tool.inputSchema) || { type: 'object', properties: {} },
    });
    names[prefixed] = tool.title || tool.name.replace(/_/g, ' ');
  }

  const missing = [...VOICE_TOOLS].filter(n => !tools.some(t => t.name === n));
  if (missing.length > 0) {
    console.warn(`[HomeAudioMCP] bridge did not offer: ${missing.join(', ')}`);
  }

  cachedTools = next;
  displayNames = names;
  lastRefreshOk = Date.now();
  console.log(`[HomeAudioMCP] ${next.length} audio tools available (of ${tools.length} published)`);
  return next.length;
}

/** Cached declarations. Empty when the bridge has never been reachable. */
export function getAudioToolDefinitions(): FunctionDeclaration[] {
  return cachedTools;
}

export function getAudioToolDisplayName(name: string): string | undefined {
  return displayNames[name];
}

export function isAudioTool(name: string): boolean {
  return name.startsWith(AUDIO_TOOL_PREFIX);
}

/**
 * Invoke a bridge tool. The bridge reports tool failures as results with
 * isError, carrying text the model can act on ("No room matches ..."), so
 * those are returned rather than thrown.
 */
export async function callAudioTool(prefixedName: string, args: any): Promise<string> {
  const name = prefixedName.slice(AUDIO_TOOL_PREFIX.length);
  try {
    const result = await rpc('tools/call', { name, arguments: args ?? {} });
    const text = Array.isArray(result?.content)
      ? result.content.map((c: any) => (typeof c?.text === 'string' ? c.text : '')).join('\n').trim()
      : '';
    return text || (result?.isError ? 'The audio bridge reported an error.' : 'Done.');
  } catch (err: any) {
    // Transport failure: re-discover on the next tick in case the bridge restarted.
    console.error(`[HomeAudioMCP] ${name} failed:`, err?.message || err);
    void refreshAudioTools().catch(() => undefined);
    return `The home audio system could not be reached (${err?.message || 'unknown error'}).`;
  }
}

/** Discover at boot and keep the list fresh. Never throws. */
export function startAudioToolDiscovery(): void {
  if (!baseUrl()) {
    console.log('[HomeAudioMCP] HOMEAUDIO_URL not set — audio tools disabled');
    return;
  }
  const tick = () => {
    refreshAudioTools().catch(err => {
      const age = lastRefreshOk ? `${Math.round((Date.now() - lastRefreshOk) / 1000)}s ago` : 'never';
      console.warn(`[HomeAudioMCP] discovery failed (last success: ${age}):`, err?.message || err);
    });
  };
  tick();
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(tick, REFRESH_INTERVAL_MS);
  refreshTimer.unref?.();
}
