-- #94: 서비스 쓰기 중단/백업 후 적용. DDL은 자동 커밋되므로 실패 단계부터 상태 확인.
-- 기존 주문은 group/snapshot NULL 유지. 과거 상품 정보를 주문 당시 정보로 가장하지 않는다.
CREATE TABLE order_groups (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT,
    receiver_id BIGINT,
    sender_nickname_snapshot VARCHAR(50) NOT NULL,
    receiver_nickname_snapshot VARCHAR(50) NOT NULL,
    message VARCHAR(500),
    is_self_gift BOOLEAN NOT NULL,
    total_price BIGINT NOT NULL,
    payment_status VARCHAR(20) NOT NULL,
    idempotency_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_group_user_key UNIQUE (user_id, idempotency_key),
    CONSTRAINT chk_group_price CHECK (total_price > 0),
    CONSTRAINT fk_group_sender FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_group_receiver FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE SET NULL
);

ALTER TABLE orders
    ADD COLUMN order_group_id BIGINT NULL,
    ADD COLUMN product_name_snapshot VARCHAR(255) NULL,
    ADD COLUMN brand_snapshot VARCHAR(255) NULL,
    ADD COLUMN thumbnail_url_snapshot VARCHAR(500) NULL,
    ADD INDEX idx_orders_group (order_group_id, id),
    ADD CONSTRAINT fk_orders_group FOREIGN KEY (order_group_id) REFERENCES order_groups(id) ON DELETE RESTRICT;
