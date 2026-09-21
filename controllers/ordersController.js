const orderModel = require('../db/models/orderModel');
const productModel = require('../db/models/productModel');
const userModel = require('../db/models/userModel');
const { generateBarcode } = require('../db/models/orderWriter');
const { sendSuccess, sendError } = require('../routes/api');
const { SUCCESS, ERROR } = require('../constants/responseCodes');

// API 명세서 기준: 결제 Mock/금액 검증 로직 없음 (Issue #141 확정)
async function createOrder(req, res) {
  try {
    const { productId, message, isSelfGift, receiverId } = req.body;
    const userId = req.session.userId;

    if (!productId) {
      return sendError(res, ERROR.REQUIRED_PRODUCT_ID);
    }
    if (isSelfGift === undefined) {
      return sendError(res, ERROR.REQUIRED_IS_SELF_GIFT);
    }
    if (!isSelfGift && !receiverId) {
      return sendError(res, ERROR.REQUIRED_RECEIVER_ID);
    }
    if (!isSelfGift && Number(receiverId) === Number(userId)) {
      return sendError(res, ERROR.CANNOT_GIFT_TO_SELF);
    }

    const finalReceiverId = isSelfGift ? userId : receiverId;

    // 서로 결과에 의존하지 않는 조회라 한 번에 기다린다. 우선순위(상품 → 수신자 →
    // 발신자)는 아래 체크 순서로 그대로 유지한다.
    const [product, receiver, sender] = await Promise.all([
      productModel.getProductById(productId),
      userModel.getUserById(finalReceiverId),
      // 탈퇴/닉네임 변경 이후에도 주문 당시 닉네임을 그대로 보여주기 위한 스냅샷
      userModel.getUserById(userId)
    ]);

    if (!product) {
      return sendError(res, ERROR.PRODUCT_NOT_FOUND);
    }
    if (!receiver) {
      return sendError(res, ERROR.RECEIVER_NOT_FOUND);
    }
    if (!sender) return sendError(res, ERROR.UNAUTHORIZED);
    const barcode = generateBarcode();

    const finalTotalPrice = product.price; // 서버에서 직접 상품 가격 조회
    const { orderId, giftId } = await orderModel.createOrderWithGift(
      userId,
      sender.nickname,
      productId,
      finalReceiverId,
      receiver.nickname,
      finalTotalPrice,
      message || null,
      isSelfGift,
      barcode
    );

    return sendSuccess(res, {
      ...SUCCESS.ORDER_CREATE_SUCCESS,
      data: { orderId, giftId }
    });

  } catch (error) {
    if (error.cartError && ERROR[error.cartError]) return sendError(res, ERROR[error.cartError]);
    console.error('Order creation error:', { code: error.code || 'UNKNOWN' });
    return sendError(res);
  }
}

async function getOrderDetail(req, res) {
  try {
    const orderId = req.params.id;
    const userId = req.session.userId;

    const order = await orderModel.getOrderById(orderId);
    if (!order) {
      return sendError(res, ERROR.ORDER_NOT_FOUND);
    }

    if (order.user_id !== userId) {
      return sendError(res, ERROR.FORBIDDEN_NOT_OWNER);
    }

    // 과거 주문 이력이므로, 이후 상품이 숨김/단종 처리되어도 상품 정보가 사라지면 안 된다.
    // 서로 결과에 의존하지 않는 조회라 한 번에 기다린다.
    const [product, gift] = await Promise.all([
      productModel.getProductByIdIgnoringStatus(order.product_id),
      orderModel.getGiftByOrderId(order.id)
    ]);

    return sendSuccess(res, {
      ...SUCCESS.ORDER_DETAIL_SUCCESS,
      data: {
        orderId: order.id,
        product: product ? {
          id: product.id,
          name: order.product_name_snapshot ?? product.name,
          brand: order.brand_snapshot ?? product.brand,
          thumbnailUrl: order.product_name_snapshot != null ? order.thumbnail_url_snapshot : product.thumbnail_url,
          validPeriod: product.valid_period
        } : null,
        totalPrice: order.total_price,
        message: order.message,
        isSelfGift: !!order.is_self_gift,
        receiver: {
          userId: order.receiver_id,
          nickname: order.receiver_nickname_snapshot
        },
        paymentStatus: order.payment_status,
        giftId: gift ? gift.id : null,
        createdAt: order.created_at
      }
    });

  } catch (error) {
    console.error('Order detail error:', error);
    return sendError(res);
  }
}

module.exports = {
  createOrder,
  getOrderDetail
};
