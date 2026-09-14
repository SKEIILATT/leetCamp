import { Component, input } from '@angular/core';

/**
 * Marco compartido de "pantalla completa" (barra superior tipo editor +
 * cuerpo que llena el alto disponible) reusado por todas las pantallas
 * post-login — evita repetir el chrome cuatro veces y mantiene un solo
 * lenguaje visual: nada de cards flotando en espacio vacío.
 */
@Component({
  selector: 'app-screen-frame',
  imports: [],
  templateUrl: './screen-frame.html',
  styleUrl: './screen-frame.scss',
})
export class ScreenFrame {
  readonly filename = input('reto.ts');
}
