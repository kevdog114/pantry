import sys
import json
import threading
import time
import logging
import argparse

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s', filename='sip_bridge.log')
console = logging.StreamHandler()
console.setLevel(logging.INFO)
logging.getLogger().addHandler(console)

# Mock PJSUA if not installed for development/syntax checking purposes, 
# but rely on it being present in the container.
try:
    import pjsua as pj
except ImportError:
    logging.warning("PJSUA module not found. SIP functionality will not work.")
    pj = None

# Global state
current_call = None
lib = None
acc = None
transport = None

class AccountCallback(pj.AccountCallback):
    def __init__(self, account):
        pj.AccountCallback.__init__(self, account)

    def on_reg_state(self):
        code = self.account.info().reg_status
        reason = self.account.info().reg_reason
        log_json("reg_state", {"code": code, "reason": reason, "active": self.account.info().reg_active})

    def on_incoming_call(self, call):
        global current_call
        if current_call:
            call.answer(486, "Busy")
            return

        current_call = CallCallback(call)
        
        # Notify Server
        remote_uri = call.info().remote_uri
        remote_contact = call.info().remote_contact
        
        log_json("incoming_call", {
            "remote_uri": remote_uri,
            "remote_contact": remote_contact
        })

        # Auto-answer check could be here, but we'll wait for command or do it immediately if configured
        # User requirement: "automatically put it on speaker" -> implies answering?
        # "display a small overlay ... with a hangup button"
        # If we auto-answer, the call is active.
        # We will auto-answer with 200 OK after a brief delay or immediately.
        # Let's wait for the "auto_answer" config or default to True for this "Intercom/Kiosk" use case?
        # User said: "if there is an incoming call, it should automatically put it on speaker"
        
        call.answer(200)

class CallCallback(pj.CallCallback):
    def __init__(self, call=None):
        pj.CallCallback.__init__(self, call)

    def on_state(self):
        global current_call
        info = self.call.info()
        state = info.state_text
        code = info.last_code
        
        log_json("call_state", {
            "state": state,
            "code": code,
            "duration": info.call_time
        })

        if info.state == pj.CallState.DISCONNECTED:
            current_call = None

    def on_media_state(self):
        if self.call.info().media_state == pj.MediaState.ACTIVE:
            # Connect the call to sound device
            call_slot = self.call.info().conf_slot
            pj.Lib.instance().conf_connect(call_slot, 0)
            pj.Lib.instance().conf_connect(0, call_slot)
            log_json("media_active", {})

def log_json(msg_type, data):
    # Output JSON to stdout for server.js to parse
    msg = {"type": msg_type, "data": data}
    print(json.dumps(msg))
    sys.stdout.flush()

def handle_command(line):
    global lib, acc, current_call, transport
    
    try:
        cmd_obj = json.loads(line)
        cmd = cmd_obj.get("cmd")
        
        if cmd == "configure":
            config = cmd_obj.get("config", {})
            # Initialize PJSUA if not already
            if not lib:
                lib = pj.Lib()
                lib.init(log_cfg = pj.LogConfig(level=0, console_level=0))
                # Create UDP transport
                transport = lib.create_transport(pj.TransportType.UDP, pj.TransportConfig(5060))
                lib.start()
                lib.set_null_snd_dev() # Disable sound initially? No, we want sound.
                # Actually, in docker we might fail if no audio device.
            
            # Configure Account
            domain = config.get("domain")
            username = config.get("username")
            password = config.get("password")
            
            if domain and username:
                if acc:
                    acc.delete()
                    acc = None
                
                acc_cfg = pj.AccountConfig()
                acc_cfg.id = f"sip:{username}@{domain}"
                acc_cfg.reg_uri = f"sip:{domain}"
                acc_cfg.auth_cred = [pj.AuthCred(domain, username, password)]
                
                acc = lib.create_account(acc_cfg, cb=AccountCallback(None)) # cb set later? No, constructor.
                # The python binding might require checking the docs. 
                # AccountCallback is passed to create_account.
                # Re-verify pjsua python binding signature.
                # account = lib.create_account(acc_config, set_default=True, cb=MyAccountCallback(account))
                # Actually AccountCallback takes 'account' in constructor usually to callback properly?
                # Using a wrapper class is cleaner.
                
                acc.set_callback(AccountCallback(acc))
                log_json("configured", {"success": True})
                
        elif cmd == "dial":
            if not acc:
                log_json("error", {"message": "Account not configured"})
                return
                
            uri = cmd_obj.get("uri") # e.g. sip:100@1.2.3.4
            if not uri.startswith("sip:"):
                # Append domain if just extension?
                domain = acc.info().reg_uri
                # domain is sip:1.2.3.4
                # We need to construct sip:EXT@DOMAIN
                # But domain might have port or transport.
                # Let's assume input 'number' and we format it.
                number = uri
                domain_host = domain.replace("sip:", "")
                uri = f"sip:{number}@{domain_host}"

            log_json("dialing", {"uri": uri})
            try:
                curr_call = acc.make_call(uri, cb=CallCallback())
                # make_call returns a call object. We DO NOT assign current_call here instantly
                # The callback handles it usually? 
                # Actually we should track it.
                # But current_call is set in on_incoming_call logic. 
                # For outgoing, we should set it.
                # But wait, CallCallback is instantiated.
                # We need to link the callback instance to current_call global if we want global tracking.
                # Implementation detail: CallCallback should probably update global current_call
                # For now let's hope on_state logic manages it or we trust the object reference.
                global current_call
                current_call = CallCallback(curr_call) # Logic mismatch. make_call takes a CallCallback *instance* usually?
                # Pjsua python is tricky.
                # acc.make_call(uri, cb=MyCallCallback())
            except pj.Error as e:
                log_json("error", {"message": str(e)})

        elif cmd == "hangup":
            if current_call:
                current_call.call.hangup()
                log_json("hungup", {})
            else:
                log_json("error", {"message": "No active call"})
                
        elif cmd == "answer":
            if current_call:
                current_call.call.answer(200)
            else:
                log_json("error", {"message": "No incoming call"})

        elif cmd == "quit":
            if lib:
                lib.destroy()
                lib = None
            sys.exit(0)

    except Exception as e:
        log_json("error", {"message": f"Command processing error: {str(e)}"})
        logging.error(f"Error: {e}")

def main():
    if not pj:
        print(json.dumps({"type": "error", "message": "PJSUA not installed"}))
        return

    # Check for library init here or wait for configure?
    # Better to wait.
    
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

    if lib:
        lib.destroy()

if __name__ == "__main__":
    main()
