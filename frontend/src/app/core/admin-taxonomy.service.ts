import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import type { paths } from '../generated/api.d.ts';

export type Category = paths['/api/v1/admin/categories']['get']['responses'][200]['content']['application/json'][number];
export type Difficulty =
  paths['/api/v1/admin/difficulties']['get']['responses'][200]['content']['application/json'][number];

type CreateCategoryRequest =
  paths['/api/v1/admin/categories']['post']['requestBody']['content']['application/json'];
type CreateDifficultyRequest =
  paths['/api/v1/admin/difficulties']['post']['requestBody']['content']['application/json'];

@Injectable({ providedIn: 'root' })
export class AdminTaxonomyService {
  private readonly http = inject(HttpClient);

  listCategories(): Observable<Category[]> {
    return this.http.get<Category[]>(`${environment.apiBaseUrl}/admin/categories`);
  }

  createCategory(input: CreateCategoryRequest): Observable<{ categoryId: string }> {
    return this.http.post<{ categoryId: string }>(`${environment.apiBaseUrl}/admin/categories`, input);
  }

  listDifficulties(): Observable<Difficulty[]> {
    return this.http.get<Difficulty[]>(`${environment.apiBaseUrl}/admin/difficulties`);
  }

  createDifficulty(input: CreateDifficultyRequest): Observable<{ difficultyId: string }> {
    return this.http.post<{ difficultyId: string }>(`${environment.apiBaseUrl}/admin/difficulties`, input);
  }
}
