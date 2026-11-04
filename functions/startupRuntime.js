// No idle instances are enabled by default. A release may explicitly opt in to
// one warm instance after the owner approves that continuing cloud cost.
const getStartupRuntimeOptions=(env=process.env,{minInstances}={})=>{
 const value=env.HD_STARTUP_MIN_INSTANCES??'0';
 if(!['0','1'].includes(String(value)))throw new Error('HD_STARTUP_MIN_INSTANCES must be 0 or 1.');
 if(minInstances!==undefined&&typeof minInstances?.toCEL!=='function')throw new TypeError('Expected a Firebase parameter expression.');
 return {region:'asia-southeast1',memory:'256MiB',concurrency:4,minInstances:minInstances??Number(value)};
};
module.exports={getStartupRuntimeOptions};
