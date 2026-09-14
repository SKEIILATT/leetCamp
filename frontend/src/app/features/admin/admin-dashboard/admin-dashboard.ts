import { Component, computed, inject, signal } from '@angular/core';
import { forkJoin } from 'rxjs';

import { AdminChallenge, AdminChallengesService } from '../../../core/admin-challenges.service';
import { AdminDailyChallengesService, ScheduledDailyChallenge } from '../../../core/admin-daily-challenges.service';
import { AdminTaxonomyService } from '../../../core/admin-taxonomy.service';
import { AdminUser, AdminUsersService } from '../../../core/admin-users.service';
import { RankingEntry, RankingService } from '../../../core/ranking.service';
import { ScreenFrame } from '../../screen-frame/screen-frame';

type ViewState = 'loading' | 'error' | 'ready';

/**
 * Dashboard del ADMIN — vista general de toda la plataforma, no del propio
 * progreso (eso es `ProgressPanel`, para estudiantes). Todo calculado a
 * partir de endpoints admin ya existentes; ninguno nuevo.
 */
@Component({
  selector: 'app-admin-dashboard',
  imports: [ScreenFrame],
  templateUrl: './admin-dashboard.html',
  styleUrl: './admin-dashboard.scss',
})
export class AdminDashboard {
  private readonly usersService = inject(AdminUsersService);
  private readonly challengesService = inject(AdminChallengesService);
  private readonly dailyService = inject(AdminDailyChallengesService);
  private readonly taxonomyService = inject(AdminTaxonomyService);
  private readonly rankingService = inject(RankingService);

  protected readonly state = signal<ViewState>('loading');

  protected readonly users = signal<AdminUser[]>([]);
  protected readonly challenges = signal<AdminChallenge[]>([]);
  protected readonly scheduled = signal<ScheduledDailyChallenge[]>([]);
  protected readonly categoriesCount = signal(0);
  protected readonly difficultiesCount = signal(0);
  protected readonly ranking = signal<RankingEntry[]>([]);

  protected readonly students = computed(() => this.users().filter((u) => u.roleId === 2));
  protected readonly activeStudents = computed(() => this.students().filter((u) => u.isActive).length);

  protected readonly draftCount = computed(() => this.challenges().filter((c) => c.status === 'draft').length);
  protected readonly publishedCount = computed(
    () => this.challenges().filter((c) => c.status === 'published').length,
  );

  protected readonly todayScheduled = computed(() => {
    const today = new Date().toISOString().slice(0, 10);
    return this.scheduled().some((entry) => entry.date === today);
  });

  protected readonly participationRate = computed(() => {
    const totalStudents = this.students().length;
    return totalStudents === 0 ? 0 : Math.round((this.ranking().length / totalStudents) * 100);
  });

  protected readonly avgPoints = computed(() => {
    const list = this.ranking();
    if (list.length === 0) {
      return 0;
    }
    return Math.round(list.reduce((sum, entry) => sum + entry.totalPoints, 0) / list.length);
  });

  protected readonly avgStreak = computed(() => {
    const list = this.ranking();
    if (list.length === 0) {
      return 0;
    }
    return Math.round((list.reduce((sum, entry) => sum + entry.currentStreak, 0) / list.length) * 10) / 10;
  });

  protected readonly topFive = computed(() => this.ranking().slice(0, 5));

  constructor() {
    forkJoin({
      users: this.usersService.listUsers(),
      challenges: this.challengesService.listChallenges(),
      scheduled: this.dailyService.listScheduled(),
      categories: this.taxonomyService.listCategories(),
      difficulties: this.taxonomyService.listDifficulties(),
      ranking: this.rankingService.getRanking(),
    }).subscribe({
      next: (data) => {
        this.users.set(data.users);
        this.challenges.set(data.challenges);
        this.scheduled.set(data.scheduled);
        this.categoriesCount.set(data.categories.length);
        this.difficultiesCount.set(data.difficulties.length);
        this.ranking.set(data.ranking);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
