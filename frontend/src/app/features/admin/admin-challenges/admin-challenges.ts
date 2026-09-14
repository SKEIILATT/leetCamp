import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';

import { AdminChallenge, AdminChallengesService } from '../../../core/admin-challenges.service';
import { AdminTaxonomyService, Category, Difficulty } from '../../../core/admin-taxonomy.service';
import { ScreenFrame } from '../../screen-frame/screen-frame';

@Component({
  selector: 'app-admin-challenges',
  imports: [ReactiveFormsModule, ScreenFrame],
  templateUrl: './admin-challenges.html',
  styleUrl: './admin-challenges.scss',
})
export class AdminChallenges {
  private readonly fb = inject(FormBuilder);
  private readonly challengesService = inject(AdminChallengesService);
  private readonly taxonomyService = inject(AdminTaxonomyService);

  protected readonly categories = signal<Category[]>([]);
  protected readonly difficulties = signal<Difficulty[]>([]);
  protected readonly challenges = signal<AdminChallenge[]>([]);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly publishingId = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    categoryId: ['', Validators.required],
    difficultyId: ['', Validators.required],
    title: ['', [Validators.required, Validators.maxLength(200)]],
    promptMarkdown: ['', Validators.required],
    codeSnippet: ['', Validators.required],
    expectedAnswer: ['', Validators.required],
  });

  constructor() {
    this.taxonomyService.listCategories().subscribe({ next: (list) => this.categories.set(list), error: () => {} });
    this.taxonomyService.listDifficulties().subscribe({
      next: (list) => this.difficulties.set([...list].sort((a, b) => a.level - b.level)),
      error: () => {},
    });
    this.loadChallenges();
  }

  private loadChallenges(): void {
    this.challengesService.listChallenges().subscribe({
      next: (list) => this.challenges.set([...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt))),
      error: () => {},
    });
  }

  protected categoryName(id: string): string {
    return this.categories().find((c) => c.id === id)?.name ?? '—';
  }

  protected difficultyName(id: string): string {
    return this.difficulties().find((d) => d.id === id)?.name ?? '—';
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.errorMessage.set(null);
    this.saving.set(true);
    this.challengesService.createChallenge(this.form.getRawValue()).subscribe({
      next: () => {
        this.saving.set(false);
        this.form.reset({
          categoryId: '',
          difficultyId: '',
          title: '',
          promptMarkdown: '',
          codeSnippet: '',
          expectedAnswer: '',
        });
        this.loadChallenges();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.errorMessage.set(err.error?.message ?? 'No pudimos crear la pregunta.');
      },
    });
  }

  protected publish(id: string): void {
    this.errorMessage.set(null);
    this.publishingId.set(id);
    this.challengesService.publishChallenge(id).subscribe({
      next: () => {
        this.publishingId.set(null);
        this.loadChallenges();
      },
      error: (err: HttpErrorResponse) => {
        this.publishingId.set(null);
        this.errorMessage.set(err.error?.message ?? 'No pudimos publicar la pregunta.');
      },
    });
  }
}
