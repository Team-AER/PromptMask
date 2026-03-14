import { FilesetResolver, LlmInference } from "./lib/genai_bundle.mjs";
import { buildPrompt, normalizeOutput } from "./offscreen_utils.mjs";

const MODEL_URLS = [
  "http://127.0.0.1:8000/models/gemma-3n-E2B-it-int4-Web.litertlm",
  "http://localhost:8000/models/gemma-3n-E2B-it-int4-Web.litertlm"
];
const WASM_URL = chrome.runtime.getURL("lib/wasm");
const MAX_TOKENS = 4096;

let llmInferencePromise;
let llmInferenceInstance;
const RESET_MODEL_EACH_REQUEST = true;
let inferenceQueue = Promise.resolve();

async function initModel() {
  if (!llmInferencePromise) {
    llmInferencePromise = (async () => {
      const filesetResolver = await FilesetResolver.forGenAiTasks(WASM_URL);
      let lastError;

      for (const modelUrl of MODEL_URLS) {
        try {
          console.info("[Gemma Redaction] Initializing model from:", modelUrl);
          const instance = await LlmInference.createFromOptions(filesetResolver, {
            baseOptions: {
              modelAssetPath: modelUrl
            },
            maxTokens: MAX_TOKENS,
            temperature: 0,
            topK: 1,
            randomSeed: 1
          });
          console.info("[Gemma Redaction] Model ready:", modelUrl);
          llmInferenceInstance = instance;
          return instance;
        } catch (err) {
          lastError = err;
          console.warn("[Gemma Redaction] Model init failed for URL:", modelUrl, err);
        }
      }

      throw (
        lastError ??
        new Error(
          `Failed to load model from all URLs: ${MODEL_URLS.join(", ")}`
        )
      );
    })();
  }
  return llmInferencePromise;
}

async function runInference(prompt) {
  const llmInference = await initModel();
  let result;
  if (typeof llmInference.generateResponse === "function") {
    result = await llmInference.generateResponse(prompt);
  } else if (typeof llmInference.generate === "function") {
    result = await llmInference.generate(prompt);
  } else {
    throw new Error("No compatible generate method found on LlmInference.");
  }
  if (RESET_MODEL_EACH_REQUEST && llmInferenceInstance?.close) {
    try {
      llmInferenceInstance.close();
    } finally {
      llmInferencePromise = null;
      llmInferenceInstance = null;
    }
  }
  return result;
}

function enqueueInference(task) {
  const run = inferenceQueue.then(task);
  inferenceQueue = run.catch(() => {});
  return run;
}

chrome.runtime.onMessage.addListener((message) => {
  if (!message || message.target !== "offscreen" || message.type !== "LLM_PROMPT") {
    return;
  }

  (async () => {
    await enqueueInference(async () => {
      try {
        const inputText = message.prompt ?? "";
        const result = await runInference(buildPrompt(inputText, message.redactionConfig));
        console.info("[Gemma Redaction] Inference complete.");
        const normalized =
          typeof result === "string"
            ? normalizeOutput(result)
            : normalizeOutput(JSON.stringify(result));
        chrome.runtime.sendMessage({
          target: "service_worker",
          type: "LLM_RESULT",
          requestId: message.requestId,
          result: normalized
        });
      } catch (err) {
        console.error("[Gemma Redaction] Inference failed:", err);
        chrome.runtime.sendMessage({
          target: "service_worker",
          type: "LLM_RESULT",
          requestId: message.requestId,
          error: err?.message ?? String(err)
        });
      }
    });
  })();
});
