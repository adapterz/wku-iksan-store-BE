const giftModel = require('../db/models/giftModel');
const { sendSuccess, sendError } = require('../routes/api');
const { SUCCESS, ERROR } = require('../constants/responseCodes');
const { validateGiftNotificationInput } = require('../validators/giftNotificationValidator');
const { parsePositiveInteger } = require('../validators/commonValidator');

async function getUnnotifiedGifts(req, res) {
  try {
    const giftIds = await giftModel.getUnnotifiedGiftIds(req.session.userId);
    return sendSuccess(res, {
      ...SUCCESS.GIFT_UNNOTIFIED_SUCCESS,
      data: { count: giftIds.length, giftIds }
    });
  } catch (error) {
    console.error('Failed to fetch gift notifications:', error);
    return sendError(res);
  }
}

async function notifyGifts(req, res) {
  const validation = validateGiftNotificationInput(req.body);
  if (validation.errorCode) return sendError(res, ERROR[validation.errorCode]);
  try {
    const giftIds = validation.value;
    const accepted = await giftModel.notifyGifts(req.session.userId, giftIds);
    if (!accepted) return sendError(res, ERROR.GIFT_NOTIFICATION_TARGET_NOT_FOUND);
    // 신규 갱신 건수가 아닌 확인 완료된 요청 대상 수: 동일 재시도에도 같은 응답.
    return sendSuccess(res, {
      ...SUCCESS.GIFT_NOTIFY_SUCCESS,
      data: { count: giftIds.length, giftIds }
    });
  } catch (error) {
    if (error.cartError === 'UNAUTHORIZED') return sendError(res, ERROR.UNAUTHORIZED);
    console.error('Failed to acknowledge gift notifications:', error);
    return sendError(res);
  }
}

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

    if (status !== undefined && !['unused', 'used', 'cancelled'].includes(status)) {
      return sendError(res, ERROR.INVALID_GIFT_STATUS);
    }
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
      usedAt: gift.used_at,
      cancelledAt: gift.cancelled_at ?? null
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
    const giftId = parsePositiveInteger(req.params.id, { allowString: true });
    if (giftId === null) return sendError(res, ERROR.INVALID_GIFT_ID);
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
        barcode: gift.status === 'cancelled' ? null : gift.barcode,
        status: gift.status,
        usedAt: gift.used_at,
        cancelledAt: gift.cancelled_at ?? null,
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

function giftAction(action, success) {
  return async (req, res) => {
    const giftId = parsePositiveInteger(req.params.id, { allowString: true });
    if (giftId === null) return sendError(res, ERROR.INVALID_GIFT_ID);
    try {
      const result = await giftModel[action](req.session.userId, giftId);
      if (result.errorCode) return sendError(res, ERROR[result.errorCode]);
      return sendSuccess(res, { ...success, data: result.data });
    } catch (error) {
      // 회원 잠금을 기다리는 동안 탈퇴가 끝난 경우.
      if (error.cartError === 'UNAUTHORIZED') return sendError(res, ERROR.UNAUTHORIZED);
      console.error('Gift action failed:', action, error);
      return sendError(res);
    }
  };
}
const useGift = giftAction('useGift', SUCCESS.GIFT_USE_SUCCESS);
const cancelGift = giftAction('cancelGift', SUCCESS.GIFT_CANCEL_SUCCESS);

module.exports = {
  getUnnotifiedGifts,
  notifyGifts,
  getGifts,
  getGiftDetail,
  useGift,
  cancelGift
};
