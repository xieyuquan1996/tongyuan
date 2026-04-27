import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const configPath = resolve(here, '../../config/public.json')

// Read once on import. No hot reload — restart the server to pick up changes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const publicConfig: Record<string, any> = JSON.parse(readFileSync(configPath, 'utf-8'))
