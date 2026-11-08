import { createRecoverableSession } from "./online-recovery.js?v=20261108-recovery1";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./supabase-config.js";
import { ONLINE_VERSION, RULE_LABELS } from "./card-rules.js?v=cards-20260908-r2";

const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const SUPABASE_MODULE_URL = "https://esm.sh/@supabase/supabase-js@2.112.4?bundle";

export function isOnlineConfigured() {
  return (
    /^https:\/\/.+\.supabase\.co$/i.test(SUPABASE_URL) &&
    SUPABASE_PUBLISHABLE_KEY.length > 20 &&
    !SUPABASE_PUBLISHABLE_KEY.startsWith("YOUR_")
  );
}

export function normalizeRoomCode(value = "") {
  const compact = String(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/^HAMU/, "")
    .slice(0, 6);
  return compact ? `HAMU-${compact}` : "";
}

export function generateRoomCode() {
  const randomValues = new Uint32Array(6);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(randomValues);
  } else {
    randomValues.forEach((_, index) => {
      randomValues[index] = Math.floor(Math.random() * 2 ** 32);
    });
  }
  const suffix = [...randomValues]
    .map((value) => ROOM_ALPHABET[value % ROOM_ALPHABET.length])
    .join("");
  return `HAMU-${suffix}`;
}

export async function createOnlineSession({
  role, roomCode, hostPlayer, ruleMode = "classic", channelPrefix = "punitto-othello",
  protocolVersion = ONLINE_VERSION, supportedRules = Object.keys(RULE_LABELS),
  clientFactory, ...callbacks
}) {
  if (!isOnlineConfigured()) throw new Error("Supabaseの接続情報がまだ設定されていません。");
  const normalizedRoomCode = normalizeRoomCode(roomCode);
  if (!/^HAMU-[A-Z2-9]{6}$/.test(normalizedRoomCode))
    throw new Error("キーワードは HAMU- から始まる6文字で入力してね。");
  return createRecoverableSession({
    ...callbacks, role, roomCode: normalizedRoomCode, hostPlayer, ruleMode,
    channelPrefix, protocolVersion, supportedRules,
    url: SUPABASE_URL, key: SUPABASE_PUBLISHABLE_KEY,
    loadClient: async attempt => clientFactory ?? (await import(SUPABASE_MODULE_URL + (attempt ? `&retry=${attempt}` : ""))).createClient,
  });
}
