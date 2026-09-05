jest.mock('../../../db/models/reviewModel');
const reviewModel = require('../../../db/models/reviewModel');
const controller = require('../../../controllers/reviewModerationController');

function response() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  };
}

beforeEach(() => jest.resetAllMocks());
afterEach(() => jest.restoreAllMocks());

test('검증된 상태 변경 결과를 공통 응답 형식으로 반환', async () => {
  reviewModel.updateReviewStatus.mockResolvedValue({ reviewId: 9, status: 'hidden' });
  const res = response();
  await controller.updateReviewStatus({ params: { id: '9' }, body: { status: 'hidden' } }, res);
  expect(reviewModel.updateReviewStatus).toHaveBeenCalledWith(9, 'hidden');
  expect(res.status).toHaveBeenCalledWith(200);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    code: 'ADMIN_REVIEW_STATUS_UPDATE_SUCCESS',
    data: { reviewId: 9, status: 'hidden' }
  }));
});

test.each([
  [{ id: 'nope' }, { status: 'hidden' }, 'INVALID_REVIEW_ID'],
  [{ id: '9' }, {}, 'REQUIRED_REVIEW_STATUS'],
  [{ id: '9' }, { status: 'deleted' }, 'INVALID_REVIEW_STATUS']
])('잘못된 요청은 모델 호출 없이 거부', async (params, body, code) => {
  const res = response();
  await controller.updateReviewStatus({ params, body }, res);
  expect(reviewModel.updateReviewStatus).not.toHaveBeenCalled();
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 400, code }));
});

test('없는 리뷰 오류를 404로 변환', async () => {
  reviewModel.updateReviewStatus.mockRejectedValue({ reviewError: 'REVIEW_NOT_FOUND' });
  const res = response();
  await controller.updateReviewStatus({ params: { id: '9' }, body: { status: 'visible' } }, res);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 404, code: 'REVIEW_NOT_FOUND' }));
});

test('DB 오류의 상세정보를 응답이나 로그에 남기지 않음', async () => {
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  reviewModel.updateReviewStatus.mockRejectedValue({ code: 'ER_DB', sql: 'sensitive', message: 'secret' });
  const res = response();
  await controller.updateReviewStatus({ params: { id: '9' }, body: { status: 'hidden' } }, res);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 500, code: 'INTERNAL_SERVER_ERROR' }));
  expect(spy).toHaveBeenCalledWith('Review moderation failed:', { code: 'ER_DB' });
});
