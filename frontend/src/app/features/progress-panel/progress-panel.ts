import { Component, computed, inject, signal } from '@angular/core';

import { AttemptHistoryEntry, HistoryService } from '../../core/history.service';
import { StreakService } from '../../core/streak.service';
import { ScreenFrame } from '../screen-frame/screen-frame';

interface HeatmapDay {
  date: string;
  label: string;
  status: 'correct' | 'incorrect' | 'none';
}

interface Badge {
  icon: string;
  label: string;
  unlocked: boolean;
}

/**
 * Panel de progreso reusable (racha/puntos, calendario de los últimos 30 días,
 * insignias) — todo derivado de datos que el backend ya expone
 * (`StreakService` + `HistoryService`), sin ningún endpoint nuevo. Pensado
 * para poder colocarse en cualquier pantalla, no solo el reto del día.
 */
@Component({
  selector: 'app-progress-panel',
  imports: [ScreenFrame],
  templateUrl: './progress-panel.html',
  styleUrl: './progress-panel.scss',
})
export class ProgressPanel {
  private readonly streakService = inject(StreakService);
  private readonly historyService = inject(HistoryService);

  protected readonly streak = this.streakService.streak;
  protected readonly attempts = signal<AttemptHistoryEntry[]>([]);

  protected readonly accuracy = computed<number | null>(() => {
    const list = this.attempts();
    if (list.length === 0) {
      return null;
    }
    const correct = list.filter((attempt) => attempt.isCorrect).length;
    return Math.round((correct / list.length) * 100);
  });

  protected readonly heatmap = computed<HeatmapDay[]>(() => {
    const byDate = new Map(this.attempts().map((attempt) => [attempt.dailyChallengeDate, attempt]));
    const days: HeatmapDay[] = [];
    const today = new Date();

    for (let offset = 29; offset >= 0; offset--) {
      const day = new Date(today);
      day.setDate(day.getDate() - offset);
      const iso = day.toISOString().slice(0, 10);
      const attempt = byDate.get(iso);

      days.push({
        date: iso,
        label: day.toLocaleDateString('es', { day: 'numeric', month: 'short' }),
        status: attempt ? (attempt.isCorrect ? 'correct' : 'incorrect') : 'none',
      });
    }

    return days;
  });

  protected readonly badges = computed<Badge[]>(() => {
    const streak = this.streak();
    const correctCount = this.attempts().filter((attempt) => attempt.isCorrect).length;

    return [
      { icon: '🎯', label: 'Primer acierto', unlocked: correctCount >= 1 },
      { icon: '🔥', label: 'Racha de 7 días', unlocked: (streak?.longestStreak ?? 0) >= 7 },
      { icon: '🔥🔥', label: 'Racha de 30 días', unlocked: (streak?.longestStreak ?? 0) >= 30 },
      { icon: '💯', label: '100 puntos', unlocked: (streak?.totalPoints ?? 0) >= 100 },
      { icon: '🚀', label: '500 puntos', unlocked: (streak?.totalPoints ?? 0) >= 500 },
      { icon: '🧠', label: '10 retos resueltos', unlocked: this.attempts().length >= 10 },
    ];
  });

  constructor() {
    this.historyService.getMyHistory().subscribe({
      next: (attempts) => this.attempts.set(attempts),
      error: () => {},
    });
  }
}
