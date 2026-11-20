'use strict';

const crypto=require('node:crypto');

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const DATE=/^\d{4}-\d{2}-\d{2}$/;

function valueType(value){if(value===null)return'null';if(value instanceof Date)return'date';if(Array.isArray(value))return'array';return typeof value;}
function normalize(value,expected){
  if(value===null||value===undefined)return value??null;
  if(typeof expected==='number'){
    if(typeof value==='number'&&Number.isFinite(value))return String(value);
    if(typeof value==='string'&&/^-?\d+$/.test(value))return BigInt(value).toString();
    return value;
  }
  if(typeof expected==='boolean'){
    if(value===true||value===1||value==='1')return true;
    if(value===false||value===0||value==='0')return false;
    return value;
  }
  if(typeof expected==='string'){
    if(UUID.test(expected)&&typeof value==='string'&&UUID.test(value))return value.toLowerCase();
    if(ISO.test(expected)){
      const date=value instanceof Date?value:new Date(value);
      return Number.isNaN(date.getTime())?value:date.toISOString();
    }
    if(DATE.test(expected)){
      if(typeof value==='string'&&DATE.test(value))return value;
      if(value instanceof Date&&!Number.isNaN(value.getTime()))return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`;
    }
    return value;
  }
  if(Array.isArray(expected)){
    let parsed=value;
    if(typeof value==='string')try{parsed=JSON.parse(value);}catch{return value;}
    return Array.isArray(parsed)?parsed.map((item,index)=>normalize(item,expected[index])):parsed;
  }
  if(expected&&typeof expected==='object'&&value&&typeof value==='object')return Object.fromEntries(Object.keys(expected).sort().map(k=>[k,normalize(value[k],expected[k])]));
  return value;
}
function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object'&&!(value instanceof Date))return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));return value instanceof Date?(Number.isNaN(value.getTime())?'[invalid-date]':value.toISOString()):value;}
function digest(value,key){return crypto.createHmac('sha256',key).update(JSON.stringify(stable(value))).digest('hex');}
function locatorColumns(row){if(Object.hasOwn(row,'id'))return['id'];if(Object.hasOwn(row,'legacy_user_id'))return['legacy_user_id'];return Object.keys(row).filter(k=>k.endsWith('_id')).slice(0,2);}
function locator(row){return JSON.stringify(locatorColumns(row).map(k=>normalize(row[k],row[k])));}
function compareRows(table,expectedRows,actualRows,columns,{key=crypto.randomBytes(32)}={}){
  const expected=[...expectedRows].sort((a,b)=>locator(a).localeCompare(locator(b))),actual=[...actualRows].sort((a,b)=>locator(a).localeCompare(locator(b))),mismatches=[];
  const total=Math.max(expected.length,actual.length);
  for(let index=0;index<total;index++){
    const e=expected[index],a=actual[index],record=`synthetic-record-${String(index+1).padStart(2,'0')}`;
    if(!e||!a){mismatches.push({table,record,column:'*',category:e?'MISSING_RECORD':'UNEXPECTED_RECORD',expectedType:e?'object':'absent',actualType:a?'object':'absent',expectedFingerprint:e?digest(e,key):null,actualFingerprint:a?digest(a,key):null,status:'FAIL'});continue;}
    for(const column of columns){const ev=e[column]??null,av=a[column]??null,en=normalize(ev,ev),an=normalize(av,ev);if(JSON.stringify(stable(en))===JSON.stringify(stable(an)))continue;const expectedType=valueType(ev),actualType=valueType(av);mismatches.push({table,record,column,category:expectedType===actualType?'VALUE_MISMATCH':'TYPE_MISMATCH',expectedType,actualType,expectedFingerprint:digest({[column]:en},key),actualFingerprint:digest({[column]:an},key),status:'FAIL'});}
  }
  return{ok:mismatches.length===0,mismatchCount:mismatches.length,affectedTables:[...new Set(mismatches.map(x=>x.table))],affectedColumns:[...new Set(mismatches.map(x=>`${x.table}.${x.column}`))],mismatches};
}

module.exports={valueType,normalize,stable,digest,locatorColumns,compareRows};
