# 리뷰 API 구현·검증

설계: [리뷰 페이지 #77](https://github.com/adapterz/wku-iksan-store-BE/issues/77).
이 브랜치에서는 텍스트 리뷰 BE와 DB 마이그레이션을 구현합니다.
실제 FE 상품 상세·선물함 연동 및 상품 카드 통계 추가는 별도 작업입니다.

## API

| 메서드 | 경로 | 권한 / 반환 |
| --- | --- | --- |
| GET | /api/products/:id/reviews | 공개 visible 목록과 전체 통계; data.summary, data.reviews, meta |
| POST | /api/reviews | 실제 수신자 + paid + used; 201 생성된 리뷰 |
| GET | /api/reviews/me | 본인 목록(숨김 포함); data 배열, meta |
| GET | /api/reviews/:id | 본인 수정용 단건 |
| PATCH | /api/reviews/:id | 본인, rating/content 중 전달한 값만 수정 |
| DELETE | /api/reviews/:id | 본인, 행 삭제; data.reviewId |

본문 예: `{ "giftId": 7, "rating": 5, "content": "후기" }`.
공개 목록 쿼리: page(1), limit(10, 최대 50), sort(latest/rating_desc/rating_asc).
내 목록은 최신순이며 선택 productId 필터를 지원합니다.
평균 별점은 소수점 한 자리로 반올림한 숫자입니다. 리뷰가 없으면 평균 0, 개수 0, totalPages 0.
범위 밖 페이지는 빈 배열을 반환하고 meta에는 실제 전체 개수·페이지 수를 유지합니다.

공개 리뷰 필드: reviewId, nickname, rating, content, isMine, createdAt, updatedAt.
본인 조회·생성·수정 응답은 여기에 giftId, product(id/name/brand/thumbnailUrl)를 추가합니다.
닉네임은 작성 당시 스냅샷이며 공개 응답에 회원 ID나 탈퇴 여부를 노출하지 않습니다.

## 권한·검증

- 경로·쿼리 ID는 양의 안전한 정수 문자열, POST giftId는 JSON 숫자.
- rating은 숫자형 정수 1~5, content는 trim 후 유니코드 코드포인트 1~1000자.
- 허용하지 않은 body 필드·빈 PATCH는 `400 INVALID_REVIEW_BODY`. 기존 설계 코드에 추가한 입력 오류입니다.
- 없는 선물 404 GIFT_NOT_FOUND, 작성 불가(타인·미사용·미결제) 403 GIFT_NOT_REVIEWABLE.
- 없는 리뷰 404 REVIEW_NOT_FOUND, 타인 리뷰 접근 403 FORBIDDEN_NOT_REVIEW_OWNER.
- 중복 사전 검사와 DB UNIQUE 오류 모두 409 REVIEW_ALREADY_EXISTS.
- 생성 시 회원·선물/주문을 잠금 조회해 탈퇴·닉네임 변경·동시 작성과 경합을 제어합니다.
- 수정·삭제도 소유권 확인과 쓰기를 같은 트랜잭션에서 처리합니다.
- 모든 리뷰 응답과 선물 응답은 private, no-store. 공개 리뷰는 로그인 여부에 따라 isMine이 달라집니다.
- 리뷰 화면은 작성·수정·삭제 후 리뷰 목록·통계·선물 상태를 다시 조회해야 합니다.
- FE는 사용자 본문을 textContent로 출력하고 상품 캐시에 리뷰 목록을 넣지 않아야 합니다.

## 선물 응답

목록·상세의 기존 필드 유지 + productId, reviewId, canReview 추가.
본인 수신 + paid + used + 리뷰 없음일 때만 canReview=true.
hidden도 reviewId가 반환되어 새 리뷰 작성을 막습니다. POST에서 다시 권한을 검증합니다.
선물 사용 API의 기존 응답 형식은 유지합니다.

## 자동 테스트

```sh
npm ci
npm test -- --runInBand
```

검증 대상: 입력 경계값, 공개/개인 응답, 캐시, 소유권, 모델 SQL 바인딩,
트랜잭션 해제·rollback, 선물 응답 회귀.
단위 테스트의 DB 모킹만으로 실제 FK·CHECK 동작을 확인했다고 보지 않습니다.

## 실제 로컬 MySQL 통합 검증

MySQL 8.0.16 이상과 **테스트 DB 생성·삭제 권한이 있는 로컬 계정**이 필요합니다.
Docker나 운영 DB는 사용하지 않습니다. 아래 경로는 각자의 로컬 환경 파일로 변경합니다.

```powershell
$env:REVIEW_DB_TEST = '1'
$env:REVIEW_DB_ENV_FILE = 'C:\local-private\review-db.env'
npm run test:reviews:db
```

파일에는 DB_HOST/DB_PORT/DB_USER/DB_PASSWORD만 필요합니다. 비밀값은 Git에 올리지 않습니다.
DB_HOST는 localhost/127.0.0.1/::1만 허용하며 기존 DB_NAME은 무시합니다.
실행마다 랜덤 review_test_* DB를 생성하고 정상·실패 시 모두 해당 DB만 삭제합니다.
강제 종료 시 남은 DB가 있다면 출력된 이름을 확인한 뒤 수동 정리합니다.

실제 Express 라우터·세션 쿠키·MySQL로 가입 → 로그인 → 주문 → 사용 →
동시 리뷰 작성 → 조회/수정/삭제/재작성 → 발신자·수신자 탈퇴 → 기록 보존을 확인합니다.
CHECK·UNIQUE·FK 위반, 숨김 처리와 집계, 개인정보 비노출도 검증합니다.

## 운영 반영 주의

1. #87의 기존 마이그레이션·배포·검증 완료 확인.
2. 실제 DB 버전 확인, 백업 및 reviews 테이블 미존재 확인.
3. db/migrate_reviews.sql 적용 후 SHOW CREATE TABLE/SHOW INDEX 검증.
4. 이 브랜치의 코드 배포.
5. 로그인·선물 조회·리뷰 CRUD·탈퇴 보존 검증.

새 코드는 기존 선물 조회에서도 reviews를 사용하므로 코드만 먼저 배포하지 않습니다.
schema.sql은 새 DB 생성용, migrate_reviews.sql은 기존 DB 추가용으로 둘 중 하나만 실행합니다.
자동 운영 마이그레이션이나 관리자·이미지·신고 기능은 포함하지 않습니다.
