#![cfg_attr(all(windows, not(debug_assertions)), windows_subsystem = "windows")]

use std::process::ExitCode;
use std::sync::atomic::{AtomicIsize, Ordering};

use github_desktop_zh::application::{apply_patch, restore_original};
use github_desktop_zh::assets::{TOOL_NAME, tool_version};
use github_desktop_zh::error::AppError;
use github_desktop_zh::install::find_installs;
use github_desktop_zh::patcher::get_status;
use github_desktop_zh::ui;

/// The console handle used by CLI mode. A GUI-subsystem process starts without a
/// console; when CLI arguments are present we attach to the parent console (or
/// allocate one) and remember its handle for `cli_line!` / `cli_error!`.
static CONSOLE_HANDLE: AtomicIsize = AtomicIsize::new(0);

#[cfg(all(windows, not(debug_assertions)))]
fn attach_parent_console() {
    use std::ptr;
    use windows_sys::Win32::Foundation::INVALID_HANDLE_VALUE;
    use windows_sys::Win32::Storage::FileSystem::{
        CreateFileW, FILE_GENERIC_WRITE, FILE_SHARE_READ, FILE_SHARE_WRITE, OPEN_EXISTING,
    };
    use windows_sys::Win32::System::Console::{
        ATTACH_PARENT_PROCESS, AllocConsole, AttachConsole, GetStdHandle, STD_OUTPUT_HANDLE,
    };

    unsafe {
        if AttachConsole(ATTACH_PARENT_PROCESS) == 0 {
            let _ = AllocConsole();
        }

        let mut handle = GetStdHandle(STD_OUTPUT_HANDLE);
        if handle == INVALID_HANDLE_VALUE || handle.is_null() {
            let name: Vec<u16> = "CONOUT$\0".encode_utf16().collect();
            handle = CreateFileW(
                name.as_ptr(),
                FILE_GENERIC_WRITE,
                FILE_SHARE_READ | FILE_SHARE_WRITE,
                ptr::null(),
                OPEN_EXISTING,
                0,
                ptr::null_mut(),
            );
        }
        if handle != INVALID_HANDLE_VALUE && !handle.is_null() {
            CONSOLE_HANDLE.store(handle as isize, Ordering::Relaxed);
        }
    }
}

#[cfg(not(all(windows, not(debug_assertions))))]
fn attach_parent_console() {}

fn write_console(text: &str, error: bool) {
    #[cfg(windows)]
    {
        let raw = CONSOLE_HANDLE.load(Ordering::Relaxed);
        if raw != 0 {
            use std::ptr;
            use windows_sys::Win32::Storage::FileSystem::{FILE_TYPE_CHAR, GetFileType, WriteFile};
            use windows_sys::Win32::System::Console::WriteConsoleW;
            let handle = raw as *mut _;
            let mut written = 0u32;
            let is_char = unsafe { GetFileType(handle) } == FILE_TYPE_CHAR;
            if is_char {
                let wide: Vec<u16> = text.encode_utf16().collect();
                unsafe {
                    let _ = WriteConsoleW(
                        handle,
                        wide.as_ptr(),
                        wide.len() as u32,
                        &mut written,
                        ptr::null(),
                    );
                }
            } else {
                let bytes = text.as_bytes();
                unsafe {
                    let _ = WriteFile(
                        handle,
                        bytes.as_ptr(),
                        bytes.len() as u32,
                        &mut written,
                        ptr::null_mut(),
                    );
                }
            }
            return;
        }
    }

    if error {
        eprint!("{text}");
    } else {
        print!("{text}");
    }
}

macro_rules! cli_line {
    ($($arg:tt)*) => {
        write_console(&format!("{}\n", format_args!($($arg)*)), false)
    };
}

macro_rules! cli_error {
    ($($arg:tt)*) => {
        write_console(&format!("{}\n", format_args!($($arg)*)), true)
    };
}

fn print_help() {
    cli_line!(
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
        cli_line!("未找到任何 GitHub Desktop 安装");
        return Ok(());
    }
    cli_line!("检测到 {} 个 GitHub Desktop 安装:", filtered.len());
    for install in &filtered {
        let status = get_status(install);
        cli_line!(
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
        cli_line!("{TOOL_NAME} v{}", tool_version());
        return Ok(());
    }

    let target = parse_target(args);
    if args.iter().any(|arg| arg == "--status") {
        return print_status(target.as_deref());
    }

    let installs = find_installs(None)?;
    if args.iter().any(|arg| arg == "--patch") {
        cli_line!("开始汉化...");
        let result = apply_patch(&installs, target.as_deref())?;
        cli_line!("汉化完成 v{}", result.version);
        cli_line!("  索引注入: 成功");
        cli_line!("  菜单注入: 成功");
        cli_line!("  运行时写入: 成功");
        cli_line!(
            "  备份创建: {}",
            if result.backup_created { "是" } else { "否" }
        );
        cli_line!("请重新打开 GitHub Desktop 以查看效果。");
        return Ok(());
    }
    if args.iter().any(|arg| arg == "--restore") {
        cli_line!("开始还原...");
        let version = restore_original(&installs, target.as_deref())?;
        cli_line!("已还原 v{version} 为英文。");
        return Ok(());
    }

    print_help();
    Err(AppError::new("未识别的命令行参数"))
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if !args.is_empty() {
        attach_parent_console();
        match run_cli(&args) {
            Ok(()) => return ExitCode::SUCCESS,
            Err(error) => {
                cli_error!("错误: {error}");
                return ExitCode::FAILURE;
            }
        }
    }

    let _ = rune::set_app_icon(github_desktop_zh::assets::ICON_PNG.to_vec());
    ui::run();
    ExitCode::SUCCESS
}
