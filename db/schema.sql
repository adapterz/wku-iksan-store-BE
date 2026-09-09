CREATE TABLE users (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    email           VARCHAR(255) NOT NULL,
    password        VARCHAR(255) NOT NULL,
    role            VARCHAR(20) NOT NULL DEFAULT 'user',
    nickname        VARCHAR(50) COLLATE utf8mb4_0900_ai_ci NOT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_users_email UNIQUE (email),
    CONSTRAINT uq_users_nickname UNIQUE (nickname)
);

CREATE TABLE categories (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(50) NOT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_categories_name UNIQUE (name)
);

CREATE TABLE products (
    id                 BIGINT AUTO_INCREMENT PRIMARY KEY,
    name               VARCHAR(255) COLLATE utf8mb4_0900_ai_ci NOT NULL,
    brand              VARCHAR(255) COLLATE utf8mb4_0900_ai_ci NOT NULL,
    price              INT NOT NULL,
    thumbnail_url      VARCHAR(500),
    description        TEXT,
    description_image_url VARCHAR(500),
    valid_period       VARCHAR(300),
    usage_method       VARCHAR(300),
    exchange_location  VARCHAR(300),
    caution            VARCHAR(300),
    category_id        BIGINT NOT NULL,
    status             VARCHAR(20) NOT NULL DEFAULT 'active',

    CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT
);

CREATE TABLE wishlists (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id         BIGINT NOT NULL,
    product_id      BIGINT NOT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_wishlists_user_product UNIQUE (user_id, product_id),
    CONSTRAINT fk_wishlists_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_wishlists_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE orders (
    id                           BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id                      BIGINT,
    sender_nickname_snapshot     VARCHAR(50) NOT NULL,
    product_id                   BIGINT NOT NULL,
    receiver_id                  BIGINT,
    receiver_nickname_snapshot   VARCHAR(50) NOT NULL,
    total_price                  INT NOT NULL,
    message                      VARCHAR(500),
    is_self_gift                 BOOLEAN NOT NULL,
    payment_status               VARCHAR(20) NOT NULL,
    created_at                   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_orders_product FOREIGN KEY (product_id) REFERENCES products(id),
    CONSTRAINT fk_orders_receiver FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE gifts (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    order_id        BIGINT NOT NULL,
    barcode         VARCHAR(50) NOT NULL,
    status          VARCHAR(20) NOT NULL,
    used_at         DATETIME,
    notified_at     DATETIME NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_gifts_order_id UNIQUE (order_id),
    CONSTRAINT fk_gifts_order FOREIGN KEY (order_id) REFERENCES orders(id)
);

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

CREATE TABLE reports (
    id                       BIGINT AUTO_INCREMENT PRIMARY KEY,
    review_id                BIGINT,
    reporter_id              BIGINT,
    review_content_snapshot  VARCHAR(1000) NOT NULL,
    review_rating_snapshot   TINYINT NOT NULL,
    reason                   VARCHAR(500) NOT NULL,
    status                   VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_reports_review_reporter UNIQUE (review_id, reporter_id),
    CONSTRAINT fk_reports_review
        FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE SET NULL,
    CONSTRAINT fk_reports_reporter
        FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_reports_status_created
    ON reports (status, created_at, id);

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

CREATE TABLE user_sanctions (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id         BIGINT NOT NULL,
    type            VARCHAR(20) NOT NULL,
    reason          VARCHAR(500) NOT NULL,
    issued_by       BIGINT,
    ends_at         DATETIME,
    status          VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_sanctions_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_sanctions_admin
        FOREIGN KEY (issued_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_sanctions_user_created
    ON user_sanctions (user_id, created_at, id);
