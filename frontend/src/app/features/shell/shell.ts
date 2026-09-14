import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from '../../core/auth.service';
import { MeService } from '../../core/me.service';
import { StreakService } from '../../core/streak.service';

@Component({
  selector: 'app-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  private readonly authService = inject(AuthService);
  private readonly meService = inject(MeService);
  private readonly router = inject(Router);

  protected readonly streakService = inject(StreakService);
  protected readonly isAdmin = signal(false);

  constructor() {
    this.streakService.refresh();
    this.meService.getMe().subscribe({
      next: (me) => this.isAdmin.set(me.role === 'admin'),
      error: () => {},
    });
  }

  protected logout(): void {
    this.authService.logout();
    this.router.navigateByUrl('/login');
  }
}
