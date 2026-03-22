import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

function extractSnippet(source, pattern, label) {
  const match = source.match(pattern);
  if (!match) {
    throw new Error(`Could not extract ${label} from content_script.js`);
  }
  return match[0];
}

class FakeElement {
  constructor(attrs = {}) {
    this.attributes = { ...attrs };
    this.children = [];
    this.parentNode = null;
    this.style = {};
    this.dataset = {};
    this.disabled = false;
    this.readOnly = false;
    this.value = "";
    this.innerText = "";
    this.textContent = "";
    this.isConnected = true;
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  removeAttribute(name) {
    delete this.attributes[name];
  }

  querySelector() {
    return findFirstEditableDescendant(this.children);
  }
}

class FakeHTMLElement extends FakeElement {
  get isContentEditable() {
    const value = this.getAttribute("contenteditable");
    return value === "true" || value === "plaintext-only";
  }
}

class FakeHTMLInputElement extends FakeHTMLElement {
  constructor(attrs = {}) {
    super(attrs);
    this.type = attrs.type ?? "text";
  }
}

class FakeHTMLTextAreaElement extends FakeHTMLElement {}

function findFirstEditableDescendant(nodes) {
  for (const node of nodes) {
    if (
      node instanceof FakeHTMLInputElement ||
      node instanceof FakeHTMLTextAreaElement ||
      node.isContentEditable ||
      node.getAttribute("data-lexical-editor") === "true"
    ) {
      return node;
    }
    const nested = findFirstEditableDescendant(node.children);
    if (nested) {
      return nested;
    }
  }
  return null;
}

async function loadEditorHelpers() {
  const filePath = path.resolve("extension/content_script.js");
  const source = await readFile(filePath, "utf8");

  const snippet = [
    extractSnippet(
      source,
      /const NESTED_EDITABLE_COMPOSER_SELECTOR = \[[\s\S]*?\]\.join\(", "\);/,
      "NESTED_EDITABLE_COMPOSER_SELECTOR"
    ),
    "const busyState = new WeakMap();",
    extractSnippet(source, /function isContentEditableComposer\(el\) \{[\s\S]*?\n\}/, "isContentEditableComposer"),
    extractSnippet(source, /function isTextInputComposer\(el\) \{[\s\S]*?\n\}/, "isTextInputComposer"),
    extractSnippet(source, /function isNativeEditableComposer\(el\) \{[\s\S]*?\n\}/, "isNativeEditableComposer"),
    extractSnippet(source, /function findNestedEditableComposer\(el\) \{[\s\S]*?\n\}/, "findNestedEditableComposer"),
    extractSnippet(source, /function resolveComposerElement\(el\) \{[\s\S]*?\n\}/, "resolveComposerElement"),
    extractSnippet(source, /function isEditableComposerElement\(el\) \{[\s\S]*?\n\}/, "isEditableComposerElement"),
    extractSnippet(source, /function setBusy\(composer, sendButton, busy\) \{[\s\S]*?\n\}/, "setBusy"),
    "globalThis.__testExports = { resolveComposerElement, isEditableComposerElement, setBusy };"
  ].join("\n\n");

  const context = vm.createContext({
    WeakMap,
    Element: FakeElement,
    HTMLElement: FakeHTMLElement,
    HTMLInputElement: FakeHTMLInputElement,
    HTMLTextAreaElement: FakeHTMLTextAreaElement,
    globalThis: {}
  });
  new vm.Script(snippet).runInContext(context);
  return context.globalThis.__testExports;
}

async function testResolvesTextboxWrapperToNestedEditableComposer() {
  const { resolveComposerElement, isEditableComposerElement } = await loadEditorHelpers();

  const wrapper = new FakeHTMLElement({ role: "textbox" });
  const editor = new FakeHTMLElement({
    role: "textbox",
    "data-lexical-editor": "true",
    contenteditable: "true"
  });
  wrapper.appendChild(editor);

  assert.equal(resolveComposerElement(wrapper), editor);
  assert.equal(isEditableComposerElement(wrapper), true);
}

async function testBusyStateKeepsRichTextComposerEditableAttributeIntact() {
  const { setBusy } = await loadEditorHelpers();

  const wrapper = new FakeHTMLElement({ role: "textbox" });
  const editor = new FakeHTMLElement({
    role: "textbox",
    "data-lexical-editor": "true",
    contenteditable: "true"
  });
  const sendButton = new FakeHTMLElement();
  sendButton.disabled = false;
  wrapper.appendChild(editor);

  setBusy(wrapper, sendButton, true);
  assert.equal(editor.getAttribute("contenteditable"), "true");
  assert.equal(editor.getAttribute("aria-busy"), "true");
  assert.equal(sendButton.disabled, true);

  setBusy(wrapper, sendButton, false);
  assert.equal(editor.getAttribute("contenteditable"), "true");
  assert.equal(editor.getAttribute("aria-busy"), null);
  assert.equal(sendButton.disabled, false);
}

async function run() {
  await testResolvesTextboxWrapperToNestedEditableComposer();
  await testBusyStateKeepsRichTextComposerEditableAttributeIntact();
  console.log("content_script_editor_resolution tests: OK");
}

run();
