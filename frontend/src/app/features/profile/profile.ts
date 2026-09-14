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
    const email = this.me()?.email;
    if (!email) {
      return '?';
    }
    const local = email.split('@')[0];
    return local.slice(0, 2).toUpperCase();
  });

  constructor() {
    this.meService.getMe().subscribe({
      next: (me) => this.me.set(me),
      error: () => {},
    });
  }
}
