# 구현 범위 및 마무리 기록

**현재 합의한 구현 범위는 마무리하고, 남은 차이와 확장 후보는 [향후 개선 과제 #158](https://github.com/adapterz/wku-iksan-store-BE/issues/158)에서 이어 관리합니다.**

2026-11-14 최종 갱신 기준 BE는 `develop ca0a65e`·`main fd03aea`입니다. 의존성 보안 패치는 배포와 운영 컨테이너 버전 확인까지 마쳤고 #160을 종료했습니다. FE 기능·화면 기록은 11/11의 `main 948ea29` 대조 결과를 보존하며 이번에 다시 검증한 결과는 아닙니다. 이번 PR #159는 프로젝트 문서 정리이며 새 코드 배포·운영 DB 변경은 하지 않습니다.

## 완료와 후속 과제의 구분

| 구분 | 마무리 기준 |
| --- | --- |
| 구현 기능 | [README 주요 기능](../../README.md#주요-기능). 주문은 Mock이며 실제 PG·환불·정산·POS 연동은 제외 |
| 교환권 취소 | 수신자의 미사용 교환권 취소·취소 내역·사용 차단. 구매자 주문 전체 취소·금전 환불·자동 만료는 제외 |
| 통합 QA #126 | Ethan이 별도 확인·해결했다고 공유한 결과로 이번 검증 작업 마감. 과거 미확인 칸을 일괄 통과 처리하지 않음 |
| 초기 오류 #54 | 기존 수정·배포 기록, 현재 FE 코드 및 로컬 회귀 확인으로 마감. 이번 운영 브라우저 재검증은 아님 |
| 버그 모음 #138·취소 설계 #153 | 구현·검증된 범위는 완료, 남은 문구·표현은 #158로 이관 |
| 제안 #63·#114·#121 | 완료 부분의 근거 보존, 남은 제안은 #158로 이관. 미구현 후보를 완료로 표시하지 않음 |
| 범위 논의 #146 | 현재 구현 범위를 기준으로 마감. A안/B안의 모든 후보를 완료했다는 뜻은 아님 |
| 의존성 보안 #160 | 운영·개발용 패치, main 반영·배포, 운영 버전 확인 완료. 미해결 deepmerge는 #158에서 후속 관리 |

기존 기록: [#126](https://github.com/adapterz/wku-iksan-store-BE/issues/126) · [#54](https://github.com/adapterz/wku-iksan-store-BE/issues/54) · [#138](https://github.com/adapterz/wku-iksan-store-BE/issues/138) · [#153](https://github.com/adapterz/wku-iksan-store-BE/issues/153) · [#146](https://github.com/adapterz/wku-iksan-store-BE/issues/146)

## 의존성 보안 패치 최종 결과

**11/11 발견 당시의 경고 12건은 과거 상태입니다. 11/14 재확인한 열린 GitHub 경고는 개발용 deepmerge Low 1건입니다.** 미해결 항목을 숨기거나 모든 보안 위험이 해소됐다고 판단한 것은 아닙니다.

| 구분 | 최종 확인 |
| --- | --- |
| 운영용 패치 | [#161](https://github.com/adapterz/wku-iksan-store-BE/pull/161) → [#162](https://github.com/adapterz/wku-iksan-store-BE/pull/162) main 반영·배포 |
| 개발용 패치 | [#163](https://github.com/adapterz/wku-iksan-store-BE/pull/163) → [#164](https://github.com/adapterz/wku-iksan-store-BE/pull/164) main `fd03aea` 반영. glob·brace-expansion 보완, nodemon을 Node.js watch로 대체 |
| 배포·운영 조회 | 11/13 [배포 실행](https://github.com/adapterz/wku-iksan-store-BE/actions/runs/43418283339) 성공 및 읽기 전용 운영 점검 33건 통과. 구매·취소 등 운영 데이터 변경 테스트는 제외 |
| 운영 설치 버전 | 11/14 [Bio의 실행 중 컨테이너 확인](https://github.com/adapterz/wku-iksan-store-BE/issues/160#issuecomment-6875366369): express 4.22.3, body-parser 1.20.9, proxy-addr 2.0.8, qs 6.16.2, ip-address 10.7.6, mysql2 3.24.6, sql-escaper 1.5.2. 배포 lock과 일치 |
| 보안 검사 | 패치 검증 환경의 `npm audit --omit=dev` 0건. 전체 audit의 Low 영향 패키지 5개는 deepmerge 한 원인에서 파생되며 GitHub 경고 수와 구분 |
| 종료·보류 | [#160](https://github.com/adapterz/wku-iksan-store-BE/issues/160) 완료 종료. deepmerge 공식 패치·상위 도구 대응은 [#158](https://github.com/adapterz/wku-iksan-store-BE/issues/158)에서 추적 |

로컬·CI 검증과 watch 실행 변경의 상세는 [개발용 의존성 보안 검토](DEV_DEPENDENCY_SECURITY.md)에 기록했습니다. 이번 문서 수정은 완료된 패치 결과를 정리하며 패키지·배포 설정을 다시 바꾸지 않습니다.

## 남아 있는 차이

| 항목 | 현재 상태 |
| --- | --- |
| 취소·환불 문구 | `db/seed.sql`의 ‘취소·환불 가능’ 문구는 실제 환불 미지원과 다름. 운영 상품의 적용 상태는 별도 확인 필요. 운영에 seed 재실행 금지 |
| 이용 정책·주문 안내 | FE의 환불·배송·개인정보·카카오 판매 안내 일부가 현재 서비스와 다름. 계속 운영하거나 재사용하기 전에 실제 기능·운영 주체에 맞게 정리 필요 |
| 취소 상세 제목 | ‘오류’ 제목이 표시되지만 취소 안내·바코드 비노출·사용 차단은 정상이라는 팀 확인 기록. 표현 개선은 후속 과제 |
| 주문 오류 안내 | 일부 오류가 해당 화면에서 할 수 없는 선택·수량 변경을 안내. 실제 가능한 복귀 경로에 맞게 보완 필요 |

문서화로 위 사항을 해결한 것은 아닙니다. 상세 방향과 담당·일정 논의는 #158에 모으며, 새 기능 후보와 현재 안내 불일치를 구분합니다.

## 용어·검증 상태

- **교환권:** 사용자에게 제공하는 사용 권리. API·DB에서는 `gifts`, 주문 내역은 `orders`, 묶음 주문은 `order_groups`를 사용합니다.
- **취소:** 수신자 교환권의 사용 불가 전환. 주문 그룹의 최초 합계를 다시 계산하거나 금전을 환불하는 동작이 아닙니다.
- **검색어:** 최근 검색어는 FE 저장 기능, 인기 검색어는 BE 로그·집계 기능입니다. 하나의 구현 완료를 다른 쪽 완료로 대신하지 않습니다.
- **검증:** Jest, 실제 DB, HTTP 연동, 브라우저, 운영 확인을 구분하고 날짜·커밋·환경을 함께 기록합니다. 과거 결과는 이번 문서 대조에서 재실행한 결과가 아닙니다.
- **반영:** Wiki 게시, develop 병합, main 병합·배포는 별개입니다. `main`에는 배포 자동화가 있으므로 문서를 맞추기 위해 임의로 병합하지 않습니다.

## 공용 기록

- [공용 BE Wiki — 구현 현황 및 마무리 기록](https://github.com/adapterz/wku-iksan-store-BE/wiki/BE-구현-현황-및-마무리-기록): 팀 전체 구현·검증·알려진 사항
- [향후 개선 과제 #158](https://github.com/adapterz/wku-iksan-store-BE/issues/158): 후속 항목의 관리 창구
- [프로젝트 문서 목차](../README.md): 실행·기능·DB·인프라 안내
- [테스트 가이드](TESTING.md): 재현 명령과 실행 조건
