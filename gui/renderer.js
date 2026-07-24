'use strict'

const elements = {
  toolVersion: document.getElementById('tool-version'),
  processTitle: document.getElementById('process-title'),
  processDescription: document.getElementById('process-description'),
  processIndicator: document.getElementById('process-indicator'),
  processLabel: document.getElementById('process-label'),
  versionSelect: document.getElementById('version-select'),
  patchStatus: document.getElementById('patch-status'),
  backupStatus: document.getElementById('backup-status'),
  refreshButton: document.getElementById('refresh-button'),
  patchButton: document.getElementById('patch-button'),
  restoreButton: document.getElementById('restore-button'),
  actionHint: document.getElementById('action-hint'),
  notice: document.getElementById('notice'),
  noticeText: document.getElementById('notice-text'),
  operationPanel: document.getElementById('operation-panel'),
  repositoryButton: document.getElementById('repository-button'),
}

const view = {
  snapshot: null,
  selectedVersion: null,
  busy: false,
  activity: null,
}

const stateLabels = {
  none: '未汉化',
  patched: '已汉化',
  restored: '已还原',
  broken: '状态异常',
}

function selectedInstall() {
  if (!view.snapshot || !view.selectedVersion) return null
  return view.snapshot.installs.find(install => install.version === view.selectedVersion) || null
}

function setNotice(message, tone = 'info') {
  if (!message) {
    elements.notice.className = 'notice hidden'
    elements.noticeText.textContent = ''
    return
  }
  elements.notice.setAttribute('role', tone === 'error' ? 'alert' : 'status')
  elements.notice.setAttribute('aria-live', tone === 'error' ? 'assertive' : 'polite')
  elements.notice.className = `notice ${tone}`
  elements.noticeText.textContent = message
}

function renderProcessState() {
  const state = view.snapshot ? view.snapshot.processState : null
  elements.processIndicator.className = 'state-indicator'
  elements.processIndicator.classList.remove('ready', 'blocked', 'error')

  if (view.activity === 'refresh') {
    elements.processTitle.textContent = '正在检测 GitHub Desktop'
    elements.processDescription.textContent = '请稍候'
    elements.processLabel.textContent = '检测中'
    return
  }

  if (state === 'not-running') {
    elements.processTitle.textContent = 'GitHub Desktop 已关闭'
    elements.processDescription.textContent = '可以安全地应用汉化或还原文件'
    elements.processLabel.textContent = '可以操作'
    elements.processIndicator.classList.add('ready')
    return
  }
  if (state === 'running') {
    elements.processTitle.textContent = 'GitHub Desktop 正在运行'
    elements.processDescription.textContent = '请先关闭应用，再点击刷新'
    elements.processLabel.textContent = '需要关闭'
    elements.processIndicator.classList.add('blocked')
    return
  }

  elements.processTitle.textContent = '无法确认 GitHub Desktop 状态'
  elements.processDescription.textContent = '为保护程序文件，操作已禁用'
  elements.processLabel.textContent = '检测失败'
  elements.processIndicator.classList.add('error')
}

function renderInstallOptions() {
  const installs = view.snapshot ? view.snapshot.installs : []
  const previous = view.selectedVersion
  elements.versionSelect.replaceChildren()

  if (installs.length === 0) {
    const option = document.createElement('option')
    option.textContent = '未找到 GitHub Desktop'
    elements.versionSelect.append(option)
    elements.versionSelect.disabled = true
    view.selectedVersion = null
    return
  }

  for (const install of installs) {
    const option = document.createElement('option')
    option.value = install.version
    option.textContent = `GitHub Desktop ${install.version}`
    elements.versionSelect.append(option)
  }

  const canKeepSelection = installs.some(install => install.version === previous)
  view.selectedVersion = canKeepSelection ? previous : view.snapshot.newestVersion
  elements.versionSelect.value = view.selectedVersion
  elements.versionSelect.disabled = view.busy
}

function renderInstallDetails() {
  const install = selectedInstall()
  const processReady = view.snapshot && view.snapshot.processState === 'not-running'
  const canPatch = install && install.state !== 'broken'
  const canRestore = install &&
    (install.state === 'patched' || (install.state === 'broken' && install.hasBackup))

  elements.patchStatus.className = 'status-badge neutral'
  if (!install) {
    elements.patchStatus.textContent = '--'
    elements.backupStatus.textContent = '--'
  } else {
    elements.patchStatus.textContent = stateLabels[install.state]
    elements.patchStatus.classList.add(install.state)
    elements.backupStatus.textContent = install.hasBackup ? '已安全备份' : '尚未创建'
  }

  elements.patchButton.disabled = view.busy || !processReady || !canPatch
  elements.restoreButton.disabled = view.busy || !processReady || !canRestore
  elements.refreshButton.disabled = view.busy
  elements.operationPanel.setAttribute('aria-busy', String(view.busy))
  elements.patchButton.querySelector('span').textContent =
    install && install.state === 'patched' ? '重新应用汉化' : '应用汉化'

  if (view.busy) {
    elements.actionHint.textContent = view.activity === 'refresh'
      ? '正在刷新安装与运行状态...'
      : '正在处理文件，请勿关闭程序...'
  } else if (!install) {
    elements.actionHint.textContent = '请先安装 GitHub Desktop。'
  } else if (!processReady) {
    elements.actionHint.textContent = '操作前请关闭 GitHub Desktop，然后刷新状态。'
  } else if (install.state === 'broken' && install.hasBackup) {
    elements.actionHint.textContent = '检测到异常状态，请先使用备份还原。'
  } else if (install.state === 'broken') {
    elements.actionHint.textContent = '补丁或备份不完整，建议重装 GitHub Desktop。'
  } else {
    elements.actionHint.textContent = '操作只修改所选版本，原文件会保留备份。'
  }
}

function render() {
  elements.toolVersion.textContent = view.snapshot ? `v${view.snapshot.toolVersion}` : '--'
  renderProcessState()
  renderInstallOptions()
  renderInstallDetails()
}

function ipcInvoke(method, ...args) {
  return Promise.race([
    method(...args),
    new Promise((_, reject) => setTimeout(() => reject(new Error('操作超时，请重试。')), 30000)),
  ])
}

async function refreshState(options = {}) {
  view.busy = true
  view.activity = 'refresh'
  elements.refreshButton.classList.add('spinning')
  render()
  if (!options.keepNotice) {setNotice('')}

  let response
  try {
    response = await ipcInvoke(window.zhPatch.getState)
  } catch (error) {
    view.busy = false
    view.activity = null
    elements.refreshButton.classList.remove('spinning')
    view.snapshot = null
    render()
    setNotice(error instanceof Error ? error.message : '读取应用状态失败。', 'error')
    return
  }
  view.busy = false
  view.activity = null
  elements.refreshButton.classList.remove('spinning')
  if (!response.ok || !response.data) {
    view.snapshot = null
    render()
    setNotice(response.error || '读取应用状态失败。', 'error')
    return
  }

  view.snapshot = response.data
  render()
}

async function runAction(action) {
  const install = selectedInstall()
  if (!install || view.busy) {return}

  view.busy = true
  view.activity = action
  render()
  setNotice(action === 'patch' ? '正在应用汉化...' : '正在还原英文...')

  let response
  try {
    response = await ipcInvoke(window.zhPatch.runAction, action, install.version)
  } catch (error) {
    view.busy = false
    view.activity = null
    setNotice(error instanceof Error ? error.message : '操作失败。', 'error')
    await refreshState({ keepNotice: true })
    return
  }
  view.busy = false
  view.activity = null
  if (!response.ok || !response.data) {
    setNotice(response.error || '操作失败。', 'error')
    await refreshState({ keepNotice: true })
    return
  }

  view.snapshot = response.data.state
  render()
  setNotice(response.data.message, 'success')
}

elements.versionSelect.addEventListener('change', () => {
  view.selectedVersion = elements.versionSelect.value
  setNotice('')
  renderInstallDetails()
})

elements.refreshButton.addEventListener('click', () => refreshState())
elements.patchButton.addEventListener('click', () => runAction('patch'))
elements.restoreButton.addEventListener('click', () => runAction('restore'))
elements.repositoryButton.addEventListener('click', async () => {
  try {
    await window.zhPatch.openRepository()
  } catch (error) {
    setNotice(error instanceof Error ? error.message : '无法打开项目主页。', 'error')
  }
})

void refreshState()
