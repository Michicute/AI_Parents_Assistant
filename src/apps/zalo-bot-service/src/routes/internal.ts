import type { FastifyPluginAsync } from "fastify";
import { env } from "../lib/env.js";
import { createSession, getSession, updateSession } from "../lib/session-store.js";
import type { ZaloSessionStatus } from "../lib/session-store.js";
import { createZaloSessionService } from "../services/zalo-session-service.js";

function isAuthorized(authorization: string | undefined): boolean {
  return authorization === `Bearer ${env.INTEGRATION_SHARED_SECRET}`;
}

export const registerInternalRoutes: FastifyPluginAsync<{ zaloSessionService: ReturnType<typeof createZaloSessionService> }> = async (app, opts) => {
  const service = opts.zaloSessionService;

  app.post("/link-sessions", async (request, reply) => {
    if (!isAuthorized(request.headers.authorization)) {
      return reply.code(401).send({ detail: "Invalid integration secret" });
    }
    const body = request.body as {
      session_id: string;
      session_token: string;
      student_id: string;
      student_name?: string | null;
      student_level?: string | null;
      expires_at: string;
    };

    const session = createSession({
      sessionId: body.session_id,
      sessionToken: body.session_token,
      studentId: body.student_id,
      studentName: body.student_name ?? null,
      studentLevel: body.student_level ?? null,
      status: "pending",
      qrCodeUrl: null,
      deepLinkUrl: null,
      senderId: null,
      zaloDisplayName: null,
      expiresAt: body.expires_at,
      errorMessage: null,
    });

    const adapterResult = await service.startLinkSession({
      sessionId: session.sessionId,
      sessionToken: session.sessionToken,
      studentId: session.studentId,
      studentName: session.studentName ?? null,
      studentLevel: session.studentLevel ?? null,
      expiresAt: session.expiresAt,
    });

    const updated = updateSession(session.sessionToken, {
      status: adapterResult.status as ZaloSessionStatus,
      qrCodeUrl: adapterResult.qrCodeUrl,
      deepLinkUrl: adapterResult.deepLinkUrl,
    }) ?? session;

    return reply.send({
      status: updated.status,
      qr_code_url: updated.qrCodeUrl,
      deep_link_url: updated.deepLinkUrl,
      linking_message: adapterResult.linkingMessage,
      bot_display_name: adapterResult.botDisplayName,
      error_message: updated.errorMessage,
    });
  });

  app.get("/link-sessions/:sessionToken", async (request) => {
    const { sessionToken } = request.params as { sessionToken: string };
    const session = getSession(sessionToken);
    if (!session) {
      return { status: "not_found" };
    }
    return {
      status: session.status,
      qr_code_url: session.qrCodeUrl,
      deep_link_url: session.deepLinkUrl,
      sender_id: session.senderId,
      zalo_display_name: session.zaloDisplayName,
      error_message: session.errorMessage,
    };
  });

  app.get("/bot/status", async (request, reply) => {
    if (!isAuthorized(request.headers.authorization)) {
      return reply.code(401).send({ detail: "Invalid integration secret" });
    }
    const current = service.getLoginState();
    if (current.status !== "connected" && current.status !== "waiting_scan" && current.status !== "scanned") {
      await service.restore().catch(() => undefined);
    }
    const state = service.getLoginState();
    return {
      status: state.status,
      qr_image_base64: state.qrImageBase64,
      display_name: state.displayName,
      avatar: state.avatar,
      error: state.error,
    };
  });

  app.post("/bot/login-qr", async (request, reply) => {
    if (!isAuthorized(request.headers.authorization)) {
      return reply.code(401).send({ detail: "Invalid integration secret" });
    }
    const state = await service.loginWithQR();
    return {
      status: state.status,
      qr_image_base64: state.qrImageBase64,
      display_name: state.displayName,
      avatar: state.avatar,
      error: state.error,
    };
  });

  app.post("/bot/logout", async (request, reply) => {
    if (!isAuthorized(request.headers.authorization)) {
      return reply.code(401).send({ detail: "Invalid integration secret" });
    }
    const state = await service.logout();
    return {
      status: state.status,
      qr_image_base64: state.qrImageBase64,
      display_name: state.displayName,
      avatar: state.avatar,
      error: state.error,
    };
  });

  app.post("/messages/send", async (request, reply) => {
    if (!isAuthorized(request.headers.authorization)) {
      return reply.code(401).send({ detail: "Invalid integration secret" });
    }
    const body = request.body as {
      sender_id?: string;
      message?: string;
      student_id?: string | null;
      channel_link_id?: string | null;
    };
    const senderId = body.sender_id?.trim();
    const message = body.message?.trim();
    if (!senderId || !message) {
      return reply.code(400).send({ detail: "sender_id and message are required" });
    }

    app.log.info({ senderId, studentId: body.student_id, channelLinkId: body.channel_link_id }, "Sending outbound Zalo message");
    await service.sendMessage(senderId, message);
    app.log.info({ senderId, studentId: body.student_id, channelLinkId: body.channel_link_id }, "Outbound Zalo message sent");
    return reply.send({ status: "sent" });
  });
};
