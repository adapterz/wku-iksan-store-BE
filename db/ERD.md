# DB 관계 및 기능별 스키마

구현 대조 기준: 2026-11-09, develop `c581069`의 [schema.sql](schema.sql)과 모델 코드.
2026-11-11 `develop 3b59864` 재대조: 스키마 변경 없음. ERD Wiki의 14개 테이블 컬럼명·명명된 제약을 함께 확인했으며 `user_sanctions`에는 CHECK 제약이 없습니다. 이는 프로젝트 파일 대조이며 운영 DB 조회 결과는 아닙니다.
빈 DB의 전체 생성에는 `schema.sql`을 사용하고, 기존 DB는 적용 이력을 확인해 필요한 `migrate_*.sql`만 실행합니다.
이 문서는 현재 저장소 구조를 설명하며 운영 DB의 적용 이력을 대신하지 않습니다. 운영 DB에 schema·seed를 재실행하지 않습니다.

## 기존 관계

### 회원 인증 버전 (#122)

`users.auth_version`: `INT UNSIGNED NOT NULL DEFAULT 1` (유효 범위 1~4294967295).
로그인 시 서버 세션 `authVersion`에 저장하며, 비밀번호 변경 시 원자적으로 1 증가한다.
상한에서는 비밀번호 변경을 거부하고 값을 초기화/재사용하지 않는다. 별도 FK/인덱스는 없다.
마이그레이션: [migrate_user_auth_version.sql](migrate_user_auth_version.sql).
API/배포 주의사항: [세션 무효화](../docs/BE/SESSION_INVALIDATION.md). 운영 적용은 별도다.

| 부모 | 자식 | 관계 / 삭제 정책 |
| --- | --- | --- |
| categories | products | 카테고리 1 : 상품 N, 상품 존재 시 카테고리 삭제 제한 |
| users | orders | 주문별 발신자·수신자 각각 0..1명; 탈퇴 시 FK SET NULL |
| products | orders | 상품 1 : 주문 N, 상품 삭제 제한 |
| orders | gifts | 주문 1 : 선물 0..1, gifts.order_id UNIQUE; 선물 존재 시 주문 삭제 제한 |
| users / products | wishlists | 회원·상품별 찜 중복 금지, 삭제 시 해당 찜 CASCADE |

선물의 발신자·수신자는 orders를 경유하며 users에 대한 직접 FK가 없습니다.
주문·선물은 회원 탈퇴 후에도 유지하고 orders의 발신자·수신자 닉네임 스냅샷으로 이력을 표시합니다.

## 선물 도착 알림 상태 (이슈 #101)

기존 관계와 FK는 유지하고 `gifts`에 아래 컬럼만 추가합니다.

| 컬럼 | 자료형 / 기본값 | 의미 |
| --- | --- | --- |
| notified_at | DATETIME NULL / NULL | 도착 안내 확인 시각. NULL이면 아직 안내를 확인하지 않음 |

- `gifts.status`/`used_at`(교환권 사용) 및 개별 선물 열람 여부와는 별개입니다.
- 기존 데이터는 최초 적용 시 `created_at`으로 초기화하여 알림에서 제외합니다. 실제 확인 시각을 의미하지 않습니다.
- 신규 선물 INSERT는 기존처럼 이 컬럼을 생략하며 기본값 NULL로 생성됩니다.
- 알림 대상은 본인 수신·타인에게 받은 선물 중 결제 완료 및 미사용/사용 완료 상태이며, 취소 건은 제외합니다. 발신자 계정 존재 여부는 검사하지 않습니다.
- 마이그레이션: [migrate_gift_notifications.sql](migrate_gift_notifications.sql). 운영 실행은 별도이며 백필은 재실행하지 않습니다.
- API와 검증 방법: [선물 도착 알림](../docs/BE/GIFT_NOTIFICATIONS.md).

## 교환권 취소 (이슈 #153)

| 항목 | 현재 저장·처리 기준 |
| --- | --- |
| `gifts.cancelled_at` | `DATETIME NULL`, 최초 취소 시각. 미취소는 NULL, 재취소 시 최초 값 유지 |
| `gifts.status` | 미사용 `unused`, 사용 완료 `used`, 취소 `cancelled` |
| `orders.payment_status` | 취소 시 해당 교환권의 개별 주문만 `paid` → `cancelled` |
| `order_groups` | 그룹의 최초 금액·결제 상태와 다른 교환권은 변경하지 않음 |

수신자만 미사용·결제 완료 교환권을 취소할 수 있습니다. 회원 → 교환권/주문 순서로 잠그고 주문·교환권을 같은 트랜잭션에서 변경합니다.
취소 상세 응답은 `barcode: null`, `canReview: false`이며, DB 바코드는 삭제하지 않습니다.
마이그레이션은 [migrate_gift_cancellation.sql](migrate_gift_cancellation.sql)이며 컬럼 추가만 수행합니다. 기존 상태·금액 백필은 없습니다.
API·검증·화면의 알려진 사항: [교환권 취소](../docs/BE/GIFT_CANCELLATION.md).

## 장바구니·묶음 주문 (이슈 #94, #125)

장바구니 체크아웃과 즉시 구매 주문 그룹이 구현되어 있으며 같은 그룹·개별 주문 구조를 사용합니다.

| 부모 | 자식 | 관계 / 삭제 정책 |
| --- | --- | --- |
| users / products | cart_items | 회원·상품 조합 UNIQUE, 부모 삭제 시 CASCADE |
| users | order_groups | 발신자·수신자 FK 각각 SET NULL, 닉네임 스냅샷 보존 |
| order_groups | orders | 묶음 1 : 수량별 주문 N, 묶음 삭제 RESTRICT |
| orders | gifts | 기존 1 : 0..1 유지, 바코드 UNIQUE 추가 |

| 테이블 | 추가 컬럼·제약 |
| --- | --- |
| cart_items (신규) | id, user_id, product_id, quantity(1~10), version(양수), created_at, updated_at; UNIQUE(user_id, product_id) |
| order_groups (신규) | id, user_id, receiver_id, sender_nickname_snapshot, receiver_nickname_snapshot, message, is_self_gift, total_price(BIGINT), payment_status, idempotency_key, request_hash, created_at |
| order_groups | UNIQUE(user_id, idempotency_key); 요청 키·해시는 ASCII binary 비교 |
| orders | nullable order_group_id, product_name_snapshot, brand_snapshot, thumbnail_url_snapshot; INDEX(order_group_id, id) |
| gifts | UNIQUE(barcode); 기존 중복이 있으면 임의 변경하지 않고 적용 중단 |

- 커피 2개 + 빵 1개 = 묶음 1건, orders 3건, gifts 3건입니다. 교환권 사용·리뷰는 개별 선물 기준을 유지합니다.
- 기존 주문의 새 컬럼은 NULL이며 과거 상품 정보를 현재 값으로 백필하지 않습니다. 신규 단건 주문도 상품 스냅샷을 저장합니다.
- 보낸 선물 목록 화면은 이번 범위가 아닙니다. 발신자 소유의 묶음 상세 API만 제공합니다.
- 상세 API·적용 순서·테스트: [장바구니·묶음 주문](../docs/BE/CART_ORDER_GROUPS.md).
- 즉시 구매의 요청·멱등성: [즉시 구매 주문 그룹](../docs/BE/DIRECT_ORDER_GROUPS.md).

## 상품 상세 정보

`products`는 설명 이미지(`description_image_url`)와 안내 문구(`valid_period`, `usage_method`, `exchange_location`, `caution`)를 저장합니다.
유효기간은 현재 표시용 문자열이며, 이 컬럼만으로 교환권 만료일을 계산하거나 사용·취소를 자동 차단하지 않습니다.
기존 DB 변경은 [설명 이미지](migrate_product_description_image.sql), [상세 안내](migrate_product_detail_fields.sql)를 참고합니다.

## 리뷰 관계

- products 1 : reviews N, gifts 1 : reviews 0..1.
- 리뷰는 회원 0..1명 참조; 계정 삭제 시 user_id NULL, 내용·별점·닉네임은 유지.
- gift_id UNIQUE: 선물 1건당 동시에 리뷰 1건. 사용자 직접 삭제 후 재작성 가능.
- product_id와 user_id는 검증된 선물·세션에서 서버가 결정.
- 상품·선물 삭제는 RESTRICT. 상품 노출 상태 변경과 리뷰 숨김은 관리자 API로 처리합니다.
- 공개 목록·통계는 visible만 포함. 숨김 리뷰도 중복 검사와 선물 응답에는 포함.

## 리뷰 테이블

```sql
CREATE TABLE reviews (
    id                          BIGINT AUTO_INCREMENT PRIMARY KEY,
    product_id                  BIGINT NOT NULL,
    gift_id                     BIGINT NOT NULL,
    user_id                     BIGINT,
    reviewer_nickname_snapshot  VARCHAR(50) COLLATE utf8mb4_0900_ai_ci NOT NULL,
    rating                      TINYINT NOT NULL,
    content                     VARCHAR(1000) NOT NULL,
    status                      VARCHAR(20) NOT NULL DEFAULT 'visible',
    created_at                  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                                ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT uq_reviews_gift UNIQUE (gift_id),
    CONSTRAINT chk_reviews_rating CHECK (rating BETWEEN 1 AND 5),
    CONSTRAINT chk_reviews_status CHECK (status IN ('visible', 'hidden')),
    CONSTRAINT fk_reviews_product
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
    CONSTRAINT fk_reviews_gift
        FOREIGN KEY (gift_id) REFERENCES gifts(id) ON DELETE RESTRICT,
    CONSTRAINT fk_reviews_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_reviews_product_status_created
    ON reviews (product_id, status, created_at, id);

CREATE INDEX idx_reviews_user_created
    ON reviews (user_id, created_at, id);
```

별점 정렬은 rating 이후 created_at DESC, id DESC로 순서를 고정합니다.
CHECK는 리뷰뿐 아니라 장바구니 수량·버전과 주문 그룹 금액에도 적용되며 MySQL 8.0.16 이상이 필요합니다.
관리자 리뷰 모더레이션과 리뷰 신고는 구현되어 있습니다. 이미지 리뷰는 포함하지 않습니다.

## 신고 관계

- reviews 1 : reports N, users(신고자) 1 : reports N.
- 신고 대상은 초기에는 리뷰만 지원(이슈 #90 6절). 사용자·상품 신고는 범위 밖.
- review_id/reporter_id는 SET NULL(CASCADE 아님). 리뷰 작성자가 신고 처리 전에 리뷰를
  삭제하거나 신고자가 탈퇴해도, 신고 시점의 리뷰 내용·별점 스냅샷(review_content_snapshot,
  review_rating_snapshot)이 남아있어 관리자가 계속 조치할 수 있다.
- 동일 사용자의 동일 리뷰 중복 신고는 UNIQUE(review_id, reporter_id)로 금지.
- `review_author_id_snapshot`은 신고 당시 작성자 ID를 보관합니다. 리뷰 삭제 후에도 작성자를 찾을 수 있지만 작성자 탈퇴 시 FK SET NULL로 비워집니다.
- 기존 신고 중 원본 리뷰가 남은 건만 작성자를 보완할 수 있습니다. [작성자 스냅샷 마이그레이션](migrate_report_author_id_snapshot.sql) 참고.
- 본인 후기 신고는 서버에서 403 `CANNOT_REPORT_OWN_REVIEW`로 거절합니다(DB CHECK가 아닌 API 검증).
- status는 pending/dismissed/actioned. reviews와 달리 CHECK 제약은 걸지 않고
  애플리케이션 검증으로만 통제(#77 검토 반영 요약 2번 참고).

```sql
CREATE TABLE reports (
    id                       BIGINT AUTO_INCREMENT PRIMARY KEY,
    review_id                BIGINT,
    reporter_id              BIGINT,
    review_author_id_snapshot BIGINT,
    review_content_snapshot  VARCHAR(1000) NOT NULL,
    review_rating_snapshot   TINYINT NOT NULL,
    reason                   VARCHAR(500) NOT NULL,
    status                   VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_reports_review_reporter UNIQUE (review_id, reporter_id),
    CONSTRAINT fk_reports_review
        FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE SET NULL,
    CONSTRAINT fk_reports_reporter
        FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_reports_author_snapshot
        FOREIGN KEY (review_author_id_snapshot) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_reports_status_created
    ON reports (status, created_at, id);
```

## 문의하기 관계

- users 1 : inquiries N.
- 문의는 계정 삭제 시 함께 삭제한다(user_id CASCADE). 신고/제재와 달리 계정이
  사라진 뒤에도 남겨서 증거로 삼거나 이력을 보존해야 할 실익이 없는 개인 문의
  기록이기 때문이다(이슈 #90 8절).
- category는 general/sanction_appeal 두 가지. 관리자가 큐에서 빠르게 구분해
  볼 수 있도록 하는 용도이며 별도 테이블로 분리하지 않는다.
- status는 pending/answered. reports·user_sanctions와 마찬가지로 CHECK 제약
  없이 애플리케이션 검증으로만 통제한다.
- sanction_appeal 문의를 승인 처리할 때 `PATCH /api/admin/inquiries/:id` 본문에
  `sanctionId`를 함께 보내면, 문의 답변 저장과 정지 해제(PR #99, 이슈 #90 7-4절)를
  같은 트랜잭션으로 묶어 처리한다. 처리 당시 지정된 sanctionId는 `resolved_sanction_id`에
  기록한다(FK 아님, sanctionId 없이 처리한 답변은 NULL) — 답변 문구만으로 "같은
  요청의 재시도"를 판단하면, 문구가 우연히 같고 sanctionId만 다른 요청까지 재시도로
  오인해 엉뚱한 정지가 추가로 해제될 수 있어(PR #100 리뷰 코멘트), 재시도 판정에는
  답변 문구와 이 값을 함께 비교한다.

```sql
CREATE TABLE inquiries (
    id                    BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id               BIGINT NOT NULL,
    category              VARCHAR(20) NOT NULL DEFAULT 'general',
    content               VARCHAR(1000) NOT NULL,
    admin_reply           VARCHAR(1000),
    resolved_sanction_id  BIGINT,
    status                VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_inquiries_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_inquiries_status_created
    ON inquiries (status, created_at, id);

CREATE INDEX idx_inquiries_user_created
    ON inquiries (user_id, created_at, id);
```

## 회원 제재 관계

- users(제재 대상) 1 : user_sanctions N, users(관리자) 1 : user_sanctions N(issued_by).
- type은 warning/suspension. warning은 ends_at NULL, suspension은 ends_at 필수(이슈 #90 7절).
- 경고가 이미 1건 이상 있는 유저에게 또 경고를 주려는 요청은 애플리케이션 레벨에서 거부한다
  (해제된 경고도 포함. 자동 격상 없음, 관리자가 명시적으로 suspension을 다시 요청해야 함).
- status는 active/lifted. 정지의 자연 만료는 상태를 바꾸지 않고 조회 시점에 ends_at으로 판단.
- user_id는 CASCADE(유저가 사라지면 그 유저에 대한 제재 기록도 의미가 없음), issued_by는
  SET NULL(제재를 내린 관리자가 나중에 탈퇴해도 제재 기록 자체는 유지). 이 테이블에는 CHECK 제약을 두지 않는다.

```sql
CREATE TABLE user_sanctions (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id         BIGINT NOT NULL,
    type            VARCHAR(20) NOT NULL,
    reason          VARCHAR(500) NOT NULL,
    issued_by       BIGINT,
    ends_at         DATETIME,
    status          VARCHAR(20) NOT NULL DEFAULT 'active',
    notified_at     DATETIME NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_sanctions_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_sanctions_admin
        FOREIGN KEY (issued_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_sanctions_user_created
    ON user_sanctions (user_id, created_at, id);

CREATE INDEX idx_sanctions_type_status
    ON user_sanctions (type, status);
```

활성 정지 중 리뷰 작성·수정 제한과 계정 삭제 차단이 구현되어 있습니다.
세부 규칙은 [리뷰](../docs/BE/REVIEWS.md), [탈퇴 처리](../docs/BE/ACCOUNT_WITHDRAWAL.md)를 참고합니다.

`notified_at`은 경고 안내 확인 시각입니다. 이력 조회는 경고·정지를 모두 반환하지만, 미확인 조회·확인 처리는 경고만 대상으로 합니다. 해제된 경고도 미확인이면 안내 대상입니다.
기존 DB는 [경고 확인 시각](migrate_sanction_notification.sql), [제재 조회 인덱스](migrate_perf_indexes.sql)의 적용 여부를 각각 확인합니다.

## 검색 로그·인기 검색어

| 테이블 | 주요 컬럼·제약 |
| --- | --- |
| `search_logs` | `id`, `keyword`, `normalized_keyword`, `result_count`, `client_hash`, `searched_at`; 검색 시각 및 정규화 검색어·시각 인덱스 |
| `blocked_keywords` | `id`, `normalized_keyword` UNIQUE, `created_at` |

- 두 테이블에는 회원 FK가 없습니다. 사용자 ID·IP·User-Agent 원본 대신 식별용 해시를 저장하며, 검색어 원문은 `keyword`에 저장합니다.
- 최근 7일, 검색 결과가 있는 검색어, 서로 다른 해시 3개 이상을 기준으로 상위 10개를 반환합니다. 차단 검색어는 제외하며 집계 결과는 프로세스 메모리에 5분 캐시합니다.
- 로그인 사용자는 회원 ID, 비회원은 IP·User-Agent 조합으로 해시를 생성합니다. 해시 개수를 정확한 실제 인원수로 간주하지 않습니다. 비회원 식별은 프록시 설정의 영향을 받습니다.
- 로그는 14일 보관 기준으로 앱 기동 시 및 이후 하루 간격으로 정리합니다. 앱이 중지된 동안 주기 작업은 실행되지 않습니다.
- 마이그레이션: [migrate_search_logs.sql](migrate_search_logs.sql). 운영에서는 `SEARCH_LOG_HASH_SALT` 설정도 필요합니다. 최근 검색어의 개인 목록 저장과는 다른 기능입니다.

## 검증·배포

재현 방법과 응답 규칙: [리뷰 API 구현·검증 안내](../docs/BE/REVIEWS.md).
운영 변경 절차는 [README 배포 안내](../README.md#배포)를 따릅니다. 적용 이력·DB 버전·백업·구버전 호환성을 확인한 뒤 필요한 SQL을 적용하고 코드 배포·검증을 진행합니다.
리뷰·취소일·검색 로그 등 현재 코드가 참조하는 테이블·컬럼이 필요하므로 `migrate_reviews.sql` 하나만으로 최신 스키마 준비가 끝난 것으로 보지 않습니다.
