import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AuthService } from '../../../core/auth.service';
import { AuthBrandPanel } from '../brand-panel/brand-panel';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink, AuthBrandPanel],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly successMessage = signal(
    this.route.snapshot.queryParamMap.has('registered')
      ? 'Cuenta creada. Ya puedes iniciar sesión.'
      : this.route.snapshot.queryParamMap.has('reset')
        ? 'Contraseña actualizada. Ya puedes iniciar sesión.'
        : null,
  );

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  protected get email() {
    return this.form.controls.email;
  }

  protected get password() {
    return this.form.controls.password;
  }

  protected onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.errorMessage.set(null);
    this.submitting.set(true);

    this.authService.login(this.form.getRawValue()).subscribe({
      next: () => {
        this.submitting.set(false);
        // NOT a hardcoded '/reto' — an admin logging in must land on their
        // dashboard, not the student's daily challenge. `landingGuard` on
        // the shell's empty child route is what actually decides per role;
        // routing through '/' is what lets it run.
        this.router.navigateByUrl('/');
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        this.errorMessage.set(err.error?.message ?? 'No pudimos iniciar sesión. Intenta de nuevo.');
      },
    });
  }
}
