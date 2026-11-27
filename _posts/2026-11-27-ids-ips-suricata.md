---
title: IDS/IPS 정리와 Suricata 실습
date: 2026-11-27 21:10:00 +0900
categories: [블로그/기술문서]
tags: [ids, ips, suricata, network-security, rule, HSKF 3기]
---

> IDS/IPS가 무엇이고 어떻게 탐지하는지 먼저 정리하고, 대표 오픈소스 IDS인 Suricata의 동작과 Rule 구조를 살펴본다. 뒤에서는 동아리 수업에서 실제 침해사고 PCAP을 Suricata로 분석하고, 탐지 Rule을 직접 만들어 본 과정을 이어서 정리한다.
{: .prompt-tip }

## 1. IDS/IPS가 필요한 이유
네트워크에는 하루에도 수많은 패킷이 오간다. 사람이 Wireshark 같은 도구로 패킷을 하나씩 열어 보는 방식으로는 그 전부를 볼 수 없다. 그래서 트래픽을 자동으로 검사해 **"먼저 볼 대상"을 추려 주는 장치**가 필요하고, 그 역할을 하는 것이 IDS/IPS다.

이렇게 네트워크 활동을 기록하고 의심 행위를 빨리 식별할 수 있는 상태를 만드는 활동을 **NSM(Network Security Monitoring)**이라고 한다. 관찰 대상은 통신 주체(IP/Port), 통신 방식(TCP/UDP, HTTP·DNS·TLS), 의심 여부(알려진 공격 패턴, 비정상 특징)다.

## 2. IDS와 IPS
- **IDS (Intrusion Detection System):** 미러링된 트래픽 사본을 보고 공격으로 판단되는 행위를 탐지해 **Alert를 만든다.** 통신 자체는 막지 않는다.
- **IPS (Intrusion Prevention System):** 통신 경로 중간에 **Inline**으로 끼어 있다가 공격 트래픽을 정책에 따라 **Drop / Reject로 차단**한다.

| 구분 | IDS | IPS |
|---|---|---|
| 목적 | 공격 탐지 | 공격 탐지 + 차단 |
| 배치 | 미러링된 트래픽 관찰 | 통신 경로에 Inline |
| 결과 | Alert 생성 | Alert 생성, Drop/Reject |
| 장애 영향 | 상대적으로 낮음 | 오탐·설정 오류 시 **정상 통신까지 차단** 가능 |

IPS는 막을 수 있는 대신 **탐지 정확도와 서비스 영향도를 같이 고려**해야 한다.

### 탐지 방식
| 방식 | 원리 | 장점 | 단점 |
|---|---|---|---|
| 시그니처 기반 (Misuse) | 알려진 공격 패턴(Rule)과 비교 | 오탐이 적고, 왜 탐지됐는지 설명하기 쉽다 | 패턴이 없는 새 공격(제로데이)·변형 공격에 약하다 |
| 이상 탐지 기반 (Anomaly) | 평소 기준선(Baseline)과 다른 행동을 의심 | 모르는 공격도 잡을 가능성이 있다 | 오탐이 많고, 기준선을 잡는 학습 기간이 필요하다 |

실제 제품은 둘을 섞어 쓴다. Suricata는 Rule(시그니처) 중심이지만 프로토콜 이상(잘못된 HTTP 헤더 등)도 Event로 남긴다.

### 설치 위치에 따른 종류
| 종류 | 보는 곳 | 장점 | 한계 |
|---|---|---|---|
| NIDS / NIPS | 네트워크 구간 (스위치 미러 포트, 경계 구간) | 한 센서로 여러 호스트를 본다 | 암호화된 트래픽(TLS)의 내용은 보기 어렵고, 호스트 안에서 무슨 일이 있었는지는 모른다 |
| HIDS / HIPS | 개별 호스트 (서버·PC의 로그, 파일 무결성, 프로세스) | 암호화가 풀린 뒤의 행위, 실행 결과까지 본다 | 호스트마다 설치·관리해야 하고, 호스트가 장악되면 무력화될 수 있다 |

### 판정 결과: 오탐과 미탐
| | 실제 공격 | 정상 |
|---|---|---|
| **Alert 발생** | 정탐 (True Positive) | **오탐** (False Positive) |
| **Alert 없음** | **미탐** (False Negative) | 정상 (True Negative) |

IDS에서 오탐이 많으면 분석가가 Alert에 지쳐 진짜를 놓치고(Alert 피로), IPS에서 오탐은 곧 **정상 서비스 차단**이다. 반대로 미탐은 조용히 지나간다. 뒤의 실습에서 실제 미탐 사례를 직접 확인한다.

### 장단점 정리
| | IDS | IPS |
|---|---|---|
| 장점 | 서비스에 영향을 주지 않고 도입 가능, 사후 분석용 기록 확보 | 공격을 실시간으로 막는다, 자동 대응 |
| 단점 | 막지는 못한다, Alert를 사람이 처리해야 한다 | 오탐 시 서비스 장애, Inline 장비라 성능 병목·단일 장애점이 될 수 있다 |

### 어디에 쓰이나 (활용)
- **경계 구간:** 인터넷과 내부망 사이에서 알려진 익스플로잇, 악성 다운로드, C2 통신 탐지·차단
- **내부망 모니터링:** 서버 대역 간 측면 이동(RDP, SMB), 내부 스캔 탐지
- **침해사고 분석:** 저장된 PCAP을 다시 돌려 Alert와 Event로 빠르게 훑기
- **SIEM 연동:** `eve.json`을 SIEM에 보내 다른 장비 로그와 상관분석

## 3. 대표 도구와 주변 솔루션
- **Suricata:** 네트워크 트래픽을 실시간으로 분석해 공격을 탐지(및 차단)하는 오픈소스 IDS/IPS. 뒤의 실습에서 사용한다.
- **Snort / Zeek / Wireshark:** Snort는 오래된 룰 기반 IDS/IPS, Zeek는 네트워크 활동을 로그로 풀어 분석하는 프레임워크, Wireshark는 사람이 패킷을 직접 보는 도구.

IDS/IPS는 여러 보안 솔루션 중 네트워크 영역을 맡는다. 영역별로 보면 아래와 같다.

| 영역 | 솔루션 | 다루는 데이터 |
|---|---|---|
| Network | IDS / IPS / NDR | 네트워크 트래픽, Flow, DNS, HTTP, TLS |
| Endpoint | EDR | 프로세스, 파일, Registry 행위 |
| Central | SIEM | 여러 장비 로그의 수집·검색·상관분석 |
| Cross-domain | XDR | Endpoint·Network·Cloud를 연결한 사건 단위 분석 |

Suricata는 이 중 **Network 영역의 센서**로, 네트워크 Telemetry와 Alert를 다른 솔루션(SIEM 등)에 넘겨주는 역할이다.

## 4. Suricata는 어떻게 동작하나
```text
입력(트래픽/PCAP) → 패킷 분석 → 프로토콜 분석(Flow, HTTP, DNS, RDP…) → Rule 비교 → Alert/차단 + 로그(eve.json)
```
실시간 감시와 PCAP 분석은 **같은 엔진**이다. 입력이 실시간 트래픽에서 저장된 파일로 바뀔 뿐이다.

### 분석 단위: Packet → Incident
| 단위 | 의미 |
|---|---|
| Packet | 개별 데이터 |
| Flow | 같은 통신에 속한 패킷을 세션으로 묶은 것 |
| Event | HTTP 요청, DNS 질의, TLS 핸드셰이크 등 의미 있는 활동 |
| Alert | Rule 조건에 일치해 생성된 탐지 결과 |
| Incident | 분석 결과 실제 사고로 판단된 사건 |

핵심은 **Alert ≠ Incident**라는 점이다. Alert는 출발점일 뿐이고, 원본 PCAP과 호스트 증거까지 봐야 사고 여부를 판단한다. Flow는 **5-Tuple**(Source IP, Source Port, Destination IP, Destination Port, Protocol)로 구분한다.

### Rule 구조
```text
alert tcp $EXTERNAL_NET any -> $HOME_NET 22 (msg:"SSH"; sid:1000010; rev:1;)
[액션] [프로토콜] [출발지IP] [출발지포트] -> [도착지IP] [도착지포트] (옵션들)
```
- **액션:** `alert`(탐지만, 통신은 그대로), `pass`(검사 통과, Alert 없음), `drop`/`reject`(차단, IPS Inline 모드에서만 의미 있음)
- **프로토콜:** `tcp/udp/icmp`는 전송 계층 기준, `http/dns/tls`는 Suricata가 해석한 응용 프로토콜 기준
- **IP/Port 표기:** 단일값, 대역(`10.0.0.0/24`), 목록(`[80,443]`), `any`, 부정(`!80`), 변수(`$HOME_NET`)
- **방향:** `->`는 한 방향만, `<>`는 양방향. 순서를 바꾸면 의미가 반대가 된다.
- **옵션:** `msg`(Alert 이름), `sid`(고유 번호, 직접 만든 Rule은 1000000~1999999), `rev`(수정 버전), `content`(패킷 내용 조건) 등

### 출력 로그
| | fast.log | eve.json |
|---|---|---|
| 형식 | 한 줄 텍스트 | JSON (한 줄 = Event 하나) |
| 내용 | Alert 위주 | alert, flow, http, dns, tls, rdp 등 |
| 용도 | 탐지 건수 빠른 확인 | 상세 분석, SIEM 연동 |

`event_type` 필드로 Event 종류를 구분하고, `jq`로 필드를 뽑아 분석한다.

---

## 5. 동아리 수업 실습: Case 001 PCAP을 Suricata로 분석하기
여기부터는 동아리 6주차 수업(IDS/IPS · Suricata)에서 진행한 실습이다. 5주차에 Wireshark로 직접 분석했던 침해사고 PCAP(`case001.pcap`)을 이번에는 Suricata로 다시 분석했다.

| 5주차: 수동 분석 (Wireshark) | 6주차: 자동 탐지 (Suricata) |
|---|---|
| PCAP 열기 → 필터 입력 → 스트림 추적 → 의심 패킷 확인 → 분석가가 판단 | 트래픽 입력 → Rule/분석 엔진으로 검사 → Alert 생성 → 분석가가 우선순위 판단 |

이번 실습은 저장된 PCAP을 분석하는 것이라 Suricata를 IDS(탐지) 용도로만 썼다.

### 5-1. 5주차 분석 결과 (이번 실습의 정답지)
| 단계 | 내용 |
|---|---|
| 초기 침입 | 194.61.24.102 → DC01 RDP 접속 |
| 악성코드 | `coreupdater.exe` 다운로드·실행 |
| C2 통신 | 203.78.103.109:443 |
| 내부 이동 | DC01 → Desktop (Lateral Movement) |
| 정보 유출 | 민감정보 접근·유출 정황 |

목표는 이 흔적들을 Suricata가 **자동으로 잡아내는지** 확인하고, 못 잡는 게 있으면 Rule을 만들어 보완하는 것이다.

### 5-2. 환경 준비
Windows의 WSL(Ubuntu)에서 PPA로 Suricata를 설치하고 Rule을 갱신했다.
```bash
sudo add-apt-repository -y ppa:oisf/suricata-stable
sudo apt update && sudo apt install -y suricata jq curl
sudo suricata-update
sudo suricata -T -c /etc/suricata/suricata.yaml     # 설정 검사
```
기본 Rule만 약 6만 9천 개가 들어 있다.

### 5-3. 기본 Rule로 PCAP 분석
```bash
mkdir -p ~/week6/logs/default
sudo suricata -r case001.pcap -c /etc/suricata/suricata.yaml -l ~/week6/logs/default
```
- `-r` 저장된 PCAP 분석 / `-c` 설정 파일 / `-l` 로그 저장 폴더
- 마지막에 `read 1 file, 411797 packets`가 나오면 PCAP을 끝까지 읽은 것이다. `Signal Received. Stopping engine.`은 에러가 아니라 파일을 다 읽고 정상 종료했다는 뜻이다.

### 5-4. 미션 1: 5주차 증거가 실제로 잡혔을까?

**① Alert는 총 몇 건?**
```bash
jq -c 'select(.event_type=="alert")' ./logs/default/eve.json | wc -l
```
→ **479건**

**② 어떤 Signature가 많이 발생했나?**
```bash
jq -r 'select(.event_type=="alert") | .alert.signature' ./logs/default/eve.json | sort | uniq -c | sort -nr
```
→ 가장 많은 것은 `ET INFO RDP - Response To External Host` (**200건**). 그다음으로 `ET REMOTE_ACCESS MS Remote Desktop Administrator Login Request`가 198건으로 나왔다. RDP 관련 Rule은 이미 꽤 많이 걸린 셈이다.

**③ 공격자 IP 194.61.24.102 관련 Event**
```bash
jq -c 'select(.src_ip=="194.61.24.102" or .dest_ip=="194.61.24.102")' ./logs/default/eve.json | wc -l
```
→ **59,243건.** 외부 공격자와의 RDP 통신이 대량으로 기록돼 있었다. (Alert만이 아니라 flow, rdp 등 모든 Event를 센 값이다.)

**④ C2 주소 203.78.103.109 관련 Event**
```bash
jq -c 'select(.src_ip=="203.78.103.109" or .dest_ip=="203.78.103.109")' ./logs/default/eve.json | wc -l
```
→ **25건.**

**⑤ coreupdater.exe 관련 HTTP 흔적**
```bash
grep '"dest_port":80' ./logs/default/eve.json | grep -i "coreupdater.exe"
```
→ HTTP Event가 확인됐다. 수업 자료의 화면 기준으로는 `GET /coreupdater.exe` 요청에 서버가 `200`으로 응답한 흔적이다. 단, **다운로드 요청과 응답까지만 알 수 있고 실행 여부는 5주차 호스트 증거로 판단**해야 한다.

> ✏️ 실행 결과 화면(캡처)은 **추후 보완 예정**입니다.
{: .prompt-info }

### 5-5. 미션 1-a: DC01 → Desktop RDP는 잡혔을까?
5주차에서 확인한 내부 이동(DC01 `10.42.85.10` → Desktop `10.42.85.115`)을 단계별로 좁혀 봤다.

**1단계 - 둘 사이에 통신이 있나?**
```bash
jq 'select(.src_ip=="10.42.85.10" and .dest_ip=="10.42.85.115")' ./logs/default/eve.json
```
→ 있다. 다만 RDP가 아닌 krb5, dns 같은 통신도 섞여 있어서 포트로 좁혔다.

**2단계 - 3389(RDP) 통신인가?**
```bash
jq 'select(.src_ip=="10.42.85.10" and .dest_ip=="10.42.85.115" and .dest_port==3389)' ./logs/default/eve.json
```
→ `event_type: "rdp"`로 기록돼 있다. Suricata가 이 통신을 **RDP로 해석까지 했다**는 뜻이다. 그런데 flow에는 `alerted: false`였다.

**3단계 - 같은 조건에서 Alert가 있나?**
```bash
jq 'select(.event_type=="alert" and .src_ip=="10.42.85.10" and .dest_ip=="10.42.85.115" and .dest_port==3389)' ./logs/default/eve.json
```
→ **아무 결과도 나오지 않았다.**

### 5-6. 이 "빈 결과"가 말해 주는 것
- 통신은 **있었다**(1단계). Suricata가 RDP로 **인식도 했다**(2단계). 그런데 Alert는 **없다**(3단계).
- 기본 Rule에 RDP 관련 Rule이 있고 Alert도 많이 났지만, **DC01 → Desktop:3389라는 조건과는 하나도 맞지 않았다.**
- RDP는 정상 환경에서도 쓰는 원격 접속 프로토콜이라, Suricata가 무조건 위협으로 보지 않는다.

```text
Traffic 존재 → 패킷/프로토콜 분석 → 현재 Rule과 일치?
                                    ├ YES: Alert
                                    └ NO : Alert 없음 (flow, rdp 기록만 남음)
```
**"Suricata가 패킷을 봤다" ≠ "Alert를 발생시켰다."** 악성 행위라고 우리가 이미 알고 있어도, 그걸 잡는 Rule이 없으면 Alert는 없다. 그래서 상황에 맞는 Rule을 직접 만들어야 한다.

---

## 6. 수업 과제: Suricata Rule로 내부 RDP 통신 탐지하기

### 6-1. 작성한 Rule
```text
alert tcp 10.42.85.10 any -> 10.42.85.115 3389 (msg:"RDP Connection DC01 -> Desktop"; sid:1000001; rev:1;)
```

| 부분 | 의미 |
|---|---|
| `alert` | 조건이 일치하면 Alert 생성 |
| `tcp` | RDP는 TCP를 사용하므로 TCP 트래픽 검사 |
| `10.42.85.10 any` | 출발지 IP(DC01), 출발지 Port는 접속마다 바뀌므로 제한하지 않음(`any`) |
| `->` | 출발지에서 목적지로 가는 한 방향만 검사 |
| `10.42.85.115 3389` | 목적지 IP(Desktop)의 3389(RDP) 포트 |
| `msg` | `fast.log`와 `eve.json`에 표시될 이름 |
| `sid:1000001` | 직접 만든 Rule의 고유 번호 (1000000번대) |
| `rev:1` | Rule 수정 버전. 고칠 때마다 올린다 |

### 6-2. 적용 과정
```bash
# 1) Rule 파일 생성
cat > local.rules << EOF
alert tcp 10.42.85.10 any -> 10.42.85.115 3389 (msg:"RDP Connection DC01 -> Desktop"; sid:1000001; rev:1;)
EOF

# 2) 문법 검사 (-T: 실제 분석 없이 설정/Rule만 로드해서 확인)
sudo suricata -T -S local.rules

# 3) 같은 PCAP을 이 Rule로 다시 분석 (-S: 지정한 Rule 파일만 로드)
sudo suricata -r case001.pcap -S local.rules -l logs

# 4) 결과 확인
cat logs/fast.log
```

| 단계 | 결과 |
|---|---|
| 문법 검사 | Suricata 8.0.7, `Configuration provided was successfully loaded` → 문법 오류 없음 |
| PCAP 분석 | 411,797개 패킷, 183,854,754바이트를 끝까지 읽음 |
| fast.log | 아래 Alert 생성 |

```text
09/19/2020-11:35:55.285340 [**] [1:1000001:1] RDP Connection DC01 -> Desktop [**] [Classification: (null)] [Priority: 3] {TCP} 10.42.85.10:62514 -> 10.42.85.115:3389
```

### 6-3. 결과 분석
- SID 1000001번 Rule이 정상적으로 동작했다.
- 출발지는 `10.42.85.10`(DC01), 목적지는 `10.42.85.115`(Desktop), 목적지 포트는 `3389/TCP`(RDP)로 Rule 조건과 일치한다.
- 출발지 포트 `62514`는 클라이언트가 접속할 때 임시로 쓰는 포트(Ephemeral Port)라서, Rule에서 `any`로 둔 게 맞았다.
- 기본 Rule로는 0건이던 DC01 → Desktop RDP 통신이, 직접 만든 Rule로 **Alert로 잡혔다.**

### 6-4. 한계와 개선 방향
이 Rule은 5주차에서 **이미 알고 있는 IP/포트 조합**(IOC)을 그대로 옮긴 것이다. 그래서 같은 공격자가 다른 호스트로 이동하면 놓친다. 또 내부 RDP는 관리자도 정상적으로 쓸 수 있어서, 지금 Rule은 **"이 통신이 있었다"를 알려 줄 뿐 악성 여부는 말해 주지 않는다.**

개선하려면 아래 같은 **행위 기반** 조건으로 넓혀야 한다.
- 도메인 컨트롤러가 일반 PC로 RDP 접속하는 비정상 패턴(출발지를 서버 대역 전체로 일반화)
- 짧은 시간 안에 여러 내부 호스트로 3389 접속이 퍼지는 행위(횟수/시간 임계값)
- `flags:S`처럼 연결 시작 패킷만 보게 해서 Alert 중복을 줄이기 (수업 중 경고 메시지에서 언급된 옵션)

예를 들면 이런 형태다. (아직 실행해 보지 않은 초안)
```text
# 연결 시작(SYN)만 보고, 같은 출발지 기준 60초에 한 번만 Alert
alert tcp 10.42.85.0/24 any -> 10.42.85.0/24 3389 (msg:"Internal RDP connection attempt"; flow:to_server; flags:S; threshold:type limit, track by_src, count 1, seconds 60; sid:1000002; rev:1;)
```

> ✏️ 개선한 Rule의 실제 적용 결과와 Alert 건수(`wc -l logs/fast.log`) 비교는 **추후 보완 예정**입니다.
{: .prompt-info }

## 7. 정리
1. IDS는 **탐지**, IPS는 **탐지 + 차단**이다. 차단은 서비스 영향이 있어 신중해야 한다. 탐지 방식(시그니처/이상)과 위치(NIDS/HIDS)는 서로 보완 관계다.
2. Suricata의 `eve.json`에는 Alert 말고도 flow/http/dns/rdp 등 **관찰된 Event**가 남는다. 분석은 보통 fast.log로 훑고 eve.json으로 파고든다.
3. **트래픽이 있다고 Alert가 있는 건 아니다.** 알고 있는 공격이라도 맞는 Rule이 없으면 조용하다.
4. Alert는 Incident가 아니다. Alert → 원본 PCAP → 호스트 증거 순으로 검증해야 한다.
5. 그래서 기존 Rule에만 기대지 않고, **분석으로 얻은 Context를 Rule로 바꾸는 연습**이 필요하다.

## 내 생각

> ✏️ 실습을 마치고 느낀 점과 다음에 해 보고 싶은 것은 **추후 보완 예정**입니다.
{: .prompt-info }

## 참고 자료
- CodeCure 6주차 수업 자료 (네트워크 침해 탐지, IDS/IPS · Suricata)
- Suricata 공식 문서 (Rules, EVE JSON)
- NIST SP 800-94 (Guide to Intrusion Detection and Prevention Systems)
