import os
import json
import logging
import time
import subprocess
import paho.mqtt.client as mqtt
import socket

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("MQTTBridge")

# Globals for current state
current_display_state = "ON"
CONFIG_FILE = "kiosk_config.json"
if os.path.exists('/data'):
    CONFIG_FILE = "/data/kiosk_config.json"

def get_config():
    # Defaults from Env
    device_id = os.getenv('KIOSK_ID', 'pantry_kiosk')
    device_name = os.getenv('KIOSK_NAME', 'Pantry Kiosk')
    
    # Override from file
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r') as f:
                data = json.load(f)
                if 'device_id' in data: device_id = data['device_id']
                if 'device_name' in data: device_name = data['device_name']
                logger.info(f"Loaded config from file: {device_name} ({device_id})")
        except Exception as e:
            logger.error(f"Error reading config file: {e}")

    return device_id, device_name

def set_display(state):
    global current_display_state
    target = state.upper()
    
    cmd_args = []
    if target == "ON":
        cmd_args = ['xset', 'dpms', 'force', 'on']
        try:
             subprocess.run(['xset', 's', 'reset'], check=False)
             subprocess.run(['xset', 'dpms', '0', '0', '0'], check=False)
        except:
             pass
    else:
        cmd_args = ['xset', 'dpms', 'force', 'off']

    try:
        subprocess.run(cmd_args, check=True)
        current_display_state = target
        logger.info(f"Display set to {target}")
        return True
    except Exception as e:
        logger.error(f"Failed to set display: {e}")
        return False

def check_display_state():
    try:
        # Check actual display state via xset q
        result = subprocess.run(['xset', 'q'], capture_output=True, text=True)
        output = result.stdout
        if "Monitor is On" in output:
            return "ON"
        if "Monitor is Off" in output:
            return "OFF"
    except Exception as e:
        logger.error(f"Error checking display state: {e}")
    return None

def run_mqtt(device_id, device_name):
    global current_display_state
    mqtt_broker = os.getenv('MQTT_BROKER')
    mqtt_port = int(os.getenv('MQTT_PORT', 1883))
    mqtt_user = os.getenv('MQTT_USER')
    mqtt_password = os.getenv('MQTT_PASSWORD')

    if not mqtt_broker:
        logger.error("MQTT_BROKER not set")
        # Sleep and return to allow retry/reload
        time.sleep(10)
        return

    # Topics
    prefix = f"pantry/{device_id}"
    topic_set = f"{prefix}/display/set"
    topic_state = f"{prefix}/display/state"
    topic_availability = f"{prefix}/status"
    discovery_topic = f"homeassistant/switch/{device_id}_display/config"

    client = mqtt.Client(client_id=f"{device_id}_{int(time.time())}")
    if mqtt_user and mqtt_password:
        client.username_pw_set(mqtt_user, mqtt_password)
    
    client.will_set(topic_availability, "offline", retain=True)

    def on_connect(c, userdata, flags, rc):
        if rc == 0:
            logger.info(f"Connected to MQTT Broker as {device_id}")
            c.publish(topic_availability, "online", retain=True)
            
            # Discovery
            config = {
                "name": f"{device_name} Display",
                "unique_id": f"{device_id}_display",
                "command_topic": topic_set,
                "state_topic": topic_state,
                "availability_topic": topic_availability,
                "device": {
                     "identifiers": [device_id],
                     "name": device_name,
                     "model": "Raspberry Pi Kiosk",
                     "manufacturer": "Pantry App",
                     "sw_version": "1.1"
                },
                "icon": "mdi:monitor"
            }
            c.publish(discovery_topic, json.dumps(config), retain=True)
            
            c.subscribe(topic_set)
            # Sync Initial
            c.publish(topic_state, current_display_state, retain=True)
        else:
            logger.error(f"Connection failed: {rc}")

    def on_message(c, userdata, msg):
        try:
            if msg.topic == topic_set:
                payload = msg.payload.decode().upper()
                logger.info(f"Command: {payload}")
                if payload in ["ON", "OFF"]:
                    if set_display(payload):
                        c.publish(topic_state, payload, retain=True)
        except Exception as e:
            logger.error(f"Message error: {e}")

    client.on_connect = on_connect
    client.on_message = on_message

    try:
        client.connect(mqtt_broker, mqtt_port, 60)
        client.loop_start()
        
        # Monitoring Loop
        last_mtime = 0
        if os.path.exists(CONFIG_FILE):
            last_mtime = os.path.getmtime(CONFIG_FILE)

        while True:
            time.sleep(2)
            # Check for config change
            if os.path.exists(CONFIG_FILE):
                mtime = os.path.getmtime(CONFIG_FILE)
                if mtime > last_mtime:
                    logger.info("Config file changed. Restarting MQTT...")
                    break
                # Update last_mtime anyway if we just started monitoring? 
                # No, we only want to break if it CHANGES from what we started with.
                # If we started with no file, and file appears:
                if last_mtime == 0:
                    logger.info("Config file created. Restarting MQTT...")
                    break
            
            # Check for external state changes
            actual_state = check_display_state()
            if actual_state and actual_state != current_display_state:
                logger.info(f"Display state sync: {current_display_state} -> {actual_state}")
                current_display_state = actual_state
                client.publish(topic_state, current_display_state, retain=True)

            # Simple keepalive check? loop_start handles reconnects.
            
    except Exception as e:
        logger.error(f"Runtime error: {e}")
    finally:
        client.loop_stop()
        client.disconnect()
        logger.info("MQTT Disconnected")

if __name__ == "__main__":
    while True:
        # Check if config exists or if mandatory env vars are provided to override waiting
        # But per user request, we basically want to wait for login.
        # However, if user provided KIOSK_ID in ENV, maybe they want to bypass login dependency?
        # User said: "don't attempt to connect... until the kiosk has been logged in and assigned a name."
        # This implies we should wait for the file.
        
        if not os.path.exists(CONFIG_FILE):
             # Only if user explicitly provided env vars AND NOT relying on defaults
             # But here defaults are statically coded.
             # Let's check if the file is missing, we wait.
             logger.info("Waiting for Kiosk Login (config file)...")
             while not os.path.exists(CONFIG_FILE):
                 time.sleep(5)
        
        d_id, d_name = get_config()
        run_mqtt(d_id, d_name)
        time.sleep(2) # Breathe before restart
