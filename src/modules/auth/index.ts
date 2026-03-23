import { Elysia, status } from "elysia";

import { env } from "@/env";
import { buildAbility } from "@/lib/ability";
import { getSession } from "@/lib/session";

import {
  BackupCodeBodySchema,
  ChangeEmailBodySchema,
  EmailBodySchema,
  ResetPasswordBodySchema,
  SignInBodySchema,
  SignUpBodySchema,
  TokenBodySchema,
  TotpCodeBodySchema,
  TotpVerifyBodySchema,
} from "./model";
import { AuthError, authService } from "./service";

const SESSION_COOKIE = "session_token";
const SESSION_TTL_SEC = 7 * 24 * 60 * 60;
const IS_PROD = env.NODE_ENV === "production";

const AUTH_ERROR_STATUS: Record<string, number> = {
  EMAIL_TAKEN: 409,
  INVALID_CREDENTIALS: 401,
  EMAIL_NOT_VERIFIED: 403,
  INVALID_TOKEN: 400,
  TOTP_INVALID: 400,
  TOTP_SETUP_EXPIRED: 400,
  NOT_FOUND: 404,
};

function serializeUser(u: {
  id: string;
  name: string;
  email: string;
  role: string | null;
  emailVerified: boolean;
}) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role ?? "user",
    emailVerified: u.emailVerified,
  };
}

function setSessionCookie(
  cookie: Record<string, { set: (opts: object) => void }>,
  token: string,
) {
  cookie[SESSION_COOKIE]!.set({
    value: token,
    httpOnly: true,
    secure: IS_PROD,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SEC,
  });
}

export const authMacro = new Elysia({ name: "auth-macro" }).macro({
  auth: (_: true) => ({
    async resolve({ cookie }) {
      const token = cookie[SESSION_COOKIE]?.value as string | undefined;
      if (!token)
        return status(401, {
          error: { code: "UNAUTHORIZED", message: "Authentication required." },
        });
      const result = await getSession(token);
      if (!result)
        return status(401, {
          error: {
            code: "UNAUTHORIZED",
            message: "Session expired or invalid.",
          },
        });
      return {
        user: result.user,
        session: result.session,
        ability: buildAbility(result.user),
      };
    },
  }),
});

const CSRF = [{ csrfHeader: [] }];
const SESSION_CSRF = [{ sessionCookie: [], csrfHeader: [] }];

export const authRoutes = new Elysia({ name: "auth", prefix: "/api/auth" })
  .onError(({ error, set }) => {
    if (error instanceof AuthError) {
      set.status = AUTH_ERROR_STATUS[error.code] ?? 400;
      return { error: { code: error.code, message: error.message } };
    }
  })
  .guard({ detail: { tags: ["Auth"] } }, (app) =>
    app
      // -- Account --
      .post(
        "/sign-up",
        async ({ body }) => {
          await authService.signUp(body.email, body.password, body.name);
          return status(201, {
            data: { message: "Account created. Check your email to verify." },
          });
        },
        {
          body: SignUpBodySchema,
          detail: { summary: "Sign up", security: CSRF },
        },
      )
      .post(
        "/sign-in",
        async ({ body, cookie, request }) => {
          const result = await authService.signIn(
            body.email,
            body.password,
            request,
          );
          if ("requiresTwoFactor" in result) {
            return {
              data: {
                requiresTwoFactor: true,
                pendingToken: result.pendingToken,
              },
            };
          }
          setSessionCookie(cookie as never, result.token);
          return { data: { user: serializeUser(result.user) } };
        },
        {
          body: SignInBodySchema,
          detail: { summary: "Sign in", security: CSRF },
        },
      )
      .post(
        "/sign-out",
        async ({ cookie }) => {
          const token = cookie[SESSION_COOKIE]?.value as string | undefined;
          if (token) {
            const sess = await getSession(token);
            if (sess) await authService.signOut(token, sess.user.id);
          }
          cookie[SESSION_COOKIE]?.remove();
          return { data: { message: "Signed out." } };
        },
        { detail: { summary: "Sign out", security: CSRF } },
      )
      .get("/session", async ({ cookie }) => {
        const token = cookie[SESSION_COOKIE]?.value as string | undefined;
        if (!token)
          return status(401, {
            error: { code: "UNAUTHORIZED", message: "Not authenticated." },
          });
        const result = await getSession(token);
        if (!result)
          return status(401, {
            error: { code: "UNAUTHORIZED", message: "Session expired." },
          });
        return {
          data: { user: serializeUser(result.user), session: result.session },
        };
      })
      // -- Email verification --
      .post(
        "/verify-email",
        async ({ body }) => {
          await authService.verifyEmail(body.token);
          return { data: { message: "Email verified." } };
        },
        {
          body: TokenBodySchema,
          detail: { summary: "Verify email", security: CSRF },
        },
      )
      .post(
        "/resend-verification",
        async ({ body }) => {
          await authService.resendVerification(body.email);
          return {
            data: {
              message:
                "If that email is registered and unverified, a new link has been sent.",
            },
          };
        },
        {
          body: EmailBodySchema,
          detail: { summary: "Resend verification email", security: CSRF },
        },
      )
      // -- Password --
      .post(
        "/forgot-password",
        async ({ body }) => {
          await authService.forgotPassword(body.email);
          return {
            data: {
              message:
                "If that email is registered, a reset link has been sent.",
            },
          };
        },
        {
          body: EmailBodySchema,
          detail: { summary: "Forgot password", security: CSRF },
        },
      )
      .post(
        "/reset-password",
        async ({ body }) => {
          await authService.resetPassword(body.token, body.password);
          return { data: { message: "Password reset. Please sign in." } };
        },
        {
          body: ResetPasswordBodySchema,
          detail: { summary: "Reset password", security: CSRF },
        },
      )
      .post(
        "/confirm-email-change",
        async ({ body }) => {
          await authService.confirmEmailChange(body.token);
          return { data: { message: "Email address updated." } };
        },
        {
          body: TokenBodySchema,
          detail: { summary: "Confirm email change", security: CSRF },
        },
      )
      // -- 2FA verify (no session yet) --
      .post(
        "/2fa/verify",
        async ({ body, cookie, request }) => {
          const result = await authService.verifyPendingTotp(
            body.pendingToken,
            body.code,
            request,
          );
          setSessionCookie(cookie as never, result.token);
          return { data: { user: serializeUser(result.user) } };
        },
        {
          body: TotpVerifyBodySchema,
          detail: { summary: "Verify 2FA code", security: CSRF },
        },
      )
      .post(
        "/2fa/verify-backup",
        async ({ body, cookie, request }) => {
          const result = await authService.useBackupCode(
            body.pendingToken,
            body.code,
            request,
          );
          setSessionCookie(cookie as never, result.token);
          return { data: { user: serializeUser(result.user) } };
        },
        {
          body: BackupCodeBodySchema,
          detail: { summary: "Verify 2FA backup code", security: CSRF },
        },
      )
      // -- Routes below require an active session --
      .use(authMacro)
      .post(
        "/change-email",
        async ({ user, body }) => {
          await authService.requestEmailChange(user.id, body.newEmail);
          return {
            data: {
              message:
                "A confirmation link has been sent to your current email.",
            },
          };
        },
        {
          auth: true,
          body: ChangeEmailBodySchema,
          detail: { summary: "Request email change", security: SESSION_CSRF },
        },
      )
      .post(
        "/2fa/setup",
        async ({ user }) => {
          const result = await authService.setupTotp(user.id, user.email);
          return { data: result };
        },
        {
          auth: true,
          detail: { summary: "Set up 2FA", security: SESSION_CSRF },
        },
      )
      .post(
        "/2fa/enable",
        async ({ user, body }) => {
          const backupCodes = await authService.enableTotp(user.id, body.code);
          return { data: { backupCodes } };
        },
        {
          auth: true,
          body: TotpCodeBodySchema,
          detail: { summary: "Enable 2FA", security: SESSION_CSRF },
        },
      )
      .post(
        "/2fa/disable",
        async ({ user, body }) => {
          await authService.disableTotp(user.id, body.code);
          return { data: { message: "Two-factor authentication disabled." } };
        },
        {
          auth: true,
          body: TotpCodeBodySchema,
          detail: { summary: "Disable 2FA", security: SESSION_CSRF },
        },
      ),
  );
