import assert from "node:assert/strict";
import {
  MODEL_DISPLAY_SIZE,
  MODEL_EXPECTED_BYTES,
  createDefaultModelState,
  describeModelState,
  formatByteCount,
  normalizeModelState
} from "./model_cache.mjs";

function testFormatByteCount() {
  assert.equal(formatByteCount(0), "0 B");
  assert.equal(formatByteCount(1024), "1 KB");
  assert.equal(formatByteCount(5 * 1024 * 1024), "5.0 MB");
  assert.equal(formatByteCount(3 * 1024 * 1024 * 1024), "3.00 GB");
}

function testNormalizeModelStateUsesDefaults() {
  const state = normalizeModelState(null);

  assert.equal(state.status, "not_downloaded");
  assert.equal(state.downloadedBytes, 0);
  assert.equal(state.totalBytes, MODEL_EXPECTED_BYTES);
  assert.equal(state.expectedBytes, MODEL_EXPECTED_BYTES);
}

function testNormalizeModelStatePreservesProgress() {
  const state = normalizeModelState({
    status: "downloading",
    downloadedBytes: 512,
    totalBytes: 1024
  });

  assert.equal(state.status, "downloading");
  assert.equal(state.downloadedBytes, 512);
  assert.equal(state.totalBytes, 1024);
}

function testDescribeModelStateForDownload() {
  const { summary, detail } = describeModelState({
    status: "downloading",
    downloadedBytes: MODEL_EXPECTED_BYTES / 2,
    totalBytes: MODEL_EXPECTED_BYTES
  });

  assert.ok(summary.includes("50%"));
  assert.ok(detail.includes("saved locally"));
}

function testDescribeModelStateForReady() {
  const { summary, detail } = describeModelState({
    ...createDefaultModelState(),
    status: "ready"
  });

  assert.equal(summary, "Model ready for local redaction.");
  assert.equal(detail, `Stored locally (${MODEL_DISPLAY_SIZE}).`);
}

function testDescribeModelStateForLoading() {
  const { summary, detail } = describeModelState({
    ...createDefaultModelState(),
    status: "loading"
  });

  assert.equal(summary, "Opening local model...");
  assert.equal(detail, `Using ${MODEL_DISPLAY_SIZE} model cache.`);
}

function testDescribeModelStateForNotDownloaded() {
  const { summary, detail } = describeModelState(createDefaultModelState());

  assert.equal(summary, `First use downloads about ${MODEL_DISPLAY_SIZE}.`);
  assert.equal(detail, "The model is saved locally after the initial download.");
}

function run() {
  testFormatByteCount();
  testNormalizeModelStateUsesDefaults();
  testNormalizeModelStatePreservesProgress();
  testDescribeModelStateForDownload();
  testDescribeModelStateForReady();
  testDescribeModelStateForLoading();
  testDescribeModelStateForNotDownloaded();
  console.log("model_cache tests: OK");
}

run();
