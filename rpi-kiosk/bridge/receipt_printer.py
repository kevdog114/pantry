
import sys
import json
import argparse
import logging
import usb.core
import usb.util
import subprocess

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

BROTHER_VENDOR_ID = 0x04f9
BROTHER_PRODUCT_ID = 0x20c0 # QL-600

def get_lsusb_info():
    """Returns a list of dicts with VID, PID, Bus, Address, Name from lsusb."""
    devices = []
    try:
        output = subprocess.check_output(['lsusb'], text=True)
        for line in output.splitlines():
             # Bus 001 Device 005: ID 04b8:0202 EPSON TM-T88V
             parts = line.strip().split()
             
             if len(parts) >= 6 and parts[0] == 'Bus' and parts[2] == 'Device' and 'ID' in parts:
                 try:
                     bus = int(parts[1])
                     dev_addr = int(parts[3].rstrip(':'))
                     
                     id_idx = parts.index('ID')
                     vid_pid = parts[id_idx+1].split(':')
                     if len(vid_pid) == 2:
                         vid = int(vid_pid[0], 16)
                         pid = int(vid_pid[1], 16)
                         
                         name = 'Generic USB Device'
                         if len(parts) > id_idx + 2:
                             name = ' '.join(parts[id_idx+2:])
                             
                         devices.append({
                             'vendor_id': vid,
                             'product_id': pid,
                             'bus': bus,
                             'address': dev_addr,
                             'name': name
                         })
                 except Exception:
                     pass
    except Exception as e:
        logger.error(f"lsusb failed: {e}")
    return devices

def get_usb_printers():
    """Find all USB printers using both usb.core (Class 7) and lsusb keywords."""
    printers = []
    seen_ids = set()

    # 1. Try usb.core for Class 7 (Printer)
    try:
        all_devs = usb.core.find(find_all=True)
        if all_devs:
            for dev in all_devs:
                try:
                    # Exclude Brother QL (handled separately)
                    if dev.idVendor == BROTHER_VENDOR_ID and dev.idProduct == BROTHER_PRODUCT_ID:
                        continue
                        
                    is_printer = False
                    # Check interfaces for Printer Class (7)
                    if dev.bDeviceClass == 7:
                        is_printer = True
                    else:
                        for cfg in dev:
                            for intf in cfg:
                                if intf.bInterfaceClass == 7:
                                    is_printer = True
                                    break
                            if is_printer: break
                    
                    if is_printer:
                        vid = dev.idVendor
                        pid = dev.idProduct
                        printers.append({
                            'vendor_id': vid,
                            'product_id': pid,
                            'bus': dev.bus,
                            'address': dev.address,
                            'source': 'usb_class'
                        })
                        seen_ids.add((vid, pid))
                except Exception as e:
                    # Ignore per-device errors
                    pass
    except Exception as e:
        logger.error(f"Error scanning with usb.core: {e}")

    # 2. Try lsusb for keywords (Fallback/Augment)
    # This helps if permissions blocked reading config/interfaces in step 1 but lsusb allows listing
    lsusb_devs = get_lsusb_info()
    
    # Keywords to identify printers if class detection failed
    keywords = ['epson', 'printer', 'receipt', 'tm-t', 'star micr']
    
    for dev in lsusb_devs:
        # Exclude Brother QL
        if dev['vendor_id'] == BROTHER_VENDOR_ID and dev['product_id'] == BROTHER_PRODUCT_ID:
            continue

        # If already found via class, just update name if missing
        if (dev['vendor_id'], dev['product_id']) in seen_ids:
            continue
            
        # Check name against keywords
        name_lower = dev['name'].lower()
        if any(k in name_lower for k in keywords):
            printers.append({
                'vendor_id': dev['vendor_id'],
                'product_id': dev['product_id'],
                'bus': dev['bus'],
                'address': dev['address'],
                'name': dev['name'],
                'source': 'lsusb_keyword'
            })
            seen_ids.add((dev['vendor_id'], dev['product_id']))

    return printers, lsusb_devs

def discover_cmd(args):
    printers, lsusb_devs = get_usb_printers()
    
    # Create lookup for names from lsusb
    lsusb_map = {(d['bus'], d['address']): d['name'] for d in lsusb_devs}
    
    output = []
    
    for p in printers:
        vid = f"0x{p['vendor_id']:04x}"
        pid = f"0x{p['product_id']:04x}"
        identifier = f"usb:{vid}:{pid}"
        
        # Determine best name
        name = p.get('name')
        if not name:
            name = lsusb_map.get((p['bus'], p['address']), 'Generic Receipt Printer')
        
        output.append({
            'identifier': identifier,
            'model': name,
            'connected': True,
            'vendorId': vid,
            'productId': pid
        })
        
    print(json.dumps(output))

def print_receipt_cmd(args):
    try:
        from escpos.printer import Usb
    except ImportError:
        logger.error("python-escpos library not found")
        sys.exit(1)

    try:
        with open(args.input_file, 'r') as f:
            data = json.load(f)
            logger.info(f"Receipt Data: {data}")
    except Exception as e:
        logger.error(f"Failed to load input file: {e}")
        return

    # Parse identifier
    # Format: usb:0x1234:0x5678
    try:
        parts = args.printer.split(':')
        if len(parts) >= 3:
            vid = int(parts[1], 16)
            pid = int(parts[2], 16)
        else:
            # Fallback or error
            logger.error("Invalid printer identifier format. Expected 'usb:0xVID:0xPID'")
            return
    except ValueError:
        logger.error(f"Invalid VID/PID in identifier: {args.printer}")
        return

    try:
        # Initialize printer
        # profile="default" might work for most
        p = Usb(vid, pid, profile="default")
        
        # Basic Receipt Formatting
        p.hw("INIT")
        
        # Header
        if 'title' in data:
            print("Printing Title...")
            p.set(align='center', double_height=True, double_width=True)
            p.text(f"{data['title']}\n")
            p.text("\n")
            
        p.set(align='left', normal_text=True)
        
        # Body Text
        if 'text' in data:
            print("Printing Text Body...")
            p.text(f"{data['text']}\n")
            
        # Recipe Steps
        if 'steps' in data and isinstance(data['steps'], list):
            print(f"Printing {len(data['steps'])} steps...")
            p.text("-" * 32 + "\n")
            p.text("INSTRUCTIONS:\n")
            for i, step in enumerate(data['steps']):
                print(f"Printing step {i+1}...")
                # Step object: action, text, note
                action = step.get('action', '').upper()
                text = step.get('text', '')
                note = step.get('note', '')
                
                if action:
                    p.set(bold=True)
                    p.text(f"{action} ")
                    p.set(bold=False)
                
                # Sanitize text
                safe_text = text.encode('ascii', 'replace').decode()
                p.text(f"{safe_text}\n")
                
                if note:
                    p.set(font='b')
                    safe_note = note.encode('ascii', 'replace').decode()
                    p.text(f"  Note: {safe_note}\n")
                    p.set(font='a')
                
                p.text("\n")
            p.text("-" * 32 + "\n")

        # Key-Value pairs if provided
        if 'items' in data and isinstance(data['items'], list):
            print("Printing Items...")
            p.text("-" * 32 + "\n")
            for item in data['items']:
                if isinstance(item, dict):
                    name = item.get('name', '')
                    qty = item.get('quantity', '')
                    p.text(f"{name:<20} {qty:>10}\n")
                else:
                    p.text(f"{str(item)}\n")
            p.text("-" * 32 + "\n")

        # QR Code
        if 'qrData' in data:
            print("Printing QR...")
            p.set(align='center')
            try:
                p.qr(data['qrData'], size=8)
            except Exception as qr_err:
                 print(f"QR Error: {qr_err}")
            p.text("\n")

        # Footer
        print("Printing Footer...")
        p.text("\n")
        p.set(align='center')
        p.text(f"{data.get('footer', 'Pantry Kiosk')}\n")
        
        # Cut
        print("Cutting...")
        p.cut()
        print("Done.")
        
    except Exception as e:
        logger.error(f"Print failed: {e}")
        print(f"CRITICAL ERROR: {e}") 
        sys.exit(1)
    
def status_cmd(args):
    # Just check if we can find it via USB scanning
    # python-escpos doesn't easily give status without claiming interface, 
    # and even then, standard status commands vary.
    # For now, we report ONLINE if USB device is present.
    
    try:
        parts = args.printer.split(':')
        if len(parts) >= 3:
            target_vid = int(parts[1], 16)
            target_pid = int(parts[2], 16)
            
            printers = get_usb_printers()
            found = False
            for p in printers:
                if p['vendor_id'] == target_vid and p['product_id'] == target_pid:
                    found = True
                    break
            
            if found:
                print(json.dumps({
                    'status': 'ONLINE',
                    'connected': True,
                    'media': '80mm', # Assumption
                    'errors': []
                }))
            else:
                print(json.dumps({
                    'status': 'OFFLINE',
                    'connected': False,
                    'errors': ['Device disconnected']
                }))
        else:
             print(json.dumps({'status': 'ERROR', 'errors': ['Invalid Identifier']}))
             
    except Exception as e:
        print(json.dumps({'status': 'ERROR', 'errors': [str(e)]}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Generic Receipt Printer Tool')
    subparsers = parser.add_subparsers(dest='command', help='Command to run')
    
    # Discover
    discover_parser = subparsers.add_parser('discover', help='Discover printers')
    
    # Print
    print_parser = subparsers.add_parser('print', help='Print a receipt')
    print_parser.add_argument('input_file', help='Path to JSON data file')
    print_parser.add_argument('--printer', required=True, help='Printer Identifier (usb:0xVID:0xPID)')

    # Status
    status_parser = subparsers.add_parser('status', help='Get printer status')
    status_parser.add_argument('--printer', required=True, help='Printer Identifier')

    args = parser.parse_args()
    
    if args.command == 'discover':
        discover_cmd(args)
    elif args.command == 'print':
        print_receipt_cmd(args)
    elif args.command == 'status':
        status_cmd(args)
    else:
        parser.print_help()
