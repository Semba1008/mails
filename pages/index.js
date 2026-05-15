import { useEffect, useState } from "react";

// HTML内のURLやメールアドレスをリンク化する関数
const formatContent = (html) => {
  if (typeof window === "undefined") return html;
  try {
    const txt = document.createElement("textarea");
    txt.innerHTML = html;
    const decoded = txt.value;
    // URLとメールアドレスを抽出する正規表現
    const urlRegex = /(https?:\/\/[^\s]+|[\w.-]+@[\w.-]+\.[a-zA-Z]{2,4})/g;
    const parts = decoded.split(urlRegex);

    return parts.map((part, i) => {
      if (part?.match(/https?:\/\//)) {
        return (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" style={{ color: "#3182ce", textDecoration: "underline" }}>{part}</a>
        );
      } else if (part?.match(/[\w.-]+@[\w.-]+\.[a-zA-Z]{2,4}/)) {
        return (
          <a key={i} href={`mailto:${part}`} style={{ color: "#3182ce", textDecoration: "underline" }}>{part}</a>
        );
      }
      return part;
    });
  } catch (e) { return html; }
};

export default function Home() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPrefs, setSelectedPrefs] = useState([]);
  const [selectedSkills, setSelectedSkills] = useState([]);
  const [showFilters, setShowFilters] = useState(false);
  const [isRemoteOnly, setIsRemoteOnly] = useState(false);
  const [viewMode, setViewMode] = useState("all");
  const [favFilters, setFavFilters] = useState([]);
  const [historyIds, setHistoryIds] = useState([]);
  const [appliedIds, setAppliedIds] = useState([]);
  const [deleteTargetId, setDeleteTargetId] = useState(null);
  const [stationSuggestions, setStationSuggestions] = useState([]); // 駅名サジェスト追加

  const projectsPerPage = 12;

  const prefectures = ["北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県", "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県", "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"];

  const skillCategories = [
    { label: "Language / Backend", skills: ["Java", "PHP", "Python", "Ruby", "Go", "C#", "C++", "Rust", "Kotlin", "Swift"] },
    { label: "Frontend", skills: ["React", "Next.js", "Vue.js", "Nuxt.js", "TypeScript", "JavaScript"] },
    { label: "Infra / OS / Cloud", skills: ["AWS", "Azure", "GCP", "Docker", "Kubernetes", "Linux", "Windows", "Terraform"] },
    { label: "DB / Tool / CI/CD", skills: ["MySQL", "PostgreSQL", "Oracle", "Git", "GitHub", "CircleCI", "Jenkins", "Ansible"] },
  ];

  const sideCategories = [{ id: "all", label: "すべて" }, { id: "dev", label: "開発" }, { id: "infra", label: "インフラ" }, { id: "embedded", label: "組み込み" }];

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/mails");
      const payload = await res.json();
      if (payload && !payload.error) {
        const savedFavorites = JSON.parse(localStorage.getItem("favorites") || "[]");
        const savedApplied = JSON.parse(localStorage.getItem("appliedIds") || "[]");
        const savedHistory = JSON.parse(localStorage.getItem("history") || "[]");
        setAppliedIds(savedApplied);
        setHistoryIds(savedHistory);
        const dataWithFavs = (payload.data || []).map((item) => ({
          ...item,
          favorite: savedFavorites.includes(item.id),
        }));
        setProjects(dataWithFavs);
      }
    } catch (err) { console.error(err); } finally { setTimeout(() => setLoading(false), 500); }
  };

  // 駅名サジェスト取得
  const fetchStations = async (name) => {
    if (!name || name.length < 1) { setStationSuggestions([]); return; }
    try {
      const res = await fetch(`https://express.heartrails.com/api/json?method=getStations&name=${encodeURIComponent(name)}`);
      const json = await res.json();
      if (json?.response?.station) {
        setStationSuggestions([...new Set(json.response.station.map((s) => s.name))].slice(0, 10));
      } else { setStationSuggestions([]); }
    } catch (err) { setStationSuggestions([]); }
  };

  const toggleApplied = (e, id) => {
    e.preventDefault();
    e.stopPropagation();
    let updated;
    if (appliedIds.includes(id)) {
      updated = appliedIds.filter(itemId => itemId !== id);
    } else {
      updated = [...appliedIds, id];
    }
    setAppliedIds(updated);
    localStorage.setItem("appliedIds", JSON.stringify(updated));
  };

  const handleSendEmail = (e, project) => {
    e.preventDefault();
    e.stopPropagation();
    const emailMatch = project.content?.match(/[\w.-]+@[\w.-]+\.[a-zA-Z]{2,4}/);
    const targetEmail = emailMatch ? emailMatch[0] : "";
    window.location.href = `mailto:${targetEmail}`;
  };

  const handleExecuteDelete = async () => {
    if (!deleteTargetId) return;
    try {
      const res = await fetch(`/api/mails?id=${deleteTargetId}`, { method: "DELETE" });
      if (res.ok) {
        setProjects(projects.filter((p) => p.id !== deleteTargetId));
        if (selectedProject?.id === deleteTargetId) setSelectedProject(null);
      }
    } catch (err) { console.error(err); } finally { setDeleteTargetId(null); }
  };

  const toggleFavorite = (e, id) => {
    e.stopPropagation();
    const updated = projects.map((p) => (p.id === id ? { ...p, favorite: !p.favorite } : p));
    setProjects(updated);
    localStorage.setItem("favorites", JSON.stringify(updated.filter(p => p.favorite).map(p => p.id)));
  };

  // カテゴリー自動判別ロジックの復元
  const getProjectCategories = (p) => {
    const text = ((p.title || "") + (p.content || "") + (p.skills || "")).toLowerCase();
    let cats = [];
    if (text.match(/java|php|python|ruby|go|c#|react|next\.js|vue\.js|typescript|javascript|開発|アプリ/i)) cats.push("dev");
    if (text.match(/インフラ|サーバ|ネットワーク|aws|azure|gcp|cloud|構築/i)) cats.push("infra");
    if (text.match(/組み込み|組込|マイコン|制御|c言語|c\+\+|embedded/i)) cats.push("embedded");
    return cats.length ? cats : ["dev"];
  };

  const filtered = projects.filter((p) => {
    const isApplied = appliedIds.includes(p.id);

    // 応募済みタブ以外では、応募済み案件を非表示にする
    if (viewMode !== "applied" && isApplied) return false;
    if (viewMode === "applied") return isApplied;
    if (viewMode === "favorites") return p.favorite;
    if (viewMode === "history") return historyIds.includes(p.id);

    if (favFilters.length > 0) {
      const pCats = getProjectCategories(p);
      if (!favFilters.every((f) => pCats.includes(f))) return false;
    }

    const text = ((p.title || "") + (p.skills || "") + (p.content || "") + (p.location || "")).toLowerCase();
    const matchesSearch = text.includes(searchQuery.toLowerCase());
    const matchesPref = selectedPrefs.length === 0 || selectedPrefs.some(pref => p.location?.includes(pref));
    const matchesSkill = selectedSkills.length === 0 || selectedSkills.every(s => text.includes(s.toLowerCase()));
    const matchesRemote = !isRemoteOnly || (p.location?.includes("リモート") || p.title?.includes("リモート"));

    return matchesSearch && matchesPref && matchesSkill && matchesRemote;
  });

  const currentItems = filtered.slice((currentPage - 1) * projectsPerPage, currentPage * projectsPerPage);
  const totalPages = Math.ceil(filtered.length / projectsPerPage);

  return (
    <div style={{ backgroundColor: "#f7fafc", minHeight: "100vh", color: "#2d3748", fontFamily: "sans-serif" }}>
      <nav style={{ backgroundColor: "#1a365d", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", height: "60px", padding: "0 20px" }}>
          {[{ id: "all", label: "案件を探す" }, { id: "applied", label: "応募済み" }, { id: "favorites", label: "お気に入り" }, { id: "history", label: "閲覧履歴" }].map((tab) => (
            <button key={tab.id} onClick={() => { setViewMode(tab.id); setCurrentPage(1); }} style={{ background: viewMode === tab.id ? "rgba(255,255,255,0.1)" : "none", border: "none", color: "#fff", cursor: "pointer", fontWeight: "600", padding: "0 25px" }}>{tab.label}</button>
          ))}
        </div>
      </nav>

      <div style={{ display: "flex", padding: "40px 20px", gap: "30px" }}>
        <aside style={{ width: "220px", flexShrink: 0 }}>
          <h2 style={{ fontSize: "1rem", fontWeight: "bold", marginBottom: "15px", color: "#1a365d", borderLeft: "4px solid #1a365d", paddingLeft: "10px" }}>カテゴリー</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {sideCategories.map((btn) => (
              <button key={btn.id} onClick={() => { if (btn.id === "all") setFavFilters([]); else setFavFilters(prev => prev.includes(btn.id) ? prev.filter(i => i !== btn.id) : [...prev, btn.id]); setCurrentPage(1); }}
                style={{ padding: "12px 15px", borderRadius: "8px", textAlign: "left", border: "1px solid", borderColor: (btn.id === "all" ? favFilters.length === 0 : favFilters.includes(btn.id)) ? "#1a365d" : "#cbd5e0", backgroundColor: (btn.id === "all" ? favFilters.length === 0 : favFilters.includes(btn.id)) ? "#1a365d" : "#fff", color: (btn.id === "all" ? favFilters.length === 0 : favFilters.includes(btn.id)) ? "#fff" : "#4a5568", cursor: "pointer", fontWeight: "bold" }}
              >{btn.label}</button>
            ))}
          </div>
        </aside>

        <main style={{ flexGrow: 1, maxWidth: "1600px" }}>
          {viewMode === "all" && (
            <div style={{ backgroundColor: "#fff", padding: "25px", borderRadius: "10px", border: "1px solid #e2e8f0", marginBottom: "30px" }}>
              <div style={{ position: "relative" }}>
                <input type="text" placeholder="キーワード・駅名で検索" value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); fetchStations(e.target.value); }} style={{ width: "100%", padding: "14px", border: "2px solid #cbd5e0", borderRadius: "8px", marginBottom: "15px" }} />
                {stationSuggestions.length > 0 && (
                  <div style={{ position: "absolute", top: "55px", left: 0, right: 0, backgroundColor: "#fff", border: "1px solid #cbd5e0", zIndex: 100, borderRadius: "8px" }}>
                    {stationSuggestions.map((name) => (
                      <div key={name} onClick={() => { setSearchQuery(name); setStationSuggestions([]); }} style={{ padding: "12px", cursor: "pointer", borderBottom: "1px solid #f7fafc" }}>{name}駅</div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <button onClick={() => setShowFilters(!showFilters)} style={{ background: "#f8fafc", border: "1px solid #cbd5e0", borderRadius: "6px", padding: "8px 16px", cursor: "pointer" }}>詳細絞り込み {showFilters ? "▲" : "▼"}</button>
                <label style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: "5px" }}><input type="checkbox" checked={isRemoteOnly} onChange={(e) => setIsRemoteOnly(e.target.checked)} /> リモートのみ</label>
              </div>
              {showFilters && (
                <div style={{ marginTop: "20px", borderTop: "1px solid #edf2f7", paddingTop: "20px" }}>
                  {skillCategories.map(cat => (
                    <div key={cat.label} style={{ marginBottom: "10px" }}>
                      <div style={{ fontSize: "0.8rem", fontWeight: "bold", marginBottom: "5px" }}>{cat.label}</div>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        {cat.skills.map(s => <button key={s} onClick={() => { if (selectedSkills.includes(s)) setSelectedSkills(selectedSkills.filter(i => i !== s)); else setSelectedSkills([...selectedSkills, s]); setCurrentPage(1); }} style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid", borderColor: selectedSkills.includes(s) ? "#3182ce" : "#e2e8f0", backgroundColor: selectedSkills.includes(s) ? "#3182ce" : "#fff", color: selectedSkills.includes(s) ? "#fff" : "#4a5568", fontSize: "0.75rem", cursor: "pointer" }}>{s}</button>)}
                      </div>
                    </div>
                  ))}
                  <div style={{ marginBottom: "10px", fontSize: "0.8rem", fontWeight: "bold", color: "#4a5568", marginTop: "20px" }}>都道府県</div>
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    {prefectures.map(p => (
                      <button key={p} onClick={() => { if (selectedPrefs.includes(p)) setSelectedPrefs(selectedPrefs.filter(i => i !== p)); else setSelectedPrefs([...selectedPrefs, p]); setCurrentPage(1); }}
                        style={{ padding: "4px 10px", borderRadius: "4px", border: "1px solid", borderColor: selectedPrefs.includes(p) ? "#3182ce" : "#e2e8f0", backgroundColor: selectedPrefs.includes(p) ? "#3182ce" : "#fff", color: selectedPrefs.includes(p) ? "#fff" : "#4a5568", fontSize: "0.75rem", cursor: "pointer" }}
                      >{p}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <h2 style={{ fontSize: "1.2rem", fontWeight: "800", marginBottom: "20px" }}>{viewMode === "all" ? "案件一覧" : viewMode === "applied" ? "応募済み" : viewMode === "favorites" ? "お気に入り" : "閲覧履歴"} ({filtered.length}件)</h2>

          {loading ? <div style={{ textAlign: "center", padding: "100px 0" }}>読み込み中...</div> : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "25px" }}>
              {currentItems.map(p => {
                const isApplied = appliedIds.includes(p.id);
                return (
                  <div key={p.id} style={{ backgroundColor: "#fff", borderRadius: "10px", padding: "25px", border: "1px solid #edf2f7", display: "flex", flexDirection: "column", position: "relative" }}>
                    {/* 修正：応募済みタグの表示ロジック復元 */}
                    {isApplied && viewMode !== "applied" && (
                      <span style={{ position: "absolute", top: "15px", left: "15px", backgroundColor: "#48bb78", color: "#fff", fontSize: "0.7rem", padding: "2px 8px", borderRadius: "4px", fontWeight: "bold" }}>応募済み</span>
                    )}
                    <button onClick={(e) => toggleFavorite(e, p.id)} style={{ position: "absolute", top: "15px", right: "15px", background: "none", border: "none", cursor: "pointer", fontSize: "1.4rem", color: p.favorite ? "#ed8936" : "#cbd5e0" }}>{p.favorite ? "★" : "☆"}</button>
                    <h3 style={{ fontSize: "1rem", color: "#1a365d", marginBottom: "20px", fontWeight: "700", paddingRight: "30px", marginTop: (isApplied && viewMode !== "applied") ? "15px" : "0" }}>{p.title || "案件名不明"}</h3>
                    <div style={{ fontSize: "0.85rem", flexGrow: 1 }}>
                      <p>【場所】{p.location || "不明"}</p>
                      <p>【単価】{p.price || "不明"}</p>
                    </div>
                    <div style={{ display: "flex", gap: "8px", marginTop: "20px", flexWrap: "wrap" }}>
                      <button onClick={() => {
                        setSelectedProject(p);
                        // 閲覧履歴保存ロジック
                        if (!historyIds.includes(p.id)) {
                          const newH = [p.id, ...historyIds].slice(0, 50);
                          setHistoryIds(newH);
                          localStorage.setItem("history", JSON.stringify(newH));
                        }
                      }} style={{ flex: "1 1 calc(50% - 4px)", padding: "10px", backgroundColor: "#1a365d", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" }}>詳細</button>
                      <button onClick={(e) => handleSendEmail(e, p)} style={{ flex: "1 1 calc(50% - 4px)", padding: "10px", backgroundColor: "#3182ce", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" }}>メール作成</button>
                      <button onClick={(e) => toggleApplied(e, p.id)} style={{ flex: "1 1 100%", padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e0", background: isApplied ? "#e6fffa" : "#fff", color: isApplied ? "#38a169" : "#4a5568", cursor: "pointer", fontWeight: "bold" }}>
                        {isApplied ? "応募解除" : "応募済みにする"}
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); setDeleteTargetId(p.id); }} style={{ width: "100%", padding: "6px", borderRadius: "6px", border: "1px solid #fc8181", color: "#e53e3e", background: "#fff", cursor: "pointer", fontSize: "0.75rem" }}>削除</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", gap: "10px", marginTop: "40px", marginBottom: "40px" }}>
              {[...Array(totalPages)].map((_, i) => (
                <button key={i} onClick={() => { setCurrentPage(i + 1); window.scrollTo(0, 0); }} style={{ padding: "8px 16px", borderRadius: "6px", border: "1px solid #cbd5e0", backgroundColor: currentPage === i + 1 ? "#1a365d" : "#fff", color: currentPage === i + 1 ? "#fff" : "#2d3748", cursor: "pointer" }}>{i + 1}</button>
              ))}
            </div>
          )}
        </main>
      </div>

      {selectedProject && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 }} onClick={() => setSelectedProject(null)}>
          <div style={{ backgroundColor: "#fff", width: "95%", maxWidth: "800px", borderRadius: "12px", padding: "40px", maxHeight: "80vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ color: "#1a365d", marginBottom: "20px" }}>{selectedProject.title}</h2>
            <div style={{ whiteSpace: "pre-wrap", lineHeight: "1.7" }}>{formatContent(selectedProject.content)}</div>
          </div>
        </div>
      )}

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