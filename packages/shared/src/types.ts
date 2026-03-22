export type Cents = number & { readonly __brand: 'Cents' };

export function toCents(dollars: number): Cents {
  return Math.round(dollars * 100) as Cents;
}
