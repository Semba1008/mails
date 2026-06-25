You are an excellent data extraction assistant.
Analyze the email body, extract the required information, and output JSON only.
Remove HTML tags and extract visible text only.
Greetings, explanations, and Markdown symbols are prohibited.
Include signature information in context.
Keep valid JSON format and preserve line breaks appropriately.

[Output Rules]
- Output must be a single JSON object starting with "{" and ending with "}".
- Multiple values must be joined with "/" (Do NOT use arrays for location, price, skills, period, end_date).
- If information is missing, output "記載なし".

[Formatting Rules]
- Clean and normalize unnecessary symbols in price and location such as "/", "・", "()".

[Noise Handling]
- Completely ignore decorative boundary lines (e.g., "********", "--------", "=================").
- Ensure all text wrapped inside or separated by these lines is fully parsed and extracted.

[Extraction Rules]
- isClosed:
  If the email indicates cancellation, closed, ended, hired, etc., output true. Otherwise output false. (Must NOT be a string)
- location:
  Prioritize actual work locations ("workplace", "勤務地", "作業場所", "working style"). Join multiple locations with "/". Do not mix signature addresses. Format as: Prefecture + City + Station. Infer missing parts from context. Every location must include a prefecture. If "リモート" or "テレワーク" is mentioned, output "リモートワーク".
- price:
  Extract only price information. Join multiple positions with "/". (e.g., "Leader:120万 / Developer:100万")
- skills:
  Output as a single slash-separated or comma-separated string. Remove bullets and "・".
- period:
  Extract work period information only. Join multiple values with "/".
- end_date:
  Extract recruitment/application period only. Do not confuse with project start date. Join multiple values with "/".
- is_human_resource:
  Infer the true intent. Output true if the main purpose is proposing engineers or sharing skill sheets. Output false if the purpose is seeking engineers for a project requirement. (Must NOT be a string)
- category:
  Classify the project into one or more of the following categories and return as a slash-separated string (e.g., "開発", "開発 / インフラ"). Do NOT use a JSON array here to keep the object flat.
  - 開発: software/application development, implementation, coding, testing
  - インフラ: cloud, server, network, middleware, CI/CD, operations, maintenance
  - 組み込み: firmware, hardware, IoT, devices, sensors, vehicle systems

[Output Keys]
Output MUST be a single JSON object with the exact keys below. isClosed and is_human_resource must be boolean values (true/false), NOT strings.

{
  "location": string,
  "price": string,
  "skills": string,
  "period": string,
  "isClosed": boolean,
  "end_date": string,
  "is_human_resource": boolean,
  "category": string
}

[Email Body to Analyze]
--------
[ここに解析したいメールの本文を貼り付ける]
--------
  // APIから全データをループで取得
  const fetchData = useCallback(async () => {
    setLoading(true);
 
    try {
      let allProjects = [];
      let page = 0;
      let isFetching = true;
 
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
        })),
      );
    } catch (error) {
      console.error("データ取得エラー:", error);
    } finally {
      setLoading(false);
    }
  }, []);
 
  // 駅名サジェスト取得
  const fetchStations = useCallback(
    async (keyword) => {
      if (!keyword) {
        setStationSuggestions([]);
        return;
      }
      try {
        const targetPrefs = selectedPrefs.length ? selectedPrefs : ["大阪府"];
        const responses = await Promise.all(
          targetPrefs.slice(0, 5).map((pref) =>
            fetch(
              `https://express.heartrails.com/api/json?method=getStations&prefecture=${encodeURIComponent(pref)}`,
            )
              .then((res) => res.json())
              .catch(() => ({ response: { station: [] } })),
          ),
        );
        const stations = responses.flatMap(
          (json) =>
            json?.response?.station?.map((station) => station.name) || [],
        );
        setStationSuggestions(
          [...new Set(stations.filter((name) => name.includes(keyword)))].slice(
            0,
            10,
          ),
        );
      } catch {
        setStationSuggestions([]);
      }
    },
    [selectedPrefs],
  );
 
  // フィルタリング処理
  // フィルタリング処理
  const filteredProjects = useMemo(() => {
    const query = searchQuery.toLowerCase();
 
    const currentRegionData = regionalPrefectures.find(
      (r) => r.region === selectedRegion,
    );
 
    const allowedPrefsNormalized = currentRegionData
      ? currentRegionData.prefs.map(normalize)
      : [];
 
    return projects
      .map((project) => {
        // --- 期限フラグの付与 ---
        if (!project.created_at) return { ...project, isExpiringSoon: false };
        const projectDate = new Date(project.created_at);
        const expireDate = new Date(projectDate);
        expireDate.setDate(expireDate.getDate() + 365);
        const warningDate = new Date(expireDate);
        warningDate.setDate(warningDate.getDate() - 30);
        const now = new Date();
        return {
          ...project,
          isExpiringSoon: now >= warningDate && now <= expireDate,
        };
      })
      .filter((project) => {
        // --- ここからがフィルタリングの全条件 ---
 
        // 1. 1年以上経過したものを非表示
        if (project.created_at) {
          const expireDate = new Date(project.created_at);
          expireDate.setDate(expireDate.getDate() + 365);
          if (new Date() > expireDate) return false;
        }
 
        // 2. クローズ案件の除外
        if (hideClosed && project.isClosed) return false;
 
        // 3. モード別のフィルタリング
        const isApplied = appliedIds.includes(project.id);
        if (viewMode === "applied") return isApplied;
        if (isApplied) return false;
        if (viewMode === "favorites") return project.favorite;
        if (viewMode === "history") return historyIds.includes(project.id);
 
        // 4. カテゴリフィルタ
        if (favFilters.length) {
          const categories = getProjectCategories(project);
          if (!favFilters.every((filter) => categories.includes(filter)))
            return false;
        }
 
        // 5. 検索・場所・スキル・リモート条件
        const pureContent = project.content || "";
        const searchableText =
          `${project.title || ""}${project.skills || ""}${pureContent}${project.location || ""}`.toLowerCase();
        const projectLocation = (project.location || "").trim();
        const projectPrefNormalized = normalize(projectLocation);
 
        if (viewMode === "all" && selectedRegion !== "すべて") {
          const matchesRegion = allowedPrefsNormalized.some((pref) =>
            projectPrefNormalized.startsWith(pref),
          );
          if (!matchesRegion) return false;
        }
 
        if (selectedPrefs.length) {
          const matchesPref = selectedPrefs.some((pref) =>
            projectPrefNormalized.startsWith(normalize(pref)),
          );
          if (!matchesPref) return false;
        }
 
        const matchesSkill =
          !selectedSkills.length ||
          selectedSkills.every((skill) =>
            searchableText.includes(skill.toLowerCase()),
          );
        const matchesRemote =
          !isRemoteOnly ||
          [project.location, project.title, pureContent].some((text) =>
            text?.includes("リモート"),
          );
 
        // 最後の条件を返す
        return searchableText.includes(query) && matchesSkill && matchesRemote;
      });
  }, [
    appliedIds,
    favFilters,
    hideClosed,
    historyIds,
    isRemoteOnly,
    projects,
    searchQuery,
    selectedPrefs,
    selectedSkills,
    viewMode,
    selectedRegion,
  ]);
 
  const totalPages = Math.ceil(filteredProjects.length / PAGE_SIZE);
 
  const currentItems = filteredProjects.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
 
  // ページネーション範囲計算
  const paginationRange = useMemo(() => {
    const siblingCount = 2;
    const totalPageNumbers = siblingCount * 2 + 5;
    if (totalPageNumbers >= totalPages)
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    const leftSiblingIndex = Math.max(currentPage - siblingCount, 1);
    const rightSiblingIndex = Math.min(currentPage + siblingCount, totalPages);
    const shouldShowLeftDots = leftSiblingIndex > 2;
    const shouldShowRightDots = rightSiblingIndex < totalPages - 2;
    if (!shouldShowLeftDots && shouldShowRightDots) {
      return Array.from({ length: 3 + 2 * siblingCount }, (_, i) => i + 1);
    }
    if (shouldShowLeftDots && !shouldShowRightDots) {
      const rightItemCount = 3 + 2 * siblingCount;
      return Array.from(
        { length: rightItemCount },
        (_, i) => totalPages - rightItemCount + i + 1,
      );
    }
    if (shouldShowLeftDots && shouldShowRightDots) {
      return Array.from(
        { length: rightSiblingIndex - leftSiblingIndex + 1 },
        (_, i) => leftSiblingIndex + i,
      );
    }
    return [];
  }, [currentPage, totalPages]);
  const changePage = (pageNumber) => {
    setCurrentPage(pageNumber);
  };
 
  const toggleSelection = (item, selected, setter) => {
    setter(
      selected.includes(item)
        ? selected.filter((value) => value !== item)
        : [...selected, item],
    );
 
    setCurrentPage(1);
  };
 
  useEffect(() => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }, [currentPage]);
 
  const toggleFavorite = (event, id) => {
    event.stopPropagation();
    const updated = projects.map((p) =>
      p.id === id ? { ...p, favorite: !p.favorite } : p,
    );
    setProjects(updated);
    storage.set(
      "favorites",
      updated.filter((p) => p.favorite).map((p) => p.id),
    );
  };
 
  const toggleApplied = (event, id) => {
    event.preventDefault();
    event.stopPropagation();
    const updated = appliedIds.includes(id)
      ? appliedIds.filter((itemId) => itemId !== id)
      : [...appliedIds, id];
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
    const targetEmail =
      project.content?.match(/[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}/)?.[0] || "";
    const ccEmail = project.cc_address || "";
    window.location.href = ccEmail
      ? `mailto:${targetEmail}?cc=${encodeURIComponent(ccEmail)}`
      : `mailto:${targetEmail}`;
  };
 
  const handleExecuteDelete = async () => {
    if (!deleteTargetId) return;
    try {
      const res = await fetch(
        `/api/mails?id=${encodeURIComponent(deleteTargetId)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        alert("削除に失敗しました。サーバーエラーの可能性があります。");
        return;
      }
      setProjects((prev) =>
        prev.filter((p) => p.projects_id !== deleteTargetId),
      );
      setSelectedProject((prev) =>
        prev?.projects_id === deleteTargetId ? null : prev,
      );
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
    return (
      regionalPrefectures.find((r) => r.region === selectedRegion)?.prefs || []
    );
  }, [selectedRegion]);
 
  const ProjectCard = ({
    project,
    readIds,
    appliedIds,
    viewMode,
    toggleFavorite,
    toggleApplied,
    openProject,
    handleSendEmail,
    setDeleteTargetId,
  }) => {
    const isRead = readIds.includes(project.id);
    const isApplied = appliedIds.includes(project.id);
    const projectCategories = getProjectCategories(project);
 
    // useMemoはここでOK（コンポーネントが安定した後）
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
        <div style={{ fontSize: "0.7rem", color: "#a0aec0", marginBottom: 5 }}>
          ID: {project.id}
        </div>
        <div
          style={{
            position: "absolute",
            top: 15,
            right: 15,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          {project.isClosed && (
            <span style={{ ...styles.badge, backgroundColor: "#e53e3e" }}>
              募集停止
            </span>
          )}
          {project.isExpiringSoon && !project.isClosed && (
            <span style={{ ...styles.badge, backgroundColor: "#dd6b20" }}>
              まもなく終了
            </span>
          )}
          {isApplied && viewMode !== "applied" && (
            <span style={{ ...styles.badge, backgroundColor: "#48bb78" }}>
              応募済み
            </span>
          )}
          {isRead && (
            <span
              style={{
                ...styles.badge,
                backgroundColor: "#e2e8f0",
                color: "#4a5568",
              }}
            >
              既読
            </span>
          )}
          <button
            onClick={(e) => toggleFavorite(e, project.id)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "1.4rem",
              color: project.favorite ? "#ed8936" : "#cbd5e0",
              padding: 0,
            }}
          >
            {project.favorite ? "★" : "☆"}
          </button>
        </div>
        <h3
          style={{
            fontSize: "1rem",
            color: "#1a365d",
            marginBottom: 20,
            fontWeight: 700,
            paddingRight: 60,
            textDecoration: project.isClosed ? "line-through" : "none",
          }}
        >
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
            <div
              key={label}
              style={{
                display: "flex",
                marginBottom: label === "募集人数" ? 0 : 8,
              }}
            >
              <span style={{ fontWeight: "bold", minWidth: 80 }}>
                【{label}】
              </span>
              <span>{value}</span>
            </div>
          ))}
  {attachments.length > 0 && (
            <div
              style={{
                marginTop: 12,
                fontSize: "0.8rem",
                color: "#4a5568",
                fontWeight: "bold",
                backgroundColor: "#edf2f7",
                padding: "4px 8px",
                borderRadius: 4,
                display: "inline-block",
              }}
            >
              📎 添付ファイルあり ({attachments.length})
            </div>
          )}
        </div>
        <div
          style={{ display: "flex", gap: 8, marginTop: 20, flexWrap: "wrap" }}
        >
          <button
            onClick={() => openProject(project)}
            style={{ ...styles.primaryButton, flex: "1 1 calc(50% - 4px)" }}
          >
            詳細
          </button>
          <button
            onClick={(e) => handleSendEmail(e, project)}
            disabled={project.isClosed}
            style={{ ...styles.secondaryButton, flex: "1 1 calc(50% - 4px)" }}
          >
            メール作成
          </button>
          <button
            onClick={(e) => toggleApplied(e, project.id)}
            style={{
              flex: "1 1 100%",
              padding: 8,
              borderRadius: 6,
              border: "1px solid #cbd5e0",
              background: isApplied ? "#e6fffa" : "#fff",
              color: isApplied ? "#38a169" : "#4a5568",
              cursor: "pointer",
              fontWeight: "bold",
            }}
          >
            {isApplied ? "応募解除" : "応募済みにする"}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDeleteTargetId(project.projects_id);
            }}
            style={{
              width: "100%",
              padding: 6,
              borderRadius: 6,
              border: "1px solid #fc8181",
              color: "#e53e3e",
              background: "#fff",
              cursor: "pointer",
              fontSize: "0.75rem",
            }}
          >
            削除
          </button>
        </div>
      </div>
    );
  };
 
  if (!authChecked) {
    return <div>認証チェック中...</div>;
  }
 
  if (!user) {
    return <div>ログインが必要です</div>;
  }
 
  return (
    <div style={styles.page}>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <nav style={styles.nav}>
        <div style={{ ...styles.navInner, justifyContent: "space-between" }}>
          <div
            style={{ display: "flex", height: "100%", alignItems: "center" }}
          >
            <div
              style={{
                marginRight: 30,
                height: 35,
                display: "flex",
                alignItems: "center",
              }}
            >
              <img
                src="/Logo_Mark2.png"
                alt="GE CREATIVE"
                style={{ height: "100%", width: "auto", objectFit: "contain" }}
              />
            </div>
            <div style={{ display: "flex", height: "100%" }}>
              {tabs.map((tab) => {
                const isActive = viewMode === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setViewMode(tab.id);
                      setCurrentPage(1);
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      color: isActive ? "#00bfa5" : "#4a5568",
                      cursor: "pointer",
                      fontWeight: 600,
                      padding: "0 25px",
                      height: "100%",
                      borderBottom: isActive
                        ? "3px solid #00bfa5"
                        : "3px solid transparent",
                      boxSizing: "border-box",
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>
          {viewMode === "all" && (
            <div
              style={{ display: "flex", height: "100%", alignItems: "center" }}
            >
              {["すべて", "東日本", "中日本", "西日本"].map((regionName) => {
                const isRegActive = selectedRegion === regionName;
                return (
                  <button
                    key={regionName}
                    onClick={() => {
                      setSelectedRegion(regionName);
                      setSelectedPrefs([]);
                      setCurrentPage(1);
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      color: isRegActive ? "#1a365d" : "#718096",
                      cursor: "pointer",
                      fontWeight: 700,
                      padding: "0 15px",
                      height: "100%",
                      fontSize: "0.95rem",
                      borderBottom: isRegActive
                        ? "3px solid #1a365d"
                        : "3px solid transparent",
                      boxSizing: "border-box",
                    }}
                  >
                    {regionName}
                  </button>
                );
              })}
              <button
                onClick={handleLogout}
                style={{
                  marginLeft: 20,
                  padding: "8px 16px",
                  borderRadius: 6,
                  border: "1px solid #e53e3e",
                  background: "#fff",
                  color: "#e53e3e",
                  cursor: "pointer",
                  fontWeight: "bold",
                }}
              >
                ログアウト
              </button>
            </div>
          )}
        </div>
      </nav>
      <div
        style={{
          display: "flex",
          padding: "40px 20px",
          gap: 30,
          boxSizing: "border-box",
        }}
      >
        <aside style={styles.sidebar}>
          <h2
            style={{
              fontSize: "1rem",
              fontWeight: "bold",
              marginBottom: 15,
              color: "#1a365d",
              borderLeft: "4px solid #1a365d",
              paddingLeft: 10,
            }}
          >
            カテゴリー
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {sideCategories.map((button) => {
              const isSelected =
                button.id === "all"
                  ? !favFilters.length
                  : favFilters.includes(button.id);
              return (
                <button
                  key={button.id}
                  onClick={() => {
                    setFavFilters(
                      button.id === "all"
                        ? []
                        : favFilters.includes(button.id)
                          ? favFilters.filter((id) => id !== button.id)
                          : [...favFilters, button.id],
                    );
                    setCurrentPage(1);
                  }}
                  style={{
                    padding: "12px 15px",
                    borderRadius: 8,
                    textAlign: "left",
                    border: "1px solid",
                    borderColor: isSelected ? "#00bfa5" : "#cbd5e0",
                    backgroundColor: isSelected ? "#00bfa5" : "#fff",
                    color: isSelected ? "#fff" : "#4a5568",
                    cursor: "pointer",
                    fontSize: "0.95rem",
                    fontWeight: "bold",
                  }}
                >
                  {button.label}
                </button>
              );
            })}
          </div>
        </aside>
        <main style={{ flexGrow: 1, maxWidth: 1600 }}>
          {viewMode === "all" && (
            <div
              style={{
                backgroundColor: "#fff",
                padding: 25,
                borderRadius: 10,
                border: "1px solid #e2e8f0",
                marginBottom: 30,
              }}
            >
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
                  onBlur={() =>
                    setTimeout(() => setShowSuggestions(false), 200)
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleSearchSubmit(searchQuery);
                    }
                  }}
                  style={{
                    width: "100%",
                    padding: 14,
                    border: "2px solid #cbd5e0",
                    borderRadius: 8,
                    fontSize: "1rem",
                    boxSizing: "border-box",
                  }}
                />
 
 {showSuggestions && history.length > 0 && (
                  /* 🟢 max-heightを履歴5件分相当の「220px」に固定し、あふれたらスクロール（overflowY: "auto"）にしました */
                  <div
                    style={{
                      position: "absolute",
                      top: "100%",
                      left: 0,
                      right: 0,
                      backgroundColor: "#fff",
                      border: "1px solid #cbd5e0",
                      zIndex: 110,
                      borderRadius: 8,
                      boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
                      marginTop: 4,
                      maxHeight: "220px",
                      overflowY: "auto",
                    }}
                  >
                    <div
                      style={{
                        padding: "8px 12px",
                        fontSize: "0.75rem",
                        fontWeight: "bold",
                        color: "#a0aec0",
                        borderBottom: "1px solid #edf2f7",
                        position: "sticky",
                        top: 0,
                        backgroundColor: "#fff",
                        zIndex: 1,
                      }}
                    >
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
                        style={{
                          padding: 12,
                          cursor: "pointer",
                          borderBottom: "1px solid #f7fafc",
                          fontSize: "0.9rem",
                          color: "#4a5568",
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        🕒 {name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <button
                  onClick={() => setShowFilters((v) => !v)}
                  style={{
                    background: "#f8fafc",
                    border: "1px solid #cbd5e0",
                    borderRadius: 6,
                    padding: "8px 16px",
                    cursor: "pointer",
                    fontSize: "0.85rem",
                    fontWeight: "bold",
                  }}
                >
                  詳細絞り込み {showFilters ? "▲" : "▼"}
                </button>
                <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
                  <label
                    style={{
                      fontSize: "0.85rem",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={hideClosed}
                      onChange={(e) => {
                        setHideClosed(e.target.checked);
                        setCurrentPage(1);
                      }}
                    />
                    募集停止を非表示
                  </label>
                  <label
                    style={{
                      fontSize: "0.85rem",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isRemoteOnly}
                      onChange={(e) => {
                        setIsRemoteOnly(e.target.checked);
                        setCurrentPage(1);
                      }}
                    />
                    リモート案件
                  </label>
                </div>
              </div>
              {showFilters && (
                <div
                  style={{
                    marginTop: 20,
                    borderTop: "1px solid #edf2f7",
                    paddingTop: 20,
                  }}
                >
                  <div style={{ marginBottom: 20 }}>
                    <div
                      style={{
                        marginBottom: 10,
                        fontSize: "0.8rem",
                        fontWeight: "bold",
                        color: "#4a5568",
                      }}
                    >
                      都道府県
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {filterablePrefectures.map((pref) => (
                        <button
                          key={pref}
                          onClick={() =>
                            toggleSelection(
                              pref,
                              selectedPrefs,
                              setSelectedPrefs,
                            )
                          }
                          style={{
                            padding: "6px 12px",
                            borderRadius: 6,
                            border: "1px solid",
                            borderColor: selectedPrefs.includes(pref)
                              ? "#00bfa5"
                              : "#e2e8f0",
                            backgroundColor: selectedPrefs.includes(pref)
                              ? "#00bfa5"
                              : "#fff",
                            color: selectedPrefs.includes(pref)
                              ? "#fff"
                              : "#4a5568",
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
                      <div
                        style={{
                          marginBottom: 10,
                          fontSize: "0.8rem",
                          fontWeight: "bold",
                          color: "#4a5568",
                        }}
                      >
                        {category.label}
                      </div>
                      <div
                        style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
                      >
                        {category.skills.map((skill) => (
                          <button
                            key={skill}
                            onClick={() =>
                              toggleSelection(
                                skill,
                                selectedSkills,
                                setSelectedSkills,
                              )
                            }
                            style={{
                              padding: "6px 12px",
                              borderRadius: 6,
                              border: "1px solid",
                              borderColor: selectedSkills.includes(skill)
                                ? "#3182ce"
                                : "#e2e8f0",
                              backgroundColor: selectedSkills.includes(skill)
                                ? "#3182ce"
                                : "#fff",
                              color: selectedSkills.includes(skill)
                                ? "#fff"
                                : "#4a5568",
                              fontSize: "0.75rem",
                              cursor: "pointer",
                            }}
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
          <div
            style={{
              marginBottom: 15,
              fontSize: "0.9rem",
              color: "#4a5568",
              fontWeight: "bold",
            }}
          >
            該当案件数: {filteredProjects.length} 件
          </div>
          {loading ? (
            <div style={styles.spinner} />
          ) : currentItems.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "40px",
                color: "#718096",
                backgroundColor: "#fff",
                borderRadius: 10,
                border: "1px solid #e2e8f0",
              }}
            >
              該当する案件が見つかりませんでした。
            </div>
          ) : (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
                  gap: 20,
                  marginBottom: 40,
                }}
              >
                {currentItems.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    readIds={readIds}
                    appliedIds={appliedIds}
                    viewMode={viewMode}
                    toggleFavorite={toggleFavorite}
                    toggleApplied={toggleApplied}
                    openProject={openProject}
                    handleSendEmail={handleSendEmail}
                    setDeleteTargetId={setDeleteTargetId}
                  />
                ))}
              </div>
              {/*一気に飛べるボタンを追加 */}
              {totalPages > 1 && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    gap: 8,
                    marginTop: 20,
                    flexWrap: "wrap",
                  }}
                >
                  {/* 最初のページへ一気に戻る */}
                  <button
                    onClick={() => changePage(1)}
                    disabled={currentPage === 1}
                    style={{
                      ...styles.pageBtn,
                      opacity: currentPage === 1 ? 0.5 : 1,
                      cursor: currentPage === 1 ? "not-allowed" : "pointer",
                    }}
                  >
                    最初のページ
                  </button>
 
                  {/* 5ページ前に戻る */}
                  <button
                    onClick={() => changePage(Math.max(currentPage - 5, 1))}
                    disabled={currentPage === 1}
                    style={{
                      ...styles.pageBtn,
                      opacity: currentPage === 1 ? 0.5 : 1,
                      cursor: currentPage === 1 ? "not-allowed" : "pointer",
                    }}
                  >
                    5ページ前へ
                  </button>
 
                  {/* 1ページ前に戻る */}
                  <button
                    onClick={() => changePage(Math.max(currentPage - 1, 1))}
                    disabled={currentPage === 1}
                    style={{
                      ...styles.pageBtn,
                      opacity: currentPage === 1 ? 0.5 : 1,
                      cursor: currentPage === 1 ? "not-allowed" : "pointer",
                    }}
                    title="前へ"
                  >
                    ‹
                  </button>
 
                  {/* 通常のページ番号ボタン */}
                  {paginationRange.map((page, idx) => (
                    <button
                      key={page}
                      onClick={() =>
                        typeof page === "number" && changePage(page)
                      }
                      style={{
                        ...styles.pageBtn,
                        backgroundColor:
                          currentPage === page ? "#1a365d" : "#fff",
                        color: currentPage === page ? "#fff" : "#2d3748",
                      }}
                    >
                      {page}
                    </button>
                  ))}
 
                  {/* 1ページ次に進む! */}
                  <button
                    onClick={() =>
                      changePage(Math.min(currentPage + 1, totalPages))
                    }
                    disabled={currentPage === totalPages}
                    style={{
                      ...styles.pageBtn,
                      opacity: currentPage === totalPages ? 0.5 : 1,
                      cursor:
                        currentPage === totalPages ? "not-allowed" : "pointer",
                    }}
                    title="次へ"
                  >
                    ›
                  </button>
 
                  {/* 5ページ次に進む */}
                  <button
                    onClick={() =>
                      changePage(Math.min(currentPage + 5, totalPages))
                    }
                    disabled={currentPage === totalPages}
                    style={{
                      ...styles.pageBtn,
                      opacity: currentPage === totalPages ? 0.5 : 1,
                      cursor:
                        currentPage === totalPages ? "not-allowed" : "pointer",
                    }}
                  >
                    5ページ次へ
                  </button>
 
                  {/* 最後のページへ一気に飛ぶ */}
                  <button
                    onClick={() => changePage(totalPages)}
                    disabled={currentPage === totalPages}
                    style={{
                      ...styles.pageBtn,
                      opacity: currentPage === totalPages ? 0.5 : 1,
                      cursor:
                        currentPage === totalPages ? "not-allowed" : "pointer",
                    }}
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
        <div
          style={styles.modalOverlay}
          onClick={() => setSelectedProject(null)}
        >
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2
              style={{
                fontSize: "1.3rem",
                color: "#1a365d",
                marginBottom: 20,
                paddingRight: 40,
              }}
            >
              {selectedProject.title}
            </h2>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 12,
                marginBottom: 25,
                fontSize: "0.95rem",
              }}
            >
              <div>
                <strong>【場所】</strong>{" "}
                {selectedProject.location || "記載なし"}
              </div>
              <div>
                <strong>【単価】</strong> {selectedProject.price || "記載なし"}
              </div>
              <div>
                <strong>【期間】</strong> {selectedProject.period || "記載なし"}
              </div>
              <div>
                <strong>【募集期間】</strong>{" "}
                {selectedProject.end_date || "記載なし"}
              </div>
              <div>
                <strong>【スキル】</strong>{" "}
                {selectedProject.skills || "記載なし"}
              </div>
              <div>
                <strong>【カテゴリ】</strong>{" "}
                {getProjectCategories(selectedProject)
                  .map((category) => {
                    switch (category) {
                      case "dev":
                        return "開発";
                      case "infra":
                        return "インフラ";
                      case "embedded":
                        return "組み込み";
                      default:
                        return category;
                    }
                  })
                  .join(" / ")}
              </div>
              {(() => {
                const pAttachments = !selectedProject.attachments
                  ? []
                  : Array.isArray(selectedProject.attachments)
                    ? selectedProject.attachments
                    : (() => {
                        try {
                          return JSON.parse(selectedProject.attachments);
                        } catch {
                          return [];
                        }
                      })();
                if (pAttachments.length === 0) return null;
                return (
                  <div
                    style={{
                      marginTop: 5,
                      padding: "10px 14px",
                      backgroundColor: "#f7fafc",
                      borderRadius: 8,
                      border: "1px solid #edf2f7",
                    }}
                  >
                    <strong
                      style={{
                        display: "block",
                        marginBottom: 6,
                        color: "#4a5568",
                      }}
                    >
                      📎 添付ファイルダウンロード:
                    </strong>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                      {pAttachments.map((file, i) => {
                        const url =
                          typeof file === "string"
                            ? file
                            : file.file_url || file.url;
                        const name =
                          typeof file === "string"
                            ? `ファイル ${i + 1}`
                            : file.file_name || file.name;
                        return (
                          <a
                            key={i}
                            href={url}
                            style={{ ...styles.attachmentLink, margin: 0 }}
                            onClick={(e) => handleDownloadFile(e, url, name)}
                          >
                            {name}
                          </a>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
            <hr
              style={{
                border: "none",
                borderTop: "1px solid #edf2f7",
                margin: "20px 0",
              }}
            />
            <div
              style={{
                whiteSpace: "pre-wrap",
                fontSize: "0.9rem",
                lineHeight: "1.6",
                color: "#4a5568",
                padding: "10px",
                width: "100%",
              }}
            >
              {selectedProject?.content ? (
                (() => {
                  const content = selectedProject.content;
                  const isFullHtml = /<html|<head|<body/i.test(
                    content.substring(0, 100),
                  );
 
                  if (isFullHtml) {
                    return (
                      <iframe
                        key={selectedProject.id}
                        srcDoc={`
                                <html>
                                  <head>
                                    <style>
                                        body { margin: 0; padding: 0; overflow: hidden; font-family: sans-serif; }
                                    </style>
                                  </head>
                                  <body>${content}</body>
                                </html>
                               `}
                        title="Email Content"
                        scrolling="no" // 1. スクロールバーを非表示にする
                        sandbox="allow-scripts allow-popups"
                        onLoad={(e) => {
                          // 2. 読み込み完了後に一度だけ高さを合わせる（ガタつきを抑える）
                          const target = e.target;
                          if (
                            target.contentWindow.document.body.scrollHeight > 0
                          ) {
                            target.style.height =
                              target.contentWindow.document.body.scrollHeight +
                              "px";
                          }
                        }}
                        style={{
                          width: "100%",
                          minHeight: "300px", // 3. 最初からある程度の高さを確保しておく（ラグ感を消す）
                          border: "none",
                          backgroundColor: "white",
                          display: "block",
                        }}
                      />
                    );
                  } else {
                    return <div>{formatContent(content)}</div>;
                  }
                })()
              ) : (
                <div>データがありません</div>
              )}
            </div>
          </div>
        </div>
      )}
      {deleteTargetId && (
        <div
          style={styles.modalOverlay}
          onClick={() => setDeleteTargetId(null)}
        >
          <div
            style={{
              ...styles.modalContent,
              maxWidth: 400,
              textAlign: "center",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: "1.1rem", marginBottom: 20 }}>
              案件を削除しますか？
            </h3>
            <p
              style={{
                fontSize: "0.85rem",
                color: "#718096",
                marginBottom: 25,
              }}
            >
              この操作は取り消せません。
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button
                onClick={() => setDeleteTargetId(null)}
                style={{
                  padding: "10px 20px",
                  background: "#edf2f7",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontWeight: "bold",
                }}
              >
                キャンセル
              </button>
              <button
                onClick={handleExecuteDelete}
                style={{
                  padding: "10px 20px",
                  background: "#e53e3e",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontWeight: "bold",
                }}
              >
                削除する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
 







 
