export class AppApiError extends Error {
  code: string;
  status?: number;

  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = 'AppApiError';
    this.code = code;
    this.status = status;
  }
}

export function formatErrorMessage(error: unknown): string {
  if (error instanceof AppApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unexpected error occurred. Please try again.';
}
