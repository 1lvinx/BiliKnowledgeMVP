import { useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { QrCode, RefreshCw, CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { t } from "../i18n";
import { MacInlineNotice, MacToolbarButton } from "./MacUI";

interface BilibiliLoginProps {
  onLoginSuccess?: (cookies: {
    sessdata: string;
    bili_jct: string;
    dedeuserid: string;
    buvid3: string;
  }) => void;
}

function isTauriRuntime() {
  return isTauri() || (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window);
}

type LoginStatus = "idle" | "loading" | "qr-ready" | "waiting-scan" | "waiting-confirm" | "success" | "error";

function BilibiliLogin({ onLoginSuccess }: BilibiliLoginProps) {
  const [status, setStatus] = useState<LoginStatus>("idle");
  const [qrUrl, setQrUrl] = useState("");
  const [statusText, setStatusText] = useState("");
  const [polling, setPolling] = useState(false);

  async function generateQrCode() {
    if (!isTauriRuntime()) {
      setStatus("error");
      setStatusText(t("bilibili.needDesktopApp"));
      return;
    }

    try {
      setStatus("loading");
      setStatusText(t("bilibili.generatingQr"));

      const result: string = await invoke("generate_bilibili_qr");
      const data = JSON.parse(result);
      setQrUrl(data.url);
      setStatus("qr-ready");
      setStatusText(t("bilibili.scanQr"));
      startPolling(data.qrcode_key);
    } catch (err) {
      setStatus("error");
      setStatusText(`${t("bilibili.generateFailed")}: ${String(err)}`);
    }
  }

  async function startPolling(qrcodeKey: string) {
    if (polling) return;
    setPolling(true);

    const maxAttempts = 60; // 3 minutes (3s interval)
    let attempts = 0;

    const poll = async () => {
      if (attempts >= maxAttempts) {
        setPolling(false);
        setStatus("error");
        setStatusText(t("bilibili.qrExpired"));
        return;
      }

      try {
        const result: string = await invoke("poll_bilibili_qr", { qrcodeKey });
        const data = JSON.parse(result);

        if (data.code === 0) {
          // Success
          setPolling(false);
          setStatus("success");
          setStatusText(t("bilibili.loginSuccess"));
          onLoginSuccess?.({
            sessdata: data.segdata || "",
            bili_jct: data.bili_jct || "",
            dedeuserid: data.dedeuserid || "",
            buvid3: data.buvid3 || "",
          });
          return;
        } else if (data.code === 86101) {
          // Not scanned yet
          setStatus("waiting-scan");
          setStatusText(t("bilibili.waitingScan"));
        } else if (data.code === 86090) {
          // Scanned, waiting for confirmation
          setStatus("waiting-confirm");
          setStatusText(t("bilibili.waitingConfirm"));
        } else if (data.code === 86038) {
          // QR code expired
          setPolling(false);
          setStatus("error");
          setStatusText(t("bilibili.qrExpired"));
          return;
        }

        attempts++;
        setTimeout(poll, 3000);
      } catch (err) {
        setPolling(false);
        setStatus("error");
        setStatusText(`${t("bilibili.pollFailed")}: ${String(err)}`);
      }
    };

    poll();
  }

  function reset() {
    setPolling(false);
    setQrUrl("");
    setStatus("idle");
    setStatusText("");
  }

  return (
    <div className="bilibili-login">
      {/* Idle State */}
      {status === "idle" && (
        <div className="bilibili-login-idle">
          <QrCode size={48} />
          <h3>{t("bilibili.loginTitle")}</h3>
          <p>{t("bilibili.loginDesc")}</p>
          <MacToolbarButton
            icon={<QrCode size={14} />}
            label={t("bilibili.generateQr")}
            onClick={generateQrCode}
            primary
          />
        </div>
      )}

      {/* Loading */}
      {status === "loading" && (
        <div className="bilibili-login-loading">
          <Loader2 size={48} className="spin" />
          <p>{statusText}</p>
        </div>
      )}

      {/* QR Code Ready */}
      {status === "qr-ready" && qrUrl && (
        <div className="bilibili-login-qr">
          <div className="bilibili-qr-container">
            {/* Generate QR code as SVG using a simple QR code library or display URL */}
            <div className="bilibili-qr-placeholder">
              <QrCode size={120} />
              <span className="bilibili-qr-hint">{t("bilibili.scanHint")}</span>
            </div>
          </div>
          <p className="bilibili-status-text">{statusText}</p>
          <MacToolbarButton
            icon={<RefreshCw size={14} />}
            label={t("bilibili.refreshQr")}
            onClick={reset}
          />
        </div>
      )}

      {/* Waiting for Scan */}
      {status === "waiting-scan" && (
        <div className="bilibili-login-qr">
          <div className="bilibili-qr-container">
            <div className="bilibili-qr-placeholder">
              <QrCode size={120} />
              <span className="bilibili-qr-hint">{t("bilibili.scanHint")}</span>
            </div>
          </div>
          <p className="bilibili-status-text">{statusText}</p>
          <MacToolbarButton
            icon={<RefreshCw size={14} />}
            label={t("bilibili.refreshQr")}
            onClick={reset}
          />
        </div>
      )}

      {/* Waiting for Confirmation */}
      {status === "waiting-confirm" && (
        <div className="bilibili-login-qr">
          <div className="bilibili-qr-container">
            <div className="bilibili-qr-placeholder">
              <CheckCircle2 size={120} className="text-green" />
            </div>
          </div>
          <p className="bilibili-status-text">{statusText}</p>
        </div>
      )}

      {/* Success */}
      {status === "success" && (
        <div className="bilibili-login-success">
          <CheckCircle2 size={48} />
          <h3>{statusText}</h3>
          <MacToolbarButton
            icon={<RefreshCw size={14} />}
            label={t("bilibili.loginAgain")}
            onClick={reset}
          />
        </div>
      )}

      {/* Error */}
      {status === "error" && (
        <div className="bilibili-login-error">
          <AlertCircle size={48} />
          <p>{statusText}</p>
          <MacToolbarButton
            icon={<RefreshCw size={14} />}
            label={t("bilibili.retry")}
            onClick={reset}
            primary
          />
        </div>
      )}

      {/* Privacy Notice */}
      <MacInlineNotice tone="neutral">
        <AlertCircle size={14} />
        {t("bilibili.privacyNotice")}
      </MacInlineNotice>
    </div>
  );
}

export { BilibiliLogin };
