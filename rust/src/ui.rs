use std::sync::mpsc::{self, Receiver, TryRecvError};
use std::time::Duration;

use rune::{AppSpec, Color, Cx, El, TextStyle, Titlebar, col, el, icon, row, text};
use rune_kit::{
    Button, ButtonVariant, ControlSize, IconButton, IconButtonVariant, Kit, Spinner,
};
use rune_theme_opencode::{FAMILIES, FONTS, icons};

use crate::application::{InstallView, Snapshot, apply_patch, get_snapshot, restore_original};
use crate::assets::{counts, tool_version, TOOL_NAME};
use crate::error::Result;
use crate::install::{AppInstall, PatchState, find_installs};
use crate::patcher::{DesktopProcessState, PatchResult, get_desktop_process_state};
use crate::platform::open_url;

const WINDOW_SIZE: (f32, f32) = (1000.0, 560.0);
const MIN_WINDOW_SIZE: (f32, f32) = (860.0, 540.0);
const TITLEBAR_HEIGHT: f32 = 42.0;
const SIDEBAR_WIDTH: f32 = 250.0;
const REPOSITORY_URL: &str = "https://github.com/PhonetoFR/githubdesktop-zh";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, PartialEq, Eq)]
enum NoticeTone {
    Info,
    Success,
    Error,
}

#[derive(Clone)]
struct Notice {
    text: String,
    tone: NoticeTone,
}

impl Notice {
    fn info(text: impl Into<String>) -> Self {
        Self {
            text: text.into(),
            tone: NoticeTone::Info,
        }
    }
    fn success(text: impl Into<String>) -> Self {
        Self {
            text: text.into(),
            tone: NoticeTone::Success,
        }
    }
    fn error(text: impl Into<String>) -> Self {
        Self {
            text: text.into(),
            tone: NoticeTone::Error,
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Activity {
    Refresh,
    Patch,
    Restore,
}

enum OpOutcome {
    Patched(Result<PatchResult>),
    Restored(Result<String>),
}

struct State {
    installs: Vec<AppInstall>,
    snapshot: Option<Snapshot>,
    selected: Option<String>,
    busy: bool,
    activity: Option<Activity>,
    notice: Option<Notice>,
    fatal_error: Option<String>,
    last_process_check: f64,
    op_rx: Option<Receiver<OpOutcome>>,
}

impl State {
    fn init() -> Self {
        let mut state = Self {
            installs: Vec::new(),
            snapshot: None,
            selected: None,
            busy: false,
            activity: None,
            notice: None,
            fatal_error: None,
            last_process_check: 0.0,
            op_rx: None,
        };
        state.refresh();
        state
    }

    fn refresh(&mut self) {
        let previous = self.selected.clone();
        match find_installs(None) {
            Ok(installs) => {
                let snapshot = get_snapshot(installs.clone());
                self.selected = previous
                    .filter(|version| {
                        snapshot
                            .installs
                            .iter()
                            .any(|entry| &entry.install.version == version)
                    })
                    .or_else(|| snapshot.newest_version.clone());
                self.installs = installs;
                self.snapshot = Some(snapshot);
                self.fatal_error = None;
            }
            Err(error) => {
                self.installs.clear();
                self.snapshot = None;
                self.selected = None;
                self.fatal_error = Some(error.to_string());
            }
        }
    }

    fn selected_view(&self) -> Option<&InstallView> {
        let version = self.selected.as_deref()?;
        self.snapshot
            .as_ref()?
            .installs
            .iter()
            .find(|entry| entry.install.version == version)
    }

    fn process_state(&self) -> DesktopProcessState {
        self.snapshot
            .as_ref()
            .map(|snapshot| snapshot.process_state)
            .unwrap_or(DesktopProcessState::Unknown)
    }

    fn process_ready(&self) -> bool {
        self.process_state() == DesktopProcessState::NotRunning
    }

    fn can_patch(&self) -> bool {
        self.selected_view()
            .map(|entry| entry.status.state != PatchState::Broken)
            .unwrap_or(false)
            && self.process_ready()
            && !self.busy
    }

    fn can_restore(&self) -> bool {
        self.selected_view()
            .map(|entry| {
                entry.status.state == PatchState::Patched
                    || (entry.status.state == PatchState::Broken && entry.status.has_backup)
            })
            .unwrap_or(false)
            && self.process_ready()
            && !self.busy
    }
}

fn start_action(state: &mut State, activity: Activity, tx: &mut rune::Tx) {
    if state.busy {
        return;
    }
    let Some(version) = state.selected.clone() else {
        return;
    };
    let installs = state.installs.clone();
    let (sender, receiver) = mpsc::channel();
    state.op_rx = Some(receiver);
    state.busy = true;
    state.activity = Some(activity);
    state.notice = Some(Notice::info(match activity {
        Activity::Patch => "正在应用汉化…",
        Activity::Restore => "正在还原英文…",
        Activity::Refresh => "正在刷新状态…",
    }));

    std::thread::spawn(move || {
        let outcome = match activity {
            Activity::Patch => OpOutcome::Patched(apply_patch(&installs, Some(&version))),
            Activity::Restore => OpOutcome::Restored(restore_original(&installs, Some(&version))),
            Activity::Refresh => return,
        };
        let _ = sender.send(outcome);
    });

    tx.wake_after(Duration::from_millis(30));
}

fn finish_action(state: &mut State, outcome: OpOutcome) {
    state.busy = false;
    state.activity = None;
    state.op_rx = None;
    state.refresh();
    state.notice = Some(match outcome {
        OpOutcome::Patched(Ok(result)) => {
            Notice::success(format!("GitHub Desktop v{} 汉化完成。", result.version))
        }
        OpOutcome::Patched(Err(error)) => Notice::error(error.to_string()),
        OpOutcome::Restored(Ok(version)) => {
            Notice::success(format!("GitHub Desktop v{version} 已还原为英文。"))
        }
        OpOutcome::Restored(Err(error)) => Notice::error(error.to_string()),
    });
}

fn poll(state: &mut State, now: f64, tx: &mut rune::Tx) -> bool {
    let mut changed = false;

    if let Some(receiver) = &state.op_rx {
        match receiver.try_recv() {
            Ok(outcome) => {
                finish_action(state, outcome);
                changed = true;
            }
            Err(TryRecvError::Empty) => {
                tx.wake_after(Duration::from_millis(40));
            }
            Err(TryRecvError::Disconnected) => {
                state.busy = false;
                state.activity = None;
                state.op_rx = None;
                state.notice = Some(Notice::error("操作意外中断，请重试。"));
                changed = true;
            }
        }
    }

    if now - state.last_process_check >= 2.0 {
        state.last_process_check = now;
        let next = get_desktop_process_state();
        if let Some(snapshot) = &mut state.snapshot {
            if snapshot.process_state != next {
                snapshot.process_state = next;
                changed = true;
            }
        }
    }

    tx.wake_after(Duration::from_secs(2));
    changed
}

// ---------------------------------------------------------------------------
// Visual helpers (OpenCode theme)
// ---------------------------------------------------------------------------

fn section_label(k: &Kit, label: &str) -> El {
    text(label)
        .font(k.ty.small)
        .color(k.c.text_faint)
        .a11y_hidden()
}

fn divider(k: &Kit) -> El {
    el().h(1.0).w_full().fill(k.c.border_muted).a11y_hidden()
}

fn state_badge(k: &Kit, state: PatchState) -> El {
    let (fg, bg) = match state {
        PatchState::None => (k.c.text_muted, k.c.layer_02),
        PatchState::Patched => (k.c.success.fg, k.c.success.bg),
        PatchState::Restored => (k.c.info.fg, k.c.info.bg),
        PatchState::Broken => (k.c.danger.fg, k.c.danger.bg),
    };
    row()
        .h(18.0)
        .px(6.0)
        .radius(4.0)
        .fill(bg)
        .label(state.label())
        .child(
            text(state.label())
                .font(k.ty.small)
                .color(fg)
                .a11y_hidden(),
        )
}

fn process_badge(k: &Kit, state: DesktopProcessState, refreshing: bool) -> El {
    let (label, fg, bg) = if refreshing {
        ("检测中", k.c.text_muted, k.c.layer_02)
    } else {
        match state {
            DesktopProcessState::NotRunning => ("可以操作", k.c.success.fg, k.c.success.bg),
            DesktopProcessState::Running => ("需要关闭", k.c.warning.fg, k.c.warning.bg),
            DesktopProcessState::Unknown => ("检测失败", k.c.danger.fg, k.c.danger.bg),
        }
    };
    row()
        .h(18.0)
        .px(6.0)
        .radius(4.0)
        .fill(bg)
        .label(label)
        .child(text(label).font(k.ty.small).color(fg).a11y_hidden())
}

fn state_color(k: &Kit, state: PatchState) -> Color {
    match state {
        PatchState::None => k.c.text_faint,
        PatchState::Patched => k.c.success.fg,
        PatchState::Restored => k.c.info.fg,
        PatchState::Broken => k.c.danger.fg,
    }
}

fn process_color(k: &Kit, state: DesktopProcessState) -> Color {
    match state {
        DesktopProcessState::NotRunning => k.c.success.fg,
        DesktopProcessState::Running => k.c.warning.fg,
        DesktopProcessState::Unknown => k.c.danger.fg,
    }
}

fn process_copy(
    k: &Kit,
    state: DesktopProcessState,
    refreshing: bool,
) -> (String, String, Color) {
    if refreshing {
        return (
            "正在检测 GitHub Desktop".to_owned(),
            "请稍候".to_owned(),
            k.c.text_faint,
        );
    }
    match state {
        DesktopProcessState::NotRunning => (
            "GitHub Desktop 已关闭".to_owned(),
            "可以安全地应用汉化或还原文件".to_owned(),
            process_color(k, state),
        ),
        DesktopProcessState::Running => (
            "GitHub Desktop 正在运行".to_owned(),
            "请先关闭应用，再点击刷新".to_owned(),
            process_color(k, state),
        ),
        DesktopProcessState::Unknown => (
            "无法确认 GitHub Desktop 状态".to_owned(),
            "为保护程序文件，操作已禁用".to_owned(),
            process_color(k, state),
        ),
    }
}

fn text_primary(size: f32, weight: f32) -> TextStyle {
    TextStyle::new(size, weight).lh(size + 6.0)
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

fn view(state: &State, cx: &mut Cx<State>) -> El {
    let dark = cx.system_dark();
    let k = rune_theme_opencode::kit(dark);
    cx.caption_color(k.c.text_base);
    let insets = cx.chrome_insets();
    let layer = Vec::new();

    let titlebar = row()
        .key("titlebar")
        .window_drag()
        .h(TITLEBAR_HEIGHT)
        .w_full()
        .px(14.0)
        .pr(insets.trailing + 10.0)
        .gap(8.0)
        .center_y()
        .child(icon(&icons::GITHUB, 16.0).color(k.c.icon_muted))
        .child(
            text(TOOL_NAME)
                .font(text_primary(12.5, 500.0))
                .color(k.c.text_muted),
        )
        .child(el().grow(1.0));

    let body = col()
        .w_full()
        .h_full()
        .fill(k.c.page)
        .child(titlebar)
        .child(
            row()
                .w_full()
                .grow(1.0)
                .min_h(0.0)
                .child(sidebar(state, k))
                .child(main_panel(state, k)),
        );

    rune_kit::root(body, layer)
}

fn sidebar(state: &State, k: &Kit) -> El {
    let mut versions = col().w_full().gap(1.0);
    if state.installs.is_empty() {
        versions = versions.child(
            text("未找到 GitHub Desktop")
                .font(k.ty.ui)
                .color(k.c.text_faint)
                .px(8.0)
                .py(8.0),
        );
    } else {
        for install in &state.installs {
            let version = install.version.clone();
            let version_for_click = version.clone();
            let status = state
                .snapshot
                .as_ref()
                .and_then(|snapshot| {
                    snapshot
                        .installs
                        .iter()
                        .find(|entry| entry.install.version == version)
                })
                .map(|entry| entry.status.state)
                .unwrap_or(PatchState::None);
            let selected = state.selected.as_deref() == Some(version.as_str());
            let row_el = row()
                .key(format!("version-{version}"))
                .h(42.0)
                .w_full()
                .px(8.0)
                .gap(8.0)
                .center_y()
                .radius(6.0)
                .fill(if selected {
                    k.c.layer_02
                } else {
                    Color::TRANSPARENT
                })
                .hover(k.c.hover)
                .press(k.c.pressed)
                .focusable(true)
                .label(format!("GitHub Desktop {version}，{}", status.label()))
                .on_press(move |state: &mut State| {
                    state.selected = Some(version_for_click.clone());
                    state.notice = None;
                })
                .child(
                    el()
                        .size(7.0, 7.0)
                        .radius(3.5)
                        .fill(state_color(k, status))
                        .a11y_hidden(),
                )
                .child(
                    col()
                        .grow(1.0)
                        .gap(1.0)
                        .child(
                            text(version.clone())
                                .font(k.ty.ui)
                                .color(if selected {
                                    k.c.text_base
                                } else {
                                    k.c.text_muted
                                })
                                .truncate(),
                        )
                        .child(
                            text(format!("GitHub Desktop · {}", status.label()))
                                .font(k.ty.small)
                                .color(k.c.text_faint)
                                .truncate(),
                        ),
                );
            versions = versions.child(row_el);
        }
    }

    col()
        .key("sidebar")
        .w(SIDEBAR_WIDTH)
        .h_full()
        .min_h(0.0)
        .px(10.0)
        .pb(10.0)
        .gap(6.0)
        .child(section_label(k, "安装版本"))
        .child(versions)
        .child(el().grow(1.0))
        .child(divider(k))
        .child(
            text(format!(
                "字典 {} 条 · 规则 {} 条",
                counts().dict_count,
                counts().rules_count
            ))
            .font(k.ty.small)
            .color(k.c.text_faint)
            .px(8.0)
            .py(4.0),
        )
        .child(
            text(format!("v{}", tool_version()))
                .font(k.ty.small)
                .color(k.c.text_faint)
                .px(8.0),
        )
        .child(
            row()
                .px(4.0)
                .child(
                    Button::new("查看项目主页")
                        .variant(ButtonVariant::GhostMuted)
                        .control_size(ControlSize::Small)
                        .icon(&icons::ARROW_UP_RIGHT)
                        .on_press_tx(|state: &mut State, _tx: &mut rune::Tx| {
                            if let Err(error) = open_url(REPOSITORY_URL) {
                                state.notice = Some(Notice::error(error.to_string()));
                            }
                        })
                        .build(k),
                ),
        )
}

fn main_panel(state: &State, k: &Kit) -> El {
    let selected = state.selected_view();
    let status = selected
        .map(|entry| entry.status.state)
        .unwrap_or(PatchState::None);
    let has_backup = selected.map(|entry| entry.status.has_backup).unwrap_or(false);
    let refreshing = state.busy && state.activity == Some(Activity::Refresh);
    let (process_title, process_description, process_dot_color) =
        process_copy(k, state.process_state(), refreshing);

    let mut refresh = IconButton::new(&icons::REFRESH)
        .variant(IconButtonVariant::GhostMuted)
        .label("刷新状态")
        .help("刷新安装与运行状态")
        .on_press_tx(|state: &mut State, tx: &mut rune::Tx| {
            if state.busy {
                return;
            }
            state.busy = true;
            state.activity = Some(Activity::Refresh);
            state.notice = None;
            state.refresh();
            state.busy = false;
            state.activity = None;
            tx.wake_after(Duration::from_millis(10));
        });
    if state.busy {
        refresh = refresh.disabled(true);
    }

    let topbar = row()
        .h(50.0)
        .w_full()
        .px(18.0)
        .gap(10.0)
        .center_y()
        .child(
            text("汉化")
                .font(text_primary(15.0, 600.0))
                .color(k.c.text_base),
        )
        .child(
            text("GitHub Desktop 简体中文补丁")
                .font(k.ty.small)
                .color(k.c.text_faint),
        )
        .child(el().grow(1.0))
        .child(process_badge(k, state.process_state(), refreshing))
        .child(if state.busy {
            Spinner::new().build(k)
        } else {
            refresh.build(k)
        });

    let content = col()
        .w_full()
        .gap(18.0)
        .px(20.0)
        .pt(16.0)
        .pb(24.0)
        .child(
            col()
                .gap(4.0)
                .child(
                    row()
                        .gap(8.0)
                        .center_y()
                        .child(
                            el()
                                .size(8.0, 8.0)
                                .radius(4.0)
                                .fill(process_dot_color)
                                .a11y_hidden(),
                        )
                        .child(
                            text(process_title)
                                .font(text_primary(15.0, 600.0))
                                .color(k.c.text_base),
                        ),
                )
                .child(
                    text(process_description)
                        .font(k.ty.ui)
                        .color(k.c.text_muted),
                ),
        )
        .child(
            col()
                .gap(8.0)
                .child(section_label(k, "目标版本"))
                .child(version_panel(selected, status, k)),
        )
        .child(
            col()
                .gap(8.0)
                .child(section_label(k, "安装详情"))
                .child(
                    col()
                        .w_full()
                        .gap(0.0)
                        .child(setting_row(k, "汉化状态", state_badge(k, status)))
                        .child(divider(k))
                        .child(setting_row(
                            k,
                            "原文件备份",
                            text(if has_backup {
                                "已安全备份"
                            } else {
                                "尚未创建"
                            })
                            .font(k.ty.ui)
                            .color(if has_backup {
                                k.c.text_base
                            } else {
                                k.c.text_muted
                            }),
                        ))
                        .child(divider(k))
                        .child(setting_row(
                            k,
                            "可用版本",
                            text(format!("{} 个", state.installs.len()))
                                .font(k.ty.ui)
                                .color(k.c.text_base),
                        )),
                ),
        );

    let mut content = content;
    if let Some(notice) = &state.notice {
        content = content.child(notice_row(k, notice));
    }

    let patch_label = if status == PatchState::Patched {
        "重新应用汉化"
    } else {
        "应用汉化"
    };

    let patch_button = Button::new(patch_label)
        .variant(ButtonVariant::Submit)
        .control_size(ControlSize::Large)
        .icon(&icons::CHECK)
        .disabled(!state.can_patch())
        .on_press_tx(|state: &mut State, tx: &mut rune::Tx| {
            start_action(state, Activity::Patch, tx);
        })
        .build(k);

    let restore_button = Button::new("还原英文")
        .variant(ButtonVariant::Neutral)
        .control_size(ControlSize::Large)
        .icon(&icons::OUTLINE_UNDO)
        .disabled(!state.can_restore())
        .on_press_tx(|state: &mut State, tx: &mut rune::Tx| {
            start_action(state, Activity::Restore, tx);
        })
        .build(k);

    content = content
        .child(
            row()
                .w_full()
                .gap(8.0)
                .pt(2.0)
                .child(patch_button)
                .child(restore_button),
        )
        .child(
            text(action_hint(state, status, has_backup))
                .font(k.ty.small)
                .color(k.c.text_faint),
        );

    col()
        .key("main-panel")
        .grow(1.0)
        .h_full()
        .min_h(0.0)
        .mr(10.0)
        .mb(10.0)
        .fill(k.c.bg_base)
        .border(1.0, k.c.border_base)
        .radius(10.0)
        .child(topbar)
        .child(divider(k))
        .child(
            col()
                .w_full()
                .grow(1.0)
                .min_h(0.0)
                .scroll(rune::ScrollSpec { stick_bottom: false })
                .child(content),
        )
}

fn version_panel(selected: Option<&InstallView>, status: PatchState, k: &Kit) -> El {
    let version = selected
        .map(|entry| format!("GitHub Desktop {}", entry.install.version))
        .unwrap_or_else(|| "未选择版本".to_owned());
    let path = selected
        .map(|entry| entry.install.app_dir.display().to_string())
        .unwrap_or_else(|| "--".to_owned());

    let mut panel = col()
        .w_full()
        .gap(8.0)
        .padding(12.0)
        .fill(k.c.layer_01)
        .border(1.0, k.c.border_base)
        .radius(8.0)
        .child(
            row()
                .gap(8.0)
                .center_y()
                .child(icon(&icons::GITHUB, 16.0).color(k.c.icon_muted))
                .child(
                    text(version)
                        .font(text_primary(14.0, 600.0))
                        .color(k.c.text_base)
                        .grow(1.0),
                )
                .child(state_badge(k, status)),
        );

    panel = panel.child(
        row()
            .w_full()
            .gap(8.0)
            .center_y()
            .child(
                text("安装目录")
                    .font(k.ty.small)
                    .color(k.c.text_faint),
            )
            .child(
                text(path)
                    .font(k.ty.small)
                    .color(k.c.text_muted)
                    .grow(1.0)
                    .truncate(),
            ),
    );
    panel
}

fn setting_row(k: &Kit, label: &str, value: El) -> El {
    row()
        .h(40.0)
        .w_full()
        .center_y()
        .justify_between()
        .gap(12.0)
        .child(text(label).font(k.ty.ui).color(k.c.text_muted))
        .child(value)
}

fn notice_row(k: &Kit, notice: &Notice) -> El {
    let (fg, bg, border, glyph) = match notice.tone {
        NoticeTone::Info => (k.c.info.fg, k.c.info.bg, k.c.info.border, &icons::INFO),
        NoticeTone::Success => (
            k.c.success.fg,
            k.c.success.bg,
            k.c.success.border,
            &icons::CHECK,
        ),
        NoticeTone::Error => (
            k.c.danger.fg,
            k.c.danger.bg,
            k.c.danger.border,
            &icons::CIRCLE_XMARK,
        ),
    };
    row()
        .w_full()
        .padding(10.0)
        .gap(8.0)
        .radius(6.0)
        .fill(bg)
        .border(1.0, border)
        .role(if notice.tone == NoticeTone::Error {
            "alert"
        } else {
            "status"
        })
        .child(icon(glyph, 15.0).color(fg).a11y_hidden())
        .child(
            text(notice.text.clone())
                .font(k.ty.ui)
                .color(fg)
                .wrap()
                .grow(1.0),
        )
}

fn action_hint(state: &State, status: PatchState, has_backup: bool) -> &'static str {
    if state.busy {
        return match state.activity {
            Some(Activity::Refresh) => "正在刷新安装与运行状态…",
            _ => "正在处理文件，请勿关闭程序…",
        };
    }
    if state.selected_view().is_none() {
        return "请先安装 GitHub Desktop。";
    }
    if !state.process_ready() {
        return "操作前请关闭 GitHub Desktop，然后刷新状态。";
    }
    if status == PatchState::Broken && has_backup {
        return "检测到异常状态，请先使用备份还原。";
    }
    if status == PatchState::Broken {
        return "补丁或备份不完整，建议重装 GitHub Desktop。";
    }
    "操作只修改所选版本，原文件会保留备份。"
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

pub fn run() {
    use std::io::Write;
    let log_path = std::env::temp_dir().join("github-desktop-zh-run.log");
    let mut log = std::fs::File::create(&log_path).ok();
    if let Some(file) = &mut log {
        let _ = writeln!(file, "start version={}", tool_version());
    }

    // A second launch focuses the existing window instead of opening another one.
    let claimed = rune::single_instance("com.phonetofr.githubdesktop-zh");
    if let Some(file) = &mut log {
        let _ = writeln!(file, "single_instance={claimed}");
    }
    if !claimed {
        return;
    }

    let spec = AppSpec::<State> {
        min_size: Some(MIN_WINDOW_SIZE),
        poll: Some(poll),
        fonts: FONTS,
        families: FAMILIES,
        ..AppSpec::new(TOOL_NAME, WINDOW_SIZE, State::init, view)
    };
    let _ = crate::assets::check_assets();
    let app = rune::App::new(spec)
        .titlebar(Titlebar::new(TITLEBAR_HEIGHT))
        .args(Vec::new());
    match app.try_run() {
        Ok(()) => {
            if let Some(file) = &mut log {
                let _ = writeln!(file, "exit ok");
            }
        }
        Err(error) => {
            if let Some(file) = &mut log {
                let _ = writeln!(file, "exit error: {error}");
            }
        }
    }
}
