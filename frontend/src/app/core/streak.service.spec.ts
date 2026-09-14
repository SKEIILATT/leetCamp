import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { environment } from '../../environments/environment';
import { StreakService } from './streak.service';

describe('StreakService', () => {
  let service: StreakService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(StreakService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('starts with no streak loaded', () => {
    expect(service.streak()).toBeNull();
  });

  it('refresh() fetches /me/streak and populates the signal', () => {
    service.refresh();

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/me/streak`);
    expect(req.request.method).toBe('GET');
    req.flush({ currentStreak: 3, longestStreak: 5, lastAttemptDate: '2026-09-13', totalPoints: 40 });

    expect(service.streak()).toEqual({
      currentStreak: 3,
      longestStreak: 5,
      lastAttemptDate: '2026-09-13',
      totalPoints: 40,
    });
  });

  it('refresh() leaves the signal untouched when the request fails', () => {
    service.refresh();

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/me/streak`);
    req.flush('boom', { status: 500, statusText: 'Server Error' });

    expect(service.streak()).toBeNull();
  });

  it('applyAttemptResult() updates the counters and preserves the previous lastAttemptDate', () => {
    service.refresh();
    httpMock
      .expectOne(`${environment.apiBaseUrl}/me/streak`)
      .flush({ currentStreak: 1, longestStreak: 1, lastAttemptDate: '2026-09-12', totalPoints: 10 });

    service.applyAttemptResult({ currentStreak: 2, longestStreak: 2, totalPoints: 25 });

    expect(service.streak()).toEqual({
      currentStreak: 2,
      longestStreak: 2,
      lastAttemptDate: '2026-09-12',
      totalPoints: 25,
    });
  });

  it('applyAttemptResult() defaults lastAttemptDate to null when nothing was loaded yet', () => {
    service.applyAttemptResult({ currentStreak: 1, longestStreak: 1, totalPoints: 10 });

    expect(service.streak()?.lastAttemptDate).toBeNull();
  });
});
