import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';
import { firstValueFrom, Observable, of, throwError } from 'rxjs';

import { adminGuard } from './admin.guard';
import { MeService } from './me.service';

describe('adminGuard', () => {
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
    const result = TestBed.runInInjectionContext(() => adminGuard({} as never, {} as never));
    return firstValueFrom(result as Observable<boolean | UrlTree>);
  }

  it('allows navigation for an admin', async () => {
    configure('admin');

    const result = await runGuard();

    expect(result).toBe(true);
  });

  it('redirects a student to /reto', async () => {
    configure('student');

    const result = await runGuard();

    expect(result).not.toBe(true);
    expect((result as UrlTree).toString()).toBe(router.parseUrl('/reto').toString());
  });

  it('redirects to /reto when the identity check fails', async () => {
    configure('error');

    const result = await runGuard();

    expect(result).not.toBe(true);
    expect((result as UrlTree).toString()).toBe(router.parseUrl('/reto').toString());
  });
});
