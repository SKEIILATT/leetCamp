import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';

import { StreakService } from '../../core/streak.service';
import { TodayChallengeService } from '../../core/today-challenge.service';
import type { paths } from '../../generated/api.d.ts';

type TodayChallenge = paths['/api/v1/daily-challenge']['get']['responses'][200]['content']['application/json'];
type SubmitAttemptResponse = paths['/api/v1/attempts']['post']['responses'][201]['content']['application/json'];

type ViewState = 'loading' | 'no-challenge' | 'ready' | 'result';

@Component({
  selector: 'app-daily-challenge',
  imports: [ReactiveFormsModule],
  templateUrl: './daily-challenge.html',
  styleUrl: './daily-challenge.scss',
})
export class DailyChallenge {
  private readonly fb = inject(FormBuilder);
  private readonly challengeService = inject(TodayChallengeService);
  private readonly streakService = inject(StreakService);

  protected readonly state = signal<ViewState>('loading');
  protected readonly challenge = signal<TodayChallenge | null>(null);
  protected readonly result = signal<SubmitAttemptResponse | null>(null);
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    answer: ['', [Validators.required, Validators.maxLength(2000)]],
  });

  constructor() {
    this.challengeService.getToday().subscribe({
      next: (challenge) => {
        this.challenge.set(challenge);
        this.state.set('ready');
      },
      error: (err: HttpErrorResponse) => {
        if (err.status !== 404) {
          this.errorMessage.set('No pudimos cargar el reto de hoy. Intenta de nuevo más tarde.');
        }
        this.state.set('no-challenge');
      },
    });
  }

  protected onSubmit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.errorMessage.set(null);
    this.submitting.set(true);

    this.challengeService.submitAnswer(this.form.getRawValue()).subscribe({
      next: (response) => {
        this.submitting.set(false);
        this.result.set(response);
        this.state.set('result');
        this.streakService.applyAttemptResult(response);
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        if (err.status === 409) {
          this.errorMessage.set('Ya enviaste tu respuesta de hoy. Vuelve mañana.');
        } else if (err.status === 404) {
          this.state.set('no-challenge');
        } else {
          this.errorMessage.set(err.error?.message ?? 'No pudimos enviar tu respuesta. Intenta de nuevo.');
        }
      },
    });
  }
}
