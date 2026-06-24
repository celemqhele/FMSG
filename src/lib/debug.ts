const DEBUG = typeof process !== "undefined" && process.env.DEBUG === "true";

export function debugLog(...args: unknown[]) {
  if (DEBUG) {
    console.log(...args);
  }
}

export function debugError(...args: unknown[]) {
  if (DEBUG) {
    console.error(...args);
  }
}
