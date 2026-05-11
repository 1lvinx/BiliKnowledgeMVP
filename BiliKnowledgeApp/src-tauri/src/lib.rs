use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Component, Path, PathBuf};
use std::process::{Command, Stdio};
use tauri::{Emitter, Runtime};

const ALLOWED_SCRIPTS: &[&str] = &[
    "parse_favorites.py",
    "extract_projects.py",
    "build_index.py",
    "validate_knowledge_base.py",
];

const DEFAULT_CONFIG: &str = r#"{
  "bilibili": {
    "sessdata": "",
    "bili_jct": "",
    "buvid3": "",
    "dedeuserid": ""
  },
  "ai": {
    "provider": "anthropic",
    "api_key": "",
    "base_url": "",
    "model": "claude-3-5-sonnet-20241022"
  },
  "preferences": {
    "language": "zh-CN"
  }
}"#;

fn knowledge_base_root() -> PathBuf {
    PathBuf::from("../BiliKnowledge")
}

fn ensure_path_under_base(base: &Path, target: &Path) -> Result<PathBuf, String> {
    let base = base
        .canonicalize()
        .map_err(|e| format!("Failed to canonicalize base path: {e}"))?;

    let target = if target.exists() {
        target
            .canonicalize()
            .map_err(|e| format!("Failed to canonicalize target path: {e}"))?
    } else {
        let parent = target
            .parent()
            .ok_or_else(|| "Invalid target path".to_string())?
            .canonicalize()
            .map_err(|e| format!("Failed to canonicalize target parent: {e}"))?;
        let file_name = target
            .file_name()
            .ok_or_else(|| "Invalid target filename".to_string())?;

        parent.join(file_name)
    };

    if !target.starts_with(&base) {
        return Err("Path access denied: target is outside allowed base directory".to_string());
    }

    Ok(target)
}

fn ensure_safe_relative_path(path: &str) -> Result<(), String> {
    let relative = Path::new(path);
    if relative.is_absolute() {
        return Err("Path access denied: absolute paths are not allowed".to_string());
    }
    if relative.components().any(|component| {
        matches!(
            component,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        )
    }) {
        return Err("Path access denied: path traversal is not allowed".to_string());
    }

    Ok(())
}

fn allowed_script_name(script_name: &str) -> Result<&str, String> {
    ensure_safe_relative_path(script_name)?;

    let mut components = Path::new(script_name).components();
    let name = match (components.next(), components.next(), components.next()) {
        (Some(Component::Normal(name)), None, None) => name,
        (Some(Component::Normal(prefix)), Some(Component::Normal(name)), None)
            if prefix.to_str() == Some("scripts") =>
        {
            name
        }
        _ => return Err(format!("Script not allowed: {script_name}")),
    };
    let name = name
        .to_str()
        .ok_or_else(|| "Invalid script name".to_string())?;

    if ALLOWED_SCRIPTS.contains(&name) {
        Ok(name)
    } else {
        Err(format!("Script not allowed: {script_name}"))
    }
}

fn knowledge_path(relative_path: &str) -> Result<PathBuf, String> {
    ensure_safe_relative_path(relative_path)?;
    let base = knowledge_base_root();
    let target = base.join(relative_path);
    ensure_path_under_base(&base, &target)
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn get_videos() -> Result<String, String> {
    let path = knowledge_path("manifest/videos.json")?;
    if !path.exists() {
        return Err(format!("Manifest not found at {:?}", path));
    }
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn run_script<R: Runtime>(
    app: tauri::AppHandle<R>,
    script_name: String,
    args: Vec<String>,
) -> Result<String, String> {
    let requested_script = script_name;
    let script_name = allowed_script_name(&requested_script)?;
    let base = knowledge_base_root();
    let knowledge_root = ensure_path_under_base(&base, &base)?;
    let scripts_root = ensure_path_under_base(&knowledge_root, &knowledge_root.join("scripts"))?;
    let python_path = PathBuf::from("../external/bilibili-favorites/.venv/bin/python");
    let script_path = ensure_path_under_base(&scripts_root, &scripts_root.join(script_name))?;

    if !python_path.exists() {
        return Err("Python virtual environment not found".into());
    }
    if !script_path.exists() {
        return Err(format!("Script not found: {}", script_name));
    }

    let mut command = Command::new(python_path);
    command.arg(script_path);
    for arg in args {
        command.arg(arg);
    }

    command.stdout(Stdio::piped());
    command.stderr(Stdio::piped());
    command.current_dir(&knowledge_root);

    let mut child = command.spawn().map_err(|e| e.to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to capture script stdout".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Failed to capture script stderr".to_string())?;

    let app_clone = app.clone();
    let stdout_handle = std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines().map_while(|line| line.ok()) {
            let _ = app_clone.emit("script-log", line);
        }
    });

    let app_clone = app.clone();
    let stderr_handle = std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines().map_while(|line| line.ok()) {
            let _ = app_clone.emit("script-log", format!("[ERROR] {}", line));
        }
    });

    let status = child.wait().map_err(|e| e.to_string())?;
    let _ = stdout_handle.join();
    let _ = stderr_handle.join();

    if status.success() {
        Ok("Script executed successfully".into())
    } else {
        Err(format!("Script failed with exit code: {:?}", status.code()))
    }
}

#[tauri::command]
fn get_note(note_path: String) -> Result<String, String> {
    // note_path is relative to the notes/raw directory, e.g., "BV1xK4y1E7pR.md"
    let path = knowledge_path(&format!("notes/raw/{note_path}"))?;
    if !path.exists() {
        return Err(format!("Note not found at {:?}", path));
    }
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_video_status(id: String, status: String) -> Result<String, String> {
    let path = knowledge_path("manifest/videos.json")?;
    if !path.exists() {
        return Err(format!("Manifest not found at {:?}", path));
    }

    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut videos: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| e.to_string())?;

    if let Some(videos_array) = videos.as_array_mut() {
        let mut found = false;
        for video in videos_array {
            if video["id"] == id {
                video["status"] = serde_json::Value::String(status.clone());
                found = true;
                break;
            }
        }
        if !found {
            return Err(format!("Video with id {} not found", id));
        }
    } else {
        return Err("Manifest is not a valid JSON array".into());
    }

    let updated_content = serde_json::to_string_pretty(&videos).map_err(|e| e.to_string())?;
    fs::write(path, updated_content).map_err(|e| e.to_string())?;

    Ok(format!("Video {} status updated to {}", id, status))
}

#[tauri::command]
fn get_projects() -> Result<String, String> {
    let path = knowledge_path("projects/project_candidates.json")?;
    if !path.exists() {
        return Ok("[]".into());
    }
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_config() -> Result<String, String> {
    let path = knowledge_path("config/config.json")?;
    if !path.exists() {
        return Ok(DEFAULT_CONFIG.into());
    }
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_config(config: String) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(&config)
        .map_err(|e| format!("Invalid config JSON: {e}"))?;
    let path = knowledge_path("config/config.json")?;
    let parent = path
        .parent()
        .ok_or_else(|| "Invalid config path".to_string())?;
    if !parent.exists() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(path, config).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            get_videos,
            get_note,
            get_projects,
            get_config,
            save_config,
            run_script,
            update_video_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    // ── ensure_safe_relative_path ──

    #[test]
    fn rejects_absolute_path() {
        assert!(ensure_safe_relative_path("/etc/passwd").is_err());
    }

    #[test]
    fn rejects_parent_dir_traversal() {
        assert!(ensure_safe_relative_path("../secrets.txt").is_err());
    }

    #[test]
    fn rejects_mixed_traversal() {
        assert!(ensure_safe_relative_path("notes/../../etc/passwd").is_err());
    }

    #[test]
    fn accepts_safe_relative_path() {
        assert!(ensure_safe_relative_path("notes/test.md").is_ok());
    }

    #[test]
    fn accepts_simple_filename() {
        assert!(ensure_safe_relative_path("manifest/videos.json").is_ok());
    }

    // ── ensure_path_under_base ──

    fn temp_base(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("bk-test-{}-{}", std::process::id(), label));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn accepts_child_path() {
        let base = temp_base("child");
        let child = base.join("notes/test.md");
        fs::create_dir_all(child.parent().unwrap()).unwrap();
        fs::write(&child, b"test").unwrap();
        let result = ensure_path_under_base(&base, &child);
        fs::remove_dir_all(&base).ok();
        assert!(result.is_ok());
    }

    #[test]
    fn rejects_sibling_path_outside_base() {
        let base = temp_base("sibling");
        let sibling = std::env::temp_dir().join(format!("bk-other-{}-{}", std::process::id(), "sib"));
        fs::create_dir_all(&sibling).unwrap();
        let result = ensure_path_under_base(&base, &sibling);
        fs::remove_dir_all(&base).ok();
        fs::remove_dir_all(&sibling).ok();
        assert!(result.is_err());
    }

    #[test]
    fn accepts_normalized_path_within_base() {
        let base = temp_base("norm");
        let sub = base.join("sub");
        fs::create_dir_all(&sub).unwrap();
        let normalized = base.join("sub").join(".").join("file.txt");
        let result = ensure_path_under_base(&base, &normalized);
        fs::remove_dir_all(&base).ok();
        assert!(result.is_ok());
    }

    // ── allowed_script_name ──

    #[test]
    fn accepts_whitelisted_script() {
        assert_eq!(
            allowed_script_name("parse_favorites.py").unwrap(),
            "parse_favorites.py"
        );
    }

    #[test]
    fn accepts_whitelisted_script_with_scripts_prefix() {
        assert_eq!(
            allowed_script_name("scripts/parse_favorites.py").unwrap(),
            "parse_favorites.py"
        );
    }

    #[test]
    fn rejects_non_whitelisted_script() {
        assert!(allowed_script_name("evil.sh").is_err());
    }

    #[test]
    fn rejects_traversal_in_script_name() {
        // Traversal blocked by ensure_safe_relative_path inside allowed_script_name
        assert!(allowed_script_name("../parse_favorites.py").is_err());
    }

    #[test]
    fn rejects_extra_path_depth() {
        assert!(allowed_script_name("scripts/sub/parse_favorites.py").is_err());
    }

    #[test]
    fn accepts_all_whitelisted_scripts() {
        for name in ALLOWED_SCRIPTS {
            assert!(
                allowed_script_name(name).is_ok(),
                "Whitelisted script {name} should be accepted"
            );
        }
    }
}
