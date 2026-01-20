
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

def get_usb_printers():
    """Find all USB printers excluding the known Brother label printer."""
    printers = []
    try:
        # Find all devices with Printer Interface Class (7)
        # This is a bit broad, so we might want to iterate devices and check interfaces
        all_devs = usb.core.find(find_all=True)
        
        for dev in all_devs:
            # Check if it's the specific Brother QL-600 we already handle
            if dev.idVendor == BROTHER_VENDOR_ID and dev.idProduct == BROTHER_PRODUCT_ID:
                continue
                
            is_printer = False
            # Check interfaces for Printer Class (7)
            for cfg in dev:
                for intf in cfg:
                    if intf.bInterfaceClass == 7:
                        is_printer = True
                        break
                if is_printer: break
            
            if is_printer:
                printers.append({
                    'vendor_id': dev.idVendor,
                    'product_id': dev.idProduct,
                    'bus': dev.bus,
                    'address': dev.address
                })
                
    except Exception as e:
        logger.error(f"Error scanning USB devices: {e}")
        
    return printers

def get_lsusb_map():
    mapping = {}
    try:
        output = subprocess.check_output(['lsusb'], text=True)
        for line in output.splitlines():
             # Bus 001 Device 002: ID 8087:0024 Intel Corp. Integrated Rate Matching Hub
             parts = line.strip().split()
             
             # Basic validation
             if len(parts) >= 6 and parts[0] == 'Bus' and parts[2] == 'Device':
                 try:
                     bus = int(parts[1])
                     dev = int(parts[3].rstrip(':'))
                     
                     if 'ID' in parts:
                         id_idx = parts.index('ID')
                         if len(parts) > id_idx + 2:
                             name = ' '.join(parts[id_idx+2:])
                             mapping[(bus, dev)] = name
                 except: pass
    except Exception as e:
        logger.error(f"lsusb failed: {e}")
    return mapping

def discover_cmd(args):
    printers = get_usb_printers()
    lsusb_map = get_lsusb_map()
    output = []
    
    for p in printers:
        # Construct a simplified identifier: usb:vendor:product
        # or hex: usb:0x0000:0x0000
        vid = f"0x{p['vendor_id']:04x}"
        pid = f"0x{p['product_id']:04x}"
        identifier = f"usb:{vid}:{pid}"
        
        name = "Generic Receipt Printer"
        if (p['bus'], p['address']) in lsusb_map:
            name = lsusb_map[(p['bus'], p['address'])]
        
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
            p.set(align='center', double_height=True, double_width=True)
            p.text(f"{data['title']}\n")
            p.text("\n")
            
        p.set(align='left', normal_text=True)
        
        # Body Text
        if 'text' in data:
            p.text(f"{data['text']}\n")
            
        # Key-Value pairs if provided
        if 'items' in data and isinstance(data['items'], list):
            p.text("-" * 32 + "\n")
            for item in data['items']:
                # Assume item is dict or string
                if isinstance(item, dict):
                    name = item.get('name', '')
                    qty = item.get('quantity', '')
                    p.text(f"{name:<20} {qty:>10}\n")
                else:
                    p.text(f"{str(item)}\n")
            p.text("-" * 32 + "\n")

        # QR Code
        if 'qrData' in data:
            p.set(align='center')
            p.qr(data['qrData'], size=8)
            p.text("\n")

        # Footer
        p.text("\n")
        p.set(align='center')
        p.text(f"{data.get('footer', 'Pantry Kiosk')}\n")
        
        # Cut
        p.cut()
        
    except Exception as e:
        logger.error(f"Print failed: {e}")
        # We might not crash but log it
    
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
