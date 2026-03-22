import { FilesetResolver, LlmInference } from "./lib/genai_bundle.mjs";
import {
  buildCorrectionPrompt,
  buildPrompt,
  findDisallowedPlaceholderKeys,
  normalizeOutput
} from "./offscreen_utils.mjs";
import { MODEL_DOWNLOAD_URL, getModelAssetReader, writeModelState } from "./model_cache.mjs";

const WASM_URL = chrome.runtime.getURL("lib/wasm");
const MAX_TOKENS = 4096;

let llmInferencePromise;
let llmInferenceInstance;
const RESET_MODEL_EACH_REQUEST = false;
let inferenceQueue = Promise.resolve();

async function initModel() {
  if (!llmInferencePromise) {
    llmInferencePromise = (async () => {
      try {
        const filesetResolver = await FilesetResolver.forGenAiTasks(WASM_URL);
        console.info("[Gemma Redaction] Initializing cached model stream from:", MODEL_DOWNLOAD_URL);
        const modelAssetReader = await getModelAssetReader();
        const instance = await LlmInference.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetBuffer: modelAssetReader
          },
          maxTokens: MAX_TOKENS,
          temperature: 0,
          topK: 1,
          randomSeed: 1
        });
        await writeModelState({
          status: "ready",
          error: null
        });
        console.info("[Gemma Redaction] Model ready.");
        llmInferenceInstance = instance;
        return instance;
      } catch (error) {
        await writeModelState({
          status: "error",
          error: error?.message ?? String(error)
        }).catch(() => {});
        llmInferencePromise = null;
        llmInferenceInstance = null;
        throw error;
      }
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
        const firstResult = await runInference(buildPrompt(inputText, message.redactionConfig));
        console.info("[Gemma Redaction] Inference complete.");
        let normalized =
          typeof firstResult === "string"
            ? normalizeOutput(firstResult)
            : normalizeOutput(JSON.stringify(firstResult));
        let disallowedPlaceholderKeys = findDisallowedPlaceholderKeys(normalized, message.redactionConfig);
        if (disallowedPlaceholderKeys.length > 0) {
          console.warn(
            "[Gemma Redaction] Retrying after disabled placeholders:",
            disallowedPlaceholderKeys
          );
          const retryResult = await runInference(
            buildCorrectionPrompt(inputText, message.redactionConfig, disallowedPlaceholderKeys)
          );
          normalized =
            typeof retryResult === "string"
              ? normalizeOutput(retryResult)
              : normalizeOutput(JSON.stringify(retryResult));
          disallowedPlaceholderKeys = findDisallowedPlaceholderKeys(normalized, message.redactionConfig);
        }
        if (disallowedPlaceholderKeys.length > 0) {
          throw new Error(
            `Model returned placeholders for disabled categories: ${disallowedPlaceholderKeys.join(", ")}`
          );
        }
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
