import { Component } from '@angular/core';

import { ProgressPanel } from '../progress-panel/progress-panel';

@Component({
  selector: 'app-dashboard',
  imports: [ProgressPanel],
  template: '<app-progress-panel />',
  styles: [':host { display: block; height: 100%; }'],
})
export class Dashboard {}
