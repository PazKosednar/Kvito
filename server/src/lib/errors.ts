/**
 * API errors carry a stable machine-readable `code`; the client maps codes to translated messages.
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message?: string,
    public readonly details?: unknown,
  ) {
    super(message ?? code);
    this.name = "AppError";
  }
}

export const badRequest = (code = "BAD_REQUEST", details?: unknown) => new AppError(400, code, undefined, details);
export const unauthorized = (code = "UNAUTHORIZED") => new AppError(401, code);
export const forbidden = (code = "FORBIDDEN") => new AppError(403, code);
// Used for "exists but not yours" too, so resource existence does not leak.
export const notFound = (code = "NOT_FOUND") => new AppError(404, code);
export const tooManyRequests = (code = "TOO_MANY_REQUESTS") => new AppError(429, code);
