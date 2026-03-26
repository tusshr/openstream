import { problem } from "@/lib/response";

type ValidationIssue = {
  path?: string | undefined;
  message?: string | undefined;
  summary?: string | undefined;
};

type ValidationErrorShape = {
  message?: string | undefined;
  on?: string | undefined;
  property?: string | undefined;
  summary?: string | undefined;
  errors?: ValidationIssue[] | undefined;
};

function normalizeValidationError(
  error: ValidationErrorShape,
): ValidationErrorShape {
  const raw = error.message;
  if (typeof raw !== "string") return error;

  const trimmed = raw.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return error;

  try {
    const parsed = JSON.parse(trimmed) as ValidationErrorShape;
    return {
      ...error,
      message: parsed.message ?? error.message,
      on: error.on ?? parsed.on,
      property: error.property ?? parsed.property,
      summary: error.summary ?? parsed.summary,
      errors: error.errors ?? parsed.errors,
    };
  } catch {
    return error;
  }
}

export function buildValidationResponse(
  error: ValidationErrorShape,
  instance?: string,
): Response {
  const normalized = normalizeValidationError(error);

  const errors = normalized.errors?.map((issue) => ({
    ...(issue.path ? { field: issue.path } : {}),
    message: issue.message ?? issue.summary ?? "Validation error",
  }));

  return problem({
    status: 422,
    code: "VALIDATION_ERROR",
    detail:
      normalized.message ??
      "Request validation failed. Please check your input.",
    ...(instance ? { instance } : {}),
    ...(errors?.length ? { errors } : {}),
  });
}
