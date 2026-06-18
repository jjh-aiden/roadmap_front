// ============================================================
// 📊 계보 시각화 기능 - PoC v55 추가 코드
// ============================================================
// 이 파일을 sebak_designer_v55.jsx에 단계별로 추가하세요.
// 본인 PoC v55의 좌측 목차 패턴은 이미 구현되어 있으므로,
// 2단계(사후 매핑) + 3단계(시각화 컴포넌트) 두 가지만 추가합니다.
// ============================================================


// ============================================================
// 【STEP 1】 시스템 프롬프트 추가
// ============================================================
// 위치: sebak_designer_v55.jsx의 다른 SYSTEM_* 상수들 옆 (예: SYSTEM_MAJOR_INFO 다음 줄)
// 약 line 2050 근처에 추가

const SYSTEM_GENEALOGY_MAPPING = `당신은 학생부 컨설팅의 분류 전문가입니다.
주어진 [심화 계보 목록]과 [탐구 주제 목록]을 매핑하는 작업을 수행합니다.

⚠️ 매핑 원칙:
1. 각 탐구 주제를 가장 잘 발전시키는 계보 하나만 선택합니다.
2. 어느 계보와도 명확히 연결되지 않으면 "독립"으로 분류합니다.
3. 매핑은 다음 기준으로 판단:
   - 탐구 주제의 핵심 키워드가 계보의 핵심 주제와 일치하는가?
   - 탐구 주제가 계보의 학년 간 발전 방향을 자연스럽게 이어가는가?
   - 탐구 주제의 결론이 계보의 발전 방향을 강화하는가?

⚠️ 보수적으로 판단:
- 우연한 키워드 일치 정도로는 매핑 금지
- 계보의 본질적 흐름을 발전시키는 주제만 매핑
- 애매하면 "독립"으로 분류

출력 형식 (JSON만, 다른 설명 금지):
{
  "mappings": [
    {
      "subject": "과목명",
      "topicIndex": 1 또는 2,
      "topicTitle": "탐구 주제명",
      "genealogy": "계보명 또는 독립",
      "reason": "왜 이 계보로 매핑했는지 한 줄"
    }
  ]
}`;


// ============================================================
// 【STEP 2】 사후 매핑 함수 추가
// ============================================================
// 위치: regenerateSubject 함수 다음 (약 line 3340 근처)

async function mapTopicsToGenealogies(overview, subjectResults) {
  // 1. 총론에서 심화 계보 추출
  const genealogies = parseGenealogiesFromOverview(overview);
  if (genealogies.length === 0) {
    console.warn("계보 추출 실패");
    return { genealogies: [], mappings: [] };
  }

  // 2. 각 과목 결과에서 탐구 주제 추출
  const topics = [];
  for (const [subject, result] of Object.entries(subjectResults)) {
    const subjectTopics = parseTopicsFromSubject(result, subject);
    topics.push(...subjectTopics);
  }
  if (topics.length === 0) {
    console.warn("탐구 주제 추출 실패");
    return { genealogies, mappings: [] };
  }

  // 3. AI 호출로 매핑 (Haiku 사용 - 빠르고 저렴)
  const genealogyText = genealogies
    .map((g, i) => `${i + 1}. ${g.name} — ${g.summary || ""}\n   주요 활동: ${g.activities.map(a => a.title).join(", ")}`)
    .join("\n\n");

  const topicsText = topics
    .map(t => `[${t.subject}] 탐구 주제 ${t.index}: ${t.title}`)
    .join("\n");

  try {
    const result = await callClaude(
      SYSTEM_GENEALOGY_MAPPING,
      `[심화 계보 목록]\n${genealogyText}\n\n[탐구 주제 목록]\n${topicsText}`,
      4096,
      MODEL_FAST  // Haiku 사용
    );

    const parsed = JSON.parse(stripJsonFence(result));
    return {
      genealogies,
      mappings: parsed.mappings || []
    };
  } catch (e) {
    console.error("계보 매핑 실패:", e);
    return { genealogies, mappings: [] };
  }
}


// ============================================================
// 【STEP 3】 헬퍼 함수들 추가
// ============================================================
// 위치: STEP 2의 mapTopicsToGenealogies 함수 위에 또는 옆에 추가

// 총론 텍스트에서 심화 계보 구조 추출
function parseGenealogiesFromOverview(overviewText) {
  if (!overviewText) return [];
  
  const genealogies = [];
  
  // "## 심화 계보" 섹션 찾기
  const genealogySection = overviewText.match(/## 심화 계보[\s\S]*?(?=\n## |\n===== |$)/);
  if (!genealogySection) return [];
  
  const text = genealogySection[0];
  
  // 각 계보 추출 (1. **계보명** — 요약 형식)
  const genealogyRegex = /\d+\.\s*\*\*([^*]+)\*\*\s*—\s*([^\n]+)/g;
  const activityRegex = /-\s*\(([^)]+)\)\s*([^—\n]+?)(?:\s*—\s*([^\n]+))?(?=\n|$)/g;
  
  let match;
  const matches = [];
  while ((match = genealogyRegex.exec(text)) !== null) {
    matches.push({ index: match.index, name: match[1].trim(), summary: match[2].trim() });
  }
  
  // 각 계보의 활동 추출
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = (i + 1 < matches.length) ? matches[i + 1].index : text.length;
    const section = text.slice(start, end);
    
    const activities = [];
    activityRegex.lastIndex = 0;
    let actMatch;
    while ((actMatch = activityRegex.exec(section)) !== null) {
      const source = actMatch[1].trim();  // 예: "2학년 동아리활동"
      const title = actMatch[2].trim();
      const detail = (actMatch[3] || "").trim();
      
      // 학년 추출
      const yearMatch = source.match(/(\d)학년/);
      const year = yearMatch ? parseInt(yearMatch[1]) : null;
      
      // 영역 추출
      const area = source.replace(/\d학년\s*/, "").trim();
      
      activities.push({ year, area, title, detail, source });
    }
    
    genealogies.push({
      name: matches[i].name,
      summary: matches[i].summary,
      activities
    });
  }
  
  return genealogies;
}

// 과목 결과 텍스트에서 탐구 주제 추출
function parseTopicsFromSubject(subjectText, subjectName) {
  if (!subjectText) return [];
  
  const topics = [];
  
  // 탐구 주제 ① / ② 찾기 (한 패턴씩)
  const topicRegex = /\*\*\[탐구 주제 ([①②])([^\]]*)\]\*\*[\s\S]*?\*\*주제명\*\*:\s*([^\n]+)/g;
  
  let match;
  while ((match = topicRegex.exec(subjectText)) !== null) {
    const indexChar = match[1];
    const index = indexChar === "①" ? 1 : 2;
    const tag = (match[2] || "").trim();  // 예: "— 진로 연계"
    const title = match[3].trim();
    
    topics.push({
      subject: subjectName,
      index,
      tag,
      title
    });
  }
  
  return topics;
}


// ============================================================
// 【STEP 4】 State 추가
// ============================================================
// 위치: 다른 useState 옆 (약 line 2100 근처, baseLevel state 다음 등)

const [genealogyData, setGenealogyData] = useState(null);
const [genealogyLoading, setGenealogyLoading] = useState(false);


// ============================================================
// 【STEP 5】 매핑 자동 호출 추가
// ============================================================
// 위치: generateSubject 함수의 마지막 부분 (모든 과목 완료 후)
// 약 line 3275 근처, "setGenerationLog(l => [...l, `✓ [${elapsed()}] 모든 교과 완료`]);" 다음에 추가

// 모든 과목 완료 후 계보 매핑 자동 실행
try {
  setGenealogyLoading(true);
  setGenerationLog(l => [...l, `  → 계보 매핑 분석 중...`]);
  
  // subjectResults는 state라서 최신값을 사용하기 위해 ref 또는 직접 전달 필요
  // 이 부분은 본인 코드 구조에 맞춰 조정 필요
  const data = await mapTopicsToGenealogies(overview, subjectResults);
  setGenealogyData(data);
  setGenerationLog(l => [...l, `  ✓ 계보 매핑 완료 (${data.mappings.length}개 주제 매핑)`]);
} catch (e) {
  console.error("계보 매핑 실패:", e);
  setGenerationLog(l => [...l, `  ⚠ 계보 매핑 건너뜀 (시각화 불가)`]);
} finally {
  setGenealogyLoading(false);
}


// ============================================================
// 【STEP 6】 계보 시각화 컴포넌트 추가
// ============================================================
// 위치: 다른 컴포넌트 함수들 옆 (예: MarkdownRenderer 함수 위 또는 아래)
// 약 line 5490 근처

function GenealogyMatrix({ genealogyData, currentSemester, loading }) {
  if (loading) {
    return (
      <div style={{ padding: "40px", textAlign: "center", color: "#888" }}>
        <span style={{ 
          display: "inline-block", width: "20px", height: "20px",
          border: "2px solid #ccc", borderTopColor: "#1a1a1a",
          borderRadius: "50%", animation: "spin 0.8s linear infinite",
          marginRight: "10px", verticalAlign: "middle"
        }} />
        계보 매핑 분석 중...
      </div>
    );
  }
  
  if (!genealogyData || !genealogyData.genealogies || genealogyData.genealogies.length === 0) {
    return (
      <div style={{ padding: "20px", color: "#888", fontSize: "13px" }}>
        계보 시각화를 위한 데이터가 부족합니다. 총론에 심화 계보가 추출되어 있어야 합니다.
      </div>
    );
  }
  
  const { genealogies, mappings } = genealogyData;
  
  // 학년 열 결정
  const allYears = new Set();
  genealogies.forEach(g => {
    g.activities.forEach(a => {
      if (a.year) allYears.add(a.year);
    });
  });
  const years = Array.from(allYears).sort();
  
  // 매핑을 계보별로 그룹화
  const mappingsByGenealogy = {};
  mappings.forEach(m => {
    if (!mappingsByGenealogy[m.genealogy]) {
      mappingsByGenealogy[m.genealogy] = [];
    }
    mappingsByGenealogy[m.genealogy].push(m);
  });
  
  // 독립 활동 따로
  const independentTopics = mappingsByGenealogy["독립"] || [];
  
  return (
    <div style={{ padding: "20px 0" }}>
      <div style={{ marginBottom: "20px" }}>
        <h2 style={{ fontSize: "20px", fontWeight: 600, marginBottom: "8px" }}>📊 탐구 계보 시각화</h2>
        <p style={{ fontSize: "13px", color: "#666", lineHeight: 1.6 }}>
          학생부에서 추출한 심화 계보(행)와 학년별 활동(열)을 한눈에 보여줍니다.
          이번 학기 추천 탐구 주제가 어느 계보를 발전시키는지 표시됩니다.
        </p>
      </div>
      
      <div style={{ overflowX: "auto" }}>
        <table style={{ 
          width: "100%", 
          borderCollapse: "collapse",
          fontSize: "13px"
        }}>
          <thead>
            <tr style={{ background: "#fafaf7", borderBottom: "2px solid #1a1a1a" }}>
              <th style={{ 
                padding: "12px", 
                textAlign: "left", 
                fontWeight: 600,
                minWidth: "160px",
                borderRight: "1px solid #e8e8e8"
              }}>
                계보
              </th>
              {years.map(y => (
                <th key={y} style={{ 
                  padding: "12px", 
                  textAlign: "left", 
                  fontWeight: 600,
                  minWidth: "180px",
                  borderRight: "1px solid #e8e8e8"
                }}>
                  {y}학년
                </th>
              ))}
              <th style={{ 
                padding: "12px", 
                textAlign: "left", 
                fontWeight: 600,
                minWidth: "200px",
                background: "#fff3e0"
              }}>
                ⭐ {currentSemester || "이번 학기"} 추천
              </th>
            </tr>
          </thead>
          <tbody>
            {genealogies.map((g, idx) => {
              const genealogyMappings = mappingsByGenealogy[g.name] || [];
              return (
                <tr key={idx} style={{ borderBottom: "1px solid #e8e8e8" }}>
                  {/* 계보명 */}
                  <td style={{ 
                    padding: "12px",
                    verticalAlign: "top",
                    background: "#fafaf7",
                    borderRight: "1px solid #e8e8e8"
                  }}>
                    <div style={{ fontWeight: 600, marginBottom: "4px" }}>{g.name}</div>
                    {g.summary && (
                      <div style={{ fontSize: "11px", color: "#888", lineHeight: 1.5 }}>
                        {g.summary}
                      </div>
                    )}
                  </td>
                  
                  {/* 학년별 활동 */}
                  {years.map(y => {
                    const activities = g.activities.filter(a => a.year === y);
                    return (
                      <td key={y} style={{ 
                        padding: "12px",
                        verticalAlign: "top",
                        borderRight: "1px solid #e8e8e8"
                      }}>
                        {activities.length === 0 ? (
                          <div style={{ color: "#ccc", fontSize: "11px" }}>—</div>
                        ) : (
                          activities.map((a, i) => (
                            <div key={i} style={{ 
                              marginBottom: i < activities.length - 1 ? "10px" : 0,
                              padding: "6px 8px",
                              background: "#f8f8f5",
                              borderRadius: "4px",
                              borderLeft: "3px solid #999"
                            }}>
                              <div style={{ fontSize: "10px", color: "#888", marginBottom: "2px" }}>
                                {a.area}
                              </div>
                              <div style={{ fontSize: "12px", color: "#1a1a1a", lineHeight: 1.4 }}>
                                {a.title}
                              </div>
                            </div>
                          ))
                        )}
                      </td>
                    );
                  })}
                  
                  {/* 이번 학기 추천 */}
                  <td style={{ 
                    padding: "12px",
                    verticalAlign: "top",
                    background: "#fffbf0"
                  }}>
                    {genealogyMappings.length === 0 ? (
                      <div style={{ color: "#ccc", fontSize: "11px" }}>—</div>
                    ) : (
                      genealogyMappings.map((m, i) => (
                        <div key={i} style={{ 
                          marginBottom: i < genealogyMappings.length - 1 ? "10px" : 0,
                          padding: "6px 8px",
                          background: "white",
                          borderRadius: "4px",
                          borderLeft: "3px solid #fb0"
                        }}>
                          <div style={{ fontSize: "10px", color: "#a60", fontWeight: 600, marginBottom: "2px" }}>
                            ⭐ {m.subject}
                          </div>
                          <div style={{ fontSize: "12px", color: "#1a1a1a", lineHeight: 1.4 }}>
                            {m.topicTitle}
                          </div>
                          {m.reason && (
                            <div style={{ fontSize: "10px", color: "#888", marginTop: "4px", fontStyle: "italic" }}>
                              {m.reason}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      
      {/* 독립 활동 (계보에 매핑 안 된 추천) */}
      {independentTopics.length > 0 && (
        <div style={{ marginTop: "24px", padding: "16px", background: "#fafaf7", borderRadius: "8px" }}>
          <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px", color: "#666" }}>
            🔹 독립 탐구 주제 (기존 계보와 별개로 추천된 새 방향)
          </div>
          {independentTopics.map((m, i) => (
            <div key={i} style={{ 
              marginBottom: i < independentTopics.length - 1 ? "8px" : 0,
              padding: "8px 12px",
              background: "white",
              borderRadius: "4px",
              fontSize: "12px"
            }}>
              <span style={{ fontWeight: 600, color: "#666" }}>[{m.subject}]</span>{" "}
              {m.topicTitle}
              {m.reason && (
                <span style={{ color: "#888", marginLeft: "8px", fontStyle: "italic" }}>
                  — {m.reason}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      
      {/* 매핑 통계 */}
      <div style={{ marginTop: "16px", fontSize: "11px", color: "#888", textAlign: "right" }}>
        총 {mappings.length}개 탐구 주제 중{" "}
        {mappings.filter(m => m.genealogy !== "독립").length}개 매핑,{" "}
        {independentTopics.length}개 독립
      </div>
    </div>
  );
}


// ============================================================
// 【STEP 7】 좌측 목차에 "계보 시각화" 메뉴 추가
// ============================================================
// 위치: "2. 설계 방향 총론" 메뉴 다음, "교과별 컨셉" 구분선 위
// 약 line 4411~4413 사이에 추가

/* 추가할 JSX */
{/*
<div
  onClick={() => setActiveSection("genealogy")}
  style={{
    padding: "8px 10px",
    fontSize: "13px",
    cursor: genealogyData ? "pointer" : "default",
    fontWeight: activeSection === "genealogy" ? 600 : 400,
    color: genealogyData ? "#1a1a1a" : "#aaa",
    background: activeSection === "genealogy" ? "#fafaf7" : "transparent",
    borderLeft: activeSection === "genealogy" ? "2px solid #1a1a1a" : "2px solid transparent",
    display: "flex",
    alignItems: "center",
    gap: "6px"
  }}
>
  📊 계보 시각화
  {genealogyLoading && (
    <span style={{
      width: "10px", height: "10px",
      border: "1.5px solid #ccc", borderTopColor: "transparent",
      borderRadius: "50%",
      animation: "spin 0.8s linear infinite",
      display: "inline-block"
    }} />
  )}
</div>
*/}


// ============================================================
// 【STEP 8】 우측 컨텐츠 영역에 분기 추가
// ============================================================
// 위치: activeSection === "profile" 분기 옆에 추가
// 본인 코드에서 activeSection 분기하는 곳 찾아 추가

/* 추가할 JSX */
/*
{activeSection === "genealogy" && (
  <GenealogyMatrix 
    genealogyData={genealogyData}
    currentSemester={studentInfo.학년}
    loading={genealogyLoading}
  />
)}
*/


// ============================================================
// 🎯 적용 순서 요약
// ============================================================
// 
// 1. SYSTEM_GENEALOGY_MAPPING 상수 추가 (STEP 1)
// 2. parseGenealogiesFromOverview, parseTopicsFromSubject 함수 추가 (STEP 3)
// 3. mapTopicsToGenealogies 함수 추가 (STEP 2)
// 4. genealogyData, genealogyLoading state 추가 (STEP 4)
// 5. generateSubject 마지막에 매핑 자동 호출 추가 (STEP 5)
// 6. GenealogyMatrix 컴포넌트 추가 (STEP 6)
// 7. 좌측 목차에 "계보 시각화" 메뉴 추가 (STEP 7)
// 8. 우측 컨텐츠에 GenealogyMatrix 분기 추가 (STEP 8)
//
// 적용 후 테스트:
// - 학생부 PDF 업로드 → 총론 생성 → 과목별 생성 완료
// - 모든 과목 완료 후 자동으로 계보 매핑 시작 (좌측 메뉴 로딩 표시)
// - 완료되면 좌측 "계보 시각화" 메뉴 활성화 → 클릭 시 표 표시
//
// 디버깅 팁:
// - 매핑이 안 되면 콘솔(F12)에서 "계보 추출 실패" 또는 "탐구 주제 추출 실패" 메시지 확인
// - 추출 실패 시 총론 또는 과목 결과 텍스트가 예상 형식과 다를 수 있음
// - parseGenealogiesFromOverview / parseTopicsFromSubject 정규식 조정 필요
//
// ============================================================
