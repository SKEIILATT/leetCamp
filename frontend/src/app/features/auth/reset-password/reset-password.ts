import { Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AuthService } from '../../../core/auth.service';
import { AuthBrandPanel } from '../brand-panel/brand-panel';

function passwordsMatchValidator(control: AbstractControl): ValidationErrors | null {
  const password = control.get('password')?.value;
  const confirmPassword = control.get('confirmPassword')?.value;
  return password === confirmPassword ? null : { passwordsMismatch: true };
}

@Component({
  selector: 'app-reset-password',
  imports: [ReactiveFormsModule, RouterLink, AuthBrandPanel],
  templateUrl: './reset-password.html',
  styleUrl: './reset-password.scss',
})
export class ResetPassword {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  private readonly token = this.route.snapshot.queryParamMap.get('token');

  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(
    this.token ? null : 'Este enlace no es válido. Solicita uno nuevo.',
  );

  protected readonly form = this.fb.nonNullable.group(
    {
      password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(128)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: passwordsMatchValidator },
  );

  protected get password() {
    return this.form.controls.password;
  }

  protected get confirmPassword() {
    return this.form.controls.confirmPassword;
  }

  protected onSubmit(): void {
    if (!this.token) {
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.errorMessage.set(null);
    this.submitting.set(true);

    this.authService.resetPassword({ token: this.token, newPassword: this.form.getRawValue().password }).subscribe({
      next: () => {
        this.submitting.set(false);
        this.router.navigateByUrl('/login?reset=1');
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        this.errorMessage.set(
          err.error?.message ?? 'No pudimos actualizar tu contraseña. Solicita un enlace nuevo.',
        );
      },
    });
  }
}
