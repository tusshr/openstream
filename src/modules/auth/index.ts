import { Elysia, status } from "elysia";

import { env } from "@/env";
import { buildAbility, type Permission } from "@/lib/ability";
import { errorModels } from "@/lib/api/error-models";
import { HttpProblem, problem } from "@/lib/response";
import { getSession, SESSION_TTL_SEC } from "@/lib/session";
import { rateLimit } from "@/plugins/rate-limit";

import {
  AuthUserResponseSchema,
  BackupCodeBodySchema,
  BackupCodesResponseSchema,
  ChangeEmailBodySchema,
  EmailBodySchema,
  MessageResponseSchema,
  ResetPasswordBodySchema,
  SessionResponseSchema,
  SignInBodySchema,
  SignInResponseSchema,
  SignUpBodySchema,
  TokenBodySchema,
  TotpCodeBodySchema,
  TotpSetupResponseSchema,
  TotpVerifyBodySchema,
} from "./model";
import { AuthError, authService } from "./service";

const SESSION_COOKIE = "session_token";
const IS_PROD = env.NODE_ENV === "production";

const AUTH_ERROR_STATUS: Record<string, number> = {
  EMAIL_TAKEN: 409,
  INVALID_CREDENTIALS: 401,
  EMAIL_NOT_VERIFIED: 403,
  INVALID_TOKEN: 400,
  TOTP_INVALID: 400,
  TOTP_SETUP_EXPIRED: 400,
  TOO_MANY_ATTEMPTS: 429,
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
    role: u.role ?? "student",
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
  auth: (opts: true | { can: Permission }) => ({
    async resolve({ cookie }) {
      const token = cookie[SESSION_COOKIE]?.value as string | undefined;
      if (!token)
        throw new HttpProblem(401, "UNAUTHORIZED", "Authentication required.");
      const result = await getSession(token);
      if (!result)
        throw new HttpProblem(
          401,
          "UNAUTHORIZED",
          "Session expired or invalid.",
        );

      const ability = buildAbility({
        id: result.user.id,
        role: result.user.role ?? "student",
      });

      if (opts !== true && ability.cannot(...opts.can)) {
        const [action, subject] = opts.can;
        throw new HttpProblem(
          403,
          "FORBIDDEN",
          `You are not allowed to ${action} ${subject}.`,
        );
      }

      return {
        user: result.user,
        session: result.session,
        ability,
      };
    },
  }),
});

const CSRF = [{ csrfHeader: [] }];
const SESSION_CSRF = [{ sessionCookie: [], csrfHeader: [] }];

export const authRoutes = new Elysia({ name: "auth", prefix: "/api/auth" })
  .use(errorModels)
  .onError(({ error, request }) => {
    if (error instanceof AuthError) {
      return problem({
        status: AUTH_ERROR_STATUS[error.code] ?? 400,
        code: error.code,
        detail: error.message,
        instance: new URL(request.url).pathname,
      });
    }
  })
  .guard({ detail: { tags: ["Auth"] } }, (app) =>
    app
      .post(
        "/sign-up",
        async ({ body }) => {
          await authService.signUp(body.email, body.password, body.name);
          return status(201, {
            data: { message: "Account created. Check your email to verify." },
          });
        },
        {
          beforeHandle: rateLimit({
            key: "auth.sign-up",
            max: 10,
            windowSec: 60,
          }),
          body: SignUpBodySchema,
          response: {
            201: MessageResponseSchema,
            409: "ProblemDetails",
            422: "ProblemDetails",
            429: "ProblemDetails",
          },
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
          beforeHandle: rateLimit({
            key: "auth.sign-in",
            max: 10,
            windowSec: 60,
          }),
          body: SignInBodySchema,
          response: {
            200: SignInResponseSchema,
            401: "ProblemDetails",
            403: "ProblemDetails",
            422: "ProblemDetails",
            429: "ProblemDetails",
          },
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
        {
          response: { 200: MessageResponseSchema },
          detail: { summary: "Sign out", security: CSRF },
        },
      )
      .get(
        "/session",
        async ({ cookie }) => {
          const token = cookie[SESSION_COOKIE]?.value as string | undefined;
          if (!token)
            throw new HttpProblem(401, "UNAUTHORIZED", "Not authenticated.");
          const result = await getSession(token);
          if (!result)
            throw new HttpProblem(401, "UNAUTHORIZED", "Session expired.");
          return {
            data: { user: serializeUser(result.user), session: result.session },
          };
        },
        {
          response: { 200: SessionResponseSchema, 401: "ProblemDetails" },
          detail: {
            summary: "Get current session",
            tags: ["Auth"],
            security: [{ sessionCookie: [] }],
          },
        },
      )
      .post(
        "/verify-email",
        async ({ body }) => {
          await authService.verifyEmail(body.token);
          return { data: { message: "Email verified." } };
        },
        {
          body: TokenBodySchema,
          response: {
            200: MessageResponseSchema,
            400: "ProblemDetails",
            422: "ProblemDetails",
          },
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
          beforeHandle: rateLimit({
            key: "auth.resend-verification",
            max: 5,
            windowSec: 60,
          }),
          body: EmailBodySchema,
          response: {
            200: MessageResponseSchema,
            422: "ProblemDetails",
            429: "ProblemDetails",
          },
          detail: { summary: "Resend verification email", security: CSRF },
        },
      )
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
          beforeHandle: rateLimit({
            key: "auth.forgot-password",
            max: 5,
            windowSec: 60,
          }),
          body: EmailBodySchema,
          response: {
            200: MessageResponseSchema,
            422: "ProblemDetails",
            429: "ProblemDetails",
          },
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
          response: {
            200: MessageResponseSchema,
            400: "ProblemDetails",
            422: "ProblemDetails",
          },
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
          response: {
            200: MessageResponseSchema,
            400: "ProblemDetails",
            422: "ProblemDetails",
          },
          detail: { summary: "Confirm email change", security: CSRF },
        },
      )
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
          beforeHandle: rateLimit({
            key: "auth.2fa.verify",
            max: 10,
            windowSec: 60,
          }),
          body: TotpVerifyBodySchema,
          response: {
            200: AuthUserResponseSchema,
            400: "ProblemDetails",
            422: "ProblemDetails",
            429: "ProblemDetails",
          },
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
          beforeHandle: rateLimit({
            key: "auth.2fa.verify-backup",
            max: 10,
            windowSec: 60,
          }),
          body: BackupCodeBodySchema,
          response: {
            200: AuthUserResponseSchema,
            400: "ProblemDetails",
            422: "ProblemDetails",
            429: "ProblemDetails",
          },
          detail: { summary: "Verify 2FA backup code", security: CSRF },
        },
      )
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
          response: {
            200: MessageResponseSchema,
            401: "ProblemDetails",
            409: "ProblemDetails",
            422: "ProblemDetails",
          },
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
          response: { 200: TotpSetupResponseSchema, 401: "ProblemDetails" },
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
          response: {
            200: BackupCodesResponseSchema,
            400: "ProblemDetails",
            401: "ProblemDetails",
            422: "ProblemDetails",
          },
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
          response: {
            200: MessageResponseSchema,
            400: "ProblemDetails",
            401: "ProblemDetails",
            422: "ProblemDetails",
          },
          detail: { summary: "Disable 2FA", security: SESSION_CSRF },
        },
      ),
  );
