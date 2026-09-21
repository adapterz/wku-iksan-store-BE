# 주요 API 반복 요청 제한 (#121)

## 적용 범위 / 초기값

| 대상 | 키 | 시간 창 | 초기 최대 요청 수 | 환경변수 |
| --- | --- | --- | --- | --- |
| POST /api/auth/login | IP (IPv6 기본 /56 묶음) | 15분 | 100 | RATE_LIMIT_LOGIN_MAX |
| POST /api/auth/signup | IP | 1시간 | 30 | RATE_LIMIT_SIGNUP_MAX |
| POST /api/inquiries | 인증된 회원 ID | 10분 | 60 | RATE_LIMIT_INQUIRY_MAX |
| POST /api/reviews/:id/reports | 인증된 회원 ID, 리뷰 ID와 무관 | 10분 | 60 | RATE_LIMIT_REPORT_MAX |
| GET /api/users/search | 인증된 회원 ID | 10분 | 60 | RATE_LIMIT_SEARCH_MAX |
| GET /api/admin/users | 인증된 회원 ID | 10분 | 60 | RATE_LIMIT_SEARCH_MAX |

확정 운영 정책이 아닌 여유 있는 **초기값**이다. 정상적인 사용/공용 네트워크 영향을 검토한 뒤 담당자가 조정한다. 성공과 실패 요청 모두 집계한다. 이메일만으로 계정을 잠그지 않으므로 타인의 이메일을 반복 입력해 계정을 전역 차단하지 않는다. 로그인·가입 카운터와 문의·신고 카운터는 서로 독립이다.

닉네임 검색 두 엔드포인트는 #121 당시에는 "조회 API"라는 이유로 범위에서 제외됐으나, 로그인만 하면 제한 없이 닉네임 존재 여부를 계속 조회할 수 있는 열거(enumeration) 통로였다. 닉네임 자체는 비밀값이 아니지만(리뷰 작성자 등으로 이미 노출), 무제한 조회 오라클을 남겨두지 않기 위해 이번에 추가한다. 회원/관리자 검색은 서로 다른 라우트이지만 같은 RATE_LIMIT_SEARCH_MAX 카운터 설정을 공유한다(회원별 독립 집계).

회원 키는 requireLogin 인증 이후 서버 세션 userId로 결정하며 body/header의 userId를 신뢰하지 않는다. 재로그인/다른 기기에서도 같은 회원의 등록 횟수는 합산한다. 문의/신고의 비로그인 요청은 기존 401이며 회원 카운터를 소모하지 않는다. 조회/수정/삭제, 로그아웃, 비밀번호 변경 API에는 이번 제한을 추가하지 않는다.

## 응답 / 구현

- 라이브러리: express-rate-limit 8.7.0, 기본 MemoryStore. 서버 재시작 시 카운터 초기화. 다중 프로세스/서버는 카운터를 공유하지 않으므로 배포 구조 변경 시 공유 저장소 재설계 필요.
- 초과 시 `429 TOO_MANY_REQUESTS`, 기존 JSON 구조와 한국어 message 유지. `Retry-After` 및 `RateLimit`/`RateLimit-Policy` 헤더로 재시도 정보를 제공한다.
- 클라이언트가 임의로 보낸 X-Forwarded-For를 직접 파싱하지 않는다. 기존 Express req.ip와 운영 trust proxy=1을 사용한다. **BE 직접 접근 차단 및 Nginx의 전달 헤더 처리가 보장되어야 한다.** 운영 설정을 이번에 변경/검증한 것은 아니다.
- env는 양의 안전한 정수만 허용한다. 잘못된 값은 시작 시 오류로 알려 조용히 제한을 끄지 않는다.
- express.json의 기존 기본 100KB 한도와 도메인별 길이/개수 검증은 유지한다. parser 이전 네트워크 대역폭/연결/분산 공격을 막는 기능은 아니며 Nginx/CrowdSec을 대체하지 않는다.
- FE는 변경하지 않았다. BE는 429 message를 반환하지만, 현재 로그인 화면에는 `TOO_MANY_REQUESTS`의 전용 문구가 없어 일반 오류로 표시된다.

## 후속 보완 — FE 오류 안내

`429 TOO_MANY_REQUESTS`를 받으면 반복 요청 제한에 걸렸으며 잠시 후 재시도해야 한다는 안내를 표시하도록 후속 보완한다. BE의 요청 제한은 정상 동작하며, 화면 안내 문구 보완은 이번 BE 구현 범위에서 제외한다.

## 검증 / 배포

로컬 테스트에서 상한의 마지막 요청 허용/다음 요청 거부, 별도 IP·회원·API 격리, 만료 후 재시도, 헤더/응답, 로그아웃 제외 및 실제 라우트 장착을 확인한다. 운영 서버 대상 부하 테스트는 실행하지 않는다.
DB 마이그레이션은 필요 없다. package-lock의 새 의존성 설치와 env 값 검토가 필요하며, 같은 브랜치의 #122는 별도 DB 마이그레이션이 필요하다.

2026-09-16: PR #123이 머지된 develop 기준, 반복 요청 제한 테스트 14개(동작 12개 + 실제 라우터 연결 2개)와 인증 경계 추가 검사를 포함해 전체 47개 스위트 / 711개 테스트가 통과했다. 초기 제한값과 운영 프록시 경로는 운영 적용 전 확인 대상으로 남긴다.

공식 문서: https://express-rate-limit.mintlify.app/reference/configuration
