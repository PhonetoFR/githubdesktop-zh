import { ApplicationSnapshot } from './application'

export type GuiAction = 'patch' | 'restore'

export interface GuiState extends ApplicationSnapshot {
  toolVersion: string
}

export interface GuiResponse<T> {
  ok: boolean
  data?: T
  error?: string
}

export interface GuiActionResult {
  message: string
  state: GuiState
}

export interface GuiApi {
  getState(): Promise<GuiResponse<GuiState>>
  runAction(action: GuiAction, version: string): Promise<GuiResponse<GuiActionResult>>
  openRepository(): Promise<void>
}
