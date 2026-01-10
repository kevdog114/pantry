const express = require('express');
const { io } = require('socket.io-client');
const cors = require('cors');
const { exec } = require('child_process');

const app = express();
app.use(cors());
app.use(express.json());

let socket = null;
// Store the token and backend URL in memory
let state = {
    token: null,
    backendUrl: process.env.BACKEND_URL || 'http://localhost:4300'
};

// API to check health
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        connected: !!(socket && socket.connected),
        device: 'Brother QL-600' // Hardcoded support for now
    });
});

// API to connect to backend
app.post('/connect', (req, res) => {
    const { token, apiUrl } = req.body;
    if (!token) return res.status(400).json({ error: 'Token required' });

    console.log('Received connect request', { apiUrl });

    state.token = token;
    if (apiUrl) state.backendUrl = apiUrl;

    connectSocket();

    res.json({ success: true });
});

function connectSocket() {
    if (socket) {
        socket.disconnect();
        socket = null;
    }

    // Extract the origin and path for socket.io
    // Update logic to match frontend app KioskLoginComponent approach

    let origin = '';
    let socketPath = '/socket.io'; // default

    try {
        const url = new URL(state.backendUrl);
        origin = url.origin;

        let pathname = url.pathname;
        if (!pathname.endsWith('/')) {
            pathname += '/';
        }
        // If the URL has a path (like /api), we assume socket.io is served under that path (e.g. /api/socket.io)
        if (pathname !== '/' && pathname.length > 1) {
            socketPath = `${pathname}socket.io`;
        }

        // Ensure socketPath has leading slash (it should from pathname)
        if (!socketPath.startsWith('/')) socketPath = '/' + socketPath;

        // User request: ensure it ends with slash? Not standard, but let's try or just ensure robustness.
        // Actually, if user says "endpoint has to end with a /", maybe they found that out.
        // Let's try appending slash if not present?
        // socket.io usually strips it or adds it. 
        // Let's NOT force it unless I'm sure.
        // BUT, if I am following the user's lead...
        // Let's assume they mean config. 

        // Actually, looking at logs: `Connection error: timeout`.
        // This means it can't reach the handshake. 
        // If I change nothing, it won't work.

        // Let's try forcing the path to be `/api/socket.io/` 
        // if that helps?

        // Actually, let's just use what the Frontend does? 
        // Frontend does NOT add trailing slash to `socketPath`.

        // Maybe the user meant `state.backendUrl` needs a slash? 
        // `https://pantry.klschaefer.com/api/`? 

        // Let's just update the code to handle trailing slash on socketPath appropriately just in case.
        // But I will stick to the plan: Maybe I should use `io(state.backendUrl)` ?

        // Let's just try adding the slash to socketPath as requested.
        // socketPath = `${pathname}socket.io/` ?

        // Re-reading user request: "it looks like the socket.io endpoint has to end with a / ?"
        // I will implement that.

        if (!socketPath.endsWith('/')) {
            socketPath += '/';
        }
    } catch (e) {
        console.error("Invalid URL format", state.backendUrl);
        origin = state.backendUrl;
    }

    console.log(`Socket connecting to origin: ${origin} with path: ${socketPath}`);

    console.log("Socket token", state.token);
    try {
        socket = io(origin, {
            path: socketPath,
            auth: { token: state.token },
            transports: ['polling', 'websocket'], // Start with polling (curl verified this works)
            reconnection: true,
            reconnectionDelay: 5000
        });
    } catch (e) {
        console.error("Socket connection error", e);
        throw e;
    }

    socket.on('connect', () => {
        console.log('Connected to backend');
        checkDevices();
    });

    socket.on('connect_error', (err) => {
        console.error('Connection error:', err.message);
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from backend');
    });

    socket.on('print_label', (payload) => {
        console.log('Received print command:', payload);

        // Example execution:
        // Use lp if available, or just log.
        // Assuming we might have `lp` installed.
        // Brother QL-600 logic:
        // Ideally we generate an image or use ptsender.

        // For Proof of Concept: Log it explicitly.
        // If we wanted to print:
        // If we wanted to print:
        if (payload.type === 'STOCK_LABEL' || payload.type === 'SAMPLE_LABEL') {
            const data = JSON.stringify(payload.data);

            const fs = require('fs');
            const tmpFile = '/tmp/label_data.json';

            try {
                fs.writeFileSync(tmpFile, data);
                console.log('Executing python print script...');
                // Use the venv python
                const pythonCmd = '/opt/venv/bin/python3 print_label.py /tmp/label_data.json';

                exec(pythonCmd, (err, stdout, stderr) => {
                    if (err) {
                        console.error('Print Error:', err);
                        console.error('Stderr:', stderr);
                    } else {
                        console.log('Print Output:', stdout);
                    }
                    // Clean up
                    try { fs.unlinkSync(tmpFile); } catch (e) { }
                });
            } catch (e) {
                console.error("Error preparing label data file:", e);
            }
        }
    });
}

// Check devices
function checkDevices() {
    // Check for Brother QL-600
    // We use lsusb to detect it. 
    // Vendor ID 0x04f9 (Brother Industries, Ltd)
    // Product ID for QL-600 is likely around 0x20xx
    exec('lsusb', (err, stdout) => {
        if (err) {
            console.error('lsusb error:', err);
            return;
        }

        // Simple string check for now
        const isConnected = stdout.includes('Brother') || stdout.toLowerCase().includes('ql-600');

        console.log('Device Check:', { isConnected, stdout });

        if (socket && socket.connected) {
            console.log('Emitting device_register...');
            socket.emit('device_register', {
                name: 'Brother QL-600',
                type: 'PRINTER',
                status: isConnected ? 'ONLINE' : 'OFFLINE',
                details: JSON.stringify({ raw: stdout })
            });
        } else {
            console.log('Skipping device_register: Socket not connected');
        }
    });
}

// Poll devices every 30 seconds
setInterval(checkDevices, 30000);

// Run initial check
checkDevices();

const PORT = 8080;
app.listen(PORT, () => {
    console.log(`Bridge running on port ${PORT}`);
});
