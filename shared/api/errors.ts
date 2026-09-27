/** Field-level messages returned in the API validation error envelope. */
export type FieldErrors = Record<string, string[]>;

/** Body of every non-2xx JSON API response. */
export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    requestId?: string;
    fieldErrors?: FieldErrors;
  };
}
