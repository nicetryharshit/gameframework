/** Rounds away float noise, so 0.1 + 0.2 shows as 0.3. */
export const round = (value: number): number => Math.round(value * 1000) / 1000;

export const format = (value: number): string => String(round(value));
