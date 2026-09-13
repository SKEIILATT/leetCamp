import { Component, input } from '@angular/core';

@Component({
  selector: 'app-auth-brand-panel',
  imports: [],
  templateUrl: './brand-panel.html',
  styleUrl: './brand-panel.scss',
})
export class AuthBrandPanel {
  readonly tag = input('Reto diario');
}
