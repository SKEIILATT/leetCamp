import { Routes } from '@angular/router';

import { authGuard } from './core/auth.guard';
import { Login } from './features/auth/login/login';
import { Register } from './features/auth/register/register';
import { DailyChallenge } from './features/daily-challenge/daily-challenge';
import { History } from './features/history/history';
import { Shell } from './features/shell/shell';

export const routes: Routes = [
  { path: 'login', component: Login },
  { path: 'register', component: Register },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      { path: 'reto', component: DailyChallenge },
      { path: 'historial', component: History },
      { path: '', redirectTo: 'reto', pathMatch: 'full' },
    ],
  },
  { path: '**', redirectTo: 'login' },
];
