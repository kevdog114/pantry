import { Request, Response } from 'express';
import http from 'http';

const NOVNC_HOST = process.env.PLAYWRIGHT_NOVNC_HOST || 'localhost';
const NOVNC_PORT = process.env.PLAYWRIGHT_NOVNC_PORT || '6080';

// Keep-alive agent for connection pooling
const httpAgent = new http.Agent({
    keepAlive: true,
    keepAliveMsecs: 30000,
    maxSockets: 50,
    maxFreeSockets: 10,
    timeout: 60000
});

/**
 * Proxy HTTP requests to noVNC server (for static files like vnc.html, CSS, JS)
 */
export async function proxyNoVncHttp(req: Request, res: Response) {
    const targetPath = req.path.replace('/playwright/vnc', '');

    console.log(`Proxying HTTP request to noVNC: ${targetPath}`);

    const options: http.RequestOptions = {
        hostname: NOVNC_HOST,
        port: parseInt(NOVNC_PORT),
        path: targetPath || '/',
        method: req.method,
        agent: httpAgent,
        timeout: 30000,
        headers: {
            ...req.headers,
            host: `${NOVNC_HOST}:${NOVNC_PORT}`,
            connection: 'keep-alive'
        }
    };

    const proxyReq = http.request(options, (proxyRes) => {
        // Don't modify headers if response has already started
        if (!res.headersSent) {
            // Forward status code and headers
            res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
        }

        // Pipe the response
        proxyRes.pipe(res, { end: true });
    });

    proxyReq.on('error', (error) => {
        console.error('noVNC HTTP proxy error:', error.message, 'for path:', targetPath);

        if (!res.headersSent) {
            res.status(502).send('Bad Gateway: ' + error.message);
        } else {
            // Response already started, just end it
            res.end();
        }
    });

    proxyReq.on('timeout', () => {
        console.error('noVNC HTTP proxy timeout for path:', targetPath);
        proxyReq.destroy();

        if (!res.headersSent) {
            res.status(504).send('Gateway Timeout');
        } else {
            res.end();
        }
    });

    // Handle client disconnect
    req.on('close', () => {
        if (!proxyReq.destroyed) {
            proxyReq.destroy();
        }
    });

    // If there's a request body, pipe it
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        req.pipe(proxyReq, { end: true });
    } else {
        proxyReq.end();
    }
}

/**
 * Proxy WebSocket connections to noVNC server
 */
export function proxyNoVncWebSocket(req: any, socket: any, head: any) {
    console.log(`WebSocket upgrade request for: ${req.url}`);

    const options: http.RequestOptions = {
        hostname: NOVNC_HOST,
        port: parseInt(NOVNC_PORT),
        path: req.url,
        method: 'GET',
        timeout: 30000,
        headers: {
            'Upgrade': 'websocket',
            'Connection': 'Upgrade',
            'Sec-WebSocket-Version': req.headers['sec-websocket-version'],
            'Sec-WebSocket-Key': req.headers['sec-websocket-key'],
            'Sec-WebSocket-Protocol': req.headers['sec-websocket-protocol'] || '',
        }
    };

    const proxyReq = http.request(options);

    // Handle the upgrade response from the target server
    proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
        console.log('WebSocket upgrade successful to noVNC server');

        // Send the upgrade response back to the client
        socket.write('HTTP/1.1 101 Switching Protocols\r\n');
        Object.keys(proxyRes.headers).forEach(key => {
            socket.write(`${key}: ${proxyRes.headers[key]}\r\n`);
        });
        socket.write('\r\n');

        // Write any initial data from the proxy server
        if (proxyHead && proxyHead.length > 0) {
            socket.write(proxyHead);
        }

        // Pipe data bidirectionally
        proxySocket.pipe(socket, { end: true });
        socket.pipe(proxySocket, { end: true });

        // Error handling
        proxySocket.on('error', (err) => {
            console.error('Proxy socket error:', err.message);
            if (!socket.destroyed) socket.destroy();
        });

        socket.on('error', (err) => {
            console.error('Client socket error:', err.message);
            if (!proxySocket.destroyed) proxySocket.destroy();
        });

        // Cleanup on close
        socket.on('close', () => {
            if (!proxySocket.destroyed) proxySocket.destroy();
        });

        proxySocket.on('close', () => {
            if (!socket.destroyed) socket.destroy();
        });
    });

    proxyReq.on('error', (error) => {
        console.error('WebSocket proxy request error:', error.message);
        if (!socket.destroyed) socket.destroy();
    });

    proxyReq.on('timeout', () => {
        console.error('WebSocket proxy timeout');
        if (!proxyReq.destroyed) proxyReq.destroy();
        if (!socket.destroyed) socket.destroy();
    });

    // Send the upgrade request
    proxyReq.end();
}
