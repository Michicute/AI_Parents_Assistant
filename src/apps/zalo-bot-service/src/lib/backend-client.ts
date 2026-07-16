import { env } from "./env.js";

async function requestJson(path: string, init: RequestInit) {
  let response: Response;
  try {
    response = await fetch(`${env.BACKEND_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.INTEGRATION_SHARED_SECRET}`,
        ...(init.headers ?? {}),
      },
    });
  } catch (error) {
    throw new Error(`Backend request ${path} failed before response: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Backend request ${path} failed with ${response.status}: ${body}`);
  }

  return response.json();
}

export async function completeLinkSession(sessionId: string, payload: { sender_id: string; zalo_display_name?: string | null }) {
  return requestJson(`/api/integrations/zalo/link-sessions/${sessionId}/complete`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function failLinkSession(sessionId: string, payload: { status: "failed" | "expired"; error_message?: string | null }) {
  return requestJson(`/api/integrations/zalo/link-sessions/${sessionId}/fail`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export type ZaloLinkOtpResolution = {
  session_id: string;
  session_token: string;
  student_id: string;
  student_name: string;
  student_level: string | null;
  expires_at: string;
};

export async function resolveZaloLinkOtp(otpCode: string): Promise<ZaloLinkOtpResolution> {
  return requestJson("/api/integrations/zalo/link-sessions/resolve-otp", {
    method: "POST",
    body: JSON.stringify({ otp_code: otpCode }),
  });
}

export type LogZaloMessagePayload = {
  sender_id: string;
  direction: "inbound" | "outbound";
  content: string;
  zalo_display_name?: string | null;
  student_id?: string | null;
  channel_link_id?: string | null;
  raw_message_id?: string | null;
  sent_at?: string | null;
};

export type ZaloChannelLinkPayload = {
  id: string;
  student_id: string;
  channel: "zalo";
  sender_id: string;
  zalo_display_name?: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  last_message_at?: string | null;
};

export async function logZaloMessage(payload: LogZaloMessagePayload): Promise<void> {
  try {
    await requestJson(`/api/integrations/zalo/messages`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  } catch (error) {
    // Never let chat-log persistence break linking or message delivery.
    console.error("Failed to log Zalo message", error);
  }
}

export async function getActiveZaloChannelLink(senderId: string): Promise<ZaloChannelLinkPayload | null> {
  return requestJson(`/api/integrations/zalo/channel-links/by-sender/${encodeURIComponent(senderId)}`, { method: "GET" });
}

export type ZaloTextStyle = "b" | "i" | "u" | "s" | "ul" | "ol" | "red" | "orange" | "yellow" | "green" | "big" | "small" | "indent";

export type ZaloStyleRange = {
  start: number;
  len: number;
  st: ZaloTextStyle;
  indentSize?: number | null;
};

export type ZaloAiChatResponse = {
  intent: string;
  intents: string[];
  answer: string;
  styles?: ZaloStyleRange[];
  retrieved_context: string[];
  safety_notes?: string[];
};

export async function askZaloAi(payload: {
  sender_id: string;
  message: string;
  zalo_display_name?: string | null;
  locale?: string | null;
}): Promise<ZaloAiChatResponse> {
  return requestJson("/api/integrations/zalo/chat", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export type BotSessionPayload = {
  id: string;
  account_label: string;
  adapter: string;
  status: string;
  encrypted_session_payload: string | null;
  bot_chat_url: string | null;
  bot_display_name: string | null;
  last_login_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export async function getBotSession(accountLabel: string): Promise<BotSessionPayload | null> {
  return requestJson(`/api/integrations/zalo/bot-session/${accountLabel}`, { method: "GET" });
}

export async function upsertBotSession(
  accountLabel: string,
  payload: {
    adapter: string;
    status: string;
    encrypted_session_payload?: string | null;
    bot_chat_url?: string | null;
    bot_display_name?: string | null;
    last_login_at?: string | null;
    last_error?: string | null;
  },
): Promise<BotSessionPayload> {
  return requestJson(`/api/integrations/zalo/bot-session/${accountLabel}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
