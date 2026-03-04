# Aletheia Frontend

## Project Overview

The Aletheia frontend is a React-based web application for interacting with the Aletheia ZK compliance protocol.

## Tech Stack

- **Vite** — build tool & dev server
- **TypeScript** — type-safe JavaScript
- **React** — UI framework
- **shadcn/ui** — component library
- **Tailwind CSS** — utility-first styling

## Getting Started

Make sure you have Node.js & npm installed — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
# Step 1: Clone the repository
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the frontend directory
cd frontend

# Step 3: Install dependencies
npm install

# Step 4: Start the development server
npm run dev
```

The app will be available at `http://localhost:8080`.

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run lint` | Run ESLint |
| `npm run test` | Run tests |

## Deployment

Build the production bundle with `npm run build`, then serve the `dist/` folder with any static file host.
