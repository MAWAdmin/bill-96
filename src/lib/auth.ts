import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { query, queryOne } from "./db";
import { randomToken, sha256 } from "./crypto";
import { IS_PROD } from "./config";

export const SESSION_COOKIE = "b96_session";
const SESSION_DAYS = 30;

export interface User {
  id: string;
  email: string;
  name: string;
}

export async function createSession(userId: string) {
  const token = randomToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await query(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)`, [
    sha256(token),
    userId,
    expires.toISOString(),
  ]);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: IS_PROD,
    path: "/",
    expires,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await query(`DELETE FROM sessions WHERE token_hash = $1`, [sha256(token)]);
  jar.delete(SESSION_COOKIE);
}

/** Current user for this request, or null. Cached per request. */
export const getUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return queryOne<User>(
    `SELECT u.id, u.email, u.name FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [sha256(token)]
  );
});

export async function requireUser(): Promise<User> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

// Basic in-memory brute-force protection for login: 10 failures / 15 min per key.
const attempts = new Map<string, { count: number; until: number }>();
export function loginThrottled(key: string): boolean {
  const a = attempts.get(key);
  return !!a && a.count >= 10 && a.until > Date.now();
}
export function recordLoginFailure(key: string) {
  const a = attempts.get(key);
  if (!a || a.until < Date.now()) attempts.set(key, { count: 1, until: Date.now() + 15 * 60_000 });
  else a.count++;
}
export function clearLoginFailures(key: string) {
  attempts.delete(key);
}
