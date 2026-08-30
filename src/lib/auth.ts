import { db } from "@/db";
import { users, sessions } from "@/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import logger from "@/lib/logger";
import { NextRequest } from "next/server";
import { hashPassword as argonHash, comparePassword as argonCompare } from "@/lib/auth-utils";
import { hashSessionToken } from "@/lib/session-token";
import { isSameDevice, serializeFingerprint } from "@/lib/session-fingerprint";

export function generateToken(): string {
  return crypto.randomBytes(48).toString("hex");
}

export async function hashPassword(password: string): Promise<string> {
  return await argonHash(password);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return await argonCompare(hash, password);
}

export async function validateAdmin(request: NextRequest) {
  const token = request.cookies.get("session")?.value;
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  const ua = request.headers.get('user-agent') || 'unknown';

  const user = await validateSession(token || '', ip, ua, request);

  if (!user) {
    return { user: null, error: "Unauthorized", status: 401 };
  }

  if (user.role !== 'admin' && user.role !== 'super_admin') {
    logger.warn({ userId: user.id, role: user.role }, 'Unauthorized admin access attempt');
    return { user: null, error: "Forbidden: Admin access required", status: 403 };
  }

  return { user, error: null };
}

/**
 * Require an authenticated user (any role). Returns { user } on success or
 * { user: null, error, status } to short-circuit the route.
 */
export async function requireUser(request: NextRequest) {
  const token = request.cookies.get("session")?.value;
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  const ua = request.headers.get('user-agent') || 'unknown';

  const user = await validateSession(token || '', ip, ua, request);
  if (!user) {
    return { user: null, error: "Unauthorized", status: 401 };
  }
  return { user, error: null, status: 200 };
}

/**
 * Require an authenticated user whose role is in `allowed`.
 * Example: requireRole(request, ["admin", "super_admin", "judge"]).
 */
export async function requireRole(request: NextRequest, allowed: string[]) {
  const { user, error, status } = await requireUser(request);
  if (!user) {
    return { user: null, error, status };
  }
  if (!allowed.includes(user.role)) {
    logger.warn({ userId: user.id, role: user.role, allowed }, 'Forbidden: insufficient role');
    return { user: null, error: "Forbidden: insufficient permissions", status: 403 };
  }
  return { user, error: null, status: 200 };
}

// "Remember me" controls how long the session lives server-side (and, via
// the `SESSION_COOKIE_MAX_AGE` helper below, whether the browser cookie is
// persistent or cleared when the browser closes). Unchecked logins still
// get a real session — just a much shorter-lived one — instead of forcing
// a re-login every few minutes.
export const REMEMBER_ME_SESSION_DAYS = 30;
export const DEFAULT_SESSION_DAYS = 1;

export async function createSession(
  userId: string,
  ip: string,
  userAgent: string,
  rememberMe = true
): Promise<string> {
  const token = generateToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + (rememberMe ? REMEMBER_ME_SESSION_DAYS : DEFAULT_SESSION_DAYS));

  await db.insert(sessions).values({
    userId,
    token: hashSessionToken(token),
    expiresAt,
    ipAddress: ip,
    userAgent: userAgent,
  });

  return token;
}

/**
 * Cookie `maxAge` (seconds) for a session, or `undefined` when "remember me"
 * is off — omitting `maxAge`/`expires` makes it a browser session cookie
 * that's cleared automatically when the browser closes.
 */
export function sessionCookieMaxAge(rememberMe: boolean): number | undefined {
  return rememberMe ? 60 * 60 * 24 * REMEMBER_ME_SESSION_DAYS : undefined;
}

export async function validateSession(token: string, currentIp: string, currentUserAgent: string, request?: NextRequest) {
  if (!token) return null;

  try {
    if (request && ['POST', 'PATCH', 'DELETE', 'PUT'].includes(request.method)) {
      const csrfHeader = request.headers.get('x-requested-with');
      if (!csrfHeader) {
        logger.warn({ ip: currentIp }, 'CSRF attempt detected: Missing X-Requested-With header');
        return null;
      }

      // Defense in depth: browsers attach Origin on same-origin mutating
      // fetch/form requests. If it is present and does not match our host,
      // reject even if a client managed to send the custom header.
      const origin = request.headers.get('origin');
      const host = request.headers.get('host');
      if (origin && host) {
        try {
          const originHost = new URL(origin).host;
          if (originHost !== host) {
            logger.warn({ ip: currentIp, origin, host }, 'CSRF attempt detected: Origin mismatch');
            return null;
          }
        } catch {
          logger.warn({ ip: currentIp, origin }, 'CSRF attempt detected: Invalid Origin header');
          return null;
        }
      }
    }

    const tokenHash = hashSessionToken(token);
    let [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.token, tokenHash));

    // Backward compatibility for sessions created before token hashing was
    // enabled. On first successful validation, migrate the DB value to the hash
    // while keeping the user's cookie unchanged.
    if (!session) {
      [session] = await db
        .select()
        .from(sessions)
        .where(eq(sessions.token, token));

      if (session) {
        await db.update(sessions).set({ token: tokenHash }).where(eq(sessions.id, session.id));
      }
    }

    if (!session) return null;

    if (new Date() > session.expiresAt) {
      await deleteSession(token);
      return null;
    }

    // Bind the session to the device that created it, but compare a *stable*
    // fingerprint (browser + OS + form factor) rather than the raw header.
    // Browsers rewrite their User-Agent on every self-update, so an exact
    // match would log honest users out mid-tournament. See
    // `session-fingerprint.ts` for the exact trade-off.
    if (!isSameDevice(session.userAgent, currentUserAgent)) {
      logger.warn(
        {
          userId: session.userId,
          oldDevice: serializeFingerprint(session.userAgent),
          newDevice: serializeFingerprint(currentUserAgent),
        },
        'Session device mismatch - possible hijacking'
      );
      await deleteSession(token);
      return null;
    }

    // Same device, but the browser updated itself since this session was
    // created. Refresh the stored header so the "my devices" list shows the
    // current browser version instead of a stale one. Best-effort: a failure
    // here must never block an otherwise valid request.
    if (currentUserAgent && session.userAgent !== currentUserAgent) {
      db.update(sessions)
        .set({ userAgent: currentUserAgent })
        .where(eq(sessions.id, session.id))
        .catch((error) => logger.warn({ error }, 'Failed to refresh session User-Agent'));
    }

    // Do not rotate the session token here: route handlers that call
    // validateSession do not have access to the response object to write the
    // new cookie back to the browser. Rotating here would invalidate the
    // user's cookie after a few minutes and make the next request look logged
    // out. Use rotateSession from a handler that can also set the cookie.

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, session.userId));

    return user || null;
  } catch (error) {
    logger.error({ error }, 'Session validation error');
    return null;
  }
}

export async function rotateSession(oldToken: string, currentIp: string, currentUserAgent: string): Promise<string | null> {
  try {
    const oldTokenHash = hashSessionToken(oldToken);
    let [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.token, oldTokenHash));

    if (!session) {
      [session] = await db
        .select()
        .from(sessions)
        .where(eq(sessions.token, oldToken));
    }

    if (!session) return null;

    const newToken = generateToken();
    
    await db.update(sessions)
      .set({ 
        token: hashSessionToken(newToken),
        ipAddress: currentIp,
        userAgent: currentUserAgent 
      })
      .where(eq(sessions.id, session.id));

    return newToken;
  } catch (error) {
    logger.error({ error }, 'Session rotation failed');
    return null;
  }
}

export async function deleteSession(token: string) {
  if (!token) return;
  try {
    await db.delete(sessions).where(eq(sessions.token, hashSessionToken(token)));
    // Best-effort cleanup for legacy rows that may still contain raw tokens.
    await db.delete(sessions).where(eq(sessions.token, token));
  } catch (error) {
    logger.error({ error }, 'Session deletion error');
  }
}
