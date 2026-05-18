#!/usr/bin/env python3
"""Generate sample 23mm label images for inspection (no printing)."""
import sys
import os
import json
import tempfile

# Add the bridge directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from print_label import create_label_image

output_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'sample-labels')
os.makedirs(output_dir, exist_ok=True)

# Sample abbreviations
abbreviations = [
    {"words": "chicken,chickens", "short": "chkn"},
    {"words": "bread,breads", "short": "brd"},
    {"words": "sausage,sausages", "short": "sage"},
    {"words": "mushroom,mushrooms", "short": "mshrm"},
    {"words": "pepper,peppers", "short": "pep"},
]

samples = [
    {
        "name": "stock-normal",
        "data": {
            "title": "Chicken Breast",
            "expirationDate": "2026-06-15",
            "stockId": 42,
            "qrData": "S2-42",
            "size": "23mm",
            "frozen": False,
            "opened": False,
            "abbreviations": abbreviations
        }
    },
    {
        "name": "stock-frozen",
        "data": {
            "title": "Italian Sausage",
            "expirationDate": "2026-08-20",
            "stockId": 99,
            "qrData": "S2-99",
            "size": "23mm",
            "frozen": True,
            "opened": False,
            "abbreviations": abbreviations
        }
    },
    {
        "name": "stock-opened",
        "data": {
            "title": "Sourdough Bread",
            "expirationDate": "2026-05-25",
            "stockId": 17,
            "qrData": "S2-17",
            "size": "23mm",
            "frozen": False,
            "opened": True,
            "abbreviations": abbreviations
        }
    },
    {
        "name": "recipe-normal",
        "data": {
            "title": "Mushroom Pepper Stir Fry",
            "preparedDate": "2026-05-18",
            "qrData": "R-55",
            "size": "23mm",
            "abbreviations": abbreviations
        }
    },
    {
        "name": "recipe-long-name",
        "data": {
            "title": "Chicken Mushroom Pepper Bread Sausage Bake",
            "preparedDate": "2026-05-18",
            "qrData": "R-123",
            "size": "23mm",
            "abbreviations": abbreviations
        }
    },
    {
        "name": "stock-no-abbreviations",
        "data": {
            "title": "Almonds",
            "expirationDate": "2027-01-10",
            "stockId": 5,
            "qrData": "S2-5",
            "size": "23mm",
            "frozen": False,
            "opened": False,
            "abbreviations": []
        }
    },
]

for sample in samples:
    try:
        img = create_label_image(sample["data"])
        out_path = os.path.join(output_dir, f"{sample['name']}.png")
        img.save(out_path, 'PNG')
        print(f"Generated: {out_path} ({img.size[0]}x{img.size[1]})")
    except Exception as e:
        print(f"Error generating {sample['name']}: {e}")
        import traceback
        traceback.print_exc()

print(f"\nAll samples saved to: {output_dir}")
