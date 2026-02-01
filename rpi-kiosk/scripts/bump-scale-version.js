const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const firmwarePath = path.join(__dirname, '../arduino/scale/scale.ino');
const lastTag = process.argv[2];

if (!lastTag) {
    console.log('No last tag provided, skipping version check.');
    process.exit(0);
}

try {
    // Check for changes
    const diffCmd = `git diff --name-only ${lastTag} HEAD -- rpi-kiosk/arduino/scale`;
    const diffOutput = execSync(diffCmd, { encoding: 'utf8' });

    if (!diffOutput.trim()) {
        console.log('No changes in scale firmware, skipping version bump.');
        process.exit(0);
    }

    console.log('Detected changes in scale firmware. Bumping version...');

    // Read file
    let content = fs.readFileSync(firmwarePath, 'utf8');

    // Find version
    // Format: #define FIRMWARE_VERSION "SCALE_FW_1.1"
    const versionRegex = /#define FIRMWARE_VERSION "SCALE_FW_(\d+)\.(\d+)"/;
    const match = content.match(versionRegex);

    if (!match) {
        console.error('Could not find content matching version pattern in scale.ino');
        process.exit(1);
    }

    const major = parseInt(match[1]);
    let minor = parseInt(match[2]);

    // Bump minor
    minor++;

    const newVersion = `SCALE_FW_${major}.${minor}`;
    console.log(`Bumping to ${newVersion}`);

    const newContent = content.replace(versionRegex, `#define FIRMWARE_VERSION "${newVersion}"`);
    fs.writeFileSync(firmwarePath, newContent);

    console.log('Version updated successfully.');

} catch (err) {
    console.error('Error during scale version bump:', err);
    process.exit(1);
}
