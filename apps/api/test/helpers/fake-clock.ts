import type { Clock } from '../../src/shared-kernel/clock';

/** Reloj controlable: los tests de fechas no dependen de que dos operaciones caigan en milisegundos distintos. */
export class FakeClock implements Clock {
  constructor(private current: Date) {}

  now(): Date {
    return new Date(this.current);
  }

  set(date: Date): void {
    this.current = date;
  }
}
