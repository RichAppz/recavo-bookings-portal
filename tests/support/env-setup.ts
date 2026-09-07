/**
 * Guarantees a working Web Storage in jsdom tests.
 *
 * Node 22 ships its own `localStorage` global that only works when the process
 * is started with `--localstorage-file`. It is defined before jsdom loads and
 * wins on `globalThis`, which Vitest's jsdom environment aliases as `window` —
 * so `window.localStorage` comes back undefined and any module that touches it
 * throws. Rather than pass a Node flag for a store we do not want anyway, the
 * shim below stands in: an in-memory Storage, per test file, cleared between
 * tests by the caller.
 *
 * Loaded by both Vitest projects. In the node project there is no window and
 * this does nothing.
 */
import { beforeEach } from "vitest";

class MemoryStorage implements Storage {
  #entries = new Map<string, string>();

  get length() {
    return this.#entries.size;
  }

  key(index: number) {
    return [...this.#entries.keys()][index] ?? null;
  }

  getItem(key: string) {
    return this.#entries.get(String(key)) ?? null;
  }

  setItem(key: string, value: string) {
    this.#entries.set(String(key), String(value));
  }

  removeItem(key: string) {
    this.#entries.delete(String(key));
  }

  clear() {
    this.#entries.clear();
  }
}

function install(name: "localStorage" | "sessionStorage") {
  // Installed unconditionally rather than probed first: merely reading Node's
  // global is what prints the experimental warning, and jsdom's own store is
  // unreachable behind it regardless of what the probe would say.
  const storage = new MemoryStorage();
  Object.defineProperty(window, name, {
    value: storage,
    configurable: true,
    writable: true,
  });
  // Modules that captured the bare global at import time need it too.
  Object.defineProperty(globalThis, name, {
    value: storage,
    configurable: true,
    writable: true,
  });
}

if (typeof window !== "undefined") {
  install("localStorage");
  install("sessionStorage");

  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
}
