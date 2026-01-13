
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

    elif data.get('qrData', '').startswith('R-'):
        # Recipe Label
        title = data.get('title', 'Recipe')
        date_str = data.get('preparedDate', 'N/A')
        qr_data = data.get('qrData')

        if data.get('size') == '23mm':
            width = 202
            height = 202
            img = Image.new('RGB', (width, height), color='white')
            draw = ImageDraw.Draw(img)
            
            try:
                font_date = ImageFont.truetype("/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf", 26)
                font_tiny = ImageFont.truetype("/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf", 16)
            except:
                font_date = ImageFont.load_default()
                font_tiny = ImageFont.load_default()

            # QR Code
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
            
            # Date
            txt = f"{date_str}"
            try:
                text_w = draw.textlength(txt, font=font_date)
                text_x = (width - text_w) / 2
            except:
                text_x = 10
            
            draw.text((text_x, qr_y + qr_target + 5), txt, font=font_date, fill='black')
            
        else:
            # Continuous Recipe Label
            height = 250
            img = Image.new('RGB', (width, height), color='white')
            draw = ImageDraw.Draw(img)

            try:
                font_title = ImageFont.truetype("/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf", 50)
                font_detail = ImageFont.truetype("/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf", 35)
                font_small = ImageFont.truetype("/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf", 25)
            except:
                font_title = ImageFont.load_default()
                font_detail = ImageFont.load_default()
                font_small = ImageFont.load_default()

            # Layout:
            # Left: QR
            # Right: Title, Date
            
            qr = qrcode.QRCode(box_size=6, border=1)
            qr.add_data(qr_data)
            qr.make(fit=True)
            
            qr_img = qr.make_image(fill_color="black", back_color="white")
            qr_size = 180
            qr_img = qr_img.resize((qr_size, qr_size))
            
            margin = 35
            img.paste(qr_img, (margin, margin))
            
            # Text
            text_x = margin + qr_size + 30
            
            # Truncate title
            if len(title) > 20: title = title[:19] + "..."
            draw.text((text_x, margin), title, font=font_title, fill='black')
            
            draw.text((text_x, margin + 70), f"Prep: {date_str}", font=font_detail, fill='black')
            
            draw.text((text_x, margin + 130), f"ID: {qr_data}", font=font_small, fill='black')

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
    # Get status from printer using brother_ql CLI
    # This delegates the low-level communication to the library
    
    status_data = {
        'connected': False,
        'status': 'UNKNOWN',
        'media': 'UNKNOWN',
        'errors': []
    }
    
    import subprocess
    import shutil
    
    # helper to find executable
    brother_ql_bin = shutil.which('brother_ql')
    if not brother_ql_bin:
        status_data['errors'].append("brother_ql binary not found")
        print(json.dumps(status_data))
        return

    cmd = [
        brother_ql_bin,
        '--backend', args.backend,
        '--model', args.model,
        '--printer', args.printer,
        'status'
    ]
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
        
        if result.returncode != 0:
            status_data['status'] = 'ERROR'
            status_data['errors'].append(f"Command failed: {result.stderr.strip()}")
            if "Device not found" in result.stderr:
                 status_data['status'] = 'OFFLINE'
        else:
            status_data['connected'] = True
            status_data['status'] = 'READY'
            
            # Parse Output
            # Example:
            # Model: QL-600
            # Media type: [DK] Die-cut labels
            # Media size: 23 x 23 mm
            # Errors: ...
            
            output_lines = result.stdout.split('\n')
            media_type = "Unknown"
            media_size = "Unknown"
            
            detected_width = 0
            detected_length = 0
            is_die_cut = False
            
            for line in output_lines:
                line = line.strip()
                if not line: continue
                
                lower_line = line.lower()
                
                if line.startswith("Media type:"):
                    raw_type = line.split(':', 1)[1].strip()
                    if "Die-cut" in raw_type:
                        is_die_cut = True
                    elif "Continuous" in raw_type:
                        is_die_cut = False
                        
                elif line.startswith("Media size:"):
                    media_size = line.split(':', 1)[1].strip()
                    # Try to parse dimensions "62 x 100 mm" or "62 mm"
                    parts = media_size.replace('mm', '').split('x')
                    try:
                        detected_width = int(parts[0].strip())
                        if len(parts) > 1:
                            detected_length = int(parts[1].strip())
                    except:
                        pass
                
                elif line.startswith("Errors:"):
                     errs = line.split(':', 1)[1].strip()
                     if errs and errs != "None":
                         status_data['status'] = 'ERROR'
                         status_data['errors'].append(errs)

            # Heuristic: If length is 0, treat as continuous/unknown length
            if detected_length == 0:
                is_die_cut = False

            media_type_str = 'Die-Cut' if is_die_cut else 'Continuous'
            
            # Reconstruct standardized media string
            final_media_str = f"{detected_width}mm"
            if detected_length > 0:
                final_media_str += f" x {detected_length}mm"
            final_media_str += f" {media_type_str}"
            
            status_data['media'] = final_media_str
            status_data['detected_label'] = {
                'width': detected_width,
                'length': detected_length,
                'type': 'die-cut' if is_die_cut else 'continuous'
            }
            
            status_data['config'] = {
                 'model': args.model,
                 'auto_cut': True
            }

    except Exception as e:
        status_data['errors'].append(str(e))
        status_data['status'] = 'ERROR'
        
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
