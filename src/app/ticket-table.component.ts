import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Ticket } from './models';

@Component({
  selector: 'app-ticket-table',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ticket-table.component.html',
  styleUrl: './ticket-table.component.scss'
})
export class TicketTableComponent {
  @Input() tickets: Ticket[] = [];
  @Input() loading = false;
  @Input() hasFilters = false;
  @Output() ticketSelected = new EventEmitter<Ticket>();
}
