const express = require('express');
const router = express.Router();
const requireLogin = require('../middlewares/requireLogin');
const orderModel = require('../db/models/orderModel');
const productModel = require('../db/models/productModel');
const userModel = require('../db/models/userModel');
const { sendSuccess, sendError } = require('./api');
const { SUCCESS, ERROR } = require('../constants/responseCodes');

// API 명세서 기준: 결제 Mock/금액 검증 로직 없음 (Issue #141 확정)
router.post('/', requireLogin, async (req, res) => {
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

    const finalReceiverId = isSelfGift ? userId : receiverId;

    const product = await productModel.getProductById(productId);
    if (!product) {
      return sendError(res, ERROR.PRODUCT_NOT_FOUND);
    }

    if (!isSelfGift && Number(receiverId) === userId) {
      return sendError(res, ERROR.RECEIVER_NOT_FOUND);
    }

    const receiver = await userModel.getUserById(finalReceiverId);
    if (!receiver) {
      return sendError(res, ERROR.RECEIVER_NOT_FOUND);
    }

    // 12자리 난수 생성 (바코드)
    let barcode = '';
    for (let i = 0; i < 12; i++) {
      barcode += Math.floor(Math.random() * 10).toString();
    }

    const finalTotalPrice = product.price; // 서버에서 직접 상품 가격 조회
    const orderId = await orderModel.createOrder(userId, productId, finalReceiverId, finalTotalPrice, message || null, isSelfGift);
    const giftId = await orderModel.createGift(orderId, barcode);

    return sendSuccess(res, {
      ...SUCCESS.ORDER_CREATE_SUCCESS,
      data: { orderId, giftId }
    });

  } catch (error) {
    console.error('Order creation error:', error);
    return sendError(res);
  }
});

router.get('/:id', requireLogin, async (req, res) => {
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

    const receiver = await userModel.getUserById(order.receiver_id);
    const product = await productModel.getProductById(order.product_id);
    const gift = await orderModel.getGiftByOrderId(order.id);
    
    return sendSuccess(res, {
      ...SUCCESS.ORDER_DETAIL_SUCCESS,
      data: {
        orderId: order.id,
        product: product ? {
          id: product.id,
          name: product.name,
          brand: product.brand,
          thumbnailUrl: product.thumbnail_url
        } : null,
        totalPrice: order.total_price,
        message: order.message,
        isSelfGift: !!order.is_self_gift,
        receiver: receiver ? {
          userId: receiver.id,
          nickname: receiver.nickname
        } : null,
        paymentStatus: order.payment_status,
        giftId: gift ? gift.id : null,
        createdAt: order.created_at
      }
    });

  } catch (error) {
    console.error('Order detail error:', error);
    return sendError(res);
  }
});

module.exports = router;
