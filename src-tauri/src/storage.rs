use std::{fs, path::PathBuf};

use tauri::{AppHandle, Manager};

use crate::{
    error::{message, AppResult},
    models::{AppSettings, CommandProfile, CommandRuntimeValues},
};

const COMMANDS_FILE: &str = "commands.json";
const COMMAND_RUNTIME_VALUES_FILE: &str = "command-runtime-values.json";
const SETTINGS_FILE: &str = "settings.json";
const CURRENT_COMMAND_CONFIG_VERSION: u32 = 4;

#[derive(Debug, serde::Deserialize, serde::Serialize)]
struct CommandConfigFile {
    version: u32,
    commands: Vec<CommandProfile>,
}

pub fn load_commands(app: &AppHandle) -> AppResult<Vec<CommandProfile>> {
    let path = app_file(app, COMMANDS_FILE)?;
    if !path.exists() {
        return Ok(default_commands());
    }
    let content = fs::read_to_string(&path)?;
    let trimmed = content.trim_start();
    let commands = if trimmed.starts_with('[') {
        // 兼容 schemaVersion 之前保存的旧数组格式。
        serde_json::from_str::<Vec<CommandProfile>>(&content)
            .map_err(|error| message(format!("配置文件格式无效：{error}")))?
    } else {
        let cleaned = drop_scp_commands(&content)?;
        let file: CommandConfigFile = serde_json::from_str(&cleaned)
            .map_err(|error| message(format!("配置文件格式无效：{error}")))?;
        if file.version > CURRENT_COMMAND_CONFIG_VERSION {
            return Err(message("命令配置来自更新版本，当前版本无法读取。"));
        }
        file.commands
    };
    validate_commands(&commands)?;
    Ok(commands)
}

/// 旧版本支持图形化 SCP 命令；快捷运行模型不再携带传输配置，
/// 加载时直接丢弃 SCP 条目，避免留下无法执行的空命令。
fn drop_scp_commands(content: &str) -> AppResult<String> {
    let mut value: serde_json::Value = serde_json::from_str(content)
        .map_err(|error| message(format!("配置文件格式无效：{error}")))?;
    if let Some(commands) = value
        .get_mut("commands")
        .and_then(|commands| commands.as_array_mut())
    {
        commands
            .retain(|command| command.get("kind").and_then(|kind| kind.as_str()) != Some("scp"));
    }
    serde_json::to_string(&value).map_err(|error| message(error.to_string()))
}

pub fn save_commands(app: &AppHandle, commands: &[CommandProfile]) -> AppResult<()> {
    validate_commands(commands)?;
    let file = CommandConfigFile {
        version: CURRENT_COMMAND_CONFIG_VERSION,
        commands: commands.to_vec(),
    };
    write_json(&app_file(app, COMMANDS_FILE)?, &file)
}

pub fn load_command_runtime_values(app: &AppHandle) -> AppResult<CommandRuntimeValues> {
    let path = app_file(app, COMMAND_RUNTIME_VALUES_FILE)?;
    if !path.exists() {
        return Ok(CommandRuntimeValues::new());
    }
    read_json(&path)
}

pub fn save_command_runtime_values(
    app: &AppHandle,
    values: &CommandRuntimeValues,
) -> AppResult<()> {
    if values.len() > 500 {
        return Err(message("命令运行参数状态数量不能超过 500 项。"));
    }
    write_json(&app_file(app, COMMAND_RUNTIME_VALUES_FILE)?, values)
}

pub fn load_settings(app: &AppHandle) -> AppResult<AppSettings> {
    let path = app_file(app, SETTINGS_FILE)?;
    if !path.exists() {
        return Ok(AppSettings::default());
    }
    let mut settings: AppSettings = read_json(&path)?;
    // 将旧版本内置默认快捷键迁移到 Ctrl + Space；用户自定义的其它快捷键保持不变。
    if settings.global_shortcut == "CommandOrControl+Shift+Space" {
        settings.global_shortcut = "CommandOrControl+Space".to_string();
    }
    Ok(settings)
}

pub fn save_settings(app: &AppHandle, settings: &AppSettings) -> AppResult<()> {
    if settings.global_shortcut.trim().is_empty() {
        return Err(message("全局快捷键不能为空。"));
    }
    write_json(&app_file(app, SETTINGS_FILE)?, settings)
}

fn app_file(app: &AppHandle, file_name: &str) -> AppResult<PathBuf> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| message(error.to_string()))?;
    fs::create_dir_all(&directory)?;
    Ok(directory.join(file_name))
}

fn read_json<T: serde::de::DeserializeOwned>(path: &PathBuf) -> AppResult<T> {
    let content = fs::read_to_string(path)?;
    serde_json::from_str(&content).map_err(|error| message(format!("配置文件格式无效：{error}")))
}

fn write_json<T: serde::Serialize + ?Sized>(path: &PathBuf, value: &T) -> AppResult<()> {
    let content =
        serde_json::to_string_pretty(value).map_err(|error| message(error.to_string()))?;
    let temporary_path = path.with_extension("json.tmp");
    fs::write(&temporary_path, content)?;
    if path.exists() {
        fs::remove_file(path)?;
    }
    fs::rename(temporary_path, path)?;
    Ok(())
}

fn validate_commands(commands: &[CommandProfile]) -> AppResult<()> {
    if commands.len() > 500 {
        return Err(message("最多保存 500 条命令。"));
    }
    for command in commands {
        if command.id.trim().is_empty() || command.name.trim().is_empty() {
            return Err(message("命令 ID 和名称不能为空。"));
        }
        if command.name.chars().count() > 200 {
            return Err(message("命令名称不能超过 200 个字符。"));
        }
        if command.command.len() > 16_384 {
            return Err(message("命令内容不能超过 16 KB。"));
        }
        if let Some(extension) = &command.extension {
            if extension.mode != "increment" && extension.mode != "input" {
                return Err(message("不支持的扩展参数模式。"));
            }
            if extension.start < 0 {
                return Err(message("扩展参数的起始值不能是负数。"));
            }
            if extension.mode == "increment" && extension.step <= 0 {
                return Err(message("扩展参数的递增步长必须是正整数。"));
            }
        }
    }
    Ok(())
}

fn default_commands() -> Vec<CommandProfile> {
    vec![
        CommandProfile {
            id: "open-powershell".to_string(),
            name: "PowerShell".to_string(),
            command: String::new(),
            shell_id: "powershell".to_string(),
            cwd: String::new(),
            pinned: true,
            extension: None,
        },
        CommandProfile {
            id: "git-status".to_string(),
            name: "Git 状态".to_string(),
            command: "git status".to_string(),
            shell_id: "git-bash".to_string(),
            cwd: String::new(),
            pinned: false,
            extension: None,
        },
        CommandProfile {
            id: "open-cmd".to_string(),
            name: "CMD".to_string(),
            command: String::new(),
            shell_id: "cmd".to_string(),
            cwd: String::new(),
            pinned: false,
            extension: None,
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_commands_without_name() {
        let commands = [CommandProfile {
            id: "a".to_string(),
            name: "  ".to_string(),
            command: String::new(),
            shell_id: "cmd".to_string(),
            cwd: String::new(),
            pinned: false,
            extension: None,
        }];
        assert!(validate_commands(&commands).is_err());
    }

    #[test]
    fn accepts_increment_extension_but_rejects_bad_step() {
        let base = CommandProfile {
            id: "deploy".to_string(),
            name: "部署".to_string(),
            command: "python deploy.py --build-no {{ext}}".to_string(),
            shell_id: "powershell".to_string(),
            cwd: String::new(),
            pinned: false,
            extension: Some(crate::models::CommandExtension {
                mode: "increment".to_string(),
                start: 100,
                step: 1,
            }),
        };
        assert!(validate_commands(&[base.clone()]).is_ok());

        let bad_step = CommandProfile {
            extension: Some(crate::models::CommandExtension {
                mode: "increment".to_string(),
                start: 1,
                step: 0,
            }),
            ..base
        };
        assert!(validate_commands(&[bad_step]).is_err());
    }

    #[test]
    fn parses_v3_config_and_drops_scp_commands() {
        let content = r#"{
            "version": 3,
            "commands": [
                {
                    "schemaVersion": 3,
                    "id": "deploy",
                    "name": "部署固件",
                    "command": "",
                    "shellId": "powershell",
                    "cwd": "",
                    "parameters": [],
                    "kind": "scp",
                    "scp": { "direction": "upload" },
                    "execution": { "retryCount": 0, "mode": "interactive" },
                    "pinned": false,
                    "confirmBeforeRun": false
                },
                {
                    "schemaVersion": 3,
                    "id": "git-status",
                    "name": "Git 状态",
                    "command": "git status",
                    "shellId": "git-bash",
                    "cwd": "",
                    "parameters": [
                        { "id": "p1", "key": "buildNo", "label": "构建号", "type": "number" }
                    ],
                    "kind": "shell",
                    "execution": { "retryCount": 2, "mode": "tracked" },
                    "pinned": true,
                    "confirmBeforeRun": true
                }
            ]
        }"#;

        let cleaned = drop_scp_commands(content).expect("迁移失败");
        let file: CommandConfigFile = serde_json::from_str(&cleaned).expect("解析失败");
        assert_eq!(file.commands.len(), 1);
        assert_eq!(file.commands[0].id, "git-status");
        assert_eq!(file.commands[0].name, "Git 状态");
        assert!(file.commands[0].pinned);
        assert!(file.commands[0].command == "git status");
    }
}
