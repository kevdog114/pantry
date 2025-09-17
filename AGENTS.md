# Agent Instructions

This document provides instructions for AI agents working with the Pantry codebase.

## Project Overview

Pantry is a full-stack web application designed for managing your pantry. It consists of two main components:

*   **API:** A backend service built with Node.js and TypeScript, located in the `api/` directory. It handles all business logic and data persistence.
*   **UI:** A frontend application built with Angular, located in the `ui/pantry-ui/` directory. It provides the user interface for interacting with the application.

The entire application is designed to be run with Docker, using the `docker-compose.yml` file in the root directory.

## Prerequisites

Before you can run the application using Docker, you need to have the following software installed:

*   **Docker:** Follow the official instructions to install Docker on your system: [https://docs.docker.com/get-docker/](https://docs.docker.com/get-docker/)
*   **Docker Compose:** Docker Compose is included with Docker Desktop for Windows and macOS. For Linux systems, you may need to install it separately. Follow the official instructions: [https://docs.docker.com/compose/install/](https://docs.docker.com/compose/install/)

## How to Run the Application

There are two ways to run the application using Docker Compose:

### Production Mode

This method uses pre-built Docker images from Docker Hub.

1.  **Create a `stack.env` file:** In the root directory, create a file named `stack.env`. This file will contain the environment variables required by the application. The following variables are required:
    *   `API_BASEURL`: The base URL for the API (e.g., `http://localhost:4300`).
    *   `ALLOW_ORIGIN`: The URL of the UI, for CORS (e.g., `http://localhost:4200`).
    *   `SITE_TITLE`: The title to be displayed on the website (e.g., "My Pantry").

2.  **Run Docker Compose:**
    ```bash
    docker-compose up -d
    ```

This will pull the latest Docker images for the API and UI and start the containers in detached mode.

### Local Development Mode

This method builds the Docker images from your local source code, which is ideal for development.

1.  **Environment Configuration:**
    The development environment uses the `stack.dev.env` file for configuration. This file is already present in the repository and contains the necessary environment variables, including `DEFAULT_ADMIN_PASSWORD`. You can modify this file if you need to change any configuration values.

2.  **Run Docker Compose:**
    Use the `docker-compose.dev.yml` file to build and start the application. Run the following command from the root of the repository:
    ```bash
    docker-compose -f docker-compose.dev.yml up -d --build
    ```
    The `--build` flag ensures that the Docker images are rebuilt from your local source code.

3.  **Accessing the Application:**
    *   The backend API will be available at `http://localhost:4300`.
    *   The frontend UI will be available at `http://localhost:4200`.

4.  **Default Admin Credentials:**
    *   Username: `admin`
    *   Password: `admin` (or whatever value is set for `DEFAULT_ADMIN_PASSWORD` in `stack.dev.env`)

## API (Backend)

The API is a Node.js application written in TypeScript, using the Express.js framework.

### Development

To work on the API locally, navigate to the `api/` directory.

1.  **Install Dependencies:**
    ```bash
    npm install
    ```

2.  **Run the Development Server:**
    ```bash
    npm start
    ```
    This will start the server and watch for changes. The API will be available at `http://localhost:4300`.

### Database Migrations

The project uses Sequelize for database migrations.

*   **Run Migrations:**
    ```bash
    npx sequelize-cli db:migrate
    ```

*   **Undo Migrations:**
    ```bash
    npx sequelize-cli db:migrate:undo
    ```

*   **Create a new Migration:**
    ```bash
    npx sequelize-cli migration:generate --name your-migration-name
    ```

## UI (Frontend)

The UI is an Angular application written in TypeScript.

### Development

To work on the UI locally, navigate to the `ui/pentry-ui/` directory.

1.  **Install Dependencies:**
    ```bash
    npm install
    ```

2.  **Run the Development Server:**
    ```bash
    npm start
    ```
    This will start the development server. The UI will be available at `http://localhost:4200` and will automatically reload when you change any of the source files.

### Building the Project

To create a production build of the UI, run the following command:

```bash
npm run build
```

The build artifacts will be stored in the `dist/` directory.

### Running Tests

To run the unit tests, use the following command:

```bash
npm test
```

**Note:** The unit tests run using Karma and Chrome. You must have Google Chrome installed on your system for the tests to run. If you have Chrome installed in a non-standard location, you may need to set the `CHROME_BIN` environment variable to the path of the Chrome executable.
