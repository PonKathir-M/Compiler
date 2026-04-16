# Java Compiler Project

A full-stack Java online compiler built with:

- Frontend: React + Vite
- Backend: Node.js + Express
- Java toolchain: `javac` + `java` from installed JDK

## Features

- Java code editor with ready-made examples
- Standard input box for `Scanner` programs
- Compile + run in isolated temp folders
- Compilation errors and runtime errors shown in console
- Timeout protection for compile and run phases
- Execution metadata (class name, compile time, run time, total time)

## Project Structure

```text
java_compiler_project/
|-- backend/
|   |-- controllers/
|   |-- routes/
|   |-- services/
|   |-- index.js
|   `-- package.json
|-- frontend/
|   |-- src/
|   |   |-- App.jsx
|   |   |-- App.css
|   |   `-- index.css
|   |-- vite.config.js
|   `-- package.json
`-- README.md
```

## Requirements

- Node.js 18+
- npm
- JDK 17+ with:
  - `java` in PATH
  - `javac` in PATH

## Run Backend

```bash
cd backend
npm install
npm run dev
```

Backend starts on `http://localhost:5000`.

## Run Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend starts on `http://localhost:5173`.

Vite proxy forwards `/api/*` to backend `http://localhost:5000`.

## API

`POST /api/run`

Request:

```json
{
  "language": "java",
  "code": "public class Main { public static void main(String[] args) { System.out.println(\"Hi\"); } }",
  "input": ""
}
```

Response:

```json
{
  "ok": true,
  "status": "success",
  "message": "Program executed successfully.",
  "output": "Hi",
  "meta": {
    "className": "Main",
    "compileTimeMs": 412,
    "runTimeMs": 97,
    "totalTimeMs": 509
  }
}
```

## Notes

- This app is designed for learning and local use.
- For internet-facing production use, run execution inside containers/jails with strict resource limits.
