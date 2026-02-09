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

const packageJson = require('./package.json');

// API to check health
app.get('/health', (req, res) => {
    const scaleList = Object.values(knownScales).map(s => ({
        model: s.model,
        firmware: s.firmware,
        status: s.connected ? 'ONLINE' : 'OFFLINE'
    }));

    res.json({
        status: 'ok',
        connected: !!(socket && socket.connected),
        device: 'Brother QL-600', // Hardcoded support for now
        version: packageJson.version,
        scales: scaleList
    });
});

// API to connect to backend
const fs = require('fs');
const path = require('path');

const DATA_DIR = '/data';
const useDataDir = fs.existsSync(DATA_DIR);

const KIOSK_CONFIG_FILE = useDataDir ? path.join(DATA_DIR, 'kiosk_config.json') : 'kiosk_config.json';
const DEVICE_SETTINGS_FILE = useDataDir ? path.join(DATA_DIR, 'device_settings.json') : 'device_settings.json';
const SIP_CONFIG_FILE = useDataDir ? path.join(DATA_DIR, 'sip_config.json') : 'sip_config.json';

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
            fs.writeFileSync(KIOSK_CONFIG_FILE, JSON.stringify(config));
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

// Display State
let isDisplayOn = true;

app.post('/display-state', (req, res) => {
    const { state: displayState } = req.body;
    console.log(`Received display state update: ${displayState}`);

    isDisplayOn = (displayState === 'ON');

    if (displayState === 'OFF') {
        // Kill scale monitor if it's running
        if (scaleMonitorProcess) {
            console.log("Display OFF: Stopping Scale Monitor to save resources");
            scaleMonitorProcess.kill();
            scaleMonitorProcess = null;
            currentScalePort = null;
        }
    } else {
        // If ON, try to start immediately if we know the scale
        console.log("Display ON: Enabling devices check");
        checkDevices();

        const keys = Object.keys(knownScales);
        if (keys.length > 0) {
            const port = keys[0];
            if (!scaleMonitorProcess || currentScalePort !== port) {
                console.log("Display ON: Immediate scale restart");
                startScaleMonitor(port);
            }
        }
    }

    if (socket && socket.connected) {
        socket.emit('display_state', { state: displayState });
        res.json({ success: true });
    } else {
        // Even if socket is down, we processed the local action
        res.json({ success: true, socket: false });
    }
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
            query: { clientType: 'bridge' },
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
                if (fs.existsSync(DEVICE_SETTINGS_FILE)) {
                    currentSettings = JSON.parse(fs.readFileSync(DEVICE_SETTINGS_FILE, 'utf8'));
                }

                // Merge new config
                const newSettings = { ...currentSettings, ...details.config };
                fs.writeFileSync(DEVICE_SETTINGS_FILE, JSON.stringify(newSettings));
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
            if (fs.existsSync(KIOSK_CONFIG_FILE)) {
                config = JSON.parse(fs.readFileSync(KIOSK_CONFIG_FILE, 'utf8'));
            }

            if (settings.hasKeyboardScanner !== undefined) {
                config.hasKeyboardScanner = !!settings.hasKeyboardScanner;
            }

            fs.writeFileSync(KIOSK_CONFIG_FILE, JSON.stringify(config));
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
                exec(receiptCmd, { timeout: 15000 }, (err, stdout, stderr) => { // Timeout 15s to catch hangs
                    let success = true;
                    let message = 'Receipt Printed';

                    if (err) {
                        console.error('Receipt Print Error:', err);
                        success = false;
                        message = stderr || err.message;
                        if (err.signal === 'SIGTERM') {
                            message = "Printer script timed out (hung). Check hardware connection.";
                        }
                    } else {
                        console.log('Receipt Print Output:', stdout);
                        if (stderr) console.error('Receipt Print Stderr:', stderr);
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
                if (requestId) {
                    socket.emit('print_complete', {
                        requestId, success: false, message: "Bridge Error: " + e.message
                    });
                }
            }
            return;
        }

        // Handle Custom QR Receipt Printing
        if (payload.type === 'CUSTOM_QR_RECEIPT') {
            const dataObj = payload.data || {};
            const requestId = payload.requestId;

            // Find a receipt printer
            let printerId = payload.printerId;
            if (!printerId) {
                const keys = Object.keys(knownReceiptPrinters);
                if (keys.length > 0) printerId = keys[0];
            }

            if (!printerId) {
                console.error("No receipt printer available for custom QR print job");
                if (requestId) {
                    socket.emit('print_complete', {
                        requestId, success: false, message: "No receipt printer available"
                    });
                }
                return;
            }

            const fs = require('fs');
            const tmpFile = `/tmp/custom_qr_receipt_${requestId || Date.now()}.json`;

            try {
                fs.writeFileSync(tmpFile, JSON.stringify(dataObj));
                const receiptCmd = `/opt/venv/bin/python3 receipt_printer.py print "${tmpFile}" --printer "${printerId}"`;

                console.log("Executing custom QR receipt print...");
                const { exec } = require('child_process');
                exec(receiptCmd, { timeout: 15000 }, (err, stdout, stderr) => {
                    let success = true;
                    let message = 'Custom QR Receipt Printed';

                    if (err) {
                        console.error('Custom QR Receipt Print Error:', err);
                        success = false;
                        message = stderr || err.message;
                        if (err.signal === 'SIGTERM') {
                            message = "Printer script timed out (hung). Check hardware connection.";
                        }
                    } else {
                        console.log('Custom QR Receipt Print Output:', stdout);
                        if (stderr) console.error('Custom QR Receipt Print Stderr:', stderr);
                    }

                    if (requestId) {
                        socket.emit('print_complete', {
                            requestId, success, message
                        });
                    }
                    try { fs.unlinkSync(tmpFile); } catch (e) { }
                });
            } catch (e) {
                console.error("Error processing custom QR receipt:", e);
                if (requestId) {
                    socket.emit('print_complete', {
                        requestId, success: false, message: "Bridge Error: " + e.message
                    });
                }
            }
            return;
        }

        // Handle Custom QR Label Printing
        if (payload.type === 'CUSTOM_QR_LABEL') {
            const dataObj = payload.data || {};
            const requestId = payload.requestId;

            const fs = require('fs');
            const tmpFile = `/tmp/custom_qr_label_${requestId || Date.now()}.json`;

            try {
                fs.writeFileSync(tmpFile, JSON.stringify(dataObj));
                console.log('Executing custom QR label print...');
                const pythonCmd = '/opt/venv/bin/python3 print_label.py print ' + tmpFile;

                exec(pythonCmd, { timeout: 15000 }, (err, stdout, stderr) => {
                    let success = true;
                    let message = 'Custom QR Label Printed';

                    if (err) {
                        console.error('Custom QR Label Print Error:', err);
                        console.error('Stderr:', stderr);
                        success = false;
                        message = stderr || err.message || 'Unknown print error';
                        if (err.signal === 'SIGTERM') {
                            message = "Printer script timed out (hung). Check hardware connection.";
                        }
                    } else {
                        console.log('Custom QR Label Print Output:', stdout);
                    }

                    if (requestId) {
                        socket.emit('print_complete', {
                            requestId, success, message
                        });
                    }
                    try { fs.unlinkSync(tmpFile); } catch (e) { }
                });
            } catch (e) {
                console.error("Error preparing custom QR label data file:", e);
                if (requestId) {
                    socket.emit('print_complete', {
                        requestId, success: false, message: "Failed to prepare print data file: " + e.message
                    });
                }
            }
            return;
        }

        if (payload.type === 'STOCK_LABEL' || payload.type === 'SAMPLE_LABEL' || payload.type === 'MODIFIER_LABEL' || payload.type === 'RECIPE_LABEL' || payload.type === 'QUICK_LABEL') {

            // Start with data from payload
            const dataObj = payload.data || {};

            // Load local overrides/settings
            try {
                const fs = require('fs');
                if (fs.existsSync(DEVICE_SETTINGS_FILE)) {
                    const settings = JSON.parse(fs.readFileSync(DEVICE_SETTINGS_FILE, 'utf8'));
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

                exec(pythonCmd, { timeout: 15000 }, (err, stdout, stderr) => { // 15s Timeout
                    let success = true;
                    let message = 'Print successful';

                    if (err) {
                        console.error('Print Error:', err);
                        console.error('Stderr:', stderr);
                        success = false;
                        message = stderr || err.message || 'Unknown print error';
                        if (err.signal === 'SIGTERM') {
                            message = "Printer script timed out (hung). Check hardware connection.";
                        }
                    } else {
                        console.log('Print Output:', stdout);
                        // Also check for library-level errors logged to standard output/error but with exit code 0 if any
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

    socket.on('read_scale', (payload) => {
        const requestId = payload.requestId;

        // Try to return info from monitor if available
        if (requestId) {
            // Wait a brief moment to see if monitor had something?
            // Or just return last known state

            const keys = Object.keys(knownScales);
            if (keys.length === 0) {
                socket.emit('scale_reading', {
                    requestId, success: false, message: "No scale available"
                });
                return;
            }

            if (lastScaleState && lastScaleState.weight !== null) {
                socket.emit('scale_reading', {
                    requestId,
                    success: true,
                    data: { weight: lastScaleState.weight, unit: 'g' }
                });
            } else {
                // Not ready yet
                socket.emit('scale_reading', {
                    requestId, success: false, message: "Scale initializing..."
                });
            }
        }
    });

    socket.on('get_serial_ports', (payload) => {
        console.log('[DEBUG] Received get_serial_ports request', payload);
        const requestId = payload.requestId;
        const cmd = `/opt/venv/bin/python3 flash_tool.py list`;

        console.log(`[DEBUG] Executing: ${cmd}`);
        const { exec } = require('child_process');
        exec(cmd, { timeout: 5000 }, (err, stdout, stderr) => {
            console.log(`[DEBUG] Exec finished. Err: ${err ? 'Yes' : 'No'}, Stdout len: ${stdout ? stdout.length : 0}, Stderr: ${stderr}`);
            if (err) {
                console.error('List Ports Error:', err);
                if (err.signal === 'SIGTERM') {
                    console.log('[DEBUG] Emitting timeout failure');
                    socket.emit('serial_ports_list', { requestId, success: false, message: "Timeout listing ports. Busy?" });
                } else {
                    console.log('[DEBUG] Emitting error failure');
                    socket.emit('serial_ports_list', { requestId, success: false, message: stderr || err.message });
                }
            } else {
                try {
                    console.log(`[DEBUG] Parsing stdout: ${stdout}`);
                    const ports = JSON.parse(stdout);
                    console.log('[DEBUG] Emitting success');
                    socket.emit('serial_ports_list', { requestId, success: true, ports });
                } catch (e) {
                    console.error('[DEBUG] Parse error:', e);
                    socket.emit('serial_ports_list', { requestId, success: false, message: "Parse error: " + e.message });
                }
            }
        });
    });

    socket.on('flash_firmware', (payload) => {
        console.log('Received flash_firmware request', payload);
        const requestId = payload.requestId;
        const { port, sketch } = payload;

        // Stop monitor if active on this port
        if (scaleMonitorProcess && currentScalePort === port) {
            console.log("Stopping scale monitor for flashing...");
            scaleMonitorProcess.kill();
            scaleMonitorProcess = null;
            // Don't clear currentScalePort so we can maybe restart it? 
            // Or better, letting checkDevices() restart it later is safer.
            currentScalePort = null;
        }

        const cmd = `/opt/venv/bin/python3 flash_tool.py flash --port "${port}" --sketch "${sketch}"`;

        const { exec } = require('child_process');
        // Longer timeout for compilation and flashing
        exec(cmd, { timeout: 120000 }, (err, stdout, stderr) => {
            // stderr contains progress
            if (err) {
                console.error('Flash Error:', err);
                socket.emit('flash_complete', { requestId, success: false, message: stderr || err.message });
            } else {
                try {
                    const res = JSON.parse(stdout);
                    if (res.error) {
                        socket.emit('flash_complete', { requestId, success: false, message: res.error, details: res.details });
                    } else {
                        socket.emit('flash_complete', { requestId, success: true, message: "Flashing Complete" });
                    }
                } catch (e) {
                    // If stdout isn't JSON, maybe it was just text? 
                    // flash_tool prints JSON at end, but maybe mixed output.
                    // Actually flash_tool prints to stderr for progress, stdout for result.
                    socket.emit('flash_complete', { requestId, success: false, message: "Invalid output from flash tool", raw: stdout });
                }
            }
        });
    });

    // Remove or disable explicit read_scale handler that spawns processes
    // functionality is covered by the continuous monitor

    socket.on('tare_scale', (payload) => {
        console.log('Received tare_scale command:', payload);
        const requestId = payload.requestId;

        const keys = Object.keys(knownScales);
        if (keys.length === 0) {
            if (requestId) socket.emit('tare_complete', { requestId, success: false, message: "No scale found" });
            return;
        }
        const port = keys[0];

        // Send command to running monitor
        if (scaleMonitorProcess && currentScalePort === port) {
            const cmd = JSON.stringify({ cmd: 'tare', requestId: requestId }) + "\n";
            try {
                scaleMonitorProcess.stdin.write(cmd);
            } catch (e) {
                socket.emit('tare_complete', { requestId, success: false, message: "Monitor write failed" });
            }
        } else {
            // Monitor not running? Should be. Try starting it or fail.
            socket.emit('tare_complete', { requestId, success: false, message: "Scale monitor not active" });
            // Optionally trigger checkDevices to restart it?
        }
    });

    socket.on('calibrate_scale', (payload) => {
        console.log('Received calibrate_scale command:', payload);
        const requestId = payload.requestId;
        const { weight } = payload;

        const keys = Object.keys(knownScales);
        if (keys.length === 0) {
            if (requestId) socket.emit('calibration_complete', { requestId, success: false, message: "No scale found" });
            return;
        }
        const port = keys[0];

        if (scaleMonitorProcess && currentScalePort === port) {
            const cmd = JSON.stringify({ cmd: 'calibrate', weight: weight, requestId: requestId }) + "\n";
            try {
                scaleMonitorProcess.stdin.write(cmd);
            } catch (e) {
                socket.emit('calibration_complete', { requestId, success: false, message: "Monitor write failed" });
            }
        } else {
            socket.emit('calibration_complete', { requestId, success: false, message: "Scale monitor not active" });
        }
    });

    socket.on('sip_configure', (config) => {
        console.log('Received sip_configure:', config);
        const fs = require('fs');
        try {
            fs.writeFileSync(SIP_CONFIG_FILE, JSON.stringify(config));
            if (sipBridgeProcess) {
                const cmd = JSON.stringify({ cmd: 'configure', config: config }) + "\n";
                sipBridgeProcess.stdin.write(cmd);
            } else {
                startSipBridge();
            }
        } catch (e) {
            console.error("Error saving SIP config:", e);
        }
    });

    socket.on('sip_get_config', () => {
        const fs = require('fs');
        try {
            if (fs.existsSync(SIP_CONFIG_FILE)) {
                const config = JSON.parse(fs.readFileSync(SIP_CONFIG_FILE, 'utf8'));
                socket.emit('sip_config', { config });
            } else {
                socket.emit('sip_config', { config: {} });
            }
        } catch (e) {
            socket.emit('sip_config', { config: {} });
        }
    });

    socket.on('sip_dial', (payload) => {
        if (!sipBridgeProcess) return;
        const cmd = JSON.stringify({ cmd: 'dial', uri: payload.uri }) + "\n";
        sipBridgeProcess.stdin.write(cmd);
    });

    socket.on('sip_hangup', () => {
        if (!sipBridgeProcess) return;
        const cmd = JSON.stringify({ cmd: 'hangup' }) + "\n";
        sipBridgeProcess.stdin.write(cmd);
    });

    socket.on('sip_answer', () => {
        if (!sipBridgeProcess) return;
        const cmd = JSON.stringify({ cmd: 'answer' }) + "\n";
        sipBridgeProcess.stdin.write(cmd);
    });

}

// Check devices
const knownPrinters = {};
const knownReceiptPrinters = {};
const knownScales = {};

function checkDevices() {
    startSipBridge();

    const pythonCmd = '/opt/venv/bin/python3 print_label.py';
    const fs = require('fs');

    // Register Bridge Itself
    if (socket && socket.connected) {
        socket.emit('device_register', {
            name: 'Kiosk Bridge',
            type: 'BRIDGE',
            status: 'ONLINE',
            details: JSON.stringify({
                version: packageJson.version,
                startTime: new Date().toISOString()
            })
        });
    }

    // Check for Keyboard Scanner Config
    try {
        if (fs.existsSync(KIOSK_CONFIG_FILE)) {
            const config = JSON.parse(fs.readFileSync(KIOSK_CONFIG_FILE, 'utf8'));
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



    // Check for Scales
    const scaleCmd = '/opt/venv/bin/python3 scale_bridge.py';
    exec(`${scaleCmd} discover`, (err, stdout) => {
        if (err) {
            // Check if file exists/runnable? Just ignore silent fails
            return;
        }
        try {
            const devices = JSON.parse(stdout);
            if (devices.length > 0) {
                devices.forEach(device => {
                    knownScales[device.identifier] = device;

                    if (socket && socket.connected) {
                        socket.emit('device_register', {
                            name: device.model || 'Kitchen Scale',
                            type: 'SCALE',
                            status: device.connected ? 'ONLINE' : 'OFFLINE',
                            details: JSON.stringify(device)
                        });
                    }
                });
            }
        } catch (e) {
            console.error("Error parsing scale discover output:", e);
        }
    });

}

// Scale Monitor Process Management
let scaleMonitorProcess = null;
let currentScalePort = null;

function startScaleMonitor(port) {
    if (scaleMonitorProcess && currentScalePort === port) return; // Already running

    if (scaleMonitorProcess) {
        console.log("Stopping previous scale monitor...");
        scaleMonitorProcess.kill();
        scaleMonitorProcess = null;
    }

    console.log(`Starting Scale Monitor on ${port}...`);
    currentScalePort = port;
    const { spawn } = require('child_process');
    // use spawn instead of exec to get a stream
    scaleMonitorProcess = spawn('/opt/venv/bin/python3', ['scale_bridge.py', 'monitor', '--port', port], {
        cwd: __dirname
    });

    scaleMonitorProcess.stdout.on('data', (data) => {
        const lines = data.toString().split('\n');
        lines.forEach(line => {
            line = line.trim();
            if (line.startsWith('WEIGHT:')) {
                const parts = line.split(' ');
                const weightVal = parts[0].substring(7); // "WEIGHT:1.23" -> "1.23"
                // There might be raw suffix like "(Raw: 123)"

                const weight = parseFloat(weightVal);

                // Process weight update
                if (!isNaN(weight)) {
                    handleWeightUpdate(port, weight);
                }
            } else if (line.startsWith('{')) {
                // Potential JSON response
                try {
                    const msg = JSON.parse(line);
                    if (msg.type === 'tare_complete') {
                        socket.emit('tare_complete', {
                            requestId: msg.requestId,
                            success: msg.success,
                            message: msg.message,
                            data: msg.data
                        });
                    } else if (msg.type === 'calibration_complete') {
                        socket.emit('calibration_complete', {
                            requestId: msg.requestId,
                            success: msg.success,
                            message: msg.message,
                            data: msg.data
                        });
                    }
                } catch (e) {
                    // Ignore invalid JSON
                }
            }
        });
    });

    scaleMonitorProcess.stderr.on('data', (data) => {
        // console.error(`Scale Monitor Error: ${data}`); // verbose
    });

    scaleMonitorProcess.on('close', (code) => {
        console.log(`Scale Monitor exited with code ${code}`);
        scaleMonitorProcess = null;
        currentScalePort = null;
    });
}

// Logic to handle weight updates and debounce/throttle
let lastScaleState = { weight: null, timestamp: 0 };


// SIP / PBX Bridge Management
let sipBridgeProcess = null;

function startSipBridge() {
    if (sipBridgeProcess) return;

    const fs = require('fs');
    if (!fs.existsSync(SIP_CONFIG_FILE)) {
        console.log("No sip_config.json found, skipping SIP bridge startup.");
        return;
    }

    console.log("Starting SIP Bridge...");
    const { spawn } = require('child_process');

    // Using system python since we used apt to install python3-pjsua
    sipBridgeProcess = spawn('/usr/bin/python3', ['sip_bridge.py'], {
        cwd: __dirname
    });

    sipBridgeProcess.stdout.on('data', (data) => {
        const lines = data.toString().split('\n');
        lines.forEach(line => {
            line = line.trim();
            if (!line) return;
            try {
                const msg = JSON.parse(line);
                handleSipMessage(msg);
            } catch (e) {
                // Ignore
            }
        });
    });

    sipBridgeProcess.stderr.on('data', (data) => {
        console.error(`SIP Error: ${data}`);
    });

    sipBridgeProcess.on('close', (code) => {
        console.log(`SIP Bridge exited with code ${code}`);
        sipBridgeProcess = null;
        if (code !== 0) {
            setTimeout(startSipBridge, 10000);
        }
    });

    try {
        const config = JSON.parse(fs.readFileSync(SIP_CONFIG_FILE, 'utf8'));
        if (config.enabled) {
            const cmd = JSON.stringify({ cmd: 'configure', config: config }) + "\n";
            sipBridgeProcess.stdin.write(cmd);
        } else {
            console.log("SIP config exists but disabled.");
            if (sipBridgeProcess) {
                sipBridgeProcess.kill();
                sipBridgeProcess = null;
            }
        }
    } catch (e) {
        console.error("Error loading SIP config:", e);
    }
}

function handleSipMessage(msg) {
    if (!socket || !socket.connected) return;

    if (msg.type === 'incoming_call') {
        socket.emit('sip_incoming_call', msg.data);
    } else if (msg.type === 'call_state') {
        socket.emit('sip_call_state', msg.data);
    } else if (msg.type === 'reg_state') {
        socket.emit('sip_reg_state', msg.data);
    }
}
function handleWeightUpdate(port, currentWeight) {
    const now = Date.now();
    const last = lastScaleState;

    // Round to nearest 0.1
    const roundedWeight = Math.round(currentWeight * 10) / 10;

    // Check for change based on rounded value
    const weightChanged = last.weight === null || roundedWeight !== last.weight;
    const timeElapsed = (now - last.timestamp) >= 10000; // 10s heartbeat

    if (weightChanged || timeElapsed) {
        if (socket && socket.connected) {
            socket.emit('scale_reading', {
                requestId: 'poll',
                success: true,
                data: { weight: roundedWeight, unit: 'g' }
            });
            lastScaleState = { weight: roundedWeight, timestamp: now };
        }
    }
}


// Poll devices every 30 seconds
setInterval(() => {
    checkDevices();

    // Also ensure monitor is running if we have a scale
    // BUT only if display is ON
    if (isDisplayOn) {
        const keys = Object.keys(knownScales);
        if (keys.length > 0) {
            const port = keys[0];
            if (!scaleMonitorProcess || currentScalePort !== port) {
                startScaleMonitor(port);
            }
        }
    }
}, 30000);



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
