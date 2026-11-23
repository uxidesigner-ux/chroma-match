# Chroma Royale · iPhone 실행과 배포

2026-11-23 기준으로 v4 빌드의 로컬 실행과 복구 검증을 마쳤다. 이후 사용자가 `main` 커밋·푸시와 추가 개선을 요청해 반영을 진행한다. 기존 CI가 통과하면 GitHub Pages를 갱신한다. 시각적 완성도를 수치로 측정한 기준이 없으므로 “Royal Match와 99% 일치”를 검증했다고 표현하지 않는다.

## 실행 주소와 GitHub 상태

- 저장소: <https://github.com/uxidesigner-ux/chroma-match> — 공개 저장소, 기본 브랜치 `main`.
- 이번 리뉴얼의 기반 커밋: [`82b4907b`](https://github.com/uxidesigner-ux/chroma-match/commit/82b4907b832b1ce15afe7fefb943e6e93684ab61), `Add optional GA4 visit and gameplay analytics (#67)`.
- Pages 실행 주소: <https://uxidesigner-ux.github.io/chroma-match/>. 해당 커밋의 CI와 배포 완료를 확인한 뒤 최신판으로 안내한다.
- 로컬 개발: `npm run dev -- --host 127.0.0.1` → <http://localhost:5173/>.

CI는 `main`에 반영된 소스의 단위 테스트, 게임·편집기 흐름, Chrome/WebKit 프로덕션 검증을 통과한 뒤 Pages로 배포하도록 구성되어 있다. 앞선 배포 보류는 이번 `main` 반영 요청으로 해제되었다.

같은 Wi-Fi의 iPhone에서 로컬 빌드를 먼저 확인하려면 아래 서버를 실행하고 Mac의 현재 LAN IP로 접속한다. 예: `http://<Mac의 LAN IP>:4173/chroma-match/`. Mac과 서버가 켜져 있어야 하며, 이 HTTP 미리보기에서는 HTTPS 서비스 워커 설치·오프라인 기능을 검증할 수 없다.

현재 실행 중인 v4 로컬 미리보기: <http://192.168.45.202:4173/chroma-match/>. 2026-11-23에 Mac에서 이 Wi-Fi 주소와 `localhost` 주소의 HTML·JS·CSS·앱 아이콘·manifest 및 새 v4 이미지 11개가 모두 HTTP 200인 것을 확인했다. 실제 iPhone 접속은 별도 확인이 필요하다. 서버를 다시 켜려면 `Preview on iPhone.command`를 실행한다. 네트워크가 바뀌면 Mac의 IP도 달라질 수 있다.

```sh
BASE_PATH=/chroma-match/ npm run build
BASE_PATH=/chroma-match/ npm run preview -- --host 0.0.0.0 --port 4173 --strictPort
```

## v4 최종 빌드 검증

- 단위 테스트: `npm test` **280개 통과**.
- 화면 동작: `npm run test:royal -- --output=test-results/royal-v4` **19개 통과**. 진입·홈·게임·설정·레벨 이동·편집기와 모바일 조작을 확인했다.
- 최종 `/chroma-match/` 빌드 성공. TypeScript와 서비스 워커 문법 검사 통과. 빌드 리비전 **`1c86ae55c50e14b2`**.
- Chrome·WebKit 프로덕션 검증 **4개 통과**. 결과 경로: `test-results/royal-release-v4`. Chrome 오프라인 재실행과 WebKit 서버 종료 후 캐시 복구, 레벨 12297·무제한 이동 저장, 재배치 도구 사용, 다른 프로젝트 캐시 보존을 확인했다.
- 오프라인 목록은 **22개 파일, 약 5.15 MiB**다. `goals-v4.webp`를 포함해 홈·진입·보드·왕·워드마크·블록·특수 블록·도구·선물·추가 아이콘 등 새 WebP 11개가 모두 포함된다. 누락 파일은 없으며 원본 PNG·VRM은 포함되지 않는다.
- LAN 미리보기는 위 리비전을 제공한다. 최종 번들 `index-CVH7DSQT.js`, `index-znoTESaL.css`와 모든 v4 이미지의 HTTP 200 및 콘텐츠 형식을 확인했다.
- 기능·복구 검증 결과가 시각적 일치율을 뜻하지는 않는다. 화면별 비교는 [v4 시각 검수와 남은 원본 차이](research/royal-ui-fidelity-v4.md)에 별도로 기록한다.
- 최종 화면: [진입](royal-preview/v4-entry-final-390.png) · [홈](royal-preview/v4-home-final-390.png) · [12297 플레이](royal-preview/v4-game-final-390.png) · [실패](royal-preview/v4-failed-final-390.png).

## 이전 v3 검증 기록

- 단위 테스트: `npm test` **280개 통과**.
- 화면 동작: `npm run test:royal -- --output=test-results/royal-homefinal` **19개 통과**. 마지막 직접 실행 수정 후 해당 회귀 테스트도 재통과했다.
- 최종 타입 검사 및 `/chroma-match/` 빌드 성공. 빌드 리비전 `963be6c3c9345249`.
- Chrome·WebKit 프로덕션 검증 **4개 통과**. 설치 후 오프라인/서버 종료 복구와 저장 상태·도구 사용을 확인했다.
- 320×568, 390×844, 430×932, 844×390에서 홈과 실제 실패 화면을 검수했다. [시각 검수와 남은 원본 차이](royal-polish-review.md).
- [진입 화면](royal-preview/polish-entry-final-390.png) · [홈 화면](royal-preview/polish-home-final-390.png) · [실패 화면](royal-preview/polish-failed-final-390.png).

## 로컬 프로덕션 검증

```sh
npm run typecheck
npm test
BASE_PATH=/chroma-match/ npm run build
npx playwright install chromium webkit
npx playwright test --config playwright.royal-release.config.ts
```

프로덕션 검증은 포트 5190에 미리보기 서버를 열고 `/chroma-match/` 경로에서 실행한다. 온라인 첫 진입, 홈에서 게임 실행, 레벨 12297·무제한 이동 저장, 캐시에서 재실행과 재배치 도구 사용, 다른 프로젝트 캐시 보존을 확인한다. Chrome은 네트워크 오프라인 모드로 검사한다. WebKit은 오프라인 모드가 서비스 워커 응답을 차단하는 [Playwright 문제 #42775](https://github.com/microsoft/playwright/issues/42775)가 있어, 로컬 원본 서버를 실제로 종료한 뒤 캐시 복구를 검사한다. 서버에 직접 요청하면 실패하는 대조 검증을 함께 수행한다. 설치된 Chrome을 사용하는 로컬 설정과 Playwright Chromium을 사용하는 CI 설정을 구분한다.

실제 배포 후에는 같은 빌드의 주소를 지정해 다시 확인한다.

```sh
ROYAL_RELEASE_URL=https://uxidesigner-ux.github.io/chroma-match/ npx playwright test --config playwright.royal-release.config.ts
```

WebKit 자동화는 Safari 계열 엔진과 iPhone 화면·터치 설정을 검증한다. 실제 iPhone 하드웨어, Safari 주소창·노치 동작, 홈 화면 설치, 진동, 메모리 제한을 직접 시험한 결과와는 구분해야 한다.

v3 스크린샷과 검수 수치는 이전 기준선이다. 현재 실행·캐시 복구 결과는 위 v4 리비전을 기준으로 한다.

## 배포 후 iPhone에서 실행

1. Safari로 배포 완료가 확인된 HTTPS 주소를 연다.
2. 진입 화면의 시작 버튼을 누른 뒤 홈의 플레이 버튼으로 게임을 시작한다.
3. Safari 공유 메뉴의 **홈 화면에 추가**로 설치한다. 새 왕관 아이콘과 독립 실행 화면을 사용한다.
4. 처음에는 온라인으로 실행해 게임과 그림 다운로드를 마친다. 이후 네트워크를 끈 상태에서 홈 화면 아이콘을 다시 열고 저장한 레벨과 설정을 확인한다.
5. 새 버전 알림이 나타나면 **새 버전 적용** 버튼으로 업데이트한다. 진행 중인 게임을 자동으로 새로 고치지 않는다.

게임 설정과 진행은 해당 브라우저의 로컬 저장소에 남는다. 다른 브라우저·기기로 자동 동기화되지 않는다. 오프라인 데이터는 브라우저나 운영체제에서 제거될 수 있으므로 영구 설치 파일로 취급하지 않는다.

## 배포 구성

- `BASE_PATH=/chroma-match/`는 GitHub 프로젝트 Pages용이다. 독립 도메인은 기본값 `/`로 빌드한다.
- 빌드 때 JS·CSS·왕실 WebP·앱 아이콘으로 `royal-precache.json`과 서비스 워커 버전을 생성한다. 원본 고해상도 PNG, VRM, 분석·외부 요청은 오프라인 캐시에 포함하지 않는다.
- 개발 서버에서는 서비스 워커를 등록하지 않는다. 프로덕션은 HTTPS 또는 로컬호스트에서만 등록한다.
- 서비스 워커는 현재 앱 경로의 캐시만 관리하며, 이전 Chroma Match 캐시를 정리하고 다른 Pages 프로젝트의 캐시는 보존한다.
- 온라인은 최신 HTML을 가져오고, 오프라인은 같은 빌드의 HTML·코드·그림 세트를 복구한다. 업데이트는 사용자 조작으로 적용한다.
