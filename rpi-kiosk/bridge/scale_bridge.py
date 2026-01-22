import sys
import json
import time
import argparse
import serial
import serial.tools.list_ports

def get_args():
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=['discover', 'read', 'monitor', 'status'])
    parser.add_argument('--port', help='Serial port')
    return parser.parse_args()

def discover():
    devices = []
    ports = serial.tools.list_ports.comports()
    for p in ports:
        try:
            # We skip known printer/scanner ports if we could identify them easily, 
            # but for now we safeguard by just trying to open.
            # If a port is busy (e.g. by another bridge), Serial() will likely fail.
            s = serial.Serial(p.device, 9600, timeout=2)
            time.sleep(2) # Wait for Arduino auto-reset
            s.reset_input_buffer()
            s.write(b"IDENTIFY\n")
            line = s.readline().decode('utf-8').strip()
            s.close()
            
            if line == "SCALE_V1":
                devices.append({
                    "identifier": p.device,
                    "model": "Arduino Scale",
                    "type": "SCALE",
                    "connected": True
                })
        except:
            continue
    print(json.dumps(devices))

def read_weight(port):
    if not port:
        print(json.dumps({"error": "No port specified"}))
        return

    try:
        s = serial.Serial(port, 9600, timeout=3)
        time.sleep(2)
        s.reset_input_buffer()
        s.write(b"WEIGHT\n")
        line = s.readline().decode('utf-8').strip()
        s.close()
        
        try:
            weight = float(line)
            print(json.dumps({"weight": weight, "unit": "g"}))
        except:
            print(json.dumps({"error": "Invalid response", "raw": line}))
    except Exception as e:
        print(json.dumps({"error": str(e)}))

def monitor(port):
    if not port:
        print("ERROR: Port required for monitor", file=sys.stderr)
        return

    try:
        s = serial.Serial(port, 9600, timeout=1)
        time.sleep(2)
        print(f"Scale Monitor Started on {port}", file=sys.stderr)
        
        while True:
            try:
                s.reset_input_buffer()
                s.write(b"WEIGHT\n")
                line = s.readline().decode('utf-8').strip()
                if line:
                    # Validate float
                    try:
                        val = float(line)
                        print(f"WEIGHT:{val}")
                        sys.stdout.flush()
                    except:
                        pass
                
                # Check for input from stdin (commands)? 
                # For now just poll
                time.sleep(0.5) 
            except Exception as e:
                print(f"Error: {e}", file=sys.stderr)
                time.sleep(1)
    except Exception as e:
        print(f"Connection Error: {e}", file=sys.stderr)

if __name__ == '__main__':
    args = get_args()
    if args.command == 'discover':
        discover()
    elif args.command == 'read':
        read_weight(args.port)
    elif args.command == 'monitor':
        monitor(args.port)
    elif args.command == 'status':
        # Simple check if port opens
         try:
            s = serial.Serial(args.port, 9600, timeout=1)
            s.close()
            print(json.dumps({"status": "ONLINE"}))
         except:
            print(json.dumps({"status": "OFFLINE"}))
