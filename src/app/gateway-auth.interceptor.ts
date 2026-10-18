import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { API_ROOT, AuthSession, SessionCommands } from './helpdesk-api';

export const gatewayAuthInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith(API_ROOT)) return next(request);

  const session = inject(AuthSession);
  const commands = inject(SessionCommands);
  const token = session.accessToken();
  const authenticated = token
    ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : request;

  return next(authenticated).pipe(catchError((error: unknown) => {
    if (!(error instanceof HttpErrorResponse) || error.status !== 401 || !session.refreshToken()) {
      return throwError(() => error);
    }

    return commands.refresh().pipe(
      switchMap(tokens => next(request.clone({ setHeaders: { Authorization: `Bearer ${tokens.accessToken}` } }))),
      catchError(refreshError => {
        session.clear();
        return throwError(() => refreshError);
      })
    );
  }));
};