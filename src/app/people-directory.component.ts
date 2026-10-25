import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HelpdeskUser, UserRole } from './models';

@Component({
  selector: 'app-people-directory',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './people-directory.component.html',
  styleUrl: './people-directory.component.scss'
})
export class PeopleDirectoryComponent {
  @Input() team: HelpdeskUser[] = [];
  @Input() agents: HelpdeskUser[] = [];
  @Input() manager = false;
  @Output() roleChanged = new EventEmitter<{ user: HelpdeskUser; role: UserRole }>();

  initials(userId: string): string {
    return (userId || 'HD').slice(0, 2).toUpperCase();
  }

  changeRole(user: HelpdeskUser, role: UserRole): void {
    this.roleChanged.emit({ user, role });
  }
}
