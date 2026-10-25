import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EMPTY, Subscription, catchError, forkJoin, switchMap, tap, timer } from 'rxjs';
import { AuthScreenComponent } from './auth-screen.component';
import { AuthSession, HelpdeskApi, SessionCommands } from './helpdesk-api';
import { NotificationCenterComponent } from './notification-center.component';
import { PeopleDirectoryComponent } from './people-directory.component';
import { NotificationWebSocketService } from './notification-websocket.service';
import { HelpdeskUser, NotificationItem, RegistrationRequest, Ticket, TicketComment, TicketHistory, TicketStatus, UserRole } from './models';
import { TicketTableComponent } from './ticket-table.component';

type Section = 'overview' | 'tickets' | 'people' | 'updates';

@Component({
  selector: 'app-workspace',
  standalone: true,
  imports: [CommonModule, FormsModule, AuthScreenComponent, TicketTableComponent, PeopleDirectoryComponent, NotificationCenterComponent],
  templateUrl: './workspace.component.html',
  styleUrl: './workspace.component.scss'
})
export class WorkspaceComponent implements OnDestroy {
  readonly auth = inject(AuthSession);
  private readonly api = inject(HelpdeskApi);
  private readonly sessionCommands = inject(SessionCommands);
  private readonly notificationSocket = inject(NotificationWebSocketService);
  readonly today = new Date();
  readonly greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening';

  readonly section = signal<Section>('overview');
  readonly tickets = signal<Ticket[]>([]);
  readonly team = signal<HelpdeskUser[]>([]);
  readonly agents = signal<HelpdeskUser[]>([]);
  readonly notifications = signal<NotificationItem[]>([]);
  readonly unreadCount = signal(0);
  readonly liveNotice = signal<NotificationItem | null>(null);
  readonly notificationConnection = signal<'connecting' | 'live' | 'polling' | 'offline'>('offline');
  readonly selectedTicket = signal<Ticket | null>(null);
  readonly comments = signal<TicketComment[]>([]);
  readonly history = signal<TicketHistory[]>([]);
  readonly page = signal(0);
  readonly totalPages = signal(1);
  readonly totalTickets = signal(0);
  readonly loading = signal(false);
  readonly detailLoading = signal(false);
  readonly busy = signal(false);
  readonly showCreate = signal(false);
  readonly showRegistration = signal(false);
  readonly errorMessage = signal('');
  readonly successMessage = signal('');
  readonly searchText = signal('');
  readonly statusFilter = signal('ALL');
  readonly filteredTickets = computed(() => {
    const query = this.searchText().trim().toLowerCase();
    const status = this.statusFilter();
    return this.tickets().filter(ticket => {
      const matchesQuery = !query || `${ticket.ticketNumber} ${ticket.title} ${ticket.createdBy} ${ticket.category}`.toLowerCase().includes(query);
      return matchesQuery && (status === 'ALL' || ticket.status === status);
    });
  });
  readonly openCount = computed(() => this.tickets().filter(ticket => ['OPEN', 'ASSIGNED', 'REOPENED'].includes(ticket.status)).length);
  readonly activeCount = computed(() => this.tickets().filter(ticket => ticket.status === 'IN_PROGRESS').length);
  readonly resolvedCount = computed(() => this.tickets().filter(ticket => ['RESOLVED', 'CLOSED'].includes(ticket.status)).length);
  readonly roleName = computed(() => this.auth.role() ?? 'Employee');
  readonly currentTitle = computed(() => ({
    overview: 'Overview',
    tickets: 'Ticket queue',
    people: 'People',
    updates: 'Notifications'
  })[this.section()]);

  ticketDraft = { title: '', description: '', category: 'IT Support', departmentId: 1 };
  commentDraft = '';
  assignmentTarget = '';
  private readonly knownNotificationIds = new Set<string>();
  private livePolling?: Subscription;
  private pollingAvailable = false;
  private liveNoticeTimeout?: ReturnType<typeof setTimeout>;

  constructor() {
    if (this.auth.accessToken()) this.loadWorkspace();
  }

  ngOnDestroy(): void {
    this.stopNotificationPolling();
    this.notificationSocket.disconnect();
  }

  toggleRegistration(): void {
    this.showRegistration.update(value => !value);
    this.errorMessage.set('');
  }

  signIn(credentials: { userId: string; password: string }): void {
    this.errorMessage.set('');
    this.busy.set(true);
    this.sessionCommands.login(credentials.userId, credentials.password).subscribe({
      next: () => {
        this.busy.set(false);
        this.loadWorkspace();
      },
      error: error => {
        this.busy.set(false);
        this.errorMessage.set(this.readError(error, 'Sign in failed. Check your details and try again.'));
      }
    });
  }

  createAccount(registration: RegistrationRequest): void {
    this.errorMessage.set('');
    this.busy.set(true);
    this.api.register(registration).subscribe({
      next: () => {
        this.sessionCommands.login(registration.userId.trim(), registration.password).subscribe({
          next: () => {
            this.busy.set(false);
            this.loadWorkspace();
          },
          error: error => {
            this.busy.set(false);
            this.errorMessage.set(this.readError(error, 'Account created. Please sign in.'));
            this.showRegistration.set(false);
          }
        });
      },
      error: error => {
        this.busy.set(false);
        this.errorMessage.set(this.readError(error, 'Could not create the account.'));
      }
    });
  }

  signOut(): void {
    this.stopNotificationPolling();
    this.notificationSocket.disconnect();
    this.auth.clear();
    this.tickets.set([]);
    this.team.set([]);
    this.agents.set([]);
    this.notifications.set([]);
    this.unreadCount.set(0);
    this.liveNotice.set(null);
    this.knownNotificationIds.clear();
    this.section.set('overview');
  }

  loadWorkspace(): void {
    this.errorMessage.set('');
    const accessToken = this.auth.accessToken();
    this.startNotificationPolling();
    if (accessToken) {
      void this.notificationSocket.connect(
        accessToken,
        payload => this.handleWebSocketNotification(payload),
        status => this.notificationConnection.set(
          status !== 'live' && this.pollingAvailable ? 'polling' : status
        )
      );
    }
    this.loadTickets(0);
    this.loadNotifications();
    this.loadPeople();
  }

  loadTickets(page = this.page()): void {
    this.loading.set(true);
    this.api.tickets(page, 10).subscribe({
      next: result => {
        this.tickets.set(result.content ?? []);
        this.page.set(result.number ?? page);
        this.totalPages.set(Math.max(1, result.totalPages ?? 1));
        this.totalTickets.set(result.totalElements ?? 0);
        this.loading.set(false);
      },
      error: error => {
        this.loading.set(false);
        this.errorMessage.set(this.readError(error, 'Tickets could not be loaded.'));
      }
    });
  }

  loadPeople(): void {
    const role = this.auth.role();
    if (role === 'Manager') {
      forkJoin({ team: this.api.employees(), agents: this.api.agents() }).subscribe({
        next: result => {
          const employees = (result.team ?? []).map(user => ({ ...user, role: 'Employee' as const }));
          const agents = (result.agents ?? []).map(user => ({ ...user, role: 'Agent' as const }));
          this.team.set([...employees, ...agents]);
          this.agents.set(agents);
        },
        error: error => this.errorMessage.set(this.readError(error, 'Team members could not be loaded.'))
      });
    } else if (role === 'Agent') {
      this.api.employees().subscribe({
        next: team => this.team.set((team ?? []).map(user => ({ ...user, role: 'Employee' }))),
        error: error => this.errorMessage.set(this.readError(error, 'Team members could not be loaded.'))
      });
    }
  }

  loadNotifications(): void {
    forkJoin({ all: this.api.notifications(), unread: this.api.notifications(true) }).subscribe({
      next: ({ all, unread }) => {
        const items = all.content ?? [];
        this.notifications.set(items);
        this.knownNotificationIds.clear();
        for (const item of items) this.knownNotificationIds.add(item.notificationId);
        for (const item of unread.content ?? []) this.knownNotificationIds.add(item.notificationId);
        this.unreadCount.set(unread.totalElements ?? unread.content?.length ?? 0);
      },
      error: error => {
        if (this.notificationConnection() !== 'live' && !this.pollingAvailable) {
          this.notificationConnection.set('offline');
        }
        this.errorMessage.set(this.readError(error, 'Notifications could not be loaded.'));
      }
    });
  }

  dismissLiveNotice(): void {
    this.liveNotice.set(null);
    if (this.liveNoticeTimeout) clearTimeout(this.liveNoticeTimeout);
  }

  openLiveNotice(): void {
    this.changeSection('updates');
    this.dismissLiveNotice();
  }

  changeSection(section: Section): void {
    this.section.set(section);
    this.successMessage.set('');
    if (section === 'tickets') this.loadTickets(0);
    if (section === 'people') this.loadPeople();
    if (section === 'updates') this.loadNotifications();
  }

  openTicket(ticket: Ticket): void {
    this.selectedTicket.set(ticket);
    this.commentDraft = '';
    this.assignmentTarget = ticket.assignedTo ?? '';
    this.detailLoading.set(true);
    forkJoin({
      comments: this.api.comments(ticket.ticketNumber),
      history: this.api.history(ticket.ticketNumber)
    }).subscribe({
      next: result => {
        this.comments.set(result.comments.content ?? []);
        this.history.set(result.history.content ?? []);
        this.detailLoading.set(false);
      },
      error: error => {
        this.comments.set([]);
        this.history.set([]);
        this.detailLoading.set(false);
        this.errorMessage.set(this.readError(error, 'Ticket activity could not be loaded.'));
      }
    });
  }

  closeTicket(): void {
    this.selectedTicket.set(null);
    this.comments.set([]);
    this.history.set([]);
  }

  submitTicket(): void {
    this.busy.set(true);
    this.errorMessage.set('');
    this.api.createTicket(this.ticketDraft).subscribe({
      next: message => {
        this.busy.set(false);
        this.showCreate.set(false);
        this.ticketDraft = { title: '', description: '', category: 'IT Support', departmentId: 1 };
        this.successMessage.set(message || 'Ticket created.');
        this.changeSection('tickets');
      },
      error: error => {
        this.busy.set(false);
        this.errorMessage.set(this.readError(error, 'Ticket could not be created.'));
      }
    });
  }

  postComment(): void {
    const ticket = this.selectedTicket();
    const comment = this.commentDraft.trim();
    if (!ticket || !comment) return;
    this.busy.set(true);
    this.api.addComment(ticket.ticketNumber, comment).subscribe({
      next: () => {
        this.busy.set(false);
        this.commentDraft = '';
        this.api.comments(ticket.ticketNumber).subscribe(result => this.comments.set(result.content ?? []));
        this.successMessage.set('Reply added.');
      },
      error: error => {
        this.busy.set(false);
        this.errorMessage.set(this.readError(error, 'Your reply could not be added.'));
      }
    });
  }

  changeStatus(ticket: Ticket, status: string): void {
    const validStatus = this.availableStatuses(ticket).find(option => option === status);
    if (validStatus) this.updateTicket({ ticketNumber: ticket.ticketNumber, status: validStatus }, 'Ticket status updated.');
  }

  assignTicket(ticket: Ticket): void {
    if (!this.assignmentTarget) return;
    this.updateTicket({ ticketNumber: ticket.ticketNumber, assignedTo: this.assignmentTarget }, 'Ticket assignment updated.');
  }

  availableStatuses(ticket: Ticket): TicketStatus[] {
    const transitions: Record<TicketStatus, TicketStatus[]> = {
      OPEN: ['ASSIGNED'],
      ASSIGNED: ['IN_PROGRESS'],
      IN_PROGRESS: ['RESOLVED'],
      RESOLVED: ['CLOSED', 'REOPENED'],
      CLOSED: [],
      REOPENED: ['IN_PROGRESS']
    };
    const options = transitions[ticket.status];
    return this.auth.role() === 'Manager' ? options : options.filter(status => status !== 'ASSIGNED');
  }

  updateMemberRole(user: HelpdeskUser, role: UserRole): void {
    this.api.updateRole(user.userId, role).subscribe({
      next: message => {
        this.successMessage.set(message || `Role updated for ${user.userId}.`);
        this.loadPeople();
      },
      error: error => this.errorMessage.set(this.readError(error, 'Role could not be updated.'))
    });
  }

  markRead(item: NotificationItem): void {
    if (item.read) return;
    this.api.markRead(item.notificationId).subscribe({
      next: () => {
        this.notifications.update(items => items.map(notification => notification.notificationId === item.notificationId
          ? { ...notification, read: true }
          : notification));
        this.unreadCount.update(count => Math.max(0, count - 1));
      },
      error: error => this.errorMessage.set(this.readError(error, 'Notification could not be marked as read.'))
    });
  }

  openNotificationTicket(item: NotificationItem): void {
    const ticketNumber = item.ticketNumber
      ?? item.message.match(/\bticket\s+([A-Z0-9][A-Z0-9-]*)\b/i)?.[1];
    if (!ticketNumber) {
      this.errorMessage.set('This notification is not linked to a ticket.');
      return;
    }

    this.errorMessage.set('');
    this.changeSection('tickets');
    this.api.ticket(ticketNumber).subscribe({
      next: ticket => this.openTicket(ticket),
      error: error => this.errorMessage.set(this.readError(error, 'The ticket linked to this notification could not be opened.'))
    });
  }

  previousPage(): void {
    if (this.page() > 0) this.loadTickets(this.page() - 1);
  }

  nextPage(): void {
    if (this.page() + 1 < this.totalPages()) this.loadTickets(this.page() + 1);
  }

  initials(userId: string | null | undefined): string {
    return (userId || 'HD').slice(0, 2).toUpperCase();
  }

  private updateTicket(data: Record<string, string>, success: string): void {
    this.busy.set(true);
    this.api.updateTicket(data).subscribe({
      next: message => {
        this.busy.set(false);
        this.successMessage.set(message || success);
        this.loadTickets();
        const selected = this.selectedTicket();
        if (selected) {
          this.selectedTicket.set({ ...selected, ...data } as Ticket);
          this.assignmentTarget = data['assignedTo'] ?? selected.assignedTo ?? '';
          this.api.history(selected.ticketNumber).subscribe(result => this.history.set(result.content ?? []));
        }
      },
      error: error => {
        this.busy.set(false);
        this.errorMessage.set(this.readError(error, 'Ticket could not be updated.'));
      }
    });
  }

  private startNotificationPolling(): void {
    if (this.livePolling || !this.auth.accessToken()) return;
    this.livePolling = timer(15_000, 15_000).pipe(
      switchMap(() => this.api.notifications(true).pipe(
        tap(result => {
          this.pollingAvailable = true;
          if (this.notificationConnection() !== 'live') {
            this.notificationConnection.set('polling');
          }
          const unread = result.content ?? [];
          const arriving = unread.filter(item => !this.knownNotificationIds.has(item.notificationId));
          for (const item of unread) this.knownNotificationIds.add(item.notificationId);
          if (arriving.length) {
            this.notifications.update(current => {
              const merged = [...arriving, ...current];
              return [...new Map(merged.map(item => [item.notificationId, item])).values()].slice(0, 100);
            });
            this.liveNotice.set(arriving[0]);
            if (this.liveNoticeTimeout) clearTimeout(this.liveNoticeTimeout);
            this.liveNoticeTimeout = setTimeout(() => this.liveNotice.set(null), 8_000);
          }
          this.unreadCount.set(result.totalElements ?? unread.length);
        }),
        catchError(error => {
          this.pollingAvailable = false;
          if (this.notificationConnection() !== 'live') {
            this.notificationConnection.set('offline');
          }
          console.error('Notification polling failed:', error);
          return EMPTY;
        })
      ))
    ).subscribe();
  }

  private stopNotificationPolling(): void {
    this.livePolling?.unsubscribe();
    this.livePolling = undefined;
    if (this.liveNoticeTimeout) clearTimeout(this.liveNoticeTimeout);
    this.liveNoticeTimeout = undefined;
    this.liveNotice.set(null);
  }

  private handleWebSocketNotification(payload: unknown): void {
    const notification = payload as Partial<NotificationItem>;
    const id = notification.notificationId;
    if (!id) return;

    this.notifications.update(current => {
      const next = [notification as NotificationItem, ...current.filter(item => item.notificationId !== id)];
      return next.slice(0, 100);
    });

    this.knownNotificationIds.add(id);
    this.unreadCount.update(count => {
      const next = notification.read ? Math.max(0, count - 1) : count + 1;
      return next;
    });

    if (notification.type === 'TICKET_COMMENT_ADDED') {
      const ticketNumber = notification.ticketNumber
        ?? notification.message?.match(/\bticket\s+([A-Z0-9][A-Z0-9-]*)\b/i)?.[1];
      if (ticketNumber && this.selectedTicket()?.ticketNumber === ticketNumber) {
        this.refreshTicketComments(ticketNumber);
      }
    }

    if (!notification.read) {
      this.liveNotice.set(notification as NotificationItem);
      if (this.liveNoticeTimeout) clearTimeout(this.liveNoticeTimeout);
      this.liveNoticeTimeout = setTimeout(() => this.liveNotice.set(null), 8_000);
    }
  }

  private refreshTicketComments(ticketNumber: string): void {
    this.api.comments(ticketNumber).subscribe({
      next: result => {
        if (this.selectedTicket()?.ticketNumber === ticketNumber) {
          this.comments.set(result.content ?? []);
        }
      },
      error: error => this.errorMessage.set(this.readError(error, 'New ticket comments could not be loaded.'))
    });
  }

  private readError(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      const payload: unknown = error.error;
      if (typeof payload === 'string' && payload.trim()) return payload;
      if (payload && typeof payload === 'object' && 'message' in payload && typeof payload.message === 'string') {
        return payload.message;
      }
    }
    return fallback;
  }
}