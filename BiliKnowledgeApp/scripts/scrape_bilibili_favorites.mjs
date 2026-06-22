#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import process from "node:process";
import { chromium } from "playwright-core";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36";

function parseArgs(argv) {
  const args = {
    config: "",
    output: "",
    maxFolders: 0,
    maxItemsPerFolder: 0,
    headless: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--config") {
      args.config = argv[i + 1] || "";
      i += 1;
    } else if (token === "--output") {
      args.output = argv[i + 1] || "";
      i += 1;
    } else if (token === "--max-folders") {
      args.maxFolders = Number(argv[i + 1] || "0") || 0;
      i += 1;
    } else if (token === "--max-items-per-folder") {
      args.maxItemsPerFolder = Number(argv[i + 1] || "0") || 0;
      i += 1;
    } else if (token === "--headed") {
      args.headless = false;
    }
  }

  if (!args.config) {
    throw new Error("Missing required --config path");
  }
  if (!args.output) {
    throw new Error("Missing required --output path");
  }
  return args;
}

function detectChromeExecutable() {
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error("No Chrome-like browser found. Install Google Chrome, Edge, Chromium, or Brave.");
}

function loadConfig(configPath) {
  const raw = fs.readFileSync(configPath, "utf8");
  return JSON.parse(raw);
}

function buildCookieHeader(config) {
  const bilibili = config.bilibili || {};
  const rawCookie = String(bilibili.cookie || "").trim();
  if (rawCookie) {
    return rawCookie;
  }

  const parts = [];
  const mapping = [
    ["SESSDATA", bilibili.sessdata],
    ["bili_jct", bilibili.bili_jct],
    ["DedeUserID", bilibili.dedeuserid],
    ["buvid3", bilibili.buvid3],
  ];
  for (const [name, value] of mapping) {
    const normalized = String(value || "").trim();
    if (normalized) {
      parts.push(`${name}=${normalized}`);
    }
  }
  return parts.join("; ");
}

function parseCookieHeader(cookieHeader) {
  return cookieHeader
    .split(";")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => {
      const pivot = segment.indexOf("=");
      if (pivot === -1) {
        return null;
      }
      return {
        name: segment.slice(0, pivot).trim(),
        value: segment.slice(pivot + 1).trim(),
      };
    })
    .filter(Boolean);
}

function httpGetJson(url, cookieHeader) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: "GET",
        headers: {
          Cookie: cookieHeader,
          "User-Agent": USER_AGENT,
          Referer: "https://www.bilibili.com/",
          Accept: "application/json, text/plain, */*",
        },
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(new Error(`Invalid JSON from ${url}: ${error.message}`));
          }
        });
      },
    );
    req.on("error", reject);
    req.setTimeout(20000, () => {
      req.destroy(new Error(`Request timeout: ${url}`));
    });
    req.end();
  });
}

async function fetchLoginProfile(cookieHeader) {
  const payload = await httpGetJson("https://api.bilibili.com/x/web-interface/nav", cookieHeader);
  const data = payload.data || {};
  if (!data.isLogin) {
    throw new Error(payload.message || "SESSDATA is invalid or expired");
  }
  return data;
}

async function fetchFavoriteFolders(cookieHeader, mid) {
  const query = new URLSearchParams({ up_mid: String(mid) }).toString();
  const payload = await httpGetJson(
    `https://api.bilibili.com/x/v3/fav/folder/created/list-all?${query}`,
    cookieHeader,
  );
  if (payload.code !== 0) {
    throw new Error(payload.message || "Failed to fetch favorite folders");
  }
  return (payload.data && payload.data.list) || [];
}

async function fetchFolderResourcesWithCookie(cookieHeader, folder, options) {
  const targetCount = Number(folder.media_count || folder.count || 0);
  const batchLimit = Number(options.maxItemsPerFolder || 0);
  const items = [];
  const seen = new Set();

  for (let pageNumber = 1; pageNumber <= 500; pageNumber += 1) {
    const query = new URLSearchParams({
      media_id: String(folder.id),
      pn: String(pageNumber),
      ps: "20",
      platform: "web",
    }).toString();
    const payload = await httpGetJson(
      `https://api.bilibili.com/x/v3/fav/resource/list?${query}`,
      cookieHeader,
    );
    if (!payload || payload.code !== 0) {
      throw new Error(payload?.message || `收藏夹接口返回异常（${folder.title || "默认收藏夹"}）`);
    }
    const medias = payload.data?.medias || [];
    for (const media of medias) {
      const bvid = media?.bvid || media?.bv_id || "";
      if (!bvid || seen.has(bvid)) {
        continue;
      }
      seen.add(bvid);
      items.push({
        bvid,
        title: media?.title || "",
        url: `https://www.bilibili.com/video/${bvid}`,
        uploader: media?.upper?.name || "",
        collected_at: "",
        duration: String(media?.duration || ""),
        favorite_folder: folder.title || "默认收藏夹",
        desc: media?.intro || "",
      });
      if (batchLimit > 0 && items.length >= batchLimit) {
        break;
      }
    }
    if (!medias.length) {
      break;
    }
    if (batchLimit > 0 && items.length >= batchLimit) {
      break;
    }
    if (targetCount > 0 && items.length >= targetCount) {
      break;
    }
    if (!payload.data?.has_more) {
      break;
    }
  }

  return items;
}

async function seedBilibiliCookies(context, cookieHeader) {
  const cookies = parseCookieHeader(cookieHeader).map((cookie) => ({
    ...cookie,
    domain: ".bilibili.com",
    path: "/",
    httpOnly: false,
    secure: true,
    sameSite: "Lax",
  }));
  await context.addCookies(cookies);
}

async function extractFolderPage(page, favoriteFolder) {
  return await page.evaluate((folderTitle) => {
    const isVideoId = (value) => /^BV[0-9A-Za-z]+$/.test(value);
    const clean = (value) => (value || "").replace(/\s+/g, " ").trim();
    const timeLike = (value) => /^\d{1,2}:\d{2}$/.test(value) || /^\d{1,2}:\d{2}:\d{2}$/.test(value);
    const byBvid = new Map();

    const cards = Array.from(document.querySelectorAll(".bili-video-card__wrap"));
    for (const card of cards) {
      const titleAnchor = card.querySelector('a[href*="/video/BV"] .bili-video-card__title')
        ? card.querySelector('a[href*="/video/BV"]')
        : card.querySelector('.bili-video-card__details a[href*="/video/BV"]');
      const coverAnchor = card.querySelector('.bili-video-card__cover[href*="/video/BV"], a.bili-video-card__cover[href*="/video/BV"]');
      const anchor = titleAnchor || coverAnchor || card.querySelector('a[href*="/video/BV"]');
      if (!anchor) {
        continue;
      }

      const href = anchor.getAttribute("href") || "";
      const matched = href.match(/BV[0-9A-Za-z]+/);
      if (!matched) {
        continue;
      }
      const bvid = matched[0];

      const rowText = clean(card.innerText || card.textContent || "");
      const rowLines = (card.innerText || card.textContent || "")
        .split("\n")
        .map(clean)
        .filter(Boolean);

      const titleCandidate =
        clean(card.querySelector(".bili-video-card__title")?.textContent || "") ||
        clean(anchor.textContent || "");
      const lineTitle = rowLines
        .filter((line) => !isVideoId(line))
        .filter((line) => line !== "稍后再看" && line !== "当前")
        .filter((line) => !timeLike(line))
        .filter((line) => !/^\d+(\.\d+)?[万亿]?$/.test(line))
        .filter((line) => !line.includes("收藏于"))
        .sort((a, b) => b.length - a.length)[0] || titleCandidate;

      const metaLine = rowLines.find((line) => line.includes("· 收藏于")) || "";
      const metaMatch = metaLine.match(/^(.*?)\s*·\s*收藏于(.*)$/);
      const duration =
        clean(card.querySelector(".bili-video-card__stats__duration")?.textContent || "") ||
        rowLines.find((line) => timeLike(line)) ||
        "";
      const title = clean(lineTitle || titleCandidate);

      if (!title || title.length < 2) {
        continue;
      }

      const existing = byBvid.get(bvid);
      const currentScore = title.length;
      const existingScore = existing ? existing.title.length : -1;
      if (currentScore >= existingScore) {
        byBvid.set(bvid, {
          bvid,
          title,
          url: `https://www.bilibili.com/video/${bvid}`,
          uploader: metaMatch ? clean(metaMatch[1]) : "",
          collected_at: metaMatch ? clean(metaMatch[2]) : "",
          duration,
          favorite_folder: folderTitle,
          desc: rowText,
        });
      }
    }

    return Array.from(byBvid.values());
  }, favoriteFolder);
}

async function currentFirstBvid(page) {
  const items = await extractFolderPage(page, "");
  return items[0] ? items[0].bvid : "";
}

async function clickNextPage(page, previousFirstBvid) {
  const next = page.getByText("下一页", { exact: true }).first();
  if ((await next.count()) === 0) {
    return false;
  }

  try {
    await next.click({ timeout: 5000 });
  } catch {
    return false;
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    await page.waitForTimeout(400);
    const nextFirstBvid = await currentFirstBvid(page);
    if (nextFirstBvid && nextFirstBvid !== previousFirstBvid) {
      return true;
    }
  }
  return false;
}

async function scrapeFolder(context, folder, options, cookieHeader) {
  const folderTitle = folder.title || "默认收藏夹";
  const folderUrl = `https://space.bilibili.com/${folder.mid}/favlist?fid=${folder.id}&ftype=create`;
  console.log(`[浏览器同步] 打开收藏夹：${folderTitle}`);

  const page = await context.newPage();
  try {
    await page.goto(folderUrl, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    const targetCount = Number(folder.media_count || folder.count || 0);
    const batchLimit = Number(options.maxItemsPerFolder || 0);
    const cappedTarget = batchLimit > 0 && targetCount > 0 ? Math.min(targetCount, batchLimit) : targetCount;

    let fetchedItems = [];
    try {
      fetchedItems = await page.evaluate(
        async ({ mediaId, folderTitle: currentFolderTitle, batchLimit: currentBatchLimit, targetCount: currentTargetCount }) => {
          const pageSize = 20;
          const items = [];
          const seen = new Set();

          for (let pageNumber = 1; pageNumber <= 500; pageNumber += 1) {
            const query = new URLSearchParams({
              media_id: String(mediaId),
              pn: String(pageNumber),
              ps: String(pageSize),
              platform: "web",
            });
            const response = await fetch(`https://api.bilibili.com/x/v3/fav/resource/list?${query.toString()}`, {
              credentials: "include",
              headers: {
                Accept: "application/json, text/plain, */*",
              },
            });
            const payload = await response.json();
            if (!payload || payload.code !== 0) {
              throw new Error(payload?.message || `收藏夹接口返回异常（${currentFolderTitle}）`);
            }

            const medias = payload.data?.medias || [];
            for (const media of medias) {
              const bvid = media?.bvid || media?.bv_id || "";
              if (!bvid || seen.has(bvid)) {
                continue;
              }
              seen.add(bvid);
              items.push({
                bvid,
                title: media?.title || "",
                url: `https://www.bilibili.com/video/${bvid}`,
                uploader: media?.upper?.name || "",
                collected_at: "",
                duration: String(media?.duration || ""),
                favorite_folder: currentFolderTitle,
                desc: media?.intro || "",
              });
              if (currentBatchLimit > 0 && items.length >= currentBatchLimit) {
                break;
              }
            }

            if (!medias.length) {
              break;
            }
            if (currentBatchLimit > 0 && items.length >= currentBatchLimit) {
              break;
            }
            if (currentTargetCount > 0 && items.length >= currentTargetCount) {
              break;
            }
            if (!payload.data?.has_more) {
              break;
            }
          }

          return items;
        },
        {
          mediaId: folder.id,
          folderTitle,
          batchLimit,
          targetCount,
        },
      );
    } catch (error) {
      console.warn(`[浏览器同步] ${folderTitle} 浏览器态抓取失败，回退接口同步：${error.message}`);
      fetchedItems = await fetchFolderResourcesWithCookie(cookieHeader, folder, options);
    }

    console.log(
      `[浏览器同步] ${folderTitle} 抓取完成，累计 ${fetchedItems.length}` +
        (cappedTarget > 0 ? ` / ${cappedTarget}` : ""),
    );
    return fetchedItems;
  } finally {
    await page.close();
  }
}

function normalizeFolders(folders, mid) {
  return folders.map((folder) => ({
    id: String(folder.id || ""),
    title: folder.title || "默认收藏夹",
    media_count: Number(folder.media_count || folder.count || 0),
    mid: String(mid),
  }));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig(args.config);
  const cookieHeader = buildCookieHeader(config);
  const usedRawCookie = Boolean(String((config.bilibili || {}).cookie || "").trim());
  if (!cookieHeader) {
    throw new Error("Missing Bilibili cookie config");
  }

  const profile = await fetchLoginProfile(cookieHeader);
  console.log(`[浏览器同步] 当前账号：${profile.uname} (${profile.mid})`);

  let folders = normalizeFolders(await fetchFavoriteFolders(cookieHeader, profile.mid), profile.mid);
  if (args.maxFolders > 0) {
    folders = folders.slice(0, args.maxFolders);
  }
  console.log(`[浏览器同步] 待同步收藏夹：${folders.length}`);

  const browser = await chromium.launch({
    executablePath: detectChromeExecutable(),
    headless: args.headless,
  });

  try {
    const context = await browser.newContext({ userAgent: USER_AGENT });
    await seedBilibiliCookies(context, cookieHeader);

    const seedPage = await context.newPage();
    await seedPage.goto("https://www.bilibili.com/", { waitUntil: "domcontentloaded" });
    await seedPage.waitForTimeout(1500);
    await seedPage.close();

    const items = [];
    for (const folder of folders) {
      const folderItems = await scrapeFolder(context, folder, {
        maxItemsPerFolder: args.maxItemsPerFolder,
      }, cookieHeader);
      for (const item of folderItems) {
        items.push(item);
      }
    }

    const expectedVisibleItems = folders.reduce((sum, folder) => {
      const count = Number(folder.media_count || 0);
      if (args.maxItemsPerFolder > 0) {
        return sum + Math.min(count, args.maxItemsPerFolder);
      }
      return sum + count;
    }, 0);

    if (!items.length && expectedVisibleItems > 0 && !usedRawCookie) {
      throw new Error(
        "当前仅配置了 SESSDATA 等基础字段，未拿到完整 Cookie Header。B 站收藏页不会返回真实列表，请在设置页粘贴整段浏览器 Cookie 后重试。",
      );
    }

    const payload = {
      profile: {
        mid: profile.mid,
        uname: profile.uname,
      },
      folders: folders.map(({ id, title, media_count }) => ({ id, title, media_count })),
      items,
    };

    const outputPath = path.resolve(args.output);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), "utf8");
    console.log(`[浏览器同步] 写入结果：${outputPath}（${items.length} 条）`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`[浏览器同步错误] ${error.message}`);
  process.exit(1);
});
