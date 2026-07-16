import QRCode from "qrcode";
import { Zalo, LoginQRCallbackEventType, ThreadType, TextStyle, type API, type Credentials, type Style } from "zca-js";
import { env } from "../lib/env.js";
import { getBotSession, upsertBotSession } from "../lib/backend-client.js";
import type { AdapterDeps, IncomingMessage, QrLoginState, StartLinkSessionInput, StartLinkSessionResult, ZaloAdapter, ZaloMessageStyle, ZaloOutboundMessage } from "./zalo-adapter.js";

async function chatQrDataUrl(chatUrl: string): Promise<string> {
  return QRCode.toDataURL(chatUrl, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 260,
  });
}

function serializeCredentials(credentials: Credentials): string {
  return JSON.stringify(credentials);
}

function parseCredentials(payload: string | null): Credentials | null {
  if (!payload) return null;
  try {
    return JSON.parse(payload) as Credentials;
  } catch {
    return null;
  }
}

function mapMessageStyles(styles: ZaloMessageStyle[] | undefined): Style[] | undefined {
  if (!styles || styles.length === 0) return undefined;
  return styles.map((style) => {
    const st =
      style.st === "b"
        ? TextStyle.Bold
        : style.st === "i"
          ? TextStyle.Italic
          : style.st === "u"
            ? TextStyle.Underline
            : style.st === "s"
              ? TextStyle.StrikeThrough
              : style.st === "ul"
                ? TextStyle.UnorderedList
                : style.st === "ol"
                  ? TextStyle.OrderedList
                  : style.st === "red"
                    ? TextStyle.Red
                    : style.st === "orange"
                      ? TextStyle.Orange
                      : style.st === "yellow"
                        ? TextStyle.Yellow
                        : style.st === "green"
                          ? TextStyle.Green
                          : style.st === "big"
                            ? TextStyle.Big
                            : style.st === "small"
                              ? TextStyle.Small
                              : style.st === "indent"
                                ? TextStyle.Indent
                                : TextStyle.Bold;
    return st === TextStyle.Indent
      ? { start: style.start, len: style.len, st, indentSize: style.indentSize ?? 2 }
      : { start: style.start, len: style.len, st };
  });
}

export function createZcaJsAdapter(deps: AdapterDeps): ZaloAdapter {
  let api: API | null = null;
  let loginState: QrLoginState = {
    status: "idle",
    qrImageBase64: null,
    displayName: null,
    avatar: null,
    error: null,
  };
  let qrLoginPromise: Promise<void> | null = null;
  let botChatUrl: string | null = null;
  let botDisplayName: string | null = null;

  async function refreshBotInfo(): Promise<void> {
    if (!api) return;
    try {
      const info: any = await (api as any).fetchAccountInfo();
      const profile = info?.profile ?? info;
      const phone: string | undefined = profile?.phoneNumber || profile?.phone_number;
      const username: string | undefined = profile?.username;
      const userId: string | undefined = profile?.userId || profile?.uid;
      if (phone && phone.length > 0) {
        const normalized = phone.replace(/^\+/, "").replace(/^84/, "0");
        botChatUrl = `https://zalo.me/${normalized}`;
      } else if (username) {
        botChatUrl = `https://zalo.me/${username}`;
      } else if (userId) {
        botChatUrl = `https://zalo.me/${userId}`;
      }
      if (profile?.displayName || profile?.zaloName) {
        botDisplayName = profile.displayName || profile.zaloName;
      }
    } catch {
      // keep fallback to env
    }
  }

  async function persist(status: string, credentials?: Credentials | null, error?: string | null): Promise<void> {
    const payload: {
      adapter: string;
      status: string;
      encrypted_session_payload?: string | null;
      bot_chat_url?: string | null;
      bot_display_name?: string | null;
      last_login_at?: string | null;
      last_error?: string | null;
    } = {
      adapter: "zca-js",
      status,
      bot_chat_url: botChatUrl,
      bot_display_name: botDisplayName,
      last_login_at: status === "connected" ? new Date().toISOString() : undefined,
      last_error: error ?? null,
    };
    if (credentials !== undefined) {
      payload.encrypted_session_payload = credentials ? serializeCredentials(credentials) : null;
    }
    try {
      await upsertBotSession(env.ZALO_ACCOUNT_LABEL, payload);
    } catch (persistError) {
      console.error("Failed to persist Zalo bot session", { status, error: persistError });
    }
  }

  function setupListeners(apiInstance: API): void {
    apiInstance.listener.on("message", async (message: any) => {
      if (message.isSelf || typeof message.data?.content !== "string") return;
      const senderId = message.data.uidFrom || message.threadId;
      const replyTargetId = message.threadId || message.data.uidFrom || null;
      await deps.logMessage?.({
        senderId,
        direction: "inbound",
        text: message.data.content,
        zaloDisplayName: message.data.dName ?? null,
        rawMessageId: message.data.msgId ?? message.data.cliMsgId ?? null,
      });
      await deps.onMessageLinked({
        senderId,
        replyTargetId,
        zaloDisplayName: message.data.dName,
        text: message.data.content,
      });
    });
    apiInstance.listener.on("error", async (error: any) => {
      loginState = { ...loginState, status: "failed", error: error instanceof Error ? error.message : String(error) };
      await persist("failed", undefined, loginState.error);
    });
    apiInstance.listener.on("closed", async () => {
      loginState = { ...loginState, status: "idle", error: "Connection closed" };
      await persist("disconnected", undefined, "ZCA listener closed");
    });
    apiInstance.listener.start();
  }

  async function loginWithCredentials(credentials: Credentials): Promise<boolean> {
    try {
      const zalo = new Zalo({ selfListen: false, checkUpdate: false });
      api = await zalo.login(credentials);
      const latestCookie = api.getCookie?.();
      const updatedCredentials = latestCookie
        ? { ...credentials, cookie: latestCookie as unknown as Credentials["cookie"] }
        : credentials;
      setupListeners(api);
      await refreshBotInfo();
      loginState = { status: "connected", qrImageBase64: null, displayName: botDisplayName, avatar: null, error: null };
      await persist("connected", updatedCredentials);
      return true;
    } catch (error) {
      api = null;
      loginState = { status: "failed", qrImageBase64: null, displayName: null, avatar: null, error: error instanceof Error ? error.message : String(error) };
      await persist("failed", undefined, loginState.error);
      return false;
    }
  }

  return {
    getLoginState(): QrLoginState {
      return loginState;
    },

    async loginWithQR(): Promise<QrLoginState> {
      if (api || qrLoginPromise) {
        return loginState;
      }
      await this.restore();
      if (api || qrLoginPromise) {
        return loginState;
      }

      let resolveQrReady!: () => void;
      const qrReady = new Promise<void>((resolve) => {
        resolveQrReady = resolve;
      });
      const qrReadyTimeout = new Promise<void>((resolve) => setTimeout(resolve, 8000));

      loginState = { status: "waiting_scan", qrImageBase64: null, displayName: null, avatar: null, error: null };
      let qrCredentials: Credentials | null = null;
      let qrImei: string | null = null;
      let qrUserAgent: string | null = null;
      let qrLanguage: string | undefined;

      qrLoginPromise = (async () => {
        try {
          const zalo = new Zalo({ selfListen: false, checkUpdate: false });
          api = await zalo.loginQR({
            userAgent: env.ZALO_USER_AGENT || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
            language: env.ZALO_LANGUAGE,
          }, (event: any) => {
            switch (event.type) {
              case LoginQRCallbackEventType.QRCodeGenerated:
                loginState = {
                  status: "waiting_scan",
                  qrImageBase64: event.data.image,
                  displayName: null,
                  avatar: null,
                  error: null,
                };
                resolveQrReady();
                break;
              case LoginQRCallbackEventType.QRCodeScanned:
                loginState = {
                  status: "scanned",
                  qrImageBase64: loginState.qrImageBase64,
                  displayName: event.data.display_name,
                  avatar: event.data.avatar,
                  error: null,
                };
                resolveQrReady();
                break;
              case LoginQRCallbackEventType.QRCodeExpired:
                loginState = { status: "expired", qrImageBase64: null, displayName: null, avatar: null, error: "QR code expired" };
                resolveQrReady();
                break;
              case LoginQRCallbackEventType.QRCodeDeclined:
                loginState = { status: "failed", qrImageBase64: null, displayName: null, avatar: null, error: "QR login declined" };
                resolveQrReady();
                break;
              case LoginQRCallbackEventType.GotLoginInfo: {
                qrImei = event.data.imei;
                qrUserAgent = event.data.userAgent;
                qrLanguage = env.ZALO_LANGUAGE;
                qrCredentials = {
                  cookie: event.data.cookie,
                  imei: event.data.imei,
                  userAgent: event.data.userAgent,
                  language: env.ZALO_LANGUAGE,
                };
                break;
              }
            }
          });

          if (api) {
            const latestCookie = api.getCookie?.();
            let persistedCredentials: Credentials | null = qrCredentials;
            if (latestCookie && qrImei && qrUserAgent) {
              persistedCredentials = {
                cookie: latestCookie as unknown as Credentials["cookie"],
                imei: qrImei,
                userAgent: qrUserAgent,
                language: qrLanguage,
              };
            }
            setupListeners(api);
            await refreshBotInfo();
            loginState = { ...loginState, status: "connected", displayName: botDisplayName ?? loginState.displayName };
            await persist("connected", persistedCredentials ?? undefined);
          }
        } catch (error) {
          api = null;
            loginState = { status: "failed", qrImageBase64: null, displayName: null, avatar: null, error: error instanceof Error ? error.message : String(error) };
            await persist("failed", undefined, loginState.error).catch(() => undefined);
            resolveQrReady();
        } finally {
          qrLoginPromise = null;
        }
      })();

      await Promise.race([qrReady, qrReadyTimeout]);
      return loginState;
    },

    async startLinkSession(input: StartLinkSessionInput): Promise<StartLinkSessionResult> {
      if (!api) {
        await this.restore();
      }
      if (api && !botChatUrl) {
        await refreshBotInfo();
      }
      const chatUrl = botChatUrl ?? null;
      const status = chatUrl ? "link_ready" : "failed";
      const errorMessage = chatUrl
        ? api
          ? null
          : "Bot Zalo chưa đăng nhập. Phụ huynh có thể quét QR, nhưng liên kết chỉ hoàn tất khi admin đăng nhập bot."
        : api
          ? "Không lấy được link Zalo của bot. Hãy đăng nhập lại tại trang quản trị."
          : "Bot chưa đăng nhập. Vui lòng đăng nhập bot tại trang quản trị trước khi tạo QR cho phụ huynh.";
      const result: StartLinkSessionResult = {
        status,
        qrCodeUrl: chatUrl ? await chatQrDataUrl(chatUrl) : null,
        deepLinkUrl: chatUrl,
        linkingMessage: "Quet QR de mo chat Zalo, gui 'Xin chao', sau do nhap ma OTP dang hien tren man hinh de xac nhan lien ket.",
        botDisplayName: botDisplayName ?? env.ZALO_BOT_DISPLAY_NAME,
      };
      await deps.updateSession(input.sessionToken, {
        status,
        qrCodeUrl: result.qrCodeUrl,
        deepLinkUrl: result.deepLinkUrl,
        errorMessage,
      });
      return result;
    },

    async restore(): Promise<void> {
      if (api) return;
      const saved = await getBotSession(env.ZALO_ACCOUNT_LABEL).catch((error) => {
        loginState = {
          status: "failed",
          qrImageBase64: null,
          displayName: null,
          avatar: null,
          error: error instanceof Error ? error.message : String(error),
        };
        return null;
      });
      botChatUrl = saved?.bot_chat_url ?? null;
      botDisplayName = saved?.bot_display_name ?? null;
      const credentials = parseCredentials(saved?.encrypted_session_payload ?? null);
      if (!credentials) {
        loginState = {
          status: "idle",
          qrImageBase64: null,
          displayName: null,
          avatar: null,
          error: loginState.error ?? "No saved session. QR login required.",
        };
        await persist("needs_qr", undefined, loginState.error).catch(() => undefined);
        return;
      }
      await loginWithCredentials(credentials);
    },

    async shutdown(): Promise<void> {
      api = null;
      loginState = { status: "idle", qrImageBase64: null, displayName: null, avatar: null, error: null };
    },

    async logout(): Promise<QrLoginState> {
      await this.shutdown();
      botChatUrl = null;
      botDisplayName = null;
      await persist("needs_qr", null, "Logged out by admin");
      loginState = { status: "idle", qrImageBase64: null, displayName: null, avatar: null, error: null };
      return loginState;
    },

    async sendMessage(senderId: string, message: ZaloOutboundMessage): Promise<void> {
      if (!api) {
        await this.restore();
      }
      if (!api) {
        throw new Error("Bot Zalo chưa đăng nhập. Không thể gửi tin nhắn tự động.");
      }
      const payload = typeof message === "string" ? { msg: message } : { msg: message.msg, styles: mapMessageStyles(message.styles) };
      await api.sendMessage(payload, senderId, ThreadType.User);
      await deps.logMessage?.({ senderId, direction: "outbound", text: payload.msg });
    },

    async handleIncomingMessage(message: IncomingMessage): Promise<void> {
      await deps.onMessageLinked({
        senderId: message.senderId,
        replyTargetId: message.replyTargetId ?? message.senderId,
        zaloDisplayName: message.zaloDisplayName ?? null,
        text: message.text,
      });
    },
  };
}
