import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    sessionStorage.removeItem('secure-helpdesk.access');
    sessionStorage.removeItem('secure-helpdesk.refresh');
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient()]
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the sign-in screen when signed out', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.auth-heading h2')?.textContent).toContain('Sign in to your workspace');
  });
});
