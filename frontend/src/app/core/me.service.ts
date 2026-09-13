import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import type { paths } from '../generated/api.d.ts';

export type Me = paths['/api/v1/me']['get']['responses'][200]['content']['application/json'];

@Injectable({ providedIn: 'root' })
export class MeService {
  private readonly http = inject(HttpClient);

  getMe(): Observable<Me> {
    return this.http.get<Me>(`${environment.apiBaseUrl}/me`);
  }
}
