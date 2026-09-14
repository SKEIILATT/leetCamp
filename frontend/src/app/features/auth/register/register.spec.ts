import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';

import { AuthService } from '../../../core/auth.service';
import { Register } from './register';

describe('Register', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function setup(register?: (...args: any[]) => any) {
    const authService = {
      register: register ?? (() => of({ userId: 'user-1' })),
    };

    TestBed.configureTestingModule({
      imports: [Register],
      providers: [provideRouter([]), { provide: AuthService, useValue: authService }],
    });

    const fixture = TestBed.createComponent(Register);
    const router = TestBed.inject(Router);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const component = fixture.componentInstance as any;

    return { fixture, component, router, authService };
  }

  it('blocks submit when the passwords do not match', () => {
    const { component, authService } = setup();
    let called = false;
    authService.register = () => {
      called = true;
      return of({ userId: 'user-1' });
    };

    component.form.setValue({
      displayName: 'Ana Méndez',
      email: 'ana@bootcamp.edu',
      password: 'secret123',
      confirmPassword: 'different123',
    });
    component.onSubmit();

    expect(called).toBe(false);
    expect(component.form.hasError('passwordsMismatch')).toBe(true);
  });

  it('navigates to /login?registered=1 after a successful registration', () => {
    const { component, router } = setup();
    const navigateSpy = vi.spyOn(router, 'navigateByUrl');

    component.form.setValue({
      displayName: 'Ana Méndez',
      email: 'ana@bootcamp.edu',
      password: 'secret123',
      confirmPassword: 'secret123',
    });
    component.onSubmit();

    expect(navigateSpy).toHaveBeenCalledWith('/login?registered=1');
  });

  it('shows the server error message when registration fails', () => {
    const { component } = setup(() =>
      throwError(() => ({ error: { message: 'Ese correo ya está registrado' } })),
    );

    component.form.setValue({
      displayName: 'Ana Méndez',
      email: 'ana@bootcamp.edu',
      password: 'secret123',
      confirmPassword: 'secret123',
    });
    component.onSubmit();

    expect(component.errorMessage()).toBe('Ese correo ya está registrado');
  });
});
