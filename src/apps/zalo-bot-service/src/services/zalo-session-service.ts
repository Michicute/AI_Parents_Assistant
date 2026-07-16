import { askZaloAi, completeLinkSession, failLinkSession, getActiveZaloChannelLink, logZaloMessage, resolveZaloLinkOtp } from "../lib/backend-client.js";
import {
  clearPendingConfirmation,
  createPendingConfirmation,
  createSession,
  getPendingConfirmation,
  getSession,
  updateSession,
} from "../lib/session-store.js";
import { createZcaJsAdapter } from "../adapters/zca-js-adapter.js";
import type { QrLoginState, StartLinkSessionInput, ZaloOutboundMessage } from "../adapters/zalo-adapter.js";

function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLocaleLowerCase("vi-VN");
}

function extractOtp(text: string): string | null {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (!normalized) return null;
  const match = normalized.match(/\b(\d{6})\b/);
  return match?.[1] ?? null;
}

function isConfirm(text: string): boolean {
  const normalized = normalizeText(text);
  return ["co", "có", "yes", "y", "ok", "dong y", "đồng ý", "xac nhan", "xác nhận"].includes(normalized);
}

function isCancel(text: string): boolean {
  const normalized = normalizeText(text);
  return ["huy", "hủy", "cancel", "khong", "không", "no"].includes(normalized);
}

function studentLabel(studentName: string | null | undefined, studentId: string): string {
  return studentName?.trim() || `học viên ${studentId}`;
}

function confirmationPrompt(studentName: string | null | undefined, studentId: string): string {
  return [
    `Bạn đang muốn liên kết Zalo với ${studentLabel(studentName, studentId)} đúng không?`,
    "Vui lòng trả lời CÓ để xác nhận hoặc HỦY để hủy liên kết.",
  ].join("\n");
}

function otpPrompt(): string {
  return [
    "Để liên kết Zalo, vui lòng nhập mã OTP đang hiển thị dưới mã QR trong ứng dụng.",
    "Sau khi OTP đúng, bot sẽ hiện thông tin học viên để bạn xác nhận.",
  ].join("\n");
}

function welcomeMenu(studentName: string | null | undefined, studentId: string): string {
  return [
    `Liên kết Zalo thành công với ${studentLabel(studentName, studentId)}.`,
    "",
    "Bạn có thể chọn nhanh:",
    "1. Xem tiến độ học tập",
    "2. Xem lịch học",
    "3. Liên hệ trung tâm hoặc giáo viên",
    "",
    "Hoặc nhắn trực tiếp nội dung phụ huynh cần hỗ trợ.",
  ].join("\n");
}

function resolveMenuChoice(text: string): string | null {
  const normalized = text.trim().replace(/\s+/g, " ");
  const match = normalized.match(/^([1-3])(?:[.)])?$/);
  const choice = match?.[1];
  if (choice === "1") return "Tôi muốn xem tiến độ học tập của học viên.";
  if (choice === "2") return "Tôi muốn xem lịch học của học viên.";
  if (choice === "3") return "Tôi muốn liên hệ trung tâm hoặc giáo viên phụ trách.";
  return null;
}

function receivedMessage(): string {
  return "Trung tâm đã nhận được tin nhắn của phụ huynh. Trợ lý AI đang kiểm tra thông tin và sẽ phản hồi trong ít phút.";
}

function formatAiAnswer(answer: string): string {
  const trimmed = answer.trim();
  if (!trimmed) return "Hiện trợ lý AI chưa có nội dung phản hồi phù hợp. Phụ huynh vui lòng thử lại sau.";

  const paragraphs = trimmed
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (paragraphs.length > 1 || trimmed.includes("\n")) {
    return paragraphs.join("\n\n");
  }

  const sentences = trimmed.match(/[^.!?。！？]+[.!?。！？]?/g)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [trimmed];
  if (sentences.length <= 2 || trimmed.length <= 220) {
    return trimmed;
  }

  const grouped: string[] = [];
  for (let index = 0; index < sentences.length; index += 2) {
    grouped.push(sentences.slice(index, index + 2).join(" "));
  }
  return grouped.join("\n\n");
}

async function safeSend(adapter: ReturnType<typeof createZcaJsAdapter>, replyTargetId: string, message: ZaloOutboundMessage, fallbackTargetId?: string): Promise<void> {
  try {
    await adapter.sendMessage(replyTargetId, message);
  } catch (error) {
    if (fallbackTargetId && fallbackTargetId !== replyTargetId) {
      try {
        await adapter.sendMessage(fallbackTargetId, message);
        return;
      } catch (fallbackError) {
        console.error("Failed to send Zalo message fallback", { replyTargetId, fallbackTargetId, error: fallbackError });
      }
    }
    // Keep the link flow resilient even if outbound Zalo send fails.
    console.error("Failed to send Zalo message", { replyTargetId, error });
  }
}

export function createZaloSessionService() {
  const adapter = createZcaJsAdapter({
    onMessageLinked: async ({ senderId, replyTargetId, zaloDisplayName, text }) => {
      const targetId = replyTargetId ?? senderId;
      const confirmation = getPendingConfirmation(senderId);
      if (confirmation) {
        if (isConfirm(text)) {
          await completeLinkSession(confirmation.sessionId, { sender_id: senderId, zalo_display_name: zaloDisplayName ?? undefined });
          updateSession(confirmation.sessionToken, {
            status: "connected",
            senderId,
            zaloDisplayName: zaloDisplayName ?? null,
            errorMessage: null,
          });
          clearPendingConfirmation(senderId);
          await safeSend(adapter, targetId, welcomeMenu(confirmation.studentName, confirmation.studentId), senderId);
          return;
        }

        if (isCancel(text)) {
          await failLinkSession(confirmation.sessionId, {
            status: "failed",
            error_message: "Cancelled by parent via Zalo confirmation",
          }).catch((error) => {
            console.error("Failed to cancel Zalo link session", { senderId, sessionId: confirmation.sessionId, error });
          });
          updateSession(confirmation.sessionToken, {
            status: "failed",
            errorMessage: "Đã hủy liên kết từ Zalo.",
          });
          clearPendingConfirmation(senderId);
          await safeSend(adapter, targetId, "Đã hủy liên kết. Vui lòng quay lại app và quét lại QR nếu bạn muốn liên kết Zalo.", senderId);
          return;
        }

        await safeSend(adapter, targetId, confirmationPrompt(confirmation.studentName, confirmation.studentId), senderId);
        return;
      }

      const activeLink = await getActiveZaloChannelLink(senderId).catch((error) => {
        console.error("Failed to check active Zalo channel link", error);
        return null;
      });
      if (activeLink) {
        const routedText = resolveMenuChoice(text) ?? text;
        await safeSend(adapter, targetId, receivedMessage(), senderId);
        try {
          const response = await askZaloAi({
            sender_id: senderId,
            message: routedText,
            zalo_display_name: zaloDisplayName ?? null,
            locale: "vi",
          });
          await safeSend(adapter, targetId, formatAiAnswer(response.answer), senderId);
        } catch (error) {
          console.error("Failed to generate Zalo AI response", error);
          await safeSend(adapter, targetId, "Trung tâm đã nhận được tin nhắn của bạn. Hiện trợ lý AI chưa phản hồi được, vui lòng thử lại sau.", senderId);
        }
        return;
      }

      const otpCode = extractOtp(text);
      if (!otpCode) {
        await safeSend(adapter, targetId, otpPrompt(), senderId);
        return;
      }

      try {
        const resolved = await resolveZaloLinkOtp(otpCode);
        const session = getSession(resolved.session_token) ?? createSession({
          sessionId: resolved.session_id,
          sessionToken: resolved.session_token,
          studentId: resolved.student_id,
          studentName: resolved.student_name,
          studentLevel: resolved.student_level,
          status: "link_ready",
          qrCodeUrl: null,
          deepLinkUrl: null,
          senderId: null,
          zaloDisplayName: null,
          expiresAt: resolved.expires_at,
          errorMessage: null,
        });
        createPendingConfirmation(senderId, session, text);
        await safeSend(adapter, targetId, confirmationPrompt(resolved.student_name, resolved.student_id), senderId);
      } catch (error) {
        console.error("Failed to resolve Zalo OTP", { senderId, error });
        await safeSend(adapter, targetId, "Mã OTP không hợp lệ hoặc đã hết hạn. Vui lòng kiểm tra lại mã đang hiển thị dưới QR và nhập lại.", senderId);
      }
    },
    onSessionFailed: async ({ sessionId, status, errorMessage }) => {
      await failLinkSession(sessionId, { status, error_message: errorMessage ?? null });
    },
    updateSession: async (sessionToken, patch) => {
      updateSession(sessionToken, patch);
    },
    logMessage: async ({ senderId, direction, text, zaloDisplayName, rawMessageId }) => {
      if (!text || text.trim().length === 0) return;
      await logZaloMessage({
        sender_id: senderId,
        direction,
        content: text,
        zalo_display_name: zaloDisplayName ?? null,
        student_id: null,
        channel_link_id: null,
        raw_message_id: rawMessageId ?? null,
      });
    },
  });

  return {
    adapter,
    async restore() {
      await adapter.restore();
    },
    async loginWithQR(): Promise<QrLoginState> {
      return adapter.loginWithQR();
    },
    getLoginState(): QrLoginState {
      return adapter.getLoginState();
    },
    async logout(): Promise<QrLoginState> {
      return adapter.logout();
    },
    async startLinkSession(input: StartLinkSessionInput) {
      createSession({
        sessionId: input.sessionId,
        sessionToken: input.sessionToken,
        studentId: input.studentId,
        studentName: input.studentName ?? null,
        studentLevel: input.studentLevel ?? null,
        status: "pending",
        qrCodeUrl: null,
        deepLinkUrl: null,
        senderId: null,
        zaloDisplayName: null,
        expiresAt: input.expiresAt,
        errorMessage: null,
      });
      return adapter.startLinkSession(input);
    },
    async getSessionStatus(sessionToken: string) {
      return getSession(sessionToken);
    },
    async handleIncomingMessage(message: { senderId: string; text: string; zaloDisplayName?: string | null }) {
      return adapter.handleIncomingMessage(message);
    },
    async sendMessage(senderId: string, message: ZaloOutboundMessage) {
      return adapter.sendMessage(senderId, message);
    },
  };
}
