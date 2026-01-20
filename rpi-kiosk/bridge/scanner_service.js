const { spawn } = require('child_process');
const EventEmitter = require('events');
const path = require('path');

class ScannerService extends EventEmitter {
    constructor() {
        super();
        this.process = null;
        this.respawnTimer = null;
        this.isShuttingDown = false;

        // Start immediately
        this.start();
    }

    start() {
        if (this.process || this.isShuttingDown) return;

        console.log('Starting Scanner Service...');

        // Use the venv python as in server.js
        const pythonPath = '/opt/venv/bin/python3';
        const scriptPath = path.join(__dirname, 'scanner_bridge.py');

        this.process = spawn(pythonPath, ['-u', scriptPath]);

        this.process.stdout.on('data', (data) => {
            const lines = data.toString().split('\n');
            lines.forEach(line => {
                line = line.trim();
                if (line.startsWith('BARCODE:')) {
                    const barcode = line.substring(8);
                    console.log(`Scanner detected: ${barcode}`);
                    this.emit('scan', barcode);
                } else if (line) {
                    // Log other output as debug
                    console.log(`[Scanner]: ${line}`);
                }
            });
        });

        this.process.stderr.on('data', (data) => {
            console.error(`[Scanner Error]: ${data}`);
        });

        this.process.on('close', (code) => {
            console.log(`Scanner process exited with code ${code}`);
            this.process = null;

            if (!this.isShuttingDown) {
                // Restart after 5 seconds
                // If it exited with 1 (not found), we still want to retry periodically
                console.log('Restarting scanner in 5s...');
                this.respawnTimer = setTimeout(() => this.start(), 5000);
            }
        });
    }

    stop() {
        this.isShuttingDown = true;
        if (this.respawnTimer) clearTimeout(this.respawnTimer);
        if (this.process) {
            this.process.kill();
            this.process = null;
        }
    }
}

module.exports = ScannerService;
