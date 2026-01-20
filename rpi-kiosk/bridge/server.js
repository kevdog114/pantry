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
    const { token, apiUrl, kioskName, hasKeyboardScanner } = req.body;
    if (!token) return res.status(400).json({ error: 'Token required' });

    console.log('Received connect request', { apiUrl, kioskName, hasKeyboardScanner });

    if (kioskName) {
        try {
            const config = {
                device_name: kioskName,
                device_id: kioskName.toLowerCase().replace(/[^a-z0-9]/g, '_'),
                hasKeyboardScanner: !!hasKeyboardScanner
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

                // Apply settings to printer hardware immediately
                const fs2 = require('fs');
                const tmpConfigFile = `/tmp/config_${Date.now()}.json`;
                try {
                    fs2.writeFileSync(tmpConfigFile, JSON.stringify(newSettings));

                    // Call python script with 'configure' command
                    // Assuming we can target the printer. We need the printer identifier?
                    // The payload has `deviceId` but not the identifier string (USB ID).
                    // However, we can look it up in knownPrinters or pass it if available.
                    // For now, let's try to pass the identifier if we have it in the details, or default.

                    let printerIdentifier = null;
                    if (details.identifier) printerIdentifier = details.identifier;
                    else {
                        // Try to find any connected printer or use default
                        // This might be risky if multiple printers, but usually 1 kiosk = 1 printer.
                    }

                    let cmd = `/opt/venv/bin/python3 print_label.py configure "${tmpConfigFile}"`;
                    if (printerIdentifier) {
                        cmd += ` --printer "${printerIdentifier}"`;
                    }

                    console.log('Executing printer configuration...');
                    const { exec } = require('child_process');
                    exec(cmd, (err, stdout, stderr) => {
                        if (err) {
                            console.error('Configuration Error:', err);
                            console.error('Stderr:', stderr);
                        } else {
                            console.log('Configuration Output:', stdout);
                        }
                        try { fs2.unlinkSync(tmpConfigFile); } catch (e) { }
                    });

                } catch (e) {
                    console.error("Error preparing config file:", e);
                }

            } catch (e) {
                console.error("Error saving device settings:", e);
            }
        }
    });

    socket.on('refresh_kiosk_settings', (settings) => {
        console.log('Received refresh_kiosk_settings:', settings);
        try {
            const fs = require('fs');
            let config = {};
            if (fs.existsSync('kiosk_config.json')) {
                config = JSON.parse(fs.readFileSync('kiosk_config.json', 'utf8'));
            }

            if (settings.hasKeyboardScanner !== undefined) {
                config.hasKeyboardScanner = !!settings.hasKeyboardScanner;
            }

            fs.writeFileSync('kiosk_config.json', JSON.stringify(config));
            console.log("Updated kiosk config:", config);
            checkDevices();
        } catch (e) {
            console.error("Error updating kiosk settings:", e);
        }
    });

    socket.on('print_label', (payload) => {
        console.log('Received print command:', payload);

        // Handle Receipt Printing
        if (payload.type === 'RECEIPT') {
            const dataObj = payload.data || {};
            const requestId = payload.requestId;

            // Find a printer
            let printerId = payload.printerId;
            if (!printerId) {
                const keys = Object.keys(knownReceiptPrinters);
                if (keys.length > 0) printerId = keys[0];
            }

            if (!printerId) {
                console.error("No receipt printer available for print job");
                if (requestId) {
                    socket.emit('print_complete', {
                        requestId, success: false, message: "No receipt printer available"
                    });
                }
                return;
            }

            const fs = require('fs');
            const tmpFile = `/tmp/receipt_${requestId || Date.now()}.json`;

            try {
                fs.writeFileSync(tmpFile, JSON.stringify(dataObj));
                const receiptCmd = `/opt/venv/bin/python3 receipt_printer.py print "${tmpFile}" --printer "${printerId}"`;

                console.log("Executing receipt print...");
                const { exec } = require('child_process');
                exec(receiptCmd, (err, stdout, stderr) => {
                    let success = true;
                    let message = 'Receipt Printed';

                    if (err) {
                        console.error('Receipt Print Error:', err);
                        success = false;
                        message = stderr || err.message;
                    } else {
                        console.log('Receipt Print Output:', stdout);
                    }

                    if (requestId) {
                        socket.emit('print_complete', {
                            requestId, success, message
                        });
                    }
                    try { fs.unlinkSync(tmpFile); } catch (e) { }
                });
            } catch (e) {
                console.error("Error processing receipt:", e);
            }
            return;
        }

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
const knownReceiptPrinters = {};

function checkDevices() {
    const pythonCmd = '/opt/venv/bin/python3 print_label.py';
    const fs = require('fs');

    // Check for Keyboard Scanner Config
    try {
        if (fs.existsSync('kiosk_config.json')) {
            const config = JSON.parse(fs.readFileSync('kiosk_config.json', 'utf8'));
            if (config.hasKeyboardScanner && socket && socket.connected) {
                console.log('Reporting Keyboard Scanner to backend...');
                socket.emit('device_register', {
                    name: 'Kitchen Kiosk Barcode Scanner', // Use fixed name as requested or derived
                    type: 'SCANNER',
                    status: 'ONLINE',
                    details: JSON.stringify({
                        identifier: 'keyboard_scanner',
                        description: 'USB Keyboard Barcode Scanner',
                        config: {}
                    })
                });
            }
        }
    } catch (e) {
        console.error("Error checking kiosk config for scanner:", e);
    }

    exec(`${pythonCmd} discover`, (err, stdout) => {
        if (err) {
            console.error('Discover error:', err);
            // Don't return, allow other checks
        } else { // Proceed if no error
            try {
                const devices = JSON.parse(stdout);
                console.log("Discovered devices:", devices);

                if (devices.length > 0) {
                    // Check status for each found device
                    devices.forEach(device => {
                        exec(`${pythonCmd} status --printer "${device.identifier}"`, (err, stdout, stderr) => {
                            let statusInfo = { status: 'ONLINE', media: 'Unknown', errors: [] };

                            if (stderr) {
                                console.error(`Status stderr for ${device.identifier}:`, stderr);
                            }

                            if (!err) {
                                try {
                                    statusInfo = JSON.parse(stdout);

                                    // Cache status globally
                                    knownPrinters[device.identifier] = statusInfo;

                                } catch (e) {
                                    console.error("Error parsing status output", e);
                                    console.error("Stdout was:", stdout);
                                }
                            } else {
                                console.error("Status check error:", err);
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
        } // End else
    });

    // Check for Receipt Printers
    const receiptCmd = '/opt/venv/bin/python3 receipt_printer.py';
    exec(`${receiptCmd} discover`, (err, stdout) => {
        if (err) {
            // Only log valid errors, ignore if script missing or failing silently
            if (!err.message.includes('No such file'))
                console.error('Receipt Discover warning:', err.message);
            return;
        }

        try {
            const devices = JSON.parse(stdout);
            if (devices.length > 0) {
                devices.forEach(device => {
                    // Cache
                    knownReceiptPrinters[device.identifier] = device;

                    if (socket && socket.connected) {
                        socket.emit('device_register', {
                            name: device.model || 'Receipt Printer',
                            type: 'RECEIPT_PRINTER',
                            status: device.connected ? 'ONLINE' : 'OFFLINE',
                            details: JSON.stringify({
                                identifier: device.identifier,
                                description: device.model,
                                vendorId: device.vendorId,
                                productId: device.productId
                            })
                        });
                    }
                });
            }
        } catch (e) {
            console.error("Error parsing receipt discover output:", e);
        }
    });

}

// Poll devices every 30 seconds
setInterval(checkDevices, 30000);



// Run initial check
checkDevices();

// Initialize Hardware Scanner Service
try {
    const ScannerService = require('./scanner_service');
    const scanner = new ScannerService();

    scanner.on('scan', (barcode) => {
        console.log('Hardware Scanner Scan:', barcode);

        // Log to bridge.log
        const fs = require('fs');
        const logEntry = `${new Date().toISOString()} - ${barcode}\n`;

        fs.appendFile('bridge.log', logEntry, (err) => {
            if (err) console.error('Error writing to bridge.log:', err);
        });

        // Emit to backend
        if (socket && socket.connected) {
            console.log('Emitting barcode to backend');
            socket.emit('barcode_scan', { barcode });
        } else {
            console.log('Socket not connected, generic barcode scan not sent');
        }
    });
} catch (e) {
    console.error('Failed to initialize ScannerService:', e);
}

const PORT = 8080;
app.listen(PORT, () => {
    console.log(`Bridge running on port ${PORT}`);
});
