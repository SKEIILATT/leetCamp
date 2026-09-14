import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';
import { firstValueFrom, Observable, of, throwError } from 'rxjs';

import { landingGuard } from './landing.guard';
import { MeService } from './me.service';

describe('landingGuard', () => {
  let router: Router;

  function configure(meResult: 'admin' | 'student' | 'error'): void {
    const getMe =
      meResult === 'error'
        ? () => throwError(() => new Error('network error'))
        : () =>
            of({
              userId: 'user-1',
              displayName: 'Test User',
              role: meResult,
              roleId: meResult === 'admin' ? 1 : 2,
              scopeIds: [],
            });

    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: MeService, useValue: { getMe } }],
    });

    router = TestBed.inject(Router);
  }

  async function runGuard() {
    const result = TestBed.runInInjectionContext(() => landingGuard({} as never, {} as never));
    return firstValueFrom(result as Observable<boolean | UrlTree>);
  }

  it('sends an admin to /admin/dashboard', async () => {
    configure('admin');

    const result = await runGuard();

    expect((result as UrlTree).toString()).toBe(router.parseUrl('/admin/dashboard').toString());
  });

  it('sends a student to /reto', async () => {
    configure('student');

    const result = await runGuard();

    expect((result as UrlTree).toString()).toBe(router.parseUrl('/reto').toString());
  });

  it('falls back to /reto when the identity check fails', async () => {
    configure('error');

    const result = await runGuard();

    expect((result as UrlTree).toString()).toBe(router.parseUrl('/reto').toString());
  });
});
