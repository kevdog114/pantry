
import sys
import json
import threading
import time
import logging
import os
import pexpect

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s', filename='sip_bridge.log')

# Global
child = None
current_config = None

def log_json(msg_type, data):
    msg = {"type": msg_type, "data": data}
    print(json.dumps(msg))
    sys.stdout.flush()

def create_baresip_config(config):
    # Setup directories
    home_dir = os.path.expanduser("~")
    baresip_dir = os.path.join(home_dir, ".baresip")
    os.makedirs(baresip_dir, exist_ok=True)

    # 1. Accounts
    # Format: <sip:user:password@domain;transport=udp>;regint=3600
    if not config.get('domain') or not config.get('username'):
        return False
        
    user = config['username']
    pwd = config.get('password', '')
    domain = config['domain']
    
    # Simple construction
    auth = f":{pwd}" if pwd else ""
    account_line = f"<sip:{user}{auth}@{domain};transport=udp>;regint=3600;answermode=auto"
    # Auto answer assumes we want it. But we can control 'answer' via command too.
    # User requested auto-answer.
    # baresip 'answermode=auto' handles it immediately. 
    # But maybe we want to control it? 'answermode=manual' + sending 'a' key.
    # Let's use manual to allow the UI to show the Incoming Call screen and user (or auto-logic) to trigger answer.
    account_line = f"<sip:{user}{auth}@{domain};transport=udp>;regint=3600;answermode=manual"

    with open(os.path.join(baresip_dir, "accounts"), "w") as f:
        f.write(account_line + "\n")

    # 2. Config
    # Ensure audio modules are loaded.
    # We rely on defaults mostly, but need to make sure 'std' input works.
    with open(os.path.join(baresip_dir, "config"), "w") as f:
        f.write("poll_method\t\tpoll\n")
        f.write("audio_player\t\talsa,default\n")
        f.write("audio_source\t\talsa,default\n")
        f.write("audio_alert\t\talsa,default\n")
        # Modules
        f.write("module\t\t\tstdio.so\n")
        f.write("module\t\t\talsa.so\n")
        f.write("module\t\t\tg711.so\n")
        f.write("module\t\t\taccount.so\n")
        # f.write("module\t\t\tmenu.so\n") # Interactive menu
    
    return True

def monitor_baresip():
    global child
    while True:
        try:
            if child is None or not child.isalive():
                time.sleep(1)
                continue
                
            # Read line
            try:
                line = child.readline().decode('utf-8').strip()
                if not line:
                    continue
                
                # logging.info(f"Baresip: {line}")
                
                # Parse Events
                if "Incoming call from" in line:
                    # Incoming call from sip:100@192.168.1.100 ...
                    # Parse URI
                    parts = line.split(" ")
                    uri = "Unknown"
                    for p in parts:
                        if p.startswith("sip:"):
                            uri = p
                            break
                    log_json("incoming_call", {"remote_uri": uri, "remote_contact": uri})
                    
                elif "Call established" in line:
                    log_json("call_state", {"state": "CONFIRMED", "code": 200})
                    
                elif "Call closed" in line or "Session closed" in line:
                    log_json("call_state", {"state": "DISCONNECTED", "code": 0})
                    
                elif "Reg: 200 OK" in line:
                    log_json("reg_state", {"code": 200, "reason": "OK", "active": True})
                    
                elif "401 Unauthorized" in line or "403 Forbidden" in line:
                    log_json("reg_state", {"code": 401, "reason": "Unauthorized", "active": False})
                    
            except pexpect.exceptions.TIMEOUT:
                pass
            except Exception as e:
                logging.error(f"Reader error: {e}")
                
        except Exception as outer:
            logging.error(f"Monitor error: {outer}")
            time.sleep(1)

def handle_command(line):
    global child
    try:
        cmd_obj = json.loads(line)
        cmd = cmd_obj.get("cmd")
        
        if cmd == "configure":
            config = cmd_obj.get("config", {})
            if create_baresip_config(config):
                # Start or Restart Baresip
                if child and child.isalive():
                    child.close()
                
                # Start baresip
                # -f to force config path? Default is ~/.baresip which we populated.
                child = pexpect.spawn('baresip', timeout=0.1)
                log_json("configured", {"success": True})
            else:
                 log_json("error", {"message": "Invalid config"})
                
        if cmd == "dial":
            if child and child.isalive():
                uri = cmd_obj.get("uri")
                if uri:
                    # 'd' triggers "Dial: " prompt
                    child.send("d")
                    # Wait a bit or Just send URI immediately? 
                    # Pexpect can handle it but let's just sendline.
                    child.sendline(uri)
                    log_json("dialing", {"uri": uri})
            else:
                log_json("error", {"message": "Baresip not running"})

        elif cmd == "hangup":
            if child and child.isalive():
                child.send("b") 
                
        elif cmd == "answer":
            if child and child.isalive():
                child.send("a")
                log_json("answered", {})

        elif cmd == "quit":
            if child:
                child.close()
            sys.exit(0)

    except Exception as e:
        log_json("error", {"message": f"Command processing error: {str(e)}"})
        logging.error(f"Error: {e}")

def main():
    # Start monitor thread
    t = threading.Thread(target=monitor_baresip)
    t.daemon = True
    t.start()
    
    log_json("ready", {})
    
    while True:
        try:
            line = sys.stdin.readline()
            if not line:
                break
            handle_command(line.strip())
        except KeyboardInterrupt:
            break
        except Exception as e:
            logging.error(f"Main loop error: {e}")
            
    if child:
        child.close()

if __name__ == "__main__":
    main()
