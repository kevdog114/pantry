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
const fs = require('fs');

app.post('/connect', (req, res) => {
    const { token, apiUrl, kioskName } = req.body;
    if (!token) return res.status(400).json({ error: 'Token required' });

    console.log('Received connect request', { apiUrl, kioskName });

    if (kioskName) {
        try {
            const config = {
                device_name: kioskName,
                device_id: kioskName.toLowerCase().replace(/[^a-z0-9]/g, '_')
            };
            fs.writeFileSync('kiosk_config.json', JSON.stringify(config));
            console.log("Updated kiosk config:", config);
        } catch (e) {
            console.error("Error writing kiosk config:", e);
        }
    }

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

    socket.on('configure_device', (payload) => {
        console.log('Received configure_device:', payload);
        const { details } = payload;

        if (details && details.config) {
            const fs = require('fs');
            // Save settings locally to be applied to future print jobs
            try {
                let currentSettings = {};
                if (fs.existsSync('device_settings.json')) {
                    currentSettings = JSON.parse(fs.readFileSync('device_settings.json', 'utf8'));
                }

                // Merge new config
                const newSettings = { ...currentSettings, ...details.config };
                fs.writeFileSync('device_settings.json', JSON.stringify(newSettings));
                console.log('Updated local device settings:', newSettings);

            } catch (e) {
                console.error("Error saving device settings:", e);
            }
        }
    });

    socket.on('print_label', (payload) => {
        console.log('Received print command:', payload);

        if (payload.type === 'STOCK_LABEL' || payload.type === 'SAMPLE_LABEL' || payload.type === 'MODIFIER_LABEL' || payload.type === 'RECIPE_LABEL' || payload.type === 'QUICK_LABEL') {

            // Start with data from payload
            const dataObj = payload.data || {};

            // Load local overrides/settings
            try {
                const fs = require('fs');
                if (fs.existsSync('device_settings.json')) {
                    const settings = JSON.parse(fs.readFileSync('device_settings.json', 'utf8'));
                    console.log('Applying device settings to print job:', settings);

                    // Apply mapped settings
                    // Map 'autoCut' from UI to 'cut' for python script
                    if (settings.autoCut !== undefined) dataObj.cut = settings.autoCut;
                    if (settings.highQuality !== undefined) dataObj.dither = settings.highQuality;
                    // Add more mappings as needed
                }
            } catch (e) {
                console.error("Error loading device settings for print:", e);
            }

            // Inject detected size if not present (Legacy/Fallback logic)
            // ... (rest of logic)
            // Inject detected size if not present or override? User requested bridge to handle it.
            // Check any known printer
            let detectedSize = null;
            Object.values(knownPrinters).forEach(p => {
                if (p.detected_label && p.detected_label.width > 0 && p.detected_label.width < 30) {
                    detectedSize = '23mm';
                }
            });

            if (detectedSize) {
                console.log(`Injecting detected size: ${detectedSize}`);
                dataObj.size = detectedSize;
            }

            // Ensure payload has the updated data for referencing if needed, but we mostly use dataObj now
            payload.data = dataObj;

            const data = JSON.stringify(dataObj);
            const requestId = payload.requestId; // Extract request ID

            const fs = require('fs');
            const tmpFile = `/tmp/label_data_${requestId || Date.now()}.json`;

            try {
                fs.writeFileSync(tmpFile, data);
                console.log('Executing python print script...');
                // Use the venv python
                const pythonCmd = '/opt/venv/bin/python3 print_label.py print ' + tmpFile;

                exec(pythonCmd, (err, stdout, stderr) => {
                    let success = true;
                    let message = 'Print successful';

                    if (err) {
                        console.error('Print Error:', err);
                        console.error('Stderr:', stderr);
                        success = false;
                        message = stderr || err.message || 'Unknown print error';
                    } else {
                        console.log('Print Output:', stdout);
                    }

                    // Send result back to backend
                    if (requestId) {
                        socket.emit('print_complete', {
                            requestId: requestId,
                            success: success,
                            message: message
                        });
                    }

                    // Clean up
                    try { fs.unlinkSync(tmpFile); } catch (e) { }
                });
            } catch (e) {
                console.error("Error preparing label data file:", e);
                // Report immediate failure
                if (requestId) {
                    socket.emit('print_complete', {
                        requestId: requestId,
                        success: false,
                        message: "Failed to prepare print data file: " + e.message
                    });
                }
            }
        }
    });

}

// Check devices
const knownPrinters = {};

function checkDevices() {
    const pythonCmd = '/opt/venv/bin/python3 print_label.py';

    exec(`${pythonCmd} discover`, (err, stdout) => {
        if (err) {
            console.error('Discover error:', err);
            return;
        }

        try {
            const devices = JSON.parse(stdout);
            console.log("Discovered devices:", devices);

            if (devices.length > 0) {
                // Check status for each found device
                devices.forEach(device => {
                    exec(`${pythonCmd} status --printer "${device.identifier}"`, (err, stdout) => {
                        let statusInfo = { status: 'ONLINE', media: 'Unknown', errors: [] };

                        if (!err) {
                            try {
                                statusInfo = JSON.parse(stdout);

                                // Cache status globally
                                knownPrinters[device.identifier] = statusInfo;

                            } catch (e) {
                                console.error("Error parsing status output", e);
                            }
                        }

                        if (socket && socket.connected) {
                            console.log('Emitting device_register for', device.identifier);
                            socket.emit('device_register', {
                                name: 'Brother QL-600', // Hardcode name as requested or derived
                                type: 'PRINTER',
                                status: statusInfo.status,
                                details: JSON.stringify({
                                    identifier: device.identifier,
                                    media: statusInfo.media,
                                    detected_label: statusInfo.detected_label,
                                    config: statusInfo.config,
                                    errors: statusInfo.errors
                                })
                            });
                        }
                    });
                });
            } else {
                // No devices found
                console.log("No devices found via discovery.");
            }
        } catch (e) {
            console.error("Error parsing discover output:", e, stdout);
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
