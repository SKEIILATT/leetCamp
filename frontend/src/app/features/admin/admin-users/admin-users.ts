import { Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';

import { AdminUser, AdminUsersService } from '../../../core/admin-users.service';
import { ScreenFrame } from '../../screen-frame/screen-frame';

const ROLE_NAMES: Record<number, string> = { 1: 'Admin', 2: 'Estudiante' };

type ViewState = 'loading' | 'error' | 'ready';

@Component({
  selector: 'app-admin-users',
  imports: [ScreenFrame],
  templateUrl: './admin-users.html',
  styleUrl: './admin-users.scss',
})
export class AdminUsers {
  private readonly usersService = inject(AdminUsersService);

  protected readonly users = signal<AdminUser[]>([]);
  protected readonly state = signal<ViewState>('loading');
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly updatingId = signal<string | null>(null);

  constructor() {
    this.load();
  }

  private load(): void {
    this.usersService.listUsers().subscribe({
      next: (list) => {
        this.users.set(list);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }

  protected roleName(roleId: number): string {
    return ROLE_NAMES[roleId] ?? 'Desconocido';
  }

  protected toggleActive(user: AdminUser): void {
    this.errorMessage.set(null);
    this.updatingId.set(user.id);
    this.usersService.setActive(user.id, !user.isActive).subscribe({
      next: (updated) => {
        this.updatingId.set(null);
        this.users.set(this.users().map((u) => (u.id === updated.id ? updated : u)));
      },
      error: (err: HttpErrorResponse) => {
        this.updatingId.set(null);
        this.errorMessage.set(err.error?.message ?? 'No pudimos actualizar el estado de esta cuenta.');
      },
    });
  }
}
