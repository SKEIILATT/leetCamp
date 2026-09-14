import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import type { paths } from '../generated/api.d.ts';

export type AdminChallenge =
  paths['/api/v1/admin/challenges']['get']['responses'][200]['content']['application/json'][number];
type CreateChallengeRequest =
  paths['/api/v1/admin/challenges']['post']['requestBody']['content']['application/json'];

@Injectable({ providedIn: 'root' })
export class AdminChallengesService {
  private readonly http = inject(HttpClient);

  listChallenges(status?: 'draft' | 'published'): Observable<AdminChallenge[]> {
    const url = `${environment.apiBaseUrl}/admin/challenges`;
    return this.http.get<AdminChallenge[]>(status ? `${url}?status=${status}` : url);
  }

  createChallenge(input: CreateChallengeRequest): Observable<{ challengeId: string }> {
    return this.http.post<{ challengeId: string }>(`${environment.apiBaseUrl}/admin/challenges`, input);
  }

  publishChallenge(id: string): Observable<{ challengeId: string; status: 'published' }> {
    return this.http.post<{ challengeId: string; status: 'published' }>(
      `${environment.apiBaseUrl}/admin/challenges/${id}/publish`,
      {},
    );
  }
}
