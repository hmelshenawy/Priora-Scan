import { Request, Response, NextFunction } from 'express';

interface ErrorResponse {
  code: string;
  message: string;
  details?: Array<{ field: string; message: string }>;
  timestamp: string;
  path: string;
}

export function errorHandlerMiddleware(
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const statusCode = err.status || err.statusCode || 500;

  const response: ErrorResponse = {
    code: err.response?.code || err.code || `ERR_${statusCode}`,
    message:
      statusCode === 500 && process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred. Please try again later.'
        : err.message || 'Internal server error',
    timestamp: new Date().toISOString(),
    path: req.url,
  };

  if (statusCode === 400 && err.response?.details) {
    response.details = err.response.details;
  }

  res.status(statusCode).json(response);
}
