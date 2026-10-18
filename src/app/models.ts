export type UserRole = 'Employee' | 'Agent' | 'Manager';
export type TicketStatus = 'OPEN' | 'ASSIGNED' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' | 'REOPENED';

export interface Ticket {
  id: number;
  ticketNumber: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: TicketStatus;
  createdBy: string;
  assignedTo: string | null;
  departmentId: number;
  createdAt: string;
  updatedAt: string;
}

export interface TicketComment {
  id: number;
  ticketNumber: string;
  commentedBy: string;
  comment: string;
  createdAt: string;
}

export interface TicketHistory {
  id: number;
  ticketNumber: string;
  action: string;
  oldValue: string | null;
  newValue: string | null;
  changedBy: string;
  createdAt: string;
}

export interface HelpdeskUser {
  id: number;
  userId: string;
  firstName: string;
  lastName: string;
  departmentId: number;
  role?: UserRole;
}

export interface NotificationItem {
  id: number;
  notificationId: string;
  ticketNumber?: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export interface Page<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
}

export interface RegistrationRequest {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  departmentId: number;
  status: 'Active';
  password: string;
}