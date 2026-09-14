import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';

import { AdminChallenge, AdminChallengesService } from '../../../core/admin-challenges.service';
import { AdminDailyChallengesService, ScheduledDailyChallenge } from '../../../core/admin-daily-challenges.service';
import { ScreenFrame } from '../../screen-frame/screen-frame';

@Component({
  selector: 'app-admin-schedule',
  imports: [ReactiveFormsModule, ScreenFrame],
  templateUrl: './admin-schedule.html',
  styleUrl: './admin-schedule.scss',
})
export class AdminSchedule {
  private readonly fb = inject(FormBuilder);
  private readonly dailyService = inject(AdminDailyChallengesService);
  private readonly challengesService = inject(AdminChallengesService);

  protected readonly publishedChallenges = signal<AdminChallenge[]>([]);
  protected readonly allChallenges = signal<AdminChallenge[]>([]);
  protected readonly scheduled = signal<ScheduledDailyChallenge[]>([]);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly saving = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    date: [new Date().toISOString().slice(0, 10), Validators.required],
    challengeId: ['', Validators.required],
  });

  constructor() {
    this.challengesService.listChallenges('published').subscribe({
      next: (list) => this.publishedChallenges.set(list),
      error: () => {},
    });
    this.challengesService.listChallenges().subscribe({
      next: (list) => this.allChallenges.set(list),
      error: () => {},
    });
    this.loadScheduled();
  }

  private loadScheduled(): void {
    this.dailyService.listScheduled().subscribe({
      next: (list) => this.scheduled.set([...list].sort((a, b) => b.date.localeCompare(a.date))),
      error: () => {},
    });
  }

  protected challengeTitle(id: string): string {
    return this.allChallenges().find((c) => c.id === id)?.title ?? id;
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.errorMessage.set(null);
    this.saving.set(true);
    this.dailyService.schedule(this.form.getRawValue()).subscribe({
      next: () => {
        this.saving.set(false);
        this.form.patchValue({ challengeId: '' });
        this.loadScheduled();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.errorMessage.set(err.error?.message ?? 'No pudimos programar el reto.');
      },
    });
  }
}
