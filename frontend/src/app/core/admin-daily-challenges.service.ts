import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import type { paths } from '../generated/api.d.ts';

export type ScheduledDailyChallenge =
  paths['/api/v1/admin/daily-challenges']['get']['responses'][200]['content']['application/json'][number];
type ScheduleRequest =
  paths['/api/v1/admin/daily-challenges']['post']['requestBody']['content']['application/json'];

@Injectable({ providedIn: 'root' })
export class AdminDailyChallengesService {
  private readonly http = inject(HttpClient);

  listScheduled(): Observable<ScheduledDailyChallenge[]> {
    return this.http.get<ScheduledDailyChallenge[]>(`${environment.apiBaseUrl}/admin/daily-challenges`);
  }

  schedule(input: ScheduleRequest): Observable<{ date: string; challengeId: string }> {
    return this.http.post<{ date: string; challengeId: string }>(
      `${environment.apiBaseUrl}/admin/daily-challenges`,
      input,
    );
  }
}
