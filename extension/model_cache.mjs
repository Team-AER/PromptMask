export const MODEL_SOURCE_PAGE_URL =
  "https://huggingface.co/Team-AER/promptmask-local-pii-redaction/tree/main";
export const MODEL_REVISION = "16e3f95d897225f6c1cb4ff15206ac6b324ea0b3";
export const MODEL_FILE_NAME = "promptmask-gemma3n-redactor-v1.litertlm";
export const MODEL_DOWNLOAD_URL = `https://huggingface.co/Team-AER/promptmask-local-pii-redaction/resolve/${MODEL_REVISION}/${MODEL_FILE_NAME}?download=true`;
export const MODEL_CACHE_NAME = "promptmask-model-cache-v1";
export const MODEL_STATE_KEY = "promptmask_model_state_v1";
export const MODEL_EXPECTED_BYTES = 3040000000;

const DOWNLOAD_PROGRESS_INTERVAL_MS = 750;
const DOWNLOAD_PROGRESS_INTERVAL_BYTES = 8 * 1024 * 1024;

export function createDefaultModelState() {
  return {
    revision: MODEL_REVISION,
    fileName: MODEL_FILE_NAME,
    sourcePageUrl: MODEL_SOURCE_PAGE_URL,
    downloadUrl: MODEL_DOWNLOAD_URL,
    expectedBytes: MODEL_EXPECTED_BYTES,
    totalBytes: MODEL_EXPECTED_BYTES,
    downloadedBytes: 0,
    status: "not_downloaded",
    lastUpdatedAt: null,
    error: null
  };
}

export function normalizeModelState(raw) {
  const base = createDefaultModelState();
  const source = raw && typeof raw === "object" ? raw : {};

  return {
    ...base,
    ...source,
    revision: MODEL_REVISION,
    fileName: MODEL_FILE_NAME,
    sourcePageUrl: MODEL_SOURCE_PAGE_URL,
    downloadUrl: MODEL_DOWNLOAD_URL,
    expectedBytes: MODEL_EXPECTED_BYTES,
    totalBytes:
      typeof source.totalBytes === "number" && Number.isFinite(source.totalBytes) && source.totalBytes > 0
        ? source.totalBytes
        : base.totalBytes,
    downloadedBytes:
      typeof source.downloadedBytes === "number" &&
      Number.isFinite(source.downloadedBytes) &&
      source.downloadedBytes >= 0
        ? source.downloadedBytes
        : base.downloadedBytes,
    status: typeof source.status === "string" ? source.status : base.status,
    error: typeof source.error === "string" && source.error ? source.error : null,
    lastUpdatedAt:
      typeof source.lastUpdatedAt === "string" && source.lastUpdatedAt ? source.lastUpdatedAt : null
  };
}

export function isModelReady(state) {
  return normalizeModelState(state).status === "ready";
}

export function formatByteCount(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const digits = unitIndex >= 3 ? 2 : unitIndex >= 2 ? 1 : 0;
  return `${value.toFixed(digits)} ${units[unitIndex]}`;
}

export function describeModelState(raw) {
  const state = normalizeModelState(raw);
  const total = state.totalBytes || state.expectedBytes;

  switch (state.status) {
    case "ready":
      return {
        summary: "Model ready for local redaction.",
        detail: `Stored locally (${formatByteCount(total)}).`
      };
    case "downloading": {
      const percent =
        total > 0 ? Math.min(100, Math.floor((state.downloadedBytes / total) * 100)) : null;
      return {
        summary:
          percent === null
            ? "Downloading model for first use..."
            : `Downloading model for first use... ${percent}%`,
        detail: `${formatByteCount(state.downloadedBytes)} of ${formatByteCount(total)} saved locally.`
      };
    }
    case "error":
      return {
        summary: "Model download failed.",
        detail: state.error ?? "The model could not be downloaded."
      };
    case "loading":
      return {
        summary: "Opening local model...",
        detail: `Using ${formatByteCount(total)} model cache.`
      };
    case "not_downloaded":
    default:
      return {
        summary: `First use downloads about ${formatByteCount(total)}.`,
        detail: "The model is saved locally after the initial download."
      };
  }
}

export async function readModelState() {
  if (!globalThis.chrome?.storage?.local) {
    return createDefaultModelState();
  }

  const data = await chrome.storage.local.get(MODEL_STATE_KEY);
  return normalizeModelState(data[MODEL_STATE_KEY]);
}

export async function writeModelState(statePatch) {
  if (!globalThis.chrome?.storage?.local) {
    return normalizeModelState(statePatch);
  }

  const current = await readModelState();
  const next = normalizeModelState({
    ...current,
    ...statePatch,
    lastUpdatedAt: new Date().toISOString()
  });
  await chrome.storage.local.set({ [MODEL_STATE_KEY]: next });
  return next;
}

export async function openCachedModelResponse() {
  const cache = await caches.open(MODEL_CACHE_NAME);
  const cachedResponse = await cache.match(MODEL_DOWNLOAD_URL);

  if (!cachedResponse?.body) {
    return null;
  }

  return cachedResponse;
}

export async function deleteCachedModel() {
  const cache = await caches.open(MODEL_CACHE_NAME);
  await cache.delete(MODEL_DOWNLOAD_URL);
  await writeModelState({
    status: "not_downloaded",
    downloadedBytes: 0,
    totalBytes: MODEL_EXPECTED_BYTES,
    error: null
  });
}

export async function requestPersistentStorage() {
  if (typeof navigator?.storage?.persist !== "function") {
    return false;
  }

  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

function shouldEmitProgress(previousSnapshot, nextSnapshot) {
  if (!previousSnapshot) {
    return true;
  }

  const elapsed = nextSnapshot.timestamp - previousSnapshot.timestamp;
  const deltaBytes = nextSnapshot.downloadedBytes - previousSnapshot.downloadedBytes;
  return elapsed >= DOWNLOAD_PROGRESS_INTERVAL_MS || deltaBytes >= DOWNLOAD_PROGRESS_INTERVAL_BYTES;
}

function createProgressReader(stream, totalBytes) {
  const sourceReader = stream.getReader();
  let downloadedBytes = 0;
  let lastSnapshot = null;
  let stateWriteChain = Promise.resolve();

  function queueStateWrite(nextState) {
    stateWriteChain = stateWriteChain.then(() => writeModelState(nextState)).catch(() => {});
  }

  const progressStream = new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await sourceReader.read();
        if (done) {
          controller.close();
          queueStateWrite({
            status: "loading",
            downloadedBytes: totalBytes,
            totalBytes,
            error: null
          });
          return;
        }

        downloadedBytes += value.byteLength;
        const snapshot = {
          downloadedBytes,
          timestamp: Date.now()
        };

        if (shouldEmitProgress(lastSnapshot, snapshot)) {
          lastSnapshot = snapshot;
          queueStateWrite({
            status: "downloading",
            downloadedBytes,
            totalBytes,
            error: null
          });
        }

        controller.enqueue(value);
      } catch (error) {
        queueStateWrite({
          status: "error",
          downloadedBytes,
          totalBytes,
          error: error?.message ?? String(error)
        });
        controller.error(error);
      }
    },
    cancel(reason) {
      return sourceReader.cancel(reason);
    }
  });

  return progressStream.getReader();
}

export async function getModelAssetReader() {
  await requestPersistentStorage();

  const cachedResponse = await openCachedModelResponse();
  if (cachedResponse?.body) {
    const totalBytes =
      Number(cachedResponse.headers.get("content-length")) || MODEL_EXPECTED_BYTES;
    await writeModelState({
      status: "ready",
      downloadedBytes: totalBytes,
      totalBytes,
      error: null
    });
    return cachedResponse.body.getReader();
  }

  const cache = await caches.open(MODEL_CACHE_NAME);
  await writeModelState({
    status: "downloading",
    downloadedBytes: 0,
    totalBytes: MODEL_EXPECTED_BYTES,
    error: null
  });

  let response;
  try {
    response = await fetch(MODEL_DOWNLOAD_URL, { cache: "no-store" });
  } catch (error) {
    await writeModelState({
      status: "error",
      downloadedBytes: 0,
      totalBytes: MODEL_EXPECTED_BYTES,
      error: error?.message ?? String(error)
    });
    throw error;
  }

  if (!response.ok || !response.body) {
    const error = new Error(
      `Failed to fetch model: ${MODEL_DOWNLOAD_URL} (${response.status || "no response"})`
    );
    await writeModelState({
      status: "error",
      downloadedBytes: 0,
      totalBytes: MODEL_EXPECTED_BYTES,
      error: error.message
    });
    throw error;
  }

  const totalBytes = Number(response.headers.get("content-length")) || MODEL_EXPECTED_BYTES;
  const [cacheStream, modelStream] = response.body.tee();
  const cacheResponse = new Response(cacheStream, {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText
  });

  const cacheWritePromise = cache
    .put(MODEL_DOWNLOAD_URL, cacheResponse)
    .then(async () => {
      await writeModelState({
        status: "ready",
        downloadedBytes: totalBytes,
        totalBytes,
        error: null
      });
    })
    .catch(async (error) => {
      await cache.delete(MODEL_DOWNLOAD_URL);
      await writeModelState({
        status: "error",
        downloadedBytes: 0,
        totalBytes,
        error: error?.message ?? String(error)
      });
      throw error;
    });

  const reader = createProgressReader(modelStream, totalBytes);
  reader.closed.catch(() => {});
  cacheWritePromise.catch(() => {});
  return reader;
}
