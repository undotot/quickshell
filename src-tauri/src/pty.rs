use std::{
    path::{Path, PathBuf},
    process::Command,
    sync::OnceLock,
};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

use crate::{
    error::{message, AppResult},
    models::ShellProfile,
};

#[cfg(windows)]
const CREATE_NEW_CONSOLE: u32 = 0x00000010;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// 在独立的原生控制台窗口中启动 Shell。
///
/// Shell 自己拥有真实控制台，用户可以直接输入密码或后续命令，QuickShell
/// 主进程不参与控制台输入输出转发，因此不会因为终端初始化影响主窗口。
pub fn launch_shell_process(shell_id: &str, cwd: &str, initial_command: &str) -> AppResult<()> {
    let (profile, executable, mut args) = resolve_shell(shell_id)?;
    let working_directory = resolve_cwd(cwd)?;
    append_initial_command(&profile.id, &mut args, initial_command.trim());

    let mut process = Command::new(executable);
    #[cfg(windows)]
    if profile.id == "cmd" {
        // cmd.exe 不使用标准 Windows argv 规则解析 /K 后面的命令。
        // 使用 raw_arg 保留路径两侧的双引号，避免 Rust 自动生成 `\"`，
        // 否则 robocopy 等命令会把绝对路径错误拼接到当前目录后面。
        let script = args.get(1).cloned().unwrap_or_default();
        process.raw_arg(format!("/D /S /K {script}"));
    } else {
        process.args(args);
    }
    #[cfg(not(windows))]
    process.args(args);
    if let Some(working_directory) = working_directory {
        process.current_dir(working_directory);
    }

    #[cfg(windows)]
    process.creation_flags(CREATE_NEW_CONSOLE);

    process
        .spawn()
        .map(|_| ())
        .map_err(|error| message(format!("打开 {} 失败：{error}", profile.name)))
}

fn append_initial_command(shell_id: &str, args: &mut Vec<String>, command: &str) {
    match shell_id {
        "cmd" => {
            args.push("/K".to_string());
            let script = if command.is_empty() {
                "prompt $G".to_string()
            } else {
                format!("prompt $G & {command}")
            };
            args.push(script);
        }
        "powershell" | "pwsh" => {
            args.push("-NoExit".to_string());
            args.push("-Command".to_string());
            let script = if command.is_empty() {
                "function prompt { 'PS> ' }".to_string()
            } else {
                format!("function prompt {{ 'PS> ' }}; {command}")
            };
            args.push(script);
        }
        "git-bash" => {
            args.push("-c".to_string());
            let script = if command.is_empty() {
                "export PS1='> '; exec bash --noprofile --norc -i".to_string()
            } else {
                format!("export PS1='> '; {command}; exec bash --noprofile --norc -i")
            };
            args.push(script);
        }
        _ if !command.is_empty() => args.push(command.to_string()),
        _ => {}
    }
}

pub fn detect_shells() -> Vec<ShellProfile> {
    static CACHE: OnceLock<Vec<ShellProfile>> = OnceLock::new();
    CACHE.get_or_init(detect_shells_uncached).clone()
}

fn detect_shells_uncached() -> Vec<ShellProfile> {
    let cmd = command_profile("cmd", "CMD", "cmd.exe".to_string(), Vec::new(), true);
    let powershell_path =
        find_in_path("powershell.exe").unwrap_or_else(|| "powershell.exe".to_string());
    let powershell = command_profile(
        "powershell",
        "Windows PowerShell",
        powershell_path,
        vec!["-NoLogo".to_string()],
        true,
    );
    let pwsh_path = find_in_path("pwsh.exe");
    let pwsh = command_profile(
        "pwsh",
        "PowerShell 7",
        pwsh_path.clone().unwrap_or_else(|| "pwsh.exe".to_string()),
        vec!["-NoLogo".to_string()],
        pwsh_path.is_some(),
    );
    let git_bash_path = find_git_bash();
    let git_bash = command_profile(
        "git-bash",
        "Git Bash",
        git_bash_path
            .clone()
            .unwrap_or_else(|| "bash.exe".to_string()),
        vec!["--login".to_string(), "-i".to_string()],
        git_bash_path.is_some(),
    );
    vec![cmd, powershell, pwsh, git_bash]
}

fn resolve_shell(shell_id: &str) -> AppResult<(ShellProfile, String, Vec<String>)> {
    let profile = detect_shells()
        .into_iter()
        .find(|shell| shell.id == shell_id)
        .ok_or_else(|| message(format!("不支持的 Shell：{shell_id}")))?;
    if !profile.available {
        return Err(message(format!(
            "未检测到 {}，请先安装或修改配置。",
            profile.name
        )));
    }
    Ok((
        profile.clone(),
        profile.executable.clone(),
        profile.args.clone(),
    ))
}

fn resolve_cwd(cwd: &str) -> AppResult<Option<PathBuf>> {
    if cwd.trim().is_empty() {
        return Ok(None);
    }
    let path = PathBuf::from(cwd.trim());
    if !path.is_dir() {
        return Err(message(format!("初始目录不存在：{}", path.display())));
    }
    Ok(Some(path))
}

fn command_profile(
    id: &str,
    name: &str,
    executable: String,
    args: Vec<String>,
    available: bool,
) -> ShellProfile {
    ShellProfile {
        id: id.to_string(),
        name: name.to_string(),
        executable,
        args,
        available,
    }
}

fn find_in_path(executable: &str) -> Option<String> {
    let mut command = Command::new("where.exe");
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);
    let output = command.arg(executable).output().ok()?;
    if !output.status.success() {
        return None;
    }
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .find_map(|line| {
            let path = line.trim();
            (!path.is_empty() && Path::new(path).is_file()).then(|| path.to_string())
        })
}

fn find_git_bash() -> Option<String> {
    let mut candidates = Vec::new();
    if let Ok(program_files) = std::env::var("ProgramFiles") {
        candidates.push(PathBuf::from(program_files).join("Git/bin/bash.exe"));
    }
    if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        candidates.push(PathBuf::from(local_app_data).join("Programs/Git/bin/bash.exe"));
    }
    candidates.push(PathBuf::from(r"C:\Program Files\Git\bin\bash.exe"));
    candidates
        .into_iter()
        .find(|path| path.is_file())
        .map(|path| path.to_string_lossy().into_owned())
        .or_else(|| find_in_path("bash.exe"))
}

#[cfg(test)]
mod tests {
    use super::append_initial_command;

    #[test]
    fn builds_cmd_command() {
        let mut args = Vec::new();
        append_initial_command("cmd", &mut args, "echo hello");
        assert_eq!(args, ["/K", "prompt $G & echo hello"]);
    }

    #[test]
    fn builds_powershell_command() {
        let mut args = vec!["-NoLogo".to_string()];
        append_initial_command("powershell", &mut args, "Get-Location");
        assert_eq!(
            args,
            [
                "-NoLogo",
                "-NoExit",
                "-Command",
                "function prompt { 'PS> ' }; Get-Location"
            ]
        );
    }

    #[test]
    fn hides_path_for_an_empty_cmd_command() {
        let mut args = Vec::new();
        append_initial_command("cmd", &mut args, "");
        assert_eq!(args, ["/K", "prompt $G"]);
    }
}
