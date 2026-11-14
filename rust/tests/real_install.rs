use std::env;
use std::fs;
use std::path::PathBuf;

use github_desktop_zh::install::{AppInstall, PatchState};
use github_desktop_zh::patcher::{get_state, patch, restore};

#[test]
#[ignore = "needs a real GitHub Desktop 3.6.4 installation"]
fn patch_and_restore_a_copy_of_the_real_install() {
    let local = env::var_os("LOCALAPPDATA").expect("LOCALAPPDATA");
    let source = PathBuf::from(local)
        .join("GitHubDesktop")
        .join("app-3.6.4")
        .join("resources")
        .join("app");
    assert!(
        source.join("index.html").is_file(),
        "GitHub Desktop 3.6.4 not installed"
    );

    let root = env::temp_dir().join(format!("github-desktop-zh-real-{}", std::process::id()));
    let app_dir = root.join("resources").join("app");
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&app_dir).unwrap();
    for file in ["index.html", "main.js", "renderer.js", "package.json"] {
        let backup = source.join(format!("{file}.bak"));
        let from = if backup.is_file() {
            backup
        } else {
            source.join(file)
        };
        fs::copy(from, app_dir.join(file)).unwrap();
    }

    let install = AppInstall {
        version: "3.6.4".to_owned(),
        index_html: app_dir.join("index.html"),
        main_js: app_dir.join("main.js"),
        renderer_js: app_dir.join("renderer.js"),
        package_json: app_dir.join("package.json"),
        app_dir,
    };

    let original_index = fs::read_to_string(&install.index_html).unwrap();
    let original_main = fs::read_to_string(&install.main_js).unwrap();

    patch(&install).unwrap();
    assert_eq!(get_state(&install), PatchState::Patched);
    let runtime = fs::read_to_string(install.app_dir.join("zh").join("runtime.js")).unwrap();
    assert!(runtime.len() > 90_000);
    assert!(
        fs::read_to_string(&install.main_js)
            .unwrap()
            .contains("Menu.buildFromTemplate")
    );

    restore(&install).unwrap();
    assert_eq!(get_state(&install), PatchState::Restored);
    assert_eq!(
        fs::read_to_string(&install.index_html).unwrap(),
        original_index
    );
    assert_eq!(fs::read_to_string(&install.main_js).unwrap(), original_main);
    assert!(!install.app_dir.join("zh").exists());

    let _ = fs::remove_dir_all(&root);
}
