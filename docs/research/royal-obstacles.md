# Royal Match 장애물·목표 요소 조사

조사일: 2026-11-23. 기준: Dream Games 공식 도움말 개별 문서와 그 문서에 연결된 공식 이미지. 한국어 이름은 이해를 돕기 위한 번역이며, 게임 내 공식 번역과 다를 수 있다. 이 문서는 조사 자료이며 구현 명세를 확정한 것은 아니다.

공식 [Game Elements 목록](https://dreamgames.helpshift.com/hc/en/3-royal-match/section/56-game-elements-1732263700/)은 100개가 넘는 항목을 노출한다. 아래 26종은 핵심 동작 유형을 대표하는 표본이다. 사용자 추가 사진을 대조하면서 Dynamite Box를 추가했다. 목록의 나열 순서를 실제 등장 레벨 순서로 해석하지 않는다. 개별 문서에 도입 레벨이 없으면 도입 레벨은 미확인이다.

## 먼저 바로잡아야 할 현재 구현

- **영상의 빨간 리본 블록은 Gift Box와 외형이 일치한다.** 공식 이미지의 금색 띠·파란 리본·세로 2칸 실루엣이 영상과 같다. 이름을 단순 리본으로 붙이고 인접 매치 1번에 지우면 원작과 다르다. 공식 규칙은 인접 매치 4번으로 열어 Toys를 수집하는 것이다. [Gift Box](https://dreamgames.helpshift.com/hc/en/3-royal-match/faq/423-gift-box/)
- **Ice는 특수 공격 전용이 아니다.** 공식 설명은 인접 매치로 타격하며 매 타격마다 길이가 줄어드는 구조다. 현재 구현의 고정 2회·특수 공격 전용 얼음은 수정 대상이다. 특수 공격 3회로 부수는 공식 요소는 Stone이다. [Ice](https://dreamgames.helpshift.com/hc/en/3-royal-match/faq/365-ice/), [Stone](https://dreamgames.helpshift.com/hc/en/3-royal-match/faq/370-stone/)
- **보라색 바닥 목표는 제거형과 확산형을 구분해야 한다.** 영상의 보라색 목표 아이콘은 공식 Jelly 이미지와 일치하는 것으로 보인다. Jelly는 그 위에서 매치하여 보드에 퍼뜨리는 목표다. Grass처럼 위에서 매치해 없애는 바닥과 정반대다. 영상만으로 해당 레벨의 모든 확산 대상 칸을 판정할 수는 없다. [Jelly](https://dreamgames.helpshift.com/hc/en/3-royal-match/faq/392-jelly/), [Grass](https://dreamgames.helpshift.com/hc/en/3-royal-match/faq/352-grass/)
- **모든 장애물은 같은 내구도 블록이 아니다.** 컬러 조건, 열림/닫힘, 연속 매치, 생성, 바닥 확산, 낙하 수집, 여러 칸이 공유하는 상태가 각각 필요하다. 이 구분은 아래 공식 규칙으로부터 도출한 구현상의 요구사항이다.

## 대표 26종: 공식 문서로 확인한 규칙

표의 '미확인'은 없는 기능이라는 뜻이 아니라, 링크한 공식 도움말이 설명하지 않은 세부 동작이다. '인접 매치'만 적힌 항목에서 모든 종류의 파워업·도구도 동일하게 작동한다고 자동 확대하지 않는다.

| # | 공식 명칭 / 작업용 번역 | 공식 문서로 확인한 작동 | 수치·조건 / 아직 확인할 것 |
|---|---|---|---|
| 1 | **Box / 상자** | 옆에서 매치하면 손상·파괴. 여러 겹 상자는 여러 번 필요. | 겹수별 정확한 허용 범위·직접 공격 중복 처리 미확인. [공식](https://dreamgames.helpshift.com/hc/en/3-royal-match/faq/351-box/) |
| 2 | **Grass / 잔디** | 해당 바닥 위에서 매치해 제거. | **2회** 매치. 아래층과 위 블록이 함께 존재하는 바닥형으로 분리할 근거. [공식](https://dreamgames.helpshift.com/hc/en/3-royal-match/faq/352-grass/) |
| 3 | **Cupboard / 찬장** | 인접 매치로 문을 열며, 안의 접시를 모두 깨면 해당 목표 완료. | 접시 개수는 문서에 고정값 없음. 단순히 문만 열었다고 완료하면 안 됨. [공식](https://dreamgames.helpshift.com/hc/en/3-royal-match/faq/353-cupboard/) |
| 4 | **Potion Bottle / 물약병** | 인접한 **같은 색** 매치로 병을 깨뜨림. | 다른 색 인접 매치는 조건 불충족. 파워업별 예외는 미확인. [공식](https://dreamgames.helpshift.com/hc/en/3-royal-match/faq/356-potion-bottle/) |
| 5 | **Bird / 새** | 보드 맨 아래로 내려보내 수집. | 제거 타격형이 아닌 목적지 수집형. 출구 위치·구멍과의 관계는 레벨별 관찰 필요. [공식](https://dreamgames.helpshift.com/hc/en/3-royal-match/faq/362-bird/) |
| 6 | **Ice / 얼음** | 인접 매치로 타격할 때마다 길이가 짧아짐. | 전체 길이·방향은 개별 보드 속성. 고정 2 HP라고 단정 불가. [공식](https://dreamgames.helpshift.com/hc/en/3-royal-match/faq/365-ice/) |
| 7 | **Curtain / 커튼** | 요구된 색 아이템을 정해진 수만큼 모으면 열리고 아래 요소가 드러남. | 인접 매치 누적형과 다름. 수집 수치는 문서에 고정값 없음. [공식](https://dreamgames.helpshift.com/hc/en/3-royal-match/faq/367-curtain/) |
| 8 | **Stone / 돌** | 파워업으로 타격해 파괴. | **3회** 파워업 타격. 일반 인접 매치 조건은 설명되지 않음. [공식](https://dreamgames.helpshift.com/hc/en/3-royal-match/faq/370-stone/) |
| 9 | **Birdhouse / 새집** | 옆에서 여러 번 매치해 부수면 새가 나오며, 그 새를 보드 아래까지 내려 수집. | **5회 → 새 3마리**. 생성과 수집이라는 두 단계 목표. [공식](https://dreamgames.helpshift.com/hc/en/3-royal-match/faq/373-birdhouse/) |
| 10 | **Flowerpot / 화분** | 인접 매치로 부서지고 주변에 Leaves를 생성. 잎 위 매치로 잎 제거. | **2회 → 주변 9칸 잎**. 빈 칸·보드 밖 처리 미확인. [공식](https://dreamgames.helpshift.com/hc/en/3-royal-match/faq/376-flowerpot/) |
| 11 | **Metal Tube / 금속 관** | 파워업 타격마다 길이가 줄어듦. | Ice와 유사한 길이형이지만 트리거가 다름. 초기 길이는 미확인. [공식](https://dreamgames.helpshift.com/hc/en/3-royal-match/faq/380-metal-tube/) |
| 12 | **Chain / 사슬** | 파워업으로 깨면 아래 아이템을 해방. | 겹쳐진 덮개 상태와 아래 내용물을 따로 보존해야 함. [공식](https://dreamgames.helpshift.com/hc/en/3-royal-match/faq/384-chain/) |
| 13 | **Pouch / 주머니** | 인접 매치를 누적해 열면 파워업이 나옴. | **3회 → 파워업 1개**. 종류 선택·배치 규칙 미확인. [공식](https://dreamgames.helpshift.com/hc/en/3-royal-match/faq/385-pouch/) |
| 14 | **Lantern / 랜턴** | 연속으로 인접 매치해야 파괴. | **연속 2회**. 연쇄 매치가 '연속'에 포함되는 방식은 추가 검증 필요. [공식](https://dreamgames.helpshift.com/hc/en/3-royal-match/faq/386-lantern/) |
| 15 | **Jelly / 젤리** | 젤리가 있는 칸 위 매치로 젤리를 퍼뜨림. 보드 전체에 퍼지면 목표 완료. | 확산 대상·도약·특수 블록 전파 규칙은 미확인. 제거형 바닥과 혼동 금지. [공식](https://dreamgames.helpshift.com/hc/en/3-royal-match/faq/392-jelly/) |
| 16 | **Mole Box / 두더지 상자** | 연속으로 인접 매치해야 파괴. | **연속 4회**. 미타격 턴 때 복구 단계는 실기 확인 필요. [공식](https://dreamgames.helpshift.com/hc/en/3-royal-match/faq/394-mole-box/) |
| 17 | **Honey Pot / 꿀단지** | 인접 매치로 깨뜨리면 꿀을 퍼뜨림. | **2회**. 확산 범위·그 후 꿀 제거 규칙은 이 문서만으로 불명. [공식](https://dreamgames.helpshift.com/hc/en/3-royal-match/faq/398-honey-pot/) |
| 18 | **Conveyor Belt / 컨베이어** | 매 이동 뒤 같은 방향으로 잼 단지를 운반. 모든 단지가 깨져야 벨트도 제거됨. | 잼 단지마다 **인접 매치 2회**. 다칸 이동 경로가 필요. [공식](https://dreamgames.helpshift.com/hc/en/3-royal-match/faq/406-conveyor-belt/) |
| 19 | **Mushroom / 버섯** | 인접 매치로 제거하면 Ground가 남음. 이동 중 버섯도 바닥도 제거하지 않으면 바닥 중 한 칸에 버섯 1개가 다시 생김. 바닥은 그 위 매치로 제거. | 증식 조건은 확인. 생성 위치 선택 규칙 미확인. [공식](https://dreamgames.helpshift.com/hc/en/3-royal-match/faq/410-mushroom/) |
| 20 | **Purple Borders / 보라 경계** | 제거 불가. 매 이동 뒤 보드 일부를 한 칸씩 이동시키고 끝에 닿으면 방향을 바꿈. | 단순 빈 칸 마스크로 대체 불가. 이동 영역을 별도 모델링해야 함. [공식](https://dreamgames.helpshift.com/hc/en/3-royal-match/faq/417-purple-borders/) |
| 21 | **Vending Machine / 자판기** | 매 이동 후 열림/닫힘 전환. 열린 동안 옆에서 매치하면 캔 수집. | **캔 8개**. 처음 열림 상태·공격과 토글의 정확한 순서 미확인. [공식](https://dreamgames.helpshift.com/hc/en/3-royal-match/faq/418-vending-machine/) |
| 22 | **Gift Box / 선물 상자** | 인접 매치로 열어서 Toys 수집. | **4회**. 같은 다칸 개체를 여러 위치에서 동시에 때릴 때 중복 판정 확인 필요. [공식](https://dreamgames.helpshift.com/hc/en/3-royal-match/faq/423-gift-box/) |
| 23 | **Force Field / 보호막** | 덮인 영역의 요소를 보호. 같은 타일 옆에서 매치를 누적하면 보호막이 사라져 아래 요소가 드러남. | **같은 타일 5회**. 개체 전체 HP와 단순 합산하면 틀릴 수 있음. [공식](https://dreamgames.helpshift.com/hc/en/3-royal-match/faq/425-force-field/) |
| 24 | **Wooden Cuckoo / 나무 뻐꾸기** | 둥지가 열려 있을 때 인접 매치로 뻐꾸기를 깨뜨림. 모두 깨야 둥지 제거. 매 이동 뒤 둥지가 열리고 닫힘. | 개수·동시 수집·초기 상태는 레벨별 확인 필요. Bird처럼 낙하 수집하는 새와 다름. [공식](https://dreamgames.helpshift.com/hc/en/3-royal-match/faq/480-wooden-cuckoo/) |
| 25 | **Royal Capsule / 로열 캡슐** | 인접 매치로 열면 파워업을 생성. | **4회 → 파워업 2개**. 생성 종류·빈 칸 우선순위 미확인. [공식](https://dreamgames.helpshift.com/hc/en/3-royal-match/faq/503-royal-capsule/) |
| 26 | **Dynamite Box / 다이너마이트 상자** | 같은 색 인접 매치로 작동. 보이는 모든 목표의 한 겹과 일반 블록을 제거하고 파워업을 발동. | 색별 상태·연쇄 발동·잔량 차감 순서는 추가 관찰 필요. [공식](https://dreamgames.helpshift.com/hc/en/3-royal-match/faq/371-dynamite-box/) |

## 첨부 영상 식별 결과

분석 대상은 사용자 첨부 6.58초 화면 녹화. 사용자 설명과 [추가 재시도 사진](level-12297-retry.jpg)으로 **레벨 12297**임을 확인했다. 1초 간격 접촉 시트 `/tmp/chroma-reference/contact.jpg` 및 상세 프레임을 참고했다. UI 목표 숫자는 관찰값이지 공식 기본 수치가 아니다. 해당 보드와 기믹 조합은 이 레벨의 사례이며 모든 레벨의 공통 배치로 일반화하지 않는다.

| 영상에서 보이는 것 | 가장 유력한 공식 요소 | 신뢰도와 근거 |
|---|---|---|
| 붉은 긴 상자, 금색 띠, 파란 리본. 타격 후 포장이 풀리며 장난감이 드러남. HUD 곰인형 18 | **Gift Box → Toys** | **높음.** 공식 [닫힌 세로 상자 이미지](https://d2duuy9yo5pldo.cloudfront.net/dreamgames/01b6d36c-dbfe-4e6a-825a-55e231709187.png)가 외형과 직접 일치. 가로 변형도 공식 존재. Curtain은 [녹색 천 이미지](https://d2duuy9yo5pldo.cloudfront.net/dreamgames/02889b7e-37df-45a6-9471-212064472747.png)여서 구별된다. |
| 주황색 문/둥지와 작은 보라색 새. HUD 보라새 2 | **Wooden Cuckoo / Nest** | **높음.** 공식 [열린 둥지 이미지](https://d2duuy9yo5pldo.cloudfront.net/dreamgames/0c923fe2-29f1-4848-b443-1846ec14f33c.png)의 보라색 입체 새와 일치. [닫힌 둥지](https://d2duuy9yo5pldo.cloudfront.net/dreamgames/9dc7a7ce-8460-4499-b528-64bad6160338.png)도 주황색. 따라서 단순 Cupboard나 Bird로 기록하지 않는다. |
| HUD 보라색 둥근 사각형 81 | **Jelly** | **중상.** 공식 [Jelly 이미지](https://d2duuy9yo5pldo.cloudfront.net/dreamgames/cff32d26-d200-4b15-8cc6-47d0bafa1697.png)와 아이콘 일치. 실제 해당 레벨에서 퍼지는 장면과 목표 감소를 더 길게 관찰해야 확정 가능. |
| 심지가 달린 여러 색 원통이 꽂힌 2×2 장치, HUD 무지개 원통 8 | **Dynamite Box**. 목표 아이콘도 다이너마이트로 추정 | **장치 식별 높음.** 공식 [Dynamite Box 이미지](https://d2duuy9yo5pldo.cloudfront.net/dreamgames/2d24e51e-12f8-4dae-985f-8336e6f43837.png)의 빨강·초록·파랑·노랑 원통, 남색 트레이, 금색 테두리와 빨간 버튼이 영상과 일치한다. 추가 재시도 사진에서 심지를 확인했다. 이전의 병/자판기 후보는 철회한다. **무지개 목표 아이콘 해석은 추정**이며 공식 문서에 같은 아이콘이 실린 것은 아니다. |

특히 **18·8·2·81은 이 화면의 남은 목표 숫자**이다. 원래 목표량, 시작 이동 횟수, 최초 배치는 영상 앞부분이 없어서 알 수 없다. 화면에 점수 목표는 보이지 않는다.

## 엔진·에디터에 필요한 구조 — 구현 제안, 원작 내부 코드에 대한 주장 아님

### 셀과 개체를 분리

셀에는 `playable`, `floor`, `piece`, `cover`, `occupantId`, `exit`를 나눠 둔다. 일반 보석과 Jelly/Grass를 같은 슬롯에 넣으면 바닥 위 매치가 표현되지 않는다. 여러 칸짜리 Gift Box/Nest/Conveyor는 셀마다 독립 장애물이 아니라 **한 개체의 점유 영역**으로 관리해야 한다.

### 장애물 동작을 조합 가능한 규칙으로 구성

- 타격 조건: `adjacentMatch`, `matchOnTop`, `powerHit`, `collectColour`, `reachExit`.
- 추가 조건: 특정 색, 현재 열림 상태, 같은 타일, 연속된 턴.
- 상태: 층수·잔여 길이·수집 재고·열림 여부·연속 타격 누적·연결된 바닥 셀.
- 결과: 층 제거, 아이템 방출, 바닥 생성/확산, 잠금 해제, 목표 감소, 다칸 개체 제거.
- 턴 이벤트: 유효한 이동 직후의 개폐, 컨베이어 이동, 버섯 복구. 콤보·도구 사용을 '이동'으로 셀지부터 실기 확인해야 한다.
- 공격별 `actionId`를 기록해서 같은 폭발의 중복 접촉을 제한하되, 원작의 다중 로켓 중첩은 별도 실험 후 결정한다.

### 레벨 데이터에 반드시 있어야 할 항목

보드 격자와 빈 칸, 낙하 통로·스폰 위치·출구, 기본 색상 수, 고정 초기 보석, 다칸 개체의 footprint와 방향, 목표 종류와 목표량, 이동 수, 초기 개폐 상태, 생성기 재고, 덮개 아래 요소, 특수 블록 초기 배치. 원작 도움말에는 이 값의 **레벨별 데이터가 공개되어 있지 않다.**

## 다음 관찰에서 확인할 미해결 항목

1. Dynamite Box의 색별 활성화 조건·잔량 및 목표 아이콘 차감 순서. 장치 자체는 공식 이미지 대조로 식별했다.
2. Gift Box의 한 번의 3매치가 여러 점유 칸에 인접했을 때 몇 회로 계산되는지.
3. Jelly가 로켓·TNT·프로펠러·라이트볼 및 콤보로 퍼지는 경로와 범위.
4. Cuckoo/Vending의 문 토글이 유효 스와이프·파워업 탭·무료 도구·연쇄 각각에 어떻게 반응하는지.
5. Ice/Metal Tube의 방향, 멀티 타격, 길이 감소 후 낙하 경로.
6. 같은 장애물을 프로펠러 여러 대가 동시에 목표로 잡는지, 비행 중 파괴되면 재타겟하는지.
7. 원작 각 요소의 최초 등장 레벨과 해당 레벨의 실제 보드. 공식 목록 순서만으로 추정 금지.

공식 도움말은 플레이어용 요약이다. 충돌·낙하·중복 타격·동시 입력의 프레임 단위 판정까지 담고 있지 않으므로, 이것만으로 '완전 동일'한 동작이 입증되지는 않는다.
