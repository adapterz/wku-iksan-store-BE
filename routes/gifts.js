const express = require('express');
const router = express.Router();
const requireLogin = require('../middlewares/requireLogin');
const giftModel = require('../db/models/giftModel');

router.get('/', requireLogin, async (req, res) => {
  try {
    const receiverId = req.session.userId;
    const { status } = req.query;

    // Call the model function. It handles filtering if status is 'unused' or 'used'.
    // Invalid status defaults to returning all gifts.
    const gifts = await giftModel.getGiftsByReceiverId(receiverId, status);

    // Map snake_case to camelCase
    const formattedData = gifts.map(gift => ({
      giftId: gift.gift_id,
      productName: gift.product_name,
      thumbnailUrl: gift.thumbnail_url,
      brand: gift.brand,
      status: gift.status,
      senderNickname: gift.sender_nickname,
      isSelfGift: !!gift.is_self_gift,
      createdAt: gift.created_at,
      usedAt: gift.used_at
    }));

    return res.status(200).json({
      status: 200,
      code: "GIFT_LIST_SUCCESS",
      message: null,
      data: formattedData
    });

  } catch (error) {
    console.error('Failed to fetch gifts:', error);
    return res.status(500).json({
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      message: null,
      data: null
    });
  }
});

router.get('/:id', requireLogin, async (req, res) => {
  try {
    const giftId = req.params.id;
    const userId = req.session.userId;

    const gift = await giftModel.getGiftDetailById(giftId);
    if (!gift) {
      return res.status(404).json({ status: 404, code: "GIFT_NOT_FOUND", message: null, data: null });
    }

    if (gift.receiver_id !== userId) {
      return res.status(403).json({ status: 403, code: "FORBIDDEN_NOT_OWNER", message: null, data: null });
    }

    return res.status(200).json({
      status: 200,
      code: "GIFT_DETAIL_SUCCESS",
      message: null,
      data: {
        giftId: gift.gift_id,
        productName: gift.product_name,
        thumbnailUrl: gift.thumbnail_url,
        barcode: gift.barcode,
        status: gift.status,
        usedAt: gift.used_at,
        isSelfGift: !!gift.is_self_gift,
        sender: {
          userId: gift.sender_id,
          nickname: gift.sender_nickname
        },
        message: gift.message
      }
    });
  } catch (error) {
    console.error('Failed to fetch gift detail:', error);
    return res.status(500).json({ status: 500, code: "INTERNAL_SERVER_ERROR", message: null, data: null });
  }
});

router.patch('/:id/use', requireLogin, async (req, res) => {
  try {
    const giftId = req.params.id;
    const userId = req.session.userId;

    const gift = await giftModel.getGiftDetailById(giftId);
    if (!gift) {
      return res.status(404).json({ status: 404, code: "GIFT_NOT_FOUND", message: null, data: null });
    }

    if (gift.receiver_id !== userId) {
      return res.status(403).json({ status: 403, code: "FORBIDDEN_NOT_OWNER", message: null, data: null });
    }

    const affectedRows = await giftModel.updateGiftStatusToUsed(giftId);
    if (affectedRows === 0) {
      // It means it was not in 'unused' status
      return res.status(409).json({ status: 409, code: "GIFT_ALREADY_USED", message: null, data: null });
    }

    // To return the exact updated usedAt, we can fetch it again or rely on DB defaults.
    // Let's just fetch it again to be perfectly accurate with DB time.
    const updatedGift = await giftModel.getGiftDetailById(giftId);

    return res.status(200).json({
      status: 200,
      code: "GIFT_USE_SUCCESS",
      message: null,
      data: {
        giftId: updatedGift.gift_id,
        status: updatedGift.status,
        usedAt: updatedGift.used_at
      }
    });

  } catch (error) {
    console.error('Failed to use gift:', error);
    return res.status(500).json({ status: 500, code: "INTERNAL_SERVER_ERROR", message: null, data: null });
  }
});

module.exports = router;
