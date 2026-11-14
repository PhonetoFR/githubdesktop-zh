use std::cmp::Ordering;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

use crate::error::{AppError, Result};

#[derive(Debug, Clone)]
pub struct AppInstall {
    pub version: String,
    pub app_dir: PathBuf,
    pub index_html: PathBuf,
    pub main_js: PathBuf,
    pub renderer_js: PathBuf,
    pub package_json: PathBuf,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PatchState {
    None,
    Patched,
    Restored,
    Broken,
}

impl PatchState {
    pub fn key(self) -> &'static str {
        match self {
            Self::None => "none",
            Self::Patched => "patched",
            Self::Restored => "restored",
            Self::Broken => "broken",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::None => "未汉化",
            Self::Patched => "已汉化",
            Self::Restored => "已还原",
            Self::Broken => "状态异常",
        }
    }
}

#[derive(Debug, Clone)]
pub struct InstallStatus {
    pub version: String,
    pub state: PatchState,
    pub has_backup: bool,
    pub is_patched: bool,
}

pub fn desktop_root() -> Result<PathBuf> {
    let local_app_data = env::var_os("LOCALAPPDATA")
        .ok_or_else(|| AppError::new("无法读取环境变量 LOCALAPPDATA，请确认在 Windows 上运行。"))?;
    Ok(PathBuf::from(local_app_data).join("GitHubDesktop"))
}

pub fn find_installs(root: Option<&Path>) -> Result<Vec<AppInstall>> {
    let root = match root {
        Some(root) => root.to_path_buf(),
        None => desktop_root()?,
    };
    if !root.exists() {
        return Err(AppError::new(format!(
            "未找到 GitHub Desktop 安装目录: {}",
            root.display()
        )));
    }

    let mut installs = Vec::new();
    let entries = fs::read_dir(&root).map_err(|error| {
        AppError::new(format!(
            "读取 GitHub Desktop 安装目录失败（{}）: {error}",
            root.display()
        ))
    })?;

    for entry in entries {
        let entry =
            entry.map_err(|error| AppError::new(format!("读取安装目录条目失败: {error}")))?;
        if !entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false) {
            continue;
        }
        let name = entry.file_name();
        let Some(name) = name.to_str() else {
            continue;
        };
        let Some(version) = name.strip_prefix("app-") else {
            continue;
        };
        if version.is_empty() {
            continue;
        }

        let app_dir = entry.path().join("resources").join("app");
        let index_html = app_dir.join("index.html");
        let main_js = app_dir.join("main.js");
        if !index_html.is_file() || !main_js.is_file() {
            continue;
        }
        installs.push(AppInstall {
            version: version.to_owned(),
            renderer_js: app_dir.join("renderer.js"),
            package_json: app_dir.join("package.json"),
            index_html,
            main_js,
            app_dir,
        });
    }

    installs.sort_by(|a, b| compare_versions(&a.version, &b.version));
    Ok(installs)
}

pub fn newest_install(installs: &[AppInstall]) -> Option<&AppInstall> {
    installs.last()
}

pub fn find_install_by_version<'a>(
    installs: &'a [AppInstall],
    version: &str,
) -> Option<&'a AppInstall> {
    installs.iter().find(|install| install.version == version)
}

pub fn backup_path(file: &Path) -> PathBuf {
    let mut backup = file.as_os_str().to_owned();
    backup.push(".bak");
    PathBuf::from(backup)
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum VersionPart {
    Number(i64),
    Text(String),
}

fn parse_part(part: &str) -> VersionPart {
    let digits: String = part.chars().take_while(|c| c.is_ascii_digit()).collect();
    if !digits.is_empty() {
        if let Ok(number) = digits.parse::<i64>() {
            return VersionPart::Number(number);
        }
    }
    VersionPart::Text(part.to_owned())
}

pub fn compare_versions(a: &str, b: &str) -> Ordering {
    let parts = |value: &str| -> Vec<VersionPart> {
        value.split(['-', '.']).map(parse_part).collect::<Vec<_>>()
    };
    let pa = parts(a);
    let pb = parts(b);
    let len = pa.len().max(pb.len());
    for index in 0..len {
        let va = pa.get(index).cloned().unwrap_or(VersionPart::Number(0));
        let vb = pb.get(index).cloned().unwrap_or(VersionPart::Number(0));
        let order = match (va, vb) {
            (VersionPart::Number(a), VersionPart::Number(b)) => a.cmp(&b),
            (VersionPart::Text(a), VersionPart::Text(b)) => a.cmp(&b),
            (VersionPart::Number(_), VersionPart::Text(_)) => Ordering::Greater,
            (VersionPart::Text(_), VersionPart::Number(_)) => Ordering::Less,
        };
        if order != Ordering::Equal {
            return order;
        }
    }
    Ordering::Equal
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn versions_sort_numerically() {
        assert_eq!(compare_versions("3.6.4", "3.6.10"), Ordering::Less);
        assert_eq!(compare_versions("3.6.4", "3.6.4"), Ordering::Equal);
        assert_eq!(compare_versions("3.7.0", "3.6.9"), Ordering::Greater);
        assert_eq!(compare_versions("3.6.4-beta1", "3.6.4"), Ordering::Less);
    }

    #[test]
    fn backup_path_appends_suffix() {
        assert_eq!(
            backup_path(Path::new("C:\\app\\index.html")),
            PathBuf::from("C:\\app\\index.html.bak")
        );
    }
}
