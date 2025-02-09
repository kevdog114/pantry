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
   - Touchscreen kiosks (more on that later)
   - Tablets
   - Desktop
3. and to make it easy for the user to do all of this!

## Features
1. Product tracking
   1. [x] Product list/view/edit
   2. [x] Stock item view/edit
   3. [x] Product images
   4. [x] Barcode support for products
1. Core
   1. [ ] Product search
   2. [ ] Settings management
   3. [ ] Tagging - Work in progress
   4. [x] Fridge-to-freezer expiration handling
   5. [x] Freezer-to-fridge expiration handling
   6. [x] Open item expiration handling
   7. [x] Hardware barcode scanning support
   8. [ ] Camera-based barcode scanning support - coming soon
   9. [ ] Automated backup system for database/images
2. [ ] Arduino-based scale to handle updating weights of product automatically
3. [ ] Integration with trmnl for refrigerator-friendly display
4. [ ] Raspberry Pi-based kiosk with barcode scanner and display - In Progress
5. [ ] Well-documented API
6. [ ] Integration with Home Assistant
7. [ ] Integration with Mealie (associate Mealie ingredients with Pantry Products, create meal plans, etc...)
8. [ ] Integration with existing shopping list?


## Hardware barcode scanning


## Deployment/hosting
This can easily be deployed using Docker using the included docker-compose and Dockerfile files
as-is or as a basis for your own needs. The included docker-compose and Dockerfile files are
tailored for use in Portainer.

You will need to supply several environment variables which are necessary for Pantry to work:
1. `api_baseurl` is needed so the UI knows how to access the API. Example: `https://pantry-api.yourdomain.com`
2. `ALLOW_ORIGIN` is needed by the API to allow the UI to talk to it. Example: `https://pantry.yourdomain.com`
3. `site_title` is used to control the title at the top of the webpage. Example: "Smith Family Pantry"

### API and UI
Right now, the API and UI are separate containers that each need to be accessible from a user's web browser.
This also requires the use of the `api_baseurl` and `ALLOW_ORIGIN` environment variables to function. In the
future, this may be simplified. But for now, you can use something like `swag` docker container to help simplify
this. But if you are just accessing the site locally with an IP address, then you don't need to do anything
extra right now.


... More to come ...