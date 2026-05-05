# Ontology Demo for Korean Hi-Tech MFG — Design Spec

| Field | Value |
|---|---|
| Spec date | 2026-05-05 |
| Status | Draft (awaiting user review) |
| Target region | ap-northeast-2 (Seoul) |
| Target audience | 한국 Hi-Tech MFG 영업 PoC 데모 (60분 단일 세션) |
| 1차 영업 타겟 | LG전자 그룹 (재사용: 삼성/SK/소니/Whirlpool 등 종합제조사) |
| 가상 회사 | AMZN Tech (LG 브랜드 비노출) |
| 미러 대상 | `/home/ec2-user/my-project/ontology-for-retail` (2026-04-25 design spec) |
| 참조 IaC | https://github.com/whchoi98/ec2_vscode/tree/main/infra-cdk |

---

## 1. Goal

> **한국 Hi-Tech 종합제조사의 4 사업부(가전·TV·전장·부품)를 가로지르는 BOM·SCM·품질·규제·ESG를 한 그래프로 묶어, 표준 기반 온톨로지 + Bedrock RAG + AgentCore 에이전트가 5명의 실무 페르소나에게 어떻게 가치를 제공하는지를 60분 안에 보여주는 영업/PoC 데모를 구축한다.**

청중에게 "AWS Bedrock + AgentCore + Neptune 조합으로 hi-tech mfg 도메인에서 가능"이라는 구체적 확신을 전달한다. 가상 회사 **AMZN Tech**로 추상화하여 LG 1차 영업과 동시에 삼성·SK·소니·Whirlpool 등 다른 종합제조사 영업에도 동일 데모를 재사용한다.

### 1.1 Non-Goals

- 실제 LG / 삼성 등 고객 BOM 데이터 사용 (NDA 환경 PoC가 아님).
- 5만+ Component / 1만+ Supplier 스케일 검증 (~3,000 Component 데모; 스케일은 follow-up PoC).
- Production-grade 멀티 테넌시·과금·결제·온프레미스 ERP 통합.
- SageMaker 기반 hi-tech 도메인어 fine-tune (이번 데모에서 제외, 확장 카드).
- Q Business 통합 (제외, 확장 카드).
- 자동차 기능안전 ASIL 인증 자체 (ISO 26262 기반 시연만, 실제 인증 워크플로우 X).

### 1.2 Success Criteria

1. 60분 내에 12 시나리오(A–L) × 5 페르소나(Buyer/Engineer/Quality/SCM/Plant) 라이브 시연 끊김 없음.
2. 시연 직후 follow-up 미팅 또는 PoC 요청 1건 이상 발생 (영업 KPI).
3. AWS Bedrock + AgentCore + Neptune 조합이 한 흐름에 자연스럽게 등장.
4. p95 검색 응답 < 3초, 에이전트 첫 토큰 < 2초.
5. 5 페르소나 모두에 명확한 가치 메시지 — "내 역할에도 가치 있다" 균형.
6. retail 데모와 동시 운영 시 상호 영향 0 (VPC 공유 환경에서 격리 검증).

---

## 2. Audience

| 페르소나 | 관심사 | 데모 후크 |
|---|---|---|
| **Buyer** (구매팀) | 협력사 평가, 단가 협상, 대체 부품 | C 인사이트, F 대체, G 단가, I 협력사 RFM |
| **Engineer** (R&D / 설계) | 사양 매치, 규제 검증, BOM 설계 | A 검색, D 스펙 매치, E 규제, J 8D/RCA |
| **Quality** (품질) | 인시던트 대응, 8D 작성, 규제 위반 사전 차단 | E 규제, I 협력사 RFM, J 8D/RCA |
| **SCM** (공급망) | 글로벌 lane, 재고, ESG/탄소 | G 재고, H 글로벌 lane, K ESG/CBAM |
| **Plant** (생산/공장) | 가동률, 정비, 8D, ESG | H lane, J 8D, K ESG, L PdM/IoT |

청중 구성: **혼합 단일 세션 60분** — 임원·실무자 같이 참석. 페르소나 5명을 차례로 시연하면서 임원에게는 통합 비즈니스 가치, 실무자에게는 개별 역할 가치를 동시에 전달한다.

---

## 3. Decision Log

브레인스토밍 세션(2026-05-05)에서 합의된 9개 핵심 결정.

| # | 결정 영역 | 채택안 |
|---|---|---|
| D1 | 사업부 범위 | 4 사업부 통합 — 가전(H&A) · TV(HE) · VS 전장 · 부품(LG Innotek + LG Magna ePT JV) |
| D2 | 데이터 전략 | 순수 합성. 가상 회사명 **AMZN Tech**, 가상 제품 라인 5종 (SmartFridge X9 / VisionOLED 88 / AutoCockpit C7 / FC-BGA Gen5 / eDrive 350iPT) |
| D3 | 데모 spine | 사용자 페르소나 5명 (Buyer / Engineer / Quality / SCM / Plant) — retail 패턴 재사용 |
| D4 | 시나리오 범위 | 12 시나리오 — retail 8개(A–H) + mfg 4개 신규(I 협력사 RFM, J 8D/RCA, K ESG/CBAM, L PdM/IoT) |
| D5 | SCM 지리 범위 | 글로벌 종합 — KR / CN / VN / MX / PL / US / IN. IRA · USMCA · EU CBAM lane-reroute 시연 가능 |
| D6 | 청중·길이 | 혼합 단일 세션, **60분**, 평균 5분/시나리오 |
| D7 | 빌드 접근 | mfg-rich 22-class ontology, 풀 표준 스택 (JEDEC/IPC/AEC-Q/IATF/ISO 26262/REACH/RoHS/CBAM/IRA/USMCA), 빌드 8–10주 |
| D8 | 인프라 공유 | retail의 기존 VPC (`10.20.0.0/16`) · Subnets · NAT GW · 6 VPC Endpoints · Route 53 hosted zone 공유. mfg는 SG·ALB·데이터·인증·컴퓨트·엣지 모두 신규 |
| D9 | Cognito 시드 | `admin@whchoi.net` (admin 그룹) / `demo@whchoi.net` (페르소나 5명 시연용). PW `***ROTATED***` 영구 고정 |

**Why (가상 회사 AMZN Tech 추상화 이유):**
LG 1차 영업 + 삼성·SK·소니·Whirlpool 재사용을 단일 빌드로 충족. NDA 회피하면서 LG 임원에게는 hi-tech 종합제조 도메인 친근감을 유지 (제품 라인 5종이 실제 LG 사업부 1:1 대응이라 인지 부담 낮음).

**How to apply:**
- 12 시나리오의 모든 화면에 페르소나 5명이 메인/보조로 등장 — D3 spine 일관성
- AWS 리소스 prefix 일관 적용: `ontology-mfg-dev-*`
- 데이터 라벨은 모두 AMZN Tech 가상 회사 표면, BOM 코드는 `AMZN-{division}-{model}` 패턴
- 향후 sub-domain 확장(2차전지·디스플레이·반도체 장비) 시 라벨만 추가, 22 클래스 그대로

---

## 4. Demo Flow (60분 권장)

### 4.1 시나리오 정의 (retail 8 변환 + mfg 4 신규)

| # | 라벨 | retail 대응 | 핵심 시연 |
|---|---|---|---|
| **A** | Semantic Search | A 동일 | 자연어로 부품/제품 검색 — "차량용 -40°C 보장 BGA 패키지" |
| **B** | Conversational Agent | B 동일 | 멀티턴 + AgentCore Memory + Guardrails (IP 기밀 누설 차단 시연) |
| **C** | Buyer/Quality Insights | C 변환 (MD→Buyer/Quality) | Code Interpreter — "지난 12주 1차 협력사 평균 OTD" 차트 자동 생성 |
| **D** | Spec Match | D 변환 (Persona→Spec) | "Cockpit C7에 들어갈 8" QHD 디스플레이 모듈 후보 5개" |
| **E** | Compliance Lens | E 변환 (Safety→Compliance) | REACH-SVHC + RoHS + AEC-Q 자동 검증, 위반 SKU 즉시 차단 |
| **F** | Substitute Finder | F 동일 | EOL 부품 → 동일 사양 대체품 추천 (단가·인증·재고 비교) |
| **G** | Price/Availability | G 동일 | 단가/재고/Lead Time을 4개 협력사 가로 비교 |
| **H** | Global SCM Lane | H 변환 (한국→글로벌) | KR/CN/VN/MX/PL/US/IN choropleth + IRA/USMCA/CBAM lane reroute 라이브 |
| **I** | Supplier RFM | mfg 신규 | 1·2차 협력사 RFM (납기 R / 품질 F / 응답성 M) 점수 + 위험 협력사 alert |
| **J** | 8D/RCA | mfg 신규 | 품질 인시던트 → Claude가 8D 리포트 자동 작성, RootCause 노드 그래프 |
| **K** | ESG/CBAM | mfg 신규 | Plant별 Scope 1·2·3 + EU CBAM 탄소 부담 비용 계산기 |
| **L** | PdM/IoT | mfg 신규 | OpenSearch 시계열 + 임계 초과 라이브 알람 + 정비 권고 |

### 4.2 페르소나 × 시나리오 매트릭스 (● Primary, ○ Secondary)

|  | A 검색 | B 대화 | C 인사이트 | D 스펙 | E 규제 | F 대체 | G 단가 | H Lane | I RFM | J 8D | K ESG | L PdM |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| **Buyer** | ● | ● | ● | ○ | ○ | ● | ● | ○ | ● | – | – | – |
| **Engineer** | ● | ● | – | ● | ● | ● | – | – | – | ● | – | – |
| **Quality** | ○ | ○ | ● | ○ | ● | ○ | – | – | ● | ● | ○ | ○ |
| **SCM** | ○ | ○ | ● | – | – | – | ● | ● | ● | – | ● | – |
| **Plant** | – | ○ | – | – | – | – | ○ | ● | – | ● | ● | ● |

각 페르소나가 최소 4개 시나리오의 Primary 화면에 등장 → "내 역할에도 가치 있다" 메시지 균형.

### 4.3 60분 타임라인 (시연자 안내)

```
[0:00–0:03] 오프닝 — AMZN Tech 5 페르소나 / 5 제품 라인 / 4 사업부 구조 소개
[0:03–0:08] A 의미 검색      Buyer 시점 (5분)   ← Cytoscape wow 모멘트
[0:08–0:15] B 대화 에이전트  Engineer 시점 (7분) ← Memory + Guardrails + Tool-use
[0:15–0:20] C 인사이트       Quality 시점 (5분)  ← Code Interpreter 차트
[0:20–0:24] D 스펙 매치      Engineer 시점 (4분)
[0:24–0:29] E 규제 검증      Quality 시점 (5분)  ← REACH/RoHS/AEC-Q 라이브
[0:29–0:34] F 대체 부품      Engineer+Buyer (5분) ← EOL 대체
[0:34–0:38] G 단가/재고      Buyer+SCM (4분)
[0:38–0:44] H 글로벌 lane    SCM+Plant (6분)     ← IRA/USMCA/CBAM 리라우팅 라이브
[0:44–0:48] I 협력사 RFM     Buyer+Quality+SCM (4분)
[0:48–0:53] J 8D/RCA         Engineer+Quality (5분) ← 자동 8D 리포트 생성
[0:53–0:57] K ESG/CBAM       SCM+Plant (4분)     ← 탄소 비용 계산기
[0:57–1:00] L PdM/IoT        Plant (3분)         ← 임계 알람
[1:00] 클로저 — Q&A
```

### 4.4 핵심 wow 모멘트

| 시각 | 시나리오 | wow |
|---|---|---|
| 0:03–0:08 | A | 자연어 → 그래프 즉각 시각화 (Cytoscape 1-hop subgraph) |
| 0:08–0:15 | B | Memory + Guardrails + Tool-use 풀스택을 한 대화 안에 시연 |
| 0:38–0:44 | H | IRA 발효 → MX→US lane이 그래프 위에서 실시간 재배치, CBAM 탄소비용 즉시 갱신 |
| 0:48–0:53 | J | "용접부 균열" 인시던트 → Claude가 8D 8단계 리포트를 라이브 작성, RootCause 노드 그래프 부각 |

---

## 5. Architecture

### 5.1 시스템 다이어그램

```
[User · Browser]
       │ HTTPS
       ▼
[CloudFront Distribution] (mfg 신규)  →  https://mfg-ontology.whchoi.net
       │
       ├── Lambda@Edge (us-east-1, mfg 신규) ──→ Cognito User Pool (Seoul, mfg 신규, JWT 쿠키 검증)
       │   (cognito-at-edge 패턴, retail와 동일)
       │
       └── Origin = ALB (HTTP, Seoul, mfg 신규)
            (ALB SG ingress = AWS Managed Prefix List
              "com.amazonaws.global.cloudfront.origin-facing")
            │
            ├──/_next, /, /(buyer|engineer|quality|scm|plant)/* ─→ ECS web (Next.js 14, ARM64)
            └──/api/*                                          ─→ ECS api (FastAPI, ARM64)
                                                                  │
                                                                  ├─ Bedrock Runtime (Claude Sonnet 4.6 / Haiku 4.5, Cohere Embed v4)
                                                                  ├─ Bedrock Knowledge Bases (mfg 신규)
                                                                  ├─ Bedrock Reranker (Cohere Rerank v3, Cross-Region IP)
                                                                  ├─ Bedrock Guardrails (mfg 신규: IP기밀·경쟁사·규제·유해화학 4 토픽)
                                                                  ├─ AgentCore Runtime / Memory / Gateway
                                                                  │   / Code Interpreter / Browser
                                                                  ├─ Neptune Serverless (mfg 신규, 1–8 NCU, 베이스라인 2)
                                                                  ├─ OpenSearch Serverless (mfg 신규, Nori + KNN + Telemetry 시계열)
                                                                  ├─ Aurora PostgreSQL v2 (mfg 신규, 세션·로그·BOM 캐시·8D 리포트)
                                                                  └─ S3 (mfg 신규 KMS — raw-docs / synthetic / snapshots / uploads)
```

**모든 application 자원은 mfg 신규.** 네트워킹 인프라(VPC·subnet·NAT·VPC Endpoints·Route 53 zone)만 retail 공유.

### 5.2 Network/Edge Topology (retail 공유)

| 항목 | 값 | 출처 |
|---|---|---|
| VPC | `10.20.0.0/16` | retail의 기존 VPC, `Vpc.fromLookup(vpcId: importValue('ontology-retail-dev-vpc-id'))` |
| AZ | 2 (ap-northeast-2a, 2c) | retail subnet 그대로 |
| Subnets | Public /24×2 (ALB) · Private-Egress /24×2 (Fargate/Aurora/Neptune) | retail 재사용. IP 잔여 ~440/500 |
| NAT | 1 (retail public subnet 단일 NAT) | retail 재사용 — mfg는 라우트 자동 적용 |
| VPC Endpoints (재사용) | S3 Gateway, ECR API/DKR, CW Logs, Secrets Manager, Bedrock Runtime, Neptune Interface | retail vpce-sg가 VPC CIDR 허용 → mfg ENIs 자동 통과 |
| Route 53 | `whchoi.net` hosted zone | retail와 공유, mfg는 `mfg-ontology.whchoi.net` A/AAAA record만 추가 |

### 5.3 Security Group Matrix (mfg 신규)

| SG | Ingress | Note |
|---|---|---|
| `mfg-alb-sg` | CloudFront managed prefix list, port 80 | 참조 repo 패턴 |
| `mfg-web-sg` | `mfg-alb-sg`, port 3000 | Next.js |
| `mfg-api-sg` | `mfg-alb-sg`, port 8000 | FastAPI |
| `mfg-aurora-sg` | `mfg-api-sg`, port 5432 | mfg 데이터 격리 |
| `mfg-neptune-sg` | `mfg-api-sg`, port 8182 | Gremlin/openCypher |
| (retail의 vpce-sg) | VPC CIDR `10.20.0.0/16`, port 443 | 변경 없음 — mfg ENIs 자동 통과 |

retail의 어떤 SG도 변경하지 않음 — mfg는 retail VPC 안의 새 layer.

### 5.4 ALB Listener Rules (mfg 전용 ALB)

```
Listener :80
  Rule 1 (priority 10): path-pattern "/api/*"   → tg-mfg-api  (port 8000, target type ip)
  Rule 2 (default):                              → tg-mfg-web (port 3000, target type ip)
Health checks:
  tg-mfg-web: GET /api/health-web (Next.js route handler)
  tg-mfg-api: GET /healthz (FastAPI)
```

> 데모 단계는 ALB 리스너 80(HTTP). CloudFront ↔ ALB는 AWS 백본 + Origin Shield(선택)로 보호. 운영 격상 시 ACM + ALB :443.

---

## 6. Component Catalog

### 6.1 Edge / Auth (mfg 신규)

| Component | Region | Purpose |
|---|---|---|
| Route 53 record | global (whchoi.net zone 공유) | `mfg-ontology.whchoi.net` A/AAAA → CloudFront |
| CloudFront Distribution | global | HTTPS, 캐시 정책 (정적 vs 동적 분리), retail와 별개 distribution |
| ACM Certificate | **us-east-1** | `mfg-ontology.whchoi.net` |
| Lambda@Edge | **us-east-1** | Viewer Request: Cognito JWT 쿠키 검증, 미인증 시 Cognito Hosted UI로 302 |
| Cognito User Pool | ap-northeast-2 | admin-managed users, self-signup off, 그룹: `buyer`/`engineer`/`quality`/`scm`/`plant`/`admin` |
| Cognito Hosted UI | ap-northeast-2 | 한국어 라벨 |
| 시드 사용자 | – | `admin@whchoi.net` (admin), `demo@whchoi.net` (페르소나 5명 시연용). PW `***ROTATED***` 영구 |
| WAF (선택) | global (CF) | rate limit (분당 IP당 100), Geo (KR + 화이트리스트), AWS Managed Common Rules |

### 6.2 Compute (mfg 신규)

| Component | Spec | Note |
|---|---|---|
| ECS Cluster | Fargate (default, no FARGATE_SPOT) | `ontology-mfg-dev-cluster` |
| Service `web` | Next.js 14, ARM64, 0.5 vCPU / 1 GB, 2 task | App Router, Tailwind, shadcn/ui, Cytoscape.js, react-simple-maps, Pretendard |
| Service `api` | Python 3.12 + FastAPI, ARM64, 1 vCPU / 2 GB, 2 task | boto3, Bedrock SDK, AgentCore SDK, gremlin/openCypher 클라이언트 |
| ECR | 2 repos (`ontology-mfg-dev-web`, `ontology-mfg-dev-api`) | scan-on-push |
| ALB | mfg 전용 ALB | `mfg-ontology.whchoi.net` 도메인 분리 |

### 6.3 Data (mfg 신규)

| Component | Spec | Purpose |
|---|---|---|
| Neptune Serverless | NCU 1–8 (베이스라인 **2 NCU**) | Property Graph + openCypher + SPARQL, 22 클래스 ~10K 노드 / ~30K 엣지 |
| Aurora PostgreSQL Serverless v2 | 0.5–2 ACU | 사용자 세션, 검색/대화 로그, BOM 캐시(자주 쓰는 BFS 결과), 8D 리포트 본문 |
| OpenSearch Serverless | 2 OCU 최소 (1 indexing + 1 search), Nori 분석기 | KB 백엔드 + 앱 검색 (Vector + BM25 RRF) + Telemetry 시계열 인덱스 |
| S3 buckets (KMS) | `raw-docs`, `synthetic-data`, `ontology-snapshots`, `uploads` | KB 소스, 합성 데이터, 스냅샷, 8D 첨부 파일 |
| KMS CMK ×5 | s3 / aurora / neptune / os / logs | mfg 전용 키, retail 키와 분리 |

### 6.4 AWS AI

| Service | Use |
|---|---|
| Bedrock Runtime | Claude Sonnet 4.6 (대화/추론), Haiku 4.5 (라이트), Cohere Embed Multilingual v4 (임베딩) |
| Bedrock Knowledge Bases (mfg 신규) | 비정형 텍스트 RAG (사양서·8D 리포트·인증서·CBAM 가이드라인), 벡터 백엔드 = OpenSearch Serverless |
| Bedrock Reranker | Cohere Rerank 3, **Cross-Region Inference Profile** (호출 ARN은 Seoul, 백엔드 us-east-1/us-west-2) |
| Bedrock Guardrails (mfg 신규, 4 토픽) | ① IP/기밀(BOM 노출·협력사 단가 비공개) ② 경쟁사 비방 ③ 규제 위반 권유 (REACH-SVHC/RoHS) ④ 유해 화학물질 (CMR 1A/1B) |
| AgentCore Runtime | 멀티턴 추론, 도구 오케스트레이션 (12 시나리오 모두) |
| AgentCore Memory | session(short-term) + 7일 long-term, mfg 전용 namespace |
| AgentCore Gateway | 도구 노출: `kb.retrieve`, `neptune.query`, `search.semantic`, `code.run`, `compliance.check`, `eight_d.write`, `lane.reroute`, `carbon.calc`, `rfm.score` |
| AgentCore Code Interpreter | 샌드박스 pandas/matplotlib (시나리오 C·K 차트 + NanumGothic 한글 글리프) |
| AgentCore Browser | 외부 EOL/단가 모니터 (시연 시점 가용성 재확인, 미가용 시 합성 폴백) |

### 6.5 Observability / Security (mfg 신규)

| Component | Use |
|---|---|
| CloudWatch Container Insights | ECS 메트릭/로그 |
| CloudWatch Logs | 모든 Fargate, Lambda@Edge, ALB |
| X-Ray | Web → API → Bedrock/Neptune/OpenSearch trace |
| KMS CMK ×5 | S3, Aurora, Neptune, OpenSearch, CloudWatch Logs (mfg 전용) |
| Secrets Manager | Aurora 비밀번호, 외부 API 키 |
| CloudTrail | Bedrock 데이터 이벤트, Cognito 이벤트, S3 30일 보존 (retail trail와 분리 또는 공유 — 운영자 선택) |

---

## 7. Data Flows

### 7.1 Scenario A — Semantic Search

```
User → CloudFront → Lambda@Edge (JWT)
     → ALB → web (Next.js render)
     → User input: "차량용 -40°C 보장 BGA 패키지"
     → POST /api/search { q, persona }
        ├─ embedding.py    : Bedrock InvokeModel (Cohere Multilingual v4)
        ├─ search.py
        │   ├─ OpenSearch hybrid (Nori BM25 + KNN, top 100)
        │   └─ Bedrock Reranker (Cross-Region IP, top 10)
        ├─ neptune.py      : openCypher MATCH (Component)-[:CONFORMS_TO]->(:Standard {id:"AEC-Q100"})
        │                    + 1-hop subgraph (Supplier·Plant·Substance)
        └─ guardrails.py   : 응답 IP/기밀 스크럽 (BOM 좌표·단가 마스킹)
     ← { hits, subgraph }
web → Cytoscape.js 그래프 + 결과 카드 동시 렌더
```

### 7.2 Scenario B — Conversational Agent

```
User → POST /api/chat (SSE stream) { session_id, msg, persona }
api
  ├─ memory.retrieve(session_id, namespace="mfg") → 단기/장기 컨텍스트
  ├─ AgentCore Runtime.invoke
  │   ├─ Claude Sonnet 4.6 추론
  │   ├─ Tool calls via Gateway:
  │   │   ├─ search.semantic(q)              ── Scenario A 파이프라인 재사용
  │   │   ├─ kb.retrieve(q)                  ── Bedrock KB
  │   │   ├─ neptune.query(cypher)           ── 그래프 질의
  │   │   ├─ compliance.check(component_id)  ── E 시나리오 엔진 재사용
  │   │   └─ memory.write(facts)
  │   └─ Guardrails 응답 후처리 (mfg 4 토픽)
  └─ stream chunks back (SSE)
web → 채팅 UI + 우측 백엔드 로그 패널 (tool call 실시간) + Cytoscape.js 부각
```

### 7.3 Scenario H — Global SCM Lane (lane reroute 라이브)

```
SCM → /(scm)/lane "IRA 발효 가정 — MX→US lane 재계산"
api → AgentCore Runtime
       ├─ Tool: lane_router.simulate(event="IRA_2026", scope="MX_US")
       │   ├─ neptune: 영향받는 (:TradeLane)-[:SUBJECT_TO]->(:Regulation{id:"IRA"}) 추출
       │   ├─ neptune: 대체 lane 후보 (가중치 = 관세 + lead time + CBAM 탄소비용)
       │   └─ carbon_calc.recompute(new_lanes) — Scope 3 재산정
       ├─ Tool: customs_calc(lane, hs_code) — 관세 노출액 계산
       └─ stream: lane reroute 결정 + 비용 영향
web → SCMMap (글로벌 choropleth) 위에 lane 색상 / 굵기 라이브 변경
       + KPI strip (CBAM 탄소부담, 관세 노출액, lead time p95) 즉시 갱신
```

### 7.4 Scenario J — 8D/RCA 자동 작성

```
Quality → /(quality)/eight-d "BGA 패키지 솔더볼 균열 인시던트 #INC-2026-0412"
api → AgentCore Runtime + Code Interpreter (필요 시)
       ├─ neptune.query: (:QualityIncident {id:"INC-2026-0412"})-[:ABOUT]->(:Component) 1-hop
       ├─ kb.retrieve: 유사 8D 리포트 + JEDEC JESD22 신뢰성 가이드
       ├─ Tool: eight_d_writer.draft(incident, similar_reports, standards)
       │   └─ Claude Sonnet 4.6 — 8D 8단계 (D1팀구성~D8공유) 템플릿 강제
       ├─ neptune.write: (:EightDReport)-[:ADDRESSES]->(:QualityIncident)
       │                  + (:EightDReport)-[:IDENTIFIES]->(:RootCause)
       │                  + (:RootCause)-[:LINKED_TO]->(:Supplier|:Component|:Plant)
       └─ stream: 8D 리포트 본문 (마크다운) + RootCause 그래프 JSON
web → 좌: 8D 리포트 마크다운 라이브 작성 / 우: Cytoscape RootCause 그래프 부각
```

### 7.5 Scenario K — ESG/CBAM 탄소 부담

```
SCM → /(scm)/esg "Plant별 Scope 1·2·3 + EU 수출 시 CBAM 부담"
api → AgentCore Code Interpreter
       ├─ Tool: opensearch.aggs (Telemetry · MaintenanceEvent · Plant 가동) → DataFrame
       ├─ Tool: carbon_calc.scope_1_2_3(plant_id, period)
       │   ├─ Scope 1: 직접 배출 (천연가스 · 디젤)
       │   ├─ Scope 2: 전력 (지역별 전력 mix) 
       │   └─ Scope 3: 운송 lane × 운송수단 × 거리 + Supplier upstream
       ├─ Tool: cbam_calc(plant_id, lane_id, hs_code) — EU 탄소국경 부담액
       ├─ Code Interpreter: pandas 분석 + matplotlib 차트(PNG, NanumGothic)
       └─ neptune.query: 결과 Plant → CarbonScope 1-hop 드릴다운
web → 차트 인라인 + KPI 카드 + Cytoscape Plant-CarbonScope 그래프
```

### 7.6 LLM 자동 추출 코너 (시나리오 보조)

```
Engineer/Quality → 부품 사양서 PDF 업로드 → POST /api/ingest/pdf
api → Textract/pdfplumber → Claude (structured output, 22 클래스 schema)
       → 검증 → Neptune 적재 → KB sync → 라이브 그래프 갱신
       → 시연 멘트: "신규 부품 1개가 시연 중 그래프에 등장"
```

---

## 8. Ontology Data Model

### 8.1 Core Classes (22, 6 그룹)

| 그룹 | 클래스 | 역할 |
|---|---|---|
| **BOM 계층** (4) | `Product` | 완제품 (5 라인 플래그십 + 보조 SKU) |
|  | `Module` | 어셈블리·모듈 (디스플레이 모듈, 컴프레서 모듈, 인버터 모듈 등) |
|  | `Component` | 개별 부품 (IC·수동소자·기구물·반도체 패키지 등) |
|  | `RawMaterial` | 원자재 (실리콘 웨이퍼, 구리, 알루미늄 등) |
| **Supply 양면** (5) | `Manufacturer` | 자체 4 사업부 (AMZN H&A · HE · VS · Innotek+Magna) |
|  | `Supplier` | 1차 협력사 |
|  | `SubSupplier` | 2차 협력사 |
|  | `CustomerAccount` | B2B OEM 고객 (Global Auto OEM · Tier-1 · 가전 유통 · 통신사) |
|  | `Plant` | 공장·생산 거점 (자체 + 협력사) |
| **Geo / 운송** (2) | `Region` | 7개국 (KR/CN/VN/MX/PL/US/IN) |
|  | `TradeLane` | multimodal 운송 lane (해상/항공/철도/육상) |
| **표준 / 규제** (4) | `Standard` | 표준 정의 (JEDEC/IPC/AEC-Q/IATF/ISO 26262 등) |
|  | `Certification` | 특정 부품·plant이 받은 인증 (만료일 포함) |
|  | `Regulation` | 규제 (REACH-SVHC/RoHS/CBAM/IRA/USMCA) |
|  | `Substance` | CAS-등록 화학물질 (위험물질 포함) |
| **품질** (3) | `QualityIncident` | 품질 인시던트 (현장 발견·고객 클레임) |
|  | `EightDReport` | 8D 리포트 (D1~D8 8단계) |
|  | `RootCause` | 근본 원인 (5-Why·Ishikawa) |
| **운영 / ESG** (4) | `Telemetry` | IoT 센서 메타데이터 (시계열 본문은 OS·Aurora) |
|  | `MaintenanceEvent` | 정비 이벤트 (PM·CM·PdM) |
|  | `ESGIndicator` | ESG 지표 (수자원·폐기물·재해·다양성 등) |
|  | `CarbonScope` | Scope 1/2/3 탄소 배출 |

### 8.2 Core Relations (Property Graph, openCypher)

```
// BOM 계층 (4단)
(:Product)-[:HAS_MODULE]->(:Module)
(:Module)-[:CONSISTS_OF {qty}]->(:Component)
(:Component)-[:MADE_OF {ratio}]->(:RawMaterial)

// Supply 양면 (자사 ↔ 협력사 ↔ OEM 고객)
(:Product)-[:MANUFACTURED_BY]->(:Manufacturer)
(:Manufacturer)-[:OPERATES]->(:Plant)
(:Plant)-[:LOCATED_IN]->(:Region)
(:Component|:Module)-[:SUPPLIED_BY {tier:1, leadtime, otd}]->(:Supplier)
(:Supplier)-[:SUB_SUPPLIES {tier:2}]->(:SubSupplier)
(:Product)-[:SOLD_TO {volume, year, contract_id}]->(:CustomerAccount)

// Geo / 운송 (lane 양끝 + 규제 적용)
(:TradeLane)-[:CONNECTS]->(:Region)              // origin·dest
(:Plant)-[:SHIPS_VIA]->(:TradeLane)
(:TradeLane)-[:SUBJECT_TO]->(:Regulation)        // IRA/USMCA/CBAM

// 표준 / 규제 / 화학
(:Component)-[:CONFORMS_TO]->(:Standard)
(:Plant|:Component)-[:CERTIFIED_BY {expires}]->(:Certification)
(:Component)-[:CONTAINS_SUBSTANCE {ppm}]->(:Substance)
(:Substance)-[:REGULATED_BY]->(:Regulation)

// 품질 (인시던트 → 8D → 근본원인 → 책임 주체)
(:QualityIncident)-[:ABOUT]->(:Component|:Product|:Plant)
(:EightDReport)-[:ADDRESSES]->(:QualityIncident)
(:EightDReport)-[:IDENTIFIES]->(:RootCause)
(:RootCause)-[:LINKED_TO]->(:Supplier|:Component|:Plant)

// 운영 / ESG
(:Telemetry {sensor_id, type})-[:FROM]->(:Plant|:Component)
(:MaintenanceEvent {kind: "PM"|"CM"|"PdM"})-[:ON]->(:Component|:Plant)
(:ESGIndicator)-[:MEASURED_AT]->(:Plant)
(:Plant)-[:EMITS {scope, period}]->(:CarbonScope)
```

### 8.3 Standard → Korean Adapter Mappings

| 표준 / 규제 | 도메인 | 한국 어댑터 | 시나리오 |
|---|---|---|---|
| **JEDEC** (JESD22 신뢰성, MO-220 BGA) | 반도체 패키지 (Innotek FC-BGA) | KS C IEC | A 검색, D 스펙, E 규제 |
| **IPC-A-610** (PCB 조립 기준) | 전 사업부 PCB | KS C 9000 시리즈 (해당 시) | E 규제, J 8D |
| **AEC-Q100/200** (자동차 IC/수동소자 신뢰성) | VS, Innotek 자동차용 | – (글로벌 표준 직접 사용) | E 규제, F 대체 |
| **IATF 16949** (자동차 품질경영) | VS, Magna ePT | – (인증 기관 KAB) | I RFM, J 8D |
| **ISO 26262** (자동차 기능안전 ASIL A–D) | VS 전장, Magna ePT | – | E 규제, J 8D |
| **ISO 9001** | 전 사업부 기본 | KS Q ISO 9001 | I RFM |
| **ISO 14001** (환경경영) | 전 사업부 | KS I ISO 14001 | K ESG |
| **REACH-SVHC** (EU 화학물질) | 전 사업부 | **K-REACH** (한국 화학물질 등록·평가) | E 규제 라이브 차단 |
| **RoHS** (EU 유해물질 6+4) | 전자제품 | – | E 규제 |
| **CBAM** (EU 탄소국경) | EU 수출 lane | **K-ETS** (한국 배출권거래) 환산 | H lane, K ESG |
| **IRA Section 30D + FEOC** | 미국 EV/배터리 | – | H lane reroute |
| **USMCA** (북미 자동차 75% 부가가치) | MX→US lane | – | H lane reroute |
| **schema.org / GS1 GTIN** | 일반 상품 식별 | KAN (한국 EAN-13) | A 검색 |

**한국화 어댑터 설계 패턴** (retail의 KFDA 어댑터 그대로):
- `ontology/adapters/jedec_to_ks.py`
- `ontology/adapters/reach_to_kreach.py`
- `ontology/adapters/cbam_to_kets.py`

### 8.4 Demo Data Sizes

| Class | Count | Source |
|---|---|---|
| Product | 80 | 합성 (5 라인 × 평균 16 SKU) |
| Module | 400 | 합성 (BOM 폭발) |
| Component | 3,000 | 합성 |
| RawMaterial | 200 | 합성 + JEDEC/IPC 표준 ID |
| Manufacturer | 4 | AMZN Tech 4 사업부 |
| Supplier (1차) | 100 | 합성 |
| SubSupplier (2차) | 50 | 합성 |
| CustomerAccount | 30 | 합성 (Auto OEM 5 / Tier-1 8 / 가전 유통 7 / 통신 5 / 기타 5) |
| Plant | 40 | 자체 + 협력사 |
| Region | 7 | KR / CN / VN / MX / PL / US / IN (공공 GeoJSON) |
| TradeLane | 120 | 합성 (multimodal) |
| Standard | 60 | 공공 (JEDEC/IPC/AEC-Q/IATF/ISO 등 ID) |
| Certification | 200 | 합성 (Plant × Standard 조합) |
| Regulation | 25 | 공공 (REACH SVHC 일부, RoHS, CBAM, IRA, USMCA) |
| Substance | 250 | 공공 (REACH-SVHC + RoHS + CMR) |
| QualityIncident | 300 | 합성 (12개월 역사) |
| EightDReport | 200 | 합성 |
| RootCause | 150 | 합성 |
| Telemetry (sensor meta) | 5,000 | 합성 (시계열 본문은 OS · Aurora) |
| MaintenanceEvent | 800 | 합성 (12개월) |
| ESGIndicator | 100 | 합성 |
| CarbonScope | 120 | 합성 (Plant × Scope 1·2·3) |
| **Total nodes / edges** | **~10,000 / ~30,000** | Neptune Serverless 베이스라인 2 NCU |

retail 대비: 노드 ~3,300 → ~10,000 (3배). NCU 1 → 2.

### 8.5 Data Boundary — Authoritative vs Narrative

- **권위 있는 사실 (공공 표준 ID)**: `Standard`, `Substance`, `Regulation` (일부) — JEDEC/IPC/AEC-Q ID, REACH-SVHC CAS, ISO 26262 ASIL 등급
- **합성 서사**: `Product`, `Module`, `Component`, `Supplier`, `Plant`, `QualityIncident`, `EightDReport`, `Telemetry` 등 — Claude 생성, 시연 wow 모멘트에 맞춰 튜닝
- 두 영역은 표준 ID(JEDEC/CAS/ISO 등)로 조인. 시연 중 "공공 + 생성 데이터 거버넌스 분리"의 살아있는 예시로 활용.

### 8.6 Wow-Moment Tuning

3,000 Component 중 50–100개에 대해 한국어 시노님과 도메인어 보강 (예: "차량용 -40°C 보장" → `temperature_grade: AEC-Q100 Grade 2`, "RoHS 6+4 통과" → `Substance` 노드 미연결). 시나리오 A·E·F의 핵심 30 쿼리가 일관되게 정확하도록 사전 튜닝.

특별 시나리오:
- **H lane reroute 데모용**: MX→US lane 1개를 **사전 IRA-위반 상태**로 표시 → 시연자가 lane reroute 트리거 시 즉시 색상 변경
- **J 8D 시나리오용**: `INC-2026-0412 BGA 솔더볼 균열` 1개 인시던트를 8D 자동 작성 wow 모멘트 전용으로 사전 데이터로 준비

---

## 9. Project Layout

```
ontology-for-mfg/
├── infra-cdk/                          CDK TypeScript (6 스택, retail 패턴 미러)
│   ├── bin/app.ts                      Stack 인스턴스, retail VPC import 포함
│   └── lib/
│       ├── network-stack.ts            retail VPC import (Vpc.fromLookup) + mfg SGs 신규
│       ├── data-stack.ts               Neptune / Aurora / OpenSearch / S3 / KMS×5 (mfg 신규)
│       ├── ai-stack.ts                 Bedrock KB / Guardrails (mfg 4 토픽) / AgentCore Memory namespace
│       ├── compute-stack.ts            ECS cluster / Web·API services / ECR / ALB (mfg 신규)
│       ├── edge-stack.ts               CloudFront / Lambda@Edge (us-east-1) / Cognito + 시드 사용자 / ACM
│       └── observability-stack.ts      CW 대시보드, alarms (mfg 전용)
├── web/                                Next.js 14 App Router
│   ├── app/(buyer)/                    Buyer 페르소나 화면
│   │   ├── search/                     A 의미 검색
│   │   ├── chat/                       B 대화 에이전트
│   │   ├── insights/                   C 인사이트
│   │   ├── substitute/                 F 대체 부품
│   │   ├── price/                      G 단가/재고
│   │   └── rfm/                        I 협력사 RFM
│   ├── app/(engineer)/                 Engineer 페르소나
│   │   ├── search/ chat/ spec/ compliance/ substitute/ eight-d/
│   ├── app/(quality)/                  Quality 페르소나
│   │   ├── insights/ compliance/ rfm/ eight-d/ esg/ pdm/
│   ├── app/(scm)/                      SCM 페르소나
│   │   ├── insights/ price/ lane/ rfm/ esg/
│   ├── app/(plant)/                    Plant 페르소나
│   │   ├── lane/ eight-d/ esg/ pdm/
│   ├── app/api/auth/                   Cognito 콜백
│   └── components/
│       ├── graph/                      Cytoscape.js (subgraph 시각화)
│       ├── SCMMap                      글로벌 7개국 choropleth + lane 오버레이
│       ├── BomTree                     BOM 4단 계층 트리
│       ├── PersonaSwitch               5명 페르소나 전환 (Cognito 그룹 기반 권한)
│       ├── GuidedTour                  시연 가이드 모달
│       └── KpiStrip                    SCM/ESG KPI 5개 카드
├── api/                                FastAPI Python 3.12 (ARM64)
│   ├── main.py
│   ├── aws_clients.py                  boto3 client factories (cached)
│   ├── middleware_auth.py              Cognito JWT 검증
│   ├── routers/                        12 시나리오 라우터 (1 파일/시나리오)
│   │   ├── search.py        (A)
│   │   ├── chat.py          (B)
│   │   ├── insights.py      (C)
│   │   ├── spec_match.py    (D)
│   │   ├── compliance.py    (E)        # 신규: REACH/RoHS/AEC-Q 검증
│   │   ├── substitute.py    (F)
│   │   ├── price.py         (G)
│   │   ├── scm_lane.py      (H)
│   │   ├── supplier_rfm.py  (I)        # 신규
│   │   ├── eight_d.py       (J)        # 신규: 8D 자동 작성
│   │   ├── esg_cbam.py      (K)        # 신규: Scope 1·2·3 + CBAM
│   │   └── pdm.py           (L)        # 신규: PdM/IoT
│   └── services/
│       ├── embedding.py                Cohere 임베딩
│       ├── search.py                   OpenSearch 하이브리드 + 리랭크
│       ├── neptune.py                  openCypher / SPARQL
│       ├── kb.py                       Bedrock KB retrieve
│       ├── agent.py                    AgentCore Runtime 호출
│       ├── memory.py                   AgentCore Memory (mfg namespace)
│       ├── guardrails.py               PII/IP 사전 스크럽
│       ├── ingest.py                   PDF → Claude → Neptune
│       ├── compliance_engine.py        # 신규: 부품 × 표준 × 규제 자동 검증
│       ├── eight_d_writer.py           # 신규: Claude 8D 8단계 템플릿 강제
│       ├── carbon_calc.py              # 신규: Scope 1/2/3 + CBAM
│       ├── lane_router.py              # 신규: IRA/USMCA/CBAM lane reroute 시뮬
│       └── rfm_scorer.py               # 신규: 1·2차 협력사 RFM
├── data/                               합성 데이터 + 적재 스크립트
│   ├── synthetic/
│   │   ├── products.py                 80 SKU × 5 라인
│   │   ├── boms.py                     BOM 폭발 (Product → Module → Component → RawMaterial)
│   │   ├── suppliers.py                1차 100 + 2차 50
│   │   ├── customers.py                OEM 30
│   │   ├── plants.py                   40 (자체 + 협력사)
│   │   ├── lanes.py                    multimodal 120 lane
│   │   ├── incidents.py                품질 인시던트 300 + 8D 200 + RootCause 150
│   │   ├── telemetry.py                IoT 센서 5K + 시계열
│   │   ├── maintenance.py              정비 이벤트 800
│   │   └── esg.py                      ESGIndicator 100 + CarbonScope 120
│   ├── public/
│   │   ├── jedec.py                    JEDEC 표준 ID
│   │   ├── ipc.py                      IPC-A-610 등
│   │   ├── aec_q.py                    AEC-Q100/200
│   │   ├── iatf.py                     IATF 16949
│   │   ├── iso26262.py                 ISO 26262 ASIL 등급
│   │   ├── reach_svhc.py               REACH SVHC 244+
│   │   ├── rohs.py                     RoHS 6+4 제한물질
│   │   ├── cbam.py                     EU CBAM CN 코드
│   │   ├── ira.py                      IRA Section 30D + FEOC
│   │   ├── usmca.py                    USMCA Chapter 4
│   │   └── geo.py                      7개국 GeoJSON
│   └── load.py                         원샷 ECS 적재 태스크 (retail 패턴)
├── ontology/                           Neptune 스키마 + 매핑 룰
│   ├── schema.ttl                      OWL/RDF 22 클래스
│   ├── adapters/
│   │   ├── jedec_to_ks.py
│   │   ├── reach_to_kreach.py
│   │   └── cbam_to_kets.py
│   └── upload.py
├── docs/
│   ├── superpowers/specs/              디자인 spec
│   └── architecture/                   추가 아키텍처 문서
├── tests/                              pytest + Jest snapshot (CDK Template.fromStack)
├── scripts/                            ops 헬퍼 (cognito 시드, ecr push 등)
├── tools/                              one-off 스크립트
├── CLAUDE.md
├── README.md
├── SECURITY.md
├── CHANGELOG.md
├── requirements-dev.txt
└── .gitignore
```

### 9.1 ECS / ECR / KMS 명명 규약

| 자원 | 이름 |
|---|---|
| ECS Cluster | `ontology-mfg-dev-cluster` |
| ECS Service (web) | `ontology-mfg-dev-web` |
| ECS Service (api) | `ontology-mfg-dev-api` |
| ECR repo (web) | `ontology-mfg-dev-web` |
| ECR repo (api) | `ontology-mfg-dev-api` |
| KMS CMK | `ontology-mfg-dev-{s3,aurora,neptune,os,logs}-key` |
| Secrets | `ontology-mfg-dev-aurora-master`, ... |
| CloudWatch LogGroup | `/aws/ecs/ontology-mfg-dev-{web,api}` |

retail의 `ontology-retail-dev-*` 패턴과 1:1 대응 → 자원 충돌 없음.

---

## 10. Security & Governance

| 영역 | 구현 |
|---|---|
| 인증 | Cognito User Pool (mfg 전용, Seoul), admin-managed users, self-signup off, MFA optional, 그룹: `buyer/engineer/quality/scm/plant/admin` |
| 인가 | Lambda@Edge JWT 쿠키 검증 + API 측 Bearer 검증 + 그룹별 라우트 가드 (`/(quality)/*`는 quality+admin only) |
| 시드 사용자 | `admin@whchoi.net` (admin 그룹) / `demo@whchoi.net` (buyer 기본 그룹, 시연 시 PersonaSwitch로 5 페르소나 모두 접근). PW `***ROTATED***` 영구 |
| 암호화 (rest) | KMS CMK 5개: S3 / Aurora / Neptune / OpenSearch / CloudWatch Logs (`ontology-mfg-dev-*-key`, retail 키와 분리) |
| 암호화 (transit) | CF↔ALB HTTPS. ALB→Fargate 내부 HTTP (VPC private) — 데모 허용. 운영 격상 시 ACM Private CA로 mTLS |
| **PII / IP / 기밀 (mfg 4 Guardrails 토픽)** | ① **IP 기밀** — BOM 좌표·협력사 단가 비공개 정보 마스킹. ② **경쟁사 비방** — 삼성/소니/Whirlpool 부정 표현 차단. ③ **규제 위반 권유** — REACH-SVHC/RoHS 위반 부품을 추천하는 응답 차단. ④ **유해 화학물질** — CMR 1A/1B 등급 화학물질을 안전 정보 없이 안내하는 응답 차단 |
| 콘텐츠 안전 | Reranker 호출 직전 Guardrails 사전 스크럽 (Top-100 텍스트 청크, 일시 us 리전) |
| 시크릿 | Secrets Manager. Fargate task IAM role로 retrieve. ENV 평문 노출 금지 |
| 네트워크 격리 | retail VPC 공유. Bedrock/S3/ECR/CloudWatch Logs는 retail의 VPC Endpoint 재사용. 인터넷 우회 0 |
| 감사 | CloudTrail 데이터 이벤트 (Bedrock), Cognito 이벤트, ALB 액세스 로그 → S3, 30일 보존 |
| WAF (선택) | rate limit (분당 IP당 100), Geo (KR + 화이트리스트), AWS Managed Common Rules |

### 10.1 IAM Roles (요약)

| Role | Trust | Permissions |
|---|---|---|
| `mfg-ecs-task-role-web` | ecs-tasks | CloudWatch Logs |
| `mfg-ecs-task-role-api` | ecs-tasks | Bedrock invoke (Claude/Cohere/Reranker/Guardrails), Neptune connect, OpenSearch query, Aurora secret read, S3 read (KB 소스 + uploads), CloudWatch Logs, X-Ray, AgentCore Runtime/Memory/Gateway/Code Interpreter |
| `mfg-lambda-edge-role` | lambda + edgelambda | Cognito JWKS retrieve, CloudWatch Logs (us-east-1) |
| `mfg-bedrock-kb-role` | bedrock | S3 read (raw-docs), OpenSearch write |

### 10.2 Reranker Cross-Region Note

retail와 동일 정책. Reranker로 보내는 텍스트는 **Top-N 검색 후보(상위 100개 청크)**로, 일시적으로 us 리전에서 처리. 데이터 거주성 메시지 유지를 위해:

- 호출 직전 Guardrails로 IP/PII 사전 스크럽
- "Top-N candidates only, ephemeral, no IP" 슬라이드 footnote
- 향후 Reranker 서울 GA 시 `InferenceProfileArn` 환경 변수 한 줄 변경으로 마이그레이션

### 10.3 retail 공유 자원 격리 검증

mfg 작업이 retail 데모에 영향 없음을 보장:
- mfg는 retail 어떤 SG도 변경하지 않음 (mfg SG 전부 신규, retail VPC 안에 새 layer)
- mfg는 retail 어떤 KMS 키, IAM role, S3 bucket, Cognito pool도 사용하지 않음
- VPC Endpoint(`vpce-sg`)는 VPC CIDR 허용이라 mfg ENI 자동 통과 — retail 정책 변경 불필요
- CFN 의존성: mfg가 retail VPC export 참조 → retail 네트워크 스택 삭제 자동 차단 (의도된 안전망)

---

## 11. Cost Estimate (월, USD, ap-northeast-2)

retail VPC·NAT·VPC Endpoints 공유로 약 $80/월 절감 후 추정.

| 항목 | 산정 | mfg 비용 |
|---|---|---|
| Fargate web (2 task × 0.5 vCPU × 1 GB) | 24/7 | $35 |
| Fargate api (2 task × 1 vCPU × 2 GB) | 24/7 | $70 |
| ALB (mfg 전용) | 1 + LCU | $25 |
| NAT Gateway | retail 공유 | **$0** |
| VPC Endpoints | retail 공유 | **$0** |
| Neptune Serverless (베이스라인 2 NCU, 10K 노드) | 2 NCU × 24/7 | $260 |
| Aurora Serverless v2 | 0.5–2 ACU, 평시 0.5 | $40 |
| **OpenSearch Serverless** | 2 OCU 최소 (1 idx + 1 search) + Telemetry 시계열 인덱스 | **$350** |
| S3 / KMS×5 / Secrets | – | $10 |
| CloudFront / Cognito / Lambda@Edge | 데모 트래픽 | $10 |
| Bedrock (모델/임베딩/Reranker/Guardrails) | ~6K invoke/월 (Compliance/8D 라이브 시연 ↑) | $40–60 |
| AgentCore Memory/Runtime/Code Interpreter/Browser | 데모 사용량 | $10–20 |
| CloudWatch / X-Ray | – | $15 |
| **합계 (Always-On baseline)** | | **~$865/월** |

### 11.1 Cost Optimization Knobs (선택 적용)

| 옵션 | 절감 | 트레이드오프 |
|---|---|---|
| OpenSearch Serverless → 관리형 t3.small.search 단일 노드 | -$300 | KB 호환성 일부 손실, "데모 환경" 명시 필요 |
| Neptune Serverless 2 NCU → t4g.medium 프로비저닝 | -$170 | 24/7 일정 비용, 스케일 한계 |
| Telemetry 시계열을 OS Hot 1주만, 나머지 S3 cold | -$30 | 시연은 hot만 사용 가능 |

세 옵션 모두 적용 시 **~$365/월**. **권장**: 첫 영업 데모는 안정성 우선 ($865/월), 시연 안정화 후 절감 옵션 도입.

### 11.2 Budget Alarm

- AWS Budgets: 월 $1,200 알람 (retail $1,000 + mfg 마진) → SNS Slack
- Cost Anomaly Detection: 일별 1.5× 이상 변동 시 알림

---

## 12. Observability

### 12.1 Custom Metrics

- `mfg.search.latency.{p50,p95,p99}` (시나리오 A)
- `mfg.agent.tool_call.count{tool}` (B의 9개 도구 분포)
- `mfg.reranker.calls`, `mfg.reranker.latency`
- `mfg.guardrails.blocks.count{topic}` (4 토픽별)
- `mfg.bedrock.tokens.{input,output}`
- `mfg.cytoscape.render.duration` (web)
- `mfg.compliance.violations.count` (E 시나리오)
- `mfg.eight_d.draft.duration` (J 시나리오, Claude 응답 시간)
- `mfg.lane.reroute.duration` (H 시나리오 lane reroute 계산 시간)
- `mfg.carbon.calc.duration` (K 시나리오 Scope 계산)
- `mfg.pdm.alarms.count` (L 시나리오 임계 초과)
- `mfg.neptune.bom_traversal.depth` (BOM 깊이별 분포)

### 12.2 CloudWatch Dashboard "MFG Demo Health"

영업 발표자 시연 직전 5분 점검 단일 화면. 위 메트릭 + Fargate task health + Bedrock 5xx rate + Neptune NCU 사용률.

### 12.3 Alarms

| Alarm | Threshold | Action |
|---|---|---|
| Search p95 latency | > 3s | SNS Slack |
| Agent first token | > 2s | SNS Slack |
| Fargate task health | < 2 (any service) | 자동 복구 + SNS |
| Bedrock 5xx rate | > 5% / 5min | SNS Slack |
| Neptune NCU sustained | > 6 NCU 10분 | SNS Slack (스케일 확인) |
| OpenSearch OCU saturation | > 90% 5분 | SNS Slack |
| Budget | > $1,200 / 월 | SNS Slack |

### 12.4 Tool-Call Trace (시나리오 B 시연 전용)

retail의 trace ring buffer 패턴 그대로. 우측 백엔드 로그 패널에 `kb.retrieve(...)`, `neptune.query(...)`, `compliance.check(...)`, `eight_d.write(...)`, `lane.reroute(...)`, `carbon.calc(...)`, `rfm.score(...)` 호출이 라이브 표시.

---

## 13. Risk Register

### 13.1 mfg 특이 위험

| 위험 | 가능 | 영향 | 완화 |
|---|---|---|---|
| BOM 폭발 — 3,000 Component × 평균 4 부모 = ~12K BOM 엣지, openCypher 깊은 traversal 느림 | 중 | A·D 검색 응답 ↑ | BOM depth 제한 (기본 3hop), 자주 쓰는 BFS 결과 Aurora 캐시, `MATCH ... LIMIT N` 강제 |
| 합성 BOM의 비현실성 (실제 hi-tech mfg 도메인 친근감 부족) | 높 | 시연 신뢰 ↓ | 4 사업부 공개 IR/뉴스에서 제품군 모티프 차용 (브랜드명만 가상화), 도메인 SME 1회 검수, 핵심 30 쿼리 사전 평가 |
| IRA/USMCA/CBAM 규정 인용 부정확 | 중 | 청중에 오정보 | 시연 화면에 "데모 데이터 — 실제 규정은 변동" footnote 고정, 핵심 룰만 (USMCA 75% / CBAM 단계 2026 / IRA FEOC) 채택, Guardrails로 "법률 자문" 표현 차단 |
| 8D 자동 작성이 일반 LLM 응답처럼 느껴짐 | 중 | J 시나리오 wow ↓ | 8D 8단계 (D1팀구성~D8공유) 명시 템플릿 강제, RootCause 노드 그래프 동시 시각화, 사전 시연 데이터 1건 (`INC-2026-0412`) 튜닝 |
| Telemetry 시계열 5K센서 OpenSearch 비용 | 낮 | 비용 폭증 | 데모 12개월 한정, Hot 1주 + Warm 4주 + Cold S3, 시연은 hot 1주만 노출 |
| retail VPC 공유로 인한 SG/route 충돌 | 낮 | retail 영업 데모 차질 | mfg SG는 별도 prefix `mfg-*`, retail SG 미변경. CDK `addIngressRule` idempotent. 사전 retail 데모 회귀 1회 |
| 시드 비밀번호 `***ROTATED***` 영업 노출 | 낮 | 데모 계정 탈취 | 데모 환경 전용, prod 격상 시 폐기 + Secrets Manager로 회전, 시연 후 IP 기반 access 제한 옵션 |
| Compliance 엔진 false positive (정상 부품을 차단) | 중 | E 시나리오 신뢰 ↓ | RoHS/REACH 룰 deterministic 코드 (LLM 미사용), Substance/Regulation 매핑 인간 검수 1회 |
| Magna ePT JV 공개 정보 부족 → 시연 데이터 빈약 | 중 | 5번째 라인 모호 | LG Magna e-Powertrain 공개 IR + 모터/인버터/감속기 일반 사양 기반 합성, "JV 구조" 자체는 D9 footnote 처리 |

### 13.2 retail 공통 위험 (재사용)

| 위험 | 완화 (retail와 동일) |
|---|---|
| AgentCore Browser 서울 GA 격차 | 합성 외부 데이터 폴백 |
| Reranker cross-region 레이턴시 (~150ms) | UI 스피너, Top-100 제한, 인기 쿼리 사전 캐시 |
| Neptune 초기 적재 시간 | 스냅샷 백업/복원 |
| KB 인덱싱 시간 | 사전 인제스트 + 시연은 "신규 PDF만" |
| 합성 한국어 어색함 | 한국어 검수 1회 |
| Cognito 임시 비번 운영 사고 | "시연 5분 전 새 비번 발급" SOP, 백업 계정 1개 상시 |
| Bedrock 모델 장애 | Sonnet → Haiku 폴백 분기 |
| Lambda@Edge 배포 실패 | CDK `requireAuth` 컨텍스트 false 빌드로 빠른 우회 |
| 비용 폭주 | Budget 알람, AgentCore tool call rate limit, OpenSearch OCU 상한 |
| 우연한 PII 노출 | 합성 PII 없음, Guardrails 사전 검증 |

---

## 14. Build Phases

총 **~9주** (SA 1명 기준). 2명이면 5–6주로 압축.

| Phase | 기간 | 산출물 | 의존 |
|---|---|---|---|
| **0. 표준 매핑 시트** | 1주 | JEDEC↔KS / IPC / AEC-Q / IATF / ISO 26262 / REACH-SVHC↔K-REACH / RoHS / CBAM↔K-ETS / IRA / USMCA 매핑 CSV (Claude 1차 + 인간 검수) | — |
| **1. 합성 데이터 생성** | 1.5주 | Product 80 / Module 400 / Component 3,000 / Supplier 150 / Plant 40 / TradeLane 120 / QualityIncident 300 / EightDReport 200 / RootCause 150 / Telemetry 5K / Maintenance 800 / ESG 100 + CarbonScope 120. 핵심 30 쿼리 사전 평가 | Phase 0 |
| **2. CDK 인프라** | 1주 | network(import retail VPC) / data / ai / compute / edge / observability 6 스택, dev 배포 검증, retail 데모 회귀 1회 | — |
| **3. API 백엔드** | 2.5주 | 12 라우터 + 5 신규 서비스 (compliance / eight_d / carbon / lane_router / rfm), AgentCore 통합, SSE 스트림, Guardrails 4 토픽 | Phase 1, 2 |
| **4. Web 프론트** | 2주 | 5 페르소나 × 12 시나리오 화면, Cytoscape.js 그래프, SCMMap (글로벌 7개국 choropleth), BomTree, PersonaSwitch, GuidedTour, KpiStrip | Phase 3 (모킹 병렬 가능) |
| **5. 시연 검증 + 리허설** | 1주 | 핵심 30 쿼리 검증, 시연 시나리오 3회 리허설, 비용 점검, retail 데모 동시 운영 검증 | Phase 4 |
| **합계** | **9주** | | |

### 14.1 병렬화 (SA 2명 시 5–6주)

- Phase 0 (표준 시트) + Phase 1 (합성 데이터) 병렬 → 1.5주
- Phase 2 (CDK) + Phase 3 (API 모킹) 병렬 → 2.5주
- Phase 3 (API 실 구현) + Phase 4 (Web) 병렬 → 2.5주
- Phase 5 (검증) → 1주
- 합계 ~5.5주

### 14.2 Critical Path

표준 매핑 시트 (Phase 0) → 합성 데이터 (Phase 1) → API 백엔드 (Phase 3) → 시연 검증 (Phase 5).
표준 매핑이 늦으면 합성 데이터 라벨이 일관성 없어 재작업 위험. **Phase 0은 먼저 시작.**

---

## 15. Out of Scope / Future Cards

데모 종료 후 follow-up 카드:

- **A. Real Customer 데이터 PoC**: LG/삼성 등 실 BOM 1만+ Component, 코어 22 클래스 그대로
- **B. SageMaker hi-tech 도메인어 fine-tune**: 전자/자동차 부품 어휘 정확도 +α
- **C. Q Business 통합**: 자연어 BI를 사내 SSO 위에
- **D. AgentCore Browser 정식 활용**: 외부 부품 단가/EOL 모니터, 경쟁사 IR 자동 추적
- **E. 멀티 sub-domain 확장**: 2차전지·디스플레이·반도체 장비·자동차 Tier-1 (라벨만 추가, 22 클래스 그대로)
- **F. mTLS in VPC**: ALB→Fargate ACM Private CA, production-grade 격상
- **G. 멀티 리전 DR**: Tokyo 또는 us-west-2 standby
- **H. retail + mfg 그래프 페더레이션**: 한 Neptune에 retail+mfg 동시 적재 (cross-domain RAG PoC)
- **I. ERP/MES 통합**: SAP/Oracle/Plex 실 BOM·Production order 실시간 동기화
- **J. 자동차 기능안전 인증 워크플로우**: ISO 26262 ASIL 등급 부여 자동화 (현재는 라벨만)
- **K. 8D → 5-Why → DMAIC 풀 사이클**: 6시그마 Black Belt 도구 통합
- **L. 디지털 트윈**: Plant 가동 시뮬레이션 + AgentCore 강화학습

---

## 16. Open Questions / Default Assumptions

다음 항목들은 명시적 답변이 없어 기본값으로 진행. 빌드 단계에서 필요 시 조정.

| 항목 | 기본값 | 변경 시 영향 |
|---|---|---|
| 데이터 규모 | Component 3,000 / Supplier 150 / Plant 40 / Lane 120 / Incident 300 | 데이터 생성 스크립트 파라미터, Neptune NCU |
| 시연 데이터 PII | 합성 PII 없음 (mfg 도메인은 PII 비중 낮음) | – |
| 커스텀 도메인 | `mfg-ontology.whchoi.net` (ACM us-east-1 신규) | DNS 레코드 + ACM cert |
| CI/CD | 수동 `cdk deploy` 시작, 안정화 후 GitHub Actions | 워크플로우 yaml |
| AgentCore Browser | 빌드 단계 가용성 재확인 후 결정 | 미가용 시 합성 외부 데이터 폴백 |
| Cognito MFA | optional (시연 편의) | 운영 격상 시 enforced |
| BOM depth 기본값 | 3 hop (Product → Module → Component → RawMaterial) | 깊은 traversal 시 응답 ↑ |
| Telemetry hot 보존 | OpenSearch 1주 + Warm 4주 + Cold S3 | 비용 / 시연 가용성 트레이드오프 |
| Magna ePT JV 시연 비중 | 5 라인 중 1개로 동등 비중 | 빈약 시 4 라인 + Magna footnote 옵션 |
| 시드 비밀번호 회전 | 데모 환경 영구 `***ROTATED***` | 운영 격상 시 Secrets Manager 회전 |
| 8D 시연 데이터 | `INC-2026-0412 BGA 솔더볼 균열` 1건 사전 튜닝 | 추가 인시던트는 합성 baseline |
| H lane reroute 트리거 | 시연자 수동 버튼 (`Trigger IRA`) | 자동 시뮬레이션은 follow-up |

---

## 17. References

- 미러 대상 retail 디자인 spec: `/home/ec2-user/my-project/ontology-for-retail/docs/superpowers/specs/2026-04-25-ontology-retail-cpg-design.md`
- 참조 IaC (CloudFront → Prefix-list SG → ALB 패턴): https://github.com/whchoi98/ec2_vscode/tree/main/infra-cdk
- AWS cognito-at-edge 패턴 (Lambda@Edge JWT 검증)

### 표준 / 규제

- JEDEC: https://www.jedec.org/
- IPC: https://www.ipc.org/
- AEC (Automotive Electronics Council): http://www.aecouncil.com/
- IATF 16949: https://www.iatfglobaloversight.org/
- ISO 26262 (자동차 기능안전, ASIL A–D)
- ISO 9001 / 14001
- ECHA REACH-SVHC Candidate List: https://echa.europa.eu/candidate-list-table
- EU RoHS Directive 2011/65/EU
- EU CBAM (Carbon Border Adjustment Mechanism): https://taxation-customs.ec.europa.eu/cbam_en
- US IRA Section 30D + FEOC (Foreign Entity of Concern)
- USMCA Chapter 4 (Rules of Origin, 자동차 75% 부가가치)
- 한국 K-REACH (화학물질 등록 및 평가)
- 한국 K-ETS (배출권거래제)
- 한국산업표준 KS C IEC

### AWS

- Bedrock Knowledge Bases (Vector + RAG)
- Bedrock AgentCore (Runtime / Memory / Gateway / Code Interpreter / Browser)
- Bedrock Cross-Region Inference Profiles (Reranker)
- Bedrock Guardrails (사용자 정의 토픽)
- Amazon Neptune Serverless (openCypher / SPARQL)
- OpenSearch Serverless (Nori 형태소, 벡터 KNN)
- Aurora PostgreSQL Serverless v2

### 시각화 / 프론트

- Cytoscape.js (그래프 렌더)
- react-simple-maps + d3-geo (글로벌 choropleth)
- NanumGothic (Code Interpreter 차트 한글 글리프)

### 도메인 데이터 출처 (공공)

- LG전자 IR / 사업보고서 (제품 라인 모티프, 브랜드명 비공개)
- 한국 환경부 K-REACH / K-ETS 공시
- ECHA REACH-SVHC 후보 리스트
- US Treasury IRA Guidance
- USTR USMCA Implementation






