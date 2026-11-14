/** Reloj inyectable: permite fijar la hora en los tests y no depender de `new Date()`. */
export interface Clock {
  now(): Date;
}

export const CLOCK = Symbol('CLOCK');

export const systemClock: Clock = {
  now: () => new Date(),
};
