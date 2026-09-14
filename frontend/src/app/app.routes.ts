import { Routes } from '@angular/router';

import { authGuard } from './core/auth.guard';
import { Login } from './features/auth/login/login';
import { Register } from './features/auth/register/register';
import { DailyChallenge } from './features/daily-challenge/daily-challenge';
import { Dashboard } from './features/dashboard/dashboard';
import { History } from './features/history/history';
import { Profile } from './features/profile/profile';
import { Ranking } from './features/ranking/ranking';
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
      { path: 'dashboard', component: Dashboard },
      { path: 'historial', component: History },
      { path: 'ranking', component: Ranking },
      { path: 'perfil', component: Profile },
      { path: '', redirectTo: 'reto', pathMatch: 'full' },
    ],
  },
  { path: '**', redirectTo: 'login' },
];
