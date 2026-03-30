import { t } from "elysia";

export const CertificateSchema = t.Object({
  id: t.String(),
  userId: t.String(),
  courseId: t.String(),
  enrollmentId: t.String(),
  verificationCode: t.String(),
  issuedAt: t.Date(),
});

export const MyCertificateSchema = t.Object({
  id: t.String(),
  courseId: t.String(),
  courseTitle: t.String(),
  verificationCode: t.String(),
  issuedAt: t.Date(),
});

export const CertificateVerificationSchema = t.Object({
  recipientName: t.String(),
  courseTitle: t.String(),
  verificationCode: t.String(),
  issuedAt: t.Date(),
});
