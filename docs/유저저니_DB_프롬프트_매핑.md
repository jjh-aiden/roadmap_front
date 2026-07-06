# 학쫑프로 로드맵 — 유저 저니 × 데이터(DB) × 프롬프트 매핑

> **문서 목적**: 전체 유저 저니에서 **"무엇을 클릭/입력했을 때 → 어떤 데이터가 읽히고/저장되고 → 어떤 프롬프트가 어떤 모델로 호출되는지"** 를 한눈에 정리합니다.
> 개발팀이 화면·상태·AI 호출·(향후) DB 스키마를 매핑하는 기준 문서로 사용하세요.
>
> - 코드 기준: `src/sebak_designer_v55.jsx` (브랜치 `claude/dev-team-spec-doc-rt6h4i`)
> - 함께 보기: `docs/개발팀_전달_스펙문서.md`
> - 최종 갱신: 2026-07-03

---

## 0. 먼저 읽는 법 (용어)

이 앱에는 아직 **서버 DB가 없습니다.** "데이터 저장소"는 아래 4종류로 나뉩니다. 표의 **읽기/쓰기 대상**은 이 분류를 따릅니다.

| 분류 | 표기 | 실체 | 영속성 |
|------|------|------|--------|
| **정적 데이터** | `📄 정적` | `public/curriculum.json`, `public/majors.json` (앱 시작 시 fetch) | 배포 파일(읽기 전용) |
| **내장 상수** | `📦 상수` | 코드 하드코딩 (`MAJOR_DB`, `FACULTY_MAPPING`, `SUBJECT_POOL`, `SCHOOL_TIERS`, `DIFFICULTY_LEVELS`) | 코드 |
| **영속 캐시** | `💾 캐시` | `window.storage` (Claude Artifact 전용 API) — 3개 키 | ⚠️ **일반 웹 배포 시 미작동**(13장 참고) |
| **세션 상태** | `🧠 상태` | React `useState` — 새로고침 시 소멸 | 휘발성 |

> 🔴 즉, **현재는 "설계 결과(총론·각론·계보)"가 어디에도 영속 저장되지 않습니다.** 새로고침하면 전부 사라짐.
> 정식 서비스에서 필요한 **DB 스키마 제안은 6장**에 있습니다.

---

## 1. 데이터 저장소 인벤토리

### 1.1 정적 데이터 (`📄`)
| 저장소 | 로드 시점 | 내용 | 읽는 단계 |
|--------|-----------|------|-----------|
| `curriculum.json` | 앱 시작 `useEffect` | 과목별 교과군·성취기준·기본/융합 키워드 | STEP1(과목 선택), STEP3·5(성취기준 주입) |
| `majors.json` | 앱 시작 `useEffect` | `"대학 학과"` 키의 전국 학과 마스터 | STEP1(학과 선택), STEP3·5(학과 컨텍스트) |

### 1.2 내장 상수 (`📦`)
| 상수 | 용도 | 쓰이는 함수 |
|------|------|-------------|
| `MAJOR_DB` | 대표 학과 시드 정보(3순위 fallback) | `resolveMajorInfo` |
| `FACULTY_MAPPING` | 학과명 → 9개 계열 + 핵심 진로과목 | `determineFaculty`, `formatFacultyMappingAsInput` |
| `SUBJECT_POOL` | 고교 선택과목 표준 풀 | 과목 선택 UI |
| `SCHOOL_TIERS` | 학교 수준 분류 | `classifySchoolTier` |
| `DIFFICULTY_LEVELS` | 탐구 Level 1~4 정의 | 난이도 섹션 주입 |

### 1.3 영속 캐시 (`💾`, `window.storage`)
| 키(`STORAGE_KEYS`) | 내용 | 쓰는 액션 |
|------|------|-----------|
| `hakzzong:curriculum:v1` | 교육과정(CSV 업로드분) | `handleCurriculumUpload` |
| `hakzzong:majors:v1` | 학과 DB(CSV 업로드분) | `handleMajorDBUpload` |
| `hakzzong:major-info:v1` | **AI 생성 + 검수된 학과 상세정보** | `approveMajorInfo` / `clearMajorInfoCache` |

---

## 2. 프롬프트 인벤토리 (전체 12종 + 인라인 1)

| # | 프롬프트 상수 | 모델 | maxTokens | 출력 | 호출 함수 | 현재 사용 |
|---|---------------|------|-----------|------|-----------|-----------|
| 1 | `SYSTEM_MAJOR_INFO` | Sonnet(기본) | 2048 | JSON | `generateMajorInfo` | ✅ STEP1 |
| 2 | *(인라인)* 이름 추출 | **Haiku** | 50 | 텍스트 | `handlePdfUpload` | ✅ STEP2 |
| 3 | `SYSTEM_OVERVIEW` / `_FRESHMAN` | Sonnet | 8000 | Markdown(+SECTION_SPLIT) | `generateOverview` | ✅ STEP3 |
| 4 | `SYSTEM_INTERVIEW_CAREER_EXAMPLES` | **Haiku** | 500 | JSON 배열 | `loadCareerExamples` | ✅ STEP4 진입 |
| 5 | `SYSTEM_INTERVIEW_FINAL` | Sonnet | 300 | 텍스트 | `finalizeIdentity` | ✅ STEP4 |
| 6 | `SYSTEM_INTERVIEW_REVISE` | Sonnet | 400 | JSON(ok/rejected) | `reviseIdentity` | ✅ STEP4 |
| 7 | `SYSTEM_SUBJECT` / `_FRESHMAN` | Sonnet | 4500 | Markdown(탐구주제 ①②) | `generateSubjects`·`regenerateSubject`·`fillGenealogy` | ✅ STEP5 |
| 8 | `SYSTEM_GENEALOGY_SUBJECT_PICK` | **Haiku** | 512 | JSON | `fillGenealogy` | ✅ STEP5 |
| 9 | `SYSTEM_GENEALOGY_MAPPING` | **Haiku** | 4096 | JSON(mappings) | `mapTopicsToGenealogies` | ✅ STEP5 자동 |
| 10 | `SYSTEM_PARSE` | Haiku | 4096 | JSON | `runParse` | ⚠️ **정의됨/미연결** |
| 11 | `SYSTEM_PROFILE` | Sonnet | - | Markdown | *(없음)* | ⚠️ **미사용** |
| 12 | `SYSTEM_INTERVIEW_DYNAMIC_QUESTION` | - | - | 텍스트 | *(없음)* | ⚠️ **미사용(구버전 잔재)** |

> 모델 상수: `MODEL_FAST = claude-haiku-4-5-20251001`, `MODEL_MAIN = claude-sonnet-4-6`.
> `callClaude` 기본값은 `claude-sonnet-4-6`, 백엔드 기본값은 `claude-sonnet-4-20250514`(불일치, 정리 필요).

---

## 3. 단계별 유저 저니 매핑

> 표기: `📄 정적` / `📦 상수` / `💾 캐시` / `🧠 상태` · **읽기**=R, **쓰기**=W

### STEP 0 — 접근 게이트 (렌더 전)
| 액션 | R (읽기) | W (쓰기) | 프롬프트 |
|------|----------|----------|----------|
| 비밀번호 입력·제출 | — (하드코딩 `"1234"` 비교) | 🧠 `isAuthenticated` | — |
| (자동) 데이터 로드 | 📄 `curriculum.json`, `majors.json` | 🧠 `curriculumData`, `customMajorDB` | — |
| (자동) 검수 캐시 로드 | 💾 `MAJOR_INFO_CACHE` | 🧠 `majorInfoCache` | — |

### STEP 1 — 학생 정보 + 과목
| 액션(클릭/입력) | R | W | 프롬프트(모델) | 산출물 |
|------|----|----|----------------|--------|
| **목표 학과 선택** (`MajorCascadePicker`) | 📄 `majors.json` + 📦 `MAJOR_DB` | 🧠 `studentInfo.목표학과` (+패널 리셋) | — | — |
| **[학과 정보 AI 생성]** (`generateMajorInfo`) | 📄/📦 학과 기본정보 | 🧠 `editingMajorInfo`(검수 대기, **미저장**) | **`SYSTEM_MAJOR_INFO`** (Sonnet, 2048) | 학과 키워드/연구영역/인재상/추천탐구/주의사항 JSON |
| **[검수 승인]** (`approveMajorInfo`) | 🧠 `editingMajorInfo` | 💾 `MAJOR_INFO_CACHE` + 🧠 `majorInfoCache` | — | 승인된 학과정보 영속화 |
| **[검수 반려/캐시 삭제]** | — | 🧠/💾 해당 항목 제거 | — | — |
| **학년 선택** | — | 🧠 `studentInfo.학년` (1학년 여부 분기) | — | — |
| **과목 선택 토글** (`SubjectCascadePicker`) | 📄 `curriculum.json`(그룹핑) | 🧠 `selectedSubjects` | — | — |
| **커스텀 과목 추가** | — | 🧠 `selectedSubjects` | — | — |
| **[다음]** | — | 🧠 `step=2` | — | — |

### STEP 2 — 학생부 + 학교 환경
| 액션 | R | W | 프롬프트(모델) | 비고 |
|------|----|----|----------------|------|
| **학생부 PDF 업로드** (`handlePdfUpload`) | pdf.js(CDN) | 🧠 `pdfText` | **인라인 이름추출** (Haiku, 50) → 🧠 `studentInfo.이름` | ⚠️ **이미지 PDF는 차단**(텍스트 PDF만 허용) |
| **학교 창체/공시 자료 업로드** (`handleSchoolContextFileUpload`) | pdf.js | 🧠 `schoolContext[area].files` | — (업로드 시 호출 없음) | 이미지=base64(Vision용), 이미지PDF=페이지 이미지 변환(scale 2.5) |
| **영역 텍스트 입력** | — | 🧠 `schoolContext[area].text` / `clubName` | — | 자율/동아리/진로/학교계획 |
| **(1학년) 관심사 입력** | — | 🧠 `freshmanInterest` | — | 키워드3·희망직업·자유메모 |
| **탐구 난이도 선택** | 📦 `SCHOOL_TIERS`(`classifySchoolTier`) | 🧠 `schoolGoal`, `studentBurden` | — | 학교 tier는 목표학과에서 자동 산출 |
| **[프로파일 + 총론 생성]** | → STEP3 실행 | 🧠 `step=3` | (아래 STEP3) | `setStep(3); generateOverview()` |

### STEP 3 — 프로파일 + 총론 (`generateOverview`)
| 항목 | 내용 |
|------|------|
| **R** | 🧠 `studentInfo`·`selectedSubjects`·`pdfText`(또는 `parsedData`)·`schoolContext`(+이미지)·`freshmanInterest`·`schoolGoal`·`studentBurden` / 학과정보 `resolveMajorInfo`(💾→📄→📦 순) / 📦 `FACULTY_MAPPING`·`SCHOOL_TIERS`·`DIFFICULTY_LEVELS` |
| **프롬프트** | **`SYSTEM_OVERVIEW`** (또는 1학년 `_FRESHMAN`) · Sonnet · 8000 tok · 학생부/학교자료 이미지 첨부 |
| **W** | 🧠 `overview`, `profileContent`/`designContent`(`===== SECTION_SPLIT =====` 분리), `baseLevel`(정규식 `[학생부 평균 활동 Level: N]`), `finalLevel`(=max(base,user)), `authenticityWarning` |
| **후속 클릭** | **[진로 구체화로]** → 🧠 `step=4` |

### STEP 4 — 진로 구체화
| 액션 | R | W | 프롬프트(모델) |
|------|----|----|----------------|
| **(진입 자동)** `loadCareerExamples` | 🧠 목표학과 | 🧠 `careerExamples` | **`SYSTEM_INTERVIEW_CAREER_EXAMPLES`** (Haiku, 500) |
| **질문 3개 답변 입력** | — | 🧠 `stage1Answer1~3` | — |
| **[정체성 도출]** `submitFormAndFinalize`→`finalizeIdentity` | 🧠 답변3 + 목표학과 | 🧠 `identityStatement`, `interviewStage=stage_final` | **`SYSTEM_INTERVIEW_FINAL`** (Sonnet, 300) |
| **[AI로 수정]** `reviseIdentity` | 🧠 현재 정체성 + 명령 | 🧠 `identityStatement` 또는 `reviseRejection` | **`SYSTEM_INTERVIEW_REVISE`** (Sonnet, 400) |
| **[다시하기]** `restartInterview` | — | 🧠 인터뷰 상태 초기화 | — |
| **[건너뛰기]** `skipInterview` | — | 🧠 `interviewSkipped=true`, `identityStatement=""`, `step=5` → `generateSubjects()` | — |
| **[교과별 컨셉 생성]** | → STEP5 | 🧠 `step=5` | (아래 STEP5) |

### STEP 5 — 교과별 컨셉 + 내보내기 (`generateSubjects`)
| 액션 | R | W | 프롬프트(모델) |
|------|----|----|----------------|
| **(자동) 과목별 생성** (4개씩 청크 병렬) | 🧠 `overview`·`identityStatement`·`finalLevel`(📦 `DIFFICULTY_LEVELS`) + 📄 `curriculum.json`(과목 성취기준) + 학과/계열/학생부 컨텍스트 | 🧠 `subjectResults[과목]` | **`SYSTEM_SUBJECT`**(또는 `_FRESHMAN`) · Sonnet · 4500 · 과목당 1회 |
| **(자동) 계보 매핑** `mapTopicsToGenealogies` | 🧠 `overview`(계보 파싱) + `subjectResults`(주제 파싱) | 🧠 `genealogyData` | **`SYSTEM_GENEALOGY_MAPPING`** (Haiku, 4096) |
| **[과목 재생성]** `regenerateSubject` | 동일 컨텍스트 | 🧠 `subjectResults[과목]` 갱신 + 재매핑 | `SYSTEM_SUBJECT` (Sonnet, 4500) → `SYSTEM_GENEALOGY_MAPPING` |
| **[빈 계보 채우기]** `fillGenealogy` | 🧠 계보/과목 목록 | 🧠 `subjectResults` 갱신 + 재매핑 | **`SYSTEM_GENEALOGY_SUBJECT_PICK`**(Haiku, 512) → `SYSTEM_SUBJECT`(Sonnet, 4500) → `SYSTEM_GENEALOGY_MAPPING` |
| **결과 확인/내보내기** (`MarkdownRenderer`, `GenealogyMatrix`) | 🧠 `profileContent`·`designContent`·`subjectResults`·`genealogyData` | — | — |

---

## 4. 프롬프트 호출 시퀀스 (학생 1명 1회 완주 기준)

`N` = 이번 학기 선택 과목 수.

```
STEP1  (선택) SYSTEM_MAJOR_INFO            [Sonnet]  × (학과 검수할 때만)
STEP2  인라인 이름추출                      [Haiku]   × 1  (텍스트 PDF 업로드 시)
STEP3  SYSTEM_OVERVIEW(_FRESHMAN)          [Sonnet]  × 1  (8000 tok, 이미지 첨부 가능)
STEP4  SYSTEM_INTERVIEW_CAREER_EXAMPLES    [Haiku]   × 1  (진입 시)
       SYSTEM_INTERVIEW_FINAL              [Sonnet]  × 1  (정체성 도출)
       SYSTEM_INTERVIEW_REVISE             [Sonnet]  × 수정 횟수 (선택)
STEP5  SYSTEM_SUBJECT(_FRESHMAN)           [Sonnet]  × N  (4개씩 청크 병렬, 각 4500 tok)
       SYSTEM_GENEALOGY_MAPPING            [Haiku]   × 1  (자동)
       (재생성/빈계보 채우기)              [Sonnet+Haiku] × 사용자 액션마다
```
**비용 핵심**: Sonnet 호출이 최소 `1(총론) + 1(정체성) + N(과목)` 회. 과목이 8개면 Sonnet ~10회 + Haiku ~3회.
이미지 학생부·학교자료가 붙으면 입력 토큰이 크게 증가. → 모니터링/캐싱 필요(스펙문서 14장 8번).

---

## 5. 데이터 흐름 다이어그램 (요약)

```
[STEP1] 학과선택 ─(majors.json/MAJOR_DB)→ studentInfo
        └[AI생성]→ SYSTEM_MAJOR_INFO → editingMajorInfo ─[승인]→ 💾 MAJOR_INFO_CACHE
[STEP1] 과목선택 ─(curriculum.json)→ selectedSubjects
[STEP2] 학생부PDF → (pdf.js) → pdfText ─(인라인 Haiku)→ studentInfo.이름
        학교자료 → schoolContext(text/이미지)
        난이도 → (SCHOOL_TIERS) → schoolGoal/studentBurden
[STEP3] (모든 입력 + resolveMajorInfo + FACULTY_MAPPING + DIFFICULTY)
        → SYSTEM_OVERVIEW → overview → {profile, design, baseLevel, finalLevel}
[STEP4] 목표학과 → CAREER_EXAMPLES(예시)
        답변3 → INTERVIEW_FINAL → identityStatement (→ REVISE 수정)
[STEP5] (overview + identity + finalLevel + curriculum 성취기준)
        → SYSTEM_SUBJECT × N → subjectResults
        → GENEALOGY_MAPPING → genealogyData → 매트릭스 시각화
```

---

## 6. 정식 서비스 전환 시 필요한 DB 스키마 (제안)

현재 유저 저니의 산출물은 대부분 **휘발성 세션 상태**입니다. 아래는 유저 저니를 **영속화·재열람·다중 학생 관리**하기 위해 권장하는 최소 테이블 설계입니다. (관계형 기준, NoSQL이면 컬렉션으로 매핑)

| 테이블 | 대응 유저 저니 | 현재 저장소 → 이관 대상 | 핵심 컬럼(예) |
|--------|----------------|--------------------------|---------------|
| `consultants` | STEP0 로그인 | 하드코딩 비번 → 계정 | id, email, name, password_hash |
| `students` | STEP1 학생 생성 | 🧠 `studentInfo` | id, consultant_id, name, target_major, grade |
| `student_records` | STEP2 학생부 | 🧠 `pdfText`/`parsedData` | id, student_id, raw_text, parsed_json, source |
| `school_contexts` | STEP2 학교 환경 | 🧠 `schoolContext` | id, student_id, area, text, files(json) |
| `freshman_interests` | STEP2 1학년 | 🧠 `freshmanInterest` | id, student_id, keywords, job, memo |
| **`majors`** | STEP1 학과 마스터 | 📄 `majors.json` | univ, dept, category, region |
| **`major_info`** | STEP1 학과 상세(AI+검수) | 💾 `MAJOR_INFO_CACHE` | major_key, keywords, research_areas, 인재상, status, reviewed_by |
| **`curriculum_standards`** | STEP1·3·5 성취기준 | 📄 `curriculum.json` | subject, 교과군, 코드, 단원, 성취기준, 기본/융합키워드 |
| `roadmap_sessions` | STEP3~5 한 번의 설계 | (없음) | id, student_id, semester, school_goal, student_burden, base_level, final_level |
| `overviews` | STEP3 결과 | 🧠 `profileContent`/`designContent` | session_id, profile_md, design_md, raw_md |
| `career_identities` | STEP4 정체성 | 🧠 `identityStatement` | session_id, statement, skipped |
| `subject_results` | STEP5 각론 | 🧠 `subjectResults` | session_id, subject, result_md, level |
| `genealogies` / `genealogy_mappings` | STEP5 계보 | 🧠 `genealogyData` | session_id, name, summary / subject, topic_index, genealogy |
| `ai_call_logs` | 전 단계 | (없음) | session_id, prompt_name, model, tokens_in/out, latency, cost |

**요점 3가지**
1. `📄 정적 JSON` 2개(`majors`, `curriculum`)와 `💾 캐시` 1개(`major_info`)는 **관리자 화면 + DB 테이블**로 승격해야 함(수동 재배포 제거).
2. `roadmap_sessions`를 중심으로 STEP3~5 산출물을 묶어 **재열람·이력 관리** 가능하게.
3. `ai_call_logs`로 **비용·품질 추적**(현재 전무).

---

## 7. 주의·미사용 항목 (개발 시 혼선 방지)

- ⚠️ **`SYSTEM_PARSE` / `runParse`**: 학생부를 구조화 JSON으로 파싱하는 프롬프트가 **정의만 되어 있고 UI 버튼에 연결되어 있지 않음.** 따라서 `parsedData`는 대개 `null`이고, STEP3·5는 **원문 `pdfText`를 그대로** AI에 전달함. 구조화가 필요하면 이 훅을 STEP2에 연결해야 함.
- ⚠️ **`SYSTEM_PROFILE`, `SYSTEM_INTERVIEW_DYNAMIC_QUESTION`**: 구버전 잔재로 현재 호출 경로 없음.
- ⚠️ **이미지 학생부 차단**: 메인 학생부(`handlePdfUpload`)는 이미지/스캔 PDF를 거부(텍스트 PDF만). 반면 **학교 환경 자료**는 이미지·이미지PDF를 Vision으로 처리함. (스펙문서 본문의 "이미지 PDF fallback" 설명은 학교 자료·구버전 기준이므로 이 차이에 유의)
- 🔴 **`window.storage` 미작동**: 일반 웹 배포 시 `💾 캐시` 3종이 모두 조용히 실패 → 학과 검수정보가 세션마다 사라짐. `majors.json`/`curriculum.json`은 fetch로 채워지므로 앱은 동작하나, **검수 결과는 저장 안 됨.**
- ⚠️ **백엔드 URL/모델 하드코딩**: `callClaude`의 엔드포인트·기본 모델이 코드에 박혀 있음(환경변수화 필요).

---

*본 문서는 코드(`sebak_designer_v55.jsx`) 정적 분석 기준입니다. 프롬프트·플로우 변경 시 2·3장을 함께 갱신하세요.*
