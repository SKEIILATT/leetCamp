import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import type { paths } from '../generated/api.d.ts';

type StreakResponse = paths['/api/v1/me/streak']['get']['responses'][200]['content']['application/json'];

@Injectable({ providedIn: 'root' })
export class StreakService {
  private readonly http = inject(HttpClient);

  getMyStreak(): Observable<StreakResponse> {
    return this.http.get<StreakResponse>(`${environment.apiBaseUrl}/me/streak`);
  }
}
