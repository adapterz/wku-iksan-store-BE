# Cloud DEVLOG

## 7/9
- README.md 작성 — EC2 접속·pm2 실행·`.env` 양식·공인 IP 확인 절차를 팀원 누구나 따라할 수 있게 문서화
- deploy.sh 작성 — git pull·npm install·pm2 restart를 한 번에 실행하는 재배포 스크립트 추가, README에 사용법 반영

## 7/10
- 스왑 메모리 1GB 추가 — 메모리 부족으로 SSH 연결이 자주 끊기던 문제 완화
- `iksan.store` 도메인 연결 — 가비아→Cloudflare 네임서버 전환, A 레코드 등록
- SSL 인증서 발급 — certbot + Cloudflare DNS-01 방식으로 `iksan.store`/`www.iksan.store` 발급, 자동 갱신 설정 포함
- Nginx 리버스 프록시 구성 — 443(HTTPS)/80(HTTP)을 3000번(Node 앱)으로 연결
- README에 도메인 연결 전체 절차 문서화
