/** Rejection sampling keeps every model equally likely, including repeats. */
export function uniformIndex(count,cryptoSource=globalThis.crypto){
  if(!Number.isInteger(count)||count<1||count>0xffffffff)throw new RangeError('Invalid model count');
  if(!cryptoSource?.getRandomValues)throw new Error('Secure random numbers are unavailable.');
  const range=0x100000000,limit=Math.floor(range/count)*count,value=new Uint32Array(1);
  do{cryptoSource.getRandomValues(value);}while(value[0]>=limit);
  return value[0]%count;
}
