import { Routes } from '@angular/router';

import { adminGuard } from './core/admin.guard';
import { authGuard } from './core/auth.guard';
import { landingGuard } from './core/landing.guard';
import { AdminChallenges } from './features/admin/admin-challenges/admin-challenges';
import { AdminDashboard } from './features/admin/admin-dashboard/admin-dashboard';
import { AdminSchedule } from './features/admin/admin-schedule/admin-schedule';
import { AdminTaxonomy } from './features/admin/admin-taxonomy/admin-taxonomy';
import { AdminUsers } from './features/admin/admin-users/admin-users';
import { ForgotPassword } from './features/auth/forgot-password/forgot-password';
import { Login } from './features/auth/login/login';
import { Register } from './features/auth/register/register';
import { ResetPassword } from './features/auth/reset-password/reset-password';
import { DailyChallenge } from './features/daily-challenge/daily-challenge';
import { Dashboard } from './features/dashboard/dashboard';
import { History } from './features/history/history';
import { Landing } from './features/landing/landing';
import { Profile } from './features/profile/profile';
import { Ranking } from './features/ranking/ranking';
import { Shell } from './features/shell/shell';

export const routes: Routes = [
  { path: 'login', component: Login },
  { path: 'register', component: Register },
  { path: 'olvide-password', component: ForgotPassword },
  { path: 'restablecer', component: ResetPassword },
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
      {
        path: 'admin',
        canActivate: [adminGuard],
        children: [
          { path: 'dashboard', component: AdminDashboard },
          { path: 'taxonomia', component: AdminTaxonomy },
          { path: 'preguntas', component: AdminChallenges },
          { path: 'reto-diario', component: AdminSchedule },
          { path: 'usuarios', component: AdminUsers },
          { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
        ],
      },
      { path: '', pathMatch: 'full', canActivate: [landingGuard], component: Landing },
    ],
  },
  { path: '**', redirectTo: 'login' },
];
