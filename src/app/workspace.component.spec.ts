import { provideHttpClient } from '@angular/common/http';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { of } from 'rxjs';
import { AuthSession, HelpdeskApi } from './helpdesk-api';
import { NotificationItem, Page, Ticket, TicketComment, TicketHistory } from './models';
import { NotificationWebSocketService } from './notification-websocket.service';
import { WorkspaceComponent } from './workspace.component';

describe('WorkspaceComponent live notifications', () => {
  let api: jasmine.SpyObj<HelpdeskApi>;
  let socketMessageHandler: ((payload: unknown) => void) | undefined;
  let socketStatusHandler: ((status: 'connecting' | 'live' | 'offline') => void) | undefined;
  const emptyPage = <T>(): Page<T> => ({ content: [], totalElements: 0, totalPages: 1, number: 0, size: 100 });

  beforeEach(async () => {
    api = jasmine.createSpyObj<HelpdeskApi>('HelpdeskApi', [
      'tickets', 'ticket', 'comments', 'history', 'notifications', 'employees'
    ]);
    api.tickets.and.returnValue(of(emptyPage<Ticket>()));
    api.comments.and.returnValue(of(emptyPage<TicketComment>()));
    api.history.and.returnValue(of(emptyPage<TicketHistory>()));
    api.employees.and.returnValue(of([]));
    socketMessageHandler = undefined;
    socketStatusHandler = undefined;
    const socket = {
      connect: jasmine.createSpy('connect').and.callFake((
        _token: string,
        onMessage: (payload: unknown) => void,
        onStatus: (status: 'connecting' | 'live' | 'offline') => void
      ) => {
        socketMessageHandler = onMessage;
        socketStatusHandler = onStatus;
        onStatus('live');
        return Promise.resolve();
      }),
      disconnect: jasmine.createSpy('disconnect')
    };
    await TestBed.configureTestingModule({
      imports: [WorkspaceComponent],
      providers: [
        provideHttpClient(),
        { provide: HelpdeskApi, useValue: api },
        { provide: NotificationWebSocketService, useValue: socket }
      ]
    }).compileComponents();
  });

  it('surfaces a notification delivered over the authenticated socket', () => {
    api.notifications.and.returnValue(of(emptyPage<NotificationItem>()));
    const auth = TestBed.inject(AuthSession);
    const payload = btoa(JSON.stringify({ sub: 'agent.demo', role: 'Agent' }));
    auth.store({ accessToken: `header.${payload}.signature`, refreshToken: 'refresh', tokenType: 'Bearer', expiresIn: 900 });

    const fixture = TestBed.createComponent(WorkspaceComponent);
    fixture.detectChanges();
    expect(socketMessageHandler).toBeDefined();
    socketMessageHandler!({
      id: 1,
      notificationId: 'notification-1',
      type: 'TICKET_ASSIGNED',
      title: 'Ticket assigned',
      message: 'A ticket was assigned to you.',
      read: false,
      createdAt: '2026-10-05T12:00:00Z'
    } satisfies NotificationItem);
    fixture.detectChanges();

    expect(fixture.componentInstance.unreadCount()).toBe(1);
    expect(fixture.componentInstance.liveNotice()?.notificationId).toBe('notification-1');
    fixture.destroy();
  });

  it('shows newly unread notifications through polling when the socket is offline', fakeAsync(() => {
    const notification: NotificationItem = {
      id: 2,
      notificationId: 'notification-from-poll',
      ticketNumber: 'TCK-TEST1234',
      type: 'TICKET_ASSIGNED',
      title: 'Ticket assigned',
      message: 'A ticket was assigned to you.',
      read: false,
      createdAt: '2026-10-05T12:00:00Z'
    };
    api.notifications.and.returnValues(
      of(emptyPage<NotificationItem>()),
      of(emptyPage<NotificationItem>()),
      of({ ...emptyPage<NotificationItem>(), content: [notification], totalElements: 1 })
    );
    const auth = TestBed.inject(AuthSession);
    const payload = btoa(JSON.stringify({ sub: 'agent.demo', role: 'Agent' }));
    auth.store({ accessToken: `header.${payload}.signature`, refreshToken: 'refresh', tokenType: 'Bearer', expiresIn: 900 });

    const fixture = TestBed.createComponent(WorkspaceComponent);
    fixture.detectChanges();
    socketStatusHandler!('offline');

    tick(14_999);
    expect(fixture.componentInstance.liveNotice()).toBeNull();
    tick(1);

    expect(fixture.componentInstance.notificationConnection()).toBe('polling');
    expect(fixture.componentInstance.notifications()[0].notificationId).toBe(notification.notificationId);
    expect(fixture.componentInstance.unreadCount()).toBe(1);
    expect(fixture.componentInstance.liveNotice()?.notificationId).toBe(notification.notificationId);
    fixture.destroy();
  }));

  it('opens the ticket referenced by a notification', () => {
    const ticket: Ticket = {
      id: 12,
      ticketNumber: 'TCK-TEST1234',
      title: 'Access request',
      description: 'Unable to sign in',
      category: 'IT Support',
      priority: 'HIGH',
      status: 'OPEN',
      createdBy: 'agent.demo',
      assignedTo: null,
      departmentId: 1,
      createdAt: '2026-10-05T12:00:00Z',
      updatedAt: '2026-10-05T12:00:00Z'
    };
    api.ticket.and.returnValue(of(ticket));

    const fixture = TestBed.createComponent(WorkspaceComponent);
    fixture.componentInstance.openNotificationTicket({
      id: 1,
      notificationId: 'notification-1',
      ticketNumber: ticket.ticketNumber,
      type: 'TICKET_ASSIGNED',
      title: 'Ticket assigned',
      message: 'Ticket TCK-TEST1234 has been assigned to you.',
      read: false,
      createdAt: '2026-10-05T12:00:00Z'
    });

    expect(api.ticket).toHaveBeenCalledWith(ticket.ticketNumber);
    expect(fixture.componentInstance.section()).toBe('tickets');
    expect(fixture.componentInstance.selectedTicket()).toEqual(ticket);
    fixture.destroy();
  });

  it('opens a ticket from an older notification without a structured ticket number', () => {
    const ticket: Ticket = {
      id: 12,
      ticketNumber: 'TCK-TEST1234',
      title: 'Access request',
      description: 'Unable to sign in',
      category: 'IT Support',
      priority: 'HIGH',
      status: 'OPEN',
      createdBy: 'agent.demo',
      assignedTo: null,
      departmentId: 1,
      createdAt: '2026-10-05T12:00:00Z',
      updatedAt: '2026-10-05T12:00:00Z'
    };
    api.ticket.and.returnValue(of(ticket));

    const fixture = TestBed.createComponent(WorkspaceComponent);
    fixture.componentInstance.openNotificationTicket({
      id: 1,
      notificationId: 'notification-legacy',
      type: 'TICKET_ASSIGNED',
      title: 'Ticket assigned',
      message: 'Ticket TCK-TEST1234 has been assigned to you.',
      read: false,
      createdAt: '2026-10-05T12:00:00Z'
    });

    expect(api.ticket).toHaveBeenCalledWith(ticket.ticketNumber);
    expect(fixture.componentInstance.selectedTicket()).toEqual(ticket);
    fixture.destroy();
  });

  it('refreshes comments when a comment notification arrives for the open ticket', () => {
    api.notifications.and.returnValue(of(emptyPage<NotificationItem>()));
    const auth = TestBed.inject(AuthSession);
    const payload = btoa(JSON.stringify({ sub: 'agent.demo', role: 'Agent' }));
    auth.store({ accessToken: `header.${payload}.signature`, refreshToken: 'refresh', tokenType: 'Bearer', expiresIn: 900 });
    const fixture = TestBed.createComponent(WorkspaceComponent);
    fixture.detectChanges();
    const ticket: Ticket = {
      id: 12,
      ticketNumber: 'TCK-TEST1234',
      title: 'Access request',
      description: 'Unable to sign in',
      category: 'IT Support',
      priority: 'HIGH',
      status: 'OPEN',
      createdBy: 'agent.demo',
      assignedTo: 'agent.other',
      departmentId: 1,
      createdAt: '2026-10-05T12:00:00Z',
      updatedAt: '2026-10-05T12:00:00Z'
    };
    fixture.componentInstance.selectedTicket.set(ticket);
    const incoming: TicketComment = {
      id: 3,
      ticketNumber: ticket.ticketNumber,
      commentedBy: 'agent.other',
      comment: 'I have started looking into this.',
      createdAt: '2026-10-05T12:01:00Z'
    };
    api.comments.and.returnValue(of({
      content: [incoming],
      totalElements: 1,
      totalPages: 1,
      number: 0,
      size: 50
    }));

    socketMessageHandler!({
      notificationId: 'comment-notification-1',
      ticketNumber: ticket.ticketNumber,
      type: 'TICKET_COMMENT_ADDED',
      title: 'New Ticket Comment',
      message: `A new comment was added to ticket ${ticket.ticketNumber}.`,
      read: false,
      createdAt: incoming.createdAt
    } satisfies Partial<NotificationItem>);

    expect(api.comments).toHaveBeenCalledWith(ticket.ticketNumber);
    expect(fixture.componentInstance.comments()).toEqual([incoming]);
    fixture.destroy();
  });

  it('does not reload comments when a comment notification is for another ticket', () => {
    api.notifications.and.returnValue(of(emptyPage<NotificationItem>()));
    const auth = TestBed.inject(AuthSession);
    const payload = btoa(JSON.stringify({ sub: 'agent.demo', role: 'Agent' }));
    auth.store({ accessToken: `header.${payload}.signature`, refreshToken: 'refresh', tokenType: 'Bearer', expiresIn: 900 });
    const fixture = TestBed.createComponent(WorkspaceComponent);
    fixture.detectChanges();
    fixture.componentInstance.selectedTicket.set({
      id: 12,
      ticketNumber: 'TCK-OPEN1234',
      title: 'Open ticket',
      description: 'Description',
      category: 'IT Support',
      priority: 'HIGH',
      status: 'OPEN',
      createdBy: 'agent.demo',
      assignedTo: 'agent.other',
      departmentId: 1,
      createdAt: '2026-10-05T12:00:00Z',
      updatedAt: '2026-10-05T12:00:00Z'
    });
    api.comments.calls.reset();

    socketMessageHandler!({
      notificationId: 'comment-notification-2',
      ticketNumber: 'TCK-OTHER1234',
      type: 'TICKET_COMMENT_ADDED',
      title: 'New Ticket Comment',
      message: 'A new comment was added to ticket TCK-OTHER1234.',
      read: false,
      createdAt: '2026-10-05T12:01:00Z'
    } satisfies Partial<NotificationItem>);

    expect(api.comments).not.toHaveBeenCalled();
    fixture.destroy();
  });
});
