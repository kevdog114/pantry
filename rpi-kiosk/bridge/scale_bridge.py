import sys
import json
import time
import argparse
import serial
import serial.tools.list_ports
import os
from collections import deque

CONFIG_FILE = "scale_config.json"
if os.path.isdir("/data"):
    CONFIG_FILE = "/data/scale_config.json"

def get_args():
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=['discover', 'read', 'monitor', 'status', 'tare', 'calibrate'])
    parser.add_argument('--port', help='Serial port')
    parser.add_argument('--weight', help='Known weight for calibration', type=float)
    return parser.parse_args()

def load_config():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r') as f:
                return json.load(f)
        except:
            pass
    return {}

def save_config(config):
    with open(CONFIG_FILE, 'w') as f:
        json.dump(config, f, indent=2)

def get_device_config(port):
    cfg = load_config()
    # Default calibration factor 420.0, tare 0
    return cfg.get(port, {"tare_offset": 0, "calibration_factor": 420.0})

def update_device_config(port, key, value):
    cfg = load_config()
    if port not in cfg:
        cfg[port] = {"tare_offset": 0, "calibration_factor": 420.0}
    cfg[port][key] = value
    save_config(cfg)

def send_command(port, cmd, timeout=2):
    try:
        s = serial.Serial(port, 9600, timeout=timeout)
        time.sleep(2) # Wait for auto-reset if needed (some Arduinos reset on open)
        s.reset_input_buffer()
        
        # Send command char
        s.write(cmd.encode('utf-8'))
        
        # Read line
        line = s.readline().decode('utf-8').strip()
        s.close()
        return line
    except Exception as e:
        return None

def discover():
    devices = []
    ports = serial.tools.list_ports.comports()
    for p in ports:
        try:
            # Quick check
            resp = send_command(p.device, "V", timeout=2)
            
            if resp and "SCALE_FW" in resp:
                devices.append({
                    "identifier": p.device,
                    "model": "Arduino Scale",
                    "firmware": resp,
                    "type": "SCALE",
                    "connected": True
                })
        except:
            continue
    print(json.dumps(devices))

def read_raw(port):
    resp = send_command(port, "R", timeout=3)
    if resp:
        try:
            return int(resp)
        except:
            pass
    return None

def read_weight(port):
    if not port:
        print(json.dumps({"error": "No port specified"}))
        return

    raw = read_raw(port)
    if raw is not None:
        config = get_device_config(port)
        tare = config.get("tare_offset", 0)
        cal = config.get("calibration_factor", 420.0)
        
        if cal == 0: cal = 1 # Avoid div by zero
        
        weight = (raw - tare) / cal
        
        print(json.dumps({
            "weight": round(weight, 2), 
            "unit": "g", 
            "raw": raw,
            "tare": tare,
            "cal_factor": cal
        }))
    else:
        print(json.dumps({"error": "Failed to read from scale"}))

def tare_scale(port):
    if not port:
        print(json.dumps({"error": "No port specified"}))
        return

    raw = read_raw(port)
    if raw is not None:
        update_device_config(port, "tare_offset", raw)
        print(json.dumps({"success": True, "message": "Tare set", "value": raw}))
    else:
        print(json.dumps({"error": "Failed to read for tare"}))

def calibrate_scale(port, known_weight):
    if not port or known_weight is None:
        print(json.dumps({"error": "Port and known weight required"}))
        return

    raw = read_raw(port)
    if raw is not None:
        config = get_device_config(port)
        tare = config.get("tare_offset", 0)
        
        # formula: weight = (raw - tare) / factor
        # factor = (raw - tare) / weight
        
        if known_weight == 0:
            print(json.dumps({"error": "Known weight cannot be zero"}))
            return
            
        factor = (raw - tare) / known_weight
        update_device_config(port, "calibration_factor", factor)
        
        print(json.dumps({
            "success": True, 
            "message": "Calibration complete", 
            "factor": factor,
            "raw": raw,
            "tare": tare
        }))
    else:
        print(json.dumps({"error": "Failed to read for calibration"}))

def monitor(port):
    import select
    
    if not port:
        print("ERROR: Port required for monitor", file=sys.stderr)
        return

    print(f"Scale Monitor Started on {port} (Ctrl+C to stop)", file=sys.stderr)
    
    ser = None
    config = get_device_config(port)
    raw_history = deque()
    
    stable_zero_start = None
    
    while True:
        try:
            # 1. Manage Connection
            if ser is None:
                ser = serial.Serial(port, 9600, timeout=2)
                time.sleep(2) # Wait for auto-reset on connect
                ser.reset_input_buffer()
            
            # 2. Check for Incoming Commands (Stdin)
            # Non-blocking check
            if sys.stdin in select.select([sys.stdin], [], [], 0)[0]:
                line = sys.stdin.readline()
                if line:
                    try:
                        cmd_req = json.loads(line)
                        cmd = cmd_req.get('cmd')
                        req_id = cmd_req.get('requestId')
                        
                        if cmd == 'tare':
                            # Perform Tare: Read RAW specifically for this? 
                            # We can just do a read right now.
                            ser.reset_input_buffer()
                            ser.write(b'R')
                            resp = ser.readline().decode('utf-8').strip()
                            if resp:
                                try:
                                    raw_val = int(resp)
                                    config['tare_offset'] = raw_val
                                    save_config({port: config}) # Current logic saves entire file, need to be careful? 
                                    # actually save_config expects full config object? 
                                    # The helper update_device_config loads file, updates, saves.
                                    # We should just call update_device_config logic but efficiently.
                                    # Re-using local helper for safety:
                                    update_device_config(port, "tare_offset", raw_val)
                                    
                                    # Reload local config variable
                                    config = get_device_config(port)
                                    
                                    print(json.dumps({
                                        "type": "tare_complete",
                                        "requestId": req_id,
                                        "success": True,
                                        "data": {"value": raw_val}
                                    }))
                                except Exception as e:
                                    print(json.dumps({
                                        "type": "tare_complete",
                                        "requestId": req_id,
                                        "success": False,
                                        "message": str(e)
                                    }))
                            else:
                                print(json.dumps({
                                    "type": "tare_complete",
                                    "requestId": req_id,
                                    "success": False,
                                    "message": "No response from scale"
                                }))
                                
                        elif cmd == 'calibrate':
                            weight = float(cmd_req.get('weight', 0))
                            if weight <= 0:
                                print(json.dumps({
                                        "type": "calibration_complete",
                                        "requestId": req_id,
                                        "success": False,
                                        "message": "Invalid weight"
                                }))
                            else:
                                ser.reset_input_buffer()
                                ser.write(b'R')
                                resp = ser.readline().decode('utf-8').strip()
                                if resp:
                                    try:
                                        raw_val = int(resp)
                                        tare = config.get("tare_offset", 0)
                                        factor = (raw_val - tare) / weight
                                        
                                        update_device_config(port, "calibration_factor", factor)
                                        config = get_device_config(port)
                                        
                                        print(json.dumps({
                                            "type": "calibration_complete",
                                            "requestId": req_id,
                                            "success": True,
                                            "data": {"factor": factor}
                                        }))
                                    except Exception as e:
                                        print(json.dumps({
                                            "type": "calibration_complete",
                                            "requestId": req_id,
                                            "success": False,
                                            "message": str(e)
                                        }))
                        
                        sys.stdout.flush()
                        
                    except Exception as e:
                        print(f"Error processing command: {e}", file=sys.stderr)

            # 3. Regular Polling
            ser.write(b'R')
            line = ser.readline().decode('utf-8').strip()
            
            if line:
                try:
                    raw = int(line)
                    # Median Filter
                    raw_history.append(raw)
                    if len(raw_history) > 3: # Keep window small for responsiveness
                         raw_history.popleft()
                    
                    sorted_raw = sorted(raw_history)
                    filtered_raw = sorted_raw[len(sorted_raw) // 2]
                    
                    # Use current in-memory config
                    tare = config.get("tare_offset", 0)
                    cal = config.get("calibration_factor", 420.0)
                    if cal == 0: cal = 1
                    
                    weight = (filtered_raw - tare) / cal
                    
                    # Stable Zero Algorithm
                    if abs(weight) <= 0.4:
                        if stable_zero_start is None:
                            stable_zero_start = time.time()
                        elif time.time() - stable_zero_start >= 30.0:
                            print(f"Auto-tare triggered: Weight {weight:.2f}g stable near 0 for 30s", file=sys.stderr)
                            # Update Tare
                            config['tare_offset'] = filtered_raw
                            update_device_config(port, "tare_offset", filtered_raw)
                            stable_zero_start = None
                    else:
                        stable_zero_start = None

                    # Output weight
                    print(f"WEIGHT:{weight:.2f} (Raw: {filtered_raw})")
                    sys.stdout.flush()
                except ValueError:
                    pass
            
            time.sleep(0.05)

        except Exception as e:
            print(f"Error reading scale: {e}", file=sys.stderr)
            if ser:
                try:
                    ser.close()
                except:
                    pass
                ser = None
            time.sleep(2) # Wait before reconnect attempt

if __name__ == '__main__':
    args = get_args()
    if args.command == 'discover':
        discover()
    elif args.command == 'read':
        read_weight(args.port)
    elif args.command == 'tare':
        tare_scale(args.port)
    elif args.command == 'calibrate':
        calibrate_scale(args.port, args.weight)
    elif args.command == 'monitor':
        monitor(args.port)
    elif args.command == 'status':
         try:
            s = serial.Serial(args.port, 9600, timeout=1)
            s.close()
            print(json.dumps({"status": "ONLINE"}))
         except:
            print(json.dumps({"status": "OFFLINE"}))
