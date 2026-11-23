# 개인용 iPhone 앱 준비

웹게임을 앱 안에 포함하는 WKWebView 프로젝트입니다. 게임 파일을 네트워크에서 받지 않고 `chroma://game/index.html`에서 열며, 버튼·매치·착지·도구·특수 블록의 충돌을 UIKit 햅틱으로 전달합니다. 앱과 Safari의 진행 기록은 별도로 저장됩니다.

**현재 검증 범위:** 오프라인 파일 생성, Swift 구문 검사, 프로젝트·Info.plist 검사, 웹과 네이티브 메시지 연결 및 앱 일시정지/복귀 브라우저 테스트를 통과했습니다. 작업 Mac에는 Xcode와 iOS SDK가 없어 네이티브 컴파일·서명·설치·실기기 햅틱은 아직 검증하지 않았습니다. 설치 가능한 IPA를 만든 상태는 아닙니다.

## Xcode에서 iPhone에 설치

1. iPhone의 iOS 버전을 지원하는 Xcode를 설치하고 처음 실행해 필요한 구성 요소를 설치합니다.
2. 저장소 루트에서 다음을 실행합니다.

   ```sh
   npm ci
   npm run ios:prepare
   npm run ios:verify
   open ios/ChromaRoyale.xcodeproj
   ```

   `ios:prepare`는 웹 프로덕션 파일과 앱 아이콘을 `ios/.generated`에 생성합니다. `ios:verify`는 Xcode가 활성화되어 있으면 서명 없는 시뮬레이터 빌드까지 실행합니다. Command Line Tools만 활성화된 경우 Xcode의 Settings → Locations → Command Line Tools에서 설치한 Xcode를 선택합니다.

3. Xcode의 **ChromaRoyale → Signing & Capabilities**에서 자신의 Team을 선택합니다. Bundle Identifier가 이미 사용 중이면 자신만의 값으로 변경합니다.
4. iPhone을 Mac에 연결하고 신뢰 설정을 완료합니다. iPhone의 **설정 → 개인정보 보호 및 보안 → 개발자 모드**를 활성화한 뒤 안내에 따라 재시동합니다. [Apple의 개발자 모드 안내](https://developer.apple.com/documentation/xcode/enabling-developer-mode-on-a-device)
5. 실행 대상으로 자신의 iPhone과 `ChromaRoyale` scheme을 선택하고 **Run**을 누릅니다. 개인 기기에 설치하는 흐름이며 App Store 제출은 포함하지 않습니다.

게임을 수정한 뒤에는 `npm run ios:prepare`로 앱에 포함할 파일을 다시 만들고 Run 해야 합니다. 기존 GitHub Pages 배포와 앱 내부 파일은 별도입니다.

## 기기에서 확인할 항목

- 설정의 **버튼 피드백 확인**을 눌러 짧은 촉감을 확인합니다. 진동·효과음을 각각 껐을 때 해당 출력만 중단되어야 합니다.
- 일반 매치와 착지는 짧고 가볍게, 망치·TNT·대포는 더 강하게 반응해야 합니다. 연쇄 중 진동이 계속 이어지는 현상이 없어야 합니다.
- 폭발 도중 홈 화면으로 나갔다 복귀해도 이동 횟수를 추가로 쓰거나 충돌을 중복 재생하지 않아야 합니다.
- 네트워크를 끈 상태에서 앱을 새로 실행하고 게임·설정·보드 편집이 동작하는지 확인합니다. 보드 JSON 내보내기는 iOS 공유 시트를 사용합니다.
- WebKit 프로세스가 종료되면 저장한 설정·완료 기록을 복원하며 진행 중이던 판은 다시 시작합니다.

시뮬레이터는 물리 진동 검수 수단이 아닙니다. 하드웨어 지원 여부에 따라 앱이 진동 옵션을 활성화합니다. Safari/PWA에서는 게임 폭발과 연동한 Vibration API를 사용할 수 없으며, 이 앱의 네이티브 연결을 통해 제공합니다. [WebKit의 Vibration 입장](https://github.com/WebKit/standards-positions/issues/267)

## 구현 근거

- [WKURLSchemeHandler](https://developer.apple.com/documentation/webkit/wkurlschemehandler): 앱에 포함한 게임 파일 제공
- [WKScriptMessageHandler](https://developer.apple.com/documentation/webkit/wkscriptmessagehandler): 게임에서 네이티브 햅틱 요청 전달
- [UIImpactFeedbackGenerator](https://developer.apple.com/documentation/uikit/uiimpactfeedbackgenerator): 충돌 강도별 피드백

외부 페이지는 앱 안에서 탐색하지 않습니다. 햅틱은 번들 게임의 메인 프레임에서 보낸 허용된 종류·유한한 강도 값만 처리합니다. SceneDelegate에서 비활성화·복귀를 전달하여 게임 시간과 피드백을 함께 정지합니다.
