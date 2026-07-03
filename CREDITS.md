# Credits and Open Source Attribution

哔知 / BiZhi uses open-source projects through normal package managers and optional local tooling. The upstream authors and organizations listed here are **not implied to be contributors to this repository** unless they have submitted code here directly; they are credited because this project depends on, integrates with, or recommends their open-source work.

If a contribution adds a new dependency, bundled asset, generated sample, or named third-party integration, update this file and `CONTRIBUTING.md` with the upstream author/organization link, project link, and license.

## Direct Frontend and Desktop Dependencies

| Area | Project | Author / organization link | Upstream link | License |
|---|---|---|---|---|
| Desktop shell | Tauri (`tauri`, `@tauri-apps/api`, `@tauri-apps/cli`) | [Tauri Programme / The Commons Conservancy](https://tauri.app/about/) | [tauri-apps/tauri](https://github.com/tauri-apps/tauri) | MIT OR Apache-2.0 |
| Tauri opener plugin | `tauri-plugin-opener`, `@tauri-apps/plugin-opener` | [Tauri Apps](https://github.com/tauri-apps) | [tauri-apps/plugins-workspace](https://github.com/tauri-apps/plugins-workspace) | MIT OR Apache-2.0 |
| UI runtime | React / React DOM | [Meta Open Source](https://opensource.fb.com/) | [facebook/react](https://github.com/facebook/react) | MIT |
| Frontend tooling | Vite / `@vitejs/plugin-react` | [Vite team](https://vite.dev/) / [Evan You](https://github.com/yyx990803) | [vitejs/vite](https://github.com/vitejs/vite) | MIT |
| Language tooling | TypeScript | [Microsoft](https://opensource.microsoft.com/) | [microsoft/TypeScript](https://github.com/microsoft/TypeScript) | Apache-2.0 |
| Styling | Tailwind CSS / `@tailwindcss/postcss` | [Tailwind Labs](https://tailwindcss.com/) | [tailwindlabs/tailwindcss](https://github.com/tailwindlabs/tailwindcss) | MIT |
| CSS processing | PostCSS / Autoprefixer | [Andrey Sitnik](https://github.com/ai) and maintainers | [postcss/postcss](https://github.com/postcss/postcss), [postcss/autoprefixer](https://github.com/postcss/autoprefixer) | MIT |
| Animation | Motion / Framer Motion | [Motion Division](https://github.com/motiondivision) / Matt Perry | [motiondivision/motion](https://github.com/motiondivision/motion) | MIT |
| Icons | Lucide React | [Lucide Icons](https://github.com/lucide-icons) / [Eric Fennis](https://github.com/ericfennis) | [lucide-icons/lucide](https://github.com/lucide-icons/lucide) | ISC |
| Markdown rendering | React Markdown | [remarkjs](https://github.com/remarkjs) / [Espen Hovlandsdal](https://github.com/rexxars) | [remarkjs/react-markdown](https://github.com/remarkjs/react-markdown) | MIT |
| Browser automation core | Playwright Core | [Microsoft](https://opensource.microsoft.com/) | [microsoft/playwright](https://github.com/microsoft/playwright) | Apache-2.0 |
| QR code rendering | `qrcode` | [Ryan Day / soldair](https://github.com/soldair) | [soldair/node-qrcode](https://github.com/soldair/node-qrcode) | MIT |
| Utility classes | `clsx` | [Luke Edwards](https://github.com/lukeed) | [lukeed/clsx](https://github.com/lukeed/clsx) | MIT |
| Tailwind class merging | `tailwind-merge` | [Dany Castillo](https://github.com/dcastil) | [dcastil/tailwind-merge](https://github.com/dcastil/tailwind-merge) | MIT |
| Type definitions | DefinitelyTyped packages | [DefinitelyTyped contributors](https://github.com/DefinitelyTyped) | [DefinitelyTyped/DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped) | MIT |

## Direct Rust Dependencies

| Project | Author / organization link | Upstream link | License |
|---|---|---|---|
| Serde / Serde JSON | [Serde maintainers](https://serde.rs/) | [serde-rs/serde](https://github.com/serde-rs/serde), [serde-rs/json](https://github.com/serde-rs/json) | MIT OR Apache-2.0 |
| Reqwest | [Sean McArthur / seanmonstar](https://github.com/seanmonstar) | [seanmonstar/reqwest](https://github.com/seanmonstar/reqwest) | MIT OR Apache-2.0 |
| RustCrypto RSA / SHA-2 | [RustCrypto Developers](https://github.com/RustCrypto) | [RustCrypto/RSA](https://github.com/RustCrypto/RSA), [RustCrypto/hashes](https://github.com/RustCrypto/hashes) | MIT OR Apache-2.0 |
| Rand | [Rust Random project](https://github.com/rust-random) | [rust-random/rand](https://github.com/rust-random/rand) | MIT OR Apache-2.0 |
| Regex | [Rust Regex maintainers](https://github.com/rust-lang/regex) | [rust-lang/regex](https://github.com/rust-lang/regex) | MIT OR Apache-2.0 |
| Which | [Harry Fei](https://github.com/harryfei) | [harryfei/which-rs](https://github.com/harryfei/which-rs) | MIT |
| Hex | [KokaKiwi](https://github.com/KokaKiwi) | [KokaKiwi/rust-hex](https://github.com/KokaKiwi/rust-hex) | MIT OR Apache-2.0 |
| URL encoding | [Kornel Lesiński](https://github.com/kornelski) and contributors | [kornelski/rust_urlencoding](https://github.com/kornelski/rust_urlencoding) | MIT |

## Optional Local Tooling

These tools are not vendored into this repository, but users may install them locally for subtitle download, media processing, or ASR.

| Tool | Author / organization link | Upstream link | License / notes |
|---|---|---|---|
| FFmpeg | [FFmpeg Developers](https://ffmpeg.org/about.html) | [FFmpeg project](https://ffmpeg.org/) | See upstream license terms |
| yt-dlp | [yt-dlp contributors](https://github.com/yt-dlp/yt-dlp/graphs/contributors) | [yt-dlp/yt-dlp](https://github.com/yt-dlp/yt-dlp) | Unlicense |
| FunASR | [Alibaba DAMO Academy contributors](https://github.com/modelscope/FunASR/graphs/contributors) | [modelscope/FunASR](https://github.com/modelscope/FunASR) | See upstream license terms |
| urllib3 | [urllib3 contributors](https://github.com/urllib3/urllib3/graphs/contributors) | [urllib3/urllib3](https://github.com/urllib3/urllib3) | MIT |

For full transitive dependency details, inspect `BiliKnowledgeApp/package-lock.json` and `BiliKnowledgeApp/src-tauri/Cargo.lock`. Do not vendor third-party source into this repository without preserving its license notices.
