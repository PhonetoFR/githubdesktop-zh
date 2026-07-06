import * as readline from 'readline'

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

export function question(prompt: string): Promise<string> {
  return new Promise(resolve => {
    rl.question(prompt, answer => resolve(answer.trim()))
  })
}

export interface MenuOption {
  label: string
  description?: string
}

export async function menu(title: string, options: MenuOption[]): Promise<number> {
  process.stdout.write(`\n${title}\n`)
  options.forEach((opt, i) => {
    const suffix = opt.description ? `  ${opt.description}` : ''
    process.stdout.write(`  ${i + 1}. ${opt.label}${suffix}\n`)
  })
  while (true) {
    const raw = await question('\n请输入序号: ')
    if (raw === '') continue
    const n = Number.parseInt(raw, 10)
    if (Number.isFinite(n) && n >= 1 && n <= options.length) {
      return n - 1
    }
    process.stdout.write(`无效输入，请输入 1~${options.length} 的数字\n`)
  }
}

export function close(): void {
  rl.close()
}
