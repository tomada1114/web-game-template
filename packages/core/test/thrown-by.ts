/** Returns what `run` throws, or `undefined` when it returns. */
export function thrownBy(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
}
