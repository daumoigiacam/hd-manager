const path=require('node:path');const {fork}=require('node:child_process');const {serialize}=require('node:v8');
const {encodeEmployeeHomePrivateValue}=require('./employeeHomePrivateValues.js');
const failure=code=>Object.assign(new Error(code),{code,statusCode:503});
// Private adapter used only by the restricted QA endpoint. Module path/version
// come from a verified local build manifest, never from an HTTP request.
function createEmployeeHomeProcessProjector({modulePath,domainVersion,validate,maxInflight=2,timeoutMs=8000,maxInputBytes=32*1024*1024}){
 if(!path.isAbsolute(modulePath)||!modulePath.endsWith('.cjs')||typeof domainVersion!=='string'||!/^[a-f0-9]{64}$/.test(domainVersion)
  ||typeof validate!=='function'||!Number.isSafeInteger(maxInflight)||maxInflight<1||maxInflight>2
  ||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>10000||!Number.isSafeInteger(maxInputBytes)||maxInputBytes<1||maxInputBytes>32*1024*1024)throw new TypeError('Verified Home process projector required.');
 let active=0;
 return async function project({scope,snapshot}){
  if(active>=maxInflight)throw failure('home_projection_busy');
  if(!scope||typeof scope.timeZone!=='string'||scope.timeZone.length>80)throw failure('invalid_home_timezone');
  try{new Intl.DateTimeFormat('en',{timeZone:scope.timeZone}).format(0)}catch{throw failure('invalid_home_timezone')}
  const wire=encodeEmployeeHomePrivateValue({scope,snapshot});if(serialize(wire).byteLength>maxInputBytes)throw failure('home_projection_input_limit');
  active++;
  return new Promise((resolve,reject)=>{
   let child,timer,settled=false,released=false;
   const release=()=>{if(!released){released=true;active--}};
   const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);if(error)reject(error);else resolve(value);child?.kill()};
   try{
    child=fork(path.join(__dirname,'employeeHomeProjectorChild.cjs'),[modulePath],{
     env:{...process.env,TZ:scope.timeZone},serialization:'advanced',stdio:['ignore','ignore','ignore','ipc'],execArgv:[],windowsHide:true});
    child.once('error',()=>finish(failure('home_projection_process_failed')));
    child.once('close',()=>{release();if(!settled)finish(failure('home_projection_process_closed'))});
    child.once('message',message=>{
     try{if(message?.ok!==true)throw failure('home_projection_failed');
      const model=validate(message.model);if(serialize(model).byteLength>65536)throw failure('home_projection_output_limit');
      finish(null,{kind:'hd-employee-home-model-v1',domainVersion,model});
     }catch{finish(failure('invalid_home_projection'))}
    });
    timer=setTimeout(()=>finish(failure('home_projection_timeout')),timeoutMs);
    child.send(wire,error=>{if(error)finish(failure('home_projection_send_failed'))});
   }catch{release();finish(failure('home_projection_process_failed'))}
  });
 };
}
module.exports={createEmployeeHomeProcessProjector};
