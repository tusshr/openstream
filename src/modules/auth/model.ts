import { t } from "elysia";

export const SignUpBodySchema = t.Object({
  email: t.String({ format: "email" }),
  password: t.String({ minLength: 8, maxLength: 128 }),
  name: t.String({ minLength: 1, maxLength: 100 }),
});

export const SignInBodySchema = t.Object({
  email: t.String({ format: "email" }),
  password: t.String({ minLength: 1 }),
});

export const TokenBodySchema = t.Object({
  token: t.String({ minLength: 1 }),
});

export const EmailBodySchema = t.Object({
  email: t.String({ format: "email" }),
});

export const ResetPasswordBodySchema = t.Object({
  token: t.String({ minLength: 1 }),
  password: t.String({ minLength: 8, maxLength: 128 }),
});

export const ChangeEmailBodySchema = t.Object({
  newEmail: t.String({ format: "email" }),
});

export const TotpCodeBodySchema = t.Object({
  code: t.String({ minLength: 6, maxLength: 8 }),
});

export const TotpVerifyBodySchema = t.Object({
  pendingToken: t.String({ minLength: 1 }),
  code: t.String({ minLength: 6, maxLength: 8 }),
});

export const BackupCodeBodySchema = t.Object({
  pendingToken: t.String({ minLength: 1 }),
  code: t.String({ minLength: 1 }),
});

// ---- Response shapes ----

const SerializedUserSchema = t.Object({
  id: t.String(),
  name: t.String(),
  email: t.String(),
  role: t.String(),
  emailVerified: t.Boolean(),
});

export const MessageResponseSchema = t.Object({
  data: t.Object({ message: t.String() }),
});

export const SignInResponseSchema = t.Object({
  data: t.Union([
    t.Object({ user: SerializedUserSchema }),
    t.Object({
      requiresTwoFactor: t.Literal(true),
      pendingToken: t.String(),
    }),
  ]),
});

export const AuthUserResponseSchema = t.Object({
  data: t.Object({ user: SerializedUserSchema }),
});

export const SessionResponseSchema = t.Object({
  data: t.Object({ user: SerializedUserSchema, session: t.Unknown() }),
});

export const TotpSetupResponseSchema = t.Object({
  data: t.Object({ secret: t.String(), uri: t.String() }),
});

export const BackupCodesResponseSchema = t.Object({
  data: t.Object({ backupCodes: t.Array(t.String()) }),
});
