// Validaciones compartidas entre cliente y servidor.

// Letras (con tildes/ñ), espacios, apóstrofos, puntos y guiones — para
// nombres de personas. No permite números ni otros símbolos.
const NAME_RE = /^[\p{L}\p{M}\s'.-]+$/u;

export function isValidVisitorName(value: string): boolean {
  return NAME_RE.test(value.trim());
}

// Filtra en tiempo real los caracteres no permitidos en un nombre, para
// usarlo directamente en el onChange de un input y evitar que el usuario
// pueda siquiera escribir un número.
export function sanitizeVisitorNameInput(value: string): string {
  return value.replace(/[^\p{L}\p{M}\s'.-]/gu, "");
}