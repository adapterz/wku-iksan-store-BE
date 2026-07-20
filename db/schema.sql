CREATE TABLE users (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    email           VARCHAR(255) NOT NULL,
    password        VARCHAR(255) NOT NULL,
    nickname        VARCHAR(50) NOT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_users_email UNIQUE (email),
    CONSTRAINT uq_users_nickname UNIQUE (nickname)
);

CREATE TABLE products (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    brand           VARCHAR(255) NOT NULL,
    price           INT NOT NULL,
    thumbnail_url   VARCHAR(500),
    description     TEXT,
    usage_info      VARCHAR(500)
);

CREATE TABLE orders (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id         BIGINT NOT NULL,
    product_id      BIGINT NOT NULL,
    receiver_id     BIGINT NOT NULL,
    total_price     INT NOT NULL,
    message         VARCHAR(500),
    is_self_gift    BOOLEAN NOT NULL,
    payment_status  VARCHAR(20) NOT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_orders_product FOREIGN KEY (product_id) REFERENCES products(id),
    CONSTRAINT fk_orders_receiver FOREIGN KEY (receiver_id) REFERENCES users(id)
);

CREATE TABLE gifts (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    order_id        BIGINT NOT NULL,
    barcode         VARCHAR(50) NOT NULL,
    status          VARCHAR(20) NOT NULL,
    used_at         DATETIME,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_gifts_order_id UNIQUE (order_id),
    CONSTRAINT fk_gifts_order FOREIGN KEY (order_id) REFERENCES orders(id)
);
