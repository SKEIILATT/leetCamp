import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';

import { MeService } from './me.service';

export const adminGuard: CanActivateFn = () => {
  const meService = inject(MeService);
  const router = inject(Router);

  return meService.getMe().pipe(
    map((me) => (me.role === 'admin' ? true : router.parseUrl('/reto'))),
    catchError(() => of(router.parseUrl('/reto'))),
  );
};
