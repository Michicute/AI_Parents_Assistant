import type { ZaloSession } from "../lib/session-store.js";

export type StartLinkSessionInput = {
  sessionId: string;
  sessionToken: string;
  studentId: string;
  studentName?: string | null;
  studentLevel?: string | null;
  expiresAt: string;
};

export type StartLinkSessionResult = {
  status: string;
  qrCodeUrl: string | null;
  deepLinkUrl: string | null;
  linkingMessage: string | null;
  botDisplayName: string | null;
};

export type IncomingMessage = {
  senderId: string;
  replyTargetId?: string | null;
  text: string;
  zaloDisplayName?: string | null;
  raw?: unknown;
};

export type QrLoginState = {
  status: "idle" | "waiting_scan" | "scanned" | "connected" | "failed" | "expired";
  qrImageBase64: string | null;
  displayName: string | null;
  avatar: string | null;
  error: string | null;
};

export type ZaloTextStyle = "b" | "i" | "u" | "s" | "ul" | "ol" | "red" | "orange" | "yellow" | "green" | "big" | "small" | "indent";

export type ZaloMessageStyle = {
  start: number;
  len: number;
  st: ZaloTextStyle;
  indentSize?: number | null;
};

export type ZaloOutboundMessage = string | {
  msg: string;
  styles?: ZaloMessageStyle[];
};

export interface ZaloAdapter {
  startLinkSession(input: StartLinkSessionInput): Promise<StartLinkSessionResult>;
  restore(): Promise<void>;
  shutdown(): Promise<void>;
  handleIncomingMessage(message: IncomingMessage): Promise<void>;
  sendMessage(senderId: string, message: ZaloOutboundMessage): Promise<void>;
  loginWithQR(): Promise<QrLoginState>;
  getLoginState(): QrLoginState;
  logout(): Promise<QrLoginState>;
}

export type AdapterDeps = {
  onMessageLinked: (payload: { senderId: string; replyTargetId?: string | null; zaloDisplayName?: string | null; text: string }) => Promise<void>;
  onSessionFailed: (payload: { sessionId: string; status: "failed" | "expired"; errorMessage?: string | null }) => Promise<void>;
  updateSession: (sessionToken: string, patch: Partial<ZaloSession>) => Promise<void> | void;
  logMessage?: (entry: {
    senderId: string;
    direction: "inbound" | "outbound";
    text: string;
    zaloDisplayName?: string | null;
    rawMessageId?: string | null;
  }) => Promise<void>;
};
