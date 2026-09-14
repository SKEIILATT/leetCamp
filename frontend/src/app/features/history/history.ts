import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';

import { AttemptHistoryEntry, HistoryService } from '../../core/history.service';
import { ScreenFrame } from '../screen-frame/screen-frame';

type ViewState = 'loading' | 'error' | 'empty' | 'ready';

@Component({
  selector: 'app-history',
  imports: [DatePipe, ScreenFrame],
  templateUrl: './history.html',
  styleUrl: './history.scss',
})
export class History {
  private readonly historyService = inject(HistoryService);

  protected readonly state = signal<ViewState>('loading');
  protected readonly attempts = signal<AttemptHistoryEntry[]>([]);

  protected readonly correctCount = computed(
    () => this.attempts().filter((attempt) => attempt.isCorrect).length,
  );

  protected readonly accuracy = computed<number | null>(() => {
    const total = this.attempts().length;
    return total === 0 ? null : Math.round((this.correctCount() / total) * 100);
  });

  constructor() {
    this.historyService.getMyHistory().subscribe({
      next: (attempts) => {
        this.attempts.set(attempts);
        this.state.set(attempts.length > 0 ? 'ready' : 'empty');
      },
      error: () => this.state.set('error'),
    });
  }

  protected formatDuration(seconds: number): string {
    if (seconds < 60) {
      return `${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }
}
