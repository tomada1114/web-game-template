/**
 * Loads a classic script by appending a `<script>` element to `document.head`.
 *
 * @param url - The script's absolute URL.
 * @returns A promise that resolves on the element's `load` event and rejects on its `error` event.
 */
export function loadScriptElement(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.addEventListener("load", () => {
      resolve();
    });
    script.addEventListener("error", () => {
      reject(new Error(`Failed to load ${url}`));
    });
    document.head.append(script);
  });
}
