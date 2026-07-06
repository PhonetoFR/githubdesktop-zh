const RESET = '\x1b[0m'
const CYAN = '\x1b[36m'
const YELLOW = '\x1b[33m'
const RED = '\x1b[31m'
const GREEN = '\x1b[32m'
const DIM = '\x1b[2m'

function ts(): string {
  return new Date().toISOString().slice(11, 19)
}

export function info(msg: string): void {
  process.stdout.write(`${DIM}[${ts()}]${RESET} ${CYAN}info${RESET} ${msg}\n`)
}

export function success(msg: string): void {
  process.stdout.write(`${DIM}[${ts()}]${RESET} ${GREEN}ok  ${RESET} ${msg}\n`)
}

export function warn(msg: string): void {
  process.stdout.write(`${DIM}[${ts()}]${RESET} ${YELLOW}warn${RESET} ${msg}\n`)
}

export function error(msg: string): void {
  process.stderr.write(`${DIM}[${ts()}]${RESET} ${RED}err ${RESET} ${msg}\n`)
}

export function blank(): void {
  process.stdout.write('\n')
}
