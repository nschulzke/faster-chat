import { dbUtils } from "./db.js";
import { getClientIP, getPeerIP } from "./requestUtils.js";

export const PROXY_ACCOUNT_PASSWORD_HASH = "proxy-auth:no-password";

function splitList(value) {
  return (value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function proxyAuthConfig() {
  return {
    enabled: process.env.PROXY_AUTH_ENABLED === "true",
    userHeader: process.env.PROXY_AUTH_USER_HEADER?.trim() || "Remote-User",
    groupsHeader: process.env.PROXY_AUTH_GROUPS_HEADER?.trim() || "Remote-Groups",
    trustedProxies: splitList(process.env.PROXY_AUTH_TRUSTED_PROXIES),
    adminUser: process.env.PROXY_AUTH_ADMIN_USER?.trim() || null,
    adminGroup: process.env.PROXY_AUTH_ADMIN_GROUP?.trim() || null,
    autoProvision: process.env.PROXY_AUTH_AUTO_PROVISION !== "false",
    logoutUrl: process.env.PROXY_AUTH_LOGOUT_URL?.trim() || null,
  };
}

export function isProxyAuthEnabled() {
  return proxyAuthConfig().enabled;
}

export function assertProxyAuthConfig() {
  const config = proxyAuthConfig();
  if (config.enabled && config.trustedProxies.length === 0) {
    throw new Error(
      "PROXY_AUTH_ENABLED=true requires PROXY_AUTH_TRUSTED_PROXIES. " +
        "Set it to the IPs/CIDRs of your reverse proxy, or to '*' to trust every peer."
    );
  }
}

function normalizeIP(ip) {
  const trimmed = ip?.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }
  return trimmed.startsWith("::ffff:") ? trimmed.slice(7) : trimmed;
}

function ipv4ToInt(ip) {
  const octets = ip.split(".");
  if (octets.length !== 4) {
    return null;
  }
  let value = 0;
  for (const octet of octets) {
    const part = Number(octet);
    if (!/^\d{1,3}$/.test(octet) || part > 255) {
      return null;
    }
    value = value * 256 + part;
  }
  return value;
}

export function isTrustedProxy(peerIP, trustedProxies) {
  const peer = normalizeIP(peerIP);
  if (!peer) {
    return false;
  }

  return trustedProxies.some((entry) => {
    if (entry === "*") {
      return true;
    }

    const [range, bits] = entry.split("/");
    const normalizedRange = normalizeIP(range);
    if (bits === undefined) {
      return normalizedRange === peer;
    }

    const peerInt = ipv4ToInt(peer);
    const rangeInt = ipv4ToInt(normalizedRange || "");
    const prefix = Number(bits);
    if (peerInt === null || rangeInt === null || !/^\d{1,2}$/.test(bits) || prefix > 32) {
      return false;
    }
    if (prefix === 0) {
      return true;
    }
    const mask = (0xffffffff << (32 - prefix)) >>> 0;
    return (peerInt & mask) === (rangeInt & mask);
  });
}

function isAdminIdentity(config, identity, groups) {
  if (config.adminUser && identity === config.adminUser) {
    return true;
  }
  return Boolean(config.adminGroup) && groups.includes(config.adminGroup);
}

/**
 * Resolve the caller from trusted forward-proxy headers.
 * Returns null when proxy auth is disabled, otherwise { user } or { error }.
 */
export function resolveProxyUser(c) {
  const config = proxyAuthConfig();
  if (!config.enabled) {
    return null;
  }

  if (!isTrustedProxy(getPeerIP(c), config.trustedProxies)) {
    return { error: "Request did not come from a trusted proxy" };
  }

  const identity = c.req.header(config.userHeader)?.trim();
  if (!identity || !/^\S{1,50}$/.test(identity)) {
    return { error: `Missing or invalid ${config.userHeader} header` };
  }

  const groups = splitList(c.req.header(config.groupsHeader));
  const mapsAdmin = Boolean(config.adminUser || config.adminGroup);
  const shouldBeAdmin = isAdminIdentity(config, identity, groups);
  const existing = dbUtils.getUserByUsername(identity);

  if (!existing) {
    if (!config.autoProvision) {
      return { error: "No local account for this identity" };
    }
    const role = mapsAdmin
      ? shouldBeAdmin
        ? "admin"
        : "member"
      : dbUtils.getUserCount() === 0
        ? "admin"
        : "member";
    const id = dbUtils.createUser(identity, PROXY_ACCOUNT_PASSWORD_HASH, role);
    dbUtils.createAuditLog(id, "proxy_provision", "user", String(id), role, getClientIP(c));
    return { user: { id: Number(id), username: identity, role } };
  }

  let role = existing.role;
  if (mapsAdmin && shouldBeAdmin && role !== "admin") {
    role = "admin";
  } else if (mapsAdmin && !shouldBeAdmin && role === "admin") {
    role = "member";
  }

  if (role !== existing.role) {
    dbUtils.updateUserRole(existing.id, role);
    dbUtils.deleteUserSessions(existing.id);
    dbUtils.createAuditLog(
      existing.id,
      "proxy_role_sync",
      "user",
      String(existing.id),
      `${existing.role} → ${role}`,
      getClientIP(c)
    );
  }

  return { user: { id: existing.id, username: existing.username, role } };
}
