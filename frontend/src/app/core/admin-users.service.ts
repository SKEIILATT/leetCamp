import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import type { paths } from '../generated/api.d.ts';

export type AdminUser = paths['/api/v1/admin/users']['get']['responses'][200]['content']['application/json'][number];

@Injectable({ providedIn: 'root' })
export class AdminUsersService {
  private readonly http = inject(HttpClient);

  listUsers(): Observable<AdminUser[]> {
    return this.http.get<AdminUser[]>(`${environment.apiBaseUrl}/admin/users`);
  }

  setActive(id: string, isActive: boolean): Observable<AdminUser> {
    return this.http.patch<AdminUser>(`${environment.apiBaseUrl}/admin/users/${id}/status`, { isActive });
  }
}
