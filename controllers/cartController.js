const cart = require('../db/models/cartModel');
const groups = require('../db/models/orderGroupModel');
const validate = require('../validators/cartValidator');
const { parsePositiveInteger } = require('../validators/commonValidator');
const { sendSuccess, sendError } = require('../routes/api');
const { SUCCESS, ERROR } = require('../constants/responseCodes');
function id(req, code = 'INVALID_CART_ID') {
  const value = parsePositiveInteger(req.params.id, { allowString: true });
  if (value === null) validate.reject(code);
  return value;
}
function handler(work, code) {
  return async (req, res) => {
    try { return sendSuccess(res, { ...SUCCESS[code], data: await work(req) }); }
    catch (error) {
      if (error.cartError && ERROR[error.cartError]) return sendError(res, { ...ERROR[error.cartError], data: error.data || null });
      if (['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error.code)) return sendError(res, ERROR.CART_BUSY);
      // 본문·SQL·요청 키를 로그에 남기지 않는다.
      console.error('Cart operation failed:', { code: error.code || 'UNKNOWN' });
      return sendError(res);
    }
  };
}
module.exports = {
  list: handler(req => cart.list(req.session.userId), 'CART_LIST_SUCCESS'),
  add: handler(req => cart.add(req.session.userId, validate.validateAdd(req.body)), 'CART_ADD_SUCCESS'),
  update: handler(req => cart.update(req.session.userId, id(req), validate.validateUpdate(req.body)), 'CART_UPDATE_SUCCESS'),
  removeOne: handler(req => cart.remove(req.session.userId, [id(req)]), 'CART_REMOVE_SUCCESS'),
  removeMany: handler(req => cart.remove(req.session.userId, validate.validateIds(req.body)), 'CART_REMOVE_SUCCESS'),
  createGroup: handler(req => groups.create(req.session.userId, validate.validateGroup(req.body, req.get('Idempotency-Key'), req.session.userId)), 'ORDER_GROUP_CREATE_SUCCESS'),
  getGroup: handler(req => groups.get(req.session.userId, id(req, 'INVALID_ORDER_GROUP_ID')), 'ORDER_GROUP_DETAIL_SUCCESS')
};
