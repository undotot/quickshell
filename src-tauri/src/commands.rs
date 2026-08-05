use tauri::AppHandle;

use crate::{
    error::{message, AppResult},
    models::{AppSettings, CommandProfile, ShellProfile},
    pty, storage,
};

#[tauri::command]
pub async fn detect_shells() -> Vec<ShellProfile> {
    tauri::async_runtime::spawn_blocking(pty::detect_shells)
        .await
        .unwrap_or_default()
}

#[tauri::command]
pub async fn load_command_profiles(app: AppHandle) -> AppResult<Vec<CommandProfile>> {
    tauri::async_runtime::spawn_blocking(move || storage::load_commands(&app))
        .await
        .map_err(|error| message(format!("配置读取任务失败：{error}")))?
}

#[tauri::command]
pub async fn save_command_profiles(app: AppHandle, commands: Vec<CommandProfile>) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || storage::save_commands(&app, &commands))
        .await
        .map_err(|error| message(format!("配置保存任务失败：{error}")))?
}

#[tauri::command]
pub async fn load_app_settings(app: AppHandle) -> AppResult<AppSettings> {
    tauri::async_runtime::spawn_blocking(move || storage::load_settings(&app))
        .await
        .map_err(|error| message(format!("设置读取任务失败：{error}")))?
}

#[tauri::command]
pub async fn save_app_settings(app: AppHandle, settings: AppSettings) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || storage::save_settings(&app, &settings))
        .await
        .map_err(|error| message(format!("设置保存任务失败：{error}")))?
}

#[tauri::command]
pub async fn launch_shell_process(
    shell_id: String,
    cwd: String,
    initial_command: String,
) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        pty::launch_shell_process(&shell_id, &cwd, &initial_command)
    })
    .await
    .map_err(|error| message(format!("Shell 启动任务失败：{error}")))?
}
