# 프로젝트 문서

실행 안내, 현재 구현 설명, 과거 검증 기록을 구분해 찾기 위한 목차입니다.
전체 기능 소개와 배포 절차는 [프로젝트 README](../README.md), 종료 범위와 후속 과제는 [마무리 기록](BE/CLOSEOUT.md)을 기준으로 합니다.

## 실행·검증·DB

| 문서 | 내용 |
| --- | --- |
| [로컬 개발 환경](BE/DEVELOPMENT.md) | 최초 설치, 환경변수, 신규 로컬 DB·Redis 준비 |
| [테스트 가이드](BE/TESTING.md) | Jest·실제 DB 테스트 명령, 실행 조건, 검증 기록 기준 |
| [DB 구조](../db/ERD.md) | 현재 테이블·관계·제약 설명 |
| [DB 날짜 기준](BE/DATABASE_TIMEZONE.md) | KST 저장·UTC 응답, 기존 데이터 확인 주의사항 |
| [배포 절차](../README.md#배포) | 환경변수·마이그레이션·main 배포·배포 후 확인 |

## 기능별 구현

| 영역 | 문서 |
| --- | --- |
| 인증·보안 | [세션 무효화](BE/SESSION_INVALIDATION.md), [요청 제한](BE/API_RATE_LIMITS.md), [탈퇴 동시성](BE/ACCOUNT_WITHDRAWAL.md) |
| 주문·교환권 | [장바구니·주문 그룹](BE/CART_ORDER_GROUPS.md), [즉시 구매](BE/DIRECT_ORDER_GROUPS.md), [교환권 취소](BE/GIFT_CANCELLATION.md), [선물 도착 알림](BE/GIFT_NOTIFICATIONS.md) |
| 상품·리뷰 | [상품 목록 캐시](BE/PRODUCT_LIST_CACHE.md), [찜 목록 관심 수](BE/WISHLIST_COUNTS.md), [리뷰](BE/REVIEWS.md) |

API 전체 명세는 [API 설계 v2](https://github.com/adapterz/wku-iksan-store-BE/wiki/API-설계-v2)에 정리되어 있습니다. 기능 문서의 구현 당시 검증 결과를 최신 버전의 재실행 결과로 해석하지 않습니다.

## 과거 기록·문제 해결

| 구분 | 문서 | 읽는 기준 |
| --- | --- | --- |
| BE 기록 | [개발 기록 안내](BE/DEVLOG.md), [장바구니 초기 검증](BE/CART_VERIFICATION.md), [상품 데이터 보완](BE/PRODUCT_CONTENT_REVIEW_20260929.md) | 날짜·커밋에 한정된 결과. 당시 미완료 항목은 후속 PR 확인 |
| DB 기록 | [DB 작업 일지](DB/DEVLOG.md) | 과거 적용 계획·SQL을 현재 환경에 재실행하지 않음 |
| 인프라 기록 | [Cloud 작업 일지](../infra/cloud/DEVLOG.md), [배포 점검](../infra/deploy_todo.md), [DB 연동 전환](../infra/replacement_checklist.md) | 과거 PM2 방식과 현재 Docker 배포 구분 |
| 문제 해결 | [BE](BE/TROUBLESHOOTING.md), [DB](DB/TROUBLESHOOTING.md), [배포](../infra/cloud/TROUBLESHOOTING.md) | 기존 확인 사례·절차로 연결. 새 진단 결과와 구분 |

## 문서 갱신 기준

- API·상태·응답을 바꾸면 기능 문서와 API Wiki를, DB 구조를 바꾸면 `db/ERD.md`와 ERD Wiki를 함께 확인합니다.
- 명령·환경변수·배포 설명은 `package.json`, `.env.example`, 실행 스크립트와 워크플로를 대조합니다.
- 과거 테스트·회의 기록은 보존하고, 달라진 현재 상태를 위쪽에 별도로 안내합니다.
- 미해결 사항은 [#158](https://github.com/adapterz/wku-iksan-store-BE/issues/158)에 모읍니다. 문서 수정만으로 구현·배포·운영 데이터 수정까지 완료한 것으로 표시하지 않습니다.
