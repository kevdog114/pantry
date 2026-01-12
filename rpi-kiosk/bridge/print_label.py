
import sys
import json
import argparse
import logging

try:
    # Try importing from brother_ql_inventree
    import brother_ql_inventree.conversion
    import brother_ql_inventree.backends.helpers
    import brother_ql_inventree.raster
    from brother_ql_inventree.conversion import convert
    from brother_ql_inventree.backends.helpers import send
    from brother_ql_inventree.raster import BrotherQLRaster
except ImportError:
    # Fallback to standard brother_ql if inventree specific import fails
    # (Handling case where package name might be different or it shadows brother_ql)
    try:
        from brother_ql.conversion import convert
        from brother_ql.backends.helpers import send
        from brother_ql.raster import BrotherQLRaster
    except ImportError:
        print("Error: Could not import brother_ql or brother_ql_inventree", file=sys.stderr)
        sys.exit(1)

from PIL import Image, ImageDraw, ImageFont
import qrcode

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def create_label_image(data):
    # Label properties (Brother QL-600 with 62mm tape)
    # 62mm tape is approx 696 pixels wide
    width = 696
    
    try:
        font_large = ImageFont.truetype("/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf", 55)
        font_medium = ImageFont.truetype("/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf", 40)
        font_small = ImageFont.truetype("/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf", 25)
    except:
        font_large = ImageFont.load_default()
        font_medium = ImageFont.load_default()
        font_small = ImageFont.load_default()

    # If simple text label (Quick Print / Sample)
    if 'text' in data:
        height = 500
        img = Image.new('RGB', (width, height), color='white')
        draw = ImageDraw.Draw(img)
        
        lines = data['text'].split('\n')
        y = 100
        for line in lines:
            draw.text((50, y), line, font=font_large, fill='black')
            y += 80
            
        draw.text((50, height - 50), "Pantry App Test", font=font_small, fill='black')

    elif 'action' in data:
        # Modifier Label (Opened/Frozen) - Compact Single Line
        height = 90
        # Re-initialize fonts for modifier
        try:
            # Slightly smaller font to fit single line
            font_mod = ImageFont.truetype("/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf", 30)
        except:
            font_mod = ImageFont.load_default()
            
        img = Image.new('RGB', (width, height), color='white')
        draw = ImageDraw.Draw(img)
        
        # Content: "{Action} {Date}   Exp: {Expiration}"
        # Example: "Opened 2025-01-10   Exp: 2025-02-15"
        
        action_text = f"{data.get('action', 'Modified')} {data.get('date', '')}"
        expiry_text = f"Exp: {data.get('expiration', 'N/A')}"
        
        full_text = f"{action_text}   {expiry_text}"
        
        # Center text vertically?
        draw.text((30, 25), full_text, font=font_mod, fill='black')

    elif data.get('size') == '23mm':
        # 23mm Square Label (DK-11221)
        # brother_ql printable area is 202x202
        width = 202
        height = 202
        img = Image.new('RGB', (width, height), color='white')
        draw = ImageDraw.Draw(img)
        
        try:
            # Scale down fonts for 202x202
            font_date = ImageFont.truetype("/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf", 28)
            font_tiny = ImageFont.truetype("/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf", 16)
        except:
            font_date = ImageFont.load_default()
            font_tiny = ImageFont.load_default()

        # QR Code
        qr_data = data.get('qrData', f"S2-{data.get('stockId')}")
        qr = qrcode.QRCode(box_size=4, border=1) 
        qr.add_data(qr_data)
        qr.make(fit=True)
        
        qr_img = qr.make_image(fill_color="black", back_color="white")
        qr_target = 130
        qr_img = qr_img.resize((qr_target, qr_target))
        
        # Center QR Horizontally, Top aligned
        qr_x = (width - qr_target) // 2
        qr_y = 5
        img.paste(qr_img, (qr_x, qr_y))
        
        # Expiration Date
        date_str = data.get('expirationDate', 'N/A')
        # Center text
        try:
            text_w = draw.textlength(date_str, font=font_date)
            text_x = (width - text_w) / 2
        except:
            text_x = 10 # Fallback
            
        draw.text((text_x, qr_y + qr_target + 5), date_str, font=font_date, fill='black')

    else:
        # Stock Label Format (Compact)
        # "About 200px height" as requested
        height = 200
        # Re-initialize fonts for smaller scale
        try:
            font_large = ImageFont.truetype("/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf", 45)
            font_medium = ImageFont.truetype("/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf", 30)
            font_small = ImageFont.truetype("/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf", 20)
        except:
            font_large = ImageFont.load_default()
            font_medium = ImageFont.load_default()
            font_small = ImageFont.load_default()

        img = Image.new('RGB', (width, height), color='white')
        draw = ImageDraw.Draw(img)
        
        # QR Code Generation
        qr_data = data.get('qrData', f"S2-{data.get('stockId')}")
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_L,
            box_size=6, # Smaller box size
            border=1,
        )
        qr.add_data(qr_data)
        qr.make(fit=True)
        
        qr_target_size = 150 # Smaller QR code
        qr_img = qr.make_image(fill_color="black", back_color="white")
        qr_img = qr_img.resize((qr_target_size, qr_target_size))
        
        # Layout:
        # Left: QR Code
        # Bottom Left: ID Text
        # Right: Product Name + Expiration
        
        margin_left = 20
        margin_top = 25 # Vertically centered approx
        
        # Paste QR
        img.paste(qr_img, (margin_left, margin_top))
        
        # Text under QR
        id_text = f"{qr_data}" # S2-ID
        draw.text((margin_left + 5, margin_top + qr_target_size + 2), id_text, font=font_small, fill='black')
        
        # Right Side Content
        text_x = margin_left + qr_target_size + 20
        
        # Title (Truncate to fit potentially)
        title = data.get('title', 'Unknown Product')
        # Simple wrap or truncate? Truncate for now to fit line
        if len(title) > 22: 
            title = title[:21] + "..."
            
        draw.text((text_x, 30), title, font=font_large, fill='black')
        
        # Expiration
        expires = f"Exp: {data.get('expirationDate', 'N/A')}"
        draw.text((text_x, 90), expires, font=font_medium, fill='black')
    
    return img

def print_label_cmd(args):
    try:
        with open(args.input_file, 'r') as f:
            data = json.load(f)
            
        # Robustness: Handle case where fields are nested under 'data' property
        if 'data' in data and isinstance(data['data'], dict):
            logger.info("Detected nested 'data' property, unwrapping...")
            data = data['data']
            
    except Exception as e:
        logger.error(f"Failed to load input file: {e}")
        return

    logger.info(f"Printing label for: {data.get('title') or data.get('text')}")
    
    img = create_label_image(data)
    
    # Convert image to brother_ql instructions
    qlr = BrotherQLRaster(args.model)
    qlr.exception_on_warning = True
    
    # Select label type
    label_type = '62'
    if data.get('size') == '23mm':
        label_type = '23x23'

    # 62 is the tape width in mm (Red/Black or Black)
    instructions = convert(
        qlr=qlr, 
        images=[img], 
        label=label_type, 
        cut=True, 
        dither=True, 
        compress=False, 
        red=False
    )
    
    # Send to printer
    send(
        instructions=instructions, 
        printer_identifier=args.printer, 
        backend_identifier=args.backend, 
        blocking=True
    )
    logger.info("Print successful")

def discover_cmd(args):
    # Try to use discovery from the library
    try:
        # Depending on version, discovery might be in different places
        # brother_ql 0.9.x has brother_ql.backends.helpers.discover
        try:
            from brother_ql_inventree.backends.helpers import discover
        except ImportError:
            from brother_ql.backends.helpers import discover
            
        devices = discover(backend_identifier=args.backend)
        # devices is list of (identifier, description) usually? or similar.
        # Actually it returns specific object list or strings.
        # Let's assume standard brother_ql behavior: returns list of dicts or objects
        
        output = []
        for dev in devices:
            # dev might be a string (identifier) or object
            identifier = str(dev)
            output.append({
                'identifier': identifier,
                'model': 'Brother Printer', # Can't detect model easily without query
                'connected': True
            })
        
        print(json.dumps(output))
    except Exception as e:
        logger.error(f"Discovery failed: {e}")
        print(json.dumps([]))

def status_cmd(args):
    # Get status from printer
    # This requires sending ESC i S and reading 32 bytes
    # We will try to use the backend to do this.
    identifier = args.printer
    backend = args.backend
    
    status_data = {
        'connected': False,
        'status': 'UNKNOWN',
        'media': 'UNKNOWN',
        'errors': []
    }
    
    try:
        # Manual interaction using the backend logic
        # We need to open the device, write to it, and read from it.
        # brother_ql 'send' doesn't return the handle.
        # So we have to use the backend driver directly.
        
        if backend == 'pyusb':
            import usb.core
            import usb.util
            
            # Parse identifier (usb://0xYYYY:0xZZZZ/num)
            # Simplified generic finder or use brother_ql's helper to get device
            # For robustness, we will try to use brother_ql internals if possible,
            # but usually it's easier to just use usb.core if we have the VID:PID
            
            # Use brother_ql to parse identifier?
            # Let's assume the user passes a valid identifier.
            
            # Hardcoded QL-600 check if identifier not specific?
            # brother_ql's send uses a helper to find.
            
            # Let's try to query status.
            pass

        # Since we are using brother_ql_inventree, let's see if we can use its API.
        # Assuming there isn't a simple 'get_status' exposed in top level, 
        # we will assume the user has QL-600 and we can validly use pyusb to query it.
        
        # NOTE: brother_ql_inventree v1.3 has a 'status' feature.
        # If we can import it, great.
        try:
            # Try to find a status function
            from brother_ql_inventree.cmds import status as status_module
            # This logic is hypothetical based on "version 1.3 introduced ... cli command"
            # It's likely in valid python module.
        except ImportError:
            pass

        # Fallback implementation:
        # Just return "ONLINE" if we can see it during discovery?
        # User wants "status and label type".
        
        # We will try to read 32 bytes from USB
        # This is a basic implementation of status reading for Brother QL
        
        # Find device (assuming 1st brother printer if identifier not strict)
        dev = usb.core.find(idVendor=0x04f9) # Brother
        if dev:
            status_data['connected'] = True
            status_data['status'] = 'ONLINE'
            
            try:
                # Detach kernel driver if needed
                if dev.is_kernel_driver_active(0):
                    dev.detach_kernel_driver(0)
            except:
                pass
                
            try:
                # dev.set_configuration() # Sometimes resets the device, safer to skip if active?
                # Let's try skipping set_configuration if already configured
                try:
                    cfg = dev.get_active_configuration()
                except:
                    dev.set_configuration()
                    cfg = dev.get_active_configuration()
                        
                # Find OUT and IN endpoints
                intf = cfg[(0,0)]
                
                ep_out = usb.util.find_descriptor(intf, custom_match=lambda e: usb.util.endpoint_direction(e.bEndpointAddress) == usb.util.ENDPOINT_OUT)
                ep_in = usb.util.find_descriptor(intf, custom_match=lambda e: usb.util.endpoint_direction(e.bEndpointAddress) == usb.util.ENDPOINT_IN)
                
                if ep_out and ep_in:
                    # Clear buffer
                    try:
                        dev.read(ep_in.bEndpointAddress, 1024, timeout=100)
                    except:
                        pass
                        
                    # Send Status Request (ESC i S)
                    cmd = b'\x1b\x69\x53'
                    ep_out.write(cmd)
                    
                # Read 32 bytes
                    resp = dev.read(ep_in.bEndpointAddress, 32, timeout=1000)
                    if len(resp) >= 32:
                        # Parse Brother Status Information (32 bytes)
                        # https://download.brother.com/welcome/docp000678/cv_ql800_jpeng_raster_100.pdf
                        
                        # Correct Offsets for QL-800/600 series (Raster):
                        # Byte 8: Error Info 1
                        # Byte 9: Error Info 2
                        # Byte 11: Media Type (0x0A = Die-cut, 0x0B = Continuous)
                        # Byte 17: Media Width (mm)
                        # Byte 18: Media Length (mm)
                        
                        media_width_byte = resp[17]
                        media_len_byte = resp[18]
                        media_type_byte = resp[11]
                        
                        # Fallback/Sanity Check
                        if media_width_byte == 0 and resp[10] > 0:
                            media_width_byte = resp[10]
                        
                        # Specific override for 23mm (DK-11221 Square)
                        if media_width_byte == 23:
                             media_len_byte = 23
                             media_type_byte = 0x0A # Treat as die-cut
                        
                        media_type = 'Die-Cut' if media_type_byte == 0x0A else 'Continuous'
                        
                        label_size = f"{media_width_byte}mm"
                        if media_len_byte > 0:
                            label_size += f" x {media_len_byte}mm"
                        
                        status_data['media'] = f"{label_size} {media_type}"
                        status_data['detected_label'] = {
                            'width': media_width_byte,
                            'length': media_len_byte,
                            'type': 'die-cut' if media_type_byte == 0x0A else 'continuous'
                        }
                        
                        # Errors
                        err1 = resp[8]
                        err2 = resp[9]
                        
                        if err1 != 0 or err2 != 0:
                            status_data['status'] = 'ERROR'
                            status_data['errors'].append(f"Error Codes: {hex(err1)}, {hex(err2)}")
                        else:
                            status_data['status'] = 'READY'
                            
                        # Config: Report current model setting
                        status_data['config'] = {
                            'model': 'QL-600', 
                            'auto_cut': True, 
                            'resolution': 'Standard' 
                        }

            except Exception as e:
                status_data['status'] = 'ERROR'
                status_data['errors'].append(str(e))
                
        else:
            status_data['status'] = 'OFFLINE'
            
    except Exception as e:
        status_data['errors'].append(str(e))
        
    print(json.dumps(status_data))

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Brother QL Printer Tool')
    subparsers = parser.add_subparsers(dest='command', help='Command to run')
    
    # Print Command
    print_parser = subparsers.add_parser('print', help='Print a label')
    print_parser.add_argument('input_file', help='Path to JSON data file')
    print_parser.add_argument('--model', default='QL-600', help='Printer Model')
    print_parser.add_argument('--printer', default='usb://0x04f9:0x20c0', help='Printer Identifier') # QL-600 default
    print_parser.add_argument('--backend', default='pyusb', help='Backend Identifier')
    
    # Discover Command
    discover_parser = subparsers.add_parser('discover', help='Discover printers')
    discover_parser.add_argument('--backend', default='pyusb', help='Backend Identifier')

    # Status Command
    status_parser = subparsers.add_parser('status', help='Get printer status')
    status_parser.add_argument('--printer', default='usb://0x04f9:0x20c0', help='Printer Identifier')
    status_parser.add_argument('--backend', default='pyusb', help='Backend Identifier')

    args = parser.parse_args()
    
    if args.command == 'print':
        print_label_cmd(args)
    elif args.command == 'discover':
        discover_cmd(args)
    elif args.command == 'status':
        status_cmd(args)
    else:
        # Default to print if file argument provided (backward compatibility)
        if hasattr(args, 'input_file') and args.input_file:
             # Need to mock args object
             args.command = 'print'
             print_label_cmd(args)
        else:
            parser.print_help()
