const giftModel = require('../db/models/giftModel');
const { sendSuccess, sendError } = require('../routes/api');
const { SUCCESS, ERROR } = require('../constants/responseCodes');

function reviewFields(gift, userId) {
  return {
    productId: gift.product_id,
    reviewId: gift.review_id ?? null,
    canReview: gift.receiver_id === userId && gift.payment_status === 'paid' &&
      gift.status === 'used' && gift.review_id == null
  };
}

async function getGifts(req, res) {
  try {
    const receiverId = req.session.userId;
    const { status } = req.query;

    // Call the model function. It handles filtering if status is 'unused' or 'used'.
    // Invalid status defaults to returning all gifts.
    const gifts = await giftModel.getGiftsByReceiverId(receiverId, status);

    // Map snake_case to camelCase
    const formattedData = gifts.map(gift => ({
      giftId: gift.gift_id,
      ...reviewFields(gift, receiverId),
      productName: gift.product_name,
      thumbnailUrl: gift.thumbnail_url,
      brand: gift.brand,
      status: gift.status,
      senderNickname: gift.sender_nickname,
      isSelfGift: !!gift.is_self_gift,
      createdAt: gift.created_at,
      usedAt: gift.used_at
    }));

    return sendSuccess(res, {
      ...SUCCESS.GIFT_LIST_SUCCESS,
      data: formattedData
    });

  } catch (error) {
    console.error('Failed to fetch gifts:', error);
    return sendError(res);
  }
}

async function getGiftDetail(req, res) {
  try {
    const giftId = req.params.id;
    const userId = req.session.userId;

    const gift = await giftModel.getGiftDetailById(giftId);
    if (!gift) {
      return sendError(res, ERROR.GIFT_NOT_FOUND);
    }

    if (gift.receiver_id !== userId) {
      return sendError(res, ERROR.FORBIDDEN_NOT_OWNER);
    }

    return sendSuccess(res, {
      ...SUCCESS.GIFT_DETAIL_SUCCESS,
      data: {
        giftId: gift.gift_id,
        ...reviewFields(gift, userId),
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
    return sendError(res);
  }
}

async function useGift(req, res) {
  try {
    const giftId = req.params.id;
    const userId = req.session.userId;

    const gift = await giftModel.getGiftDetailById(giftId);
    if (!gift) {
      return sendError(res, ERROR.GIFT_NOT_FOUND);
    }

    if (gift.receiver_id !== userId) {
      return sendError(res, ERROR.FORBIDDEN_NOT_OWNER);
    }

    const affectedRows = await giftModel.updateGiftStatusToUsed(giftId);
    if (affectedRows === 0) {
      // It means it was not in 'unused' status
      return sendError(res, ERROR.GIFT_ALREADY_USED);
    }

    // To return the exact updated usedAt, we can fetch it again or rely on DB defaults.
    // Let's just fetch it again to be perfectly accurate with DB time.
    const updatedGift = await giftModel.getGiftDetailById(giftId);

    return sendSuccess(res, {
      ...SUCCESS.GIFT_USE_SUCCESS,
      data: {
        giftId: updatedGift.gift_id,
        status: updatedGift.status,
        usedAt: updatedGift.used_at
      }
    });

  } catch (error) {
    console.error('Failed to use gift:', error);
    return sendError(res);
  }
}

module.exports = {
  getGifts,
  getGiftDetail,
  useGift
};
