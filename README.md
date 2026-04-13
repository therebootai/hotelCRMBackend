# Server Setup

## Install Dependencies

```bash
npm install
```

## Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Example `.env`:

```env
ENV=development
PORT=5000
CLIENT_URL=http://localhost:3000
MONGODB_URI=mongodb://127.0.0.1:27017/db-name
TOKEN_SECRET=secret
```

## Available Scripts

```bash
npm run dev
```

Start development server with hot reload using `tsx`.

```bash
npm run type-check
```

Run TypeScript type checking without building.

```bash
npm run build
```

Build the project into the `dist` folder.

```bash
npm run start
```

Start the production build from `dist`.

## Project Structure

```text
src
├── api
│   └── v1
│       ├── controllers
│       ├── interfaces
│       ├── middlewares
│       ├── models
│       ├── routes
│       └── utils
├── config
│   ├── db.ts
│   ├── env.ts
│   └── server.ts
├── constant
│   └── index.ts
└── index.ts
```

## Why `config/env.ts`

Instead of using `process.env` directly everywhere, `config/env.ts` keeps all environment variables in one place.

Benefits:

* Centralized env access
* Throws error if required variables are missing
* Keeps types consistent
* Avoids repeating `process.env`

## Why Global Error/Response Handler

The global error handler keeps all error responses consistent.

Instead of manually writing error responses in every controller, all errors go through one place and return the same structure.

Example:

```json
{
  "success": false,
  "statusCode": 404,
  "request": {
    "ip": "::1",
    "method": "GET",
    "url": "/demo-route"
  },
  "message": "Route not found",
  "data": null,
  "trace": {
    "error": "Error: Route not found"
  }
}
```

