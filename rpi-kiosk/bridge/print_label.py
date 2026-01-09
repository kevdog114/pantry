
import sys
import json
import argparse
from PIL import Image, ImageDraw, ImageFont
import qrcode
from brother_ql.conversion import convert
from brother_ql.backends.helpers import send
from brother_ql.raster import BrotherQLRaster

def create_label_image(data):
    # Label properties (Brother QL-600 with 62mm tape)
    # 62mm tape is approx 696 pixels wide (printable area around 620-690 depending on margins)
    # Let's target a width of 696 (standard for 62mm)
    # Height is variable for continuous tape.
    
    width = 696
    height = 500 # Adjust based on content
    
    # Create white image
    img = Image.new('RGB', (width, height), color='white')
    draw = ImageDraw.Draw(img)
    
    # Load fonts (using default if custom not found)
    # On Debian/Linux, fonts are often in /usr/share/fonts
    # We'll use default PIL font or try to load a ttf
    try:
        font_large = ImageFont.truetype("/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf", 60)
        font_medium = ImageFont.truetype("/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf", 40)
        font_small = ImageFont.truetype("/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf", 30)
    except:
        font_large = ImageFont.load_default()
        font_medium = ImageFont.load_default()
        font_small = ImageFont.load_default()

    # Draw Title
    title = data.get('title', 'Unknown Product')[:30] # Truncate if too long
    draw.text((20, 20), title, font=font_large, fill='black')
    
    # Draw Qty and Expiration
    qty = f"Qty: {data.get('quantity', 1)}"
    expires = f"Expires: {data.get('expirationDate', 'N/A')}"
    
    draw.text((20, 100), qty, font=font_medium, fill='black')
    draw.text((20, 150), expires, font=font_medium, fill='black')
    
    # Draw Code (Stock ID)
    code_text = f"ID: {data.get('stockId', '')}"
    draw.text((20, 220), code_text, font=font_small, fill='black')

    # Generate QR Code
    qr_data = data.get('qrData', f"STOCK:{data.get('stockId')}")
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=2,
    )
    qr.add_data(qr_data)
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color="black", back_color="white")
    
    # Resize QR if needed (e.g. max 200x200)
    qr_img = qr_img.resize((200, 200))
    
    # Paste QR code on the right side
    img.paste(qr_img, (width - 240, 50))
    
    return img

def print_label(data, model='QL-600', backend_identifier='pyusb', printer_identifier='usb://0x04f9:0x204b'):
    img = create_label_image(data)
    
    # Convert image to brother_ql instructions
    qlr = BrotherQLRaster(model)
    qlr.exception_on_warning = True
    
    # 62 is the tape width in mm (Red/Black or Black)
    # For QL-600 usually separate logic.
    # We will assume "62" label (dk-2205 equivalent)
    instructions = convert(
        qlr=qlr, 
        images=[img], 
        label='62', 
        cut=True, 
        dither=True, 
        compress=False, 
        red=False
    )
    
    # Send to printer
    send(
        instructions=instructions, 
        printer_identifier=printer_identifier, 
        backend_identifier=backend_identifier, 
        blocking=True
    )

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Print Label')
    parser.add_argument('json_data', help='JSON string of label data')
    args = parser.parse_args()
    
    try:
        data = json.loads(args.json_data)
        print(f"Printing label for: {data.get('title')}")
        print_label(data)
        print("Print successful")
    except Exception as e:
        print(f"Error printing: {e}", file=sys.stderr)
        sys.exit(1)
