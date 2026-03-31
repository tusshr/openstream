import { Elysia, t } from "elysia";

import { errorModels } from "@/lib/api/error-models";
import { dataOf, HttpProblem, ok } from "@/lib/response";
import { authMacro } from "@/modules/auth";

import { CertificateVerificationSchema, MyCertificateSchema } from "./model";
import { certificateService } from "./service";

export const certificatesModule = new Elysia({
  name: "certificates",
  prefix: "/certificates",
})
  .use(authMacro)
  .use(errorModels)
  .get(
    "/verify/:code",
    async ({ params }) => {
      const cert = await certificateService.verifyByCode(params.code);
      if (!cert) {
        throw new HttpProblem(
          404,
          "NOT_FOUND",
          "No certificate with that code.",
        );
      }
      return ok(cert);
    },
    {
      params: t.Object({ code: t.String({ minLength: 1 }) }),
      response: {
        200: dataOf(CertificateVerificationSchema),
        404: "ProblemDetails",
      },
      detail: {
        summary: "Verify a certificate",
        tags: ["Certificates"],
      },
    },
  )
  .get(
    "/",
    async ({ user }) => ok(await certificateService.listForUser(user.id)),
    {
      auth: { can: ["read", "Certificate"] },
      response: {
        401: "ProblemDetails",
        200: dataOf(t.Array(MyCertificateSchema)),
      },
      detail: {
        summary: "My certificates",
        tags: ["Certificates"],
        security: [{ sessionCookie: [] }],
      },
    },
  );
