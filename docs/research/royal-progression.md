# Royal Match 진행 구조와 레벨 조사

조사일: **2026-11-23**. 범위: 원작의 레벨 진행, 목표·이동 횟수, 왕국 복구, 기능 해금, 난이도와 반복 플레이 구조. 게임 코드 변경 없음.

이 문서의 **공식 확인**은 Dream Games 고객지원 또는 개발사 스토어 설명에서 확인한 사실이다. **관찰 후보**는 녹화 자료를 찾았지만 보드 프레임까지 검증하지 않은 항목이다. **구현 제안**은 Chroma Match를 위한 설계 판단이며, 원작 내부 구현이 확인됐다는 뜻이 아니다. 해금 조건과 이벤트는 버전별로 바뀔 수 있으므로 조사일의 공개 설명을 기준으로 한다.

## 1. 핵심 진행 순환 — 공식 확인

`목표와 이동 횟수 확인 → 퍼즐 승리 → 별 획득 → 별로 구역 작업 수행 → 구역 완성·상자 → 다음 구역`

- 각 퍼즐에는 하나 이상의 목표와 제한된 이동 횟수가 있다. 목표를 모두 끝내기 전에 이동 횟수가 소진되면 실패한다. 따라서 “점수 경쟁이 중심이 아니다”와 “이동 횟수가 없다”는 서로 다르다. [공식 게임 방법](https://dreamgames.helpshift.com/hc/en/3-royal-match/faq/3-how-do-i-play-royal-match/)
- 레벨 승리마다 별 1개를 얻는다. [별 획득](https://dreamgames.helpshift.com/hc/en/3-royal-match/faq/16-how-can-i-get-stars-1721127793/)
- 각 구역에는 정해진 작업들이 있고, 별을 사용해 수행한다. 모든 작업을 마치면 구역 상자를 열 수 있다. [작업과 별 사용](https://dreamgames.helpshift.com/hc/en/3-royal-match/faq/15-what-are-tasks-and-how-do-i-complete-them/)
- 한 구역의 작업을 모두 완료한 뒤 다음 구역을 해금한다. 구역 상자의 보상에는 코인·부스터·카드가 포함된다. [구역 해금](https://dreamgames.helpshift.com/hc/en/3-royal-match/faq/17-how-can-i-unlock-a-new-area/), [구역 상자](https://dreamgames.helpshift.com/hc/en/3-royal-match/faq/19-how-can-i-open-the-area-chest/)

**구현에 필요한 구분:** 현재 퍼즐 레벨, 획득·소비한 별, 현재 구역, 완료한 구역 작업은 각각 보존해야 한다. 퍼즐 레벨 번호만으로 왕국 복구 상태를 계산하면 별을 모아 두었다가 쓰는 흐름을 표현할 수 없다. 이는 위 공식 규칙에서 도출한 설계 판단이다.

## 2. 조사일에 공식 확인된 기능 해금

아래 수치는 전체 해금표가 아니라 공식 문서에서 직접 검증한 항목이다. 확인되지 않은 기능의 해금 레벨을 추정해 채우지 않았다.

| 도달 레벨 | 기능 | 공식 설명에서 확인된 조건·행동 | 근거 |
| --- | --- | --- | --- |
| 21 | Teams | 팀 가입·생성 가능. 최대 50명, 온라인 연결 필요 | [What are teams?](https://dreamgames.helpshift.com/hc/en/3-royal-match/faq/52-what-are-teams/) |
| 23 | Team Battle | 레벨 조건 외에 팀 소속 및 팀원 최소 10명 필요. 20개 팀이 경쟁 | [Team Battle](https://dreamgames.helpshift.com/hc/en/3-royal-match/faq/109-team-battle/) |
| 31 | Lightning Rush | 5명 경쟁. Light Ball 사용으로 번개를 수집. 온라인 연결 필요 | [Lightning Rush](https://dreamgames.helpshift.com/hc/en/3-royal-match/faq/116-lightning-rush/) |
| 32 | Butler’s Gift | 연속 승리로 다음 판 시작 부스터가 강화됨. 패배하면 초기화 | [Butler’s Gift](https://dreamgames.helpshift.com/hc/en/3-royal-match/faq/78-what-is-butler-s-gift/) |
| 41 | Collection | 기간제 카드 수집과 세트 보상 | [Collection](https://dreamgames.helpshift.com/hc/en/3-royal-match/faq/332-what-is-collection/) |
| 292 | Super Light Ball | 기능 표시. 활성화하려면 레벨 또는 라운드 10회 승리 | [Super Light Ball](https://dreamgames.helpshift.com/hc/en/3-royal-match/faq/234-what-is-the-super-light-ball/) |
| 고정 번호 없음 | Royal League | 공개된 모든 레벨과 구역 작업 완료 후 진입 | [Royal League](https://dreamgames.helpshift.com/hc/sv/3-royal-match/faq/108-royal-league-1721127793/?l=en) |

### Butler’s Gift의 현재 보상 단계

공식 설명은 연속 승리를 명확히 요구한다. 다음 레벨을 시작할 때 제공되는 부스터는 다음과 같다.

| 단계 | 시작 부스터 |
| --- | --- |
| 1 | Rocket 1 + Propeller 1 |
| 2 | Rocket 1 + Propeller 1 + TNT 1 |
| 3 | Rocket 1 + Propeller 1 + TNT 1 + Light Ball 1 |

최대 단계 이후에도 패배하지 않으면 같은 최대 보상을 유지하며, 실패하면 처음부터 다시 쌓는다. 오래된 공략의 보상 구성과 다를 수 있으므로 현재 공식 표를 기준으로 한다. [공식 Butler’s Gift](https://dreamgames.helpshift.com/hc/en/3-royal-match/faq/78-what-is-butler-s-gift/)

### Super Light Ball의 승리 누적과 활성 상태를 구분

- 레벨 292에서 기능을 볼 수 있다.
- 활성화 조건은 **레벨 또는 라운드 10회 승리**이다. 공식 설명은 이 문장에서 “연속 10승”이라고 명시하지 않는다.
- 활성화하면 Light Ball의 효과가 두 배가 된다.
- 활성 상태는 패배하지 않는 동안 유지된다. 패배하면 초기화되고, 재활성화하려면 다시 레벨 또는 라운드 10회 승리가 필요하다.
- **미확인:** 활성화 전 충전 도중 패배했을 때 기존 승리 카운트를 보존하는지, 차감하는지, 초기화하는지는 이 문서만으로 명확히 판별되지 않는다. Butler’s Gift의 연승 규칙을 그대로 적용하지 않는다. [공식 Super Light Ball](https://dreamgames.helpshift.com/hc/en/3-royal-match/faq/234-what-is-the-super-light-ball/)

## 3. 난이도는 어떻게 올라가는가

### 확인된 범위

공식 자료에는 **Normal / Hard / Super Hard / Extremely Hard** 네 레벨 등급이 등장한다. 높은 등급은 일부 이벤트에서 더 많은 수집 점수를 주기도 한다. 등급을 단순한 화면 장식으로만 취급해서는 안 된다. [코인 획득 공식 설명](https://dreamgames.helpshift.com/hc/en/3-royal-match/faq/21-how-can-i-obtain-and-use-coins/), [Team Battle 점수](https://dreamgames.helpshift.com/hc/en/3-royal-match/faq/109-team-battle/), [Royal League 왕관](https://dreamgames.helpshift.com/hc/sv/3-royal-match/faq/108-royal-league-1721127793/?l=en)

원작은 이동 제한 안에서 목표를 달성해야 하므로, 구현에서는 **보드 모양·초기 블록·장애물·목표 수량·이동 횟수**를 한 레벨의 설계 데이터로 함께 다룰 필요가 있다. 장애물이 가진 타격 횟수·반응 조건과 특수 블록 활용 공간도 체감 난이도에 영향을 준다는 것은 규칙에서 도출한 설계 판단이다. 원작의 실제 난이도 계산 공식이 공개됐다는 뜻은 아니다. [기본 플레이 규칙](https://dreamgames.helpshift.com/hc/en/3-royal-match/faq/3-how-do-i-play-royal-match/)

### 공개 자료로 확정할 수 없는 것

- “5레벨마다 Hard”, “10레벨마다 Super Hard” 같은 고정 배치 주기.
- 레벨 번호에 비례해 이동 수가 일정하게 줄거나 장애물이 일정 비율로 늘어나는 공식.
- 레벨 1–50 각각의 보드 마스크, 초기 블록, 색 수, 정확한 이동 수, 목표 수량 전체 목록.
- 실패 횟수에 따른 드롭 가중치 변경, 개인별 난이도 보정, 숨겨진 확률 조정의 존재와 수식.
- 공식 레벨 편집 도구, 실제 JSON 스키마, 전체 서버 레벨 데이터.
- 모든 레벨에서 고정된 색상 출현 확률 또는 난수 시드 규칙.

따라서 `moves = base - level × k` 같은 식이나 자동 생성 난이도 곡선을 구현한 뒤 “원작과 동일하다”고 설명할 근거는 없다. 이를 만들 경우 **개인 플레이용 재구성 규칙**으로 명시해야 한다.

개발사는 모든 레벨을 부스터나 코인 사용 없이 완료할 수 있다고 설명하지만, 이 주장만으로 각 레벨의 실제 성공률이나 드롭 알고리즘은 알 수 없다. [공식 Level is too hard](https://dreamgames.helpshift.com/hc/en/3-royal-match/faq/9-level-is-too-hard-1661775375/)

## 4. 코인, 목숨, 보너스, 최종 구간

### 코인과 목숨 — 공식 확인

코인은 레벨 승리, 승리 시 남은 이동 수, 보너스 레벨, 구역 상자와 이벤트 등에서 얻으며 추가 목숨·추가 이동·부스터에 사용한다. 난이도 등급별 코인 보상액을 공개 설명만으로 고정하지 않는다. [코인 획득과 사용](https://dreamgames.helpshift.com/hc/en/3-royal-match/faq/21-how-can-i-obtain-and-use-coins/)

일반 목숨 상한은 5개이고 Royal Pass 적용 시 8개이다. 레벨 실패 시 하나를 잃으며 30분마다 하나가 회복된다. 팀으로부터 목숨을 받을 수도 있다. 이는 개인 플레이 구현에서 “무한 목숨” 설정과 분리할 원작 기본 규칙이다. [공식 Lives](https://dreamgames.helpshift.com/hc/en/3-royal-match/faq/5-lives/)

### 보너스 레벨 — 규칙은 확인, 출현 주기는 미확인

보너스 레벨은 주어진 이동 횟수가 끝날 때까지 코인을 수집하며 획득한 코인이 잔액에 추가된다. 그러나 조사한 공식 문서에는 “정확히 몇 레벨마다 출현한다”는 일정이 없다. 일반 레벨의 목표형 진행과 별도 유형으로 저장하는 것은 가능하나 임의의 주기를 원작 사실로 기록하지 않는다. [공식 Bonus Level](https://dreamgames.helpshift.com/hc/ms/3-royal-match/faq/13-what-is-bonus-level/)

### 새로운 레벨과 Royal League — 공식 확인

공식 지원 문서의 추가 주기는 **2주마다**이다. 스토어의 개별 업데이트는 보통 새 레벨 묶음과 구역을 소개하지만, 특정 업데이트의 추가 수량으로 현재 누적 총 레벨 수를 역산하지 않는다. [신규 레벨](https://dreamgames.helpshift.com/hc/en/3-royal-match/faq/40-how-can-i-play-new-levels/), [개발사 Google Play 페이지](https://play.google.com/store/apps/details?id=com.dreamgames.royalmatch&hl=en)

공개된 모든 레벨과 구역 작업을 마치면 Royal League가 열린다. 다른 19명과 경쟁하며 라운드 승리로 왕관을 모은다. Gold·Emerald·Diamond의 세 단계가 있고 각각 여러 목표·보상 구간으로 구성된다. 새로운 레벨이 공개되면 해당 리그가 종료되며 왕관은 다음 리그로 이전되지 않는다. 즉, 리그 해금은 변하는 콘텐츠 끝 지점을 기준으로 하며 고정된 레벨 번호가 아니다. [공식 Royal League](https://dreamgames.helpshift.com/hc/sv/3-royal-match/faq/108-royal-league-1721127793/?l=en)

### 왕 구출 미니게임 — 추가 관찰 필요

King’s Nightmare/왕 구출 장면의 존재를 보여 주는 영상 후보는 확보했지만, 이 조사에서 공식 해금 레벨·정확한 출현 주기·모든 변형의 규칙을 검증하지 못했다. 광고에 등장하는 모든 구출 장면을 기본 매치-3 레벨의 반복 구조로 일반화하지 않는다.

## 5. 실제 초반 레벨을 기록하기 위한 영상 후보

아래는 **검색 결과의 제목·업로더·게시일을 확인한 자료 목록**이다. 이 문서에서는 영상 전체를 재생하거나 각 보드 프레임을 채점하지 않았으므로 레벨별 정확한 보드·이동 횟수의 증거로 사용하지 않았다.

| 영상 | 자료 메타데이터 | 다음 조사 용도 |
| --- | --- | --- |
| [New Account Gameplay, Level 01–10](https://www.youtube.com/watch?v=j-ABGQGo_1k) | Harshal Karvande, 2026-03-24 | 튜토리얼 순서, 초기 목표, 특수 블록 소개 |
| [New Account Gameplay, Level 01–50](https://www.youtube.com/watch?v=ZRkyBxLXCY4) | Harshal Karvande, 2026-03-24 | 초반 50레벨의 보드와 목표를 한 계정 버전에서 채집 |
| [New Account Gameplay, Level 21–30](https://www.youtube.com/watch?v=uBD94pOjhi8) | Harshal Karvande, 2026-03-24 | 초반 해금 및 레벨 전후 UI 확인 |
| [Levels 161–179 gameplay](https://www.youtube.com/watch?v=df1wOeJLmVc) | maxplays, 2026-04-22 | Hard·Super Hard·Extremely Hard 표시와 중간 미니게임 관찰 |

마지막 영상의 게시자 설명에는 165 Super Hard, 169 Extremely Hard, 172 Hard, 175 Super Hard, 179 Extremely Hard와 King’s Nightmare 구간이 표기돼 있다. 이는 **게시자 메타데이터**이며 프레임 검증 결과가 아니다. 이 예시에서 전체 게임의 고정 난이도 주기를 추론하면 안 된다.

추가 검토 후보로 [Tom Storr의 신규 계정 온보딩 관찰](https://www.linkedin.com/posts/tomstorr_q-why-does-royal-match-wait-22-levels-to-activity-7457319477009928192-Pid9)이 있다. 개별 계정·버전의 분석이므로 공식 고정 해금표와 구별해야 한다. 해당 글의 레벨별 수치를 아직 이 프로젝트의 확정 레벨 데이터에 반영하지 않았다.

실제 채집 시에는 한 버전을 고정하고 다음 항목을 레벨마다 기록해야 한다.

1. 녹화 날짜·앱 버전·계정 조건 및 시작 부스터 유무.
2. 레벨 번호·등급·시작 이동 수·목표 종류와 수량.
3. 보드의 행·열 수와 유효 칸 마스크, 입구·출구·분리 공간.
4. 초기 블록·장애물의 위치, 레이어·내구도, 튜토리얼 강제 동작.
5. 성공·실패 시 후속 화면과 별·코인·연승 상태의 변화.
6. 확정값과 영상에서 읽히지 않는 값을 분리한 검증 상태.

사용자가 첨부한 녹화는 추가 설명과 [재시도 사진](level-12297-retry.jpg)으로 **레벨 12297**임을 확인했다. 이 장면은 해당 레벨의 별도 관찰 기록으로 연결한다. 사용자가 설명한 매 게임의 보드 변화를 지원하도록 레벨별 설계 데이터와 재시도 시 블록 배치를 구분한다. 해당 짧은 영상에 나오지 않는 다른 레벨의 데이터를 추정해 채우지 않는다.

## 6. Chroma Match 구현을 위한 결정 사항 — 제안

개인용 게임에서 원작의 플레이 구조를 재현하려면 최소한 아래 데이터를 분리해야 한다. 실제 원작의 내부 자료형을 복원했다는 의미는 아니다.

| 데이터 | 저장할 내용 |
| --- | --- |
| 레벨 | 번호, 등급, 보드 마스크, 초기 블록, 장애물 레이어·상태, 목표, 이동 제한, 스폰 정책, 튜토리얼 |
| 퍼즐 진행 | 현재 레벨, 완료 여부, 재시도 횟수, 선택된 시작 부스터 |
| 왕국 진행 | 별 잔액, 구역, 작업별 완료 상태와 별 비용, 상자 수령 여부 |
| 연속 승리 보상 | Butler’s Gift 단계와 리셋 조건 |
| Super Light Ball | 해금 여부, 활성화 승리 카운트, 활성 여부. 충전 중 패배 처리는 추가 확인 후 결정 |
| 개인 설정 | 레벨 선택, 이동 횟수 조정, 무한 목숨, 부스터 제공량, 스폰 시드, 보드·장애물 편집 |
| 출처 | 각 레벨·규칙의 녹화 시점, 원본 링크, 공식/관찰/재구성 구분 |

개인 설정은 원작 규칙과 별도의 덮어쓰기 값으로 두면 기본 규칙을 보존하면서 자유롭게 실험할 수 있다. 온라인 팀과 경쟁 이벤트는 혼자 즐기는 목적의 필수 조건이 아니므로 퍼즐·보드·특수 블록·목표·레벨 편집을 우선한다. 로컬 이벤트를 추가할 경우 실제 사용자와 경쟁한다는 표시는 하지 않는다.

**현 시점에서 준비된 것:** 공개 규칙과 해금 조건을 구현 명세의 근거로 사용할 수 있다. **아직 준비되지 않은 것:** 원작 전체 레벨의 정확한 보드 데이터, 비공개 난수·난이도 알고리즘, 모든 이벤트의 최신 고정 출현 일정. 이 자료 수집만으로 원작 전체를 완전히 동일하게 재현할 수 있다고 확정할 수는 없다.
