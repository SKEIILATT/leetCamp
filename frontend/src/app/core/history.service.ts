import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import type { paths } from '../generated/api.d.ts';

export type AttemptHistoryEntry =
  paths['/api/v1/me/attempts']['get']['responses'][200]['content']['application/json'][number];

@Injectable({ providedIn: 'root' })
export class HistoryService {
  private readonly http = inject(HttpClient);

  getMyHistory(): Observable<AttemptHistoryEntry[]> {
    return this.http.get<AttemptHistoryEntry[]>(`${environment.apiBaseUrl}/me/attempts`);
  }
}
