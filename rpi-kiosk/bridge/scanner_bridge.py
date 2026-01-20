import sys
import os
import glob
import time
import signal
from evdev import InputDevice, categorize, ecodes, list_devices

# Mapping for standard US keyboard (scancode -> char)
# This handles the main alphanumeric keys.
KEYS = {
    # top row numbers
    2: '1', 3: '2', 4: '3', 5: '4', 6: '5', 7: '6', 8: '7', 9: '8', 10: '9', 11: '0',
    12: '-', 13: '=',
    # qwerty
    16: 'q', 17: 'w', 18: 'e', 19: 'r', 20: 't', 21: 'y', 22: 'u', 23: 'i', 24: 'o', 25: 'p',
    26: '[', 27: ']', 43: '\\',
    # asdf
    30: 'a', 31: 's', 32: 'd', 33: 'f', 34: 'g', 35: 'h', 36: 'j', 37: 'k', 38: 'l',
    39: ';', 40: "'",
    # zxcv
    44: 'z', 45: 'x', 46: 'c', 47: 'v', 48: 'b', 49: 'n', 50: 'm',
    51: ',', 52: '.', 53: '/',
    # space
    57: ' '
}

# Shifted mapping
SHIFT_KEYS = {
    '1': '!', '2': '@', '3': '#', '4': '$', '5': '%', '6': '^', '7': '&', '8': '*', '9': '(', '0': ')',
    '-': '_', '=': '+',
    '[': '{', ']': '}', '\\': '|',
    ';': ':', "'": '"',
    ',': '<', '.': '>', '/': '?',
    'q': 'Q', 'w': 'W', 'e': 'E', 'r': 'R', 't': 'T', 'y': 'Y', 'u': 'U', 'i': 'I', 'o': 'O', 'p': 'P',
    'a': 'A', 's': 'S', 'd': 'D', 'f': 'F', 'g': 'G', 'h': 'H', 'j': 'J', 'k': 'K', 'l': 'L',
    'z': 'Z', 'x': 'X', 'c': 'C', 'v': 'V', 'b': 'B', 'n': 'N', 'm': 'M',
    ' ': ' '
}

def find_scanner():
    """Finds the first device in /dev/input/by-id/ ending in -kbd"""
    try:
        devices = glob.glob('/dev/input/by-id/*-kbd')
        if not devices:
            return None
        
        # Pick the first one. 
        # In a robust system we might want to exclude real keyboards if any, 
        # but the prompt implies this is for integration where the scanner is the target.
        device_path = devices[0]
        # Resolve symlink
        real_path = os.path.realpath(device_path)
        return real_path
    except Exception as e:
        sys.stderr.write(f"Error finding scanner: {e}\n")
        return None

def main():
    device_path = find_scanner()
    if not device_path:
        sys.stderr.write("No scanner found\n")
        sys.exit(1)

    print(f"Connecting to {device_path}...", flush=True)

    try:
        device = InputDevice(device_path)
        
        # Exclusive grab
        device.grab()
        print(f"Grabbed {device.name}", flush=True)

        buffer = []
        caps = False # basic caps lock support if needed, usually scanner doesn't use it
        shift = False

        for event in device.read_loop():
            if event.type == ecodes.EV_KEY:
                data = categorize(event)
                # data.keystate: 0=up, 1=down, 2=hold
                if data.keystate == 1: # Key Down
                    if data.scancode == 42 or data.scancode == 54: # Left/Right Shift
                        shift = True
                        continue
                    
                    if data.scancode == 28 or data.scancode == 96: # Enter
                        barcode = "".join(buffer)
                        if barcode:
                            print(f"BARCODE:{barcode}", flush=True)
                        buffer = []
                        continue
                    
                    # Map key
                    if data.scancode in KEYS:
                        char = KEYS[data.scancode]
                        if shift:
                            char = SHIFT_KEYS.get(char, char.upper())
                        
                        buffer.append(char)
                        
                elif data.keystate == 0: # Key Up
                    if data.scancode == 42 or data.scancode == 54:
                        shift = False

    except OSError as e:
        sys.stderr.write(f"Device error: {e}\n")
        sys.exit(1)
    except KeyboardInterrupt:
        pass
    except Exception as e:
        sys.stderr.write(f"Unexpected error: {e}\n")
        sys.exit(1)

if __name__ == "__main__":
    main()
