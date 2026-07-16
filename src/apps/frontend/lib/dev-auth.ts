"use client";

const accessTokenKey = "english-center-access-token";

export function getAccessToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(accessTokenKey);
}

export function setAccessToken(accessToken: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(accessTokenKey, accessToken);
}

export function clearAccessToken() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(accessTokenKey);
}
