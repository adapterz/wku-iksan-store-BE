-- 이슈 #136: 인기 검색어 노출 기능. 신규 테이블 2개, 기존 테이블 변경 없음.
-- #132의 12개 SQL과는 별도 적용 대상 (선행 관계 없음). 운영 적용은 별도 승인 후 실행한다.
CREATE TABLE search_logs (
    id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
    keyword             VARCHAR(100) NOT NULL,
    normalized_keyword  VARCHAR(100) COLLATE utf8mb4_0900_ai_ci NOT NULL,
    result_count        INT NOT NULL DEFAULT 0,
    client_hash         CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    searched_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_search_logs_searched_at
    ON search_logs (searched_at);

CREATE INDEX idx_search_logs_keyword_searched_at
    ON search_logs (normalized_keyword, searched_at);

CREATE TABLE blocked_keywords (
    id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
    normalized_keyword  VARCHAR(100) COLLATE utf8mb4_0900_ai_ci NOT NULL,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_blocked_keywords_keyword UNIQUE (normalized_keyword)
);
