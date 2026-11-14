use std::fs;
use std::path::{Path, PathBuf};

use github_desktop_zh::install::{AppInstall, PatchState, backup_path};
use github_desktop_zh::patcher::{PATCH_END, PATCH_START, get_state, patch, restore};

struct TestDir {
    root: PathBuf,
}

impl TestDir {
    fn new(name: &str) -> Self {
        let root = std::env::temp_dir().join(format!(
            "github-desktop-zh-test-{}-{name}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("resources").join("app")).unwrap();
        Self { root }
    }

    fn install(&self) -> AppInstall {
        let app_dir = self.root.join("resources").join("app");
        AppInstall {
            version: "3.6.4".to_owned(),
            index_html: app_dir.join("index.html"),
            main_js: app_dir.join("main.js"),
            renderer_js: app_dir.join("renderer.js"),
            package_json: app_dir.join("package.json"),
            app_dir,
        }
    }

    fn write_base_files(&self, install: &AppInstall) {
        fs::write(
            &install.index_html,
            "<!doctype html><html><head><script defer=\"defer\" src=\"renderer.js\"></script></head><body></body></html>",
        )
        .unwrap();
        fs::write(&install.main_js, "console.log('main');\n").unwrap();
        fs::write(&install.renderer_js, "console.log('renderer');\n").unwrap();
        fs::write(&install.package_json, "{\"version\":\"3.6.4\"}\n").unwrap();
    }
}

impl Drop for TestDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

fn runtime_path(install: &AppInstall) -> PathBuf {
    install.app_dir.join("zh").join("runtime.js")
}

#[test]
fn patch_then_restore_round_trip() {
    let dir = TestDir::new("round-trip");
    let install = dir.install();
    dir.write_base_files(&install);

    assert_eq!(get_state(&install), PatchState::None);

    let result = patch(&install).unwrap();
    assert!(result.backup_created);
    assert_eq!(get_state(&install), PatchState::Patched);

    let index = fs::read_to_string(&install.index_html).unwrap();
    assert!(index.contains("zh/runtime.js"));
    assert!(
        fs::read_to_string(&install.main_js)
            .unwrap()
            .starts_with(PATCH_START)
    );
    let runtime = fs::read_to_string(runtime_path(&install)).unwrap();
    assert!(runtime.contains("MutationObserver"));
    assert!(backup_path(&install.index_html).is_file());
    assert!(backup_path(&install.main_js).is_file());

    restore(&install).unwrap();
    assert_eq!(get_state(&install), PatchState::Restored);
    assert!(!runtime_path(&install).exists());
    assert!(!runtime_path(&install).parent().unwrap().exists());
    assert_eq!(
        fs::read_to_string(&install.index_html).unwrap(),
        "<!doctype html><html><head><script defer=\"defer\" src=\"renderer.js\"></script></head><body></body></html>"
    );
    assert_eq!(
        fs::read_to_string(&install.main_js).unwrap(),
        "console.log('main');\n"
    );
}

#[test]
fn patch_can_be_reapplied_without_duplicate_markers() {
    let dir = TestDir::new("reapply");
    let install = dir.install();
    dir.write_base_files(&install);

    patch(&install).unwrap();
    patch(&install).unwrap();

    let index = fs::read_to_string(&install.index_html).unwrap();
    assert_eq!(index.matches("zh/runtime.js").count(), 1);
    let main = fs::read_to_string(&install.main_js).unwrap();
    assert_eq!(main.matches(PATCH_START).count(), 1);
    assert_eq!(main.matches(PATCH_END).count(), 1);
    assert_eq!(get_state(&install), PatchState::Patched);
}

#[test]
fn partial_backup_is_broken() {
    let dir = TestDir::new("partial-backup");
    let install = dir.install();
    dir.write_base_files(&install);
    fs::write(backup_path(&install.index_html), "backup").unwrap();

    assert_eq!(get_state(&install), PatchState::Broken);
}

#[test]
fn foreign_runtime_is_rejected() {
    let dir = TestDir::new("foreign-runtime");
    let install = dir.install();
    dir.write_base_files(&install);
    let zh = install.app_dir.join("zh");
    fs::create_dir_all(&zh).unwrap();
    fs::write(zh.join("runtime.js"), "/* not ours */").unwrap();

    let error = patch(&install).unwrap_err();
    assert!(error.to_string().contains("非本工具创建"));
    assert!(!backup_path(&install.index_html).exists());
}

#[test]
fn restore_requires_a_backup() {
    let dir = TestDir::new("restore-no-backup");
    let install = dir.install();
    dir.write_base_files(&install);
    let error = restore(&install).unwrap_err();
    assert!(error.to_string().contains("未汉化"));
}

#[test]
fn missing_anchor_is_reported() {
    let dir = TestDir::new("missing-anchor");
    let install = dir.install();
    dir.write_base_files(&install);
    fs::write(&install.index_html, "<html><head></head></html>").unwrap();
    let error = patch(&install).unwrap_err();
    assert!(error.to_string().contains("未找到注入锚点"));
    assert_eq!(get_state(&install), PatchState::None);
}

#[test]
fn state_labels_are_chinese() {
    assert_eq!(PatchState::None.label(), "未汉化");
    assert_eq!(PatchState::Patched.label(), "已汉化");
    assert_eq!(PatchState::Restored.label(), "已还原");
    assert_eq!(PatchState::Broken.label(), "状态异常");
}

#[test]
fn backup_path_is_a_sibling_file() {
    let path = Path::new("C:\\app\\index.html");
    assert_eq!(backup_path(path), PathBuf::from("C:\\app\\index.html.bak"));
}
