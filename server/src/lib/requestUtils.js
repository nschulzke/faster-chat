import { AUTH } from "./constants.js";

/**
 * Address of the immediate peer, ignoring any proxy headers.
 * This is the only value safe to authenticate a reverse proxy against.
 */
export function getPeerIP(c) {
  const incoming = c.env?.incoming;
  const socket =
    incoming?.socket || incoming?.connection || incoming?.req?.socket || incoming?.req?.connection;

  return socket?.remoteAddress || null;
}

/**
 * Extract client IP from request, respecting proxy headers when configured
 */
export function getClientIP(c) {
  if (AUTH.TRUST_PROXY) {
    const forwarded = c.req.header("x-forwarded-for");
    if (forwarded) {
      return forwarded.split(",")[0].trim();
    }
    const real = c.req.header("x-real-ip");
    if (real) {
      return real;
    }
  }

  return getPeerIP(c) || "local";
}
