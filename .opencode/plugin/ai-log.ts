import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, appendFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Plugin } from "@opencode-ai/plugin";

type AnyRecord = Record<string, unknown>;

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

function git(cwd: string, args: string[]) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", windowsHide: true }).trim();
  } catch {
    return "";
  }
}

function loadRootEnv(root: string) {
  try {
    const env = readFileSync(join(root, ".env"), "utf8");
    for (const line of env.split(/\r?\n/)) {
      const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
  } catch {
    // OpenCode logging must never block the main session.
  }
}

function findString(value: unknown, keys: string[], depth = 0): string {
  if (!value || depth > 5) return "";
  if (typeof value === "string") return "";
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findString(item, keys, depth + 1);
      if (found) return found;
    }
    return "";
  }
  if (typeof value !== "object") return "";

  const record = value as AnyRecord;
  for (const key of keys) {
    const direct = record[key];
    if (typeof direct === "string" && direct.trim()) return direct;
  }
  for (const nested of Object.values(record)) {
    const found = findString(nested, keys, depth + 1);
    if (found) return found;
  }
  return "";
}

function stringifySafe(value: unknown) {
  const seen = new WeakSet<object>();
  return typeof value === "string"
    ? value
    : JSON.stringify(value, (_key, nested) => {
        if (typeof nested !== "object" || nested === null) return nested;
        if (seen.has(nested)) return "[Circular]";
        seen.add(nested);
        return nested;
      });
}

function compact(value: unknown) {
  return (stringifySafe(value) || "").slice(0, 1000);
}

function cloneJson(value: unknown) {
  try {
    return JSON.parse(stringifySafe(value) || "{}");
  } catch {
    return {};
  }
}

export default (async ({ directory }) => {
  const cwd = directory || process.cwd();
  const root = git(cwd, ["rev-parse", "--show-toplevel"]) || cwd;
  loadRootEnv(root);

  return {
    event: async (input) => {
      const data = input as AnyRecord;
      const event =
        findString(data, ["type", "event", "name", "hook_event_name"]) || "opencode.event";
      const prompt = findString(data, ["prompt", "text", "content", "message", "query"]);
      const toolName = findString(data, ["tool", "toolName", "tool_name", "name"]);

      const interesting =
        prompt ||
        /message|tool|session|command|permission|chat/i.test(event) ||
        /bash|edit|read|grep|glob|write|patch/i.test(toolName);
      if (!interesting) return;

      const origin = git(root, ["remote", "get-url", "origin"]);
      const repo = origin.replace(/\/$/, "").split(/[\\/]/).pop()?.replace(/\.git$/, "") || "";
      if (!repo) return;

      const ts = new Date(Date.now() + VN_OFFSET_MS).toISOString().replace("Z", "+07:00");
      const entry = {
        ts,
        tool: "opencode",
        event,
        session_id: findString(data, ["sessionID", "sessionId", "session_id", "id"]),
        model: findString(data, ["model"]),
        repo,
        branch: git(root, ["rev-parse", "--abbrev-ref", "HEAD"]),
        commit: git(root, ["rev-parse", "--short", "HEAD"]),
        student: git(root, ["config", "user.email"]) || process.env.USERNAME || process.env.USER || "unknown",
        prompt: prompt.slice(0, 1000),
        tool_name: toolName,
        tool_input: cloneJson(data),
        tool_response: compact(data),
      };

      const logDir = resolve(root, process.env.AI_LOG_DIR || ".ai-log");
      mkdirSync(logDir, { recursive: true });
      appendFileSync(join(logDir, "session.jsonl"), JSON.stringify(entry) + "\n", "utf8");
    },
  };
}) satisfies Plugin;
