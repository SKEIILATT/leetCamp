import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from '../../core/auth.service';
import { StreakService } from '../../core/streak.service';

@Component({
  selector: 'app-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  private readonly authService = inject(AuthService);
  private readonly streakService = inject(StreakService);
  private readonly router = inject(Router);

  protected readonly currentStreak = signal(0);
  protected readonly totalPoints = signal(0);

  constructor() {
    this.streakService.getMyStreak().subscribe({
      next: (streak) => {
        this.currentStreak.set(streak.currentStreak);
        this.totalPoints.set(streak.totalPoints);
      },
      // Si falla la carga, la barra lateral simplemente se queda en 0 — no es
      // un dato crítico para poder seguir navegando la app.
      error: () => {},
    });
  }

  protected logout(): void {
    this.authService.logout();
    this.router.navigateByUrl('/login');
  }
}
