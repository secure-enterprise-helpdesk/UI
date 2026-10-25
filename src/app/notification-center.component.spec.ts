import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NotificationCenterComponent } from './notification-center.component';
import { NotificationItem } from './models';

describe('NotificationCenterComponent', () => {
  let fixture: ComponentFixture<NotificationCenterComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NotificationCenterComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(NotificationCenterComponent);
    fixture.componentInstance.notifications = [{
      id: 1,
      notificationId: 'notification-1',
      ticketNumber: 'TCK-TEST1234',
      type: 'TICKET_ASSIGNED',
      title: 'Ticket assigned',
      message: 'Ticket TCK-TEST1234 has been assigned to you.',
      read: false,
      createdAt: '2026-10-05T12:00:00Z'
    } satisfies NotificationItem];
    fixture.detectChanges();
  });

  it('emits the ticket to open when the notification content is clicked', () => {
    const openTicket = jasmine.createSpy('openTicket');
    const markRead = jasmine.createSpy('markRead');
    fixture.componentInstance.openTicket.subscribe(openTicket);
    fixture.componentInstance.markRead.subscribe(markRead);

    fixture.nativeElement.querySelector('.notification-open').click();

    expect(openTicket).toHaveBeenCalledWith(fixture.componentInstance.notifications[0]);
    expect(markRead).not.toHaveBeenCalled();
  });

  it('keeps mark read as a separate action', () => {
    const openTicket = jasmine.createSpy('openTicket');
    const markRead = jasmine.createSpy('markRead');
    fixture.componentInstance.openTicket.subscribe(openTicket);
    fixture.componentInstance.markRead.subscribe(markRead);

    fixture.nativeElement.querySelector('.mark-read').click();

    expect(markRead).toHaveBeenCalledWith(fixture.componentInstance.notifications[0]);
    expect(openTicket).not.toHaveBeenCalled();
  });
});
