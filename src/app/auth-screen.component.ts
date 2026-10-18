import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RegistrationRequest } from './models';

@Component({
  selector: 'app-auth-screen',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './auth-screen.component.html',
  styleUrl: './auth-screen.component.scss'
})
export class AuthScreenComponent {
  @Input() busy = false;
  @Input() errorMessage = '';
  @Input() showRegistration = false;
  @Output() login = new EventEmitter<{ userId: string; password: string }>();
  @Output() register = new EventEmitter<RegistrationRequest>();
  @Output() toggleMode = new EventEmitter<void>();

  loginForm = { userId: '', password: '' };
  registration = {
    userId: '', firstName: '', lastName: '', email: '', phoneNumber: '', departmentId: 1, password: ''
  };

  toggleRegistration(): void {
    this.toggleMode.emit();
  }

  submitLogin(): void {
    this.login.emit({ ...this.loginForm, userId: this.loginForm.userId.trim() });
  }

  submitRegistration(): void {
    this.register.emit({ ...this.registration, status: 'Active' });
  }
}
