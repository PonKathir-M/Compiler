import { useMemo, useState } from "react";
import "./App.css";

const MAX_CODE_CHARS = 100_000;
const MAX_INPUT_CHARS = 50_000;
const REQUEST_TIMEOUT_MS = 25_000;

const EXAMPLES = [
  {
    id: "hello",
    name: "Hello World",
    input: "",
    code: `public class Main {
  public static void main(String[] args) {
    System.out.println("Hello, Compiler!");
  }
}`,
  },
  {
    id: "scanner",
    name: "Scanner Input",
    input: "5 7",
    code: `import java.util.Scanner;

public class Main {
  public static void main(String[] args) {
    Scanner scanner = new Scanner(System.in);
    int a = scanner.nextInt();
    int b = scanner.nextInt();
    System.out.println("Sum = " + (a + b));
    scanner.close();
  }
}`,
  },
  {
    id: "fibonacci",
    name: "Fibonacci",
    input: "10",
    code: `import java.util.Scanner;

public class Main {
  public static void main(String[] args) {
    Scanner scanner = new Scanner(System.in);
    int n = scanner.nextInt();
    int a = 0;
    int b = 1;
    for (int i = 0; i < n; i++) {
      System.out.print(a + (i < n - 1 ? " " : ""));
      int next = a + b;
      a = b;
      b = next;
    }
    scanner.close();
  }
}`,
  },
];

const RESULT_LABELS = {
  success: "Success",
  compile_error: "Compile Error",
  runtime_error: "Runtime Error",
  runtime_timeout: "Runtime Timeout",
  compile_timeout: "Compile Timeout",
  validation_error: "Validation Error",
  toolchain_error: "Toolchain Error",
  network_error: "Network Error",
  running: "Running",
  idle: "Idle",
};

const getResultLabel = (status) => RESULT_LABELS[status] || "Unknown";

const parseJsonSafely = (rawText) => {
  if (!rawText) return {};

  try {
    return JSON.parse(rawText);
  } catch {
    return null;
  }
};

function App() {
  const defaultExample = EXAMPLES[0];
  const [exampleId, setExampleId] = useState(defaultExample.id);
  const [code, setCode] = useState(defaultExample.code);
  const [input, setInput] = useState(defaultExample.input);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState({
    status: "idle",
    message: "Write Java code and click Run.",
    output: "",
    meta: null,
    requestId: null,
  });

  const statusClass = useMemo(() => {
    if (result.status === "success") return "success";
    if (result.status === "running") return "running";
    if (result.status === "idle") return "idle";
    return "error";
  }, [result.status]);

  const consoleOutput = useMemo(() => {
    if (result.output) return result.output;
    if (result.status === "success") {
      return "(Program executed with no console output.)";
    }
    return "No output yet.";
  }, [result.output, result.status]);

  const runCode = async () => {
    if (isRunning) return;

    if (!code.trim()) {
      setResult({
        status: "validation_error",
        message: "Code editor is empty.",
        output: "",
        meta: null,
        requestId: null,
      });
      return;
    }

    if (code.length > MAX_CODE_CHARS) {
      setResult({
        status: "validation_error",
        message: `Code is too large. Limit is ${MAX_CODE_CHARS} characters.`,
        output: "",
        meta: null,
        requestId: null,
      });
      return;
    }

    if (input.length > MAX_INPUT_CHARS) {
      setResult({
        status: "validation_error",
        message: `Input is too large. Limit is ${MAX_INPUT_CHARS} characters.`,
        output: "",
        meta: null,
        requestId: null,
      });
      return;
    }

    setIsRunning(true);
    setResult({
      status: "running",
      message: "Compiling and running your Java program...",
      output: "",
      meta: null,
      requestId: null,
    });

    const abortController = new AbortController();
    const timeoutHandle = setTimeout(() => {
      abortController.abort();
    }, REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch("https://compiler-backend-m9js.onrender.com/api/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          language: "java",
          code,
          input,
        }),
        signal: abortController.signal,
      });

      const rawText = await response.text();
      const payload = parseJsonSafely(rawText);

      if (!payload || typeof payload !== "object") {
        setResult({
          status: "server_error",
          message: `Backend returned an invalid response (HTTP ${response.status}).`,
          output: rawText,
          meta: null,
          requestId: null,
        });
        return;
      }

      setResult({
        status: payload.status || (response.ok ? "success" : "server_error"),
        message:
          payload.message ||
          (response.ok
            ? "Execution finished."
            : `Backend returned HTTP ${response.status}.`),
        output: typeof payload.output === "string" ? payload.output : "",
        meta:
          payload.meta && typeof payload.meta === "object" ? payload.meta : null,
        requestId:
          typeof payload.requestId === "string" ? payload.requestId : null,
      });
    } catch (error) {
      const isTimeout = error?.name === "AbortError";
      setResult({
        status: "network_error",
        message: isTimeout
          ? `Request timed out after ${REQUEST_TIMEOUT_MS} ms.`
          : "Unable to reach backend API. Start backend with `npm run dev` in /backend.",
        output: error?.message || "",
        meta: null,
        requestId: null,
      });
    } finally {
      clearTimeout(timeoutHandle);
      setIsRunning(false);
    }
  };

  const loadExample = (event) => {
    const selectedId = event.target.value;
    const selected = EXAMPLES.find((example) => example.id === selectedId);
    if (!selected) return;

    setExampleId(selected.id);
    setCode(selected.code);
    setInput(selected.input);
    setResult({
      status: "idle",
      message: `Loaded example: ${selected.name}.`,
      output: "",
      meta: null,
      requestId: null,
    });
  };

  const clearAll = () => {
    setCode("");
    setInput("");
    setResult({
      status: "idle",
      message: "Editor cleared.",
      output: "",
      meta: null,
      requestId: null,
    });
  };

  return (
    <div className="app-shell">
      <header className="header">
        <div>
          <p className="eyebrow">Java Compiler Project</p>
          <h1>Online Java Compiler</h1>
        </div>
        <button className="run-btn" disabled={isRunning} onClick={runCode}>
          {isRunning ? "Running..." : "Run Code"}
        </button>
      </header>

      <main className="layout">
        <section className="panel editor-panel">
          <div className="panel-head">
            <h2>Code Editor</h2>
            <div className="actions">
              <select value={exampleId} onChange={loadExample}>
                {EXAMPLES.map((example) => (
                  <option key={example.id} value={example.id}>
                    {example.name}
                  </option>
                ))}
              </select>
              <button className="ghost-btn" onClick={clearAll} type="button">
                Clear
              </button>
            </div>
          </div>
          <textarea
            className="editor"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            spellCheck={false}
            placeholder="Write your Java code here..."
          />
          <label className="input-label" htmlFor="stdin">
            Standard Input
          </label>
          <textarea
            id="stdin"
            className="input-box"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Input for Scanner / stdin..."
            spellCheck={false}
          />
        </section>

        <section className="panel output-panel">
          <div className="panel-head">
            <h2>Output Console</h2>
            <span className={`status-pill ${statusClass}`}>
              {getResultLabel(result.status)}
            </span>
          </div>
          <p className="result-message">{result.message}</p>
          <pre className="console">{consoleOutput}</pre>

          <div className="meta-grid">
            <article>
              <h3>Main Class</h3>
              <p>{result.meta?.className || "-"}</p>
            </article>
            <article>
              <h3>Source Type</h3>
              <p>{result.meta?.sourceTypeName || "-"}</p>
            </article>
            <article>
              <h3>Compile Time</h3>
              <p>
                {typeof result.meta?.compileTimeMs === "number"
                  ? `${result.meta.compileTimeMs} ms`
                  : "-"}
              </p>
            </article>
            <article>
              <h3>Run Time</h3>
              <p>
                {typeof result.meta?.runTimeMs === "number"
                  ? `${result.meta.runTimeMs} ms`
                  : "-"}
              </p>
            </article>
            <article>
              <h3>Total Time</h3>
              <p>
                {typeof result.meta?.totalTimeMs === "number"
                  ? `${result.meta.totalTimeMs} ms`
                  : "-"}
              </p>
            </article>
            <article>
              <h3>Request ID</h3>
              <p>{result.requestId || "-"}</p>
            </article>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
