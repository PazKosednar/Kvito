export interface ApiErrorBody {
  error: { code: string; details?: unknown };
}

/** Error thrown by the API client; `code` maps to `errors.<code>` translations. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, details?: unknown) {
    super(code);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
