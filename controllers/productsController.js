const { randomUUID } = require('node:crypto');
const productModel = require('../db/models/productModel');
const searchLogModel = require('../db/models/searchLogModel');
const redis = require('../db/redisClient');
const { sendSuccess, sendError } = require('../routes/api');
const { SUCCESS, ERROR } = require('../constants/responseCodes');
const { validateProductListQuery } = require('../validators/productValidator');
const { parsePositiveInteger } = require('../validators/commonValidator');

const RANKING_CACHE_TTL_MS = 5 * 60 * 1000;
let rankingCache = null;
let rankingRequestPromise = null;

const POPULAR_KEYWORDS_CACHE_TTL_MS = 5 * 60 * 1000;
const POPULAR_KEYWORDS_LIMIT = 10;
const POPULAR_KEYWORDS_MIN_SEARCHERS = 3;
const POPULAR_KEYWORDS_WINDOW_DAYS = 7;
let popularKeywordsCache = null;
let popularKeywordsRequestPromise = null;

const PRODUCT_LIST_CACHE_TTL_SECONDS = 5 * 60;
// 기존 products:list:* 키와 분리한다. 세대 키는 만료시키지 않고 데이터에만 TTL을 둔다.
const PRODUCT_LIST_CACHE_PREFIX = 'products:list-cache:v2';
const PRODUCT_LIST_GENERATION_KEY = `${PRODUCT_LIST_CACHE_PREFIX}:generation`;

async function getProductListGeneration() {
  const generation = await redis.get(PRODUCT_LIST_GENERATION_KEY);
  if (generation) return generation;

  // 재시작/eviction 후에도 과거 세대를 재사용하지 않는다. 동시 초기화 시에는
  // NX 성공자의 값만 사용하고, 그 사이 무효화로 바뀌었다면 공유된 새 값을 읽는다.
  const candidate = randomUUID();
  const initialized = await redis.set(PRODUCT_LIST_GENERATION_KEY, candidate, 'NX');
  if (initialized === 'OK') return candidate;
  return await redis.get(PRODUCT_LIST_GENERATION_KEY) || null;
}

// 검색어·카테고리·브랜드 조합마다 결과가 다르므로, 조합 전체를 캐시 키에 반영한다.
// keyword/brand는 구분자 문자(:, =) 제한이 없어 단순 문자열 연결로는 서로 다른
// 조합이 같은 키로 충돌할 수 있어(예: keyword="a:categoryId=:brand=b" vs
// keyword="a"+brand="b:categoryId=:brand=c"), JSON.stringify로 각 값의 경계를
// 명확히 구분한다.
function buildProductListCacheKey(generation, { keyword, categoryId, brand }) {
  return `${PRODUCT_LIST_CACHE_PREFIX}:${generation}:${JSON.stringify([keyword ?? '', categoryId ?? '', brand ?? ''])}`;
}

function mapRankingProducts(rows) {
  return rows.map((row, index) => ({
    rank: index + 1,
    id: row.id,
    name: row.name,
    brand: row.brand,
    price: row.price,
    thumbnailUrl: row.thumbnail_url,
    categoryId: row.category_id,
    categoryName: row.category_name,
    wishlistCount: row.wishlist_count
  }));
}

async function getRankingSnapshot() {
  const now = Date.now();

  if (rankingCache && now < rankingCache.expiresAt) {
    return rankingCache;
  }

  // 캐시가 비어 있거나 만료된 순간에 요청이 몰려도 DB 집계는 한 번만 실행한다.
  if (!rankingRequestPromise) {
    rankingRequestPromise = (async () => {
      const rows = await productModel.getProductRanking();
      const computedAtMs = Date.now();

      rankingCache = {
        data: mapRankingProducts(rows),
        computedAt: new Date(computedAtMs).toISOString(),
        expiresAt: computedAtMs + RANKING_CACHE_TTL_MS
      };

      return rankingCache;
    })().finally(() => {
      rankingRequestPromise = null;
    });
  }

  return rankingRequestPromise;
}

// 라우터 테스트가 서로의 캐시 상태에 영향을 주지 않도록 초기화한다.
function resetRankingCache() {
  rankingCache = null;
  rankingRequestPromise = null;
}

async function getPopularKeywordsSnapshot() {
  const now = Date.now();

  if (popularKeywordsCache && now < popularKeywordsCache.expiresAt) {
    return popularKeywordsCache;
  }

  if (!popularKeywordsRequestPromise) {
    popularKeywordsRequestPromise = (async () => {
      const rows = await searchLogModel.getPopularKeywords({
        limit: POPULAR_KEYWORDS_LIMIT,
        minSearchers: POPULAR_KEYWORDS_MIN_SEARCHERS,
        days: POPULAR_KEYWORDS_WINDOW_DAYS
      });
      const computedAtMs = Date.now();

      popularKeywordsCache = {
        data: rows.map((row, index) => ({ rank: index + 1, keyword: row.keyword })),
        computedAt: new Date(computedAtMs).toISOString(),
        expiresAt: computedAtMs + POPULAR_KEYWORDS_CACHE_TTL_MS
      };

      return popularKeywordsCache;
    })().finally(() => {
      popularKeywordsRequestPromise = null;
    });
  }

  return popularKeywordsRequestPromise;
}

// 라우터 테스트가 서로의 캐시 상태에 영향을 주지 않도록 초기화한다.
function resetPopularKeywordsCache() {
  popularKeywordsCache = null;
  popularKeywordsRequestPromise = null;
}

// 상품 목록 조회와 상품명·브랜드 검색, 카테고리 필터를 함께 처리한다.
async function getProducts(req, res) {
  try {
    const validation = validateProductListQuery(req.query);
    if (validation.errorCode) {
      return sendError(res, ERROR[validation.errorCode]);
    }

    let cacheKey = null;

    // Redis 장애 시에도 서비스는 계속 동작해야 하므로, 캐시 조회 실패는
    // 에러를 던지지 않고 DB 조회 경로로 자연스럽게 넘어가게 한다.
    try {
      const generation = await getProductListGeneration();
      if (generation) cacheKey = buildProductListCacheKey(generation, validation.value);
      const cached = cacheKey ? await redis.get(cacheKey) : null;
      if (cached) {
        const products = JSON.parse(cached);

        if (validation.value.keyword) {
          searchLogModel.recordSearch(req, { keyword: validation.value.keyword, resultCount: products.length });
        }

        return sendSuccess(res, {
          ...SUCCESS.PRODUCT_LIST_SUCCESS,
          data: products
        });
      }
    } catch (cacheError) {
      // 세대/캐시 조회에 실패한 요청은 DB 응답만 반환하고 캐시를 쓰지 않는다.
      cacheKey = null;
      console.error('Redis 조회 실패, DB로 폴백:', cacheError.message);
    }

    const rows = await productModel.getAllProducts(validation.value);

    const products = rows.map(row => ({
      id: row.id,
      name: row.name,
      brand: row.brand,
      price: row.price,
      thumbnailUrl: row.thumbnail_url,
      categoryId: row.category_id,
      categoryName: row.category_name,
      wishlistCount: row.wishlist_count
    }));

    if (validation.value.keyword) {
      searchLogModel.recordSearch(req, { keyword: validation.value.keyword, resultCount: products.length });
    }

    if (cacheKey) {
      try {
        // 조회를 시작한 세대에만 저장한다. DB 조회 도중 무효화가 발생해도
        // 이전 응답은 과거 세대에 남을 뿐, 새 요청의 캐시를 오염시키지 않는다.
        await redis.set(cacheKey, JSON.stringify(products), 'EX', PRODUCT_LIST_CACHE_TTL_SECONDS);
      } catch (cacheError) {
        console.error('Redis 저장 실패:', cacheError.message);
      }
    }

    return sendSuccess(res, {
      ...SUCCESS.PRODUCT_LIST_SUCCESS,
      data: products
    });
  } catch (error) {
    console.error('Database query error (GET /api/products):', error);
    return sendError(res);
  }
}

// 상품 생성/수정/상태변경 후 목록 캐시를 무효화한다.
// DB 변경 완료 후 공유 세대를 교체한다. 이전 조회의 늦은 저장까지 키 공간으로
// 격리하며, 이전 세대 데이터는 기존 300초 TTL로 정리한다(KEYS 전체 탐색 불필요).
async function invalidateProductListCache() {
  try {
    await redis.set(PRODUCT_LIST_GENERATION_KEY, randomUUID());
  } catch (error) {
    console.error('상품 목록 캐시 무효화 실패:', error.message);
  }
}

// 찜 개수 기준 인기 상품 랭킹 조회
async function getProductRanking(req, res) {
  try {
    const snapshot = await getRankingSnapshot();

    return sendSuccess(res, {
      ...SUCCESS.PRODUCT_RANKING_SUCCESS,
      data: snapshot.data,
      meta: {
        computedAt: snapshot.computedAt
      }
    });
  } catch (error) {
    console.error('Database query error (GET /api/products/ranking):', error);
    return sendError(res);
  }
}

// 공개 API: 최근 7일간 Top 10 인기 검색어
async function getPopularKeywords(req, res) {
  try {
    const snapshot = await getPopularKeywordsSnapshot();

    return sendSuccess(res, {
      ...SUCCESS.POPULAR_KEYWORDS_SUCCESS,
      data: snapshot.data,
      meta: {
        computedAt: snapshot.computedAt
      }
    });
  } catch (error) {
    console.error('Database query error (GET /api/products/popular-keywords):', error);
    return sendError(res);
  }
}

// M2 1단계: 상품 상세 조회
async function getProductDetail(req, res) {
  try {
    const productId = parsePositiveInteger(req.params.id, { allowString: true });

    // 잘못된 경로 값은 상품 존재 여부를 조회하기 전에 입력 오류로 처리한다.
    if (productId === null) {
      return sendError(res, ERROR.INVALID_PRODUCT_ID);
    }

    // 실제 로직: DB 접근 계층(모듈)을 통해 데이터 조회
    const product = await productModel.getProductById(productId);

    if (!product) {
      return sendError(res, ERROR.PRODUCT_NOT_FOUND);
    }

    // DB 필드 -> API 응답 필드 변환 계층.
    // 실제 쿼리로 교체 시 이 매핑 로직은 유지하고 모델 내부 쿼리만 교체하면 됨
    return sendSuccess(res, {
      ...SUCCESS.PRODUCT_DETAIL_SUCCESS,
      data: {
        id: product.id,
        name: product.name,
        brand: product.brand,
        price: product.price,
        thumbnailUrl: product.thumbnail_url,
        description: product.description,
        descriptionImageUrl: product.description_image_url,
        validPeriod: product.valid_period,
        usageMethod: product.usage_method,
        exchangeLocation: product.exchange_location,
        caution: product.caution,
        categoryId: product.category_id,
        categoryName: product.category_name
      }
    });

  } catch (error) {
    console.error('Error in GET /api/products/:id:', error);
    return sendError(res);
  }
}

module.exports = {
  getProducts,
  getProductRanking,
  getPopularKeywords,
  getProductDetail,
  resetRankingCache,
  resetPopularKeywordsCache,
  invalidateProductListCache
};
