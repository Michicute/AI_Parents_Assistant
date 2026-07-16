export type ZaloSessionStatus = "pending" | "link_ready" | "connected" | "failed" | "expired";

export type ZaloSession = {
  sessionId: string;
  sessionToken: string;
  studentId: string;
  studentName?: string | null;
  studentLevel?: string | null;
  status: ZaloSessionStatus;
  qrCodeUrl: string | null;
  deepLinkUrl: string | null;
  senderId: string | null;
  zaloDisplayName: string | null;
  expiresAt: string;
  errorMessage: string | null;
  createdAt: string;
};

export type PendingConfirmation = {
  senderId: string;
  sessionId: string;
  sessionToken: string;
  studentId: string;
  studentName: string | null;
  studentLevel: string | null;
  expiresAt: string;
  firstMessageText: string;
  createdAt: string;
};

export type ZaloBotSession = {
  accountLabel: string;
  adapter: string;
  status: string;
  encryptedSessionPayload: string | null;
  lastLoginAt: string | null;
  lastError: string | null;
};

const sessions = new Map<string, ZaloSession>();
const pendingConfirmationsBySender = new Map<string, PendingConfirmation>();

function nowIso(): string {
  return new Date().toISOString();
}

function isActivePending(session: ZaloSession): boolean {
  if (session.status !== "pending" && session.status !== "link_ready") return false;
  return new Date(session.expiresAt).getTime() > Date.now();
}

export function createSession(session: Omit<ZaloSession, "createdAt"> & { createdAt?: string }): ZaloSession {
  const next = { ...session, createdAt: session.createdAt ?? nowIso() };
  sessions.set(next.sessionToken, next);
  return next;
}

export function getSession(sessionToken: string): ZaloSession | null {
  return sessions.get(sessionToken) ?? null;
}

export function getLatestPendingSession(): ZaloSession | null {
  const pending = [...sessions.values()]
    .filter(isActivePending)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return pending[0] ?? null;
}

export function updateSession(sessionToken: string, patch: Partial<ZaloSession>): ZaloSession | null {
  const current = sessions.get(sessionToken);
  if (!current) {
    return null;
  }
  const updated = { ...current, ...patch };
  sessions.set(sessionToken, updated);
  return updated;
}

export function createPendingConfirmation(senderId: string, session: ZaloSession, firstMessageText: string): PendingConfirmation {
  const confirmation: PendingConfirmation = {
    senderId,
    sessionId: session.sessionId,
    sessionToken: session.sessionToken,
    studentId: session.studentId,
    studentName: session.studentName ?? null,
    studentLevel: session.studentLevel ?? null,
    expiresAt: session.expiresAt,
    firstMessageText,
    createdAt: nowIso(),
  };
  pendingConfirmationsBySender.set(senderId, confirmation);
  return confirmation;
}

export function getPendingConfirmation(senderId: string): PendingConfirmation | null {
  const confirmation = pendingConfirmationsBySender.get(senderId);
  if (!confirmation) return null;
  if (new Date(confirmation.expiresAt).getTime() <= Date.now()) {
    pendingConfirmationsBySender.delete(senderId);
    updateSession(confirmation.sessionToken, { status: "expired", errorMessage: "Session expired" });
    return null;
  }
  return confirmation;
}

export function clearPendingConfirmation(senderId: string): void {
  pendingConfirmationsBySender.delete(senderId);
}
