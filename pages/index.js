import { useCallback, useEffect, useMemo, useState } from "react";
const LINK_STYLE = { color: "#3182ce", textDecoration: "underline" };
// 1ページあたりの表示件数
const PAGE_SIZE = 24;
// 都道府県名の揺らぎを吸収するための正規化関数
const normalize = (name) => name?.replace(/(都|道|府|県)$/, "") || "";
// 地域ごとの都道府県リスト
const regionalPrefectures = [
  {
    region: "東日本",
    prefs: [
      "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
      "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
    ],
  },
  {
    region: "中日本",
    prefs: [
      "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県", "三重県",
    ],
  },
  {
    region: "西日本",
    prefs: [
      "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県",
      "山口県", "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県", "熊本県", "大分県",
      "宮崎県", "鹿児島県", "沖縄県",
    ],
  },
];
// スキルカテゴリとそれぞれのスキルリスト
const skillCategories = [
  {
    label: "Language / Backend",
    skills: ["Java", "PHP", "Python", "Ruby", "Go", "C#", "C++", "Rust", "Kotlin", "Swift"],
  },
  {
    label: "Frontend",
    skills: ["React", "Next.js", "Vue.js", "Nuxt.js", "TypeScript", "JavaScript"],
  },
  {
    label: "Infra / OS / Cloud",
    skills: ["AWS", "Azure", "GCP", "Docker", "Kubernetes", "Linux", "Windows", "Terraform"],
  },
  {
    label: "DB / Tool / CI/CD",
    skills: ["MySQL", "PostgreSQL", "Oracle", "Git", "GitHub", "CircleCI", "Jenkins", "Ansible"],
  },
];
// サイドバーのカテゴリ
const sideCategories = [
  { id: "all", label: "すべて" },
  { id: "dev", label: "開発" },
  { id: "infra", label: "インフラ" },
  { id: "embedded", label: "組み込み" },
];
// タブの定義
const tabs = [
  { id: "all", label: "案件を探す" },
  { id: "applied", label: "応募済み" },
  { id: "favorites", label: "お気に入り" },
  { id: "history", label: "閲覧履歴" },
];
// ローカルストレージのラッパー
const storage = {
  get(key) {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(localStorage.getItem(key) || "[]");
    } catch {
      return [];
    }
  },
  set(key, value) {
    if (typeof window !== "undefined") {
      localStorage.setItem(key, JSON.stringify(value));
    }
  },
};
// HTMLエンティティをデコードする関数
const decodeHtml = (html) => {
  if (typeof window === "undefined") return html;
  const textarea = document.createElement("textarea");
  textarea.innerHTML = html;
  return textarea.value;
};
// テキスト内のURLやメールアドレスをリンクに変換する関数
const formatContent = (html) => {
  try {
    const decoded = decodeHtml(html || "");
    const linkRegex = /(https?:\/\/[^\s<>"']+|[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,})/g;
    return decoded.split(linkRegex).map((part, index) => {
      if (/^https?:\/\//.test(part)) {
        return (
<a key={`${part}-${index}`} href={part} target="_blank" rel="noopener noreferrer" style={LINK_STYLE}>
            {part}
</a>
        );
      }
      if (/^[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}$/.test(part)) {
        return (
<a key={`${part}-${index}`} href={`mailto:${part}`} style={LINK_STYLE}>
            {part}
</a>
        );
      }
      return part;
    });
  } catch {
    return html;
  }
};
// メールの署名部分を削除する関数
const removeSignature = (text = "") => {
  const bodyLines = [];
  for (const line of text.split(/\n/)) {
    if (/[◇◆□■ー\-=＝*＊#＃]{5,}/.test(line) || /^(【会社名】|【連絡先】|■署名|URL：)/.test(line)) {
      break;
    }
    bodyLines.push(line);
  }
  return bodyLines.join("\n").trim();
};
// 募集人数を抽出する関数
const extractRecruitment = (content = "") => {
  const match = content.match(/([0-9０-９]+|複数|若干)名(以上)?/);
  return match?.[0] || "記載なし";
};
// 案件のカテゴリ判定
const getProjectCategories = (project) => {
  const text = `${project.title || ""}${project.content || ""}${project.skills || ""}`.toLowerCase();
  const categories = [];
  if (/java|php|python|ruby|go|c#|react|next\.js|vue\.js|typescript|javascript|フロントエンド|バックエンド|アプリ|開発/i.test(text))
    categories.push("dev");
  if (/インフラ|サーバ|ネットワーク|aws|azure|gcp|cloud|監視|構築/i.test(text))
    categories.push("infra");
  if (/組み込み|組込|マイコン|制御|c言語|c\+\+|embedded/i.test(text))
    categories.push("embedded");
  return categories.length ? categories : ["dev"];
};
// スタイル定義
const styles = {
  page: { backgroundColor: "#f7fafc", minHeight: "100vh", color: "#2d3748", fontFamily: "sans-serif" },
  nav: { backgroundColor: "#fff", position: "sticky", top: 0, zIndex: 100, borderBottom: "1px solid #e2e8f0" },
  navInner: { display: "flex", height: 60, padding: "0 20px", alignItems: "center" },
  sidebar: { width: 220, flexShrink: 0 },
  card: { backgroundColor: "#fff", borderRadius: 10, padding: 25, border: "1px solid #edf2f7", display: "flex", flexDirection: "column", position: "relative" },
  badge: { fontSize: "0.7rem", color: "#fff", padding: "2px 6px", borderRadius: 4, fontWeight: "bold" },
  primaryButton: { padding: 10, backgroundColor: "#1a365d", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: "bold" },
  secondaryButton: { padding: 10, backgroundColor: "#3182ce", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: "bold" },
  pageBtn: { padding: "8px 14px", borderRadius: 6, border: "1px solid #cbd5e0", background: "#fff", color: "#2d3748", cursor: "pointer", fontWeight: "bold", fontSize: "0.9rem", transition: "all 0.2s" },
  modalOverlay: { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 },
  modalContent: { backgroundColor: "#fff", borderRadius: 12, padding: 30, maxWidth: 800, width: "100%", maxHeight: "90vh", overflowY: "auto", position: "relative" },
  spinner: { width: 40, height: 40, border: "4px solid rgba(0,191,165,0.2)", borderTopColor: "#00bfa5", borderRadius: "50%", animation: "spin 1s linear infinite", margin: "40px auto" },
  attachmentSection: { marginTop: 15, paddingTop: 12, borderTop: "1px dashed #e2e8f0" },
  attachmentLink: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.85rem", color: "#3182ce", textDecoration: "none", marginRight: 12, marginBottom: 4, fontWeight: "500" }
};
 
// メインコンポーネント
export default function Home() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPrefs, setSelectedPrefs] = useState([]);
  const [selectedSkills, setSelectedSkills] = useState([]);
  const [showFilters, setShowFilters] = useState(false);
  const [stationSuggestions, setStationSuggestions] = useState([]);
  const [isRemoteOnly, setIsRemoteOnly] = useState(false);
  const [hideClosed, setHideClosed] = useState(true);
  const [viewMode, setViewMode] = useState("all");
  const [favFilters, setFavFilters] = useState([]);
  const [historyIds, setHistoryIds] = useState([]);
  const [readIds, setReadIds] = useState([]);
  const [appliedIds, setAppliedIds] = useState([]);
  const [deleteTargetId, setDeleteTargetId] = useState(null);
  const [selectedRegion, setSelectedRegion] = useState("すべて");
 
  // 🕒 検索履歴用のStateと保存関数（内部的な保存枠は余裕を持って20件に広げています）
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [history, setHistory] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        return JSON.parse(localStorage.getItem("searchHistory") || "[]");
      } catch {
        return [];
      }
    }
    return [];
  });
 // 検索キーワードを履歴に保存する関数。重複は削除して最新のものを先頭に、最大20件まで保持します
  const handleSearchSubmit = (keyword) => {
    if (!keyword || !keyword.trim()) return;
    const trimmed = keyword.trim();
    setHistory((prev) => {
      // 🟢 履歴データ自体は20件まで保持し、表示側で高さを制限してスクロールさせます
      const next = [trimmed, ...prev.filter((k) => k !== trimmed)].slice(0, 20);
      if (typeof window !== "undefined") {
        localStorage.setItem("searchHistory", JSON.stringify(next));
      }
      return next;
    });
  };
 
  // supabaseから添付ファイル情報を取得して、 機械語（バイナリデータ）をファイルに復元してダウンロードする
  const handleDownloadFile = async (event, fileUrl, fileName) => {
    event.preventDefault();
    event.stopPropagation();
 
    if (!fileUrl) {
      alert("ファイルURLが存在しません。");
      return;
    }
 
    try {
      const safeUrl = encodeURI(decodeURI(fileUrl));
      const response = await fetch(safeUrl);
      if (!response.ok) {
        throw new Error(`ファイルの取得に失敗しました (Status: ${response.status})`);
      }
 
      const blob = await response.blob();
      const tempUrl = window.URL.createObjectURL(blob);
 
      const link = document.createElement("a");
      link.href = tempUrl;
      link.download = fileName || "download_file";
      document.body.appendChild(link);
      link.click();
 
      document.body.removeChild(link);
      window.URL.revokeObjectURL(tempUrl);
    } catch (error) {
      console.error("ダウンロードエラー:", error);
      window.open(encodeURI(decodeURI(fileUrl)), '_blank');
    }
  };
 
  // APIから全データをループで取得
  const fetchData = useCallback(async () => {
    setLoading(true);
    let allProjects = [];
    let page = 0;
    let isFetching = true;
 
    try {
      while (isFetching) {
        const res = await fetch(`/api/mails?page=${page}`);
        const payload = await res.json();
        if (payload.error || !payload.data) break;
        allProjects = [...allProjects, ...payload.data];
        if (payload.data.length < 1000) {
          isFetching = false;
        } else {
          page = page + 1;
        }
      }
      const favorites = storage.get("favorites");
      const historyData = storage.get("history");
      const read = storage.get("readProjects");
      const applied = storage.get("appliedIds");
      setHistoryIds(historyData);
      setReadIds(read);
      setAppliedIds(applied);
      setProjects(
        allProjects.map((item) => ({
          ...item,
          favorite: favorites.includes(item.id),
        }))
      );
    } catch (error) {
      console.error("データ取得エラー:", error);
    } finally {
      setLoading(false);
    }
  }, []);
 
  useEffect(() => {
    fetchData();
  }, [fetchData]);
 
  // 駅名サジェスト取得
  const fetchStations = useCallback(async (keyword) => {
    if (!keyword) {
      setStationSuggestions([]);
      return;
    }
    try {
      const targetPrefs = selectedPrefs.length ? selectedPrefs : ["大阪府"];
      const responses = await Promise.all(
        targetPrefs.slice(0, 5).map((pref) =>
          fetch(`https://express.heartrails.com/api/json?method=getStations&prefecture=${encodeURIComponent(pref)}`)
            .then((res) => res.json())
            .catch(() => ({ response: { station: [] } }))
        )
      );
      const stations = responses.flatMap((json) => json?.response?.station?.map((station) => station.name) || []);
      setStationSuggestions([...new Set(stations.filter((name) => name.includes(keyword)))].slice(0, 10));
    } catch {
      setStationSuggestions([]);
    }
  }, [selectedPrefs]);
 
  // フィルタリング処理
  const filteredProjects = useMemo(() => {
    const query = searchQuery.toLowerCase();
    const currentRegionData = regionalPrefectures.find((r) => r.region === selectedRegion);
    const allowedPrefsNormalized = currentRegionData ? currentRegionData.prefs.map(normalize) : [];
    return projects.filter((project) => {
      if (hideClosed && project.isClosed) return false;
      const isApplied = appliedIds.includes(project.id);
      if (viewMode === "applied") return isApplied;
      if (isApplied) return false;
      if (viewMode === "favorites") return project.favorite;
      if (viewMode === "history") return historyIds.includes(project.id);
      if (favFilters.length) {
        const categories = getProjectCategories(project);
        if (!favFilters.every((filter) => categories.includes(filter))) return false;
      }
      const pureContent = removeSignature(project.content || "");
      const searchableText = `${project.title || ""}${project.skills || ""}${pureContent}${project.location || ""}`.toLowerCase();
      const projectLocation = (project.location || "").trim();
      const projectPrefNormalized = normalize(projectLocation);
      if (viewMode === "all" && selectedRegion !== "すべて") {
        const matchesRegion = allowedPrefsNormalized.some((pref) => {
          return projectPrefNormalized.startsWith(pref);
        });
        if (!matchesRegion) return false;
      }
      if (selectedPrefs.length) {
        const matchesPref = selectedPrefs.some((pref) => {
          return projectPrefNormalized.startsWith(normalize(pref));
        });
        if (!matchesPref) return false;
      }
      const matchesSkill = !selectedSkills.length || selectedSkills.every((skill) => searchableText.includes(skill.toLowerCase()));
      const matchesRemote = !isRemoteOnly || [project.location, project.title, pureContent].some((text) => text?.includes("リモート"));
      return searchableText.includes(query) && matchesSkill && matchesRemote;
    });
  }, [appliedIds, favFilters, hideClosed, historyIds, isRemoteOnly, projects, searchQuery, selectedPrefs, selectedSkills, viewMode, selectedRegion]);
 
  const totalPages = Math.ceil(filteredProjects.length / PAGE_SIZE);
  const currentItems = filteredProjects.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
 
  // ページネーション範囲計算
  const paginationRange = useMemo(() => {
    const siblingCount = 2;
    const totalPageNumbers = siblingCount * 2 + 5;
    if (totalPageNumbers >= totalPages) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const leftSiblingIndex = Math.max(currentPage - siblingCount, 1);
    const rightSiblingIndex = Math.min(currentPage + siblingCount, totalPages);
    const shouldShowLeftDots = leftSiblingIndex > 2;
    const shouldShowRightDots = rightSiblingIndex < totalPages - 2;
    if (!shouldShowLeftDots && shouldShowRightDots) {
      return Array.from({ length: 3 + 2 * siblingCount }, (_, i) => i + 1);
    }
    if (shouldShowLeftDots && !shouldShowRightDots) {
      const rightItemCount = 3 + 2 * siblingCount;
      return Array.from({ length: rightItemCount }, (_, i) => totalPages - rightItemCount + i + 1);
    }
    if (shouldShowLeftDots && shouldShowRightDots) {
      return Array.from({ length: rightSiblingIndex - leftSiblingIndex + 1 }, (_, i) => leftSiblingIndex + i);
    }
    return [];
  }, [currentPage, totalPages]);
 
  const changePage = (pageNumber) => {
    setCurrentPage(pageNumber);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
 
  const toggleSelection = (item, selected, setter) => {
    setter(selected.includes(item) ? selected.filter((value) => value !== item) : [...selected, item]);
    setCurrentPage(1);
  };
 
  const toggleFavorite = (event, id) => {
    event.stopPropagation();
    const updated = projects.map((p) => p.id === id ? { ...p, favorite: !p.favorite } : p);
    setProjects(updated);
    storage.set("favorites", updated.filter((p) => p.favorite).map((p) => p.id));
  };
 
  const toggleApplied = (event, id) => {
    event.preventDefault();
    event.stopPropagation();
    const updated = appliedIds.includes(id) ? appliedIds.filter((itemId) => itemId !== id) : [...appliedIds, id];
    setAppliedIds(updated);
    storage.set("appliedIds", updated);
  };
 
  const openProject = (project) => {
    setSelectedProject(project);
    const historyData = storage.get("history");
    if (!historyData.includes(project.id)) {
      const updated = [project.id, ...historyData].slice(0, 50);
      storage.set("history", updated);
      setHistoryIds(updated);
    }
    const reads = storage.get("readProjects");
    if (!reads.includes(project.id)) {
      const updated = [...reads, project.id];
      storage.set("readProjects", updated);
      setReadIds(updated);
    }
  };
 
  const handleSendEmail = (event, project) => {
    event.preventDefault();
    event.stopPropagation();
    const targetEmail = project.content?.match(/[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}/)?.[0] || "";
    const ccEmail = project.cc_address || "";
    window.location.href = ccEmail ? `mailto:${targetEmail}?cc=${encodeURIComponent(ccEmail)}` : `mailto:${targetEmail}`;
  };
 
  const handleExecuteDelete = async () => {
    if (!deleteTargetId) return;
    try {
      const res = await fetch(`/api/mails?id=${encodeURIComponent(deleteTargetId)}`, { method: "DELETE" });
      if (!res.ok) {
        alert("削除に失敗しました。サーバーエラーの可能性があります。");
        return;
      }
      setProjects((prev) => prev.filter((p) => p.projects_id !== deleteTargetId));
      setSelectedProject((prev) => prev?.projects_id === deleteTargetId ? null : prev);
    } catch (error) {
      console.error("削除リクエスト中にエラーが発生しました:", error);
    } finally {
      setDeleteTargetId(null);
    }
  };
 
  const filterablePrefectures = useMemo(() => {
    if (selectedRegion === "すべて") {
      return regionalPrefectures.flatMap((r) => r.prefs);
    }
    return regionalPrefectures.find((r) => r.region === selectedRegion)?.prefs || [];
  }, [selectedRegion]);
 
  const ProjectCard = ({ project }) => {
    const isRead = readIds.includes(project.id);
    const isApplied = appliedIds.includes(project.id);
    const attachments = useMemo(() => {
      if (!project.attachments) return [];
      if (Array.isArray(project.attachments)) return project.attachments;
      try {
        return JSON.parse(project.attachments);
      } catch {
        return [];
      }
    }, [project.attachments]);
 
    return (
<div style={{ ...styles.card, opacity: project.isClosed ? 0.7 : 1 }}>
<div style={{ fontSize: "0.7rem", color: "#a0aec0", marginBottom: 5 }}>ID: {project.id}</div>
<div style={{ position: "absolute", top: 15, right: 15, display: "flex", alignItems: "center", gap: 8 }}>
          {project.isClosed && <span style={{ ...styles.badge, backgroundColor: "#e53e3e" }}>募集停止</span>}
          {isApplied && viewMode !== "applied" && <span style={{ ...styles.badge, backgroundColor: "#48bb78" }}>応募済み</span>}
          {isRead && <span style={{ ...styles.badge, backgroundColor: "#e2e8f0", color: "#4a5568" }}>既読</span>}
<button
            onClick={(e) => toggleFavorite(e, project.id)}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.4rem", color: project.favorite ? "#ed8936" : "#cbd5e0", padding: 0 }}
>
            {project.favorite ? "★" : "☆"}
</button>
</div>
<h3 style={{ fontSize: "1rem", color: "#1a365d", marginBottom: 20, fontWeight: 700, paddingRight: 60, textDecoration: project.isClosed ? "line-through" : "none" }}>
          {project.title}
</h3>
<div style={{ fontSize: "0.85rem", flexGrow: 1 }}>
          {[
            ["場所", project.location || "記載なし"],
            ["単価", project.price || "記載なし"],
            ["期間", project.period || "記載なし"],
            ["募集期間", project.end_date || "記載なし"],
            ["募集人数", extractRecruitment(project.content)],
          ].map(([label, value]) => (
<div key={label} style={{ display: "flex", marginBottom: label === "募集人数" ? 0 : 8 }}>
<span style={{ fontWeight: "bold", minWidth: 80 }}>【{label}】</span>
<span>{value}</span>
</div>
          ))}
 
          {attachments.length > 0 && (
<div style={{ marginTop: 12, fontSize: "0.8rem", color: "#4a5568", fontWeight: "bold", backgroundColor: "#edf2f7", padding: "4px 8px", borderRadius: 4, display: "inline-block" }}>
              📎 添付ファイルあり ({attachments.length})
</div>
          )}
</div>
<div style={{ display: "flex", gap: 8, marginTop: 20, flexWrap: "wrap" }}>
<button onClick={() => openProject(project)} style={{ ...styles.primaryButton, flex: "1 1 calc(50% - 4px)" }}>詳細</button>
<button onClick={(e) => handleSendEmail(e, project)} disabled={project.isClosed} style={{ ...styles.secondaryButton, flex: "1 1 calc(50% - 4px)" }}>メール作成</button>
<button
            onClick={(e) => toggleApplied(e, project.id)}
            style={{ flex: "1 1 100%", padding: 8, borderRadius: 6, border: "1px solid #cbd5e0", background: isApplied ? "#e6fffa" : "#fff", color: isApplied ? "#38a169" : "#4a5568", cursor: "pointer", fontWeight: "bold" }}
>
            {isApplied ? "応募解除" : "応募済みにする"}
</button>
<button
            onClick={(e) => { e.stopPropagation(); setDeleteTargetId(project.projects_id); }}
            style={{ width: "100%", padding: 6, borderRadius: 6, border: "1px solid #fc8181", color: "#e53e3e", background: "#fff", cursor: "pointer", fontSize: "0.75rem" }}
>
            削除
</button>
</div>
</div>
    );
  };
 
  return (
<div style={styles.page}>
<style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
<nav style={styles.nav}>
<div style={{ ...styles.navInner, justifyContent: "space-between" }}>
<div style={{ display: "flex", height: "100%", alignItems: "center" }}>
<div style={{ marginRight: 30, height: 35, display: "flex", alignItems: "center" }}>
<img src="/Logo_Mark2.png" alt="GE CREATIVE" style={{ height: "100%", width: "auto", objectFit: "contain" }} />
</div>
<div style={{ display: "flex", height: "100%" }}>
              {tabs.map((tab) => {
                const isActive = viewMode === tab.id;
                return (
<button
                    key={tab.id}
                    onClick={() => { setViewMode(tab.id); setCurrentPage(1); }}
                    style={{ background: "none", border: "none", color: isActive ? "#00bfa5" : "#4a5568", cursor: "pointer", fontWeight: 600, padding: "0 25px", height: "100%", borderBottom: isActive ? "3px solid #00bfa5" : "3px solid transparent", boxSizing: "border-box" }}
>
                    {tab.label}
</button>
                );
              })}
</div>
</div>
          {viewMode === "all" && (
<div style={{ display: "flex", height: "100%", alignItems: "center" }}>
              {["すべて", "東日本", "中日本", "西日本"].map((regionName) => {
                const isRegActive = selectedRegion === regionName;
                return (
<button
                    key={regionName}
                    onClick={() => { setSelectedRegion(regionName); setSelectedPrefs([]); setCurrentPage(1); }}
                    style={{ background: "none", border: "none", color: isRegActive ? "#1a365d" : "#718096", cursor: "pointer", fontWeight: 700, padding: "0 15px", height: "100%", fontSize: "0.95rem", borderBottom: isRegActive ? "3px solid #1a365d" : "3px solid transparent", boxSizing: "border-box" }}
>
                    {regionName}
</button>
                );
              })}
</div>
          )}
</div>
</nav>
<div style={{ display: "flex", padding: "40px 20px", gap: 30, boxSizing: "border-box" }}>
<aside style={styles.sidebar}>
<h2 style={{ fontSize: "1rem", fontWeight: "bold", marginBottom: 15, color: "#1a365d", borderLeft: "4px solid #1a365d", paddingLeft: 10 }}>カテゴリー</h2>
<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {sideCategories.map((button) => {
              const isSelected = button.id === "all" ? !favFilters.length : favFilters.includes(button.id);
              return (
<button
                  key={button.id}
                  onClick={() => { setFavFilters(button.id === "all" ? [] : favFilters.includes(button.id) ? favFilters.filter((id) => id !== button.id) : [...favFilters, button.id]); setCurrentPage(1); }}
                  style={{ padding: "12px 15px", borderRadius: 8, textAlign: "left", border: "1px solid", borderColor: isSelected ? "#00bfa5" : "#cbd5e0", backgroundColor: isSelected ? "#00bfa5" : "#fff", color: isSelected ? "#fff" : "#4a5568", cursor: "pointer", fontSize: "0.95rem", fontWeight: "bold" }}
>
                  {button.label}
</button>
              );
            })}
</div>
</aside>
<main style={{ flexGrow: 1, maxWidth: 1600 }}>
          {viewMode === "all" && (
<div style={{ backgroundColor: "#fff", padding: 25, borderRadius: 10, border: "1px solid #e2e8f0", marginBottom: 30 }}>
<div style={{ position: "relative", marginBottom: 15 }}>
<input
                  type="text"
                  placeholder="キーワード・駅名で検索"
                  value={searchQuery}
                  onChange={(e) => { 
                    setSearchQuery(e.target.value); 
                    setCurrentPage(1); 
                    fetchStations(e.target.value); 
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSearchSubmit(searchQuery);
                    }
                  }}
                  style={{ width: "100%", padding: 14, border: "2px solid #cbd5e0", borderRadius: 8, fontSize: "1rem", boxSizing: "border-box" }}
                />
 
                {showSuggestions && history.length > 0 && (
                  /* 🟢 max-heightを履歴5件分相当の「220px」に固定し、あふれたらスクロール（overflowY: "auto"）にしました */
<div style={{ position: "absolute", top: "100%", left: 0, right: 0, backgroundColor: "#fff", border: "1px solid #cbd5e0", zIndex: 110, borderRadius: 8, boxShadow: "0 4px 6px rgba(0,0,0,0.1)", marginTop: 4, maxHeight: "220px", overflowY: "auto" }}>
<div style={{ padding: "8px 12px", fontSize: "0.75rem", fontWeight: "bold", color: "#a0aec0", borderBottom: "1px solid #edf2f7", position: "sticky", top: 0, backgroundColor: "#fff", zIndex: 1 }}>
                      過去の検索履歴
</div>
                    {history.map((name) => (
<div 
                        key={name} 
                        onMouseDown={() => { 
                          setSearchQuery(name); 
                          handleSearchSubmit(name); 
                          setCurrentPage(1); 
                        }} 
                        style={{ padding: 12, cursor: "pointer", borderBottom: "1px solid #f7fafc", fontSize: "0.9rem", color: "#4a5568", display: "flex", alignItems: "center", gap: 6 }}
>
                        🕒 {name}
</div>
                    ))}
</div>
                )}
 
              </div>
<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
<button onClick={() => setShowFilters((v) => !v)} style={{ background: "#f8fafc", border: "1px solid #cbd5e0", borderRadius: 6, padding: "8px 16px", cursor: "pointer", fontSize: "0.85rem", fontWeight: "bold" }}>
                  詳細絞り込み {showFilters ? "▲" : "▼"}
</button>
<div style={{ display: "flex", gap: 20, alignItems: "center" }}>
<label style={{ fontSize: "0.85rem", cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
<input type="checkbox" checked={hideClosed} onChange={(e) => { setHideClosed(e.target.checked); setCurrentPage(1); }} />
                    募集停止を非表示
</label>
<label style={{ fontSize: "0.85rem", cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
<input type="checkbox" checked={isRemoteOnly} onChange={(e) => { setIsRemoteOnly(e.target.checked); setCurrentPage(1); }} />
                    リモート案件
</label>
</div>
</div>
              {showFilters && (
<div style={{ marginTop: 20, borderTop: "1px solid #edf2f7", paddingTop: 20 }}>
<div style={{ marginBottom: 20 }}>
<div style={{ marginBottom: 10, fontSize: "0.8rem", fontWeight: "bold", color: "#4a5568" }}>
                      都道府県
</div>
<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {filterablePrefectures.map((pref) => (
<button
                          key={pref}
                          onClick={() => toggleSelection(pref, selectedPrefs, setSelectedPrefs)}
                          style={{
                            padding: "6px 12px",
                            borderRadius: 6,
                            border: "1px solid",
                            borderColor: selectedPrefs.includes(pref) ? "#00bfa5" : "#e2e8f0",
                            backgroundColor: selectedPrefs.includes(pref) ? "#00bfa5" : "#fff",
                            color: selectedPrefs.includes(pref) ? "#fff" : "#4a5568",
                            fontSize: "0.75rem",
                            cursor: "pointer",
                          }}
>
                          {pref}
</button>
                      ))}
</div>
</div>
                  {skillCategories.map((category) => (
<div key={category.label} style={{ marginBottom: 10 }}>
<div style={{ marginBottom: 10, fontSize: "0.8rem", fontWeight: "bold", color: "#4a5568" }}>{category.label}</div>
<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {category.skills.map((skill) => (
<button
                            key={skill}
                            onClick={() => toggleSelection(skill, selectedSkills, setSelectedSkills)}
                            style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid", borderColor: selectedSkills.includes(skill) ? "#3182ce" : "#e2e8f0", backgroundColor: selectedSkills.includes(skill) ? "#3182ce" : "#fff", color: selectedSkills.includes(skill) ? "#fff" : "#4a5568", fontSize: "0.75rem", cursor: "pointer" }}
>
                            {skill}
</button>
                        ))}
</div>
</div>
                  ))}
</div>
              )}
</div>
          )}
<div style={{ marginBottom: 15, fontSize: "0.9rem", color: "#4a5568", fontWeight: "bold" }}>
            該当案件数: {filteredProjects.length} 件
</div>
          {loading ? (
<div style={styles.spinner} />
          ) : currentItems.length === 0 ? (
<div style={{ textAlign: "center", padding: "40px", color: "#718096", backgroundColor: "#fff", borderRadius: 10, border: "1px solid #e2e8f0" }}>
              該当する案件が見つかりませんでした。
</div>
          ) : (
<>
<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 20, marginBottom: 40 }}>
                {currentItems.map((project) => (
<ProjectCard key={project.id} project={project} />
                ))}
</div>
  {/* 修正後：一気に飛べるボタンを追加 */}
{totalPages > 1 && (
<div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 20, flexWrap: "wrap" }}>
    {/* 最初のページへ一気に戻る */}
<button
      onClick={() => changePage(1)}
      disabled={currentPage === 1}
      style={{ ...styles.pageBtn, opacity: currentPage === 1 ? 0.5 : 1, cursor: currentPage === 1 ? "not-allowed" : "pointer" }}
      title="最初のページへ"
>
      最初のページ
</button>
 
    {/* 5ページ前に戻る */}
<button
      onClick={() => changePage(Math.max(currentPage - 5, 1))}
      disabled={currentPage === 1}
      style={{ ...styles.pageBtn, opacity: currentPage === 1 ? 0.5 : 1, cursor: currentPage === 1 ? "not-allowed" : "pointer" }}
      title="5ページ前へ"
>
      前のページ
</button>
 
    {/* 1ページ前に戻る */}
<button
      onClick={() => changePage(Math.max(currentPage - 1, 1))}
      disabled={currentPage === 1}
      style={{ ...styles.pageBtn, opacity: currentPage === 1 ? 0.5 : 1, cursor: currentPage === 1 ? "not-allowed" : "pointer" }}
      title="前へ"
>
      ‹
</button>
 
    {/* 通常のページ番号ボタン */}
    {paginationRange.map((page, idx) => (
<button
        key={idx}
        onClick={() => typeof page === "number" && changePage(page)}
        style={{ 
          ...styles.pageBtn, 
          backgroundColor: currentPage === page ? "#1a365d" : "#fff", 
          color: currentPage === page ? "#fff" : "#2d3748" 
        }}
>
        {page}
</button>
    ))}
 
    {/* 1ページ次に進む */}
<button
      onClick={() => changePage(Math.min(currentPage + 1, totalPages))}
      disabled={currentPage === totalPages}
      style={{ ...styles.pageBtn, opacity: currentPage === totalPages ? 0.5 : 1, cursor: currentPage === totalPages ? "not-allowed" : "pointer" }}
      title="次へ"
>
      ›
</button>
 
    {/* 5ページ次に進む */}
<button
      onClick={() => changePage(Math.min(currentPage + 5, totalPages))}
      disabled={currentPage === totalPages}
      style={{ ...styles.pageBtn, opacity: currentPage === totalPages ? 0.5 : 1, cursor: currentPage === totalPages ? "not-allowed" : "pointer" }}
      title="5ページ次へ"
>
      次のページ
</button>
 
    {/* 最後のページへ一気に飛ぶ */}
<button
      onClick={() => changePage(totalPages)}
      disabled={currentPage === totalPages}
      style={{ ...styles.pageBtn, opacity: currentPage === totalPages ? 0.5 : 1, cursor: currentPage === totalPages ? "not-allowed" : "pointer" }}
      title="最後のページへ"
>
     最終ページ
</button>
 
  </div>
)}
</>
          )}
</main>
</div>
      {selectedProject && (
<div style={styles.modalOverlay} onClick={() => setSelectedProject(null)}>
<div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
 
            <h2 style={{ fontSize: "1.3rem", color: "#1a365d", marginBottom: 20, paddingRight: 40 }}>{selectedProject.title}</h2>
<div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 25, fontSize: "0.95rem" }}>
<div><strong>【場所】</strong> {selectedProject.location || "記載なし"}</div>
<div><strong>【単価】</strong> {selectedProject.price || "記載なし"}</div>
<div><strong>【期間】</strong> {selectedProject.period || "記載なし"}</div>
<div><strong>【募集期間】</strong> {selectedProject.end_date || "記載なし"}</div>
<div><strong>【スキル】</strong> {selectedProject.skills || "記載なし"}</div>
              {(() => {
                const pAttachments = !selectedProject.attachments ? [] : 
                                     Array.isArray(selectedProject.attachments) ? selectedProject.attachments : 
                                     (() => { try { return JSON.parse(selectedProject.attachments); } catch { return []; } })();
                if (pAttachments.length === 0) return null;
                return (
<div style={{ marginTop: 5, padding: "10px 14px", backgroundColor: "#f7fafc", borderRadius: 8, border: "1px solid #edf2f7" }}>
<strong style={{ display: "block", marginBottom: 6, color: "#4a5568" }}>📎 添付ファイルダウンロード:</strong>
<div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                      {pAttachments.map((file, i) => {
                        const url = typeof file === "string" ? file : (file.file_url || file.url);
                        const name = typeof file === "string" ? `ファイル ${i + 1}` : (file.file_name || file.name);
                        return (
<a key={i} href={url} style={{ ...styles.attachmentLink, margin: 0 }} onClick={(e) => handleDownloadFile(e, url, name)}>
                             {name}
</a>
                        );
                      })}
</div>
</div>
                );
              })()}
</div>
<hr style={{ border: "none", borderTop: "1px solid #edf2f7", margin: "20px 0" }} />
<div style={{ whiteSpace: "pre-wrap", fontSize: "0.9rem", lineHeight: "1.6", color: "#4a5568" }}>
              {formatContent(selectedProject.content)}
</div>
</div>
</div>
      )}
      {deleteTargetId && (
<div style={styles.modalOverlay} onClick={() => setDeleteTargetId(null)}>
<div style={{ ...styles.modalContent, maxWidth: 400, textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
<h3 style={{ fontSize: "1.1rem", marginBottom: 20 }}>案件を削除しますか？</h3>
<p style={{ fontSize: "0.85rem", color: "#718096", marginBottom: 25 }}>この操作は取り消せません。</p>
<div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
<button onClick={() => setDeleteTargetId(null)} style={{ padding: "10px 20px", background: "#edf2f7", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: "bold" }}>
                キャンセル
</button>
<button onClick={handleExecuteDelete} style={{ padding: "10px 20px", background: "#e53e3e", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: "bold" }}>
                削除する
</button>
</div>
</div>
</div>
      )}
</div>
  );
}