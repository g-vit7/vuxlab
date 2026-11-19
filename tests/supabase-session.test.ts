import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function storage() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value);
    },
    removeItem: (key: string) => {
      items.delete(key);
    },
  };
}
const { configs } = vi.hoisted(() => ({
  configs: [] as {
    storage: ReturnType<typeof storage>;
    storageKey: string;
    detectSessionInUrl: boolean;
  }[],
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: (
    _url: string,
    _key: string,
    options: { auth: (typeof configs)[number] },
  ) => {
    configs.push(options.auth);
    const { storage, storageKey } = options.auth;
    return {
      auth: {
        signInWithPassword: async () => {
          storage.setItem(storageKey, "test-session");
          return { data: { session: {} }, error: null };
        },
      },
    };
  },
}));

const reload = vi.fn();
beforeEach(() => {
  vi.resetModules();
  configs.length = 0;
  reload.mockClear();
  vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "unused");
  vi.stubGlobal("localStorage", storage());
  vi.stubGlobal("sessionStorage", storage());
  vi.stubGlobal("location", { hash: "", search: "", reload });
  vi.stubGlobal("window", { location });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Preferência de sessão", () => {
  it("descarta o armazenamento antigo e mantém o login comum confinado à aba", async () => {
    localStorage.setItem("sb-test-auth-token", "old-session");
    const { signIn } = await import("../src/lib/supabase");
    await signIn("teste@example.test", "unused", false);
    const [{ storageKey }] = configs;
    expect(localStorage.getItem("sb-test-auth-token")).toBeNull();
    expect(localStorage.getItem("vuxlab-test-remembered-auth")).toBeNull();
    expect(sessionStorage.getItem(storageKey)).toBe("test-session");
    vi.stubGlobal("sessionStorage", storage());
    vi.resetModules();
    await import("../src/lib/supabase");
    expect(configs[1].storageKey).not.toBe(storageKey);
    expect(configs[1].storage.getItem(configs[1].storageKey)).toBeNull();
  });
  it("só escreve uma sessão persistente quando o usuário marca a opção", async () => {
    const { signIn } = await import("../src/lib/supabase");
    await signIn("teste@example.test", "unused", true);
    expect(localStorage.getItem("vuxlab-test-remembered-auth")).toBe(
      "test-session",
    );
    expect(reload).toHaveBeenCalledOnce();
    vi.stubGlobal("sessionStorage", storage());
    vi.resetModules();
    await import("../src/lib/supabase");
    expect(configs.at(-1)?.storage).toBe(localStorage);
  });
});
