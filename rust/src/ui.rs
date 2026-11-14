use std::sync::mpsc::{self, Receiver, TryRecvError};
use std::time::Duration;

use rune::{AppSpec, Color, Cx, El, Icon, TextStyle, Titlebar, col, el, icon, row, text};
use rune_kit::{
    Badge, BadgeVariant, Button, ButtonVariant, Card, ControlSize, IconButton, IconButtonVariant,
    Kit, PaletteSeed, Select, SelectAppearance, Spinner,
};

use crate::application::{InstallView, Snapshot, apply_patch, get_snapshot, restore_original};
use crate::assets::{TOOL_NAME, counts, tool_version};
use crate::error::Result;
use crate::install::{AppInstall, PatchState, find_installs};
use crate::patcher::{DesktopProcessState, PatchResult, get_desktop_process_state};
use crate::platform::open_url;

const WINDOW_SIZE: (f32, f32) = (1040.0, 560.0);
const MIN_WINDOW_SIZE: (f32, f32) = (860.0, 540.0);
const TITLEBAR_HEIGHT: f32 = 48.0;
const REPOSITORY_URL: &str = "https://github.com/PhonetoFR/githubdesktop-zh";

// ---------------------------------------------------------------------------
// Icons (SVG bodies for Rune's icon rasteriser)
// ---------------------------------------------------------------------------

static ICON_BRANCH: Icon = Icon {
    name: "zh-branch",
    view: 24.0,
    body: r#"<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6.5" cy="5" r="2.2"/><circle cx="18" cy="6" r="2.2"/><circle cx="6.5" cy="19" r="2.2"/><path d="M6.5 7.2v9.6M8.7 10.5h4.2A5.1 5.1 0 0 0 18 8.2"/></g>"#,
};

static ICON_CHECK: Icon = Icon {
    name: "zh-check",
    view: 24.0,
    body: r#"<path d="M5 12.5l4.2 4.2L19 6.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>"#,
};

static ICON_RESTORE: Icon = Icon {
    name: "zh-restore",
    view: 24.0,
    body: r#"<path d="M4 9v6h6M5.3 15A7.2 7.2 0 1 0 6.8 6.8L4 9.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>"#,
};

static ICON_REFRESH: Icon = Icon {
    name: "zh-refresh",
    view: 24.0,
    body: r#"<path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>"#,
};

static ICON_EXTERNAL: Icon = Icon {
    name: "zh-external",
    view: 24.0,
    body: r#"<path d="M14 4h6v6M20 4l-9 9M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>"#,
};

static ICON_DESKTOP: Icon = Icon {
    name: "zh-desktop",
    view: 24.0,
    body: r#"<rect x="3" y="4.5" width="18" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9 20h6M12 16.5V20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>"#,
};

static ICON_INFO: Icon = Icon {
    name: "zh-info",
    view: 24.0,
    body: r#"<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 11v5M12 7.8v.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>"#,
};

static ICON_ERROR: Icon = Icon {
    name: "zh-error",
    view: 24.0,
    body: r#"<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m8.5 8.5 7 7M15.5 8.5l-7 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>"#,
};

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
    select_open: bool,
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
            select_open: false,
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
// Theme
// ---------------------------------------------------------------------------

fn color(hex: &str) -> Color {
    rune::color::hex(hex).unwrap_or(Color::WHITE)
}

fn theme(dark: bool) -> Kit {
    let bg = if dark {
        color("#0d1117")
    } else {
        color("#f3f6fa")
    };
    let fg = if dark {
        color("#e6edf3")
    } else {
        color("#1f2328")
    };
    let accent = color("#2f81f7");
    let mut kit = Kit::from_palette(PaletteSeed { bg, fg, accent });
    kit.c.page = bg;
    kit.c.bg_base = if dark { color("#161b22") } else { Color::WHITE };
    kit.c.bg_button_neutral = kit.c.bg_base;
    kit.c.bg_icon_button_contrast = accent;
    kit.c.submit_fg = Color::WHITE;
    kit.c.submit_icon = Color::WHITE;
    kit.c.text_base = fg;
    kit.c.text_muted = if dark {
        color("#8b949e")
    } else {
        color("#57606a")
    };
    kit.c.text_faint = if dark {
        color("#6e7681")
    } else {
        color("#6e7781")
    };
    kit.c.border_base = if dark {
        color("#30363d")
    } else {
        color("#d0d7de")
    };
    kit.c.border_weak = if dark {
        color("#21262d")
    } else {
        color("#e6eaef")
    };
    kit.c.layer_01 = if dark {
        color("#0d1117")
    } else {
        color("#ffffff")
    };
    kit.c.layer_02 = if dark {
        color("#161b22")
    } else {
        color("#f6f8fa")
    };
    kit.ty.ui = TextStyle::new(13.5, 400.0).lh(21.0);
    kit.ty.ui_medium = TextStyle {
        weight: 600.0,
        ..kit.ty.ui
    };
    kit.ty.body = TextStyle::new(14.0, 400.0).lh(22.0);
    kit.ty.body_medium = TextStyle {
        weight: 600.0,
        ..kit.ty.body
    };
    kit.ty.small = TextStyle::new(11.5, 400.0).lh(16.0);
    kit.ty.small_medium = TextStyle {
        weight: 500.0,
        ..kit.ty.small
    };
    kit.radius.md = 8.0;
    kit.radius.lg = 14.0;
    kit
}

fn card_shell(k: &Kit) -> El {
    col()
        .fill(k.c.bg_base)
        .border(0.5, k.c.border_base)
        .radius(k.radius.lg)
        .shadow(1.0, 2.0, Color::BLACK.alpha(0.06))
        .shadow(8.0, 24.0, Color::BLACK.alpha(0.05))
}

fn divider(k: &Kit) -> El {
    el().h(1.0).w_full().fill(k.c.border_weak).a11y_hidden()
}

fn eyebrow(k: &Kit, label: &str) -> El {
    text(label)
        .font(k.ty.small_medium)
        .color(k.c.text_faint)
        .a11y_hidden()
}

fn pill(k: &Kit, label: &str, fg: Color, bg: Color) -> El {
    row()
        .h(23.0)
        .px(9.0)
        .radius(11.5)
        .fill(bg)
        .label(label)
        .child(text(label).font(k.ty.small_medium).color(fg).a11y_hidden())
}

fn detail_row(k: &Kit, label: &str, value: El) -> El {
    row()
        .w_full()
        .center_y()
        .justify_between()
        .gap(12.0)
        .child(text(label).font(k.ty.ui).color(k.c.text_muted))
        .child(value)
}

fn status_pill(k: &Kit, state: PatchState) -> El {
    match state {
        PatchState::None => pill(k, "未汉化", k.c.text_muted, k.c.layer_02),
        PatchState::Patched => pill(k, "已汉化", k.c.success.fg, k.c.success.bg),
        PatchState::Restored => pill(k, "已还原", k.c.info.fg, k.c.info.bg),
        PatchState::Broken => pill(k, "状态异常", k.c.danger.fg, k.c.danger.bg),
    }
}

fn process_visual(
    k: &Kit,
    state: DesktopProcessState,
    refreshing: bool,
) -> (El, String, String, Color) {
    if refreshing {
        return (
            pill(k, "检测中", k.c.text_muted, k.c.layer_02),
            "正在检测 GitHub Desktop".to_owned(),
            "请稍候".to_owned(),
            k.c.text_faint,
        );
    }
    match state {
        DesktopProcessState::NotRunning => (
            pill(k, "可以操作", k.c.success.fg, k.c.success.bg),
            "GitHub Desktop 已关闭".to_owned(),
            "可以安全地应用汉化或还原文件".to_owned(),
            k.c.success.fg,
        ),
        DesktopProcessState::Running => (
            pill(k, "需要关闭", k.c.warning.fg, k.c.warning.bg),
            "GitHub Desktop 正在运行".to_owned(),
            "请先关闭应用，再点击刷新".to_owned(),
            k.c.warning.fg,
        ),
        DesktopProcessState::Unknown => (
            pill(k, "检测失败", k.c.danger.fg, k.c.danger.bg),
            "无法确认 GitHub Desktop 状态".to_owned(),
            "为保护程序文件，操作已禁用".to_owned(),
            k.c.danger.fg,
        ),
    }
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

fn view(state: &State, cx: &mut Cx<State>) -> El {
    let dark = cx.system_dark();
    let k = theme(dark);
    cx.caption_color(k.c.text_base);
    let insets = cx.chrome_insets();
    let mut layer = Vec::new();

    let header = row()
        .key("header")
        .window_drag()
        .h(76.0)
        .w_full()
        .px(24.0)
        .pr(insets.trailing + 16.0)
        .gap(14.0)
        .center_y()
        .child(
            el().size(44.0, 44.0)
                .radius(13.0)
                .fill(k.c.bg_accent)
                .center()
                .child(icon(&ICON_BRANCH, 26.0).color(k.c.text_contrast))
                .a11y_hidden(),
        )
        .child(
            col()
                .gap(2.0)
                .child(
                    text(TOOL_NAME)
                        .font(TextStyle::new(20.0, 650.0).lh(26.0))
                        .color(k.c.text_base),
                )
                .child(
                    text("安全应用简体中文翻译，随时可还原。")
                        .font(k.ty.ui)
                        .color(k.c.text_muted),
                ),
        )
        .child(el().grow(1.0))
        .child(
            Badge::new(format!("v{}", tool_version()))
                .variant(BadgeVariant::Subtle)
                .standard()
                .build(&k),
        );

    let content = col()
        .w_full()
        .max_w(1120.0)
        .gap(16.0)
        .px(24.0)
        .pt(4.0)
        .pb(24.0)
        .child(
            row()
                .w_full()
                .items_start()
                .gap(16.0)
                .child(status_card(state, &k))
                .child(operation_card(state, &k, &mut layer)),
        )
        .child(footer(&k, state));

    let body = col().w_full().h_full().fill(k.c.page).child(header).child(
        row().w_full().grow(1.0).min_h(0.0).justify_center().child(
            col()
                .w_full()
                .h_full()
                .min_h(0.0)
                .scroll(rune::ScrollSpec {
                    stick_bottom: false,
                })
                .child(row().w_full().justify_center().child(content)),
        ),
    );

    rune_kit::root(body, layer)
}

fn status_card(state: &State, k: &Kit) -> El {
    let refreshing = state.busy && state.activity == Some(Activity::Refresh);
    let (pill_el, title, description, dot_color) =
        process_visual(k, state.process_state(), refreshing);

    let install_count = state
        .snapshot
        .as_ref()
        .map(|snapshot| snapshot.installs.len())
        .unwrap_or(0);
    let newest = state
        .snapshot
        .as_ref()
        .and_then(|snapshot| snapshot.newest_version.clone())
        .unwrap_or_else(|| "--".to_owned());

    let mut card = card_shell(k)
        .key("status-card")
        .w(300.0)
        .padding(20.0)
        .gap(14.0);
    card = card
        .child(eyebrow(k, "应用状态"))
        .child(
            row()
                .gap(10.0)
                .center_y()
                .child(
                    el().size(18.0, 18.0)
                        .center()
                        .a11y_hidden()
                        .child(el().size(10.0, 10.0).radius(5.0).fill(dot_color)),
                )
                .child(
                    text(title)
                        .font(TextStyle::new(18.0, 650.0).lh(24.0))
                        .color(k.c.text_base)
                        .grow(1.0),
                ),
        )
        .child(
            text(description)
                .font(k.ty.ui)
                .color(k.c.text_muted)
                .wrap()
                .w_full(),
        )
        .child(row().gap(8.0).child(pill_el))
        .child(divider(k))
        .child(detail_row(
            k,
            "可用版本",
            text(format!("{install_count} 个"))
                .font(k.ty.ui_medium)
                .color(k.c.text_base),
        ))
        .child(detail_row(
            k,
            "当前版本",
            text(newest).font(k.ty.ui_medium).color(k.c.text_base),
        ))
        .child(
            text("原文件会备份为 .bak，可随时还原。")
                .font(k.ty.small)
                .color(k.c.text_faint)
                .wrap()
                .w_full(),
        );

    if let Some(error) = &state.fatal_error {
        card = card.child(
            text(error)
                .font(k.ty.ui)
                .color(k.c.danger.fg)
                .wrap()
                .w_full(),
        );
    }

    card
}

fn operation_card(state: &State, k: &Kit, layer: &mut Vec<El>) -> El {
    let selected = state.selected_view();
    let status = selected
        .map(|entry| entry.status.state)
        .unwrap_or(PatchState::None);
    let has_backup = selected
        .map(|entry| entry.status.has_backup)
        .unwrap_or(false);

    let mut card = Card::new()
        .accent(k.c.icon_accent)
        .title("目标安装", Some(&ICON_DESKTOP))
        .description("选择要处理的 GitHub Desktop 版本");

    let labels: Vec<String> = state
        .installs
        .iter()
        .map(|install| install.version.clone())
        .collect();
    let current_label = state.selected.clone();

    let selector = if labels.is_empty() {
        row()
            .h(38.0)
            .w_full()
            .px(12.0)
            .radius(k.radius.md)
            .fill(k.c.layer_02)
            .border(0.5, k.c.border_base)
            .center_y()
            .child(
                text("未找到 GitHub Desktop")
                    .font(k.ty.ui)
                    .color(k.c.text_muted),
            )
    } else {
        let mut select = Select::new("version", &labels)
            .current(current_label.as_deref())
            .label("安装版本")
            .appearance(SelectAppearance::Field)
            .width(440.0)
            .open(state.select_open)
            .on_toggle(|state: &mut State| {
                state.select_open = !state.select_open;
            })
            .on_close(|state: &mut State| {
                state.select_open = false;
            })
            .on_choose(|state: &mut State, value: &str, _tx: &mut rune::Tx| {
                state.selected = Some(value.to_owned());
                state.select_open = false;
                state.notice = None;
            });
        if state.busy {
            select = select.state(rune_kit::State::Disabled);
        }
        select.build(k, layer)
    };

    card = card.child(col().gap(6.0).child(eyebrow(k, "安装版本")).child(selector));

    card = card
        .child(divider(k))
        .child(detail_row(k, "汉化状态", status_pill(k, status)))
        .child(detail_row(
            k,
            "原文件备份",
            text(if has_backup {
                "已安全备份"
            } else {
                "尚未创建"
            })
            .font(k.ty.ui_medium)
            .color(if has_backup {
                k.c.text_base
            } else {
                k.c.text_muted
            }),
        ));

    if let Some(notice) = &state.notice {
        card = card.child(notice_row(k, notice));
    }

    let patch_label = if status == PatchState::Patched {
        "重新应用汉化"
    } else {
        "应用汉化"
    };

    let patch_button = Button::new(patch_label)
        .variant(ButtonVariant::Submit)
        .control_size(ControlSize::ExtraLarge)
        .icon(&ICON_CHECK)
        .disabled(!state.can_patch())
        .on_press_tx(|state: &mut State, tx: &mut rune::Tx| {
            start_action(state, Activity::Patch, tx);
        })
        .build(k);

    let restore_button = Button::new("还原英文")
        .variant(ButtonVariant::Outline)
        .control_size(ControlSize::ExtraLarge)
        .icon(&ICON_RESTORE)
        .disabled(!state.can_restore())
        .on_press_tx(|state: &mut State, tx: &mut rune::Tx| {
            start_action(state, Activity::Restore, tx);
        })
        .build(k);

    card = card
        .child(
            row()
                .w_full()
                .gap(10.0)
                .pt(2.0)
                .child(patch_button)
                .child(restore_button),
        )
        .child(
            text(action_hint(state, status, has_backup))
                .font(k.ty.small)
                .color(k.c.text_faint)
                .wrap()
                .w_full(),
        );

    card.build(k)
        .key("operation-card")
        .grow(1.0)
        .fill(k.c.bg_base)
        .border(0.5, k.c.border_base)
        .radius(k.radius.lg)
        .shadow(1.0, 2.0, Color::BLACK.alpha(0.06))
        .shadow(8.0, 24.0, Color::BLACK.alpha(0.05))
        .padding(8.0)
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

fn notice_row(k: &Kit, notice: &Notice) -> El {
    let (fg, bg, border, icon_body) = match notice.tone {
        NoticeTone::Info => (k.c.info.fg, k.c.info.bg, k.c.info.border, &ICON_INFO),
        NoticeTone::Success => (
            k.c.success.fg,
            k.c.success.bg,
            k.c.success.border,
            &ICON_CHECK,
        ),
        NoticeTone::Error => (k.c.danger.fg, k.c.danger.bg, k.c.danger.border, &ICON_ERROR),
    };
    row()
        .w_full()
        .padding(11.0)
        .gap(9.0)
        .radius(k.radius.md)
        .fill(bg)
        .border(0.5, border)
        .role(if notice.tone == NoticeTone::Error {
            "alert"
        } else {
            "status"
        })
        .child(icon(icon_body, 16.0).color(fg).a11y_hidden())
        .child(
            text(notice.text.clone())
                .font(k.ty.ui)
                .color(fg)
                .wrap()
                .grow(1.0),
        )
}

fn footer(k: &Kit, state: &State) -> El {
    let mut refresh = IconButton::new(&ICON_REFRESH)
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

    let spinner = if state.busy {
        Some(Spinner::new().build(k))
    } else {
        None
    };

    let mut right = row().gap(10.0).center_y().child(refresh.build(k));
    if let Some(spinner) = spinner {
        right = right.child(spinner);
    }
    right = right.child(
        Button::new("查看项目主页")
            .variant(ButtonVariant::Ghost)
            .icon(&ICON_EXTERNAL)
            .on_press_tx(|state: &mut State, _tx: &mut rune::Tx| {
                if let Err(error) = open_url(REPOSITORY_URL) {
                    state.notice = Some(Notice::error(error.to_string()));
                }
            })
            .build(k),
    );

    row()
        .w_full()
        .center_y()
        .justify_between()
        .gap(12.0)
        .pt(2.0)
        .child(
            text(format!(
                "开源、离线运行，不收集任何数据 · 字典 {} 条 / 规则 {} 条",
                counts().dict_count,
                counts().rules_count
            ))
            .font(k.ty.small)
            .color(k.c.text_faint),
        )
        .child(right)
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
