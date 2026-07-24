import { contextBridge, ipcRenderer } from 'electron'
import { GuiAction, GuiApi } from './gui-contract'

const api: GuiApi = {
  getState: () => ipcRenderer.invoke('app:get-state'),
  runAction: (action: GuiAction, version: string) =>
    ipcRenderer.invoke('app:run-action', action, version),
  openRepository: () => ipcRenderer.invoke('app:open-repository'),
}

contextBridge.exposeInMainWorld('zhPatch', api)
