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

    console.log(`Connecting to ${state.backendUrl}...`);
    socket = io(state.backendUrl, {
        auth: { token: state.token },
        transports: ['websocket'],
        reconnection: true,
        reconnectionDelay: 5000
    });

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
        if (payload.type === 'STOCK_LABEL') {
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
            socket.emit('device_register', {
                name: 'Brother QL-600',
                type: 'PRINTER',
                status: isConnected ? 'ONLINE' : 'OFFLINE',
                details: JSON.stringify({ raw: stdout })
            });
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
