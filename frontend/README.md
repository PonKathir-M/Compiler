# Frontend - Java Compiler UI

React frontend for the Java online compiler.

## Run

```bash
npm install
npm run dev
```

Default dev URL: `http://localhost:5173`

## Backend Connection

API calls use `/api/run`. Vite proxy forwards `/api/*` to:

- `http://localhost:5000`

Configure proxy in `vite.config.js` if backend host/port changes.

## Main Files

- `src/App.jsx` - compiler UI and API integration
- `src/App.css` - component styles
- `src/index.css` - global theme and layout base
