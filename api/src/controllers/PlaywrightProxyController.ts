import { Request, Response } from 'express';
import http from 'http';

const NOVNC_HOST = process.env.PLAYWRIGHT_NOVNC_HOST || 'localhost';
const NOVNC_PORT = process.env.PLAYWRIGHT_NOVNC_PORT || '6080';

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
        headers: {
            ...req.headers,
            host: `${NOVNC_HOST}:${NOVNC_PORT}`
        }
    };

    const proxyReq = http.request(options, (proxyRes) => {
        // Forward status code and headers
        res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);

        // Pipe the response
        proxyRes.pipe(res);
    });

    proxyReq.on('error', (error) => {
        console.error('noVNC HTTP proxy error:', error);
        res.status(502).json({ success: false, error: error.message });
    });

    // If there's a request body, pipe it
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        req.pipe(proxyReq);
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
        proxySocket.pipe(socket);
        socket.pipe(proxySocket);

        // Error handling
        proxySocket.on('error', (err) => {
            console.error('Proxy socket error:', err);
            socket.destroy();
        });

        socket.on('error', (err) => {
            console.error('Client socket error:', err);
            proxySocket.destroy();
        });

        // Cleanup on close
        socket.on('close', () => {
            proxySocket.destroy();
        });

        proxySocket.on('close', () => {
            socket.destroy();
        });
    });

    proxyReq.on('error', (error) => {
        console.error('WebSocket proxy request error:', error);
        socket.destroy();
    });

    // Send the upgrade request
    proxyReq.end();
}
