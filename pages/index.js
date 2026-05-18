import { useEffect, useState } from "react";

/**
 * HTML内のURLやメールアドレスを検出し、自動的にリンクタグ(<a>)へ変換する関数
 * @param {string} html - 対象となるHTML/テキスト文字列
 * @returns {Array|string} リンク化されたReact要素の配列、または元の文字列
 */
const formatContent = (html) => {
  if (typeof window === "undefined") return html;
  try {
    const txt = document.createElement("textarea");
    txt.innerHTML = html;
    const decoded = txt.value;
    const urlRegex = /(https?:\/\/[^\s]+|[\w.-]+@[\w.-]+\.[a-zA-Z]{2,4})/g;
    const parts = decoded.split(urlRegex);
    return parts.map((part, i) => {
      if (part?.match(/https?:\/\//)) {
        return (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#3182ce", textDecoration: "underline" }}
          >
            {part}
          </a>
        );
      } else if (part?.match(/[\w.-]+@[\w.-]+\.[a-zA-Z]{2,4}/)) {
        return (
          <a
            key={i}
            href={`mailto:${part}`}
            style={{ color: "#3182ce", textDecoration: "underline" }}
          >
            {part}
          </a>
        );
      }
      return part;
    });
  } catch (e) {
    return html;
  }
};

export default function Home() {
  // --- 状態管理 (State) ---
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPrefs, setSelectedPrefs] = useState([]);
  const [selectedSkills, setSelectedSkills] = useState([]);
  const [showFilters, setShowFilters] = useState(false);
  const [stationSuggestions, setStationSuggestions] = useState([]);
  const [isStationLoading, setIsStationLoading] = useState(false);
  const [isRemoteOnly, setIsRemoteOnly] = useState(false);
  const [viewMode, setViewMode] = useState("all");
  const [favFilters, setFavFilters] = useState([]);
  const [historyIds, setHistoryIds] = useState([]);
  const [readIds, setReadIds] = useState([]); 
  const [appliedIds, setAppliedIds] = useState([]); 
  const [deleteTargetId, setDeleteTargetId] = useState(null);

  // --- 定数定義 ---
  const projectsPerPage = 12;

  const prefectures = [
    "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
    "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
    "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県",
    "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県",
    "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県",
    "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県",
    "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
  ];

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

  // --- 副作用処理 (Effects) ---
  useEffect(() => {
    fetchData();
  }, []);

  // --- 業務ロジック関数 ---
  
  /**
   * APIから案件データを取得し、ローカルストレージの保存情報と同期する関数
   */
  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/mails");
      const payload = await res.json();
      if (payload && !payload.error) {
        const savedFavorites = JSON.parse(localStorage.getItem("favorites") || "[]");
        const savedHistory = JSON.parse(localStorage.getItem("history") || "[]");
        const savedRead = JSON.parse(localStorage.getItem("readProjects") || "[]"); 
        const savedApplied = JSON.parse(localStorage.getItem("appliedIds") || "[]"); 

        setHistoryIds(savedHistory);
        setReadIds(savedRead);
        setAppliedIds(savedApplied);

        const dataWithFavs = (payload.data || []).map((item) => ({
          ...item,
          favorite: savedFavorites.includes(item.id),
        }));
        setProjects(dataWithFavs);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setTimeout(() => setLoading(false), 500);
    }
  };

  /**
   * 指定されたIDの案件を削除する関数
   */
  const handleExecuteDelete = async () => {
    if (!deleteTargetId) return;
    try {
      const res = await fetch(`/api/mails?id=${deleteTargetId}`, { method: "DELETE" });
      if (res.ok) {
        setProjects(projects.filter((p) => p.id !== deleteTargetId));
        if (selectedProject?.id === deleteTargetId) setSelectedProject(null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDeleteTargetId(null);
    }
  };

  /**
   * 外部APIを用いてキーワードに対応する駅名の候補を取得する関数
   * @param {string} name - 入力された駅名キーワード
   */
  const fetchStations = async (name) => {
    if (!name || name.length < 1) {
      setStationSuggestions([]);
      return;
    }
    setIsStationLoading(true);
    try {
      let targetPrefs = selectedPrefs.length > 0 ? selectedPrefs : ["大阪府"];
      const requests = targetPrefs.slice(0, 5).map(pref =>
        fetch(`https://express.heartrails.com/api/json?method=getStations&prefecture=${encodeURIComponent(pref)}`)
          .then(res => res.json())
          .catch(() => ({ response: { station: [] } }))
      );
      const results = await Promise.all(requests);
      let allStations = [];
      results.forEach(json => {
        if (json?.response?.station) {
          allStations = [...allStations, ...json.response.station.map(s => s.name)];
        }
      });
      const suggestions = allStations.filter((stationName) => stationName.includes(name));
      setStationSuggestions([...new Set(suggestions)].slice(0, 10));
    } catch (err) {
      setStationSuggestions([]);
    } navigator: {
      setIsStationLoading(false);
    }
  };

  /**
   * お気に入り状態のON/OFFを切り替えてローカルストレージへ保存する関数
   */
  const toggleFavorite = (e, id) => {
    e.stopPropagation();
    const updated = projects.map((p) => (p.id === id ? { ...p, favorite: !p.favorite } : p));
    setProjects(updated);
    const favIds = updated.filter((p) => p.favorite).map((p) => p.id);
    localStorage.setItem("favorites", JSON.stringify(favIds));
  };

  /**
   * 応募済み状態のON/OFFを切り替えてローカルストレージへ保存する関数
   */
  const toggleApplied = (e, id) => {
    e.preventDefault();
    e.stopPropagation();
    let updated = appliedIds.includes(id) ? appliedIds.filter(itemId => itemId !== id) : [...appliedIds, id];
    setAppliedIds(updated);
    localStorage.setItem("appliedIds", JSON.stringify(updated));
  };

  /**
   * 案件本文からメールアドレスを抽出し、メーラーを起動する関数
   */
  const handleSendEmail = (e, project) => {
    e.preventDefault();
    e.stopPropagation();
    const emailMatch = project.content?.match(/[\w.-]+@[\w.-]+\.[a-zA-Z]{2,4}/);
    const targetEmail = emailMatch ? emailMatch[0] : "";
    window.location.href = `mailto:${targetEmail}`;
  };

  /**
   * 本文内から特定のパターンに一致する募集人数を抽出する関数
   */
  const extractRecruitment = (content) => {
    if (!content) return "記載なし";
    const regex = /([0-9０-９]+|複数|若干)名(以上)?/;
    const match = content.match(regex);
    return match ? match[0] : "記載なし";
  };

  /**
   * 定型文的な署名やフッターエリアを本文から除外する関数
   */
  const removeSignature = (text) => {
    if (!text) return "";
    const lines = text.split(/\n/);
    let bodyLines = [];
    for (let line of lines) {
      if (line.match(/[◇◆□■ー\-=＝*＊#＃]{5,}/) || line.match(/^(【会社名】|【連絡先】|■署名|URL：)/)) {
        break;
      }
      bodyLines.push(line);
    }
    return bodyLines.join("\n").trim();
  };

  /**
   * 案件テキストを解析し、自動的に分類カテゴリを判定する関数
   */
  const getProjectCategories = (p) => {
    const allText = ((p.title || "") + (p.content || "") + (p.skills || "")).toLowerCase();
    let cats = [];
    if (allText.match(/java|php|python|ruby|go|c#|react|next\.js|vue\.js|typescript|javascript|フロントエンド|バックエンド|アプリ|開発/i)) cats.push("dev");
    if (allText.match(/インフラ|サーバ|ネットワーク|aws|azure|gcp|cloud|監視|構築/i)) cats.push("infra");
    if (allText.match(/組み込み|組込|マイコン|制御|c言語|c\+\+|embedded/i)) cats.push("embedded");
    return cats.length > 0 ? cats : ["dev"];
  };

  // --- フィルタリング・要素抽出処理 ---
  const filtered = projects.filter((p) => {
    const isApplied = appliedIds.includes(p.id);
    if (viewMode !== "applied" && isApplied) return false;
    if (viewMode === "applied") return isApplied;
    if (viewMode === "favorites") return p.favorite;
    if (viewMode === "history") return historyIds.includes(p.id);

    if (favFilters.length > 0) {
      const pCats = getProjectCategories(p);
      if (!favFilters.every((f) => pCats.includes(f))) return false;
    }

    const pureContent = removeSignature(p.content || "");
    const contentText = ((p.title || "") + (p.skills || "") + pureContent + (p.location || "")).toLowerCase();
    
    const matchesSearch = contentText.includes(searchQuery.toLowerCase());
    const matchesPref = selectedPrefs.length === 0 ? true : selectedPrefs.some((pref) => p.location?.includes(pref));
    const matchesSkill = selectedSkills.length === 0 ? true : selectedSkills.every((skill) => contentText.includes(skill.toLowerCase()));
    const matchesRemote = isRemoteOnly ? (p.location?.includes("リモート") || p.title?.includes("リモート") || pureContent.includes("リモート")) : true;

    return matchesSearch && matchesPref && matchesSkill && matchesRemote;
  });

  const currentItems = filtered.slice((currentPage - 1) * projectsPerPage, currentPage * projectsPerPage);
  const totalPages = Math.ceil(filtered.length / projectsPerPage);

  // --- 選択・切り替えイベントハンドラー ---
  const toggleFavFilter = (id) => {
    if (id === "all") setFavFilters([]);
    else setFavFilters((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
    setCurrentPage(1);
  };

  const toggleSelection = (item, list, setter) => {
    if (list.includes(item)) setter(list.filter((i) => i !== item));
    else setter([...list, item]);
    setCurrentPage(1);
  };

  // --- サブコンポーネント (案件カード) ---
  const ProjectCard = ({ project }) => {
    const isRead = readIds.includes(project.id); 
    const isApplied = appliedIds.includes(project.id);
    
    const displayPeriod = project.period || "記載なし";
    const displayRecruitment = extractRecruitment(project.content);

    return (
      <div style={{ backgroundColor: "#fff", borderRadius: "10px", padding: "25px", border: "1px solid #edf2f7", display: "flex", flexDirection: "column", position: "relative" }}>
        <div style={{ fontSize: "0.7rem", color: "#a0aec0", marginBottom: "5px" }}>ID: {project.id}</div>
        <div style={{ position: "absolute", top: "15px", right: "15px", display: "flex", alignItems: "center", gap: "8px" }}>
          {isApplied && viewMode !== "applied" && <span style={{ fontSize: "0.7rem", backgroundColor: "#48bb78", color: "#fff", padding: "2px 6px", borderRadius: "4px", fontWeight: "bold" }}>応募済み</span>}
          {isRead && <span style={{ fontSize: "0.7rem", backgroundColor: "#e2e8f0", color: "#4a5568", padding: "2px 6px", borderRadius: "4px", fontWeight: "bold" }}>既読</span>}
          <button onClick={(e) => toggleFavorite(e, project.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.4rem", color: project.favorite ? "#ed8936" : "#cbd5e0", padding: 0, lineHeight: 1 }}>
            {project.favorite ? "★" : "☆"}
          </button>
        </div>
        
        {/* 案件タイトルエリア */}
        <h3 style={{ fontSize: "1rem", color: "#1a365d", marginBottom: "20px", fontWeight: "700", paddingRight: "60px" }}>{project.title}</h3>
        
        {/* 案件詳細情報エリア */}
        <div style={{ fontSize: "0.85rem", flexGrow: 1 }}>
          <div style={{ display: "flex", marginBottom: "8px" }}>
            <span style={{ fontWeight: "bold", minWidth: "80px" }}>【場所】</span>
            <span>{project.location || "記載なし"}</span>
          </div>
          <div style={{ display: "flex", marginBottom: "8px" }}>
            <span style={{ fontWeight: "bold", minWidth: "80px" }}>【単価】</span>
            <span>{project.price || "記載なし"}</span>
          </div>
          <div style={{ display: "flex", marginBottom: "8px" }}>
            <span style={{ fontWeight: "bold", minWidth: "80px" }}>【期間】</span>
            <span>{displayPeriod}</span>
          </div>
          <div style={{ display: "flex" }}>
            <span style={{ fontWeight: "bold", minWidth: "80px" }}>【募集人数】</span>
            <span>{displayRecruitment}</span>
          </div>
        </div>

        {/* 操作ボタンエリア */}
        <div style={{ display: "flex", gap: "8px", marginTop: "20px", flexWrap: "wrap" }}>
          <button onClick={() => { 
            setSelectedProject(project); 
            const history = JSON.parse(localStorage.getItem("history") || "[]");
            if (!history.includes(project.id)) {
              const newHistory = [project.id, ...history].slice(0, 50);
              localStorage.setItem("history", JSON.stringify(newHistory));
              setHistoryIds(newHistory);
            }
            const reads = JSON.parse(localStorage.getItem("readProjects") || "[]"); 
            if (!reads.includes(project.id)) { 
              const newR = [...reads, project.id]; 
              localStorage.setItem("readProjects", JSON.stringify(newR)); 
              setReadIds(newR); 
            } 
          }} style={{ flex: "1 1 calc(50% - 4px)", padding: "10px", backgroundColor: "#1a365d", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" }}>詳細</button>
          
          <button onClick={(e) => handleSendEmail(e, project)} style={{ flex: "1 1 calc(50% - 4px)", padding: "10px", backgroundColor: "#3182ce", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" }}>メール作成</button>
          <button onClick={(e) => toggleApplied(e, project.id)} style={{ flex: "1 1 100%", padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e0", background: isApplied ? "#e6fffa" : "#fff", color: isApplied ? "#38a169" : "#4a5568", cursor: "pointer", fontWeight: "bold" }}>{isApplied ? "応募解除" : "応募済みにする"}</button>
          <button onClick={(e) => { e.stopPropagation(); setDeleteTargetId(project.id); }} style={{ width: "100%", padding: "6px", borderRadius: "6px", border: "1px solid #fc8181", color: "#e53e3e", background: "#fff", cursor: "pointer", fontSize: "0.75rem" }}>削除</button>
        </div>
      </div>
    );
  };

  // --- メインレンダリング (JSX) ---
  return (
    <div style={{ backgroundColor: "#f7fafc", minHeight: "100vh", color: "#2d3748", fontFamily: "sans-serif" }}>
      {/* 共通グローバルナビゲーション */}
      <nav style={{ backgroundColor: "#00bfa5", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", height: "60px", padding: "0 20px", alignItems: "center" }}>
          <div style={{ marginRight: "30px", height: "35px", display: "flex", alignItems: "center" }}>
            <img 
              src="/Logo_Mark2.png" 
              alt="GE CREATIVE" 
              style={{ height: "100%", width: "auto", objectFit: "contain" }} 
            />
          </div>
          <div style={{ display: "flex", height: "100%" }}>
            {[{ id: "all", label: "案件を探す" }, { id: "applied", label: "応募済み" }, { id: "favorites", label: "お気に入り" }, { id: "history", label: "閲覧履歴" }].map((tab) => (
              <button key={tab.id} onClick={() => { setViewMode(tab.id); setCurrentPage(1); }} style={{ background: viewMode === tab.id ? "rgba(255,255,255,0.1)" : "none", border: "none", color: "#fff", cursor: "pointer", fontWeight: "600", padding: "0 25px", height: "100%" }}>{tab.label}</button>
            ))}
          </div>
        </div>
      </nav>

      {/* メインレイアウトコンテナ */}
      <div style={{ display: "flex", padding: "40px 20px", gap: "30px", boxSizing: "border-box" }}>
        {/* サイドバー（カテゴリ絞り込み） */}
        <aside style={{ width: "220px", flexShrink: 0 }}>
          <h2 style={{ fontSize: "1rem", fontWeight: "bold", marginBottom: "15px", color: "#1a365d", borderLeft: "4px solid #1a365d", paddingLeft: "10px" }}>カテゴリー</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {sideCategories.map((btn) => {
              const isSelected = btn.id === "all" ? favFilters.length === 0 : favFilters.includes(btn.id);
              return (
                <button 
                  key={btn.id} 
                  onClick={() => toggleFavFilter(btn.id)} 
                  style={{ 
                    padding: "12px 15px", 
                    borderRadius: "8px", 
                    textAlign: "left", 
                    border: "1px solid", 
                    borderColor: isSelected ? "#00bfa5" : "#cbd5e0", 
                    backgroundColor: isSelected ? "#00bfa5" : "#fff", 
                    color: isSelected ? "#fff" : "#4a5568", 
                    cursor: "pointer", 
                    fontSize: "0.95rem", 
                    fontWeight: "bold" 
                  }}
                >
                  {btn.label}
                </button>
              );
            })}
          </div>
        </aside>

        {/* メインコンテンツエリア */}
        <main style={{ flexGrow: 1, maxWidth: "1600px" }}>
          {/* 検索パネル（「案件を探す」モード時のみ表示） */}
          {viewMode === "all" && (
            <div style={{ backgroundColor: "#fff", padding: "25px", borderRadius: "10px", border: "1px solid #e2e8f0", marginBottom: "30px" }}>
              <div style={{ position: "relative", marginBottom: "15px" }}>
                <input type="text" placeholder="キーワード・駅名で検索" value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); fetchStations(e.target.value); }} style={{ width: "100%", padding: "14px", border: "2px solid #cbd5e0", borderRadius: "8px", fontSize: "1rem", boxSizing: "border-box" }} />
                {stationSuggestions.length > 0 && (
                  <div style={{ position: "absolute", top: "100%", left: 0, right: 0, backgroundColor: "#fff", border: "1px solid #cbd5e0", zIndex: 100, borderRadius: "8px", boxShadow: "0 4px 6px rgba(0,0,0,0.1)" }}>
                    {stationSuggestions.map((name) => (
                      <div key={name} onClick={() => { setSearchQuery(name); setStationSuggestions([]); }} style={{ padding: "12px", cursor: "pointer", borderBottom: "1px solid #f7fafc" }}>{name}駅</div>
                    ))}
                  </div>
                )}
              </div>
              
              {/* 各種トグル・フィルターボタン */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <button onClick={() => setShowFilters(!showFilters)} style={{ background: "#f8fafc", border: "1px solid #cbd5e0", borderRadius: "6px", padding: "8px 16px", cursor: "pointer", fontSize: "0.85rem", fontWeight: "bold" }}>詳細絞り込み {showFilters ? "▲" : "▼"}</button>
                <label style={{ fontSize: "0.85rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px" }}><input type="checkbox" checked={isRemoteOnly} onChange={(e) => setIsRemoteOnly(e.target.checked)} /> リモートのみ</label>
              </div>

              {/* アコーディオン展開式詳細フィルター */}
              {showFilters && (
                <div style={{ marginTop: "20px", borderTop: "1px solid #edf2f7", paddingTop: "20px" }}>
                  {skillCategories.map((cat) => (
                    <div key={cat.label} style={{ marginBottom: "10px" }}>
                      <div style={{ marginBottom: "10px", fontSize: "0.8rem", fontWeight: "bold", color: "#4a5568" }}>{cat.label}</div>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        {cat.skills.map(skill => (
                          <button key={skill} onClick={() => toggleSelection(skill, selectedSkills, setSelectedSkills)} style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid", borderColor: selectedSkills.includes(skill) ? "#3182ce" : "#e2e8f0", backgroundColor: selectedSkills.includes(skill) ? "#3182ce" : "#fff", color: selectedSkills.includes(skill) ? "#fff" : "#4a5568", fontSize: "0.75rem", cursor: "pointer" }}>{skill}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                  <div style={{ height: "1px", backgroundColor: "#edf2f7", margin: "20px 0" }} />
                  <div style={{ marginBottom: "10px", fontSize: "0.8rem", fontWeight: "bold", color: "#4a5568" }}>都道府県</div>
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    {prefectures.map(p => (
                      <button key={p} onClick={() => toggleSelection(p, selectedPrefs, setSelectedPrefs)} style={{ padding: "4px 10px", borderRadius: "4px", border: "1px solid", borderColor: selectedPrefs.includes(p) ? "#3182ce" : "#e2e8f0", backgroundColor: selectedPrefs.includes(p) ? "#3182ce" : "#fff", color: selectedPrefs.includes(p) ? "#fff" : "#4a5568", fontSize: "0.75rem", cursor: "pointer" }}>{p}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* セクションタイトルエリア */}
          <h2 style={{ fontSize: "1.2rem", fontWeight: "800", marginBottom: "20px" }}>
            <span style={{ color: "#1a365d", marginRight: "8px" }}>|</span>
            {viewMode === "all" ? "案件一覧" : viewMode === "applied" ? "応募済み案件" : viewMode === "favorites" ? "お気に入り案件" : "閲覧履歴"} ({filtered.length}件)
          </h2>
          
          {/* リスト表示メイン制御 */}
          {loading ? <div style={{ textAlign: "center", padding: "100px 0" }}>読み込み中...</div> : (
            <>
              {filtered.length === 0 ? <div style={{ textAlign: "center", padding: "50px", color: "#718096" }}>該当する案件がありません。</div> : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "25px" }}>
                  {currentItems.map((p) => <ProjectCard key={p.id} project={p} />)}
                </div>
              )}
              
              {/* ページネーション */}
              {totalPages > 1 && (
                <div style={{ display: "flex", justifyContent: "center", gap: "10px", marginTop: "40px", marginBottom: "40px" }}>
                  {[...Array(totalPages)].map((_, i) => (
                    <button key={i} onClick={() => { setCurrentPage(i + 1); window.scrollTo(0, 0); }} style={{ padding: "8px 16px", borderRadius: "6px", border: "1px solid #cbd5e0", backgroundColor: currentPage === i + 1 ? "#1a365d" : "#fff", color: currentPage === i + 1 ? "#fff" : "#2d3748", cursor: "pointer" }}>{i + 1}</button>
                  ))}
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* 案件詳細モーダルポップアップ */}
      {selectedProject && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 }} onClick={() => setSelectedProject(null)}>
          <div style={{ backgroundColor: "#fff", width: "95%", maxWidth: "800px", borderRadius: "12px", padding: "40px", maxHeight: "80vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ color: "#1a365d", marginBottom: "20px", borderBottom: "2px solid #e6fffa", paddingBottom: "10px" }}>{selectedProject.title}</h2>
            
            <div style={{ fontSize: "0.95rem", marginBottom: "30px", borderBottom: "1px solid #edf2f7", paddingBottom: "20px" }}>
              <div style={{ display: "flex", marginBottom: "10px" }}>
                <span style={{ fontWeight: "bold", minWidth: "100px" }}>【場所】</span>
                <span>{selectedProject.location || "記載なし"}</span>
              </div>
              <div style={{ display: "flex", marginBottom: "10px" }}>
                <span style={{ fontWeight: "bold", minWidth: "100px" }}>【単価】</span>
                <span>{selectedProject.price || "記載なし"}</span>
              </div>
              <div style={{ display: "flex", marginBottom: "10px" }}>
                <span style={{ fontWeight: "bold", minWidth: "100px" }}>【期間】</span>
                <span>{selectedProject.period || "記載なし"}</span>
              </div>
              <div style={{ display: "flex" }}>
                <span style={{ fontWeight: "bold", minWidth: "100px" }}>【募集人数】</span>
                <span>{extractRecruitment(selectedProject.content)}</span>
              </div>
            </div>

            <div style={{ whiteSpace: "pre-wrap", lineHeight: "1.7", fontSize: "0.95rem" }}>
              {formatContent(removeSignature(selectedProject.content))}
            </div>
            
            <button onClick={() => setSelectedProject(null)} style={{ marginTop: "30px", padding: "8px 24px", backgroundColor: "#edf2f7", color: "#2d3748", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "800" }}>閉じる</button>
          </div>
        </div>
      )}

      {/* 削除確認ダイアログ */}
      {deleteTargetId && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1100 }} onClick={() => setDeleteTargetId(null)}>
          <div style={{ backgroundColor: "#fff", padding: "30px", borderRadius: "12px", textAlign: "center" }} onClick={e => e.stopPropagation()}>
            <p style={{ marginBottom: "20px", fontWeight: "bold" }}>この案件を削除してもよろしいですか？</p>
            <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
              <button onClick={() => setDeleteTargetId(null)} style={{ padding: "10px 20px", borderRadius: "6px", border: "1px solid #cbd5e0", background: "#fff", cursor: "pointer" }}>キャンセル</button>
              <button onClick={handleExecuteDelete} style={{ padding: "10px 20px", borderRadius: "6px", border: "none", background: "#e53e3e", color: "#fff", cursor: "pointer" }}>削除する</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}