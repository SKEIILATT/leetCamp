import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import type { paths } from '../generated/api.d.ts';

export type RankingEntry =
  paths['/api/v1/ranking']['get']['responses'][200]['content']['application/json'][number];

@Injectable({ providedIn: 'root' })
export class RankingService {
  private readonly http = inject(HttpClient);

  getRanking(): Observable<RankingEntry[]> {
    return this.http.get<RankingEntry[]>(`${environment.apiBaseUrl}/ranking`);
  }
}
