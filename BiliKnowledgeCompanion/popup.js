const el = (id) => document.getElementById(id);
let state = null;

init();

async function init() {
  el("send").addEventListener("click", sendToDesktop);
  await refreshState();
}

async function refreshState() {
  try {
    state = await chrome.runtime.sendMessage({ type: "BIZHI_GET_STATE" });
    if (!state?.ok) throw new Error(state?.error || "读取失败");
    render(state);
  } catch (error) {
    el("status").textContent = String(error);
    el("status").className = "status err";
  }
}

function render(data) {
  const metadata = data.metadata || {};
  el("pageType").textContent = pageTypeLabel(metadata.pageType);
  el("title").textContent = metadata.title || metadata.bvid || "未识别到 B 站视频";
  el("meta").textContent = [metadata.uploader, metadata.bvid, metadata.url].filter(Boolean).join(" · ");
  el("loginState").textContent = data.cookies?.isLoggedIn ? "已登录" : "未登录";
  el("loginState").className = data.cookies?.isLoggedIn ? "ok" : "err";
  el("desktopState").textContent = data.desktopOnline ? "已连接" : "未启动";
  el("desktopState").className = data.desktopOnline ? "ok" : "err";
  el("send").disabled = !metadata.bvid || !data.desktopOnline;
}

async function sendToDesktop() {
  el("send").disabled = true;
  el("status").textContent = "正在发送到哔知…";
  el("status").className = "status";
  try {
    const result = await chrome.runtime.sendMessage({ type: "BIZHI_SEND_TO_DESKTOP", payload: { metadata: state.metadata } });
    if (!result?.ok) throw new Error(result?.error || "发送失败");
    el("status").textContent = result.message || "已发送到哔知 Desktop";
    el("status").className = "status ok";
  } catch (error) {
    el("status").textContent = String(error);
    el("status").className = "status err";
  } finally {
    await refreshState();
  }
}

function pageTypeLabel(type) {
  return ({ video: "视频", favorite: "收藏夹", collection: "合集", unknown: "未知" })[type] || "未知";
}
