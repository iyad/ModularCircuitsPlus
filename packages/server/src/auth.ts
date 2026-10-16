import type { NextFunction, Request, Response } from "express";
import { auth } from "express-oauth2-jwt-bearer";

const domain = process.env.AUTH0_DOMAIN;
const audience = process.env.AUTH0_AUDIENCE;

export const authEnabled = Boolean(domain && audience);

if (!authEnabled && process.env.NODE_ENV === "production") {
  throw new Error("AUTH0_DOMAIN and AUTH0_AUDIENCE must be set in production");
}

// Without Auth0 configured (local dev), every request acts as this admin user.
const DEV_USER_ID = "local-dev";

// Auth0 user ids (the token's `sub`, e.g. "google-oauth2|123") allowed to edit the shared starter library.
const adminIds = new Set(
  (process.env.ADMIN_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean)
);

export interface AuthUser {
  id: string;
  isAdmin: boolean;
}

// Strict verifier, applied only when a token is present. (The library's authRequired: false would silently
// downgrade an invalid token to anonymous, hiding misconfiguration such as a wrong audience.)
const checkJwt = authEnabled ? auth({ issuerBaseURL: `https://${domain}/`, audience }) : null;

/**
 * Requests without a token continue anonymously; a valid token populates res.locals.user;
 * an invalid or expired token is rejected with 401.
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  if (!checkJwt) {
    res.locals.user = { id: DEV_USER_ID, isAdmin: true } satisfies AuthUser;
    return next();
  }
  if (!req.headers.authorization) return next();
  checkJwt(req, res, (err?: unknown) => {
    if (err) return next(err);
    const sub = req.auth?.payload.sub;
    if (sub) res.locals.user = { id: sub, isAdmin: adminIds.has(sub) } satisfies AuthUser;
    next();
  });
}

export function requireAuth(_req: Request, res: Response, next: NextFunction) {
  if (!res.locals.user) return res.status(401).json({ error: "Sign in required" });
  next();
}

export function currentUser(res: Response): AuthUser | undefined {
  return res.locals.user;
}
