import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import type { paths } from '../generated/api.d.ts';

type TodayChallenge = paths['/api/v1/daily-challenge']['get']['responses'][200]['content']['application/json'];
type SubmitAttemptRequest = paths['/api/v1/attempts']['post']['requestBody']['content']['application/json'];
type SubmitAttemptResponse = paths['/api/v1/attempts']['post']['responses'][201]['content']['application/json'];

@Injectable({ providedIn: 'root' })
export class TodayChallengeService {
  private readonly http = inject(HttpClient);

  getToday(): Observable<TodayChallenge> {
    return this.http.get<TodayChallenge>(`${environment.apiBaseUrl}/daily-challenge`);
  }

  submitAnswer(input: SubmitAttemptRequest): Observable<SubmitAttemptResponse> {
    return this.http.post<SubmitAttemptResponse>(`${environment.apiBaseUrl}/attempts`, input);
  }
}
