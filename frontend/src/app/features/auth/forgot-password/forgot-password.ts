import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../../core/auth.service';
import { AuthBrandPanel } from '../brand-panel/brand-panel';

@Component({
  selector: 'app-forgot-password',
  imports: [ReactiveFormsModule, RouterLink, AuthBrandPanel],
  templateUrl: './forgot-password.html',
  styleUrl: './forgot-password.scss',
})
export class ForgotPassword {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);

  protected readonly submitting = signal(false);
  protected readonly sent = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  protected get email() {
    return this.form.controls.email;
  }

  protected onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.errorMessage.set(null);
    this.submitting.set(true);

    this.authService.requestPasswordReset(this.form.getRawValue()).subscribe({
      // The backend always answers 200 here, registered email or not — see
      // requestPasswordReset's doc comment (anti-enumeration). The frontend
      // shows the same confirmation either way; only a REAL failure (network,
      // 500) falls through to the error branch below.
      next: () => {
        this.submitting.set(false);
        this.sent.set(true);
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        this.errorMessage.set(err.error?.message ?? 'No pudimos procesar tu solicitud. Intenta de nuevo.');
      },
    });
  }
}
