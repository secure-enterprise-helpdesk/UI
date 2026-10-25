import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { NotificationItem } from './models';

@Component({
  selector: 'app-notification-center',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './notification-center.component.html',
  styleUrl: './notification-center.component.scss'
})
export class NotificationCenterComponent {
  @Input() notifications: NotificationItem[] = [];
  @Input() unreadCount = 0;
  @Output() refresh = new EventEmitter<void>();
  @Output() markRead = new EventEmitter<NotificationItem>();
  @Output() openTicket = new EventEmitter<NotificationItem>();
}
