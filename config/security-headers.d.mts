export function securityHeaders(env?: Record<string, string | undefined>): { key: string; value: string }[];
export function headerRules(env?: Record<string, string | undefined>): { source: string; headers: { key: string; value: string }[] }[];
