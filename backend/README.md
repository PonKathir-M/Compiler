# Backend - Java Compiler API

Express API for compiling and running Java code snippets using local `javac` and `java`.

## Run

```bash
npm install
npm run dev
```

Default port: `5000` (override with `PORT`)

## Endpoints

- `GET /api/health` - health check
- `GET /api` - API readiness message
- `POST /api/run` - compile + run Java code

## Request Body (`POST /api/run`)

```json
{
  "language": "java",
  "code": "public class Main { public static void main(String[] args) { System.out.println(\"Hello\"); } }",
  "input": ""
}
```

## Response Status Values

- `success`
- `compile_error`
- `runtime_error`
- `compile_timeout`
- `runtime_timeout`
- `validation_error`
- `toolchain_error`

## Important

This service executes user code locally. For production deployment, use strong sandboxing (containers, seccomp, CPU/memory limits, isolated network/filesystem).
