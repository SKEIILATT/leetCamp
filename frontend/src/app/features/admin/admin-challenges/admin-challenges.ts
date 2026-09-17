import { Component, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';

import { AdminChallenge, AdminChallengesService } from '../../../core/admin-challenges.service';
import { AdminTaxonomyService, Category, Difficulty } from '../../../core/admin-taxonomy.service';
import { CodeEditor, type CodeLanguage } from '../../code-editor/code-editor';
import { ScreenFrame } from '../../screen-frame/screen-frame';

const LANGUAGES: readonly CodeLanguage[] = ['javascript', 'python', 'sql'];

@Component({
  selector: 'app-admin-challenges',
  imports: [ReactiveFormsModule, ScreenFrame, CodeEditor],
  templateUrl: './admin-challenges.html',
  styleUrl: './admin-challenges.scss',
})
export class AdminChallenges {
  private readonly fb = inject(FormBuilder);
  private readonly challengesService = inject(AdminChallengesService);
  private readonly taxonomyService = inject(AdminTaxonomyService);

  protected readonly languages = LANGUAGES;
  protected readonly categories = signal<Category[]>([]);
  protected readonly difficulties = signal<Difficulty[]>([]);
  protected readonly challenges = signal<AdminChallenge[]>([]);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly publishingId = signal<string | null>(null);
  protected readonly type = signal<'prediction' | 'code'>('prediction');
  /** The challenge currently being edited (a draft, via PATCH) — `null` means
   * the form is creating a new one. */
  protected readonly editingId = signal<string | null>(null);

  /** Fields shared by both challenge types. */
  protected readonly form = this.fb.nonNullable.group({
    categoryId: ['', Validators.required],
    difficultyId: ['', Validators.required],
    title: ['', [Validators.required, Validators.maxLength(200)]],
    promptMarkdown: ['', Validators.required],
  });

  protected readonly predictionForm = this.fb.nonNullable.group({
    codeSnippet: ['', Validators.required],
    expectedAnswer: ['', Validators.required],
  });

  protected readonly codeForm = this.fb.nonNullable.group({
    starterCode: ['', Validators.required],
    language: this.fb.nonNullable.control<CodeLanguage>('javascript', Validators.required),
    testCases: this.fb.array([this.newTestCaseGroup()]),
  });

  protected get testCases(): FormArray {
    return this.codeForm.get('testCases') as FormArray;
  }

  constructor() {
    this.taxonomyService.listCategories().subscribe({ next: (list) => this.categories.set(list), error: () => {} });
    this.taxonomyService.listDifficulties().subscribe({
      next: (list) => this.difficulties.set([...list].sort((a, b) => a.level - b.level)),
      error: () => {},
    });
    this.loadChallenges();
  }

  private newTestCaseGroup(input = '', expectedOutput = '', isHidden = false) {
    return this.fb.nonNullable.group({
      input: [input, Validators.required],
      expectedOutput: [expectedOutput, Validators.required],
      isHidden: [isHidden],
    });
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

  protected setType(type: 'prediction' | 'code'): void {
    this.type.set(type);
  }

  protected addTestCase(): void {
    this.testCases.push(this.newTestCaseGroup());
  }

  protected removeTestCase(index: number): void {
    if (this.testCases.length > 1) this.testCases.removeAt(index);
  }

  /** Loads a draft into the form so it can be re-submitted as an edit
   * (`PATCH`) instead of a new challenge. Only ever called for a `draft` —
   * the template hides this action once a challenge is published. */
  protected startEdit(challenge: AdminChallenge): void {
    this.errorMessage.set(null);
    this.editingId.set(challenge.id);
    this.type.set(challenge.type);
    this.form.patchValue({
      categoryId: challenge.categoryId,
      difficultyId: challenge.difficultyId,
      title: challenge.title,
      promptMarkdown: challenge.promptMarkdown,
    });
    if (challenge.type === 'prediction') {
      this.predictionForm.patchValue({ codeSnippet: challenge.codeSnippet, expectedAnswer: challenge.expectedAnswer });
    } else {
      this.codeForm.patchValue({ starterCode: challenge.starterCode, language: challenge.language });
      this.testCases.clear();
      for (const testCase of challenge.testCases) {
        this.testCases.push(this.newTestCaseGroup(testCase.input, testCase.expectedOutput, testCase.isHidden));
      }
    }
  }

  protected cancelEdit(): void {
    this.resetForms();
  }

  protected submit(): void {
    const typeForm = this.type() === 'prediction' ? this.predictionForm : this.codeForm;
    if (this.form.invalid || typeForm.invalid) {
      this.form.markAllAsTouched();
      typeForm.markAllAsTouched();
      return;
    }

    this.errorMessage.set(null);
    this.saving.set(true);

    const common = this.form.getRawValue();
    const payload =
      this.type() === 'prediction'
        ? { ...common, type: 'prediction' as const, ...this.predictionForm.getRawValue() }
        : { ...common, type: 'code' as const, ...this.codeForm.getRawValue() };

    const editingId = this.editingId();
    const request = editingId !== null
      ? this.challengesService.updateDraftChallenge(editingId, payload)
      : this.challengesService.createChallenge(payload);

    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.resetForms();
        this.loadChallenges();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.errorMessage.set(err.error?.message ?? 'No pudimos guardar la pregunta.');
      },
    });
  }

  private resetForms(): void {
    this.form.reset({ categoryId: '', difficultyId: '', title: '', promptMarkdown: '' });
    this.predictionForm.reset({ codeSnippet: '', expectedAnswer: '' });
    this.codeForm.reset({ starterCode: '', language: 'javascript' });
    this.testCases.clear();
    this.testCases.push(this.newTestCaseGroup());
    this.type.set('prediction');
    this.editingId.set(null);
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
