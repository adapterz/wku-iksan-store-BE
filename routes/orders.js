const express = require('express');
const router = express.Router();
const requireLogin = require('../middlewares/requireLogin');
const orderModel = require('../db/models/orderModel');
const productModel = require('../db/models/productModel');
const userModel = require('../db/models/userModel');

// API 명세서 기준: 결제 Mock/금액 검증 로직 없음 (Issue #141 확정)
router.post('/', requireLogin, async (req, res) => {
  try {
    const { productId, message, isSelfGift, receiverId } = req.body;
    const userId = req.session.userId;

    if (!productId) {
      return res.status(400).json({ status: 400, code: "REQUIRED_PRODUCT_ID", message: null, data: null });
    }
    if (isSelfGift === undefined) {
      return res.status(400).json({ status: 400, code: "REQUIRED_IS_SELF_GIFT", message: null, data: null });
    }
    if (!isSelfGift && !receiverId) {
      return res.status(400).json({ status: 400, code: "REQUIRED_RECEIVER_ID", message: null, data: null });
    }

    const finalReceiverId = isSelfGift ? userId : receiverId;

    const product = await productModel.getProductById(productId);
    if (!product) {
      return res.status(404).json({ status: 404, code: "PRODUCT_NOT_FOUND", message: null, data: null });
    }

    if (!isSelfGift && Number(receiverId) === userId) {
      return res.status(404).json({
        status: 404,
        code: "RECEIVER_NOT_FOUND",
        message: null,
        data: null
      });
    }

    const receiver = await userModel.getUserById(finalReceiverId);
    if (!receiver) {
      return res.status(404).json({ status: 404, code: "RECEIVER_NOT_FOUND", message: null, data: null });
    }

    // 12자리 난수 생성 (바코드)
    let barcode = '';
    for (let i = 0; i < 12; i++) {
      barcode += Math.floor(Math.random() * 10).toString();
    }

    const finalTotalPrice = product.price; // 서버에서 직접 상품 가격 조회
    const orderId = await orderModel.createOrder(userId, productId, finalReceiverId, finalTotalPrice, message || null, isSelfGift);
    const giftId = await orderModel.createGift(orderId, barcode);

    return res.status(201).json({
      status: 201,
      code: "ORDER_CREATE_SUCCESS",
      message: null,
      data: { orderId, giftId }
    });

  } catch (error) {
    console.error('Order creation error:', error);
    return res.status(500).json({ status: 500, code: "INTERNAL_SERVER_ERROR", message: null, data: null });
  }
});

router.get('/:id', requireLogin, async (req, res) => {
  try {
    const orderId = req.params.id;
    const userId = req.session.userId;

    const order = await orderModel.getOrderById(orderId);
    if (!order) {
      return res.status(404).json({ status: 404, code: "ORDER_NOT_FOUND", message: null, data: null });
    }

    if (order.user_id !== userId) {
      return res.status(403).json({ status: 403, code: "FORBIDDEN_NOT_OWNER", message: null, data: null });
    }

    const receiver = await userModel.getUserById(order.receiver_id);
    const product = await productModel.getProductById(order.product_id);
    const gift = await orderModel.getGiftByOrderId(order.id);
    
    return res.status(200).json({
      status: 200,
      code: "ORDER_DETAIL_SUCCESS",
      message: null,
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
    return res.status(500).json({ status: 500, code: "INTERNAL_SERVER_ERROR", message: null, data: null });
  }
});

module.exports = router;
