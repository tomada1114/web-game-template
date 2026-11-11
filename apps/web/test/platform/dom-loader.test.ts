import { describe, expect, it, vi } from "vitest";

import { loadScriptElement } from "../../src/platform/dom-loader.js";

// A hand-rolled stand-in for the few DOM members the loader touches; no
// DOM-emulation dependency, and no network request is ever made.
function fakeDocument() {
  const listeners = new Map<string, () => void>();
  const script = {
    src: "",
    async: false,
    addEventListener: (type: string, listener: () => void) => {
      listeners.set(type, listener);
    },
  };
  const append = vi.fn();
  vi.stubGlobal("document", {
    createElement: vi.fn(() => script),
    head: { append },
  });
  return { script, append, fire: (type: string) => listeners.get(type)?.() };
}

describe("loadScriptElement", () => {
  it("appends an async script with the URL and resolves on load", async () => {
    const dom = fakeDocument();

    const loading = loadScriptElement("https://example.test/sdk.js");
    dom.fire("load");

    await expect(loading).resolves.toBeUndefined();
    expect(dom.script.src).toBe("https://example.test/sdk.js");
    expect(dom.script.async).toBe(true);
    expect(dom.append).toHaveBeenCalledExactlyOnceWith(dom.script);
  });

  it("rejects on the error event", async () => {
    const dom = fakeDocument();

    const loading = loadScriptElement("https://example.test/sdk.js");
    dom.fire("error");

    await expect(loading).rejects.toBeInstanceOf(Error);
  });
});
