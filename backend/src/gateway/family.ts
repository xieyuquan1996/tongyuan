// Classify an Anthropic model id into an Anthropic rate-limit family.
// Anthropic publishes RPM/ITPM/OTPM budgets per family (Opus / Sonnet / Haiku),
// not per exact model id, so we collapse ids that share a budget.
export type Family = 'opus' | 'sonnet' | 'haiku'

export function familyOf(modelId: string): Family {
  const id = modelId.toLowerCase()
  if (id.includes('opus')) return 'opus'
  if (id.includes('haiku')) return 'haiku'
  return 'sonnet'
}

// Published defaults (claude.ai Active tier, April 2026). Exposed as a mutable
// object so admins can override from settings without code changes.
export type FamilyBudget = {
  rpm: number
  itpmExclCache: number
  otpm: number
}

export const DEFAULT_BUDGETS: Record<Family, FamilyBudget> = {
  opus:   { rpm: 50, itpmExclCache: 30_000, otpm: 8_000 },
  sonnet: { rpm: 50, itpmExclCache: 30_000, otpm: 8_000 },
  haiku:  { rpm: 50, itpmExclCache: 50_000, otpm: 10_000 },
}
