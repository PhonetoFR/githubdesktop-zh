use std::process::ExitCode;

use github_desktop_zh::application::{apply_patch, restore_original};
use github_desktop_zh::assets::{TOOL_NAME, counts, tool_version};
use github_desktop_zh::error::AppError;
use github_desktop_zh::install::find_installs;
use github_desktop_zh::patcher::get_status;
use github_desktop_zh::ui;

fn print_help() {
    println!(
        "{TOOL_NAME}\n\n\
用法:\n  github-desktop-zh              启动图形界面\n  github-desktop-zh --patch      一键汉化(最新版)\n  github-desktop-zh --restore    还原原版(最新版)\n  github-desktop-zh --status     查看汉化状态\n  github-desktop-zh --version    显示工具版本\n  github-desktop-zh --help       显示帮助\n\n\
选项:\n  --patch --target=<ver>         指定目标版本(如 3.6.4)\n  --restore --target=<ver>       还原指定版本\n  --status --target=<ver>        查看指定版本状态\n\n\
仓库: https://github.com/PhonetoFR/githubdesktop-zh"
    );
}

fn parse_target(args: &[String]) -> Option<String> {
    let mut index = 0;
    while index < args.len() {
        let arg = &args[index];
        if let Some(value) = arg.strip_prefix("--target=") {
            return Some(value.to_owned());
        }
        if arg == "--target" {
            if let Some(value) = args.get(index + 1) {
                return Some(value.clone());
            }
        }
        index += 1;
    }
    None
}

fn print_status(target: Option<&str>) -> Result<(), AppError> {
    let installs = find_installs(None)?;
    let filtered: Vec<_> = match target {
        Some(version) => installs
            .into_iter()
            .filter(|install| install.version == version)
            .collect(),
        None => installs,
    };
    if filtered.is_empty() {
        println!("未找到任何 GitHub Desktop 安装");
        return Ok(());
    }
    println!("检测到 {} 个 GitHub Desktop 安装:", filtered.len());
    for install in &filtered {
        let status = get_status(install);
        println!(
            "  v{:<10} {}{}",
            status.version,
            status.state.label(),
            if status.has_backup {
                "（有备份）"
            } else {
                ""
            }
        );
    }
    Ok(())
}

fn run_cli(args: &[String]) -> Result<(), AppError> {
    if args.iter().any(|arg| arg == "--help" || arg == "-h") {
        print_help();
        return Ok(());
    }
    if args.iter().any(|arg| arg == "--version" || arg == "-V") {
        println!("{TOOL_NAME} v{}", tool_version());
        return Ok(());
    }

    let target = parse_target(args);
    if args.iter().any(|arg| arg == "--status") {
        return print_status(target.as_deref());
    }

    let installs = find_installs(None)?;
    if args.iter().any(|arg| arg == "--patch") {
        println!("开始汉化...");
        let result = apply_patch(&installs, target.as_deref())?;
        println!("汉化完成 v{}", result.version);
        println!("  索引注入: 成功");
        println!("  菜单注入: 成功");
        println!("  运行时写入: 成功");
        println!(
            "  备份创建: {}",
            if result.backup_created { "是" } else { "否" }
        );
        println!("请重新打开 GitHub Desktop 以查看效果。");
        return Ok(());
    }
    if args.iter().any(|arg| arg == "--restore") {
        println!("开始还原...");
        let version = restore_original(&installs, target.as_deref())?;
        println!("已还原 v{version} 为英文。");
        return Ok(());
    }

    print_help();
    Err(AppError::new("未识别的命令行参数"))
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if !args.is_empty() {
        match run_cli(&args) {
            Ok(()) => return ExitCode::SUCCESS,
            Err(error) => {
                eprintln!("错误: {error}");
                return ExitCode::FAILURE;
            }
        }
    }

    let counts = counts();
    println!(
        "{TOOL_NAME} v{}（字典 {} 条 / 规则 {} 条）",
        tool_version(),
        counts.dict_count,
        counts.rules_count
    );
    let _ = rune::set_app_icon(github_desktop_zh::assets::ICON_PNG.to_vec());
    ui::run();
    ExitCode::SUCCESS
}
