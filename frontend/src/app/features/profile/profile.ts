import { Component, computed, inject, signal } from '@angular/core';

import { Me, MeService } from '../../core/me.service';
import { ScreenFrame } from '../screen-frame/screen-frame';

@Component({
  selector: 'app-profile',
  imports: [ScreenFrame],
  templateUrl: './profile.html',
  styleUrl: './profile.scss',
})
export class Profile {
  private readonly meService = inject(MeService);

  protected readonly me = signal<Me | null>(null);

  protected readonly initials = computed(() => {
    const name = this.me()?.displayName;
    if (!name) {
      return '?';
    }
    const parts = name.trim().split(/\s+/);
    const first = parts[0]?.[0] ?? '';
    const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
    return (first + last).toUpperCase();
  });

  constructor() {
    this.meService.getMe().subscribe({
      next: (me) => this.me.set(me),
      error: () => {},
    });
  }
}
