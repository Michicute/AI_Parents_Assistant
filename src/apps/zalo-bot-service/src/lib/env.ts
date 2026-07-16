import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const optionalUrl = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}, z.string().url().optional());

const schema = z.object({
  PORT: z.coerce.number().default(4001),
  BACKEND_URL: z.string().url().default("http://localhost:8000"),
  INTEGRATION_SHARED_SECRET: z.string().default("change-me"),
  ZALO_ADAPTER: z.literal("zca-js").default("zca-js"),
  ZALO_ACCOUNT_LABEL: z.string().default("default"),
  ZALO_USER_AGENT: z.string().optional(),
  ZALO_LANGUAGE: z.string().default("vi"),
  ZALO_BOT_CHAT_URL: optionalUrl,
  ZALO_BOT_DISPLAY_NAME: z.string().default("Zalo Bot trung tâm"),
  ZALO_LINK_MESSAGE_PREFIX: z.string().default("LINK"),
  ZALO_BOT_ENABLED: z.coerce.boolean().default(false),
});

export const env = schema.parse(process.env);
