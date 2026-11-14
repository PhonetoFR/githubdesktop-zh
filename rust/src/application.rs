use crate::error::{AppError, Result};
use crate::install::{
    AppInstall, InstallStatus, PatchState, find_install_by_version, newest_install,
};
use crate::patcher::{
    DesktopProcessState, PatchResult, get_desktop_process_state, get_status, patch, restore,
};

#[derive(Debug, Clone)]
pub struct InstallView {
    pub install: AppInstall,
    pub status: InstallStatus,
}

#[derive(Debug, Clone)]
pub struct Snapshot {
    pub installs: Vec<InstallView>,
    pub newest_version: Option<String>,
    pub process_state: DesktopProcessState,
}

pub fn get_snapshot(installs: Vec<AppInstall>) -> Snapshot {
    let newest_version = installs.last().map(|install| install.version.clone());
    let installs = installs
        .into_iter()
        .map(|install| InstallView {
            status: get_status(&install),
            install,
        })
        .collect();
    Snapshot {
        installs,
        newest_version,
        process_state: get_desktop_process_state(),
    }
}

pub fn select_target<'a>(
    installs: &'a [AppInstall],
    version: Option<&str>,
) -> Result<&'a AppInstall> {
    if let Some(version) = version {
        return find_install_by_version(installs, version).ok_or_else(|| {
            let available = installs
                .iter()
                .map(|install| install.version.as_str())
                .collect::<Vec<_>>()
                .join(", ");
            AppError::new(format!("未找到指定版本 {version}，可用版本: {available}"))
        });
    }

    newest_install(installs).ok_or_else(|| AppError::new("未找到任何 GitHub Desktop 安装"))
}

pub fn ensure_desktop_stopped(state: DesktopProcessState) -> Result<()> {
    if state == DesktopProcessState::Running {
        return Err(AppError::new(
            "检测到 GitHub Desktop 正在运行，请先关闭它再操作。",
        ));
    }
    if state == DesktopProcessState::Unknown {
        return Err(AppError::new(
            "无法确认 GitHub Desktop 是否已关闭，为避免损坏文件，已取消操作。",
        ));
    }
    Ok(())
}

pub fn apply_patch(installs: &[AppInstall], version: Option<&str>) -> Result<PatchResult> {
    let target = select_target(installs, version)?;
    if get_status(target).state == PatchState::Broken {
        return Err(AppError::new(format!(
            "v{} 处于异常状态，无法汉化。请先还原；如无完整备份，请重装 GitHub Desktop。",
            target.version
        )));
    }

    ensure_desktop_stopped(get_desktop_process_state())?;
    patch(target)
}

pub fn restore_original(installs: &[AppInstall], version: Option<&str>) -> Result<String> {
    let target = select_target(installs, version)?;
    let status = get_status(target);
    if status.state == PatchState::None {
        return Err(AppError::new(format!(
            "v{} 当前未汉化，无需还原。",
            target.version
        )));
    }
    if status.state == PatchState::Broken && !status.has_backup {
        return Err(AppError::new(format!(
            "v{} 缺少完整备份，无法还原。建议重装 GitHub Desktop。",
            target.version
        )));
    }

    ensure_desktop_stopped(get_desktop_process_state())?;
    restore(target)?;
    Ok(target.version.clone())
}
