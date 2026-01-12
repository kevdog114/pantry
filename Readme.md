# Pantry

Pantry is a self-hosted, open-source web app for managing your pantry. Other available
options didn't suit my personal needs (either too complicated, didn't work well on
smaller screens, or some other reasons), so I decided to write my own.

> [!CAUTION]
> This project currently does not implement any sort of authentication or authorization.
> If you are deploying this and not making it available to the Internet, then you should
> be aware of that. If you are deploying it to the Internet, then you need to implement
> your own authentication/authorization mechanisms.
> This is planned in a future release.

> [!WARNING]
> This project is in the early stages. As such, it is constantly changing. Be aware that
> if you use this project, you should be prepared to lose data if breaking changes are made
> and/or to take backups before upgrading to newer releases.

## Goals
The primary goals of this project are:
1. Track what products you have in stock
2. Track when things expire
3. To have a modern UI that works well on many screen sizes
   - Phones
   - Touchscreen kiosks
   - Tablets
   - Desktop
4. and to make it easy for the user to do all of this!

## Features
1. **Product Tracking**
   1. [x] Product list/view/edit
   2. [x] Stock item view/edit
   3. [x] Product images
   4. [x] Barcode support for products (UPC, EAN, etc.)
   5. [x] Expiration date tracking (Fridge-to-freezer, Freezer-to-fridge, Open item handling)
   6. [x] Product Tagging
   7. [x] Search capabilities

2. **Core Functionality**
   1. [x] Hardware barcode scanning support (USB scanners)
   2. [x] Camera-based barcode scanning support (Mobile/Webcam)
   3. [x] Settings management
   4. [ ] Automated backup system for database/images

3. **Smart Features (AI Powered)**
   1. [x] Gemini Integration for product categorization and details
   2. [x] AI-assisted product tagging
   3. [x] Context-aware recipe chat (Audio/Text)

4. **Planning & Shopping**
   1. [x] Shopping List (Add/Remove/Sort items)
   2. [x] Recipe Management

5. **Hardware Integrations**
   1. [x] Label Printing (Brother Label Printers)
      - Dynamic label sizing
      - Modifier labels (e.g., "Opened", "Frozen")
   2. [x] Raspberry Pi Kiosk capability
   3. [x] Home Assistant Integration (Display control)
   4. [ ] Arduino-based scale (Planned)
   5. [ ] Trmnl E-ink display integration (Planned)

6. **Integrations**
   1. [ ] Mealie Integration (Planned)


## Hardware Support
### Barcode Scanners
Pantry supports standard USB HID barcode scanners. No special configuration is usually required; they just act as keyboard input.

### Label Printing
Pantry supports printing custom labels for stock items (including expiration dates and QR codes) using Brother QL-series label printers (specifically tested with QL-600 series). This requires running the **rpi-kiosk** bridge software.

### Raspberry Pi Kiosk
A dedicated Kiosk mode is available for Raspberry Pi devices, allowing for a touch-friendly interface, direct hardware label printing, and Home Assistant display integration.
See [rpi-kiosk/README.md](./rpi-kiosk/README.md) for detailed installation and configuration instructions.

## Deployment/hosting
This can easily be deployed using Docker using the included docker-compose and Dockerfile files
as-is or as a basis for your own needs. The included docker-compose and Dockerfile files are
tailored for use in Portainer.

You will need to supply several environment variables which are necessary for Pantry to work:
1. `API_BASEURL` is needed so the UI knows how to access the API. Example: `https://pantry-api.yourdomain.com`
2. `ALLOW_ORIGIN` is needed by the API to allow the UI to talk to it. Example: `https://pantry.yourdomain.com`
3. `SITE_TITLE` is used to control the title at the top of the webpage. Example: "Smith Family Pantry"
4. `GEMINI_API_KEY` is required for AI features (product categorization, recipe chat). Get one from Google AI Studio.

### API and UI
Right now, the API and UI are separate containers that each need to be accessible from a user's web browser.
This also requires the use of the `API_BASEURL` and `ALLOW_ORIGIN` environment variables to function. In the
future, this may be simplified. But for now, you can use something like `swag` docker container to help simplify
this. But if you are just accessing the site locally with an IP address, then you don't need to do anything
extra right now.



... More to come ...
