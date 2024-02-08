import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { QueryFailedError } from 'typeorm';
import type { ApiErrorBody } from '@raha/contracts';

interface PgError {
  code?: string;
  constraint?: string;
  detail?: string;
}

/** One consistent error envelope for the web, the driver app and ops. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly log = new Logger('Http');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const body = this.toBody(exception);
    if (body.statusCode >= 500) this.log.error(exception instanceof Error ? exception.stack : String(exception));
    res.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown): ApiErrorBody {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      if (typeof raw === 'string') return { statusCode: status, error: HttpStatus[status] ?? 'Error', message: raw };
      const r = raw as { message?: string | string[]; error?: string; code?: string; details?: unknown };
      if (Array.isArray(r.message)) {
        return { statusCode: status, error: r.error ?? 'Bad Request', message: r.message.join('; '), code: 'validation_failed', details: r.message };
      }
      return { statusCode: status, error: r.error ?? HttpStatus[status] ?? 'Error', message: r.message ?? exception.message, code: r.code, details: r.details };
    }

    if (exception instanceof QueryFailedError) {
      const pg = exception.driverError as PgError;
      switch (pg.code) {
        case '23505':
          return { statusCode: 409, error: 'Conflict', message: 'That record already exists', code: 'duplicate', details: pg.detail };
        case '23503':
          return { statusCode: 400, error: 'Bad Request', message: 'A referenced record does not exist', code: 'bad_reference', details: pg.detail };
        case '23514':
          return { statusCode: 409, error: 'Conflict', message: 'That change breaks a business rule', code: pg.constraint ?? 'constraint_failed' };
        case '22P02':
          return { statusCode: 400, error: 'Bad Request', message: 'Malformed identifier or value', code: 'malformed' };
      }
    }

    return { statusCode: 500, error: 'Internal Server Error', message: 'Something went wrong on our side', code: 'internal' };
  }
}
