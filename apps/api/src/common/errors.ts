import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Business-rule failure with a stable machine-readable `code` (clients branch on it, humans read `message`).
 * Example: `throw new DomainError('capacity_exceeded', 'Only 1.2 t of space is left on this truck', 409)`.
 */
export class DomainError extends HttpException {
  constructor(
    public readonly code: string,
    message: string,
    status: number = HttpStatus.BAD_REQUEST,
    public readonly details?: unknown,
  ) {
    super({ statusCode: status, error: HttpStatus[status] ?? 'Error', message, code, details }, status);
  }
}

export const notFound = (what: string) => new DomainError('not_found', `${what} not found`, HttpStatus.NOT_FOUND);
export const forbidden = (message = 'You do not have access to this', code = 'forbidden') =>
  new DomainError(code, message, HttpStatus.FORBIDDEN);
export const conflict = (code: string, message: string, details?: unknown) =>
  new DomainError(code, message, HttpStatus.CONFLICT, details);
export const badRequest = (code: string, message: string, details?: unknown) =>
  new DomainError(code, message, HttpStatus.BAD_REQUEST, details);
