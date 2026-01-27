import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

type NormalizedError = {
  code: string;
  message: string;
  stack?: string;
  isProd: boolean;
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const normalized = this.normalizeException(exception, status);

    if (status >= 500) {
      this.logger.error(
        normalized.message,
        normalized.stack ?? (exception as any)?.stack,
      );
    } else if (!normalized.isProd && normalized.stack) {
      this.logger.debug(normalized.stack);
    }

    response.status(status).json({
      code: normalized.code,
      message: normalized.message,
    });
  }

  private normalizeException(
    exception: unknown,
    status: number,
  ): NormalizedError {
    const isProd = (process.env.NODE_ENV ?? 'development') === 'production';
    let code = 'INTERNAL_ERROR';
    let message = 'Internal server error';
    let stack: string | undefined;

    if (exception instanceof HttpException) {
      const res = exception.getResponse() as any;
      const responseMessage =
        typeof res === 'string'
          ? res
          : Array.isArray(res?.message)
            ? res.message.join(', ')
            : res?.message;
      const responseCode =
        typeof res === 'object' && res?.code ? String(res.code) : undefined;
      const responseError =
        typeof res === 'object' && res?.error ? String(res.error) : undefined;

      code =
        responseCode ||
        (responseError
          ? this.formatCode(responseError)
          : this.formatCode(exception.name));
      message =
        typeof responseMessage === 'string' && responseMessage.length > 0
          ? responseMessage
          : exception.message || message;
      stack = exception.stack;
    } else if (exception instanceof Error) {
      code = this.formatCode(exception.name || 'Error');
      message = exception.message || message;
      stack = exception.stack;
    }

    if (isProd) {
      stack = undefined; // never leak stack traces in production responses
    }

    return { code, message, stack, isProd };
  }

  private formatCode(input: string) {
    return (
      input
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/_{2,}/g, '_')
        .replace(/^_+|_+$/g, '')
        .toUpperCase() || 'ERROR'
    );
  }
}
