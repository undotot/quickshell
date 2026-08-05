mod commands;
mod error;
mod models;
mod pty;
mod storage;

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, WindowEvent,
};
use tauri_plugin_single_instance::init as init_single_instance;

use commands::{
    detect_shells, launch_shell_process, load_app_settings, load_command_profiles,
    save_app_settings, save_command_profiles,
};

fn focus_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn emit_main_event(app: &AppHandle, event: &str) {
    let _ = app.emit_to("main", event, ());
    focus_main_window(app);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        // 必须在其他插件之前注册，第二次启动时由插件转发参数并退出新进程。
        // 这里把已有主窗口唤起，确保从开始菜单、桌面快捷方式重复启动时行为一致。
        .plugin(init_single_instance(|app, _argv, _cwd| {
            focus_main_window(app);
        }))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            detect_shells,
            load_command_profiles,
            save_command_profiles,
            load_app_settings,
            save_app_settings,
            launch_shell_process,
        ])
        .setup(|app| {
            let show_main = MenuItem::with_id(app, "show-main", "显示主窗口", true, None::<&str>)?;
            let check_updates =
                MenuItem::with_id(app, "check-updates", "检查更新", true, None::<&str>)?;
            let manage_commands =
                MenuItem::with_id(app, "manage-commands", "管理命令", true, None::<&str>)?;
            let shortcut_settings =
                MenuItem::with_id(app, "shortcut-settings", "设置快捷键", true, None::<&str>)?;
            let separator = PredefinedMenuItem::separator(app)?;
            let quit = MenuItem::with_id(app, "quit", "退出 QuickShell", true, None::<&str>)?;
            let menu = Menu::with_items(
                app,
                &[
                    &show_main,
                    &check_updates,
                    &manage_commands,
                    &shortcut_settings,
                    &separator,
                    &quit,
                ],
            )?;

            TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("QuickShell")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show-main" => focus_main_window(app),
                    "check-updates" => emit_main_event(app, "tray-check-updates"),
                    "manage-commands" => emit_main_event(app, "tray-open-manager"),
                    "shortcut-settings" => emit_main_event(app, "tray-open-shortcut-settings"),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if matches!(
                        event,
                        TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        }
                    ) {
                        focus_main_window(&tray.app_handle());
                    }
                })
                .build(app)?;

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
