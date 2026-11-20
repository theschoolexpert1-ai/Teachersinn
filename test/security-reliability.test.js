'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {int,str,oneOf,RateLimiter,ValidationError}=require('../src/security');

test('integer validation accepts existing numeric formats but rejects coercible structured values',()=>{
  assert.equal(int(4,{field:'Page',min:1,max:10}),4);
  assert.equal(int('4',{field:'Page',min:1,max:10}),4);
  for(const value of [true,false,[],[4],{}]) assert.throws(()=>int(value,{field:'Page',min:0,max:10}),ValidationError);
  assert.throws(()=>int('1.5',{field:'Page',min:1,max:10}),/whole number/);
  assert.throws(()=>int('11',{field:'Page',min:1,max:10}),/whole number/);
});

test('string and enum validation reject nested or unexpected values without leaking internals',()=>{
  assert.throws(()=>str({value:'teacher'},{field:'Name'}),/^ValidationError: Name is invalid\.$/);
  assert.throws(()=>oneOf('owner',['educator','mentor','admin'],'Role'),/^ValidationError: Role must be one of:/);
});

test('fixed-window rate limiting isolates keys and resets at the existing boundary',()=>{
  const original=Date.now;let now=1000;Date.now=()=>now;
  try{const limiter=new RateLimiter(2,1000);assert.equal(limiter.hit('a').ok,true);assert.equal(limiter.hit('a').ok,true);assert.equal(limiter.hit('a').ok,false);assert.equal(limiter.hit('b').ok,true);now=2000;assert.equal(limiter.hit('a').ok,true);}finally{Date.now=original;}
});
