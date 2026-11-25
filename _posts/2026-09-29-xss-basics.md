---
title: XSS 처음부터 정리하기
date: 2026-09-29 15:00:00 +0900
categories: [블로그/기술문서]
tags: [xss, sql-injection, web-security, csp, study, codecure]
---

> **한 줄 요약:** XSS는 "내 사이트가 신뢰받는 자리"에서 공격자의 스크립트가 실행되게 만드는 취약점이고, 원인은 사용자 입력을 **출력되는 위치에 맞게 처리하지 않은 것** 하나로 모입니다.
{: .prompt-tip }

## 0. 이 글을 쓰는 이유

[AI 에이전트 보안 논문](/posts/ai-agent-security-papers/)을 정리하면서 "신뢰하지 말아야 할 데이터가 명령처럼 실행된다"는 문제가 반복해서 나왔습니다. 프롬프트 인젝션이 LLM 세계의 SQL 인젝션이라면, 웹에서 같은 구조를 가장 오래, 가장 널리 보여 준 것이 XSS입니다.

마침 동아리 2주차 수업에서 웹 기초와 XSS 기본 개념을 배웠습니다. 수업 내용에 따로 찾아본 자료를 더해, 웹을 처음 접하는 사람도 따라올 수 있도록 **웹 기초 → XSS → 방어** 순서로 다시 정리했습니다.

## 1. XSS를 이해하기 위한 웹 기초

XSS는 "브라우저가 무엇을 믿는가"의 문제라서, 아래 다섯 가지를 알아야 이유가 보입니다.

### 1-1. 클라이언트와 서버

브라우저(클라이언트)가 요청(Request)을 보내면 서버가 응답(Response)을 돌려줍니다. 카페에서 손님이 주문하고 바리스타가 커피를 내주는 것과 같습니다. 브라우저는 받은 HTML, CSS, JS를 해석해 화면을 그립니다(렌더링).

### 1-2. URL의 구조와 "서버로 가지 않는 조각"

```text
https://example.com:443/search?q=hello&page=1#result
 scheme   host     port  path   query string   fragment
```

| 요소 | 역할 |
|---|---|
| Scheme, Host, Port | 어느 서버의 어느 포트로 어떤 방식으로 연결할지 |
| Path | 서버 안에서 어떤 기능·페이지를 요청할지 |
| Query String | 서버에 넘기는 추가 정보(검색어 등). 서버가 읽는다 |
| Fragment | **브라우저 안에서만 쓰이고 서버로 전송되지 않는다** |

실습으로 확인한 것: 개발자도구(F12) Network 탭의 Request URL에는 `#secret` 같은 fragment가 나타나지 않았습니다. 서버가 아니라 브라우저가 쓰는 값이기 때문입니다. 뒤에서 나올 DOM-based XSS에서 이 사실이 중요해집니다.

### 1-3. HTTP 요청과 응답

- **GET**: 조회용. 데이터가 URL(query string)에 실려서 주소창과 서버 로그에 남습니다.
- **POST**: 전송·변경용. 데이터가 Body에 실려서 URL에는 보이지 않습니다. 그래서 로그인 정보는 보통 POST로 보냅니다.
- **상태 코드**: 200(성공), 302(다른 주소로 이동), 404(없음), 500(서버 내부 오류). 없는 페이지인 줄 알았는데 500이 뜨면 서버가 입력을 처리하다 오류가 났다는 단서가 되므로 취약점 점검 때도 힌트가 됩니다.

**실습 1. GET vs POST**: 같은 값(`web123`)을 두 방식으로 보내고 Network 탭에서 비교했습니다. GET은 Request URL의 Query String에 값이 그대로 노출되었고, POST는 HTTP 요청의 Body(Payload)에 담겨 URL에는 나타나지 않았습니다. 주소창에 입력값이 보이는 쪽은 GET입니다.

**실습 2. 302 추적**: START 버튼을 눌렀더니 요청하지 않은 페이지로 이동했습니다. 최초 요청의 상태 코드는 302(Found)였고, 이동할 주소는 Response Headers의 `Location` 필드에 있었습니다. 브라우저는 그 `Location`에 적힌 새 주소로 다시 요청을 보냈습니다. (Preserve log를 켜야 이동 전 요청이 기록에서 사라지지 않습니다.)

### 1-4. 쿠키와 세션

HTTP는 요청마다 독립적이라 서버가 "방금 로그인한 사람"을 기억하지 못합니다. 그래서 다음 방식을 씁니다.

1. 로그인에 성공하면 서버가 세션(로그인 상태 정보)을 **서버에** 만들고
2. 그 세션을 가리키는 Session ID를 `Set-Cookie` 헤더로 브라우저에 줍니다.
3. 브라우저는 이후 같은 사이트로 요청할 때마다 `Cookie` 헤더에 그 값을 자동으로 실어 보냅니다.
4. 서버는 Session ID를 보고 사용자를 식별합니다.

즉 **쿠키는 브라우저에 저장된 작은 데이터이고, 세션은 서버에 저장된 정보**이며, 쿠키 안의 Session ID는 세션을 찾는 열쇠일 뿐입니다.

**실습 3. 쿠키와 세션**: Application 탭에서 쿠키 값을 직접 바꿔 보았습니다. `theme=dark`를 `light`로 바꾸고 새로고침하자 화면 전체가 밝은 테마로 바뀌었습니다. 쿠키 값 자체가 화면 설정을 정하기 때문입니다. 반면 `session_id`를 아무 값으로 바꾸고 새로고침하자 `401 Unauthorized` 오류가 나며 사용자를 알아보지 못했습니다. 민감한 정보는 서버의 세션에 있고 브라우저에는 그 세션을 가리키는 열쇠(Session ID)만 있는데, 바꾼 값에 해당하는 세션을 서버가 찾지 못했기 때문입니다. 둘 다 쿠키지만 결과가 다른 이유입니다.

그래서 **Session ID를 훔치면 그 사람인 척할 수 있고**, 이것이 XSS의 대표적인 노림수입니다. 쿠키에는 이를 줄이는 보안 속성이 있습니다.

| 속성 | 효과 |
|---|---|
| `Secure` | HTTPS 연결에서만 쿠키 전송 |
| `HttpOnly` | JavaScript에서 쿠키를 읽지 못하게 함 (XSS와 직결) |
| `SameSite` | 다른 사이트에서 온 요청에 쿠키를 자동으로 실을지 제한 |

### 1-5. HTML, DOM, JavaScript

HTML은 페이지의 설계도, DOM은 브라우저가 그 설계도로 메모리에 만든 구조, JavaScript는 DOM을 실시간으로 바꾸는 실행 코드입니다. 사용자가 입력한 값(검색어, 댓글, 게시글)은 결국 HTML에 들어가거나 JS를 거쳐 DOM에 반영됩니다. 이때 그 값이 **그냥 글자로만 취급되는가, HTML과 코드로도 해석될 수 있는가**가 XSS의 핵심 질문입니다.

### 1-6. Origin과 동일 출처 정책(SOP)

**Origin = Scheme + Host + Port**입니다. 하나라도 다르면 다른 Origin입니다.

| A | B | 결과 |
|---|---|---|
| `https://example.com` | `https://example.com/page2` | 같음 (Path만 다름) |
| `https://example.com` | `http://example.com` | 다름 (Scheme) |
| `https://example.com` | `https://sub.example.com` | 다름 (Host) |
| `https://example.com:443` | `https://example.com:8080` | 다름 (Port) |

브라우저는 다른 Origin끼리 서로의 데이터에 접근하지 못하게 막습니다. 이 규칙이 없다면 은행 사이트를 열어 둔 채 악성 사이트를 방문했을 때 그 사이트의 스크립트가 은행 데이터를 읽을 수 있기 때문입니다.

여기에 XSS의 무서움이 있습니다. SOP는 "다른 사이트의 스크립트"를 막지만, XSS로 심은 스크립트는 **취약한 사이트 자신의 페이지 안에서 실행되므로 브라우저가 같은 Origin으로 취급하고 모든 권한을 줍니다.** SOP가 막아 주지 못하는 지점입니다.

## 2. XSS란 무엇인가

XSS(Cross-Site Scripting, CWE-79)는 공격자가 만든 JavaScript가 **피해자의 브라우저에서, 취약한 사이트의 권한으로** 실행되는 취약점입니다. 서버를 직접 뚫는 것이 아니라 피해자의 브라우저를 빌려 쓰는 공격입니다.

**발생 흐름**
1. 공격자가 텍스트 대신 실행 가능한 코드(`<script>`)를 입력하거나 링크에 심는다.
2. 서버(또는 페이지의 JS)가 그 값을 검증 없이 응답에 포함한다.
3. 브라우저가 이를 "보여 줄 글자"가 아니라 "실행할 코드"로 해석한다.
4. 스크립트가 다른 사용자의 브라우저에서 그 사이트의 권한으로 실행된다.

**할 수 있는 일**
- 세션 쿠키·토큰 탈취 (HttpOnly가 아닌 경우)
- 피해자 대신 요청 보내기 (비밀번호 변경, 송금 등)
- 페이지 내용 바꾸기, 가짜 로그인 창 띄우기(피싱)
- 키 입력 가로채기

## 3. 세 가지 종류

| 구분 | 저장 여부 | 실행 시점 | 공격 매개체 |
|---|---|---|---|
| Reflected | 저장 안 됨 | 요청 즉시 (한 번의 요청-응답 안에서 끝남) | 조작된 링크를 피해자가 클릭 |
| Stored | 서버(DB)에 저장 | 그 페이지를 볼 때마다 | 게시글·댓글 등을 열람 |
| DOM-based | 저장 여부 무관 | 브라우저의 JS가 실행될 때 | URL 조작, 클라이언트 쪽 입력 |

- **Stored**는 링크를 누르게 만들 필요 없이 그 페이지를 보는 모든 사용자가 대상이라 영향 범위가 가장 넓습니다.
- **Blind XSS**는 Stored의 변형으로, 입력한 값이 관리자 페이지처럼 내가 볼 수 없는 곳에서 나중에 실행되는 경우입니다. 버그바운티에서 자주 언급됩니다.

### 3-1. Reflected 예시 (개념)

검색 결과 페이지가 `?q=` 값을 그대로 출력한다고 가정합니다.

```html
<!-- 서버가 만든 응답 -->
<p>검색어: <script>alert(1)</script></p>
```

`alert(1)`은 "스크립트가 실행된다"만 확인하는 무해한 증명용 코드입니다. 브라우저는 이것을 글자가 아니라 코드로 해석합니다.

### 3-2. DOM-based 예시 (개념)

```javascript
// 위험: location.hash 값을 HTML로 해석되는 곳에 넣음
document.getElementById("msg").innerHTML = location.hash.slice(1);
```

입력의 출발점을 **source**(`location.hash`, `location.search`, `postMessage`, `localStorage` 등), 위험한 도착점을 **sink**(`innerHTML`, `document.write`, `eval`, `setTimeout(문자열)` 등)라고 부릅니다. DOM XSS는 "source에서 sink까지 값이 정화 없이 흘러가는가"를 추적하는 문제입니다.

앞서 확인한 사실과 연결됩니다. **fragment(`#...`)는 서버로 전송되지 않으므로**, `location.hash`를 source로 쓰는 DOM XSS는 서버 응답이 안전해도 생기고 서버 로그에도 남지 않습니다. 그래서 서버 쪽 점검만으로는 찾기 어렵습니다.

## 4. 왜 생기는가: 컨텍스트가 다르면 이스케이프도 다르다

같은 입력값도 놓이는 위치(컨텍스트)에 따라 위험한 문자가 달라집니다.

| 출력 위치 | 막아야 할 것 | 알맞은 처리 |
|---|---|---|
| HTML 본문 | `<`, `>`, `&` | HTML 엔티티 인코딩 |
| HTML 속성값 | `"`, `'` | 속성 인코딩 + 항상 따옴표로 감싸기 |
| JavaScript 문자열 | `'`, `"`, `\`, 줄바꿈 | JS 이스케이프 (가능하면 값을 JS에 직접 넣지 않기) |
| URL | `javascript:` 스킴 | 허용 스킴(http, https) 검사 |
| CSS | 표현식, `url()` | 가능하면 사용자 값을 넣지 않기 |

"입력할 때 걸러내기"보다 **"출력할 때, 그 위치에 맞게 인코딩하기"**가 원칙입니다. 입력 필터는 우회되기 쉽고, 같은 값이 여러 컨텍스트에 쓰이면 한 가지 필터로는 모두 막을 수 없기 때문입니다. 수업에서 소개한 "허용하지 않을 문자·패턴 걸러내기"(입력 검증)도 보조 수단으로는 의미가 있지만, 이것만으로 막았다고 생각하면 안 됩니다.

## 5. 방어: 한 겹이 아니라 여러 겹

1. **컨텍스트별 출력 인코딩**: 가장 기본이자 핵심입니다. 직접 짜지 말고 템플릿 엔진의 자동 이스케이프(Jinja2, Thymeleaf, React의 JSX 등)를 쓰고, 이를 끄는 기능(`|safe`, `th:utext`, `dangerouslySetInnerHTML`, `v-html`)을 조심합니다.
2. **입력 검증**: 허용할 형식(숫자, 정해진 문자 집합 등)을 정해 두고 벗어나면 거부합니다. 보조 수단입니다.
3. **안전한 DOM API**: `innerHTML` 대신 값을 텍스트로만 처리하는 `textContent`를 씁니다. HTML을 꼭 허용해야 하면 DOMPurify 같은 검증된 sanitizer를 쓰고, 정규식으로 태그를 지우는 방식은 피합니다.
4. **쿠키 보안 속성**: `HttpOnly`, `Secure`, `SameSite`. XSS가 발생해도 스크립트가 쿠키를 읽지 못하게 해 피해 범위를 줄입니다. 다만 XSS 자체를 막지는 못하고, 쿠키를 못 읽어도 스크립트가 피해자 대신 요청을 보내는 것은 가능합니다.
5. **CSP(Content Security Policy)**: 인라인 스크립트와 허용되지 않은 출처의 스크립트를 브라우저가 막게 하는 2차 방어선입니다. nonce나 hash 기반의 엄격한 CSP가 효과적이고, `unsafe-inline`이 있으면 효과가 크게 줄어듭니다.
6. **Trusted Types**: DOM sink에 문자열 대신 검증된 객체만 넣도록 강제해 DOM XSS를 구조적으로 줄입니다.

앞서 [정리한 논문들](/posts/ai-agent-security-papers/)의 결론("속지 않게 만들기에서 속아도 피해가 커지지 않게 만들기")과 같은 구도입니다. 1~3번이 "속지 않게", 4~6번이 "속아도 피해를 줄이게"에 해당합니다.

## 6. XSS game 직접 풀어 보기 (Level 1, 2)

Google의 [XSS game](https://xss-game.appspot.com/)에서 Level 1과 2를 풀고, 다음 여섯 가지 질문으로 정리했습니다. 두 레벨은 같은 `<script>` 계열 공격처럼 보이지만 유형도, 막히는 지점도 달랐습니다.

### Level 1: Reflected XSS

| 질문 | 정리 |
|---|---|
| 유형과 근거 | Reflected. 입력값이 DB에 저장되지 않고, 한 번의 요청-응답 안에서 서버 응답에 그대로 포함되어 되돌아오기 때문 |
| 입력의 이동 경로 | 검색창 입력 → HTTP GET 요청(URL 파라미터) → 서버 → 응답 HTML에 포함 → 브라우저가 해석·실행 |
| 취약한 로직 | 서버가 검색어를 응답에 출력할 때 특수문자를 안전한 형태로 바꾸는 **출력 인코딩 없이** HTML에 그대로 넣음 |
| 왜 XSS가 되나 | 브라우저가 받은 텍스트를 단순한 글자가 아니라 실행 가능한 JavaScript(`<script>`)로 해석하기 때문 |
| Payload | `<script>alert('성공!')</script>` |

Payload 해설
- `<script>`: 태그 안의 JavaScript를 실행하라고 브라우저에 알리는 HTML 태그
- `alert('성공!')`: 화면에 '성공!'이 적힌 경고창을 띄우는 함수. 스크립트가 실행됐다는 증명용입니다.

### Level 2: Stored XSS

| 질문 | 정리 |
|---|---|
| 유형과 근거 | Stored. 작성한 게시글이 저장된 뒤, 그 페이지를 조회하는 모든 사용자에게 악성 스크립트가 포함되어 실행되기 때문 |
| 입력의 이동 경로 | 상태 작성 폼 → 저장소에 저장(이 레벨에서는 서버 대신 브라우저 저장소를 DB처럼 사용) → 페이지 조회 시 저장된 데이터를 JavaScript로 로드 → DOM 조작으로 화면에 삽입 → 브라우저 실행 |
| 취약한 로직 | 클라이언트 JavaScript가 게시물을 렌더링할 때 텍스트로만 처리하는 안전한 API 대신, 입력값을 HTML로 해석하는 `innerHTML`을 사용함 |
| 왜 XSS가 되나 | `innerHTML`로 삽입한 `<script>`는 브라우저가 실행하지 않지만, `<img>` 같은 다른 태그의 이벤트 핸들러(`onerror` 등)에 넣은 JavaScript는 그대로 실행되기 때문 |
| Payload | `<img src="x" onerror="alert('XSS 성공!')">` |

Payload 해설
- `<img>`: 이미지를 그리는 태그
- `src="x"`: 이미지 주소. 존재하지 않는 값 `x`를 넣어 일부러 로드 실패를 일으킵니다.
- `onerror="alert(...)"`: 이미지 로드에 실패했을 때 실행되는 이벤트 핸들러. 오류가 나면 따옴표 안의 JavaScript가 바로 실행됩니다.

### 두 레벨에서 배운 점

- Level 1의 해법인 `<script>`가 Level 2에서는 통하지 않았습니다. 같은 취약점 계열이라도 입력이 **어떤 경로로 DOM에 들어가는지**(서버가 HTML로 찍어 주는지, JS가 `innerHTML`로 넣는지)에 따라 먹히는 payload가 달라집니다.
- 필터나 브라우저 동작이 `<script>` 하나를 막아도 실행 경로는 `onerror`, `onload` 같은 이벤트 핸들러로 여전히 열려 있습니다. 그래서 "특정 태그를 막는 것"이 아니라 **입력을 코드로 해석하지 않게 만드는 것**(출력 인코딩, `textContent`)이 방어의 본질입니다.
- Level 2는 3-2절의 source/sink 관점으로도 읽힙니다. 저장된 게시글이 source, `innerHTML`이 sink입니다.

## 7. 다른 웹 취약점 비교: SQL 인젝션

XSS 이외의 취약점으로 SQL 인젝션(SQL Injection)을 공부했습니다. 모의해킹에서 XSS와 함께 가장 중요하게 다뤄지는 웹 취약점입니다. 구조는 XSS와 똑같습니다. **입력값이 '데이터'가 아니라 '명령'으로 해석될 때** 생깁니다. XSS에서는 그 해석 주체가 브라우저(JavaScript)이고, SQL 인젝션에서는 DB(SQL 쿼리)입니다.

### 7-1. 동작 원리

KBO 팀 승률 데이터를 DB에 저장해 두고 팀 정보를 불러오는 앱을 가정합니다. 서버는 이런 쿼리를 만듭니다.

```sql
SELECT * FROM kbo_teams WHERE team_name = '사용자입력값';
```

검색창에 팀 이름 대신 `' OR '1'='1`을 입력하면 완성된 쿼리가 이렇게 바뀝니다.

```sql
SELECT * FROM kbo_teams WHERE team_name = '' OR '1'='1';
```

`'1'='1'`은 항상 참이므로 DB는 팀 이름과 상관없이 모든 행을 돌려줍니다. 입력에 들어 있던 작은따옴표(`'`)가 문자열을 닫아 버리고, 그 뒤가 쿼리의 일부로 해석된 것입니다.

### 7-2. 대표적인 공격 유형

- **인증 우회**: 로그인 폼의 아이디 칸에 인젝션 구문을 넣어 비밀번호 검증을 무력화하고 관리자로 접속
- **데이터 유출(UNION SQLi)**: `UNION`으로 원래 결과 뒤에 다른 테이블(사용자 정보, 암호화된 비밀번호)을 이어 붙여 출력
- **데이터 파괴**: 방어가 매우 약하고 DB 드라이버가 여러 쿼리의 연속 실행(stacked queries)을 허용하면, 세미콜론(`;`)으로 쿼리를 이어 붙여 `DROP TABLE`로 테이블을 삭제

### 7-3. 방어

1. **Prepared Statement(매개변수화된 쿼리)**: 쿼리의 뼈대를 먼저 확정하고 사용자 입력은 변수(Parameter)로만 넘깁니다. 입력에 `'`가 있어도 쿼리를 바꾸는 코드가 아니라 단순한 문자로 취급됩니다. 가장 근본적인 방어입니다.
2. **입력값 검증**: 서버 측에서 허용할 형식을 정해 두고 벗어나면 거부합니다. SQL 예약어(SELECT, UPDATE 등)나 특수기호를 걸러내는 방식은 우회되기 쉬우므로, Prepared Statement를 대신하지 못하는 보조 수단입니다.
3. **최소 권한 원칙**: 웹 서버가 DB에 접속하는 계정에 테이블 삭제나 시스템 제어 권한을 주지 않고, 필요한 읽기·쓰기 권한만 줘서 뚫려도 피해를 제한합니다.

### 7-4. XSS와 SQL 인젝션, 그리고 앞선 논문

| | XSS | SQL 인젝션 |
|---|---|---|
| 섞이는 것 | 데이터 + JavaScript/HTML | 데이터 + SQL |
| 해석하는 쪽 | 피해자의 브라우저 | 서버의 DB |
| 근본 방어 | 출력 인코딩, 안전한 DOM API | Prepared Statement |
| 2차 방어 | CSP, HttpOnly 쿠키 | 최소 권한 계정 |

C언어에서 포인터나 메모리 구조를 공부할 때 데이터와 실행 코드가 섞이지 않게 주의해야 하듯, 웹 보안에서도 사용자의 입력값이 시스템의 명령어 영역을 침범하지 않도록 **격리**하는 것이 핵심입니다. 앞서 정리한 프롬프트 인젝션도 같은 줄기입니다. LLM이 지시와 데이터를 구분하지 못한다는 점에서 SQL 인젝션과 닮았고, IsolateGPT가 앱을 격리하는 이유도 결국 같은 문제의식입니다. 세 가지 모두 "데이터와 명령의 경계"가 무너지는 문제입니다.

## 8. 정리와 앞으로 할 것

**이번에 배운 것을 한 줄로**: 입력은 어디서나 들어오고, 보안은 그 입력이 **명령으로 해석되는 지점에서 경계를 지키는 것**입니다. 웹 기초(URL, HTTP, 쿠키·세션, SOP)는 그 경계가 어디에 있는지 알려 주는 지도였습니다.

**앞으로 할 것**
- [ ] DOM-based XSS는 수업에서 개념만 다뤘으므로 source/sink를 직접 추적해 보기
- [ ] PortSwigger Web Security Academy의 XSS 랩(Reflected → Stored → DOM → CSP 우회) 풀기
- [ ] SQL 인젝션도 직접 실습 환경에서 로그인 우회와 UNION 유출을 재현해 보기
- [ ] 이 블로그(Jekyll + Chirpy)에서 사용자 입력이 들어가는 곳(검색창 등)이 어떻게 처리되는지 점검
- [ ] 프롬프트 인젝션·XSS·SQL 인젝션을 "신뢰 경계" 관점에서 비교하는 글 쓰기

## 참고 자료

- PortSwigger Web Security Academy, "Cross-site scripting" - https://portswigger.net/web-security/cross-site-scripting
- OWASP Cheat Sheet Series, "Cross Site Scripting Prevention" / "DOM based XSS Prevention"
- MITRE CWE-79, "Improper Neutralization of Input During Web Page Generation"
- MDN Web Docs, "Content Security Policy (CSP)"
- YesWeHack, "XSS attacks and exploitation: The ultimate guide to cross-site scripting" (2025)
- Intigriti, "Hunting for reflected XSS vulnerabilities" (2025)
- OWASP Cheat Sheet Series, "SQL Injection Prevention" / "Query Parameterization"
- 동아리 2주차 수업 자료 "웹 기초: Client-Server 구조, HTTP, Cookie/Session, Same-Origin Policy, XSS 기본 개념"
