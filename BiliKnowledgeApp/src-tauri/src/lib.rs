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
    "dedeuserid": "",
    "status": "not_configured"
  },
  "ai": {
    "provider": "deepseek",
    "api_key": "",
    "base_url": "https://api.deepseek.com",
    "model": "deepseek-v4-flash"
  },
  "preferences": {
    "language": "zh-CN"
  }
}"#;

fn knowledge_base_root() -> PathBuf {
    // 1. Try exe-relative (works for both dev and release .app)
    if let Ok(exe) = std::env::current_exe() {
        let mut dir = exe.parent().map(|p| p.to_path_buf());
        while let Some(d) = dir {
            let candidate = d.join("BiliKnowledge");
            if candidate.is_dir() {
                if let Ok(c) = candidate.canonicalize() {
                    return c;
                }
            }
            // walk up
            dir = d.parent().map(|p| p.to_path_buf());
            // stop at filesystem root
            if d.parent() == Some(&d) {
                break;
            }
        }
    }
    // 2. Try CWD-relative
    if let Ok(cwd) = std::env::current_dir() {
        let candidate = cwd.join("BiliKnowledge");
        if candidate.is_dir() {
            if let Ok(c) = candidate.canonicalize() {
                return c;
            }
        }
        let sibling = cwd.join("../BiliKnowledge");
        if sibling.is_dir() {
            if let Ok(c) = sibling.canonicalize() {
                return c;
            }
        }
        // 3. Fallback: $HOME/Studio/.../BiliKnowledge
        if let Ok(home) = std::env::var("HOME") {
            let home_kb = PathBuf::from(&home)
                .join("Studio/01_AI/BiliKnowledgeMVP/BiliKnowledge");
            if home_kb.is_dir() {
                return home_kb;
            }
        }
        // 4. Last resort: CWD/BiliKnowledge, but never use root /
        let cwd_canon = cwd.canonicalize().unwrap_or_else(|_| cwd.clone());
        let candidate = cwd_canon.join("BiliKnowledge");
        // If CWD is root, use HOME instead
        if cwd_canon.as_os_str() == "/" {
            if let Ok(home) = std::env::var("HOME") {
                return PathBuf::from(&home).join("BiliKnowledge");
            }
        }
        return candidate;
    }
    PathBuf::from("../BiliKnowledge")
}

fn resolve_base_path(base: &Path) -> Result<PathBuf, String> {
    // Like canonicalize but tolerates missing dirs
    if base.exists() {
        return base.canonicalize().map_err(|e| format!("Path error: {e}"));
    }
    // Absolute path: use as-is (parent must exist for ensure_workspace to create it)
    if base.is_absolute() {
        return Ok(base.to_path_buf());
    }
    // Relative path: resolve against CWD
    if let Ok(cwd) = std::env::current_dir() {
        let cwd_canon = cwd.canonicalize().unwrap_or(cwd);
        let mut resolved = cwd_canon;
        for c in base.components() {
            match c {
                Component::ParentDir => {
                    if !resolved.pop() {
                        return Err("Path access denied: traversal outside base".into());
                    }
                }
                Component::CurDir => {}
                Component::Normal(s) => resolved.push(s),
                Component::Prefix(_) | Component::RootDir => {
                    return Err("Path access denied: unexpected path component".into());
                }
            }
        }
        return Ok(resolved);
    }
    Err("Cannot resolve base path".into())
}

fn ensure_path_under_base(base: &Path, target: &Path) -> Result<PathBuf, String> {
    let resolved_base = resolve_base_path(base)?;

    let resolved_target = if target.exists() {
        target
            .canonicalize()
            .map_err(|e| format!("Failed to canonicalize target path: {e}"))?
    } else {
        let parent = target.parent().unwrap_or_else(|| Path::new("."));
        let file_name = target
            .file_name()
            .ok_or_else(|| "Invalid target filename".to_string())?;
        let parent_resolved = if parent.exists() {
            parent
                .canonicalize()
                .unwrap_or_else(|_| parent.to_path_buf())
        } else {
            resolve_base_path(base)?.join(
                parent
                    .strip_prefix(base)
                    .unwrap_or(parent),
            )
        };
        parent_resolved.join(file_name)
    };

    if !resolved_target.starts_with(&resolved_base) {
        return Err("Path access denied: target is outside allowed base directory".to_string());
    }

    Ok(resolved_target)
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

    // Validate workspace before running
    if !base.exists() {
        let path_str = base.to_string_lossy();
        return Err(format!(
            "知识库路径不存在：{}\n请先创建默认知识库。",
            path_str
        ));
    }

    let knowledge_root = ensure_path_under_base(&base, &base)?;
    let scripts_root = ensure_path_under_base(&knowledge_root, &knowledge_root.join("scripts"))?;
    let python_path = PathBuf::from("../external/bilibili-favorites/.venv/bin/python");
    let script_path = ensure_path_under_base(&scripts_root, &scripts_root.join(script_name))?;

    if !python_path.exists() {
        return Err("Python 虚拟环境未找到，请确认已安装依赖。".into());
    }
    if !script_path.exists() {
        return Err(format!("脚本未找到: {}", script_name));
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

#[tauri::command]
fn check_workspace() -> Result<String, String> {
    let root = knowledge_base_root();
    let exists = root.exists();
    let is_dir = root.is_dir();
    let manifest_exists = root.join("manifest/videos.json").exists();
    let notes_dir_exists = root.join("notes/raw").exists();
    let kb_root_str = root.to_string_lossy().to_string();

    let status = serde_json::json!({
        "path": kb_root_str,
        "exists": exists,
        "is_dir": is_dir,
        "manifest_exists": manifest_exists,
        "notes_dir_exists": notes_dir_exists,
        "valid": exists && is_dir,
    });
    Ok(status.to_string())
}

#[tauri::command]
fn ensure_workspace() -> Result<String, String> {
    let root = knowledge_base_root();
    let dirs = [
        "manifest",
        "notes/raw",
        "notes/reviewed",
        "notes/templates",
        "projects",
        "thoughts",
        "scripts",
        "reports",
        "config",
        "exports",
        "logs",
    ];
    for d in &dirs {
        fs::create_dir_all(root.join(d))
            .map_err(|e| format!("Failed to create {}: {e}", d))?;
    }
    let manifest_path = root.join("manifest/videos.json");
    if !manifest_path.exists() {
        fs::write(&manifest_path, "[]").map_err(|e| format!("Failed to init manifest: {e}"))?;
    }
    let projects_path = root.join("projects/project_candidates.json");
    if !projects_path.exists() {
        fs::write(&projects_path, "[]").map_err(|e| format!("Failed to init projects: {e}"))?;
    }
    let kb_root_str = root.to_string_lossy().to_string();
    Ok(serde_json::json!({"path": kb_root_str, "created": true}).to_string())
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
            update_video_status,
            check_workspace,
            ensure_workspace
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

    // ── Manifest read / update round-trip ──

    #[test]
    fn video_manifest_read_update_roundtrip() {
        let base = temp_base("manifest-rt");
        let manifest_dir = base.join("manifest");
        fs::create_dir_all(&manifest_dir).unwrap();
        let manifest_path = manifest_dir.join("videos.json");

        let initial: serde_json::Value = serde_json::json!([
            {
                "id": "BV1test001",
                "title": "Test Video",
                "status": "pending"
            },
            {
                "id": "BV1test002",
                "title": "Another Video",
                "status": "reviewed"
            }
        ]);
        let initial_str = serde_json::to_string_pretty(&initial).unwrap();
        fs::write(&manifest_path, &initial_str).unwrap();

        // Read — like get_videos
        let content = fs::read_to_string(&manifest_path).unwrap();
        let mut videos: serde_json::Value = serde_json::from_str(&content).unwrap();
        assert_eq!(videos.as_array().unwrap().len(), 2);

        // Update — like update_video_status("BV1test001", "reviewed")
        let target_id = "BV1test001";
        let new_status = "reviewed";
        let arr = videos.as_array_mut().unwrap();
        let mut found = false;
        for video in arr.iter_mut() {
            if video["id"] == target_id {
                video["status"] = serde_json::Value::String(new_status.to_string());
                found = true;
                break;
            }
        }
        assert!(found, "Target video should be found");

        let updated_str = serde_json::to_string_pretty(&videos).unwrap();
        fs::write(&manifest_path, updated_str).unwrap();

        // Read back and verify
        let final_content = fs::read_to_string(&manifest_path).unwrap();
        let final_videos: serde_json::Value = serde_json::from_str(&final_content).unwrap();
        let updated = &final_videos.as_array().unwrap()[0];
        assert_eq!(updated["status"], "reviewed");
        assert_eq!(final_videos.as_array().unwrap()[1]["status"], "reviewed");

        fs::remove_dir_all(&base).ok();
    }
}
