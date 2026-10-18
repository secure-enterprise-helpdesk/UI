import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import {
  HelpdeskUser,
  NotificationItem,
  Page,
  RegistrationRequest,
  Ticket,
  TicketComment,
  TicketHistory,
  TokenResponse,
  UserRole
} from './models';

export const API_ROOT = '/api/v1';
const ACCESS_KEY = 'secure-helpdesk.access';
const REFRESH_KEY = 'secure-helpdesk.refresh';

function tokenClaim(token: string | null, key: string): string | null {
  if (!token) return null;
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(payload)) as Record<string, unknown>;
    return typeof claims[key] === 'string' ? claims[key] : null;
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class AuthSession {
  readonly accessToken = signal<string | null>(this.readStorage(ACCESS_KEY));
  readonly refreshToken = signal<string | null>(this.readStorage(REFRESH_KEY));
  readonly role = computed(() => tokenClaim(this.accessToken(), 'role') as UserRole | null);
  readonly userId = computed(() => tokenClaim(this.accessToken(), 'sub'));

  store(tokens: TokenResponse): void {
    this.accessToken.set(tokens.accessToken);
    this.refreshToken.set(tokens.refreshToken);
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(ACCESS_KEY, tokens.accessToken);
      sessionStorage.setItem(REFRESH_KEY, tokens.refreshToken);
    }
  }

  clear(): void {
    this.accessToken.set(null);
    this.refreshToken.set(null);
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(ACCESS_KEY);
      sessionStorage.removeItem(REFRESH_KEY);
    }
  }

  private readStorage(key: string): string | null {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(key);
  }
}

@Injectable({ providedIn: 'root' })
export class HelpdeskApi {
  private readonly http = inject(HttpClient);

  login(userId: string, password: string): Observable<TokenResponse> {
    const params = new HttpParams().set('userId', userId).set('password', password);
    return this.http.post<TokenResponse>(`${API_ROOT}/auth/login`, null, { params });
  }

  register(request: RegistrationRequest): Observable<string> {
    return this.http.post(`${API_ROOT}/auth/register`, request, { responseType: 'text' });
  }

  refresh(refreshToken: string): Observable<TokenResponse> {
    return this.http.post<TokenResponse>(`${API_ROOT}/auth/refresh`, null, {
      params: new HttpParams().set('refreshToken', refreshToken)
    });
  }

  tickets(page = 0, size = 20): Observable<Page<Ticket>> {
    return this.http.get<Page<Ticket>>(`${API_ROOT}/tickets/view`, {
      params: new HttpParams().set('page', page).set('size', size).set('sort', 'updatedAt,desc')
    });
  }

  ticket(ticketNumber: string): Observable<Ticket> {
    return this.http.get<Ticket>(`${API_ROOT}/tickets/view/id`, {
      params: new HttpParams().set('ticketNumber', ticketNumber)
    });
  }

  createTicket(request: Pick<Ticket, 'title' | 'description' | 'category' | 'departmentId'>): Observable<string> {
    return this.http.post(`${API_ROOT}/tickets/create`, request, { responseType: 'text' });
  }

  updateTicket(data: Record<string, string>): Observable<string> {
    return this.http.post(`${API_ROOT}/tickets/update`, { data }, { responseType: 'text' });
  }

  addComment(ticketNumber: string, comment: string): Observable<string> {
    return this.http.post(`${API_ROOT}/tickets/comment`, { data: { ticketNumber, comment } }, { responseType: 'text' });
  }

  comments(ticketNumber: string): Observable<Page<TicketComment>> {
    return this.ticketPage<TicketComment>('/comments', ticketNumber);
  }

  history(ticketNumber: string): Observable<Page<TicketHistory>> {
    return this.ticketPage<TicketHistory>('/history', ticketNumber);
  }

  employees(): Observable<HelpdeskUser[]> {
    return this.http.get<HelpdeskUser[]>(`${API_ROOT}/users/admin/employees`);
  }

  agents(): Observable<HelpdeskUser[]> {
    return this.http.get<HelpdeskUser[]>(`${API_ROOT}/users/admin/agents`);
  }

  updateRole(userId: string, role: UserRole): Observable<string> {
    return this.http.put(`${API_ROOT}/users/admin/update`, null, {
      params: new HttpParams().set('userId', userId).set('role', role),
      responseType: 'text'
    });
  }

  notifications(unread = false): Observable<Page<NotificationItem>> {
    const path = unread ? '/notifications/unread' : '/notifications';
    return this.http.get<Page<NotificationItem>>(`${API_ROOT}${path}`, {
      params: new HttpParams().set('page', 0).set('size', 100).set('sort', 'createdAt,desc')
    });
  }

  markRead(notificationId: string): Observable<void> {
    return this.http.patch<void>(`${API_ROOT}/notifications/${notificationId}/read`, null);
  }

  private ticketPage<T>(path: string, ticketNumber: string): Observable<Page<T>> {
    return this.http.get<Page<T>>(`${API_ROOT}/tickets${path}`, {
      params: new HttpParams().set('ticketNumber', ticketNumber).set('page', 0).set('size', 50)
    });
  }
}

@Injectable({ providedIn: 'root' })
export class SessionCommands {
  private readonly api = inject(HelpdeskApi);
  private readonly session = inject(AuthSession);

  login(userId: string, password: string): Observable<TokenResponse> {
    return this.api.login(userId, password).pipe(tap(tokens => this.session.store(tokens)));
  }

  refresh(): Observable<TokenResponse> {
    const refreshToken = this.session.refreshToken();
    if (!refreshToken) throw new Error('No refresh token is available');
    return this.api.refresh(refreshToken).pipe(tap(tokens => this.session.store(tokens)));
  }
}