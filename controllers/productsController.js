const productModel = require('../db/models/productModel');
const redis = require('../db/redisClient');
const { sendSuccess, sendError } = require('../routes/api');
const { SUCCESS, ERROR } = require('../constants/responseCodes');
const { validateProductListQuery } = require('../validators/productValidator');
const { parsePositiveInteger } = require('../validators/commonValidator');

const RANKING_CACHE_TTL_MS = 5 * 60 * 1000;
let rankingCache = null;
let rankingRequestPromise = null;

const PRODUCT_LIST_CACHE_TTL_SECONDS = 5 * 60;

// 검색어·카테고리·브랜드 조합마다 결과가 다르므로, 조합 전체를 캐시 키에 반영한다.
function buildProductListCacheKey({ keyword, categoryId, brand }) {
  return `products:list:keyword=${keyword ?? ''}:categoryId=${categoryId ?? ''}:brand=${brand ?? ''}`;
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

// 상품 목록 조회와 상품명·브랜드 검색, 카테고리 필터를 함께 처리한다.
async function getProducts(req, res) {
  try {
    const validation = validateProductListQuery(req.query);
    if (validation.errorCode) {
      return sendError(res, ERROR[validation.errorCode]);
    }

    const cacheKey = buildProductListCacheKey(validation.value);

    // Redis 장애 시에도 서비스는 계속 동작해야 하므로, 캐시 조회 실패는
    // 에러를 던지지 않고 DB 조회 경로로 자연스럽게 넘어가게 한다.
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return sendSuccess(res, {
          ...SUCCESS.PRODUCT_LIST_SUCCESS,
          data: JSON.parse(cached)
        });
      }
    } catch (cacheError) {
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

    try {
      await redis.set(cacheKey, JSON.stringify(products), 'EX', PRODUCT_LIST_CACHE_TTL_SECONDS);
    } catch (cacheError) {
      console.error('Redis 저장 실패:', cacheError.message);
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
// 조합별로 키가 다르므로(위 buildProductListCacheKey) 패턴 삭제로 한 번에 정리한다.
async function invalidateProductListCache() {
  try {
    const keys = await redis.keys('products:list:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
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
  getProductDetail,
  resetRankingCache,
  invalidateProductListCache
};
