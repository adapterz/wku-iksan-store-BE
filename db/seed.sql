-- [WARNING] 배포 DB(iksanshop) 실행 전 주의사항
-- 이 스크립트는 categories/products 테이블에 데이터를 단순 INSERT 합니다.
-- 기존 orders/gifts 테이블의 product_id 참조가 깨지지 않도록 (중복 생성 방지),
-- 스크립트 실행 전 아래 쿼리로 기존 데이터 존재 여부를 반드시 확인하세요:
-- SELECT COUNT(*) FROM products;
-- 만약 데이터가 이미 존재한다면 실행을 중단하거나 수동 판단 하에 진행하세요.
--
-- [카테고리 매핑 기준] db/migrate_categories.sql 상단 주석 참고 (팀 논의로 확정되기
-- 전까지 상품명 기준 6개 카테고리로 임시 매핑).
--
-- [상세정보 컬럼 안내] db/migrate_product_detail_fields.sql로 usage_info가
-- valid_period/usage_method/exchange_location/caution 4개로 분리되었습니다.
-- 기존 usage_info 값은 의미가 가장 가까운 usage_method로 그대로 옮겨두었을 뿐,
-- 나머지 3개 컬럼은 비어 있습니다. 실제 항목별 값 채우기는 이슈 #68 논의에 따라
-- FE/배포 담당자가 진행합니다.

INSERT INTO categories (name) VALUES
('음료'),
('베이커리·간식'),
('축산·농산물'),
('외식·상품권'),
('체험·관광이용권'),
('지역특산 선물세트');

INSERT INTO products
(name, brand, price, thumbnail_url, description, valid_period, usage_method, exchange_location, caution, category_id)
VALUES
('익산역 아메리카노 교환권', '익산역 카페', 4500, 'https://placehold.co/300x300', '익산역 인근 카페에서 이용 가능한 커피 교환권입니다.', NULL, '발급일로부터 30일 이내 사용 가능합니다.', NULL, NULL, (SELECT id FROM categories WHERE name = '음료')),

('익산 로컬 베이커리 세트', '익산 빵마을', 12000, 'https://placehold.co/300x300', '지역 제과점에서 제작한 베이커리 세트입니다.', NULL, '구매 후 매장에서 교환 가능합니다.', NULL, NULL, (SELECT id FROM categories WHERE name = '베이커리·간식')),

('익산 한우 불고기 세트', '익산축산협동조합', 65000, 'https://placehold.co/300x300', '익산 지역 축산 농가의 한우 상품입니다.', NULL, '배송 수령 후 냉장 보관해주세요.', NULL, NULL, (SELECT id FROM categories WHERE name = '축산·농산물')),

('익산 황등 비빔밥 이용권', '황등맛집', 10000, 'https://placehold.co/300x300', '익산 황등 지역 대표 음식점 이용권입니다.', NULL, '매장 방문 후 쿠폰을 제시해주세요.', NULL, NULL, (SELECT id FROM categories WHERE name = '외식·상품권')),

('익산 농산물 꾸러미', '익산로컬푸드', 30000, 'https://placehold.co/300x300', '익산 지역 농가의 신선한 농산물 세트입니다.', NULL, '수령 후 냉장 보관해주세요.', NULL, NULL, (SELECT id FROM categories WHERE name = '축산·농산물')),

('익산 카페 음료 교환권', '익산카페거리', 5000, 'https://placehold.co/300x300', '지역 카페에서 사용할 수 있는 음료 교환권입니다.', NULL, '사용 기간 내 매장에서 사용 가능합니다.', NULL, NULL, (SELECT id FROM categories WHERE name = '음료')),

('익산 전통시장 상품권', '익산전통시장', 20000, 'https://placehold.co/300x300', '익산 전통시장 내 가맹점에서 사용 가능한 상품권입니다.', NULL, '가맹점 방문 후 결제 시 사용 가능합니다.', NULL, NULL, (SELECT id FROM categories WHERE name = '외식·상품권')),

('익산 수제 한과 세트', '익산전통식품', 25000, 'https://placehold.co/300x300', '지역 전통 방식으로 제작한 한과입니다.', NULL, '개봉 후 빠른 섭취를 권장합니다.', NULL, NULL, (SELECT id FROM categories WHERE name = '베이커리·간식')),

('익산 미륵산 체험권', '미륵산체험마을', 15000, 'https://placehold.co/300x300', '익산 지역 체험 프로그램 이용권입니다.', NULL, '예약 후 방문하여 이용 가능합니다.', NULL, NULL, (SELECT id FROM categories WHERE name = '체험·관광이용권')),

('익산 보석박물관 입장권', '익산보석박물관', 8000, 'https://placehold.co/300x300', '익산 대표 관광지 입장권입니다.', NULL, '발급 후 지정 기간 내 사용 가능합니다.', NULL, NULL, (SELECT id FROM categories WHERE name = '체험·관광이용권')),

('익산 쌀 10kg', '익산농협', 35000, 'https://placehold.co/300x300', '익산 지역에서 생산된 쌀 상품입니다.', NULL, '직사광선을 피해 보관해주세요.', NULL, NULL, (SELECT id FROM categories WHERE name = '축산·농산물')),

('익산 딸기 세트', '익산농가', 18000, 'https://placehold.co/300x300', '지역 농가에서 생산한 신선한 딸기입니다.', NULL, '냉장 보관 후 섭취하세요.', NULL, NULL, (SELECT id FROM categories WHERE name = '축산·농산물')),

('익산 커피 원두 세트', '익산로스터리', 15000, 'https://placehold.co/300x300', '지역 카페와 협업한 원두 상품입니다.', NULL, '개봉 후 밀봉 보관하세요.', NULL, NULL, (SELECT id FROM categories WHERE name = '음료')),

('익산 지역 특산품 선물세트', '익산로컬푸드', 50000, 'https://placehold.co/300x300', '익산 대표 특산품으로 구성된 선물세트입니다.', NULL, '선물용 또는 가정용으로 이용 가능합니다.', NULL, NULL, (SELECT id FROM categories WHERE name = '지역특산 선물세트')),

('익산 문화 체험 패키지', '익산문화센터', 30000, 'https://placehold.co/300x300', '익산 지역 문화 체험 프로그램 패키지입니다.', NULL, '예약 후 체험 장소에서 이용 가능합니다.', NULL, NULL, (SELECT id FROM categories WHERE name = '체험·관광이용권')),

('익산 서동마을 떡 세트', '서동마을떡집', 20000, 'https://placehold.co/300x300', '익산 지역 쌀로 만든 전통 떡 선물 세트입니다.', NULL, '수령 후 냉장 보관하며 빠른 섭취를 권장합니다.', NULL, NULL, (SELECT id FROM categories WHERE name = '베이커리·간식')),

('익산 함라 한옥마을 체험권', '함라한옥체험관', 25000, 'https://placehold.co/300x300', '익산 함라 지역의 전통 문화를 체험할 수 있는 이용권입니다.', NULL, '사전 예약 후 방문하여 이용 가능합니다.', NULL, NULL, (SELECT id FROM categories WHERE name = '체험·관광이용권')),

('익산 로컬 와인 선물세트', '익산와이너리', 40000, 'https://placehold.co/300x300', '익산 지역에서 생산된 농산물을 활용한 로컬 와인 세트입니다.', NULL, '직사광선을 피해 서늘한 곳에 보관해주세요.', NULL, NULL, (SELECT id FROM categories WHERE name = '지역특산 선물세트')),

('익산 제철 채소 꾸러미', '익산로컬푸드', 22000, 'https://placehold.co/300x300', '익산 지역 농가에서 수확한 제철 채소로 구성한 꾸러미입니다.', NULL, '수령 후 냉장 보관하고 신선할 때 섭취해주세요.', NULL, NULL, (SELECT id FROM categories WHERE name = '축산·농산물')),

('익산 로컬 과일 바구니', '익산로컬푸드', 28000, 'https://placehold.co/300x300', '익산 지역에서 생산한 제철 과일을 담은 바구니입니다.', NULL, '수령 후 냉장 보관하고 빠른 섭취를 권장합니다.', NULL, NULL, (SELECT id FROM categories WHERE name = '축산·농산물')),

('익산 농가 가공식품 선물세트', '익산로컬푸드', 42000, 'https://placehold.co/300x300', '익산 농가의 농산물로 만든 가공식품을 모은 선물세트입니다.', NULL, '제품별 보관 방법과 소비기한을 확인해주세요.', NULL, NULL, (SELECT id FROM categories WHERE name = '지역특산 선물세트')),

('익산 시그니처 블렌드 원두', '익산로스터리', 14000, 'https://placehold.co/300x300', '익산로스터리만의 배합으로 완성한 시그니처 원두입니다.', NULL, '개봉 후 밀봉하여 서늘하고 건조한 곳에 보관하세요.', NULL, NULL, (SELECT id FROM categories WHERE name = '음료')),

('익산 싱글오리진 드립백 세트', '익산로스터리', 18000, 'https://placehold.co/300x300', '다양한 산지의 싱글오리진 커피를 간편하게 즐기는 드립백 세트입니다.', NULL, '드립백을 개봉한 후 뜨거운 물을 부어 추출해주세요.', NULL, NULL, (SELECT id FROM categories WHERE name = '음료')),

('익산 콜드브루 원액 세트', '익산로스터리', 22000, 'https://placehold.co/300x300', '저온 추출 방식으로 만든 진한 콜드브루 원액 세트입니다.', NULL, '개봉 후 냉장 보관하고 물이나 우유에 희석해 이용하세요.', NULL, NULL, (SELECT id FROM categories WHERE name = '음료')),

('익산 디카페인 원두', '익산로스터리', 17000, 'https://placehold.co/300x300', '카페인 부담을 줄이고 풍미를 살린 디카페인 원두입니다.', NULL, '개봉 후 밀봉하여 서늘하고 건조한 곳에 보관하세요.', NULL, NULL, (SELECT id FROM categories WHERE name = '음료')),

('익산 신동진쌀 5kg', '익산농협', 22000, 'https://placehold.co/300x300', '익산 지역에서 생산한 신동진 품종 쌀 상품입니다.', NULL, '직사광선과 습기를 피해 서늘한 곳에 보관해주세요.', NULL, NULL, (SELECT id FROM categories WHERE name = '축산·농산물')),

('익산 현미 2kg', '익산농협', 12000, 'https://placehold.co/300x300', '익산 지역에서 생산한 현미를 선별하여 포장한 상품입니다.', NULL, '밀봉 후 서늘하고 건조한 곳에 보관해주세요.', NULL, NULL, (SELECT id FROM categories WHERE name = '축산·농산물')),

('익산 오곡 잡곡 세트', '익산농협', 18000, 'https://placehold.co/300x300', '익산에서 생산한 여러 곡물을 알맞게 구성한 잡곡 세트입니다.', NULL, '개봉 후 밀봉하여 냉장 보관을 권장합니다.', NULL, NULL, (SELECT id FROM categories WHERE name = '축산·농산물')),

('익산 찹쌀 2kg', '익산농협', 14000, 'https://placehold.co/300x300', '찰기가 좋고 부드러운 익산 지역 찹쌀 상품입니다.', NULL, '직사광선을 피해 서늘하고 건조한 곳에 보관해주세요.', NULL, NULL, (SELECT id FROM categories WHERE name = '축산·농산물')),

('익산 전통 약과 선물세트', '익산전통식품', 18000, 'https://placehold.co/300x300', '전통 방식으로 만든 약과를 정갈하게 구성한 선물세트입니다.', NULL, '개봉 후 밀봉 보관하고 빠른 섭취를 권장합니다.', NULL, NULL, (SELECT id FROM categories WHERE name = '베이커리·간식')),

('익산 유과 모음 세트', '익산전통식품', 22000, 'https://placehold.co/300x300', '다양한 맛의 전통 유과를 한 상자에 담은 모음 세트입니다.', NULL, '습기를 피해 밀봉 보관하고 개봉 후 빠르게 섭취해주세요.', NULL, NULL, (SELECT id FROM categories WHERE name = '베이커리·간식')),

('익산 전통 떡 선물세트', '익산전통식품', 28000, 'https://placehold.co/300x300', '익산 지역 쌀을 활용해 만든 다양한 전통 떡 선물세트입니다.', NULL, '수령 후 냉장 보관하고 빠른 섭취를 권장합니다.', NULL, NULL, (SELECT id FROM categories WHERE name = '베이커리·간식')),

('익산 전통 장류 세트', '익산전통식품', 35000, 'https://placehold.co/300x300', '전통 방식으로 숙성한 된장과 고추장으로 구성한 장류 세트입니다.', NULL, '개봉 후 냉장 보관하고 제품별 소비기한을 확인해주세요.', NULL, NULL, (SELECT id FROM categories WHERE name = '지역특산 선물세트'));

INSERT IGNORE INTO users
(email, password, nickname)
VALUES
('test@example.com', '$2b$12$cW1e26NahtBdojprc7/CW.0I1LsMGp7Jk7.IxusI39JJZFKVDoGj6', '테스트유저'),
('admin@example.com', '$2b$12$.zT/cEpmxOlibWfJXk6soe8SLuDuSPSAmLmdQhJYgHnVcwUJLDAeG', '관리자');
