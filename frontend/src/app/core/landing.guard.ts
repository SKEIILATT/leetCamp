import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';

import { MeService } from './me.service';

/**
 * Decide a dónde aterriza cada rol al entrar sin ruta específica ('/').
 * Un admin no participa del reto/racha — su "home" es el banco de preguntas,
 * no "Reto del día".
 */
export const landingGuard: CanActivateFn = () => {
  const meService = inject(MeService);
  const router = inject(Router);

  return meService.getMe().pipe(
    map((me) => router.parseUrl(me.role === 'admin' ? '/admin/preguntas' : '/reto')),
    catchError(() => of(router.parseUrl('/reto'))),
  );
};
