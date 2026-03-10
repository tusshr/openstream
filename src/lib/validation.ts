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

// Elysia encodes validation errors as a JSON string inside the message field.
// We unwrap it to get structured fields; fall back gracefully if the format changes.
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

export function buildValidationResponse(error: ValidationErrorShape): Response {
  const normalized = normalizeValidationError(error);

  const details = normalized.errors?.map((issue) => ({
    ...(issue.path ? { field: issue.path } : {}),
    message: issue.message ?? issue.summary ?? "Validation error",
  }));

  return Response.json(
    {
      error: {
        code: "VALIDATION_ERROR",
        message:
          normalized.message ??
          "Request validation failed. Please check your input.",
        ...(details?.length ? { details } : {}),
      },
    },
    { status: 422 },
  );
}
