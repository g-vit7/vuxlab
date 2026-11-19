import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
const project = url ? new URL(url).hostname.split(".")[0] : "";
const rememberedKey = `vuxlab-${project}-remembered-auth`;
const modeKey = `vuxlab-${project}-auth-mode`;
const tabIdKey = `vuxlab-${project}-auth-tab`;
const clients = new Map<boolean, SupabaseClient>();

function getClient(remember: boolean) {
  const existing = clients.get(remember);
  if (existing) return existing;
  const tabId = sessionStorage.getItem(tabIdKey) ?? crypto.randomUUID();
  sessionStorage.setItem(tabIdKey, tabId);
  const client = createClient(url, key, {
    auth: {
      storage: remember ? localStorage : sessionStorage,
      storageKey: remember ? rememberedKey : `${tabIdKey}-${tabId}`,
      detectSessionInUrl: clients.size === 0,
    },
  });
  clients.set(remember, client);
  return client;
}

const fromAuthLink =
  url &&
  /(?:^|[?#&])(?:access_token|code|type)=/.test(
    location.hash + location.search,
  );
if (fromAuthLink) sessionStorage.setItem(modeKey, "tab");
const rememberedSession =
  !!url &&
  !fromAuthLink &&
  sessionStorage.getItem(modeKey) !== "tab" &&
  !!localStorage.getItem(rememberedKey);
if (url) localStorage.removeItem(`sb-${project}-auth-token`);
export const supabase = url && key ? getClient(rememberedSession) : null;

export async function signIn(
  email: string,
  password: string,
  remember: boolean,
) {
  const result = await getClient(remember).auth.signInWithPassword({
    email,
    password,
  });
  if (result.data.session) {
    sessionStorage.setItem(modeKey, remember ? "remembered" : "tab");
    if (remember !== rememberedSession) window.location.reload();
  }
  return result;
}

export async function signOut() {
  const { error } = await supabase!.auth.signOut();
  if (error) throw error;
  sessionStorage.setItem(modeKey, "tab");
  if (rememberedSession) window.location.assign("/");
}
