import { spawn } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";

const COMPILE_TIMEOUT_MS = 10_000;
const RUN_TIMEOUT_MS = 5_000;
const MAX_OUTPUT_CHARS = 120_000;
const MAX_INPUT_CHARS = 50_000;
const PACKAGE_DECLARATION_REGEX = /\bpackage\s+[A-Za-z_][\w.]*\s*;/;
const ANY_TYPE_DECLARATION_REGEX =
  /\b(?:class|interface|enum|record)\s+[A-Za-z_]\w*/;
const PUBLIC_TYPE_REGEX =
  /\bpublic\s+(?:class|interface|enum|record)\s+([A-Za-z_]\w*)/;
const ANY_TYPE_REGEX = /\b(?:class|interface|enum|record)\s+([A-Za-z_]\w*)/;
const MAIN_METHOD_REGEX = /\bpublic\s+static\s+void\s+main\s*\(/;
const TOP_LEVEL_TYPE_NAME_REGEX =
  /\b(?:class|interface|enum|record)\s+([A-Za-z_]\w*)/g;
const OUTPUT_TRUNCATION_NOTE = `[Output truncated to ${MAX_OUTPUT_CHARS} characters]`;

const buildResponse = ({
  ok,
  status,
  message,
  output = "",
  className = null,
  sourceTypeName = null,
  compileTimeMs = null,
  runTimeMs = null,
}) => {
  const totalTimeMs =
    typeof compileTimeMs === "number" && typeof runTimeMs === "number"
      ? compileTimeMs + runTimeMs
      : compileTimeMs ?? runTimeMs ?? null;

  return {
    httpStatus: status === "validation_error" ? 400 : 200,
    body: {
      ok,
      status,
      message,
      output,
      meta: {
        className,
        sourceTypeName,
        compileTimeMs,
        runTimeMs,
        totalTimeMs,
      },
    },
  };
};

const pushUnique = (list, value) => {
  if (!value || list.includes(value)) return;
  list.push(value);
};

const inferSourceTypeName = (code) => {
  const publicTypeMatch = code.match(PUBLIC_TYPE_REGEX);
  if (publicTypeMatch) return publicTypeMatch[1];

  const anyTypeMatch = code.match(ANY_TYPE_REGEX);
  if (anyTypeMatch) return anyTypeMatch[1];

  return null;
};

const inferNearestClassBeforeMain = (code, fallbackClassName) => {
  const mainMatch = code.match(MAIN_METHOD_REGEX);
  if (!mainMatch || typeof mainMatch.index !== "number") {
    return fallbackClassName;
  }

  const classRegex = /\bclass\s+([A-Za-z_]\w*)/g;
  const codeBeforeMain = code.slice(0, mainMatch.index);
  let nearestClass = null;
  let match = classRegex.exec(codeBeforeMain);

  while (match) {
    nearestClass = match[1];
    match = classRegex.exec(codeBeforeMain);
  }

  return nearestClass || fallbackClassName;
};

const inferEntryTypeCandidates = (code, sourceTypeName) => {
  const candidates = [];

  pushUnique(candidates, inferNearestClassBeforeMain(code, null));
  pushUnique(candidates, sourceTypeName);

  for (const match of code.matchAll(TOP_LEVEL_TYPE_NAME_REGEX)) {
    pushUnique(candidates, match[1]);
  }

  return candidates;
};

const isMissingMainError = (output) =>
  /\bmain method not found\b/i.test(output) ||
  /\bmain method is not static\b/i.test(output) ||
  /\bmain method must return a value of type void\b/i.test(output);

const isClassResolutionError = (output) =>
  /\bcould not find or load main class\b/i.test(output);

const formatCombinedOutput = (stdout, stderr, truncated) => {
  const chunks = [
    stdout.replace(/\r\n/g, "\n"),
    stderr.replace(/\r\n/g, "\n"),
  ].filter(Boolean);

  const normalized = chunks.join("\n").trimEnd();

  if (!truncated) return normalized;
  if (!normalized) return OUTPUT_TRUNCATION_NOTE;

  return `${normalized}\n\n${OUTPUT_TRUNCATION_NOTE}`;
};

const killProcessTree = (processRef) => {
  if (!processRef || processRef.killed) return;

  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(processRef.pid), "/t", "/f"], {
      windowsHide: true,
    });
    return;
  }

  processRef.kill("SIGKILL");
};

const runProcess = ({
  command,
  args,
  cwd,
  stdin = "",
  timeoutMs,
  envOverrides = {},
}) => new Promise((resolve) => {
  const startedAt = Date.now();
  let stdout = "";
  let stderr = "";
  let capturedChars = 0;
  let truncated = false;
  let timedOut = false;
  let settled = false;

  let timeoutHandle;

  const finalize = (payload) => {
    if (settled) return;
    settled = true;
    if (timeoutHandle) clearTimeout(timeoutHandle);
    resolve({
      durationMs: Date.now() - startedAt,
      stdout,
      stderr,
      truncated,
      timedOut,
      ...payload,
    });
  };

  const appendWithLimit = (target, chunk) => {
    const text = chunk.toString("utf8");
    if (!text) return target;

    const remainingChars = MAX_OUTPUT_CHARS - capturedChars;
    if (remainingChars <= 0) {
      truncated = true;
      return target;
    }

    if (text.length <= remainingChars) {
      capturedChars += text.length;
      return `${target}${text}`;
    }

    truncated = true;
    capturedChars = MAX_OUTPUT_CHARS;
    return `${target}${text.slice(0, remainingChars)}`;
  };

  let child;
  const childEnv = {
    ...process.env,
    ...envOverrides,
  };

  for (const [key, value] of Object.entries(childEnv)) {
    if (value === undefined || value === null) {
      delete childEnv[key];
    }
  }

  try {
    child = spawn(command, args, {
      cwd,
      windowsHide: true,
      env: childEnv,
    });
  } catch (error) {
    finalize({
      code: null,
      signal: null,
      failedToStart: true,
      errorMessage: error.message,
    });
    return;
  }

  timeoutHandle = setTimeout(() => {
    timedOut = true;
    killProcessTree(child);
  }, timeoutMs);
  timeoutHandle.unref?.();

  child.stdout.on("data", (chunk) => {
    stdout = appendWithLimit(stdout, chunk);
  });

  child.stderr.on("data", (chunk) => {
    stderr = appendWithLimit(stderr, chunk);
  });

  child.on("error", (error) => {
    finalize({
      code: null,
      signal: null,
      failedToStart: true,
      errorMessage: error.message,
    });
  });

  child.on("close", (code, signal) => {
    finalize({
      code,
      signal,
      failedToStart: false,
      errorMessage: null,
    });
  });

  child.stdin.on("error", () => {
    // Ignore stdin errors (for example EPIPE) when process exits early.
  });

  try {
    if (stdin.length > 0) {
      child.stdin.write(stdin);
    }
    child.stdin.end();
  } catch {
    // Ignore write/end errors that happen after process termination.
  }
});

export const executeJava = async (code, input) => {
  const normalizedCode = code.replace(/\r\n/g, "\n");
  const normalizedInput = input.replace(/\r\n/g, "\n");

  if (PACKAGE_DECLARATION_REGEX.test(normalizedCode)) {
    return buildResponse({
      ok: false,
      status: "validation_error",
      message:
        "Package declarations are not supported in this single-file compiler.",
    });
  }

  if (!ANY_TYPE_DECLARATION_REGEX.test(normalizedCode)) {
    return buildResponse({
      ok: false,
      status: "validation_error",
      message:
        "No Java type declaration found. Add a class/interface/enum/record.",
    });
  }

  if (normalizedInput.length > MAX_INPUT_CHARS) {
    return buildResponse({
      ok: false,
      status: "validation_error",
      message: "`input` is too large. Limit is 50000 characters.",
    });
  }

  const sourceTypeName = inferSourceTypeName(normalizedCode) || "Main";
  const entryTypeCandidates = inferEntryTypeCandidates(
    normalizedCode,
    sourceTypeName,
  );
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "java-compiler-"));
  const sourceFilePath = path.join(tempDir, `${sourceTypeName}.java`);

  try {
    await fs.writeFile(sourceFilePath, normalizedCode, "utf8");

    const compileResult = await runProcess({
      command: "javac",
      args: ["-encoding", "UTF-8", `${sourceTypeName}.java`],
      cwd: tempDir,
      timeoutMs: COMPILE_TIMEOUT_MS,
      envOverrides: {
        JAVA_TOOL_OPTIONS: undefined,
        _JAVA_OPTIONS: undefined,
        CLASSPATH: undefined,
      },
    });

    if (compileResult.failedToStart) {
      return buildResponse({
        ok: false,
        status: "toolchain_error",
        message:
          "Failed to start javac. Install JDK and ensure javac is available in PATH.",
        output: compileResult.errorMessage || "",
        className: entryTypeCandidates[0] || sourceTypeName,
        sourceTypeName,
      });
    }

    if (compileResult.timedOut) {
      return buildResponse({
        ok: false,
        status: "compile_timeout",
        message: `Compilation timed out after ${COMPILE_TIMEOUT_MS} ms.`,
        output: formatCombinedOutput(
          compileResult.stdout,
          compileResult.stderr,
          compileResult.truncated,
        ),
        className: entryTypeCandidates[0] || sourceTypeName,
        sourceTypeName,
        compileTimeMs: compileResult.durationMs,
      });
    }

    if (compileResult.code !== 0) {
      return buildResponse({
        ok: false,
        status: "compile_error",
        message: "Compilation failed.",
        output: formatCombinedOutput(
          compileResult.stdout,
          compileResult.stderr,
          compileResult.truncated,
        ),
        className: entryTypeCandidates[0] || sourceTypeName,
        sourceTypeName,
        compileTimeMs: compileResult.durationMs,
      });
    }

    let lastMainResolutionOutput = "";

    for (const entryTypeName of entryTypeCandidates) {
      const runResult = await runProcess({
        command: "java",
        args: ["-Xms16m", "-Xmx256m", "-cp", tempDir, entryTypeName],
        cwd: tempDir,
        stdin: normalizedInput,
        timeoutMs: RUN_TIMEOUT_MS,
        envOverrides: {
          JAVA_TOOL_OPTIONS: undefined,
          _JAVA_OPTIONS: undefined,
          CLASSPATH: undefined,
        },
      });

      if (runResult.failedToStart) {
        return buildResponse({
          ok: false,
          status: "toolchain_error",
          message:
            "Failed to start Java runtime. Install JDK and ensure java is available in PATH.",
          output: runResult.errorMessage || "",
          className: entryTypeName,
          sourceTypeName,
          compileTimeMs: compileResult.durationMs,
        });
      }

      if (runResult.timedOut) {
        return buildResponse({
          ok: false,
          status: "runtime_timeout",
          message: `Program execution timed out after ${RUN_TIMEOUT_MS} ms.`,
          output: formatCombinedOutput(
            runResult.stdout,
            runResult.stderr,
            runResult.truncated,
          ),
          className: entryTypeName,
          sourceTypeName,
          compileTimeMs: compileResult.durationMs,
          runTimeMs: runResult.durationMs,
        });
      }

      const runOutput = formatCombinedOutput(
        runResult.stdout,
        runResult.stderr,
        runResult.truncated,
      );

      if (runResult.code === 0) {
        return buildResponse({
          ok: true,
          status: "success",
          message: "Program executed successfully.",
          output: runOutput,
          className: entryTypeName,
          sourceTypeName,
          compileTimeMs: compileResult.durationMs,
          runTimeMs: runResult.durationMs,
        });
      }

      if (isMissingMainError(runOutput) || isClassResolutionError(runOutput)) {
        lastMainResolutionOutput = runOutput;
        continue;
      }

      return buildResponse({
        ok: false,
        status: "runtime_error",
        message: "Program exited with an error.",
        output: runOutput,
        className: entryTypeName,
        sourceTypeName,
        compileTimeMs: compileResult.durationMs,
        runTimeMs: runResult.durationMs,
      });
    }

    return buildResponse({
      ok: false,
      status: "validation_error",
      message:
        "No runnable `public static void main(String[] args)` method was found.",
      output: lastMainResolutionOutput,
      className: entryTypeCandidates[0] || sourceTypeName,
      sourceTypeName,
      compileTimeMs: compileResult.durationMs,
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {
      // Ignore cleanup errors from transient filesystem locks.
    });
  }
};
