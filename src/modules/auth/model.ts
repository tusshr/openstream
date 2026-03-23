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
