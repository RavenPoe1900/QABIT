/**
 * Base de los errores de dominio. No saben nada de HTTP ni de códigos de la API: cada
 * adaptador de entrada decide cómo traducirlos (en HTTP, el filtro de cada módulo).
 */
export abstract class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
