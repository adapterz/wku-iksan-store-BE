const express = require('express');
const request = require('supertest');
jest.mock('../../../db/pool',()=>({query:jest.fn()}));
jest.mock('../../../db/redisClient');
jest.mock('../../../db/models/userModel');
jest.mock('../../../controllers/authController');
jest.mock('../../../controllers/inquiriesController');
jest.mock('../../../controllers/reportsController');
const users=require('../../../db/models/userModel');
const auth=require('../../../controllers/authController');
const inquiries=require('../../../controllers/inquiriesController');
const reports=require('../../../controllers/reportsController');
const saved={};
for(const name of ['LOGIN','SIGNUP','INQUIRY','REPORT']){
  const key=`RATE_LIMIT_${name}_MAX`; saved[key]=process.env[key]; process.env[key]='2';
}
const authRouter=require('../../../routes/auth');
const inquiryRouter=require('../../../routes/inquiries');
const reviewRouter=require('../../../routes/reviews');
for(const key of Object.keys(saved)){
  if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];
}
function app(){
  const result=express(); result.use(express.json());
  result.use((req,res,next)=>{req.session={userId:req.get('X-Test-User')||undefined,authVersion:1,destroy:cb=>cb()};next();});
  result.use('/api/auth',authRouter);result.use('/api/inquiries',inquiryRouter);result.use('/api/reviews',reviewRouter);
  return result;
}
beforeAll(()=>{
  users.getAuthStateById.mockImplementation(async id=>({id,auth_version:1}));
  for(const fn of [auth.login,auth.signup,auth.logout,inquiries.createInquiry,inquiries.getMyInquiries,reports.createReport])fn.mockImplementation((req,res)=>res.sendStatus(200));
});
test('실제 로그인/가입 라우트에 제한이 장착되고 로그아웃은 제외',async()=>{
  const target=app();
  for(const path of ['login','signup']){
    for(let i=0;i<2;i++)expect((await request(target).post('/api/auth/'+path)).status).toBe(200);
    expect((await request(target).post('/api/auth/'+path)).status).toBe(429);
  }
  expect(auth.login).toHaveBeenCalledTimes(2);expect(auth.signup).toHaveBeenCalledTimes(2);
  expect((await request(target).post('/api/auth/logout')).status).toBe(200);
});
test('실제 문의/신고 등록만 제한하고 미인증·조회 동작은 유지',async()=>{
  const target=app();
  for(const path of ['/api/inquiries','/api/reviews/1/reports']){
    expect((await request(target).post(path)).status).toBe(401);
    for(let i=0;i<2;i++)expect((await request(target).post(path).set('X-Test-User','7')).status).toBe(200);
    expect((await request(target).post(path).set('X-Test-User','7')).status).toBe(429);
  }
  expect(inquiries.createInquiry).toHaveBeenCalledTimes(2);expect(reports.createReport).toHaveBeenCalledTimes(2);
  expect((await request(target).get('/api/inquiries/me').set('X-Test-User','7')).status).toBe(200);
});
