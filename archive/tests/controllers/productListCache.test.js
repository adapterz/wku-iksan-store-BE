// 원본 Redis/MySQL 클라이언트를 평가하지 않는다. DB 응답 순서와 Redis 상태를
// 직접 제어해서 타이밍에 의존하지 않고 캐시 경합을 재현한다.
const mockRedis = { get: jest.fn(), set: jest.fn(), keys: jest.fn(), del: jest.fn() };
const mockProducts = {
  getAllProducts: jest.fn(), getProductById: jest.fn(),
  createProduct: jest.fn(), updateProduct: jest.fn(), updateProductStatus: jest.fn()
};
const mockSearch = { recordSearch: jest.fn() };
const mockCategories = { getCategoryById: jest.fn(), updateCategory: jest.fn() };
const mockWishlists = { createWishlist: jest.fn(), deleteWishlist: jest.fn() };
jest.mock('../../../db/redisClient', () => mockRedis);
jest.mock('../../../db/models/productModel', () => mockProducts);
jest.mock('../../../db/models/searchLogModel', () => mockSearch);
jest.mock('../../../db/models/categoryModel', () => mockCategories);
jest.mock('../../../db/models/wishlistModel', () => mockWishlists);

const controller = require('../../../controllers/productsController');
const adminProducts = require('../../../controllers/adminProductsController');
const adminCategories = require('../../../controllers/adminCategoriesController');
const wishlists = require('../../../controllers/wishlistsController');
const PREFIX = 'products:list-cache:v2';
const GENERATION = `${PREFIX}:generation`;
const keyFor = (generation, filters = ['', '', '']) => `${PREFIX}:${generation}:${JSON.stringify(filters)}`;
const row = (name = '새 상품') => ({
  id: 1, name, brand: '브랜드', price: 1000, thumbnail_url: null,
  category_id: 1, category_name: '간식', wishlist_count: 3
});
let store;
let now;

function read(key) {
  const entry = store.get(key);
  if (entry && entry.expiresAt <= now) store.delete(key);
  return store.get(key)?.value ?? null;
}
async function write(key, value, option, seconds) {
  if (option === 'NX' && read(key) !== null) return null;
  store.set(key, { value, expiresAt: option === 'EX' ? now + seconds * 1000 : Infinity });
  return 'OK';
}
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
async function invoke(fn, req = {}) {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  await fn({ query: {}, params: {}, session: { userId: 1 }, ...req }, res);
  return res.json.mock.calls[0][0];
}

beforeEach(() => {
  jest.resetAllMocks();
  store = new Map();
  now = 0;
  mockRedis.get.mockImplementation(async key => read(key));
  mockRedis.set.mockImplementation(write);
  mockProducts.getAllProducts.mockResolvedValue([row()]);
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

test('공유 세대 초기화 후 같은 필터는 300초 캐시를 사용하고 응답 형식 유지', async () => {
  const first = await invoke(controller.getProducts);
  const second = await invoke(controller.getProducts);
  expect(first).toEqual(second);
  expect(first.data[0]).toEqual({
    id: 1, name: '새 상품', brand: '브랜드', price: 1000, thumbnailUrl: null,
    categoryId: 1, categoryName: '간식', wishlistCount: 3
  });
  expect(mockProducts.getAllProducts).toHaveBeenCalledTimes(1);
  expect(mockRedis.set).toHaveBeenCalledWith(GENERATION, expect.any(String), 'NX');
  expect(mockRedis.set).toHaveBeenCalledWith(keyFor(read(GENERATION)), expect.any(String), 'EX', 300);
  expect(store.get(GENERATION).expiresAt).toBe(Infinity);
});

test('무효화 후 늦게 끝난 이전 DB 조회는 다음 요청 캐시를 오염시키지 않음', async () => {
  const started = deferred();
  const oldQuery = deferred();
  mockProducts.getAllProducts.mockImplementationOnce(() => {
    started.resolve();
    return oldQuery.promise;
  });
  const pending = invoke(controller.getProducts);
  await started.promise;
  const oldGeneration = read(GENERATION);
  await controller.invalidateProductListCache();
  const newGeneration = read(GENERATION);
  expect(newGeneration).not.toBe(oldGeneration);
  oldQuery.resolve([row('이전 상품')]);
  expect((await pending).data[0].name).toBe('이전 상품'); // 이미 시작된 응답은 보장 범위 밖
  expect((await invoke(controller.getProducts)).data[0].name).toBe('새 상품');
  expect((await invoke(controller.getProducts)).data[0].name).toBe('새 상품');
  expect(mockProducts.getAllProducts).toHaveBeenCalledTimes(2);
  expect(JSON.parse(read(keyFor(oldGeneration)))[0].name).toBe('이전 상품');
  expect(JSON.parse(read(keyFor(newGeneration)))[0].name).toBe('새 상품');
});

test('캐시 SET이 지연돼 새 세대 저장보다 늦게 완료되어도 분리됨', async () => {
  const started = deferred();
  const release = deferred();
  mockProducts.getAllProducts.mockResolvedValueOnce([row('이전 상품')]);
  mockRedis.set.mockImplementation(async (key, ...args) => {
    if (key !== GENERATION && args[0].includes('이전 상품')) {
      started.resolve();
      await release.promise;
    }
    return write(key, ...args);
  });
  const pending = invoke(controller.getProducts);
  await started.promise;
  await controller.invalidateProductListCache();
  await invoke(controller.getProducts);
  release.resolve();
  await pending;
  expect((await invoke(controller.getProducts)).data[0].name).toBe('새 상품');
  expect(mockProducts.getAllProducts).toHaveBeenCalledTimes(2);
});

test('독립 모듈 인스턴스도 Redis 세대를 공유해 다른 인스턴스의 무효화를 반영', async () => {
  let other;
  jest.isolateModules(() => { other = require('../../../controllers/productsController'); });
  expect(other).not.toBe(controller);
  await invoke(controller.getProducts);
  await invoke(other.getProducts);
  expect(mockProducts.getAllProducts).toHaveBeenCalledTimes(1);
  await other.invalidateProductListCache();
  mockProducts.getAllProducts.mockResolvedValue([row('서버 B 변경')]);
  expect((await invoke(controller.getProducts)).data[0].name).toBe('서버 B 변경');
});

test('동시 최초 요청은 NX 승자의 세대를 사용', async () => {
  const originalGet = mockRedis.get.getMockImplementation();
  const bothStarted = deferred();
  let reads = 0;
  mockRedis.get.mockImplementation(async key => {
    if (key === GENERATION && ++reads <= 2) {
      if (reads === 2) bothStarted.resolve();
      await bothStarted.promise;
      return null;
    }
    return originalGet(key);
  });
  await Promise.all([invoke(controller.getProducts), invoke(controller.getProducts)]);
  const dataKeys = mockRedis.set.mock.calls.filter(([, , option]) => option === 'EX').map(([key]) => key);
  expect(dataKeys).toHaveLength(2);
  expect(new Set(dataKeys)).toEqual(new Set([keyFor(read(GENERATION))]));
});

test('세대 없음 조회 직후 무효화가 먼저 실행되면 NX로 덮어쓰지 않음', async () => {
  mockRedis.get.mockImplementationOnce(async () => {
    await controller.invalidateProductListCache();
    return null;
  });
  await invoke(controller.getProducts);
  const initialized = mockRedis.set.mock.calls.find(([, , option]) => option === 'NX')[1];
  expect(read(GENERATION)).not.toBe(initialized);
  expect(read(keyFor(read(GENERATION)))).not.toBeNull();
});

test('세대 키만 유실돼도 남은 과거 캐시를 재사용하지 않음', async () => {
  mockProducts.getAllProducts.mockResolvedValueOnce([row('과거 값')]);
  await invoke(controller.getProducts);
  const previous = read(GENERATION);
  store.delete(GENERATION);
  expect((await invoke(controller.getProducts)).data[0].name).toBe('새 상품');
  expect(read(GENERATION)).not.toBe(previous);
});

test('데이터 TTL 만료 후 재조회, 여러 무효화는 매번 새 세대 사용', async () => {
  await invoke(controller.getProducts);
  const initial = read(GENERATION);
  now = 300000;
  await invoke(controller.getProducts);
  expect(mockProducts.getAllProducts).toHaveBeenCalledTimes(2);
  expect(read(GENERATION)).toBe(initial);
  await controller.invalidateProductListCache();
  const next = read(GENERATION);
  await controller.invalidateProductListCache();
  expect(new Set([initial, next, read(GENERATION)]).size).toBe(3);
  expect(mockRedis.keys).not.toHaveBeenCalled();
  expect(mockRedis.del).not.toHaveBeenCalled();
});

test('필터 조합을 분리하고 캐시 적중 시에도 검색 로그는 요청당 한 번 기록', async () => {
  const queries = [{}, { keyword: 'a:categoryId=:brand=b' }, { keyword: 'a', brand: 'b:categoryId=:brand=c' }, { categoryId: '2' }];
  for (const query of queries) {
    await invoke(controller.getProducts, { query });
    await invoke(controller.getProducts, { query });
  }
  expect(mockProducts.getAllProducts).toHaveBeenCalledTimes(4);
  expect(mockSearch.recordSearch).toHaveBeenCalledTimes(4);
  expect(new Set(mockRedis.set.mock.calls.filter(([, , option]) => option === 'EX').map(([key]) => key)).size).toBe(4);
});

test.each(['generation', 'data', 'initialization'])('%s Redis 실패 시 DB 폴백 및 데이터 캐시 저장 생략', async stage => {
  if (stage === 'generation') mockRedis.get.mockRejectedValueOnce(new Error('timeout'));
  if (stage === 'initialization') mockRedis.set.mockRejectedValueOnce(new Error('offline'));
  if (stage === 'data') {
    await write(GENERATION, 'ready');
    mockRedis.get.mockImplementation(async key => {
      if (key !== GENERATION) throw new Error('timeout');
      return read(key);
    });
  }
  expect((await invoke(controller.getProducts)).status).toBe(200);
  expect(mockProducts.getAllProducts).toHaveBeenCalledTimes(1);
  expect(mockRedis.set.mock.calls.some(([, , option]) => option === 'EX')).toBe(false);
});

test('초기화 경합 후에도 세대가 없으면 유효한 세대 없이 저장하지 않음', async () => {
  mockRedis.set.mockResolvedValue(null);
  expect((await invoke(controller.getProducts)).status).toBe(200);
  expect(mockRedis.set).toHaveBeenCalledTimes(1);
});

test('데이터 저장 실패는 성공 응답 유지, DB 실패는 캐시 저장 없이 500', async () => {
  await write(GENERATION, 'ready');
  mockRedis.set.mockRejectedValue(new Error('write failed'));
  expect((await invoke(controller.getProducts)).status).toBe(200);
  mockRedis.set.mockClear();
  mockProducts.getAllProducts.mockRejectedValueOnce(new Error('DB failed'));
  expect((await invoke(controller.getProducts)).status).toBe(500);
  expect(mockRedis.set).not.toHaveBeenCalled();
});

test('무효화 실패는 기존처럼 기록하고 반환, 실패 후 최신성을 보장하지 않음', async () => {
  await invoke(controller.getProducts);
  const generation = read(GENERATION);
  mockRedis.set.mockRejectedValueOnce(new Error('offline'));
  await expect(controller.invalidateProductListCache()).resolves.toBeUndefined();
  expect(read(GENERATION)).toBe(generation);
  expect(console.error).toHaveBeenCalledWith('상품 목록 캐시 무효화 실패:', 'offline');
});

test('구버전 캐시는 읽지 않고 잘못된 JSON은 DB 폴백', async () => {
  await write('products:list:["","",""]', JSON.stringify([{ name: '레거시' }]));
  await write(GENERATION, 'ready');
  await write(keyFor('ready'), '{invalid json');
  expect((await invoke(controller.getProducts)).data[0].name).toBe('새 상품');
  expect(mockRedis.get).not.toHaveBeenCalledWith('products:list:["","",""]');
});

test.each([
  ['상품 등록', adminProducts.createProduct, { body: { name: '상품', brand: '브랜드', price: 1000, categoryId: 1 } }],
  ['상품 수정', adminProducts.updateProduct, { params: { id: '1' }, body: { name: '수정' } }],
  ['상품 숨김', adminProducts.updateProductStatus, { params: { id: '1' }, body: { status: 'hidden' } }],
  ['상품 단종', adminProducts.updateProductStatus, { params: { id: '1' }, body: { status: 'discontinued' } }],
  ['카테고리명 수정', adminCategories.updateCategory, { params: { id: '1' }, body: { name: '수정' } }],
  ['찜 추가', wishlists.createWishlist, { body: { productId: 1 } }],
  ['찜 삭제', wishlists.removeWishlist, { params: { productId: '1' } }]
])('%s 성공 후 기존 호출 경로가 새 세대로 전환', async (_, fn, req) => {
  await invoke(controller.getProducts);
  const previous = read(GENERATION);
  mockCategories.getCategoryById.mockResolvedValue({ id: 1 });
  mockCategories.updateCategory.mockResolvedValue({ id: 1 });
  mockProducts.createProduct.mockResolvedValue(row());
  mockProducts.updateProduct.mockResolvedValue(row());
  mockProducts.updateProductStatus.mockResolvedValue(row());
  mockProducts.getProductById.mockResolvedValue(row());
  mockWishlists.createWishlist.mockResolvedValue({ id: 1 });
  expect((await invoke(fn, req)).status).toBeLessThan(300);
  expect(read(GENERATION)).not.toBe(previous);
  await invoke(controller.getProducts);
  expect(mockProducts.getAllProducts).toHaveBeenCalledTimes(2);
});

test('DB 변경 실패/상품 없음 시 세대를 바꾸지 않음', async () => {
  await invoke(controller.getProducts);
  const previous = read(GENERATION);
  const req = { params: { id: '1' }, body: { name: '수정' } };
  mockProducts.updateProduct.mockRejectedValueOnce(new Error('DB failed'));
  expect((await invoke(adminProducts.updateProduct, req)).status).toBe(500);
  mockProducts.updateProduct.mockResolvedValueOnce(null);
  expect((await invoke(adminProducts.updateProduct, req)).status).toBe(404);
  expect(read(GENERATION)).toBe(previous);
});
