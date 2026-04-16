import express from "express";
import { runCode } from "../controllers/runController.js";

const router = express.Router();

router.get("/", (_req, res) => {
  res.json({
    ok: true,
    message: "Java compiler API is ready.",
  });
});

router.post("/run", runCode);

export default router;
