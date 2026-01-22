import sys
import json
import subprocess
import argparse
import serial.tools.list_ports
import os

def get_args():
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=['list', 'flash'])
    parser.add_argument('--port', help='Serial port to flash')
    parser.add_argument('--sketch', help='Path to sketch folder (relative to /bridge/firmware)')
    return parser.parse_args()

def list_ports():
    ports = []
    for p in serial.tools.list_ports.comports():
        ports.append({
            "device": p.device,
            "description": p.description,
            "hwid": p.hwid
        })
    print(json.dumps(ports))

def flash(port, sketch_path):
    if not port or not sketch_path:
        print(json.dumps({"error": "Port and Sketch are required"}))
        return

    full_path = os.path.join("/bridge/firmware", sketch_path)
    if not os.path.exists(full_path):
        print(json.dumps({"error": f"Sketch not found at {full_path}"}))
        return

    # Compile
    # We use arduino:avr:nano as default target for now, or maybe uno? 
    # Usually cheap arduinos are Nano (with old bootloader often) or Uno.
    # We'll try to detect or just assume Nano for now as per "arduino connected to a load cell" usually implies nano.
    # Ideally we let user pick board type, but for simplicity let's default to nano:cpu=atmega328old 
    # (very common for clones) OR generic uno.
    # Let's try to infer or fallback.
    # The command provided was "compile the arduino firmware and flash".
    # Safest bet for generic kit is "arduino:avr:nano:cpu=atmega328old" or just "arduino:avr:uno".
    # Let's default to Uno as it is standard, if it fails user might need options.
    # Actually, let's use a standard list of boards if we can, but for now Hardcode Uno/Nano.
    
    fqbn = "arduino:avr:uno" 
    # Attempt to compile
    compile_cmd = ["arduino-cli", "compile", "--fqbn", fqbn, full_path]
    
    try:
        # Compile
        print(f"Compiling {sketch_path} for {fqbn}...", file=sys.stderr)
        subprocess.check_call(compile_cmd, stdout=sys.stderr, stderr=sys.stderr)
        
        # Upload
        print(f"Uploading to {port}...", file=sys.stderr)
        upload_cmd = ["arduino-cli", "upload", "-p", port, "--fqbn", fqbn, full_path]
        subprocess.check_call(upload_cmd, stdout=sys.stderr, stderr=sys.stderr)
        
        print(json.dumps({"success": True, "message": "Flashed successfully"}))
        
    except subprocess.CalledProcessError as e:
        print(json.dumps({"error": "Operation failed", "details": str(e)}))
    except Exception as e:
        print(json.dumps({"error": "Unexpected error", "details": str(e)}))

if __name__ == '__main__':
    args = get_args()
    if args.command == 'list':
        list_ports()
    elif args.command == 'flash':
        flash(args.port, args.sketch)
