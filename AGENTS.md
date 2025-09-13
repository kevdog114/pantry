# Agent Instructions

This document provides instructions for AI agents working with the Pantry codebase.

## Project Overview

Pantry is a full-stack web application designed for managing your pantry. It consists of two main components:

*   **API:** A backend service built with Node.js and TypeScript, located in the `api/` directory. It handles all business logic and data persistence.
*   **UI:** A frontend application built with Angular, located in the `ui/pantry-ui/` directory. It provides the user interface for interacting with the application.

The entire application is designed to be run with Docker, using the `docker-compose.yml` file in the root directory.

## How to Run the Application

The recommended way to run the application is by using Docker Compose.

1.  **Create a `stack.env` file:** In the root directory, create a file named `stack.env`. This file will contain the environment variables required by the application. The following variables are required:
    *   `api_baseurl`: The base URL for the API (e.g., `http://localhost:4300`).
    *   `ALLOW_ORIGIN`: The URL of the UI, for CORS (e.g., `http://localhost:4200`).
    *   `site_title`: The title to be displayed on the website (e.g., "My Pantry").

2.  **Run Docker Compose:**
    ```bash
    docker-compose up -d --build
    ```

This will build the Docker images for the API and UI and start the containers in detached mode.

*   The UI will be available at `http://localhost:4200`.
*   The API will be available at `http://localhost:4300`.

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

To work on the UI locally, navigate to the `ui/pantry-ui/` directory.

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
