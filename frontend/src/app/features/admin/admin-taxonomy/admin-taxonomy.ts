import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';

import { AdminTaxonomyService, Category, Difficulty } from '../../../core/admin-taxonomy.service';
import { ScreenFrame } from '../../screen-frame/screen-frame';

@Component({
  selector: 'app-admin-taxonomy',
  imports: [ReactiveFormsModule, ScreenFrame],
  templateUrl: './admin-taxonomy.html',
  styleUrl: './admin-taxonomy.scss',
})
export class AdminTaxonomy {
  private readonly fb = inject(FormBuilder);
  private readonly taxonomyService = inject(AdminTaxonomyService);

  protected readonly categories = signal<Category[]>([]);
  protected readonly difficulties = signal<Difficulty[]>([]);
  protected readonly categoryError = signal<string | null>(null);
  protected readonly difficultyError = signal<string | null>(null);
  protected readonly savingCategory = signal(false);
  protected readonly savingDifficulty = signal(false);

  protected readonly categoryForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(80)]],
  });

  protected readonly difficultyForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(80)]],
    level: [1, [Validators.required, Validators.min(1)]],
  });

  constructor() {
    this.loadCategories();
    this.loadDifficulties();
  }

  private loadCategories(): void {
    this.taxonomyService.listCategories().subscribe({
      next: (list) => this.categories.set(list),
      error: () => {},
    });
  }

  private loadDifficulties(): void {
    this.taxonomyService.listDifficulties().subscribe({
      next: (list) => this.difficulties.set([...list].sort((a, b) => a.level - b.level)),
      error: () => {},
    });
  }

  protected submitCategory(): void {
    if (this.categoryForm.invalid) {
      this.categoryForm.markAllAsTouched();
      return;
    }
    this.categoryError.set(null);
    this.savingCategory.set(true);
    this.taxonomyService.createCategory(this.categoryForm.getRawValue()).subscribe({
      next: () => {
        this.savingCategory.set(false);
        this.categoryForm.reset({ name: '' });
        this.loadCategories();
      },
      error: (err: HttpErrorResponse) => {
        this.savingCategory.set(false);
        this.categoryError.set(err.error?.message ?? 'No pudimos crear la categoría.');
      },
    });
  }

  protected submitDifficulty(): void {
    if (this.difficultyForm.invalid) {
      this.difficultyForm.markAllAsTouched();
      return;
    }
    this.difficultyError.set(null);
    this.savingDifficulty.set(true);
    this.taxonomyService.createDifficulty(this.difficultyForm.getRawValue()).subscribe({
      next: () => {
        this.savingDifficulty.set(false);
        this.difficultyForm.reset({ name: '', level: 1 });
        this.loadDifficulties();
      },
      error: (err: HttpErrorResponse) => {
        this.savingDifficulty.set(false);
        this.difficultyError.set(err.error?.message ?? 'No pudimos crear la dificultad.');
      },
    });
  }
}
