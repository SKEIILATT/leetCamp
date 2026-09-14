import { Component, computed, inject, signal } from '@angular/core';
import { forkJoin } from 'rxjs';

import { MeService } from '../../core/me.service';
import { RankingEntry, RankingService } from '../../core/ranking.service';
import { ScreenFrame } from '../screen-frame/screen-frame';

type ViewState = 'loading' | 'error' | 'empty' | 'ready';

@Component({
  selector: 'app-ranking',
  imports: [ScreenFrame],
  templateUrl: './ranking.html',
  styleUrl: './ranking.scss',
})
export class Ranking {
  private readonly rankingService = inject(RankingService);
  private readonly meService = inject(MeService);

  protected readonly state = signal<ViewState>('loading');
  protected readonly entries = signal<RankingEntry[]>([]);
  protected readonly myUserId = signal<string | null>(null);

  protected readonly podium = computed(() => this.entries().slice(0, 3));
  protected readonly rest = computed(() => this.entries().slice(3));

  constructor() {
    forkJoin({
      ranking: this.rankingService.getRanking(),
      me: this.meService.getMe(),
    }).subscribe({
      next: ({ ranking, me }) => {
        this.entries.set(ranking);
        this.myUserId.set(me.userId);
        this.state.set(ranking.length > 0 ? 'ready' : 'empty');
      },
      error: () => this.state.set('error'),
    });
  }
}
