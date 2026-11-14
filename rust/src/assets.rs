use crate::error::{AppError, Result};

pub const TOOL_NAME: &str = "GitHub Desktop 汉化补丁";
pub const REPOSITORY_URL: &str = "https://github.com/PhonetoFR/githubdesktop-zh";

pub const RUNTIME_JS: &str = include_str!("../assets/runtime.js");
pub const MENU_PATCH: &str = include_str!("../assets/menu-patch.txt");
pub const MANIFEST_JSON: &str = include_str!("../assets/manifest.json");
pub const ICON_PNG: &[u8] = include_bytes!("../assets/icon.png");

pub fn tool_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[derive(Debug, Clone, Copy, Default)]
pub struct AssetCounts {
    pub dict_count: usize,
    pub rules_count: usize,
}

pub fn counts() -> AssetCounts {
    let parsed: serde_json::Value = serde_json::from_str(MANIFEST_JSON).unwrap_or_default();
    AssetCounts {
        dict_count: parsed
            .get("dictCount")
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as usize,
        rules_count: parsed
            .get("rulesCount")
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as usize,
    }
}

pub fn check_assets() -> Result<()> {
    if !RUNTIME_JS.contains("MutationObserver") {
        return Err(AppError::new("runtime.js 资产无效：缺少 MutationObserver"));
    }
    if !MENU_PATCH.starts_with("/*ZH-PATCH*/") {
        return Err(AppError::new("menu-patch 资产无效：缺少起始标记"));
    }
    if !MENU_PATCH.contains("/*END-ZH-PATCH*/") {
        return Err(AppError::new("menu-patch 资产无效：缺少结束标记"));
    }
    Ok(())
}
