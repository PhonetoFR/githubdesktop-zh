import dictJson from '../dict/zh-CN.json'

export type Dict = Record<string, string>

let cached: Dict | null = null

export function loadDict(): Dict {
  if (cached) return cached
  const dict = dictJson as Dict
  validateDict(dict)
  cached = dict
  return dict
}

export function validateDict(dict: Dict): void {
  const keys = new Set<string>()
  for (const [k, v] of Object.entries(dict)) {
    if (!k) throw new Error('字典存在空键')
    if (keys.has(k)) throw new Error(`字典存在重复键: ${k}`)
    keys.add(k)
    if (typeof v !== 'string' || v.length === 0) {
      throw new Error(`字典键 "${k}" 的值无效`)
    }
  }
}

export function dictStats(dict: Dict): { total: number; menu: number; ui: number } {
  return { total: Object.keys(dict).length, menu: 0, ui: 0 }
}
