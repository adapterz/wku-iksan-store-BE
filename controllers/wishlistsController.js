const wishlistModel = require('../db/models/wishlistModel');
const productModel = require('../db/models/productModel');
// 상품 목록 API의 wishlistCount는 wishlists 테이블에 대한 실시간 COUNT 집계를 캐싱한 값이라,
// 찜 추가/삭제 직후 무효화하지 않으면 캐시 TTL(5분) 동안 변경 전 카운트가 계속 노출된다.
const { invalidateProductListCache } = require('./productsController');
const { sendSuccess, sendError } = require('../routes/api');
const { SUCCESS, ERROR } = require('../constants/responseCodes');
const { parsePositiveInteger } = require('../validators/commonValidator');

// POST /api/wishlists - 로그인 사용자의 찜 등록
async function createWishlist(req, res) {
  try {
    const { productId } = req.body || {};
    const userId = req.session.userId;

    if (productId === undefined || productId === null || productId === '') {
      return sendError(res, ERROR.REQUIRED_PRODUCT_ID);
    }

    const normalizedProductId = parsePositiveInteger(productId);
    if (normalizedProductId === null) {
      return sendError(res, ERROR.INVALID_PRODUCT_ID);
    }

    const product = await productModel.getProductById(normalizedProductId);
    if (!product) {
      return sendError(res, ERROR.PRODUCT_NOT_FOUND);
    }

    const wishlist = await wishlistModel.createWishlist(userId, normalizedProductId);
    await invalidateProductListCache();

    return sendSuccess(res, {
      ...SUCCESS.WISHLIST_CREATE_SUCCESS,
      data: {
        wishlistId: wishlist.id,
        productId: wishlist.product_id,
        createdAt: wishlist.created_at
      }
    });
  } catch (error) {
    console.error('Error in POST /api/wishlists:', error);

    // 동시 요청으로 UNIQUE 제약이 위반돼도 일반 500이 아닌 중복 찜으로 응답한다.
    if (error.code === 'ER_DUP_ENTRY') {
      return sendError(res, ERROR.PRODUCT_ALREADY_WISHED);
    }

    return sendError(res);
  }
}

// DELETE /api/wishlists/:productId - 이미 해제된 찜도 성공으로 처리한다.
async function removeWishlist(req, res) {
  try {
    const userId = req.session.userId;
    const productId = parsePositiveInteger(req.params.productId, { allowString: true });

    if (productId === null) {
      return sendError(res, ERROR.INVALID_PRODUCT_ID);
    }

    await wishlistModel.deleteWishlist(userId, productId);
    await invalidateProductListCache();

    return sendSuccess(res, {
      ...SUCCESS.WISHLIST_REMOVE_SUCCESS,
      data: { productId }
    });
  } catch (error) {
    console.error('Error in DELETE /api/wishlists/:productId:', error);
    return sendError(res);
  }
}

// GET /api/wishlists - 로그인 사용자의 찜 목록만 최신 등록순으로 반환한다.
async function getWishlists(req, res) {
  try {
    const userId = req.session.userId;
    const rows = await wishlistModel.getWishlistsByUserId(userId);

    const wishlists = rows.map(row => ({
      wishlistId: row.wishlist_id,
      product: {
        id: row.product_id,
        name: row.product_name,
        brand: row.product_brand,
        price: row.product_price,
        thumbnailUrl: row.thumbnail_url,
        categoryId: row.category_id,
        categoryName: row.category_name,
        status: row.product_status
      },
      createdAt: row.created_at
    }));

    return sendSuccess(res, {
      ...SUCCESS.WISHLIST_LIST_SUCCESS,
      data: wishlists
    });
  } catch (error) {
    console.error('Error in GET /api/wishlists:', error);
    return sendError(res);
  }
}

module.exports = {
  createWishlist,
  removeWishlist,
  getWishlists
};
