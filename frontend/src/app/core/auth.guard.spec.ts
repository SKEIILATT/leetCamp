import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';

import { authGuard } from './auth.guard';
import { AuthService } from './auth.service';

describe('authGuard', () => {
  let router: Router;

  function configure(isAuthenticated: boolean): void {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { isAuthenticated: () => isAuthenticated } },
      ],
    });

    router = TestBed.inject(Router);
  }

  it('allows navigation when the user is authenticated', () => {
    configure(true);

    const result = TestBed.runInInjectionContext(() => authGuard({} as never, {} as never));

    expect(result).toBe(true);
  });

  it('redirects to /login when the user is not authenticated', () => {
    configure(false);

    const result = TestBed.runInInjectionContext(() => authGuard({} as never, {} as never));

    expect(result).not.toBe(true);
    expect((result as UrlTree).toString()).toBe(router.parseUrl('/login').toString());
  });
});
