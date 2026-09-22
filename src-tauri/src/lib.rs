mod commands;
mod error;
mod models;
mod pty;
mod storage;

use std::sync::atomic::{AtomicU8, Ordering};

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Runtime, WindowEvent,
};
use tauri_plugin_global_shortcut::{Shortcut, ShortcutEvent, ShortcutState};
use tauri_plugin_single_instance::init as init_single_instance;

use commands::{
    detect_shells, frontend_ready, launch_shell_process, load_app_settings, load_command_profiles,
    load_command_runtime_values, save_app_settings, save_command_profiles,
    save_command_runtime_values,
};

const FRONTEND_LOADING: u8 = 0;
const FRONTEND_READY: u8 = 1;
const PENDING_NONE: u8 = 0;
const PENDING_SHOW: u8 = 1;
const PENDING_MANAGE: u8 = 2;

/// 前端 React 是否已完成首次挂载；WebView 初始化期间的数秒内窗口绝不能提前显示，否则白屏。
static FRONTEND_STATE: AtomicU8 = AtomicU8::new(FRONTEND_LOADING);
/// 加载期间收到的显示意图，等 frontend_ready 后补执行。
static PENDING_ACTIVATE: AtomicU8 = AtomicU8::new(PENDING_NONE);

/// 显示并聚焦命令面板，随后通知前端重新加载命令并聚焦输入框。
fn show_palette<R: Runtime>(app: &AppHandle<R>) {
    if FRONTEND_STATE.load(Ordering::SeqCst) != FRONTEND_READY {
        PENDING_ACTIVATE.store(PENDING_SHOW, Ordering::SeqCst);
        return;
    }
    show_palette_now(app);
}

/// 进入管理模式；托盘「管理命令」入口。
fn request_manage<R: Runtime>(app: &AppHandle<R>) {
    if FRONTEND_STATE.load(Ordering::SeqCst) != FRONTEND_READY {
        PENDING_ACTIVATE.store(PENDING_MANAGE, Ordering::SeqCst);
        return;
    }
    show_palette_now(app);
    let _ = app.emit_to("main", "palette-manage-requested", ());
}

fn show_palette_now<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        let _ = app.emit_to("main", "palette-activated", ());
    }
}

/// 前端首帧渲染完成后调用；此后才允许显示窗口，并补执行加载期间的显示请求。
pub fn mark_frontend_ready(app: &AppHandle) {
    FRONTEND_STATE.store(FRONTEND_READY, Ordering::SeqCst);
    match PENDING_ACTIVATE.swap(PENDING_NONE, Ordering::SeqCst) {
        PENDING_MANAGE => {
            show_palette_now(app);
            let _ = app.emit_to("main", "palette-manage-requested", ());
        }
        PENDING_SHOW => show_palette_now(app),
        _ => {}
    }
}

fn handle_global_shortcut<R: Runtime>(
    app: &AppHandle<R>,
    _shortcut: &Shortcut,
    event: ShortcutEvent,
) {
    if event.state != ShortcutState::Pressed {
        return;
    }

    if let Some(window) = app.get_webview_window("main") {
        let visible = window.is_visible().unwrap_or(false);
        let minimized = window.is_minimized().unwrap_or(false);

        if visible && !minimized {
            let _ = window.hide();
            return;
        }

        show_palette(app);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        // 必须在其他插件之前注册，第二次启动时由插件转发参数并退出新进程。
        // 这里把已有主窗口唤起，确保从开始菜单、桌面快捷方式重复启动时行为一致。
        .plugin(init_single_instance(|app, _argv, _cwd| {
            show_palette(app);
        }))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(handle_global_shortcut)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            detect_shells,
            load_command_profiles,
            save_command_profiles,
            load_command_runtime_values,
            save_command_runtime_values,
            load_app_settings,
            save_app_settings,
            launch_shell_process,
            frontend_ready,
        ])
        .setup(|app| {
            let show_main =
                MenuItem::with_id(app, "show-main", "打开 QuickShell", true, None::<&str>)?;
            let check_updates =
                MenuItem::with_id(app, "check-updates", "检查更新", true, None::<&str>)?;
            let manage = MenuItem::with_id(app, "manage-commands", "管理命令", true, None::<&str>)?;
            let settings = MenuItem::with_id(app, "settings", "设置", true, None::<&str>)?;
            let separator = PredefinedMenuItem::separator(app)?;
            let quit = MenuItem::with_id(app, "quit", "退出 QuickShell", true, None::<&str>)?;
            let menu = Menu::with_items(
                app,
                &[&show_main, &check_updates, &manage, &settings, &separator, &quit],
            )?;

            TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("QuickShell")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show-main" => show_palette(app),
                    "check-updates" => {
                        let _ = app.emit_to("main", "tray-check-updates", ());
                    }
                    "manage-commands" => request_manage(app),
                    "settings" => {
                        let _ = app.emit_to("main", "tray-open-settings", ());
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if matches!(
                        &event,
                        TrayIconEvent::DoubleClick {
                            button: MouseButton::Left,
                            ..
                        }
                    ) {
                        show_palette(&tray.app_handle());
                    }
                })
                .build(app)?;

            // Windows 在创建无边框窗口时可能忽略配置中的 visible=false，
            // 初始化完成后再次隐藏，确保启动时只显示托盘图标。
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.hide();
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("QuickShell 启动失败");
}
