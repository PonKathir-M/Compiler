import { executeJava } from "../services/javaService.js";

export const runCode = async (req, res) => {
  console.log("Controller reached");
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    return res.status(400).json({
      ok: false,
      status: "validation_error",
      message: "Request body must be a JSON object.",
      requestId: req.requestId || null,
    });
  }

  const { code, input = "", language = "java" } = req.body;
  const normalizedLanguage =
    typeof language === "string" ? language.trim().toLowerCase() : "";

  if (normalizedLanguage !== "java") {
    return res.status(400).json({
      ok: false,
      status: "validation_error",
      message: "Only Java is supported by this endpoint.",
      requestId: req.requestId || null,
    });
  }

  if (typeof code !== "string" || code.trim().length === 0) {
    return res.status(400).json({
      ok: false,
      status: "validation_error",
      message: "Request body must include non-empty `code`.",
      requestId: req.requestId || null,
    });
  }

  if (typeof input !== "string") {
    return res.status(400).json({
      ok: false,
      status: "validation_error",
      message: "`input` must be a string.",
      requestId: req.requestId || null,
    });
  }

  if (code.length > 100_000) {
    return res.status(400).json({
      ok: false,
      status: "validation_error",
      message: "`code` is too large. Limit is 100000 characters.",
      requestId: req.requestId || null,
    });
  }

  if (input.length > 50_000) {
    return res.status(400).json({
      ok: false,
      status: "validation_error",
      message: "`input` is too large. Limit is 50000 characters.",
      requestId: req.requestId || null,
    });
  }

  try {
    const result = await executeJava(code, input);
    return res.status(result.httpStatus).json({
      ...result.body,
      requestId: req.requestId || null,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      status: "server_error",
      message: error.message || "Unexpected error while executing Java code.",
      requestId: req.requestId || null,
    });
  }
};
