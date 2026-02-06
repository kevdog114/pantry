import { Request, Response } from 'express';
import http from 'http';

const MCP_HOST = process.env.PLAYWRIGHT_MCP_HOST || 'localhost';
const MCP_PORT = process.env.PLAYWRIGHT_MCP_PORT || '8931';
const NOVNC_HOST = process.env.PLAYWRIGHT_NOVNC_HOST || 'localhost';
const NOVNC_PORT = process.env.PLAYWRIGHT_NOVNC_PORT || '6080';

interface McpToolCall {
    method: string;
    params?: Record<string, unknown>;
}

interface McpResponse {
    success: boolean;
    result?: unknown;
    error?: string;
}

/**
 * Proxy a request to the Playwright MCP server
 */
export async function proxyToMcp(data: McpToolCall): Promise<McpResponse> {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify(data);

        const options: http.RequestOptions = {
            hostname: MCP_HOST,
            port: parseInt(MCP_PORT),
            path: '/mcp',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = http.request(options, (res) => {
            let responseData = '';

            res.on('data', (chunk) => {
                responseData += chunk;
            });

            res.on('end', () => {
                try {
                    const parsed = JSON.parse(responseData);
                    resolve({ success: true, result: parsed });
                } catch (e) {
                    resolve({ success: true, result: responseData });
                }
            });
        });

        req.on('error', (error) => {
            reject({ success: false, error: error.message });
        });

        req.setTimeout(30000, () => {
            req.destroy();
            reject({ success: false, error: 'Request timeout' });
        });

        req.write(postData);
        req.end();
    });
}

/**
 * Get the status/health of the Playwright MCP container
 */
export async function getStatus(req: Request, res: Response) {
    try {
        // Try to connect to the MCP server
        const response = await proxyToMcp({ method: 'browser_snapshot' });
        res.json({
            status: 'running',
            mcp: {
                host: MCP_HOST,
                port: MCP_PORT,
                connected: true
            },
            vnc: {
                host: NOVNC_HOST,
                port: NOVNC_PORT
            }
        });
    } catch (error: any) {
        res.json({
            status: 'error',
            mcp: {
                host: MCP_HOST,
                port: MCP_PORT,
                connected: false,
                error: error?.error || 'Connection failed'
            },
            vnc: {
                host: NOVNC_HOST,
                port: NOVNC_PORT
            }
        });
    }
}

/**
 * Get configuration for connecting to the Playwright MCP container
 */
export async function getConfig(req: Request, res: Response) {
    res.json({
        mcp: {
            host: MCP_HOST,
            port: parseInt(MCP_PORT),
            endpoint: `http://${MCP_HOST}:${MCP_PORT}/mcp`
        },
        vnc: {
            host: NOVNC_HOST,
            port: parseInt(NOVNC_PORT),
            // noVNC web interface URL - for direct access
            webUrl: `http://${NOVNC_HOST}:${NOVNC_PORT}/vnc.html?autoconnect=true`
        }
    });
}

/**
 * Navigate to a URL
 */
export async function navigate(req: Request, res: Response) {
    try {
        const { url } = req.body;

        if (!url) {
            res.status(400).json({ success: false, error: 'URL is required' });
            return;
        }

        const response = await proxyToMcp({
            method: 'browser_navigate',
            params: { url }
        });

        res.json(response);
    } catch (error: any) {
        res.status(500).json({ success: false, error: error?.error || 'Navigation failed' });
    }
}

/**
 * Take a snapshot of the current page
 */
export async function snapshot(req: Request, res: Response) {
    try {
        const response = await proxyToMcp({ method: 'browser_snapshot' });
        res.json(response);
    } catch (error: any) {
        res.status(500).json({ success: false, error: error?.error || 'Snapshot failed' });
    }
}

/**
 * Click on an element
 */
export async function click(req: Request, res: Response) {
    try {
        const { ref, element, doubleClick, button, modifiers } = req.body;

        if (!ref) {
            res.status(400).json({ success: false, error: 'Element ref is required' });
            return;
        }

        const response = await proxyToMcp({
            method: 'browser_click',
            params: { ref, element, doubleClick, button, modifiers }
        });

        res.json(response);
    } catch (error: any) {
        res.status(500).json({ success: false, error: error?.error || 'Click failed' });
    }
}

/**
 * Type text into an element
 */
export async function type(req: Request, res: Response) {
    try {
        const { ref, element, text, submit } = req.body;

        if (!ref || !text) {
            res.status(400).json({ success: false, error: 'Element ref and text are required' });
            return;
        }

        const response = await proxyToMcp({
            method: 'browser_type',
            params: { ref, element, text, submit }
        });

        res.json(response);
    } catch (error: any) {
        res.status(500).json({ success: false, error: error?.error || 'Type failed' });
    }
}

/**
 * Fill a form field
 */
export async function fill(req: Request, res: Response) {
    try {
        const { ref, element, value } = req.body;

        if (!ref || value === undefined) {
            res.status(400).json({ success: false, error: 'Element ref and value are required' });
            return;
        }

        const response = await proxyToMcp({
            method: 'browser_fill',
            params: { ref, element, value }
        });

        res.json(response);
    } catch (error: any) {
        res.status(500).json({ success: false, error: error?.error || 'Fill failed' });
    }
}

/**
 * Hover over an element
 */
export async function hover(req: Request, res: Response) {
    try {
        const { ref, element } = req.body;

        if (!ref) {
            res.status(400).json({ success: false, error: 'Element ref is required' });
            return;
        }

        const response = await proxyToMcp({
            method: 'browser_hover',
            params: { ref, element }
        });

        res.json(response);
    } catch (error: any) {
        res.status(500).json({ success: false, error: error?.error || 'Hover failed' });
    }
}

/**
 * Press a keyboard key
 */
export async function pressKey(req: Request, res: Response) {
    try {
        const { key, modifiers } = req.body;

        if (!key) {
            res.status(400).json({ success: false, error: 'Key is required' });
            return;
        }

        const response = await proxyToMcp({
            method: 'browser_press_key',
            params: { key, modifiers }
        });

        res.json(response);
    } catch (error: any) {
        res.status(500).json({ success: false, error: error?.error || 'Key press failed' });
    }
}

/**
 * Select an option from a dropdown
 */
export async function select(req: Request, res: Response) {
    try {
        const { ref, element, values } = req.body;

        if (!ref || !values) {
            res.status(400).json({ success: false, error: 'Element ref and values are required' });
            return;
        }

        const response = await proxyToMcp({
            method: 'browser_select_option',
            params: { ref, element, values }
        });

        res.json(response);
    } catch (error: any) {
        res.status(500).json({ success: false, error: error?.error || 'Select failed' });
    }
}

/**
 * Take a screenshot
 */
export async function screenshot(req: Request, res: Response) {
    try {
        const { raw, ref, element } = req.body;

        const response = await proxyToMcp({
            method: 'browser_screen_capture',
            params: { raw, ref, element }
        });

        res.json(response);
    } catch (error: any) {
        res.status(500).json({ success: false, error: error?.error || 'Screenshot failed' });
    }
}

/**
 * Go back in browser history
 */
export async function goBack(req: Request, res: Response) {
    try {
        const response = await proxyToMcp({ method: 'browser_go_back' });
        res.json(response);
    } catch (error: any) {
        res.status(500).json({ success: false, error: error?.error || 'Go back failed' });
    }
}

/**
 * Go forward in browser history  
 */
export async function goForward(req: Request, res: Response) {
    try {
        const response = await proxyToMcp({ method: 'browser_go_forward' });
        res.json(response);
    } catch (error: any) {
        res.status(500).json({ success: false, error: error?.error || 'Go forward failed' });
    }
}

/**
 * Close the browser
 */
export async function closeBrowser(req: Request, res: Response) {
    try {
        const response = await proxyToMcp({ method: 'browser_close' });
        res.json(response);
    } catch (error: any) {
        res.status(500).json({ success: false, error: error?.error || 'Close browser failed' });
    }
}

/**
 * Execute a generic MCP tool call
 */
export async function executeTool(req: Request, res: Response) {
    try {
        const { method, params } = req.body;

        if (!method) {
            res.status(400).json({ success: false, error: 'Method is required' });
            return;
        }

        const response = await proxyToMcp({ method, params });
        res.json(response);
    } catch (error: any) {
        res.status(500).json({ success: false, error: error?.error || 'Tool execution failed' });
    }
}

/**
 * Get console messages from the browser
 */
export async function getConsoleMessages(req: Request, res: Response) {
    try {
        const { level } = req.query;

        const response = await proxyToMcp({
            method: 'browser_console_messages',
            params: { level: level as string || 'info' }
        });

        res.json(response);
    } catch (error: any) {
        res.status(500).json({ success: false, error: error?.error || 'Get console messages failed' });
    }
}

/**
 * Resize browser window
 */
export async function resize(req: Request, res: Response) {
    try {
        const { width, height } = req.body;

        if (!width || !height) {
            res.status(400).json({ success: false, error: 'Width and height are required' });
            return;
        }

        const response = await proxyToMcp({
            method: 'browser_resize',
            params: { width, height }
        });

        res.json(response);
    } catch (error: any) {
        res.status(500).json({ success: false, error: error?.error || 'Resize failed' });
    }
}

/**
 * Wait for an element to appear
 */
export async function waitForElement(req: Request, res: Response) {
    try {
        const { ref, element, state, timeout } = req.body;

        if (!ref) {
            res.status(400).json({ success: false, error: 'Element ref is required' });
            return;
        }

        const response = await proxyToMcp({
            method: 'browser_wait_for',
            params: { ref, element, state, timeout }
        });

        res.json(response);
    } catch (error: any) {
        res.status(500).json({ success: false, error: error?.error || 'Wait failed' });
    }
}
