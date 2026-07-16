"use client";

const parentChatHistoryPrefix = "parent-chat-history:";

export function parentChatHistoryKey(studentId: string) {
  return `${parentChatHistoryPrefix}${studentId}`;
}

export function clearParentChatHistories() {
  if (typeof window === "undefined") return;
  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(parentChatHistoryPrefix)) {
      window.localStorage.removeItem(key);
    }
  }
}
