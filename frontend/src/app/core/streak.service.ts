import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';

import { environment } from '../../environments/environment';
import type { paths } from '../generated/api.d.ts';

type StreakResponse = paths['/api/v1/me/streak']['get']['responses'][200]['content']['application/json'];

/**
 * Estado compartido de racha/puntos — un solo signal para que la barra
 * lateral (Shell) y la pantalla del reto del día lean/actualicen el mismo
 * dato sin pasar por un fetch extra tras cada envío.
 */
@Injectable({ providedIn: 'root' })
export class StreakService {
  private readonly http = inject(HttpClient);

  private readonly state = signal<StreakResponse | null>(null);
  readonly streak = this.state.asReadonly();

  refresh(): void {
    this.http.get<StreakResponse>(`${environment.apiBaseUrl}/me/streak`).subscribe({
      next: (streak) => this.state.set(streak),
      error: () => {},
    });
  }

  applyAttemptResult(update: { currentStreak: number; longestStreak: number; totalPoints: number }): void {
    const current = this.state();
    this.state.set({
      currentStreak: update.currentStreak,
      longestStreak: update.longestStreak,
      totalPoints: update.totalPoints,
      lastAttemptDate: current?.lastAttemptDate ?? null,
    });
  }
}
