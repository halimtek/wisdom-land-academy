type Dated = { eventDate?: Date | null; createdAt: Date };
export function newsDate(item: Dated): Date;
export function sortNews<T extends Dated & { updatedAt: Date }>(items: T[]): T[];
export function readingMinutes(...texts: (string | null | undefined)[]): number;
export function paragraphs(body: string | null | undefined): string[];
export function excerpt(summary: string | null | undefined, body: string | null | undefined, max?: number): string;
