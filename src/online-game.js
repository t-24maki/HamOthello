import {
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL,
} from "./supabase-config.js";

const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const SUPABASE_MODULE_URL =
  "https://esm.sh/@supabase/supabase-js@2.112.4?bundle";

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

function flattenPresence(state) {
  return Object.values(state).flatMap((entries) => entries);
}

export async function createOnlineSession({
  role,
  roomCode,
  hostPlayer,
  onReady = () => {},
  onMessage = () => {},
  onPeerChange = () => {},
  onError = () => {},
}) {
  if (!isOnlineConfigured()) {
    throw new Error("Supabaseの接続情報がまだ設定されていません。");
  }

  const normalizedRoomCode = normalizeRoomCode(roomCode);
  if (!/^HAMU-[A-Z2-9]{6}$/.test(normalizedRoomCode)) {
    throw new Error("キーワードは HAMU- から始まる6文字で入力してね。");
  }

  const { createClient } = await import(SUPABASE_MODULE_URL);
  const client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const clientId = globalThis.crypto?.randomUUID?.() ??
    `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const joinedAt = Date.now();
  let peerId = null;
  let readyNotified = false;
  let closed = false;
  let hostLookupTimer = null;

  const channel = client.channel(`punitto-othello:${normalizedRoomCode}`, {
    config: {
      private: false,
      broadcast: { ack: true, self: false },
      presence: { key: clientId },
    },
  });

  const close = async () => {
    if (closed) return;
    closed = true;
    if (hostLookupTimer !== null) window.clearTimeout(hostLookupTimer);
    try {
      await channel.untrack();
    } finally {
      await client.removeChannel(channel);
    }
  };

  const session = {
    clientId,
    role,
    roomCode: normalizedRoomCode,
    send: async (message) => {
      if (closed || !peerId) return false;
      const response = await channel.send({
        type: "broadcast",
        event: "game-event",
        payload: { ...message, senderId: clientId, senderRole: role },
      });
      return response === "ok";
    },
    close,
  };

  const syncPresence = () => {
    if (closed) return;
    const people = flattenPresence(channel.presenceState());
    const hosts = people
      .filter((person) => person.role === "host")
      .sort((a, b) => a.joinedAt - b.joinedAt);
    const guests = people
      .filter((person) => person.role === "guest")
      .sort((a, b) => a.joinedAt - b.joinedAt);
    const previousPeerId = peerId;

    if (role === "host") {
      const otherHost = hosts.find((person) => person.clientId !== clientId);
      if (otherHost && otherHost.joinedAt <= joinedAt) {
        onError(new Error("同じキーワードのへやが見つかりました。もう一度つくり直してね。"));
        void close();
        return;
      }
      peerId = guests[0]?.clientId ?? null;
    } else {
      const ownGuestIndex = guests.findIndex(
        (person) => person.clientId === clientId,
      );
      if (ownGuestIndex > 0) {
        onError(new Error("このへやは、もう2人で遊んでいるみたい。"));
        void close();
        return;
      }
      peerId = hosts[0]?.clientId ?? null;
    }

    if (previousPeerId !== peerId) {
      onPeerChange(Boolean(peerId), { peerId, previousPeerId });
    }

    if (!peerId || readyNotified) return;
    readyNotified = true;
    if (hostLookupTimer !== null) window.clearTimeout(hostLookupTimer);
    const host = hosts[0];
    const localPlayer = role === "host" ? hostPlayer : 3 - host.player;
    onReady({ localPlayer, remotePlayer: 3 - localPlayer });
  };

  channel
    .on("presence", { event: "sync" }, syncPresence)
    .on("broadcast", { event: "game-event" }, ({ payload }) => {
      if (!closed && payload?.senderId === peerId) onMessage(payload);
    });

  await new Promise((resolve, reject) => {
    let settled = false;
    const connectTimer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("通信サーバーへの接続に時間がかかっています。もう一度試してね。"));
      void close();
    }, 12000);

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED" && !settled) {
        try {
          await channel.track({
            clientId,
            role,
            player: role === "host" ? hostPlayer : null,
            joinedAt,
          });
          settled = true;
          window.clearTimeout(connectTimer);
          resolve();
        } catch (error) {
          settled = true;
          window.clearTimeout(connectTimer);
          reject(error);
          void close();
        }
        return;
      }

      if (
        !settled &&
        (status === "TIMED_OUT" || status === "CHANNEL_ERROR")
      ) {
        settled = true;
        window.clearTimeout(connectTimer);
        reject(new Error("通信サーバーにつながりませんでした。設定と回線を確認してね。"));
        void close();
      }
    });
  });

  if (role === "guest") {
    hostLookupTimer = window.setTimeout(() => {
      if (!peerId && !closed) {
        onError(new Error("そのキーワードのへやが見つかりませんでした。"));
        void close();
      }
    }, 9000);
  }

  syncPresence();
  return session;
}
