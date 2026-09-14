import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';

import { AuthService } from '../../../core/auth.service';
import { Login } from './login';

describe('Login', () => {
  function setup(options: { queryParams?: Record<string, string>; login?: AuthService['login'] } = {}) {
    const authService = {
      login: options.login ?? (() => of({ token: 'jwt', expiresAt: '2026-09-15T00:00:00.000Z' })),
    };

    TestBed.configureTestingModule({
      imports: [Login],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authService },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(options.queryParams ?? {}) } },
        },
      ],
    });

    const fixture = TestBed.createComponent(Login);
    const router = TestBed.inject(Router);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const component = fixture.componentInstance as any;

    return { fixture, component, router, authService };
  }

  it('does not call the API when the form is invalid', () => {
    const { component, authService } = setup();
    let called = false;
    authService.login = (() => {
      called = true;
      return of({ token: 'jwt', expiresAt: '' });
    }) as AuthService['login'];

    component.onSubmit();

    expect(called).toBe(false);
    expect(component.form.touched).toBe(true);
  });

  it('navigates to / after a successful login, letting landingGuard route by role', () => {
    const { component, router } = setup();
    const navigateSpy = vi.spyOn(router, 'navigateByUrl');

    component.form.setValue({ email: 'ana@bootcamp.edu', password: 'secret123' });
    component.onSubmit();

    expect(navigateSpy).toHaveBeenCalledWith('/');
    expect(component.errorMessage()).toBeNull();
  });

  it('shows the server error message when login fails', () => {
    const { component } = setup({
      login: () =>
        throwError(
          () => ({ error: { message: 'Correo o contraseña incorrectos' } }) as never,
        ),
    });

    component.form.setValue({ email: 'ana@bootcamp.edu', password: 'wrong' });
    component.onSubmit();

    expect(component.errorMessage()).toBe('Correo o contraseña incorrectos');
    expect(component.submitting()).toBe(false);
  });

  it('shows the "account created" banner when arriving with ?registered', () => {
    const { component } = setup({ queryParams: { registered: '1' } });

    expect(component.successMessage()).toBe('Cuenta creada. Ya puedes iniciar sesión.');
  });

  it('shows the "password updated" banner when arriving with ?reset', () => {
    const { component } = setup({ queryParams: { reset: '1' } });

    expect(component.successMessage()).toBe('Contraseña actualizada. Ya puedes iniciar sesión.');
  });
});
