use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Component, Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use serde::Serialize;
use tauri::{Emitter, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};
use which::which;

const ALLOWED_SCRIPTS: &[&str] = &[
    "parse_favorites.py",
    "fetch_video_meta.py",
    "generate_insights.py",
    "fetch_subtitles.py",
    "transcribe_subtitles.py",
    "fetch_comments.py",
    "fetch_danmaku.py",
    "generate_notes.py",
    "reconcile_notes.py",
    "extract_projects.py",
    "build_index.py",
    "validate_knowledge_base.py",
    "doctor.py",
    "doctor_fix.py",
];

const DEFAULT_CONFIG: &str = r#"{
  "bilibili": {
    "cookie": "",
    "sessdata": "",
    "bili_jct": "",
    "buvid3": "",
    "dedeuserid": "",
    "status": "not_configured"
  },
  "ai": {
    "provider": "deepseek",
    "preset": "deepseek-chat",
    "api_key": "",
    "base_url": "https://api.deepseek.com",
    "model": "deepseek-chat"
  },
  "preferences": {
    "language": "zh-CN",
    "appearance": "system",
    "timezone": "Asia/Singapore",
    "fontFamily": "system",
    "density": "comfortable"
  }
}"#;

fn knowledge_base_root() -> PathBuf {
    if let Ok(configured) = std::env::var("BILIKNOWLEDGE_ROOT") {
        let candidate = PathBuf::from(configured);
        if candidate.is_dir() {
            if let Ok(c) = candidate.canonicalize() {
                return c;
            }
            return candidate;
        }
    }
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
        // 3. Last resort: CWD/BiliKnowledge, but never use root /
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

fn resolve_python_executable(project_root: &Path) -> Result<PathBuf, String> {
    if let Ok(configured) = std::env::var("BILIKNOWLEDGE_PYTHON") {
        let configured = PathBuf::from(configured);
        if configured.exists() {
            return Ok(configured);
        }
        return Err(format!(
            "Configured Python interpreter not found: {}",
            configured.display()
        ));
    }

    let mut search_roots = vec![project_root.to_path_buf()];
    if let Ok(cwd) = std::env::current_dir() {
        search_roots.push(cwd.clone());
        if let Some(parent) = cwd.parent() {
            search_roots.push(parent.to_path_buf());
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        let mut cursor = exe.parent().map(|path| path.to_path_buf());
        while let Some(dir) = cursor {
            search_roots.push(dir.clone());
            cursor = dir.parent().map(|path| path.to_path_buf());
        }
    }

    let mut local_candidates = Vec::new();
    for root in search_roots {
        local_candidates.push(root.join(".venv/bin/python"));
        local_candidates.push(root.join("venv/bin/python"));
        local_candidates.push(root.join("external/bilibili-favorites/.venv/bin/python"));
    }

    for candidate in local_candidates {
        if candidate.exists() {
            return Ok(candidate);
        }
    }

    for candidate in ["python3", "python"] {
        if let Ok(found) = which(candidate) {
            return Ok(found);
        }
    }

    Err(
        "Python interpreter not found. Install python3, create .venv, or set BILIKNOWLEDGE_PYTHON."
            .into(),
    )
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

fn is_invalid_video_entry(video: &serde_json::Value) -> bool {
    let title = video
        .get("title")
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .trim();
    let video_id = video
        .get("id")
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .trim();
    title.contains("已失效") || !video_id.starts_with("BV")
}

fn is_single_generated_note(video: &serde_json::Value) -> bool {
    video
        .get("note_generation_mode")
        .and_then(|value| value.as_str())
        == Some("single")
}

fn find_bvid(text: &str) -> Option<String> {
    for (index, _) in text.match_indices("BV") {
        let candidate: String = text[index..]
            .chars()
            .take_while(|ch| ch.is_ascii_alphanumeric())
            .take(12)
            .collect();
        if candidate.len() == 12 && candidate.starts_with("BV") {
            return Some(candidate);
        }
    }
    None
}

fn find_aid(text: &str) -> Option<String> {
    for (index, _) in text.match_indices("av") {
        let digits: String = text[index + 2..]
            .chars()
            .take_while(|ch| ch.is_ascii_digit())
            .collect();
        if !digits.is_empty() {
            return Some(digits);
        }
    }
    None
}

fn find_b23_url(text: &str) -> Option<String> {
    text.split_whitespace()
        .map(|token| token.trim_matches(|ch: char| ch == '"' || ch == '\'' || ch == '，' || ch == ',' || ch == '。'))
        .find(|token| token.contains("b23.tv/") || token.contains("bili2233.cn/"))
        .map(|token| {
            if token.starts_with("http://") || token.starts_with("https://") {
                token.to_string()
            } else {
                format!("https://{token}")
            }
        })
}

fn resolve_bilibili_short_url(input: &str) -> Option<String> {
    let short_url = find_b23_url(input)?;
    let client = reqwest::blocking::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(8))
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36")
        .build()
        .ok()?;
    let response = client.get(short_url).send().ok()?;
    Some(response.url().to_string())
}

fn bilibili_api_url(video_ref: &str, is_aid: bool) -> String {
    if is_aid {
        format!("https://api.bilibili.com/x/web-interface/view?aid={video_ref}")
    } else {
        format!("https://api.bilibili.com/x/web-interface/view?bvid={video_ref}")
    }
}

fn format_seconds(seconds: u64) -> String {
    let hours = seconds / 3600;
    let minutes = (seconds % 3600) / 60;
    let secs = seconds % 60;
    if hours > 0 {
        format!("{hours:02}:{minutes:02}:{secs:02}")
    } else {
        format!("{minutes:02}:{secs:02}")
    }
}

fn fetch_bilibili_video_metadata(video_ref: &str, is_aid: bool) -> Option<serde_json::Value> {
    let client = reqwest::blocking::Client::builder()
        .user_agent(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 \
             (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
        )
        .build()
        .ok()?;
    let response = client
        .get(bilibili_api_url(video_ref, is_aid))
        .header("Referer", "https://www.bilibili.com/")
        .send()
        .ok()?;
    let payload: serde_json::Value = response.json().ok()?;
    if payload.get("code").and_then(|v| v.as_i64()) != Some(0) {
        return None;
    }
    payload.get("data").cloned()
}

fn resolve_video_input(input: &str) -> Result<(String, serde_json::Value), String> {
    let mut source = input.trim().to_string();
    if source.is_empty() {
        return Err("请输入 B站视频链接、BV 号、av 号或 b23.tv 短链。".into());
    }
    if source.contains("b23.tv/") || source.contains("bili2233.cn/") {
        source = resolve_bilibili_short_url(&source)
            .ok_or_else(|| "无法解析 b23.tv 短链，请粘贴完整 B站链接或 BV 号。".to_string())?;
    }

    if let Some(bvid) = find_bvid(&source) {
        let data = fetch_bilibili_video_metadata(&bvid, false).unwrap_or(serde_json::Value::Null);
        return Ok((bvid, data));
    }

    if let Some(aid) = find_aid(&source) {
        let data = fetch_bilibili_video_metadata(&aid, true)
            .ok_or_else(|| "无法通过 av 号获取视频信息，请改用 BV 号或完整链接。".to_string())?;
        let bvid = data
            .get("bvid")
            .and_then(|v| v.as_str())
            .filter(|v| v.starts_with("BV"))
            .ok_or_else(|| "B站接口未返回 BV 号，请改用 BV 号或完整链接。".to_string())?
            .to_string();
        return Ok((bvid, data));
    }

    Err("未识别到有效 B站视频编号；支持 BV、av、完整链接和 b23.tv 短链。".into())
}

#[tauri::command]
fn add_manual_video(input: String, title: Option<String>) -> Result<String, String> {
    let (bvid, metadata) = resolve_video_input(&input)?;
    let path = knowledge_path("manifest/videos.json")?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let content = fs::read_to_string(&path).unwrap_or_else(|_| "[]".into());
    let mut videos: serde_json::Value = serde_json::from_str(&content).unwrap_or_else(|_| serde_json::json!([]));
    let items = videos
        .as_array_mut()
        .ok_or_else(|| "manifest/videos.json 不是有效数组。".to_string())?;

    if items.iter().any(|video| video.get("id").and_then(|v| v.as_str()) == Some(bvid.as_str())) {
        return Ok(format!("视频已存在：{bvid}"));
    }

    let title_value = title
        .as_deref()
        .unwrap_or("")
        .trim()
        .to_string();
    let api_title = metadata.get("title").and_then(|v| v.as_str()).unwrap_or("").trim();
    let owner_name = metadata
        .get("owner")
        .and_then(|v| v.get("name"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let duration = metadata.get("duration").and_then(|v| v.as_u64()).unwrap_or(0);
    let pubdate = metadata
        .get("pubdate")
        .and_then(|v| v.as_i64())
        .map(|v| v.to_string())
        .unwrap_or_default();
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|v| v.as_secs().to_string())
        .unwrap_or_else(|_| "手动添加".into());

    let video = serde_json::json!({
        "id": bvid.clone(),
        "title": if !title_value.is_empty() { title_value } else if !api_title.is_empty() { api_title.to_string() } else { "手动添加的视频".to_string() },
        "url": format!("https://www.bilibili.com/video/{bvid}"),
        "uploader": owner_name,
        "collected_at": now,
        "favorite_folder": "手动添加",
        "category": "",
        "tags": ["manual"],
        "duration": if duration > 0 { format_seconds(duration) } else { String::new() },
        "pubdate": pubdate,
        "priority": "P1",
        "status": "pending",
        "note_path": "",
        "project_extracted": false,
        "remarks": "手动添加：支持 BV / av / b23.tv / 完整链接",
        "note_ready": false
    });

    items.insert(0, video);
    let updated = serde_json::to_string_pretty(&videos).map_err(|e| e.to_string())?;
    fs::write(path, updated).map_err(|e| e.to_string())?;
    Ok(format!("已添加视频：{bvid}"))
}

#[tauri::command]
fn get_videos() -> Result<String, String> {
    let path = knowledge_path("manifest/videos.json")?;
    if !path.exists() {
        return Err(format!("Manifest not found at {:?}", path));
    }
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let mut videos: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;

    if let Some(items) = videos.as_array_mut() {
        items.retain(|video| !is_invalid_video_entry(video));
        for video in items.iter_mut() {
            let video_id = video
                .get("id")
                .and_then(|value| value.as_str())
                .unwrap_or("")
                .trim()
                .to_string();
            let note_path = video
                .get("note_path")
                .and_then(|value| value.as_str())
                .unwrap_or("")
                .trim()
                .to_string();

            let mut resolved_note_path = String::new();
            if !note_path.is_empty() {
                let note_full_path = knowledge_path(&format!("notes/raw/{note_path}"))?;
                if note_full_path.is_file() {
                    resolved_note_path = note_path;
                }
            }
            if resolved_note_path.is_empty() && !video_id.is_empty() {
                let fallback_name = format!("{video_id}.md");
                let fallback_path = knowledge_path(&format!("notes/raw/{fallback_name}"))?;
                if fallback_path.is_file() {
                    resolved_note_path = fallback_name;
                }
            }

            let note_ready = !resolved_note_path.is_empty() && is_single_generated_note(video);
            if note_ready {
                video["note_path"] = serde_json::Value::String(resolved_note_path);
            } else {
                video["note_path"] = serde_json::Value::String(String::new());
            }
            video["note_ready"] = serde_json::Value::Bool(note_ready);
        }
    }

    serde_json::to_string(&videos).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_favorite_folders() -> Result<String, String> {
    let path = knowledge_path("manifest/favorite_folders.json")?;
    if !path.exists() {
        return Ok("[]".into());
    }
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let folders: Vec<serde_json::Value> =
        serde_json::from_str(&content).map_err(|e| e.to_string())?;
    serde_json::to_string(&folders).map_err(|e| e.to_string())
}

#[derive(Serialize)]
struct BilibiliCookieValidation {
    valid: bool,
    message: String,
    mid: Option<u64>,
    uname: Option<String>,
}

#[tauri::command]
async fn validate_bilibili_cookie() -> Result<String, String> {
    let config_path = knowledge_path("config/config.json")?;
    let config_text = fs::read_to_string(&config_path).unwrap_or_else(|_| DEFAULT_CONFIG.to_string());
    let config_json: serde_json::Value =
        serde_json::from_str(&config_text).map_err(|e| format!("配置文件格式无效：{e}"))?;

    let raw_cookie = config_json["bilibili"]["cookie"]
        .as_str()
        .unwrap_or("")
        .trim()
        .to_string();
    let sessdata = config_json["bilibili"]["sessdata"]
        .as_str()
        .unwrap_or("")
        .trim()
        .to_string();

    let cookie_header = if !raw_cookie.is_empty() {
        raw_cookie
    } else if !sessdata.is_empty() {
        format!("SESSDATA={sessdata}")
    } else {
        String::new()
    };

    if cookie_header.is_empty() {
        let payload = BilibiliCookieValidation {
            valid: false,
            message: "未配置 SESSDATA，请先保存 Bilibili Cookie。".into(),
            mid: None,
            uname: None,
        };
        return serde_json::to_string(&payload).map_err(|e| e.to_string());
    }

    let client = reqwest::Client::builder()
        .user_agent(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 \
             (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
        )
        .build()
        .map_err(|e| format!("创建网络客户端失败：{e}"))?;

    let response = client
        .get("https://api.bilibili.com/x/web-interface/nav")
        .header("Cookie", cookie_header)
        .header("Referer", "https://www.bilibili.com/")
        .header("Accept", "application/json, text/plain, */*")
        .send()
        .await
        .map_err(|e| format!("请求 Bilibili 登录状态失败：{e}"))?;

    let payload: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("解析 Bilibili 返回失败：{e}"))?;

    let data = payload.get("data").cloned().unwrap_or(serde_json::Value::Null);
    let is_login = data.get("isLogin").and_then(|v| v.as_bool()).unwrap_or(false);

    let result = if is_login {
        BilibiliCookieValidation {
            valid: true,
            message: format!(
                "Cookie 校验通过，当前账号：{}",
                data.get("uname").and_then(|v| v.as_str()).unwrap_or("未知账号")
            ),
            mid: data.get("mid").and_then(|v| v.as_u64()),
            uname: data.get("uname").and_then(|v| v.as_str()).map(|v| v.to_string()),
        }
    } else {
        BilibiliCookieValidation {
            valid: false,
            message: payload
                .get("message")
                .and_then(|v| v.as_str())
                .filter(|v| !v.is_empty())
                .unwrap_or("SESSDATA 无效或已过期，请重新登录并更新 Cookie。")
                .to_string(),
            mid: None,
            uname: None,
        }
    };

    serde_json::to_string(&result).map_err(|e| e.to_string())
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
    // Resolve python relative to project root (knowledge base's parent)
    let project_root = base.parent().unwrap_or(&base);
    let python_path = resolve_python_executable(project_root)?;
    let script_path = ensure_path_under_base(&scripts_root, &scripts_root.join(script_name))?;

    if !script_path.exists() {
        return Err(format!("脚本未找到: {}", script_name));
    }

    let mut command = Command::new(&python_path);
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

    let captured_output = Arc::new(Mutex::new(Vec::<String>::new()));

    let app_clone = app.clone();
    let output_clone = Arc::clone(&captured_output);
    let stdout_handle = std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines().map_while(|line| line.ok()) {
            if let Ok(mut output) = output_clone.lock() {
                output.push(line.clone());
            }
            let _ = app_clone.emit("script-log", line);
        }
    });

    let app_clone = app.clone();
    let output_clone = Arc::clone(&captured_output);
    let stderr_handle = std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines().map_while(|line| line.ok()) {
            let formatted = format!("[ERROR] {}", line);
            if let Ok(mut output) = output_clone.lock() {
                output.push(formatted.clone());
            }
            let _ = app_clone.emit("script-log", formatted);
        }
    });

    let status = child.wait().map_err(|e| e.to_string())?;
    let _ = stdout_handle.join();
    let _ = stderr_handle.join();

    if status.success() {
        Ok("Script executed successfully".into())
    } else {
        let tail = captured_output
            .lock()
            .ok()
            .map(|output| {
                let start = output.len().saturating_sub(8);
                output[start..].join("
")
            })
            .unwrap_or_default();
        if tail.trim().is_empty() {
            Err(format!("Script failed with exit code: {:?}", status.code()))
        } else {
            Err(format!(
                "Script failed with exit code: {:?}
{}",
                status.code(),
                tail.trim()
            ))
        }
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
fn get_user_ideas() -> Result<String, String> {
    let path = knowledge_path("thoughts/user_ideas.json")?;
    if !path.exists() {
        return Ok("[]".into());
    }
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let parsed: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Invalid user ideas JSON: {e}"))?;
    if !parsed.is_array() {
        return Err("Invalid user ideas JSON: root must be an array".into());
    }
    Ok(content)
}

#[tauri::command]
fn save_user_ideas(ideas: String) -> Result<(), String> {
    let parsed: serde_json::Value = serde_json::from_str(&ideas)
        .map_err(|e| format!("Invalid user ideas JSON: {e}"))?;
    let Some(items) = parsed.as_array() else {
        return Err("Invalid user ideas JSON: root must be an array".into());
    };
    let mut sanitized = Vec::new();
    for item in items.iter().take(500) {
        let Some(obj) = item.as_object() else { continue; };
        let title = obj.get("title").and_then(|v| v.as_str()).unwrap_or("").trim();
        let content = obj.get("content").and_then(|v| v.as_str()).unwrap_or("").trim();
        if title.is_empty() && content.is_empty() { continue; }
        let tags = obj
            .get("tags")
            .and_then(|v| v.as_array())
            .map(|values| {
                values
                    .iter()
                    .filter_map(|v| v.as_str())
                    .map(|v| v.trim())
                    .filter(|v| !v.is_empty())
                    .take(12)
                    .map(|v| serde_json::Value::String(v.to_string()))
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        sanitized.push(serde_json::json!({
            "id": obj.get("id").and_then(|v| v.as_str()).unwrap_or(""),
            "title": title.chars().take(120).collect::<String>(),
            "content": content.chars().take(4000).collect::<String>(),
            "tags": tags,
            "created_at": obj.get("created_at").and_then(|v| v.as_str()).unwrap_or(""),
            "updated_at": obj.get("updated_at").and_then(|v| v.as_str()).unwrap_or(""),
        }));
    }
    let path = knowledge_path("thoughts/user_ideas.json")?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let content = serde_json::to_string_pretty(&sanitized).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| e.to_string())
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
fn get_insights() -> Result<String, String> {
    let path = knowledge_path("manifest/insights.json")?;
    if !path.exists() {
        return Ok("[]".into());
    }
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_subtitles() -> Result<String, String> {
    let path = knowledge_path("manifest/subtitles.json")?;
    if !path.exists() {
        return Ok("[]".into());
    }
    fs::read_to_string(path).map_err(|e| e.to_string())
}

fn default_config_value() -> Result<serde_json::Value, String> {
    serde_json::from_str(DEFAULT_CONFIG)
        .map_err(|e| format!("Invalid embedded default config JSON: {e}"))
}

fn normalize_config_value(mut config: serde_json::Value) -> Result<serde_json::Value, String> {
    let default_config = default_config_value()?;
    let default_preferences = default_config
        .get("preferences")
        .and_then(|value| value.as_object())
        .ok_or_else(|| "Invalid embedded default config: preferences missing".to_string())?;

    if !config.is_object() {
        return Err("Invalid config: root must be an object".into());
    }

    if config.get("preferences").is_none() {
        config["preferences"] = serde_json::Value::Object(serde_json::Map::new());
    }

    let Some(preferences) = config.get_mut("preferences").and_then(|value| value.as_object_mut()) else {
        return Err("Invalid config: preferences must be an object".into());
    };

    for (key, value) in default_preferences {
        preferences.entry(key.clone()).or_insert_with(|| value.clone());
    }

    validate_config_value(&config)?;
    Ok(config)
}

#[tauri::command]
fn get_config() -> Result<String, String> {
    let path = knowledge_path("config/config.json")?;
    if !path.exists() {
        return Ok(DEFAULT_CONFIG.into());
    }
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let parsed = serde_json::from_str::<serde_json::Value>(&content)
        .map_err(|e| format!("Invalid config JSON: {e}"))?;
    let normalized = normalize_config_value(parsed)?;
    serde_json::to_string_pretty(&normalized).map_err(|e| e.to_string())
}

fn validate_preference_choice(
    preferences: &serde_json::Value,
    key: &str,
    allowed: &[&str],
) -> Result<(), String> {
    let Some(value) = preferences.get(key) else {
        return Ok(());
    };
    let Some(value) = value.as_str() else {
        return Err(format!("Invalid config: preferences.{key} must be a string"));
    };
    if allowed.contains(&value) {
        Ok(())
    } else {
        Err(format!("Invalid config: unsupported preferences.{key}: {value}"))
    }
}

fn validate_config_value(config: &serde_json::Value) -> Result<(), String> {
    let Some(preferences) = config.get("preferences") else {
        return Ok(());
    };
    if !preferences.is_object() {
        return Err("Invalid config: preferences must be an object".into());
    }

    validate_preference_choice(preferences, "language", &["zh-CN", "en-US"])?;
    validate_preference_choice(preferences, "appearance", &["system", "light", "dark"])?;
    validate_preference_choice(preferences, "fontFamily", &["system", "rounded", "serif", "mono"])?;
    validate_preference_choice(preferences, "density", &["comfortable", "compact"])?;
    validate_preference_choice(
        preferences,
        "timezone",
        &[
            "Asia/Singapore",
            "Asia/Shanghai",
            "Asia/Tokyo",
            "America/Los_Angeles",
            "America/New_York",
            "Europe/London",
            "UTC",
        ],
    )?;

    Ok(())
}

#[tauri::command]
fn save_config(config: String) -> Result<(), String> {
    let parsed = serde_json::from_str::<serde_json::Value>(&config)
        .map_err(|e| format!("Invalid config JSON: {e}"))?;
    let normalized = normalize_config_value(parsed)?;
    let path = knowledge_path("config/config.json")?;
    let parent = path
        .parent()
        .ok_or_else(|| "Invalid config path".to_string())?;
    if !parent.exists() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let content = serde_json::to_string_pretty(&normalized).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| e.to_string())
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
    let folders_path = root.join("manifest/favorite_folders.json");
    if !folders_path.exists() {
        fs::write(&folders_path, "[]").map_err(|e| format!("Failed to init folders: {e}"))?;
    }
    let projects_path = root.join("projects/project_candidates.json");
    if !projects_path.exists() {
        fs::write(&projects_path, "[]").map_err(|e| format!("Failed to init projects: {e}"))?;
    }
    let kb_root_str = root.to_string_lossy().to_string();
    Ok(serde_json::json!({"path": kb_root_str, "created": true}).to_string())
}

#[tauri::command]
fn get_processing_status() -> Result<String, String> {
    let path = knowledge_path("manifest/processing_status.json")?;
    if !path.exists() {
        return Err("processing_status.json not found. Run validate_knowledge_base.py first.".into());
    }
    let content = fs::read_to_string(&path).map_err(|e| format!("Failed to read status: {e}"))?;
    // Validate it's valid JSON
    serde_json::from_str::<serde_json::Value>(&content)
        .map_err(|e| format!("Invalid JSON in processing_status.json: {e}"))?;
    Ok(content)
}

#[tauri::command]
fn open_bilibili_login_window<R: Runtime>(app: tauri::AppHandle<R>) -> Result<(), String> {
    const LABEL: &str = "bilibili-login";
    const LOGIN_URL: &str = "https://passport.bilibili.com/login";
    const MODERN_CHROME_UA: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36";

    if let Some(window) = app.get_webview_window(LABEL) {
        let _ = window.unminimize();
        let _ = window.set_focus();
        return Ok(());
    }

    let url = LOGIN_URL
        .parse()
        .map_err(|e| format!("Invalid login URL: {e}"))?;

    WebviewWindowBuilder::new(&app, LABEL, WebviewUrl::External(url))
        .title("Bilibili Official Login")
        .user_agent(MODERN_CHROME_UA)
        .inner_size(1180.0, 820.0)
        .min_inner_size(960.0, 700.0)
        .resizable(true)
        .center()
        .build()
        .map_err(|e| format!("Failed to open login window: {e}"))?;

    Ok(())
}

#[tauri::command]
fn generate_bilibili_qr() -> Result<String, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {e}"))?;

    let resp = client
        .get("https://passport.bilibili.com/x/passport-login/web/qrcode/generate")
        .header("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36")
        .send()
        .map_err(|e| format!("Failed to request QR code: {e}"))?;

    let body: serde_json::Value = resp.json().map_err(|e| format!("Failed to parse response: {e}"))?;

    if body["code"] != 0 {
        return Err(format!("API error: {}", body["message"]));
    }

    let data = &body["data"];
    let result = serde_json::json!({
        "url": data["url"].as_str().unwrap_or(""),
        "qrcode_key": data["qrcode_key"].as_str().unwrap_or(""),
    });

    Ok(result.to_string())
}

#[tauri::command]
fn poll_bilibili_qr(qrcode_key: String) -> Result<String, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {e}"))?;

    let url = format!(
        "https://passport.bilibili.com/x/passport-login/web/qrcode/poll?qrcode_key={}",
        qrcode_key
    );

    let resp = client
        .get(&url)
        .header("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36")
        .send()
        .map_err(|e| format!("Failed to poll QR status: {e}"))?;

    let body: serde_json::Value = resp.json().map_err(|e| format!("Failed to parse response: {e}"))?;

    let code = body["data"]["code"].as_i64().unwrap_or(-1);

    if code == 0 {
        // Login success - extract cookies from URL
        let goto_url = body["data"]["url"].as_str().unwrap_or("");

        // Parse URL query parameters to get cookies
        let mut sessdata = String::new();
        let mut bili_jct = String::new();
        let mut dedeuserid = String::new();
        let mut buvid3 = String::new();

        if let Some(query_start) = goto_url.find('?') {
            let query = &goto_url[query_start + 1..];
            for param in query.split('&') {
                if let Some((key, value)) = param.split_once('=') {
                    match key {
                        "SESSDATA" => sessdata = value.to_string(),
                        "bili_jct" => bili_jct = value.to_string(),
                        "DedeUserID" => dedeuserid = value.to_string(),
                        "buvid3" => buvid3 = value.to_string(),
                        _ => {}
                    }
                }
            }
        }

        let result = serde_json::json!({
            "code": 0,
            "sessdata": sessdata,
            "bili_jct": bili_jct,
            "dedeuserid": dedeuserid,
            "buvid3": buvid3,
        });

        Ok(result.to_string())
    } else {
        // Return the status code for polling
        let result = serde_json::json!({
            "code": code,
            "message": body["data"]["message"].as_str().unwrap_or(""),
        });
        Ok(result.to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            add_manual_video,
            get_videos,
            get_favorite_folders,
            validate_bilibili_cookie,
            get_note,
            get_projects,
            get_user_ideas,
            save_user_ideas,
            get_insights,
            get_subtitles,
            get_config,
            save_config,
            run_script,
            update_video_status,
            check_workspace,
            ensure_workspace,
            get_processing_status,
            open_bilibili_login_window,
            generate_bilibili_qr,
            poll_bilibili_qr
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

    // ── Bilibili video input parsing ──

    #[test]
    fn extracts_bvid_from_plain_and_url_input() {
        assert_eq!(
            find_bvid("BV1LY7K6dEnd").as_deref(),
            Some("BV1LY7K6dEnd")
        );
        assert_eq!(
            find_bvid("https://www.bilibili.com/video/BV1DVj46KEmQ?p=1").as_deref(),
            Some("BV1DVj46KEmQ")
        );
    }

    #[test]
    fn extracts_aid_from_url_input() {
        assert_eq!(
            find_aid("https://www.bilibili.com/video/av170001").as_deref(),
            Some("170001")
        );
        assert_eq!(find_aid("av123456").as_deref(), Some("123456"));
    }

    #[test]
    fn detects_b23_short_url_input() {
        assert_eq!(
            find_b23_url("复制这条链接 https://b23.tv/abc123 看视频").as_deref(),
            Some("https://b23.tv/abc123")
        );
        assert_eq!(
            find_b23_url("b23.tv/abc123").as_deref(),
            Some("https://b23.tv/abc123")
        );
    }

    // ── Manifest read / update round-trip ──

    // ── get_processing_status ──

    #[test]
    fn processing_status_reads_valid_json() {
        let base = temp_base("status-read");
        let manifest_dir = base.join("manifest");
        fs::create_dir_all(&manifest_dir).unwrap();
        let status_path = manifest_dir.join("processing_status.json");
        let status = serde_json::json!({
            "last_updated": "2026-05-23",
            "total_videos": 10,
            "pending": 0,
            "note_created": 10,
            "projects_extracted": 23,
            "reviewed": 10,
            "pipeline": {
                "manifest_generated": true,
                "notes_generated": true,
                "projects_extracted": true,
                "index_built": true,
                "validated": true
            }
        });
        fs::write(&status_path, serde_json::to_string_pretty(&status).unwrap()).unwrap();

        let content = fs::read_to_string(&status_path).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&content).unwrap();
        assert_eq!(parsed["total_videos"], 10);
        assert_eq!(parsed["pipeline"]["validated"], true);

        fs::remove_dir_all(&base).ok();
    }

    #[test]
    fn processing_status_missing_file_handled() {
        let base = temp_base("status-missing");
        let manifest_dir = base.join("manifest");
        fs::create_dir_all(&manifest_dir).unwrap();
        let status_path = manifest_dir.join("processing_status.json");
        assert!(!status_path.exists());

        fs::remove_dir_all(&base).ok();
    }

    #[test]
    fn processing_status_malformed_json_handled() {
        let base = temp_base("status-bad");
        let manifest_dir = base.join("manifest");
        fs::create_dir_all(&manifest_dir).unwrap();
        let status_path = manifest_dir.join("processing_status.json");
        fs::write(&status_path, "not valid json").unwrap();

        let content = fs::read_to_string(&status_path).unwrap();
        let result = serde_json::from_str::<serde_json::Value>(&content);
        assert!(result.is_err());

        fs::remove_dir_all(&base).ok();
    }

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

    #[test]
    fn accepts_valid_visual_preferences() {
        let config = serde_json::json!({
            "preferences": {
                "language": "zh-CN",
                "appearance": "dark",
                "timezone": "Asia/Singapore",
                "fontFamily": "mono",
                "density": "compact"
            }
        });

        assert!(validate_config_value(&config).is_ok());
    }

    #[test]
    fn migrates_missing_visual_preferences() {
        let config = serde_json::json!({
            "bilibili": {
                "status": "not_configured"
            },
            "preferences": {
                "language": "zh-CN",
                "appearance": "light"
            }
        });

        let normalized = normalize_config_value(config).expect("legacy config should migrate");
        let preferences = normalized.get("preferences").unwrap();
        assert_eq!(preferences.get("language").unwrap(), "zh-CN");
        assert_eq!(preferences.get("appearance").unwrap(), "light");
        assert_eq!(preferences.get("timezone").unwrap(), "Asia/Singapore");
        assert_eq!(preferences.get("fontFamily").unwrap(), "system");
        assert_eq!(preferences.get("density").unwrap(), "comfortable");
    }

    #[test]
    fn rejects_invalid_visual_preferences() {
        let config = serde_json::json!({
            "preferences": {
                "appearance": "neon",
                "timezone": "Mars/Olympus",
                "fontFamily": "comic",
                "density": "tiny"
            }
        });

        assert!(validate_config_value(&config).is_err());
    }
}
