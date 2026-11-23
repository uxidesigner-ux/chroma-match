#!/bin/zsh
# Keep this terminal open while playing on the same Wi-Fi.
cd "$(dirname "$0")" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
royal_interface=$(route -n get default 2>/dev/null | awk '/interface:/{print $2; exit}')
royal_address=$(ipconfig getifaddr "$royal_interface" 2>/dev/null)
if [ -z "$royal_address" ]; then
  echo "Wi-Fi 또는 유선 네트워크에 연결한 뒤 다시 실행하세요."
  read -r
  exit 1
fi
echo "같은 Wi-Fi에 연결한 아이폰 Safari에서 여세요:"
echo "http://$royal_address:4173/chroma-match/"
echo "미리보기 중에는 이 Mac과 터미널을 켜 두세요."
if curl -fsS http://127.0.0.1:4173/chroma-match/ 2>/dev/null | grep -q 'Chroma Royale'; then
  read -r
  exit 0
fi
if [ ! -d node_modules ]; then npm ci || exit 1; fi
BASE_PATH=/chroma-match/ npm run build || exit 1
BASE_PATH=/chroma-match/ npm run preview -- --host 0.0.0.0 --port 4173 --strictPort
