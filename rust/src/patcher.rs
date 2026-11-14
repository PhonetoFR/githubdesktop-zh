use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::process::Command;

use crate::assets::{MENU_PATCH, RUNTIME_JS, check_assets};
use crate::error::{AppError, Result};
use crate::install::{AppInstall, PatchState, backup_path};

const RUNTIME_DIR: &str = "zh";
const RUNTIME_FILE: &str = "runtime.js";
const INDEX_MARKER: &str = "<script defer=\"defer\" src=\"zh/runtime.js\"></script>";
const INDEX_INSERT_AFTER: &str = "<script defer=\"defer\" src=\"renderer.js\"></script>";
pub const PATCH_START: &str = "/*ZH-PATCH*/";
pub const PATCH_END: &str = "/*END-ZH-PATCH*/";
const RUNTIME_HEADER: &str =
    "/* GitHub Desktop 汉化运行时 - 由 github-desktop-zh 自动生成，请勿手动编辑 */";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DesktopProcessState {
    Running,
    NotRunning,
    Unknown,
}

#[derive(Debug, Clone)]
pub struct PatchResult {
    pub version: String,
    pub index_patched: bool,
    pub main_patched: bool,
    pub runtime_written: bool,
    pub backup_created: bool,
}

#[derive(Debug, Clone, Default)]
struct PatchParts {
    index: bool,
    main_start: bool,
    main_end: bool,
    main_complete: bool,
    runtime: bool,
}

fn runtime_dir(install: &AppInstall) -> PathBuf {
    install.app_dir.join(RUNTIME_DIR)
}

fn runtime_path(install: &AppInstall) -> PathBuf {
    runtime_dir(install).join(RUNTIME_FILE)
}

fn has_complete_backup(install: &AppInstall) -> bool {
    backup_path(&install.index_html).is_file() && backup_path(&install.main_js).is_file()
}

fn has_partial_backup(install: &AppInstall) -> bool {
    backup_path(&install.index_html).is_file() != backup_path(&install.main_js).is_file()
}

fn is_owned_runtime(file: &Path) -> bool {
    fs::read_to_string(file)
        .map(|content| content.starts_with(RUNTIME_HEADER))
        .unwrap_or(false)
}

fn count_occurrences(content: &str, marker: &str) -> usize {
    content.match_indices(marker).count()
}

fn get_patch_parts(install: &AppInstall) -> PatchParts {
    let index = fs::read_to_string(&install.index_html)
        .map(|content| content.contains(INDEX_MARKER))
        .unwrap_or(false);

    let (main_start, main_end, main_complete) = match fs::read_to_string(&install.main_js) {
        Ok(main) => {
            let start = main.find(PATCH_START);
            let end = main.find(PATCH_END);
            let main_start = start.is_some();
            let main_end = end.is_some();
            let main_complete = match (start, end) {
                (Some(start), Some(end)) => {
                    start < end
                        && count_occurrences(&main, PATCH_START) == 1
                        && count_occurrences(&main, PATCH_END) == 1
                }
                _ => false,
            };
            (main_start, main_end, main_complete)
        }
        Err(_) => (false, false, false),
    };

    PatchParts {
        index,
        main_start,
        main_end,
        main_complete,
        runtime: is_owned_runtime(&runtime_path(install)),
    }
}

fn check_patched(install: &AppInstall) -> bool {
    let parts = get_patch_parts(install);
    parts.index && parts.main_complete && parts.runtime
}

fn has_any_patch_part(parts: &PatchParts) -> bool {
    parts.index || parts.main_start || parts.main_end || parts.runtime
}

fn sources_match_backups(install: &AppInstall) -> bool {
    let index = fs::read_to_string(&install.index_html);
    let main = fs::read_to_string(&install.main_js);
    let index_backup = fs::read_to_string(backup_path(&install.index_html));
    let main_backup = fs::read_to_string(backup_path(&install.main_js));
    match (index, main, index_backup, main_backup) {
        (Ok(index), Ok(main), Ok(index_backup), Ok(main_backup)) => {
            index == index_backup && main == main_backup
        }
        _ => false,
    }
}

pub fn get_state(install: &AppInstall) -> PatchState {
    if has_partial_backup(install) {
        return PatchState::Broken;
    }

    let has_backup = has_complete_backup(install);
    let parts = get_patch_parts(install);
    let is_patched = parts.index && parts.main_complete && parts.runtime;

    if is_patched {
        return if has_backup {
            PatchState::Patched
        } else {
            PatchState::Broken
        };
    }
    if has_any_patch_part(&parts) {
        return PatchState::Broken;
    }
    if has_backup {
        return if sources_match_backups(install) {
            PatchState::Restored
        } else {
            PatchState::Broken
        };
    }
    PatchState::None
}

pub fn get_status(install: &AppInstall) -> crate::install::InstallStatus {
    crate::install::InstallStatus {
        version: install.version.clone(),
        state: get_state(install),
        has_backup: has_complete_backup(install),
        is_patched: check_patched(install),
    }
}

fn ensure_backup(install: &AppInstall) -> Result<bool> {
    let index_backup = backup_path(&install.index_html);
    let main_backup = backup_path(&install.main_js);
    let has_index_backup = index_backup.is_file();
    let has_main_backup = main_backup.is_file();
    if has_index_backup != has_main_backup {
        return Err(AppError::new(
            "备份不完整，无法继续。请先使用完整备份还原，或重装 GitHub Desktop。",
        ));
    }
    if has_index_backup {
        return Ok(false);
    }

    let result = (|| -> io::Result<()> {
        copy_new(&install.index_html, &index_backup)?;
        if let Err(error) = copy_new(&install.main_js, &main_backup) {
            let _ = fs::remove_file(&index_backup);
            return Err(error);
        }
        Ok(())
    })();

    result.map_err(|error| AppError::new(format!("创建备份失败: {error}")))?;
    Ok(true)
}

fn copy_new(source: &Path, destination: &Path) -> io::Result<()> {
    let mut reader = fs::File::open(source)?;
    let mut writer = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(destination)?;
    io::copy(&mut reader, &mut writer)?;
    Ok(())
}

fn strip_old_index_patch(content: &str) -> String {
    content.replace(INDEX_MARKER, "")
}

fn strip_old_main_patch(content: &str) -> String {
    let mut output = String::with_capacity(content.len());
    let mut rest = content;
    while let Some(start) = rest.find(PATCH_START) {
        output.push_str(&rest[..start]);
        let after_start = &rest[start..];
        let Some(end) = after_start.find(PATCH_END) else {
            output.push_str(after_start);
            return output;
        };
        rest = &after_start[end + PATCH_END.len()..];
    }
    output.push_str(rest);
    output
}

fn build_patched_index(content: &str) -> Result<String> {
    let content = strip_old_index_patch(content);
    let Some(index) = content.find(INDEX_INSERT_AFTER) else {
        return Err(AppError::new(format!(
            "index.html 中未找到注入锚点: {INDEX_INSERT_AFTER}"
        )));
    };
    let insert_at = index + INDEX_INSERT_AFTER.len();
    let mut patched = String::with_capacity(content.len() + INDEX_MARKER.len());
    patched.push_str(&content[..insert_at]);
    patched.push_str(INDEX_MARKER);
    patched.push_str(&content[insert_at..]);
    Ok(patched)
}

fn build_patched_main(content: &str) -> String {
    format!("{MENU_PATCH}{}", strip_old_main_patch(content))
}

fn assert_runtime_can_be_written(install: &AppInstall) -> Result<()> {
    let file = runtime_path(install);
    if file.is_file() && !is_owned_runtime(&file) {
        return Err(AppError::new(format!(
            "发现非本工具创建的文件，拒绝覆盖: {}",
            file.display()
        )));
    }
    Ok(())
}

fn remove_empty_runtime_dir(install: &AppInstall) {
    let _ = fs::remove_dir(runtime_dir(install));
}

fn write_patch_files(install: &AppInstall, runtime: &str, index: &str, main: &str) -> Result<()> {
    let file = runtime_path(install);
    let dir = runtime_dir(install);
    let previous_index = fs::read_to_string(&install.index_html)
        .map_err(|error| AppError::new(format!("读取 index.html 失败: {error}")))?;
    let previous_main = fs::read_to_string(&install.main_js)
        .map_err(|error| AppError::new(format!("读取 main.js 失败: {error}")))?;
    let runtime_existed = file.exists();
    let previous_runtime = if runtime_existed {
        Some(fs::read_to_string(&file).unwrap_or_default())
    } else {
        None
    };
    let dir_existed = dir.exists();

    let mut runtime_attempted = false;
    let mut index_attempted = false;
    let mut main_attempted = false;

    let result = (|| -> io::Result<()> {
        if !dir_existed {
            fs::create_dir_all(&dir)?;
        }
        runtime_attempted = true;
        fs::write(&file, runtime)?;
        index_attempted = true;
        fs::write(&install.index_html, index)?;
        main_attempted = true;
        fs::write(&install.main_js, main)?;
        Ok(())
    })();

    if let Err(error) = result {
        let mut rollback_errors = Vec::new();
        if main_attempted {
            if let Err(rollback) = fs::write(&install.main_js, &previous_main) {
                rollback_errors.push(rollback.to_string());
            }
        }
        if index_attempted {
            if let Err(rollback) = fs::write(&install.index_html, &previous_index) {
                rollback_errors.push(rollback.to_string());
            }
        }
        if runtime_attempted {
            let rollback = match &previous_runtime {
                Some(previous) => fs::write(&file, previous),
                None => match fs::remove_file(&file) {
                    Ok(()) => Ok(()),
                    Err(remove) if remove.kind() == io::ErrorKind::NotFound => Ok(()),
                    Err(remove) => Err(remove),
                },
            };
            if let Err(rollback) = rollback {
                rollback_errors.push(rollback.to_string());
            }
        }
        if !dir_existed {
            remove_empty_runtime_dir(install);
        }

        let rollback_note = if rollback_errors.is_empty() {
            "已回滚修改".to_owned()
        } else {
            format!("回滚未完全完成: {}", rollback_errors.join("; "))
        };
        return Err(AppError::new(format!(
            "写入补丁失败，{rollback_note}: {error}"
        )));
    }

    Ok(())
}

fn restore_files(install: &AppInstall) -> Result<()> {
    let index_backup = backup_path(&install.index_html);
    let main_backup = backup_path(&install.main_js);
    let restored_index = fs::read_to_string(&index_backup)
        .map_err(|error| AppError::new(format!("读取 index.html 备份失败: {error}")))?;
    let restored_main = fs::read_to_string(&main_backup)
        .map_err(|error| AppError::new(format!("读取 main.js 备份失败: {error}")))?;
    let previous_index = fs::read_to_string(&install.index_html)
        .map_err(|error| AppError::new(format!("读取 index.html 失败: {error}")))?;
    let previous_main = fs::read_to_string(&install.main_js)
        .map_err(|error| AppError::new(format!("读取 main.js 失败: {error}")))?;
    let file = runtime_path(install);
    let runtime_existed = file.exists();
    let owned_runtime = runtime_existed && is_owned_runtime(&file);
    let previous_runtime = if owned_runtime {
        Some(fs::read_to_string(&file).unwrap_or_default())
    } else {
        None
    };

    let mut runtime_removed = false;
    let mut index_attempted = false;
    let mut main_attempted = false;

    let result = (|| -> io::Result<()> {
        if owned_runtime {
            match fs::remove_file(&file) {
                Ok(()) => runtime_removed = true,
                Err(error) if error.kind() == io::ErrorKind::NotFound => {
                    runtime_removed = true;
                }
                Err(error) => return Err(error),
            }
        }
        index_attempted = true;
        fs::write(&install.index_html, restored_index)?;
        main_attempted = true;
        fs::write(&install.main_js, restored_main)?;
        if runtime_removed {
            remove_empty_runtime_dir(install);
        }
        Ok(())
    })();

    if let Err(error) = result {
        let mut rollback_errors = Vec::new();
        if main_attempted {
            if let Err(rollback) = fs::write(&install.main_js, &previous_main) {
                rollback_errors.push(rollback.to_string());
            }
        }
        if index_attempted {
            if let Err(rollback) = fs::write(&install.index_html, &previous_index) {
                rollback_errors.push(rollback.to_string());
            }
        }
        if runtime_removed {
            if let Some(previous) = &previous_runtime {
                let rollback = fs::create_dir_all(runtime_dir(install))
                    .and_then(|_| fs::write(&file, previous));
                if let Err(rollback) = rollback {
                    rollback_errors.push(rollback.to_string());
                }
            }
        }

        let rollback_note = if rollback_errors.is_empty() {
            "已回滚修改".to_owned()
        } else {
            format!("回滚未完全完成: {}", rollback_errors.join("; "))
        };
        return Err(AppError::new(format!("还原失败，{rollback_note}: {error}")));
    }

    Ok(())
}

pub fn get_desktop_process_state() -> DesktopProcessState {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let output = Command::new("tasklist")
            .args(["/FI", "IMAGENAME eq GitHubDesktop.exe", "/NH", "/FO", "CSV"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
        return match output {
            Ok(output) => {
                let text = String::from_utf8_lossy(&output.stdout);
                if text.to_ascii_lowercase().contains("githubdesktop.exe") {
                    DesktopProcessState::Running
                } else {
                    DesktopProcessState::NotRunning
                }
            }
            Err(_) => DesktopProcessState::Unknown,
        };
    }
    #[cfg(not(windows))]
    {
        DesktopProcessState::Unknown
    }
}

pub fn is_desktop_running() -> bool {
    get_desktop_process_state() == DesktopProcessState::Running
}

pub fn patch(install: &AppInstall) -> Result<PatchResult> {
    check_assets()?;
    let state = get_state(install);
    if state == PatchState::Broken {
        return Err(AppError::new(format!(
            "版本 {} 处于异常状态（补丁或备份不完整），无法继续。请先还原；如无完整备份，请重装 GitHub Desktop。",
            install.version
        )));
    }

    let index_source = fs::read_to_string(&install.index_html)
        .map_err(|error| AppError::new(format!("读取 index.html 失败: {error}")))?;
    let main_source = fs::read_to_string(&install.main_js)
        .map_err(|error| AppError::new(format!("读取 main.js 失败: {error}")))?;
    let index = build_patched_index(&index_source)?;
    let main = build_patched_main(&main_source);
    assert_runtime_can_be_written(install)?;
    let backup_created = ensure_backup(install)?;

    write_patch_files(install, RUNTIME_JS, &index, &main)?;

    Ok(PatchResult {
        version: install.version.clone(),
        index_patched: true,
        main_patched: true,
        runtime_written: true,
        backup_created,
    })
}

pub fn restore(install: &AppInstall) -> Result<bool> {
    let state = get_state(install);
    if state == PatchState::None {
        return Err(AppError::new(format!(
            "版本 {} 未汉化，无需还原。",
            install.version
        )));
    }
    if !has_complete_backup(install) {
        return Err(AppError::new(format!(
            "版本 {} 缺少完整备份，无法还原。建议重装 GitHub Desktop。",
            install.version
        )));
    }

    restore_files(install)?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_existing_patch_blocks() {
        let source = format!("before\n{PATCH_START}\nold\n{PATCH_END}\nafter");
        assert_eq!(strip_old_main_patch(&source), "before\n\nafter");
    }

    #[test]
    fn inserts_runtime_after_renderer_script() {
        let source = format!("<head>{INDEX_INSERT_AFTER}</head>");
        let patched = build_patched_index(&source).unwrap();
        assert!(patched.contains(&format!("{INDEX_INSERT_AFTER}{INDEX_MARKER}")));
        let twice = build_patched_index(&patched).unwrap();
        assert_eq!(twice.matches(INDEX_MARKER).count(), 1);
    }
}
