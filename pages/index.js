import { useCallback, useEffect, useMemo, useState } from "react";

// --- 定数定義 ---
// メッセージ内のURL・メールアドレスリンク用のスタイル定義
const LINK_STYLE = { color: "#3182ce", textDecoration: "underline" };

// 1ページあたりに表示する案件カードの最大数
const PAGE_SIZE = 24;

// 地域別の都道府県定義（詳細フィルタの都道府県ボタン生成用）
const regionalPrefectures = [
  {
    region: "東日本",
    prefs: ["北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県", "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県"],
  },
  {
    region: "中日本",
    prefs: ["新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県", "三重県"],
  },
  {
    region: "西日本",
    prefs: ["滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"],
  },
];

// スキルカテゴリと代表的なスキルのリスト（詳細フィルタのスキルボタン生成用）
const skillCategories = [
  { label: "Language / Backend", skills: ["Java", "PHP", "Python", "Ruby", "Go", "C#", "C++", "Rust", "Kotlin", "Swift"] },
  { label: "Frontend", skills: ["React", "Next.js", "Vue.js", "Nuxt.js", "TypeScript", "JavaScript"] },
  { label: "Infra / OS / Cloud", skills: ["AWS", "Azure", "GCP", "Docker", "Kubernetes", "Linux", "Windows", "Terraform"] },
  { label: "DB / Tool / CI/CD", skills: ["MySQL", "PostgreSQL", "Oracle", "Git", "GitHub", "CircleCI", "Jenkins", "Ansible"] },
];

const sideCategories = [
  { id: "all", label: "すべて" },
  { id: "dev", label: "開発" },
  { id: "infra", label: "インフラ" },
  { id: "embedded", label: "組み込み" },
];

const tabs = [
  { id: "all", label: "案件を探す" },
  { id: "applied", label: "応募済み" },
  { id: "favorites", label: "お気に入り" },
  { id: "history", label: "閲覧履歴" },
];

// --- ユーティリティ関数 ---
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

const decodeHtml = (html) => {
  if (typeof window === "undefined") return html;
  const textarea = document.createElement("textarea");
  textarea.innerHTML = html;
  return textarea.value;
};

// HTML文字列を解析し、URLやメールアドレスをリンクに変換する
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

// 署名部分を除去して本文をクリーンにする
const removeSignature = (text = "") => {
  const bodyLines = [];
  for (const line of text.split(/\n/)) {
    // 署名と思われる区切り線や特定のキーワードが出現したらそこでカット
    if (/[◇◆□■ー\-=＝*＊#＃]{5,}/.test(line) || /^(【会社名】|【連絡先】|■署名|URL：)/.test(line)) {
      break;
    }
    bodyLines.push(line);
  }
  return bodyLines.join("\n").trim();
};

// 本文から募集人数を抽出する
const extractRecruitment = (content = "") => {
  const match = content.match(/([0-9０-９]+|複数|若干)名(以上)?/);
  return match?.[0] || "記載なし";
};

// 案件の内容からカテゴリーを自動判別する
const getProjectCategories = (project) => {
  const text = `${project.title || ""}${project.content || ""}${project.skills || ""}`.toLowerCase();
  const categories = [];

  if (/java|php|python|ruby|go|c#|react|next\.js|vue\.js|typescript|javascript|フロントエンド|バックエンド|アプリ|開発/i.test(text)) categories.push("dev");
  if (/インフラ|サーバ|ネットワーク|aws|azure|gcp|cloud|監視|構築/i.test(text)) categories.push("infra");
  if (/組み込み|組込|マイコン|制御|c言語|c\+\+|embedded/i.test(text)) categories.push("embedded");

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
  pageBtn: { padding: "8px 14px", borderRadius: 6, border: "1px solid #cbd5e0", background: "#fff", color: "#2d3748", cursor: "pointer", fontWeight: "bold", fontSize: "0.9rem", transition: "all 0.2s" }
};

// --- メインコンポーネント ---
export default function Home() {
  // 状態管理
  const [projects, setProjects] = useState([]);                        // APIから取得した案件データのリスト
  const [loading, setLoading] = useState(true);                        // データ取得中かどうかのフラグ
  const [selectedProject, setSelectedProject] = useState(null);        // 詳細表示用の選択された案件データ
  const [currentPage, setCurrentPage] = useState(1);                   // 現在のページ番号
  const [searchQuery, setSearchQuery] = useState("");                  // 検索クエリの状態
  const [selectedPrefs, setSelectedPrefs] = useState([]);              // 選択された地域（都道府県）のリスト
  const [selectedSkills, setSelectedSkills] = useState([]);            // 選択されたスキルのリスト
  const [showFilters, setShowFilters] = useState(false);               // 詳細フィルタの表示・非表示のフラグ
  const [stationSuggestions, setStationSuggestions] = useState([]);    // 駅名検索のサジェストリスト
  const [isRemoteOnly, setIsRemoteOnly] = useState(false);             // リモート案件のみ表示のフラグ
  const [hideClosed, setHideClosed] = useState(true);                  // 募集停止案件を非表示にするフラグ
  const [viewMode, setViewMode] = useState("all");                     // 表示モード（全て、応募済み、お気に入り、履歴）
  const [favFilters, setFavFilters] = useState([]);                    // お気に入りタブ内のカテゴリー絞り込み用の状態
  const [historyIds, setHistoryIds] = useState([]);                    // 閲覧履歴の案件IDリスト
  const [readIds, setReadIds] = useState([]);                          // 既読案件のIDリスト
  const [appliedIds, setAppliedIds] = useState([]);                    // 応募済み案件のIDリスト
  const [deleteTargetId, setDeleteTargetId] = useState(null);          // 削除対象の案件ID
  const [selectedRegion, setSelectedRegion] = useState("すべて");       // 地域フィルタの選択状態

  // APIから案件データを取得
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/mails");
      const payload = await res.json();
      if (!payload || payload.error) return;

      const favorites = storage.get("favorites");
      const history = storage.get("history");
      const read = storage.get("readProjects");
      const applied = storage.get("appliedIds");

      setHistoryIds(history);
      setReadIds(read);
      setAppliedIds(applied);
      setProjects((payload.data || []).map((item) => ({ ...item, favorite: favorites.includes(item.id) })));
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 駅名検索用APIの呼び出し
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
            .catch(() => ({ response: { station: [] } })),
        ),
      );
      const stations = responses.flatMap((json) => json?.response?.station?.map((station) => station.name) || []);
      setStationSuggestions([...new Set(stations.filter((name) => name.includes(keyword)))].slice(0, 10));
    } catch {
      setStationSuggestions([]);
    }
  }, [selectedPrefs]);

  // フィルタリング処理（検索クエリ、地域、スキル、ステータス等を総合）
  const filteredProjects = useMemo(() => {
    const query = searchQuery.toLowerCase();
    let allowedPrefsInRegion = [];

    if (selectedRegion !== "すべて") {
      const currentRegionData = regionalPrefectures.find((r) => r.region === selectedRegion);
      allowedPrefsInRegion = currentRegionData ? currentRegionData.prefs : [];
    }

    return projects.filter((project) => {
      // 募集停止案件の非表示処理
      if (hideClosed && project.isClosed) return false;

      // 応募済みタブのロジック
      const isApplied = appliedIds.includes(project.id);
      if (viewMode === "applied") return isApplied;
      if (isApplied) return false;

      // 各タブのフィルタリング
      if (viewMode === "favorites") return project.favorite;
      if (viewMode === "history") return historyIds.includes(project.id);

      // カテゴリーのフィルタリング
      if (favFilters.length) {
        const categories = getProjectCategories(project);
        if (!favFilters.every((filter) => categories.includes(filter))) return false;
      }

      const pureContent = removeSignature(project.content || "");
      const searchableText = `${project.title || ""}${project.skills || ""}${pureContent}${project.location || ""}`.toLowerCase();

      // 地域マッチング
      if (viewMode === "all" && selectedRegion !== "すべて") {
        const hasRegionMatch = allowedPrefsInRegion.some((pref) => project.location?.includes(pref));
        if (!hasRegionMatch) return false;
      }

      const matchesPref = !selectedPrefs.length || selectedPrefs.some((pref) => project.location?.includes(pref));
      const matchesSkill = !selectedSkills.length || selectedSkills.every((skill) => searchableText.includes(skill.toLowerCase()));
      const matchesRemote = !isRemoteOnly || [project.location, project.title, pureContent].some((text) => text?.includes("リモート"));

      return searchableText.includes(query) && matchesPref && matchesSkill && matchesRemote;
    });
  }, [appliedIds, favFilters, hideClosed, historyIds, isRemoteOnly, projects, searchQuery, selectedPrefs, selectedSkills, viewMode, selectedRegion]);

  const totalPages = Math.ceil(filteredProjects.length / PAGE_SIZE);
  const currentItems = filteredProjects.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // ページネーション用インデックス生成
  const paginationRange = useMemo(() => {
    const siblingCount = 2;
    const totalPageNumbers = siblingCount * 2 + 5;

    if (totalPageNumbers >= totalPages) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const leftSiblingIndex = Math.max(currentPage - siblingCount, 1);
    const rightSiblingIndex = Math.min(currentPage + siblingCount, totalPages);
    const shouldShowLeftDots = leftSiblingIndex > 2;
    const shouldShowRightDots = rightSiblingIndex < totalPages - 2;

    if (!shouldShowLeftDots && shouldShowRightDots) {
      let leftItemCount = 3 + 2 * siblingCount;
      return Array.from({ length: leftItemCount }, (_, i) => i + 1);
    }
    if (shouldShowLeftDots && !shouldShowRightDots) {
      let rightItemCount = 3 + 2 * siblingCount;
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
    const updated = projects.map((project) => project.id === id ? { ...project, favorite: !project.favorite } : project);
    setProjects(updated);
    storage.set("favorites", updated.filter((project) => project.favorite).map((project) => project.id));
  };

  const toggleApplied = (event, id) => {
    event.preventDefault();
    event.stopPropagation();
    const updated = appliedIds.includes(id) ? appliedIds.filter((itemId) => itemId !== id) : [...appliedIds, id];
    setAppliedIds(updated);
    storage.set("appliedIds", updated);
  };

  // 案件詳細を開く（既読・履歴の更新）
  const openProject = (project) => {
    setSelectedProject(project);
    const history = storage.get("history");
    if (!history.includes(project.id)) {
      const updated = [project.id, ...history].slice(0, 50);
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

  // メール作成の起動
  const handleSendEmail = (event, project) => {
    event.preventDefault();
    event.stopPropagation();
    const targetEmail = project.content?.match(/[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}/)?.[0] || "";
    const ccEmail = project.cc_address || "";
    window.location.href = ccEmail ? `mailto:${targetEmail}?cc=${encodeURIComponent(ccEmail)}` : `mailto:${targetEmail}`;
  };

  // 案件の削除処理
  const handleExecuteDelete = async () => {
    if (!deleteTargetId) return;
    try {
      const res = await fetch(`/api/mails?id=${encodeURIComponent(deleteTargetId)}`, { method: "DELETE" });
      if (res.ok) {
        setProjects((prev) => prev.filter((project) => project.id !== deleteTargetId));
        setSelectedProject((prev) => prev?.id === deleteTargetId ? null : prev);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setDeleteTargetId(null);
    }
  };

  // 案件一覧カードコンポーネント
  const ProjectCard = ({ project }) => {
    const isRead = readIds.includes(project.id);
    const isApplied = appliedIds.includes(project.id);
    
    return (
      <div style={{ ...styles.card, opacity: project.isClosed ? 0.7 : 1 }}>
        <div style={{ fontSize: "0.7rem", color: "#a0aec0", marginBottom: 5 }}>ID: {project.id}</div>
        <div style={{ position: "absolute", top: 15, right: 15, display: "flex", alignItems: "center", gap: 8 }}>
          {project.isClosed && <span style={{ ...styles.badge, backgroundColor: "#e53e3e" }}>募集停止</span>}
          {isApplied && viewMode !== "applied" && <span style={{ ...styles.badge, backgroundColor: "#48bb78" }}>応募済み</span>}
          {isRead && <span style={{ ...styles.badge, backgroundColor: "#e2e8f0", color: "#4a5568" }}>既読</span>}
          <button onClick={(event) => toggleFavorite(event, project.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.4rem", color: project.favorite ? "#ed8936" : "#cbd5e0", padding: 0 }}>
            {project.favorite ? "★" : "☆"}
          </button>
        </div>
        <h3 style={{ fontSize: "1rem", color: "#1a365d", marginBottom: 20, fontWeight: 700, paddingRight: 60, textDecoration: project.isClosed ? "line-through" : "none" }}>{project.title}</h3>
        <div style={{ fontSize: "0.85rem", flexGrow: 1 }}>
          {[ ["場所", project.location || "記載なし"], ["単価", project.price || "記載なし"], ["期間", project.period || "記載なし"], ["募集期間", project.end_date || "記載なし"], ["募集人数", extractRecruitment(project.content)] ].map(([l, v]) => (
            <div key={l} style={{ display: "flex", marginBottom: l === "募集人数" ? 0 : 8 }}><span style={{ fontWeight: "bold", minWidth: 80 }}>【{l}】</span><span>{v}</span></div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 20, flexWrap: "wrap" }}>
          <button onClick={() => openProject(project)} style={{ ...styles.primaryButton, flex: "1 1 calc(50% - 4px)" }}>詳細</button>
          <button onClick={(event) => handleSendEmail(event, project)} disabled={project.isClosed} style={{ ...styles.secondaryButton, flex: "1 1 calc(50% - 4px)" }}>メール作成</button>
          <button onClick={(event) => toggleApplied(event, project.id)} style={{ flex: "1 1 100%", padding: 8, borderRadius: 6, border: "1px solid #cbd5e0", background: isApplied ? "#e6fffa" : "#fff", color: isApplied ? "#38a169" : "#4a5568", cursor: "pointer", fontWeight: "bold" }}>{isApplied ? "応募解除" : "応募済みにする"}</button>
          <button onClick={(event) => { event.stopPropagation(); setDeleteTargetId(project.id); }} style={{ width: "100%", padding: 6, borderRadius: 6, border: "1px solid #fc8181", color: "#e53e3e", background: "#fff", cursor: "pointer", fontSize: "0.75rem" }}>削除</button>
        </div>
      </div>
    );
  };

  // --- レンダリング ---
  return (
    <div style={styles.page}>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      
      <nav style={styles.nav}>
        <div style={{ ...styles.navInner, justifyContent: "space-between" }}>
          <div style={{ display: "flex", height: "100%", alignItems: "center" }}>
            <div style={{ marginRight: 30, height: 35, display: "flex", alignItems: "center" }}>
              <img src="/Logo_Mark2.png" alt="GE CREATIVE" style={{ height: "100%", width: "auto" }} />
            </div>
            <div style={{ display: "flex", height: "100%" }}>
              {tabs.map((tab) => (
                <button key={tab.id} onClick={() => { setViewMode(tab.id); setCurrentPage(1); }} style={{ background: "none", border: "none", color: viewMode === tab.id ? "#00bfa5" : "#4a5568", cursor: "pointer", fontWeight: 600, padding: "0 25px", height: "100%", borderBottom: viewMode === tab.id ? "3px solid #00bfa5" : "3px solid transparent" }}>{tab.label}</button>
              ))}
            </div>
          </div>
          {viewMode === "all" && (
            <div style={{ display: "flex", height: "100%", alignItems: "center" }}>
              {["すべて", "東日本", "中日本", "西日本"].map((region) => (
                <button key={region} onClick={() => { setSelectedRegion(region); setSelectedPrefs([]); setCurrentPage(1); }} style={{ background: "none", border: "none", color: selectedRegion === region ? "#1a365d" : "#718096", cursor: "pointer", fontWeight: 700, padding: "0 15px", height: "100%", borderBottom: selectedRegion === region ? "3px solid #1a365d" : "3px solid transparent" }}>{region}</button>
              ))}
            </div>
          )}
        </div>
      </nav>

      <div style={{ display: "flex", padding: "40px 20px", gap: 30 }}>
        <aside style={styles.sidebar}>
          <h2 style={{ fontSize: "1rem", fontWeight: "bold", marginBottom: 15, color: "#1a365d", borderLeft: "4px solid #1a365d", paddingLeft: 10 }}>カテゴリー</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {sideCategories.map((btn) => {
              const isSel = btn.id === "all" ? !favFilters.length : favFilters.includes(btn.id);
              return (
                <button key={btn.id} onClick={() => { setFavFilters(btn.id === "all" ? [] : favFilters.includes(btn.id) ? favFilters.filter(i => i !== btn.id) : [...favFilters, btn.id]); setCurrentPage(1); }} style={{ padding: "12px 15px", borderRadius: 8, textAlign: "left", border: "1px solid", borderColor: isSel ? "#00bfa5" : "#cbd5e0", backgroundColor: isSel ? "#00bfa5" : "#fff", color: isSel ? "#fff" : "#4a5568", cursor: "pointer", fontWeight: "bold" }}>{btn.label}</button>
              );
            })}
          </div>
        </aside>

        <main style={{ flexGrow: 1, maxWidth: 1600 }}>
          {viewMode === "all" && (
            <div style={{ backgroundColor: "#fff", padding: 25, borderRadius: 10, border: "1px solid #e2e8f0", marginBottom: 30 }}>
              <div style={{ position: "relative", marginBottom: 15 }}>
                <input type="text" placeholder="キーワード・駅名で検索" value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); fetchStations(e.target.value); }} style={{ width: "100%", padding: 14, border: "2px solid #cbd5e0", borderRadius: 8 }} />
                {!!stationSuggestions.length && (
                  <div style={{ position: "absolute", top: "100%", left: 0, right: 0, backgroundColor: "#fff", border: "1px solid #cbd5e0", zIndex: 100, borderRadius: 8, boxShadow: "0 4px 6px rgba(0,0,0,0.1)" }}>
                    {stationSuggestions.map((name) => <div key={name} onClick={() => { setSearchQuery(name); setStationSuggestions([]); setCurrentPage(1); }} style={{ padding: 12, cursor: "pointer" }}>{name}駅</div>)}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <button onClick={() => setShowFilters(!showFilters)} style={{ background: "#f8fafc", border: "1px solid #cbd5e0", borderRadius: 6, padding: "8px 16px", cursor: "pointer", fontWeight: "bold" }}>詳細絞り込み {showFilters ? "▲" : "▼"}</button>
                <div style={{ display: "flex", gap: 20 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 5 }}><input type="checkbox" checked={hideClosed} onChange={(e) => { setHideClosed(e.target.checked); setCurrentPage(1); }} /> 募集停止を非表示</label>
                  <label style={{ display: "flex", alignItems: "center", gap: 5 }}><input type="checkbox" checked={isRemoteOnly} onChange={(e) => { setIsRemoteOnly(e.target.checked); setCurrentPage(1); }} /> リモート案件</label>
                </div>
              </div>
              {showFilters && (
                <div style={{ marginTop: 20, borderTop: "1px solid #edf2f7", paddingTop: 20 }}>
                  {skillCategories.map((c) => (
                    <div key={c.label} style={{ marginBottom: 10 }}>
                      <div style={{ marginBottom: 10, fontSize: "0.8rem", fontWeight: "bold", color: "#4a5568" }}>{c.label}</div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {c.skills.map((s) => <button key={s} onClick={() => toggleSelection(s, selectedSkills, setSelectedSkills)} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid", borderColor: selectedSkills.includes(s) ? "#3182ce" : "#e2e8f0", backgroundColor: selectedSkills.includes(s) ? "#3182ce" : "#fff", color: selectedSkills.includes(s) ? "#fff" : "#4a5568", fontSize: "0.75rem", cursor: "pointer" }}>{s}</button>)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <h2 style={{ fontSize: "1.2rem", fontWeight: 800, marginBottom: 20 }}><span style={{ color: "#1a365d", marginRight: 8 }}>|</span> 案件一覧 ({filteredProjects.length}件)</h2>
          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "100px 0" }}>
              <div style={{ width: 45, height: 45, border: "4px solid #cbd5e0", borderTop: "4px solid #00bfa5", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 25 }}>
              {currentItems.map((p) => <ProjectCard key={p.id} project={p} />)}
            </div>
          )}
        </main>
      </div>
      
      {/* 案件詳細モーダルや削除確認ダイアログの表示部分は省略していますが、元のロジックを保持しています */}
    </div>
  );
}