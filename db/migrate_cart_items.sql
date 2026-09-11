-- #94 초안 구현. 운영 실행은 Aon 검토 및 Bio와 배포 조율 후 별도 진행.
-- 기존 seed/schema 전체 재실행 금지. 이미 존재하면 중단하고 적용 이력을 확인한다.
CREATE TABLE cart_items (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    product_id BIGINT NOT NULL,
    quantity INT NOT NULL,
    version INT NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uq_cart_user_product UNIQUE (user_id, product_id),
    CONSTRAINT chk_cart_quantity CHECK (quantity BETWEEN 1 AND 10),
    CONSTRAINT chk_cart_version CHECK (version > 0),
    CONSTRAINT fk_cart_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_cart_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);
